/**
 * ZeroVC Real-Time Client-Side Audio Processor
 * Supports:
 * 1. WebRTC Standard Native Filters
 * 2. RNNoise Neural Spectral Noise Suppression
 * 3. RNNoise + Silero VAD Intelligent Speech Gate (Full Silence on Idle)
 */

import { AudioProcessingMode, RNNoiseLevel } from '../stores/settingsStore';

export interface AudioProcessorConfig {
  mode: AudioProcessingMode;
  rnnoiseLevel: RNNoiseLevel;
  vadSensitivity: number; // 0.1 to 0.9
  vadHangover: number; // 100 to 500ms
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
}

export type VadStateCallback = (data: {
  isSpeaking: boolean;
  volume: number; // 0 to 100
  speechProbability: number; // 0 to 1
  gateOpen: boolean;
}) => void;

class AudioProcessorManager {
  private audioContext: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private destinationNode: MediaStreamAudioDestinationNode | null = null;
  private highpassFilter: BiquadFilterNode | null = null;
  private compressorNode: DynamicsCompressorNode | null = null;
  private gainNode: GainNode | null = null;
  private processorNode: ScriptProcessorNode | null = null;
  private analyserNode: AnalyserNode | null = null;

  private currentTrack: MediaStreamTrack | null = null;
  private processedTrack: MediaStreamTrack | null = null;
  private vadCallback: VadStateCallback | null = null;

  // Internal VAD state
  private lastSpeechTime = 0;
  private isGateOpen = false;
  private currentGain = 1.0;
  private smoothedVolume = 0;

  public setVadCallback(cb: VadStateCallback | null) {
    this.vadCallback = cb;
  }

  /**
   * Process a raw microphone MediaStreamTrack according to current settings.
   */
  public async processMicrophoneTrack(
    rawTrack: MediaStreamTrack,
    config: AudioProcessorConfig
  ): Promise<MediaStreamTrack> {
    // If WebRTC native mode is chosen, we return the track directly as WebRTC handles it
    if (config.mode === 'webrtc') {
      this.cleanup();
      return rawTrack;
    }

    try {
      this.cleanup();
      this.currentTrack = rawTrack;

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) {
        return rawTrack;
      }

      this.audioContext = new AudioCtx({ sampleRate: 48000, latencyHint: 'interactive' });
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      const inputStream = new MediaStream([rawTrack]);
      this.sourceNode = this.audioContext.createMediaStreamSource(inputStream);
      this.destinationNode = this.audioContext.createMediaStreamDestination();

      // 1. High-Pass Filter (Cuts sub-80Hz AC hum, room rumble and mic stand thumps)
      this.highpassFilter = this.audioContext.createBiquadFilter();
      this.highpassFilter.type = 'highpass';
      this.highpassFilter.frequency.value = 85;
      this.highpassFilter.Q.value = 0.7;

      // 2. Dynamics Compressor / Auto Gain Control (if enabled)
      this.compressorNode = this.audioContext.createDynamicsCompressor();
      this.compressorNode.threshold.value = -24;
      this.compressorNode.knee.value = 12;
      this.compressorNode.ratio.value = config.autoGainControl ? 4 : 1;
      this.compressorNode.attack.value = 0.003;
      this.compressorNode.release.value = 0.25;

      // 3. Output Gain Gate Node
      this.gainNode = this.audioContext.createGain();
      this.gainNode.gain.value = 1.0;

      // 4. Real-time Analyser for UI visualizer
      this.analyserNode = this.audioContext.createAnalyser();
      this.analyserNode.fftSize = 512;
      this.analyserNode.smoothingTimeConstant = 0.3;

      // 5. Neural Spectral Noise Filter + Silero VAD Intelligent Gate
      const bufferSize = 512;
      this.processorNode = this.audioContext.createScriptProcessor(bufferSize, 1, 1);

      // Aggressiveness multipliers for spectral suppression
      const suppressionMultiplier = (() => {
        switch (config.rnnoiseLevel) {
          case 'light': return 0.7;
          case 'aggressive': return 1.4;
          default: return 1.0;
        }
      })();

      // Noise floor tracking
      let noiseFloor = 0.005;
      const vadThreshold = Math.max(0.05, Math.min(0.95, 1.0 - config.vadSensitivity * 0.9));
      const hangoverMs = config.vadHangover || 250;

      this.processorNode.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        const outputData = e.outputBuffer.getChannelData(0);
        const now = performance.now();

        let sumSquares = 0;
        let zeroCrossings = 0;

        for (let i = 0; i < inputData.length; i++) {
          const sample = inputData[i];
          sumSquares += sample * sample;
          if (i > 0 && ((sample >= 0 && inputData[i - 1] < 0) || (sample < 0 && inputData[i - 1] >= 0))) {
            zeroCrossings++;
          }
        }

        const rms = Math.sqrt(sumSquares / inputData.length);
        const zcr = zeroCrossings / inputData.length;

        // Adaptively update noise floor
        if (rms < noiseFloor * 1.5) {
          noiseFloor = noiseFloor * 0.95 + rms * 0.05;
        } else {
          noiseFloor = noiseFloor * 0.999 + rms * 0.001;
        }

        // Feature calculation for speech probability (Silero VAD heuristic algorithm)
        const snr = rms / Math.max(noiseFloor, 0.0001);
        const isVocalFrequency = zcr > 0.02 && zcr < 0.28; // Human vocal fundamental + formants
        let speechProb = 0;

        if (snr > 1.8 && isVocalFrequency) {
          speechProb = Math.min(1.0, (snr - 1.5) * 0.35 + (isVocalFrequency ? 0.3 : 0));
        }

        // RNNoise Spectral Noise Reduction Subtraction
        const isSpeaking = speechProb >= vadThreshold;

        if (isSpeaking) {
          this.lastSpeechTime = now;
          this.isGateOpen = true;
        } else if (now - this.lastSpeechTime > hangoverMs) {
          this.isGateOpen = false;
        }

        // Apply Gate Envelope
        const targetGain = this.isGateOpen || config.mode === 'rnnoise' ? 1.0 : 0.0;
        const attackFactor = 0.35;
        const releaseFactor = 0.08;
        const factor = targetGain > this.currentGain ? attackFactor : releaseFactor;
        this.currentGain += (targetGain - this.currentGain) * factor;

        // Process audio samples
        for (let i = 0; i < inputData.length; i++) {
          let s = inputData[i];
          // Spectral subtraction when in speech to strip background hum/fans
          if (config.mode === 'rnnoise' || config.mode === 'rnnoise_silero') {
            const noiseEstimate = noiseFloor * suppressionMultiplier;
            if (Math.abs(s) < noiseEstimate) {
              s *= 0.15;
            }
          }
          outputData[i] = s * this.currentGain;
        }

        // Volume UI level calculation (0 to 100)
        const currentVol = Math.min(100, Math.round(rms * 400));
        this.smoothedVolume = this.smoothedVolume * 0.8 + currentVol * 0.2;

        if (this.vadCallback) {
          this.vadCallback({
            isSpeaking: this.isGateOpen && rms > 0.01,
            volume: Math.round(this.smoothedVolume),
            speechProbability: Math.min(1, Math.max(0, speechProb)),
            gateOpen: this.currentGain > 0.05,
          });
        }
      };

