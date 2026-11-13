/**
 * ZeroVC Real-Time Audio Processor
 * Pipeline: Source -> HighPass (85Hz) -> RNNoise WASM (AudioWorklet) -> VAD Gate -> Gain -> Destination
 */
import { loadRnnoise, RnnoiseWorkletNode } from '@sapphi-red/web-noise-suppressor';
import rnnoiseWasmUrl from '@sapphi-red/web-noise-suppressor/rnnoise.wasm?url';
import rnnoiseSimdWasmUrl from '@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url';
import rnnoiseWorkletUrl from '@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url';

export type AudioProcessingMode = 'webrtc' | 'rnnoise' | 'rnnoise_silero' | 'none';
export type RnnoiseLevel = 'light' | 'balanced' | 'aggressive';

export interface AudioProcessorConfig {
  mode: AudioProcessingMode;
  rnnoiseLevel: RnnoiseLevel;
  vadAutoSensitivity: boolean;
  vadSensitivity: number; // 0.05 to 0.95 (maps to -95 dB .. -5 dB)
  vadHangover: number; // ms
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
  volume: number; // 0 to 100
}

export type VadStateCallback = (state: {
  isSpeaking: boolean;
  volume: number;
  speechProbability: number;
  gateOpen: boolean;
}) => void;

const DEFAULT_CONFIG: AudioProcessorConfig = {
  mode: 'rnnoise_silero',
  rnnoiseLevel: 'balanced',
  vadAutoSensitivity: true,
  vadSensitivity: 0.45,
  vadHangover: 250,
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  volume: 100,
};

let cachedWasmBinaryPromise: Promise<ArrayBuffer> | null = null;
function getRnnoiseWasmBinary(): Promise<ArrayBuffer> {
  if (!cachedWasmBinaryPromise) {
    cachedWasmBinaryPromise = loadRnnoise({
      url: rnnoiseWasmUrl,
      simdUrl: rnnoiseSimdWasmUrl,
    }).catch((err) => {
      cachedWasmBinaryPromise = null;
      throw err;
    });
  }
  return cachedWasmBinaryPromise;
}

export class AudioProcessorManager {
  private audioCtx: AudioContext | null = null;
  private workletLoadedCtx: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private highpassFilter: BiquadFilterNode | null = null;
  private rnnoiseNode: RnnoiseWorkletNode | null = null;
  private gateGainNode: GainNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private volumeGainNode: GainNode | null = null;
  private destinationNode: MediaStreamAudioDestinationNode | null = null;

  private activeConfig: AudioProcessorConfig = { ...DEFAULT_CONFIG };
  private onVadStateChange: VadStateCallback | null = null;
  private meterTimerId: number | null = null;
  private timeDataBuf = new Float32Array(512);
  private freqDataBuf = new Uint8Array(256);

  private isGateOpen = false;
  private lastSpeechTimestamp = 0;
  private noiseFloorDb = -65;

  async prewarm(): Promise<void> {
    try {
      await getRnnoiseWasmBinary();
    } catch (err) {
      console.warn('[AudioProcessor] Prewarm RNNoise WASM failed:', err);
    }
  }

  setVadCallback(cb: VadStateCallback | null) {
    this.onVadStateChange = cb;
  }

  updateConfig(partial: Partial<AudioProcessorConfig>) {
    const prevMode = this.activeConfig.mode;
    this.activeConfig = { ...this.activeConfig, ...partial };

    if (this.volumeGainNode && this.audioCtx && partial.volume !== undefined) {
      const gainVal = Math.max(0, Math.min(2, this.activeConfig.volume / 100));
      this.volumeGainNode.gain.setTargetAtTime(gainVal, this.audioCtx.currentTime, 0.015);
    }

    if (partial.mode && partial.mode !== prevMode && this.sourceNode) {
      void this.rebuildRouting();
    }
  }

  private async ensureRnnoiseNode(): Promise<RnnoiseWorkletNode | null> {
    if (!this.audioCtx) return null;
    try {
      if (this.workletLoadedCtx !== this.audioCtx) {
        await this.audioCtx.audioWorklet.addModule(rnnoiseWorkletUrl);
        this.workletLoadedCtx = this.audioCtx;
      }
      if (!this.rnnoiseNode) {
        const wasmBinary = await getRnnoiseWasmBinary();
        this.rnnoiseNode = new RnnoiseWorkletNode(this.audioCtx, {
          maxChannels: 1,
          wasmBinary,
        });
      }
      return this.rnnoiseNode;
    } catch (err) {
      console.warn('[AudioProcessor] RNNoise worklet init failed, using fallback filter:', err);
      return null;
    }
  }

