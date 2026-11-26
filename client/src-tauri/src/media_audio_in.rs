use crate::media_audio_out::AudioDeviceInfo;
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{Sample, SampleFormat};
use livekit::webrtc::audio_frame::AudioFrame;
use livekit::webrtc::audio_source::native::NativeAudioSource;
use nnnoiseless::DenoiseState;
use serde::{Deserialize, Serialize};
use std::borrow::Cow;
use std::f32::consts::PI;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::thread::JoinHandle;

pub const TARGET_SAMPLE_RATE: u32 = 48_000;
pub const FRAME_SAMPLES: usize = DenoiseState::FRAME_SIZE; // 480 samples = 10ms @ 48kHz
const FRAME_DURATION_MS: u64 = 10;
const VAD_EMIT_INTERVAL_FRAMES: u32 = 3; // ~30ms UI meter cadence

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioInputConfig {
    /// Processing mode: "webrtc" | "rnnoise" | "rnnoise_silero" | "none"
    pub mode: String,
    /// RNNoise aggressiveness: "light" | "balanced" | "aggressive"
    pub rnnoise_level: String,
    pub vad_auto_sensitivity: bool,
    /// Manual VAD sensitivity in [0.05, 0.95] (maps to -95 dB .. -5 dB)
    pub vad_sensitivity: f32,
    /// Hangover duration in milliseconds after speech ends
    pub vad_hangover: u64,
    pub echo_cancellation: bool,
    pub noise_suppression: bool,
    pub auto_gain_control: bool,
    /// Input gain percentage in [0, 200] (0..100 -> 0.0..1.0, 200 -> 2.0)
    pub volume: f32,
}