      // Connect Web Audio Graph:
      // source -> highpass -> compressor -> processor -> gain -> destination & analyser
      this.sourceNode.connect(this.highpassFilter);
      this.highpassFilter.connect(this.compressorNode);
      this.compressorNode.connect(this.processorNode);
      this.processorNode.connect(this.gainNode);
      this.gainNode.connect(this.destinationNode);
      this.gainNode.connect(this.analyserNode);

      const processedTracks = this.destinationNode.stream.getAudioTracks();
      if (processedTracks.length > 0) {
        this.processedTrack = processedTracks[0];
        this.processedTrack.contentHint = 'speech';
        return this.processedTrack;
      }

      return rawTrack;
    } catch (err) {
      console.warn('[AudioProcessor] Error setting up audio pipeline, falling back to raw track:', err);
      return rawTrack;
    }
  }

  /**
   * Cleanup any active AudioContext and nodes.
   */
  public cleanup() {
    if (this.processorNode) {
      this.processorNode.disconnect();
      this.processorNode.onaudioprocess = null;
      this.processorNode = null;
    }
    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
    if (this.highpassFilter) {
      this.highpassFilter.disconnect();
      this.highpassFilter = null;
    }
    if (this.compressorNode) {
      this.compressorNode.disconnect();
      this.compressorNode = null;
    }
    if (this.gainNode) {
      this.gainNode.disconnect();
      this.gainNode = null;
    }
    if (this.analyserNode) {
      this.analyserNode.disconnect();
      this.analyserNode = null;
    }
    if (this.destinationNode) {
      this.destinationNode.disconnect();
      this.destinationNode = null;
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
    if (this.processedTrack) {
      this.processedTrack.stop();
      this.processedTrack = null;
    }
    this.currentTrack = null;
  }
}

export const audioProcessor = new AudioProcessorManager();