  private async rebuildRouting() {
    if (
      !this.audioCtx ||
      !this.sourceNode ||
      !this.highpassFilter ||
      !this.gateGainNode ||
      !this.analyserNode ||
      !this.volumeGainNode ||
      !this.destinationNode
    ) {
      return;
    }

    try { this.sourceNode.disconnect(); } catch {}
    try { this.highpassFilter.disconnect(); } catch {}
    try { this.rnnoiseNode?.disconnect(); } catch {}
    try { this.gateGainNode.disconnect(); } catch {}
    try { this.analyserNode.disconnect(); } catch {}
    try { this.volumeGainNode.disconnect(); } catch {}

    const useRnnoise =
      this.activeConfig.mode === 'rnnoise' || this.activeConfig.mode === 'rnnoise_silero';

    if (useRnnoise) {
      const rnnoise = await this.ensureRnnoiseNode();
      this.sourceNode.connect(this.highpassFilter);
      if (rnnoise) {
        this.highpassFilter.connect(rnnoise);
        rnnoise.connect(this.analyserNode);
      } else {
        this.highpassFilter.connect(this.analyserNode);
      }
      this.analyserNode.connect(this.gateGainNode);
      this.gateGainNode.connect(this.volumeGainNode);
      this.volumeGainNode.connect(this.destinationNode);
    } else {
      this.gateGainNode.gain.setTargetAtTime(1.0, this.audioCtx.currentTime, 0.01);
      this.sourceNode.connect(this.analyserNode);
      this.analyserNode.connect(this.volumeGainNode);
      this.volumeGainNode.connect(this.destinationNode);
    }
  }

  private startVadLoop() {
    if (this.meterTimerId !== null) {
      window.clearInterval(this.meterTimerId);
    }

    this.meterTimerId = window.setInterval(() => {
      if (!this.analyserNode || !this.gateGainNode || !this.audioCtx) return;

      this.analyserNode.getFloatTimeDomainData(this.timeDataBuf);
      let sumSq = 0;
      for (let i = 0; i < this.timeDataBuf.length; i++) {
        const s = this.timeDataBuf[i];
        sumSq += s * s;
      }
      const rms = Math.sqrt(sumSq / this.timeDataBuf.length);
      const rmsDb = 20 * Math.log10(Math.max(rms, 1e-5));
      // Normalized 0..100 meter matching -100 dB .. 0 dB UI scale
      const meterPct = Math.max(0, Math.min(100, rmsDb + 100));

      const cfg = this.activeConfig;
      const now = performance.now();

      if (cfg.mode !== 'rnnoise_silero') {
        this.isGateOpen = rmsDb > -75;
        this.gateGainNode.gain.setTargetAtTime(1.0, this.audioCtx.currentTime, 0.015);
        this.onVadStateChange?.({
          isSpeaking: rmsDb > -52,
          volume: meterPct,
          speechProbability: rmsDb > -52 ? 0.9 : 0.05,
          gateOpen: true,
        });
        return;
      }

      // Compute voice-band (100Hz - 3800Hz) ratio vs total spectrum to reject sharp clicks/hiss
      this.analyserNode.getByteFrequencyData(this.freqDataBuf);
      const binHz = this.audioCtx.sampleRate / this.analyserNode.fftSize;
      const lowBin = Math.max(1, Math.floor(100 / binHz));
      const highBin = Math.min(this.freqDataBuf.length - 1, Math.ceil(3800 / binHz));
      let voiceEnergy = 0;
      let totalEnergy = 0;
      for (let b = 1; b < this.freqDataBuf.length; b++) {
        const v = this.freqDataBuf[b];
        totalEnergy += v;
        if (b >= lowBin && b <= highBin) voiceEnergy += v;
      }
      const voiceRatio = totalEnergy > 16 ? voiceEnergy / totalEnergy : 0;

      // Track stationary noise floor slowly when signal isn't an active speech burst
      if (rmsDb < this.noiseFloorDb + 6) {
        this.noiseFloorDb = this.noiseFloorDb * 0.94 + rmsDb * 0.06;
      } else if (rmsDb < this.noiseFloorDb) {
        this.noiseFloorDb = this.noiseFloorDb * 0.8 + rmsDb * 0.2;
      }

      const openThresholdDb = cfg.vadAutoSensitivity
        ? Math.max(-52, Math.min(-26, this.noiseFloorDb + 11))
        : cfg.vadSensitivity * 100 - 100;
      const closeThresholdDb = openThresholdDb - 4;

      const isVoiceLike = voiceRatio >= 0.42;
      const detectedSpeech = this.isGateOpen
        ? rmsDb > closeThresholdDb && isVoiceLike
        : rmsDb > openThresholdDb && isVoiceLike;

      if (detectedSpeech) {
        this.lastSpeechTimestamp = now;
        this.isGateOpen = true;
      } else if (this.isGateOpen && now - this.lastSpeechTimestamp > cfg.vadHangover) {
        this.isGateOpen = false;
      }

      const targetGain = this.isGateOpen ? 1.0 : 0.0;
      const timeConstant = this.isGateOpen ? 0.008 : 0.035;
      this.gateGainNode.gain.setTargetAtTime(targetGain, this.audioCtx.currentTime, timeConstant);

      const prob = detectedSpeech ? Math.min(0.99, 0.55 + (rmsDb - openThresholdDb) * 0.03) : 0.05;
      this.onVadStateChange?.({
        isSpeaking: detectedSpeech,
        volume: meterPct,
        speechProbability: Math.max(0, Math.min(1, prob)),
        gateOpen: this.isGateOpen,
      });
    }, 30);
  }