impl Default for AudioInputConfig {
    fn default() -> Self {
        Self {
            mode: "rnnoise_silero".to_string(),
            rnnoise_level: "balanced".to_string(),
            vad_auto_sensitivity: true,
            vad_sensitivity: 0.45,
            vad_hangover: 250,
            echo_cancellation: true,
            noise_suppression: true,
            auto_gain_control: true,
            volume: 100.0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct VadStatePayload {
    pub is_speaking: bool,
    pub volume: f32,
    pub speech_probability: f32,
    pub gate_open: bool,
}

/// Normalize frontend input volume (0..100 or 0..200) into a linear gain in [0.0, 2.0].
#[inline]
pub fn normalize_input_volume(volume: f32) -> f32 {
    if !volume.is_finite() {
        return 1.0;
    }
    (volume / 100.0).clamp(0.0, 2.0)
}

/// 2nd-order Butterworth HighPass biquad filter (Direct Form II Transposed).
#[derive(Debug, Clone)]
pub struct BiquadHighPass {
    b0: f32,
    b1: f32,
    b2: f32,
    a1: f32,
    a2: f32,
    z1: f32,
    z2: f32,
}

impl BiquadHighPass {
    pub fn new(cutoff_hz: f32, sample_rate: f32, q: f32) -> Self {
        let w0 = 2.0 * PI * cutoff_hz / sample_rate;
        let cos_w0 = w0.cos();
        let sin_w0 = w0.sin();
        let alpha = sin_w0 / (2.0 * q);
        let a0 = 1.0 + alpha;

        Self {
            b0: ((1.0 + cos_w0) * 0.5) / a0,
            b1: (-(1.0 + cos_w0)) / a0,
            b2: ((1.0 + cos_w0) * 0.5) / a0,
            a1: (-2.0 * cos_w0) / a0,
            a2: (1.0 - alpha) / a0,
            z1: 0.0,
            z2: 0.0,
        }
    }

    #[inline]
    pub fn process_sample(&mut self, x: f32) -> f32 {
        let y = self.b0 * x + self.z1;
        self.z1 = self.b1 * x - self.a1 * y + self.z2;
        self.z2 = self.b2 * x - self.a2 * y;
        y
    }

    pub fn process_in_place(&mut self, samples: &mut [f32]) {
        for s in samples.iter_mut() {
            *s = self.process_sample(*s);
        }
    }

    pub fn reset(&mut self) {
        self.z1 = 0.0;
        self.z2 = 0.0;
    }
}

/// Linear mono resampler from `src_rate` to `dst_rate`.
pub struct LinearResampler {
    src_rate: u32,
    dst_rate: u32,
    frac_pos: f64,
    prev_sample: f32,
    has_prev: bool,
}

impl LinearResampler {
    pub fn new(src_rate: u32, dst_rate: u32) -> Self {
        Self {
            src_rate: src_rate.max(1),
            dst_rate: dst_rate.max(1),
            frac_pos: 0.0,
            prev_sample: 0.0,
            has_prev: false,
        }
    }

    pub fn process(&mut self, input: &[f32], output: &mut Vec<f32>) {
        if input.is_empty() {
            return;
        }
        if self.src_rate == self.dst_rate {
            output.extend_from_slice(input);
            return;
        }

        let step = self.src_rate as f64 / self.dst_rate as f64;
        if !self.has_prev {
            self.prev_sample = input[0];
            self.has_prev = true;
        }

        let total = input.len() as f64;
        while self.frac_pos < total {
            let idx = self.frac_pos.floor() as isize;
            let frac = (self.frac_pos - idx as f64) as f32;
            let s0 = if idx <= 0 {
                self.prev_sample
            } else {
                input[(idx - 1) as usize]
            };
            let s1 = input[idx.clamp(0, (input.len() - 1) as isize) as usize];
            output.push(s0 + (s1 - s0) * frac);
            self.frac_pos += step;
        }

        self.frac_pos -= total;
        self.prev_sample = *input.last().unwrap_or(&0.0);
    }
}

/// Stateful 48kHz mono DSP pipeline matching `audioProcessor.ts`:
/// HighPass (85Hz, Q=0.707) -> RNNoise (`nnnoiseless`) -> VAD Gate (hysteresis + hangover) -> Gain -> i16.
pub struct AudioDspPipeline {
    highpass: BiquadHighPass,
    denoise: Box<DenoiseState<'static>>,
    noise_floor_db: f32,
    is_gate_open: bool,
    ms_since_speech: u64,
    current_gate_gain: f32,
    open_alpha: f32,
    close_alpha: f32,
    rnnoise_in: [f32; FRAME_SAMPLES],
    rnnoise_out: [f32; FRAME_SAMPLES],
}

impl AudioDspPipeline {
    pub fn new() -> Self {
        let open_alpha = 1.0 - (-1.0 / (TARGET_SAMPLE_RATE as f32 * 0.008)).exp();
        let close_alpha = 1.0 - (-1.0 / (TARGET_SAMPLE_RATE as f32 * 0.035)).exp();
        Self {
            highpass: BiquadHighPass::new(85.0, TARGET_SAMPLE_RATE as f32, 0.707),
            denoise: DenoiseState::new(),
            noise_floor_db: -65.0,
            is_gate_open: false,
            ms_since_speech: 0,
            current_gate_gain: 0.0,
            open_alpha,
            close_alpha,
            rnnoise_in: [0.0; FRAME_SAMPLES],
            rnnoise_out: [0.0; FRAME_SAMPLES],
        }
    }

    /// Process exactly 480 mono 48kHz samples into `out_i16` and return the current `VadStatePayload`.
    pub fn process_frame(
        &mut self,
        input: &[f32; FRAME_SAMPLES],
        config: &AudioInputConfig,
        volume_override: Option<f32>,
        is_muted: bool,
        out_i16: &mut [i16; FRAME_SAMPLES],
    ) -> VadStatePayload {
        if is_muted {
            out_i16.fill(0);
            self.is_gate_open = false;
            self.current_gate_gain = 0.0;
            return VadStatePayload {
                is_speaking: false,
                volume: 0.0,
                speech_probability: 0.0,
                gate_open: false,
            };
        }

        let mut work = *input;
        let use_rnnoise = config.mode == "rnnoise" || config.mode == "rnnoise_silero";
        let mut rnnoise_vad = 0.0_f32;

        if use_rnnoise {
            self.highpass.process_in_place(&mut work);

            if config.noise_suppression {
                for i in 0..FRAME_SAMPLES {
                    self.rnnoise_in[i] = work[i] * 32768.0;
                }
                rnnoise_vad = self
                    .denoise
                    .process_frame(&mut self.rnnoise_out, &self.rnnoise_in);

                let wet = match config.rnnoise_level.as_str() {
                    "light" => 0.75,
                    _ => 1.0,
                };
                let dry = 1.0 - wet;
                for i in 0..FRAME_SAMPLES {
                    let denoised = self.rnnoise_out[i] / 32768.0;
                    work[i] = denoised * wet + work[i] * dry;
                }
            }
        }

        let mut sum_sq = 0.0_f32;
        for &s in &work {
            sum_sq += s * s;
        }
        let rms = (sum_sq / FRAME_SAMPLES as f32).sqrt();
        let rms_db = 20.0 * rms.max(1e-5).log10();
        let meter_pct = (rms_db + 100.0).clamp(0.0, 100.0);

        let vol_gain = normalize_input_volume(volume_override.unwrap_or(config.volume));

        if config.mode != "rnnoise_silero" {
            let is_speaking = rms_db > -52.0;
            self.is_gate_open = rms_db > -75.0;
            self.current_gate_gain = 1.0;

            for i in 0..FRAME_SAMPLES {
                let scaled = (work[i] * vol_gain).clamp(-1.0, 1.0);
                out_i16[i] = (scaled * 32767.0) as i16;
            }

            return VadStatePayload {
                is_speaking,
                volume: meter_pct,
                speech_probability: if is_speaking { 0.9 } else { 0.05 },
                gate_open: true,
            };
        }

        // Adaptive stationary noise floor tracking matching `audioProcessor.ts`
        if rms_db < self.noise_floor_db + 6.0 {
            self.noise_floor_db = self.noise_floor_db * 0.94 + rms_db * 0.06;
        } else if rms_db < self.noise_floor_db {
            self.noise_floor_db = self.noise_floor_db * 0.8 + rms_db * 0.2;
        }

        let level_offset_db = match config.rnnoise_level.as_str() {
            "aggressive" => 2.0,
            "light" => -2.0,
            _ => 0.0,
        };

        let open_threshold_db = if config.vad_auto_sensitivity {
            (self.noise_floor_db + 11.0 + level_offset_db).clamp(-52.0, -26.0)
        } else {
            config.vad_sensitivity.clamp(0.05, 0.95) * 100.0 - 100.0
        };
        let close_threshold_db = open_threshold_db - 4.0;

        let detected_speech = if self.is_gate_open {
            rms_db > close_threshold_db
        } else {
            rms_db > open_threshold_db
        };

        if detected_speech {
            self.ms_since_speech = 0;
            self.is_gate_open = true;
        } else if self.is_gate_open {
            self.ms_since_speech = self.ms_since_speech.saturating_add(FRAME_DURATION_MS);
            if self.ms_since_speech > config.vad_hangover {
                self.is_gate_open = false;
            }
        }

        let target_gate_gain = if self.is_gate_open { 1.0 } else { 0.0 };
        let alpha = if self.is_gate_open {
            self.open_alpha
        } else {
            self.close_alpha
        };

        for i in 0..FRAME_SAMPLES {
            self.current_gate_gain += (target_gate_gain - self.current_gate_gain) * alpha;
            let scaled = (work[i] * self.current_gate_gain * vol_gain).clamp(-1.0, 1.0);
            out_i16[i] = (scaled * 32767.0) as i16;
        }

        let db_prob = if detected_speech {
            (0.55 + (rms_db - open_threshold_db) * 0.03).min(0.99)
        } else {
            0.05
        };
        let speech_probability = if use_rnnoise && config.noise_suppression {
            (db_prob.max(rnnoise_vad * if detected_speech { 1.0 } else { 0.4 })).clamp(0.0, 1.0)
        } else {
            db_prob.clamp(0.0, 1.0)
        };

        VadStatePayload {
            is_speaking: detected_speech,
            volume: meter_pct,
            speech_probability,
            gate_open: self.is_gate_open,
        }
    }
}

impl Default for AudioDspPipeline {
    fn default() -> Self {
        Self::new()
    }
}

/// Lists available audio input devices via `cpal::default_host()`.
pub fn list_input_devices() -> Vec<AudioDeviceInfo> {
    let host = cpal::default_host();
    let Ok(devices) = host.input_devices() else {
        return Vec::new();
    };
    devices
        .filter_map(|dev| {
            let name = dev.name().ok()?;
            Some(AudioDeviceInfo {
                device_id: name.clone(),
                label: name,
                kind: "audioinput".to_string(),
            })
        })
        .collect()
}

pub struct AudioInputController {
    stop_flag: Arc<AtomicBool>,
    is_muted: Arc<AtomicBool>,
    volume_bits: Arc<AtomicU32>,
    config: Arc<Mutex<AudioInputConfig>>,
    worker_thread: Mutex<Option<JoinHandle<()>>>,
}

impl AudioInputController {
    pub fn start<F>(
        source: NativeAudioSource,
        device_id: Option<String>,
        config: AudioInputConfig,
        on_vad: F,
    ) -> Result<Self, String>
    where
        F: Fn(VadStatePayload) + Send + Sync + 'static,
    {
        let host = cpal::default_host();
        let device = select_input_device(&host, device_id.as_deref())?;
        let supported_cfg = device
            .default_input_config()
            .map_err(|e| format!("Failed to read default input config: {e}"))?;

        let src_rate = supported_cfg.sample_rate().0;
        let src_channels = supported_cfg.channels().max(1) as usize;
        let sample_format = supported_cfg.sample_format();
        let stream_config: cpal::StreamConfig = supported_cfg.into();

        let stop_flag = Arc::new(AtomicBool::new(false));
        let is_muted = Arc::new(AtomicBool::new(false));
        let volume_bits = Arc::new(AtomicU32::new(config.volume.to_bits()));
        let shared_config = Arc::new(Mutex::new(config));
        let rt_handle = tokio::runtime::Handle::try_current().ok();

        let (ready_tx, ready_rx) = mpsc::sync_channel::<Result<(), String>>(1);
        let (audio_tx, audio_rx) = mpsc::sync_channel::<Vec<f32>>(64);

        let w_stop = Arc::clone(&stop_flag);
        let w_muted = Arc::clone(&is_muted);
        let w_vol = Arc::clone(&volume_bits);
        let w_cfg = Arc::clone(&shared_config);

        let worker_thread = std::thread::Builder::new()
            .name("zerovc-audio-in".to_string())
            .spawn(move || {
                let err_cb = |err| {
                    eprintln!("[AudioInput] cpal stream error: {err}");
                };

                let stream_res = match sample_format {
                    SampleFormat::F32 => {
                        let tx = audio_tx.clone();
                        device.build_input_stream(
                            &stream_config,
                            move |data: &[f32], _| {
                                push_interleaved_to_mono(data, src_channels, &tx);
                            },
                            err_cb,
                            None,
                        )
                    }
                    SampleFormat::I16 => {
                        let tx = audio_tx.clone();
                        device.build_input_stream(
                            &stream_config,
                            move |data: &[i16], _| {
                                push_interleaved_to_mono(data, src_channels, &tx);
                            },
                            err_cb,
                            None,
                        )
                    }
                    SampleFormat::U16 => {
                        let tx = audio_tx.clone();
                        device.build_input_stream(
                            &stream_config,
                            move |data: &[u16], _| {
                                push_interleaved_to_mono(data, src_channels, &tx);
                            },
                            err_cb,
                            None,
                        )
                    }
                    other => {
                        let _ = ready_tx.send(Err(format!(
                            "Unsupported input sample format: {other:?}"
                        )));
                        return;
                    }
                };

                let stream = match stream_res {
                    Ok(s) => s,
                    Err(e) => {
                        let _ = ready_tx.send(Err(format!("Failed to build input stream: {e}")));
                        return;
                    }
                };

                if let Err(e) = stream.play() {
                    let _ = ready_tx.send(Err(format!("Failed to start input stream: {e}")));
                    return;
                }
                let _ = ready_tx.send(Ok(()));

                let fallback_rt = if rt_handle.is_none() {
                    tokio::runtime::Builder::new_current_thread()
                        .enable_all()
                        .build()
                        .ok()
                } else {
                    None
                };

                let mut resampler = LinearResampler::new(src_rate, TARGET_SAMPLE_RATE);
                let mut resampled_buf = Vec::with_capacity(FRAME_SAMPLES * 4);
                let mut pipeline = AudioDspPipeline::new();
                let mut frame_in = [0.0_f32; FRAME_SAMPLES];
                let mut frame_out = [0_i16; FRAME_SAMPLES];
                let mut vad_counter: u32 = 0;

                while !w_stop.load(Ordering::Relaxed) {
                    match audio_rx.recv_timeout(std::time::Duration::from_millis(25)) {
                        Ok(mono_chunk) => {
                            resampler.process(&mono_chunk, &mut resampled_buf);
                            while resampled_buf.len() >= FRAME_SAMPLES {
                                if w_stop.load(Ordering::Relaxed) {
                                    break;
                                }
                                frame_in.copy_from_slice(&resampled_buf[..FRAME_SAMPLES]);
                                resampled_buf.drain(..FRAME_SAMPLES);

                                let cfg = w_cfg
                                    .lock()
                                    .map(|g| g.clone())
                                    .unwrap_or_default();
                                let muted = w_muted.load(Ordering::Relaxed);
                                let vol = f32::from_bits(w_vol.load(Ordering::Relaxed));

                                let vad = pipeline.process_frame(
                                    &frame_in,
                                    &cfg,
                                    Some(vol),
                                    muted,
                                    &mut frame_out,
                                );

                                vad_counter = vad_counter.wrapping_add(1);
                                if vad_counter % VAD_EMIT_INTERVAL_FRAMES == 0 {
                                    on_vad(vad);
                                }

                                if !muted {
                                    let frame = AudioFrame {
                                        data: Cow::Borrowed(&frame_out),
                                        sample_rate: TARGET_SAMPLE_RATE,
                                        num_channels: 1,
                                        samples_per_channel: FRAME_SAMPLES as u32,
                                    };
                                    let send_res = if let Some(ref handle) = rt_handle {
                                        handle.block_on(source.capture_frame(&frame))
                                    } else if let Some(ref rt) = fallback_rt {
                                        rt.block_on(source.capture_frame(&frame))
                                    } else {
                                        Ok(())
                                    };
                                    if send_res.is_err() {
                                        break;
                                    }
                                }
                            }
                        }
                        Err(mpsc::RecvTimeoutError::Timeout) => continue,
                        Err(mpsc::RecvTimeoutError::Disconnected) => break,
                    }
                }
                drop(stream);
            })
            .map_err(|e| format!("Failed to spawn audio input thread: {e}"))?;

        match ready_rx.recv() {
            Ok(Ok(())) => Ok(Self {
                stop_flag,
                is_muted,
                volume_bits,
                config: shared_config,
                worker_thread: Mutex::new(Some(worker_thread)),
            }),
            Ok(Err(e)) => {
                stop_flag.store(true, Ordering::Relaxed);
                let _ = worker_thread.join();
                Err(e)
            }
            Err(_) => {
                stop_flag.store(true, Ordering::Relaxed);
                let _ = worker_thread.join();
                Err("Audio input thread exited before initialization".to_string())
            }
        }
    }

    pub fn stop(&self) {
        self.stop_flag.store(true, Ordering::Relaxed);
        if let Ok(mut guard) = self.worker_thread.lock() {
            if let Some(handle) = guard.take() {
                let _ = handle.join();
            }
        }
    }

    pub fn set_muted(&self, muted: bool) {
        self.is_muted.store(muted, Ordering::Relaxed);
    }

    pub fn set_input_volume(&self, volume: f32) {
        self.volume_bits.store(volume.to_bits(), Ordering::Relaxed);
        if let Ok(mut guard) = self.config.lock() {
            guard.volume = volume;
        }
    }

    pub fn update_config(&self, config: AudioInputConfig) {
        self.volume_bits
            .store(config.volume.to_bits(), Ordering::Relaxed);
        if let Ok(mut guard) = self.config.lock() {
            *guard = config;
        }
    }
}

impl Drop for AudioInputController {
    fn drop(&mut self) {
        self.stop();
    }
}

fn select_input_device(
    host: &cpal::Host,
    device_id: Option<&str>,
) -> Result<cpal::Device, String> {
    if let Some(id) = device_id.map(str::trim).filter(|s| !s.is_empty() && *s != "default") {
        if let Ok(devices) = host.input_devices() {
            for dev in devices {
                if let Ok(name) = dev.name() {
                    if name == id {
                        return Ok(dev);
                    }
                }
            }
        }
        eprintln!("[AudioInput] Requested device '{id}' not found; falling back to default");
    }
    host.default_input_device()
        .ok_or_else(|| "No default audio input device available".to_string())
}

fn push_interleaved_to_mono<T>(
    data: &[T],
    channels: usize,
    tx: &mpsc::SyncSender<Vec<f32>>,
) where
    T: Sample + Copy,
    f32: cpal::FromSample<T>,
{
    if data.is_empty() {
        return;
    }
    let ch = channels.max(1);
    let mut mono = Vec::with_capacity(data.len() / ch + 1);
    if ch == 1 {
        for &s in data {
            mono.push(s.to_sample::<f32>());
        }
    } else {
        for frame in data.chunks_exact(ch) {
            let mut sum = 0.0_f32;
            for &s in frame {
                sum += s.to_sample::<f32>();
            }
            mono.push(sum / ch as f32);
        }
    }
    let _ = tx.try_send(mono);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rms(samples: &[f32]) -> f32 {
        let sum: f32 = samples.iter().map(|s| s * s).sum();
        (sum / samples.len().max(1) as f32).sqrt()
    }

    #[test]
    fn highpass_85hz_attenuates_dc_and_passes_voice_band() {
        let mut hp_low = BiquadHighPass::new(85.0, 48_000.0, 0.707);
        let mut low_buf = vec![0.0_f32; 4800];
        for (i, s) in low_buf.iter_mut().enumerate() {
            // 20Hz sub-rumble
            *s = (2.0 * PI * 20.0 * i as f32 / 48_000.0).sin();
        }
        hp_low.process_in_place(&mut low_buf);
        // After transient settles (last 2400 samples), 20Hz should be heavily attenuated (>18dB)
        let low_rms = rms(&low_buf[2400..]);
        assert!(
            low_rms < 0.1,
            "Expected 20Hz rumble to be attenuated below 0.1 RMS, got {low_rms}"
        );

        let mut hp_voice = BiquadHighPass::new(85.0, 48_000.0, 0.707);
        let mut voice_buf = vec![0.0_f32; 4800];
        for (i, s) in voice_buf.iter_mut().enumerate() {
            // 1000Hz voice tone
            *s = (2.0 * PI * 1000.0 * i as f32 / 48_000.0).sin();
        }
        let in_rms = rms(&voice_buf[2400..]);
        hp_voice.process_in_place(&mut voice_buf);
        let out_rms = rms(&voice_buf[2400..]);
        assert!(
            (out_rms / in_rms) > 0.95,
            "Expected 1kHz tone to pass cleanly, ratio={}",
            out_rms / in_rms
        );
    }

    #[test]
    fn vad_gate_opens_on_speech_and_respects_hangover() {
        let mut dsp = AudioDspPipeline::new();
        let cfg = AudioInputConfig {
            mode: "rnnoise_silero".to_string(),
            noise_suppression: false, // isolate VAD gate behavior cleanly
            vad_auto_sensitivity: false,
            vad_sensitivity: 0.6, // -40 dB open threshold, -44 dB close threshold
            vad_hangover: 50,     // 50ms = 5 frames of 10ms
            volume: 100.0,
            ..Default::default()
        };

        let mut speech_frame = [0.0_f32; FRAME_SAMPLES];
        for (i, s) in speech_frame.iter_mut().enumerate() {
            *s = 0.25 * (2.0 * PI * 440.0 * i as f32 / 48_000.0).sin();
        }
        let silence_frame = [0.0_f32; FRAME_SAMPLES];
        let mut out = [0_i16; FRAME_SAMPLES];

        // 1. Silence keeps gate closed
        let st = dsp.process_frame(&silence_frame, &cfg, None, false, &mut out);
        assert!(!st.gate_open);
        assert!(!st.is_speaking);

        // 2. Loud frame opens gate
        let st = dsp.process_frame(&speech_frame, &cfg, None, false, &mut out);
        assert!(st.gate_open);
        assert!(st.is_speaking);

        // 3. After speech ends (and 1 frame of highpass ring-down), gate stays open for 50ms hangover
        // and then closes once hangover expires.
        let mut closed_at_frame = None;
        for frame_idx in 1..=10 {
            let st = dsp.process_frame(&silence_frame, &cfg, None, false, &mut out);
            if !st.gate_open {
                closed_at_frame = Some(frame_idx);
                break;
            }
        }
        assert!(
            matches!(closed_at_frame, Some(idx) if idx >= 6 && idx <= 8),
            "Expected gate to close right after 50ms hangover, closed_at_frame={closed_at_frame:?}"
        );
    }

    #[test]
    fn input_volume_gain_and_mute_work_as_expected() {
        let mut dsp = AudioDspPipeline::new();
        let cfg = AudioInputConfig {
            mode: "none".to_string(),
            noise_suppression: false,
            volume: 50.0, // 0.5x
            ..Default::default()
        };

        let input = [0.4_f32; FRAME_SAMPLES];
        let mut out_half = [0_i16; FRAME_SAMPLES];
        dsp.process_frame(&input, &cfg, None, false, &mut out_half);
        // 0.4 * 0.5 * 32767 = 6553
        assert!((out_half[10] - 6553).abs() <= 2, "got {}", out_half[10]);

        let mut out_double = [0_i16; FRAME_SAMPLES];
        dsp.process_frame(&input, &cfg, Some(200.0), false, &mut out_double);
        // 0.4 * 2.0 * 32767 = 26213
        assert!(
            (out_double[10] - 26213).abs() <= 2,
            "got {}",
            out_double[10]
        );

        let mut out_muted = [123_i16; FRAME_SAMPLES];
        let st = dsp.process_frame(&input, &cfg, Some(100.0), true, &mut out_muted);
        assert!(!st.is_speaking);
        assert!(!st.gate_open);
        assert!(out_muted.iter().all(|&s| s == 0));
    }
}
