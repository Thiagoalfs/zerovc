use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{FromSample, Sample, SampleFormat};
use futures_util::StreamExt;
use livekit::webrtc::audio_stream::native::NativeAudioStream;
use livekit::webrtc::audio_track::RtcAudioTrack;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet, VecDeque};
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::thread::JoinHandle;

const STREAM_SAMPLE_RATE: u32 = 48_000;
const STREAM_CHANNELS: usize = 2;
const MAX_BUFFER_MS: usize = 150;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AudioDeviceInfo {
    pub device_id: String,
    pub label: String,
    /// "audioinput" | "audiooutput" | "videoinput"
    pub kind: String,
}

struct TrackEntry {
    owner_identity: String,
    is_screen_audio: bool,
    /// Pre-resolved per-track gain (`f32::to_bits()`) updated outside the cpal callback.
    track_gain_bits: AtomicU32,
    buffer: VecDeque<f32>,
    stop_flag: Arc<AtomicBool>,
}

struct MixerInner {
    is_deafened: AtomicBool,
    /// Stored as `f32::to_bits()` in [0.0, 2.0], default 1.0
    master_volume_bits: AtomicU32,
    user_volumes: Mutex<HashMap<String, f32>>,
    stream_volumes: Mutex<HashMap<String, f32>>,
    watched_identities: Mutex<HashSet<String>>,
    tracks: Mutex<HashMap<String, TrackEntry>>,
}

impl MixerInner {
    fn new() -> Self {
        Self {
            is_deafened: AtomicBool::new(false),
            master_volume_bits: AtomicU32::new(1.0_f32.to_bits()),
            user_volumes: Mutex::new(HashMap::new()),
            stream_volumes: Mutex::new(HashMap::new()),
            watched_identities: Mutex::new(HashSet::new()),
            tracks: Mutex::new(HashMap::new()),
        }
    }

    fn resolve_track_gain(
        is_screen_audio: bool,
        owner_identity: &str,
        user_volumes: &HashMap<String, f32>,
        stream_volumes: &HashMap<String, f32>,
        watched: &HashSet<String>,
    ) -> f32 {
        if is_screen_audio {
            if !watched.contains(owner_identity) {
                0.0
            } else {
                stream_volumes.get(owner_identity).copied().unwrap_or(1.0).max(0.0)
            }
        } else {
            user_volumes.get(owner_identity).copied().unwrap_or(1.0).max(0.0)
        }
    }

    fn refresh_track_gains(&self) {
        let Ok(user_volumes) = self.user_volumes.lock() else {
            return;
        };
        let Ok(stream_volumes) = self.stream_volumes.lock() else {
            return;
        };
        let Ok(watched) = self.watched_identities.lock() else {
            return;
        };
        let Ok(tracks) = self.tracks.lock() else {
            return;
        };
        for entry in tracks.values() {
            let gain = Self::resolve_track_gain(
                entry.is_screen_audio,
                &entry.owner_identity,
                &user_volumes,
                &stream_volumes,
                &watched,
            );
            entry
                .track_gain_bits
                .store(gain.to_bits(), Ordering::Relaxed);
        }
    }

    fn set_user_volume(&self, identity: String, vol: f32) {
        let clamped = if vol.is_finite() {
            vol.clamp(0.0, 2.0)
        } else {
            1.0
        };
        if let Ok(mut guard) = self.user_volumes.lock() {
            guard.insert(identity, clamped);
        }
        self.refresh_track_gains();
    }

    fn set_stream_volume(&self, owner_identity: String, vol: f32) {
        let clamped = if vol.is_finite() {
            vol.clamp(0.0, 2.0)
        } else {
            1.0
        };
        if let Ok(mut guard) = self.stream_volumes.lock() {
            guard.insert(owner_identity, clamped);
        }
        self.refresh_track_gains();
    }

    fn set_watched_identities(&self, watched: HashSet<String>) {
        if let Ok(mut guard) = self.watched_identities.lock() {
            *guard = watched;
        }
        self.refresh_track_gains();
    }