  async processMicrophoneTrack(
    rawTrack: MediaStreamTrack,
    config: Partial<AudioProcessorConfig> = {}
  ): Promise<MediaStreamTrack> {
    this.cleanup();
    this.activeConfig = { ...DEFAULT_CONFIG, ...config };
    this.noiseFloorDb = -65;

    try {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioCtx = new AudioContextClass({
        sampleRate: 48000,
        latencyHint: 'interactive',
      });

      if (this.audioCtx.state === 'suspended') {
        await this.audioCtx.resume();
      }

      const rawStream = new MediaStream([rawTrack]);
      this.sourceNode = this.audioCtx.createMediaStreamSource(rawStream);

      this.highpassFilter = this.audioCtx.createBiquadFilter();
      this.highpassFilter.type = 'highpass';
      this.highpassFilter.frequency.value = 85;
      this.highpassFilter.Q.value = 0.707;

      this.analyserNode = this.audioCtx.createAnalyser();
      this.analyserNode.fftSize = 512;
      this.analyserNode.smoothingTimeConstant = 0.25;

      this.gateGainNode = this.audioCtx.createGain();
      this.gateGainNode.gain.value = this.activeConfig.mode === 'rnnoise_silero' ? 0.0 : 1.0;

      this.volumeGainNode = this.audioCtx.createGain();
      this.volumeGainNode.gain.value = Math.max(0, Math.min(2, this.activeConfig.volume / 100));

      this.destinationNode = this.audioCtx.createMediaStreamDestination();

      await this.rebuildRouting();
      this.startVadLoop();

      const processedTrack = this.destinationNode.stream.getAudioTracks()[0];
      return processedTrack || rawTrack;
    } catch (err) {
      console.error('[AudioProcessor] Failed to initialize audio pipeline, returning raw track:', err);
      return rawTrack;
    }
  }

  getActiveProcessedTrack(): MediaStreamTrack | null {
    return this.destinationNode?.stream.getAudioTracks()[0] || null;
  }

  cleanup() {
    if (this.meterTimerId !== null) {
      window.clearInterval(this.meterTimerId);
      this.meterTimerId = null;
    }
    try { this.sourceNode?.disconnect(); } catch {}
    try { this.highpassFilter?.disconnect(); } catch {}
    try { this.rnnoiseNode?.disconnect(); this.rnnoiseNode?.destroy(); } catch {}
    try { this.analyserNode?.disconnect(); } catch {}
    try { this.gateGainNode?.disconnect(); } catch {}
    try { this.volumeGainNode?.disconnect(); } catch {}
    try { this.destinationNode?.disconnect(); } catch {}

    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      this.audioCtx.close().catch(() => {});
    }

    this.sourceNode = null;
    this.highpassFilter = null;
    this.rnnoiseNode = null;
    this.analyserNode = null;
    this.gateGainNode = null;
    this.volumeGainNode = null;
    this.destinationNode = null;
    this.workletLoadedCtx = null;
    this.audioCtx = null;
    this.isGateOpen = false;
  }
}

export const audioProcessor = new AudioProcessorManager();