    fn mix_into_stereo_interleaved(&self, out_stereo: &mut [f32]) {
        out_stereo.fill(0.0);

        let is_deafened = self.is_deafened.load(Ordering::Relaxed);
        let master_vol = f32::from_bits(self.master_volume_bits.load(Ordering::Relaxed));

        // Non-blocking try_lock with zero allocations inside the real-time cpal audio callback
        if let Ok(mut tracks) = self.tracks.try_lock() {
            for entry in tracks.values_mut() {
                let gain = if is_deafened {
                    0.0
                } else {
                    let track_gain = f32::from_bits(entry.track_gain_bits.load(Ordering::Relaxed));
                    (track_gain * master_vol).max(0.0)
                };

                let available = entry.buffer.len().min(out_stereo.len());
                if gain <= 0.0 {
                    // Drain buffer without mixing so latency stays synced if unmuted/watched later
                    entry.buffer.drain(..available);
                    continue;
                }

                for (dst, sample) in out_stereo[..available]
                    .iter_mut()
                    .zip(entry.buffer.drain(..available))
                {
                    *dst += sample * gain;
                }
            }
        }

        // Soft clipping via tanh to prevent harsh digital distortion when summing multiple speakers
        for s in out_stereo.iter_mut() {
            *s = s.tanh();
        }
    }
}

/// Lists available audio output devices via `cpal::default_host()`.
pub fn list_output_devices() -> Vec<AudioDeviceInfo> {
    let host = cpal::default_host();
    let Ok(devices) = host.output_devices() else {
        return Vec::new();
    };
    devices
        .filter_map(|dev| {
            let name = dev.name().ok()?;
            Some(AudioDeviceInfo {
                device_id: name.clone(),
                label: name,
                kind: "audiooutput".to_string(),
            })
        })
        .collect()
}

pub struct AudioOutputMixer {
    inner: Arc<MixerInner>,
    max_buffer_samples: usize,
    output_sample_rate: u32,
    stop_flag: Arc<AtomicBool>,
    rt_handle: Option<tokio::runtime::Handle>,
    worker_thread: Mutex<Option<JoinHandle<()>>>,
}

impl AudioOutputMixer {
    pub fn start(device_id: Option<String>) -> Result<Self, String> {
        let host = cpal::default_host();
        let device = select_output_device(&host, device_id.as_deref())?;
        let supported_cfg = device
            .default_output_config()
            .map_err(|e| format!("Failed to read default output config: {e}"))?;

        let output_sample_rate = supported_cfg.sample_rate().0;
        let out_channels = supported_cfg.channels().max(1) as usize;
        let sample_format = supported_cfg.sample_format();
        let stream_config: cpal::StreamConfig = supported_cfg.into();

        let max_buffer_samples =
            ((output_sample_rate as usize * STREAM_CHANNELS * MAX_BUFFER_MS) / 1000).max(960);

        let inner = Arc::new(MixerInner::new());
        let stop_flag = Arc::new(AtomicBool::new(false));
        let rt_handle = tokio::runtime::Handle::try_current().ok();

        let (ready_tx, ready_rx) = mpsc::sync_channel::<Result<(), String>>(1);
        let t_inner = Arc::clone(&inner);
        let t_stop = Arc::clone(&stop_flag);

        let worker_thread = std::thread::Builder::new()
            .name("zerovc-audio-out".to_string())
            .spawn(move || {
                let err_cb = |err| {
                    eprintln!("[AudioOutput] cpal stream error: {err}");
                };

                let mut scratch_stereo = Vec::<f32>::with_capacity(4096);

                let stream_res = match sample_format {
                    SampleFormat::F32 => {
                        let m = Arc::clone(&t_inner);
                        device.build_output_stream(
                            &stream_config,
                            move |data: &mut [f32], _| {
                                write_mixed_output(data, out_channels, &m, &mut scratch_stereo);
                            },
                            err_cb,
                            None,
                        )
                    }
                    SampleFormat::I16 => {
                        let m = Arc::clone(&t_inner);
                        device.build_output_stream(
                            &stream_config,
                            move |data: &mut [i16], _| {
                                write_mixed_output(data, out_channels, &m, &mut scratch_stereo);
                            },
                            err_cb,
                            None,
                        )
                    }
                    SampleFormat::U16 => {
                        let m = Arc::clone(&t_inner);
                        device.build_output_stream(
                            &stream_config,
                            move |data: &mut [u16], _| {
                                write_mixed_output(data, out_channels, &m, &mut scratch_stereo);
                            },
                            err_cb,
                            None,
                        )
                    }
                    other => {
                        let _ = ready_tx.send(Err(format!(
                            "Unsupported output sample format: {other:?}"
                        )));
                        return;
                    }
                };

                let stream = match stream_res {
                    Ok(s) => s,
                    Err(e) => {
                        let _ = ready_tx.send(Err(format!("Failed to build output stream: {e}")));
                        return;
                    }
                };

                if let Err(e) = stream.play() {
                    let _ = ready_tx.send(Err(format!("Failed to start output stream: {e}")));
                    return;
                }
                let _ = ready_tx.send(Ok(()));

                while !t_stop.load(Ordering::Relaxed) {
                    std::thread::sleep(std::time::Duration::from_millis(50));
                }
                drop(stream);
            })
            .map_err(|e| format!("Failed to spawn audio output thread: {e}"))?;

        match ready_rx.recv() {
            Ok(Ok(())) => Ok(Self {
                inner,
                max_buffer_samples,
                output_sample_rate,
                stop_flag,
                rt_handle,
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
                Err("Audio output thread exited before initialization".to_string())
            }
        }
    }

    pub fn stop(&self) {
        self.stop_flag.store(true, Ordering::Relaxed);
        if let Ok(mut tracks) = self.inner.tracks.lock() {
            for (_, entry) in tracks.drain() {
                entry.stop_flag.store(true, Ordering::Relaxed);
            }
        }
        if let Ok(mut guard) = self.worker_thread.lock() {
            if let Some(handle) = guard.take() {
                let _ = handle.join();
            }
        }
    }

    pub fn add_track(
        &self,
        sid: String,
        owner_identity: String,
        is_screen_audio: bool,
        rtc_track: RtcAudioTrack,
    ) {
        let initial_gain = {
            let u = self.inner.user_volumes.lock().ok();
            let s = self.inner.stream_volumes.lock().ok();
            let w = self.inner.watched_identities.lock().ok();
            match (u.as_deref(), s.as_deref(), w.as_deref()) {
                (Some(uv), Some(sv), Some(wi)) => {
                    MixerInner::resolve_track_gain(is_screen_audio, &owner_identity, uv, sv, wi)
                }
                _ => if is_screen_audio { 0.0 } else { 1.0 },
            }
        };

        let track_stop = Arc::new(AtomicBool::new(false));
        if let Ok(mut tracks) = self.inner.tracks.lock() {
            if let Some(prev) = tracks.remove(&sid) {
                prev.stop_flag.store(true, Ordering::Relaxed);
            }
            tracks.insert(
                sid.clone(),
                TrackEntry {
                    owner_identity,
                    is_screen_audio,
                    track_gain_bits: AtomicU32::new(initial_gain.to_bits()),
                    buffer: VecDeque::with_capacity(self.max_buffer_samples),
                    stop_flag: Arc::clone(&track_stop),
                },
            );
        }

        let inner = Arc::clone(&self.inner);
        let global_stop = Arc::clone(&self.stop_flag);
        let max_buf = self.max_buffer_samples;
        let out_rate = self.output_sample_rate;

        let fut = async move {
            let mut stream =
                NativeAudioStream::new(rtc_track, STREAM_SAMPLE_RATE as i32, STREAM_CHANNELS as i32);
            let mut resampled = Vec::<f32>::with_capacity(2048);

            while let Some(frame) = stream.next().await {
                if global_stop.load(Ordering::Relaxed) || track_stop.load(Ordering::Relaxed) {
                    break;
                }

                resampled.clear();
                resample_stereo_i16_to_f32(&frame.data, STREAM_SAMPLE_RATE, out_rate, &mut resampled);

                if let Ok(mut tracks) = inner.tracks.lock() {
                    let Some(entry) = tracks.get_mut(&sid) else {
                        break;
                    };
                    if entry.stop_flag.load(Ordering::Relaxed) {
                        break;
                    }
                    entry.buffer.extend(resampled.iter().copied());
                    if entry.buffer.len() > max_buf {
                        let excess = entry.buffer.len() - max_buf;
                        entry.buffer.drain(..excess);
                    }
                }
            }
            stream.close();
        };

        if let Some(ref handle) = self.rt_handle {
            handle.spawn(fut);
        } else if let Ok(handle) = tokio::runtime::Handle::try_current() {
            handle.spawn(fut);
        }
    }

    pub fn remove_track(&self, sid: &str) {
        if let Ok(mut tracks) = self.inner.tracks.lock() {
            if let Some(entry) = tracks.remove(sid) {
                entry.stop_flag.store(true, Ordering::Relaxed);
            }
        }
    }

    pub fn remove_participant(&self, identity: &str) {
        if let Ok(mut tracks) = self.inner.tracks.lock() {
            tracks.retain(|_, entry| {
                if entry.owner_identity == identity {
                    entry.stop_flag.store(true, Ordering::Relaxed);
                    false
                } else {
                    true
                }
            });
        }
    }

    pub fn set_deafened(&self, deafened: bool) {
        self.inner.is_deafened.store(deafened, Ordering::Relaxed);
    }

    /// Master output volume multiplier in [0.0, 2.0] (1.0 = 100%).
    pub fn set_master_volume(&self, volume: f32) {
        let clamped = if volume.is_finite() {
            volume.clamp(0.0, 2.0)
        } else {
            1.0
        };
        self.inner
            .master_volume_bits
            .store(clamped.to_bits(), Ordering::Relaxed);
    }

    /// Per-participant microphone volume multiplier in [0.0, 2.0] (1.0 = 100%).
    pub fn set_user_volume(&self, identity: String, vol: f32) {
        self.inner.set_user_volume(identity, vol);
    }

    /// Per-participant screen share audio volume multiplier in [0.0, 2.0] (1.0 = 100%).
    pub fn set_stream_volume(&self, owner_identity: String, vol: f32) {
        self.inner.set_stream_volume(owner_identity, vol);
    }

    pub fn set_watched_identities(&self, watched: HashSet<String>) {
        self.inner.set_watched_identities(watched);
    }
}

impl Drop for AudioOutputMixer {
    fn drop(&mut self) {
        self.stop();
    }
}

fn select_output_device(
    host: &cpal::Host,
    device_id: Option<&str>,
) -> Result<cpal::Device, String> {
    if let Some(id) = device_id.map(str::trim).filter(|s| !s.is_empty() && *s != "default") {
        if let Ok(devices) = host.output_devices() {
            for dev in devices {
                if let Ok(name) = dev.name() {
                    if name == id {
                        return Ok(dev);
                    }
                }
            }
        }
        eprintln!("[AudioOutput] Requested device '{id}' not found; falling back to default");
    }
    host.default_output_device()
        .ok_or_else(|| "No default audio output device available".to_string())
}

fn write_mixed_output<T>(
    out: &mut [T],
    out_channels: usize,
    mixer: &MixerInner,
    scratch_stereo: &mut Vec<f32>,
) where
    T: Sample + FromSample<f32>,
{
    let ch = out_channels.max(1);
    let num_frames = out.len() / ch;
    let stereo_len = num_frames * STREAM_CHANNELS;
    if scratch_stereo.len() < stereo_len {
        scratch_stereo.resize(stereo_len, 0.0);
    }

    let stereo_slice = &mut scratch_stereo[..stereo_len];
    mixer.mix_into_stereo_interleaved(stereo_slice);

    if ch == 2 {
        for (dst, &src) in out.iter_mut().zip(stereo_slice.iter()) {
            *dst = T::from_sample(src);
        }
    } else if ch == 1 {
        for (i, dst) in out.iter_mut().enumerate() {
            let l = stereo_slice[i * 2];
            let r = stereo_slice[i * 2 + 1];
            *dst = T::from_sample((l + r) * 0.5);
        }
    } else {
        for (i, frame) in out.chunks_exact_mut(ch).enumerate() {
            frame[0] = T::from_sample(stereo_slice[i * 2]);
            frame[1] = T::from_sample(stereo_slice[i * 2 + 1]);
            for extra in &mut frame[2..] {
                *extra = T::from_sample(0.0);
            }
        }
    }
}

fn resample_stereo_i16_to_f32(
    input: &[i16],
    src_rate: u32,
    dst_rate: u32,
    out: &mut Vec<f32>,
) {
    if input.is_empty() {
        return;
    }
    if src_rate == dst_rate {
        out.extend(input.iter().map(|&s| s.to_sample::<f32>()));
        return;
    }

    let in_frames = input.len() / STREAM_CHANNELS;
    if in_frames == 0 {
        return;
    }
    let out_frames = ((in_frames as u64 * dst_rate as u64) / src_rate as u64).max(1) as usize;
    let step = (in_frames as f64) / (out_frames as f64);

    for i in 0..out_frames {
        let pos = i as f64 * step;
        let idx0 = (pos.floor() as usize).min(in_frames - 1);
        let idx1 = (idx0 + 1).min(in_frames - 1);
        let frac = (pos - idx0 as f64) as f32;

        for c in 0..STREAM_CHANNELS {
            let s0 = input[idx0 * STREAM_CHANNELS + c].to_sample::<f32>();
            let s1 = input[idx1 * STREAM_CHANNELS + c].to_sample::<f32>();
            out.push(s0 + (s1 - s0) * frac);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn insert_test_track(
        inner: &MixerInner,
        sid: &str,
        owner: &str,
        is_screen_audio: bool,
        samples: &[f32],
    ) {
        let gain = {
            let u = inner.user_volumes.lock().unwrap();
            let s = inner.stream_volumes.lock().unwrap();
            let w = inner.watched_identities.lock().unwrap();
            MixerInner::resolve_track_gain(is_screen_audio, owner, &u, &s, &w)
        };
        let mut tracks = inner.tracks.lock().unwrap();
        tracks.insert(
            sid.to_string(),
            TrackEntry {
                owner_identity: owner.to_string(),
                is_screen_audio,
                track_gain_bits: AtomicU32::new(gain.to_bits()),
                buffer: samples.iter().copied().collect(),
                stop_flag: Arc::new(AtomicBool::new(false)),
            },
        );
    }

    #[test]
    fn mixing_applies_user_stream_master_deafen_and_watched_rules() {
        let inner = MixerInner::new();
        inner.master_volume_bits.store(0.5_f32.to_bits(), Ordering::Relaxed);
        inner.set_user_volume("alice".to_string(), 1.5);
        inner.set_stream_volume("bob".to_string(), 0.8);

        // 1. Alice mic (0.4 * 1.5 * 0.5 = 0.3), Bob screen NOT watched (gain = 0.0)
        insert_test_track(&inner, "t1", "alice", false, &[0.4, 0.4]);
        insert_test_track(&inner, "t2", "bob", true, &[0.5, 0.5]);

        let mut out = [0.0_f32; 2];
        inner.mix_into_stereo_interleaved(&mut out);
        let expected_alice = 0.3_f32.tanh();
        assert!((out[0] - expected_alice).abs() < 1e-5, "got {}", out[0]);

        // 2. Watch Bob's stream -> Bob contributes 0.5 * 0.8 * 0.5 = 0.2 -> total 0.5
        let mut watched = HashSet::new();
        watched.insert("bob".to_string());
        inner.set_watched_identities(watched);
        insert_test_track(&inner, "t1", "alice", false, &[0.4, 0.4]);
        insert_test_track(&inner, "t2", "bob", true, &[0.5, 0.5]);
        inner.mix_into_stereo_interleaved(&mut out);
        let expected_both = 0.5_f32.tanh();
        assert!((out[0] - expected_both).abs() < 1e-5, "got {}", out[0]);

        // 3. Deafened -> everything is 0.0 and buffers still drain
        inner.is_deafened.store(true, Ordering::Relaxed);
        insert_test_track(&inner, "t1", "alice", false, &[0.4, 0.4]);
        insert_test_track(&inner, "t2", "bob", true, &[0.5, 0.5]);
        inner.mix_into_stereo_interleaved(&mut out);
        assert_eq!(out, [0.0, 0.0]);
        assert!(inner.tracks.lock().unwrap().get("t1").unwrap().buffer.is_empty());
    }

    #[test]
    fn mixing_nonblocking_when_tracks_locked() {
        let inner = MixerInner::new();
        insert_test_track(&inner, "t1", "u1", false, &[0.5, 0.5]);
        let _guard = inner.tracks.lock().unwrap();
        let mut out = [0.9_f32; 2];
        // Must not deadlock even while tracks mutex is held; outputs silence
        inner.mix_into_stereo_interleaved(&mut out);
        assert_eq!(out, [0.0, 0.0]);
    }

    #[test]
    fn mixing_soft_clips_loud_summed_signals() {
        let inner = MixerInner::new();
        insert_test_track(&inner, "t1", "u1", false, &[0.9, -0.9]);
        insert_test_track(&inner, "t2", "u2", false, &[0.9, -0.9]);
        insert_test_track(&inner, "t3", "u3", false, &[0.9, -0.9]);

        let mut out = [0.0_f32; 2];
        inner.mix_into_stereo_interleaved(&mut out);
        assert!(out[0] < 1.0 && out[0] > 0.95, "Expected tanh soft-clip < 1.0, got {}", out[0]);
        assert!(out[1] > -1.0 && out[1] < -0.95, "Expected tanh soft-clip > -1.0, got {}", out[1]);
    }
}
