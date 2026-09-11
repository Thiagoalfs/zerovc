/**
 * Process Audio Bridge
 * Receives raw 48kHz Float32 stereo PCM audio chunks from Electron's native
 * WASAPI process loopback capture executable (zerovc-audio-capture.exe) and
 * feeds them into a Web Audio AudioWorklet to generate a standard MediaStreamTrack
 * for publishing via WebRTC / LiveKit.
 */

const WORKLET_PROCESSOR_CODE = `
class PCMPlayerProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // 48000Hz * 2 channels * 1 second buffer
    this.bufferSize = 48000 * 2;
    this.ringBufferL = new Float32Array(this.bufferSize);
    this.ringBufferR = new Float32Array(this.bufferSize);
    this.writeIndex = 0;
    this.readIndex = 0;
    this.availableFrames = 0;

    this.port.onmessage = (event) => {
      const floatData = event.data; // Float32Array interleaved [L0, R0, L1, R1, ...]
      if (!floatData || floatData.length === 0) return;
      
      const numFrames = Math.floor(floatData.length / 2);
      for (let i = 0; i < numFrames; i++) {
        this.ringBufferL[this.writeIndex] = floatData[i * 2];
        this.ringBufferR[this.writeIndex] = floatData[i * 2 + 1];
        this.writeIndex = (this.writeIndex + 1) % this.bufferSize;
      }
      this.availableFrames = Math.min(this.bufferSize, this.availableFrames + numFrames);

      // Low-latency backlog management: if audio is lagging by more than 100ms (4800 samples), skip ahead to 40ms buffer
      if (this.availableFrames > 4800) {
        const excess = this.availableFrames - 1920;
        this.readIndex = (this.readIndex + excess) % this.bufferSize;
        this.availableFrames -= excess;
      }
    };
  }

  process(inputs, outputs, parameters) {
    const output = outputs[0];
    if (!output || output.length === 0) return true;
    const outL = output[0];
    const outR = output[1] || output[0];
    const frameCount = outL.length; // usually 128

    if (this.availableFrames < frameCount) {
      // Underrun: output silence
      outL.fill(0);
      if (output[1]) outR.fill(0);
      return true;
    }

    for (let i = 0; i < frameCount; i++) {
      outL[i] = this.ringBufferL[this.readIndex];
      outR[i] = this.ringBufferR[this.readIndex];
      this.readIndex = (this.readIndex + 1) % this.bufferSize;
    }
    this.availableFrames -= frameCount;
    return true;
  }
}

registerProcessor('process-pcm-processor', PCMPlayerProcessor);
`;

export class ProcessAudioBridge {
  private audioContext: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private destinationNode: MediaStreamAudioDestinationNode | null = null;
  private unsubscribeChunk: (() => void) | null = null;
  private isCapturing = false;

  async startCapture(sourceId?: string): Promise<MediaStreamTrack | null> {
    if (typeof window === 'undefined' || !window.electronAPI?.startProcessAudioCapture) {
      console.warn('[ProcessAudioBridge] Electron process capture not available in this environment');
      return null;
    }

    // Stop any existing capture first
    await this.stopCapture();

    try {
      const mode: 'include' | 'exclude' = sourceId?.startsWith('window:') ? 'include' : 'exclude';
      const result = await window.electronAPI.startProcessAudioCapture({
        sourceId,
        mode,
      });

      if (!result.success) {
        console.error('[ProcessAudioBridge] Failed to start native capture:', result.error);
        return null;
      }

      // Initialize Web Audio Context at 48kHz
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioCtx({ sampleRate: 48000, latencyHint: 'interactive' });
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      const blob = new Blob([WORKLET_PROCESSOR_CODE], { type: 'application/javascript' });
      const workletUrl = URL.createObjectURL(blob);

      try {
        await this.audioContext.audioWorklet.addModule(workletUrl);
      } finally {
        URL.revokeObjectURL(workletUrl);
      }

      this.workletNode = new AudioWorkletNode(this.audioContext, 'process-pcm-processor', {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2],
      });

      this.destinationNode = this.audioContext.createMediaStreamDestination();
      this.workletNode.connect(this.destinationNode);

      // Subscribe to binary Float32 PCM chunks from Electron Main
      if (window.electronAPI.onProcessAudioChunk) {
        this.unsubscribeChunk = window.electronAPI.onProcessAudioChunk((chunk: Uint8Array) => {
          if (!this.workletNode) return;
          try {
            const floatData = new Float32Array(
              chunk.buffer,
              chunk.byteOffset,
              Math.floor(chunk.byteLength / 4)
            );
            this.workletNode.port.postMessage(floatData);
          } catch (err) {
            console.error('[ProcessAudioBridge] Error feeding audio chunk:', err);
          }
        });
      }

      this.isCapturing = true;
      const track = this.destinationNode.stream.getAudioTracks()[0] || null;
      if (track) {
        track.onended = () => {
          this.stopCapture();
        };
      }
      return track;
    } catch (err) {
      console.error('[ProcessAudioBridge] Error starting audio bridge:', err);
      await this.stopCapture();
      return null;
    }
  }

  async stopCapture(): Promise<void> {
    this.isCapturing = false;

    if (this.unsubscribeChunk) {
      this.unsubscribeChunk();
      this.unsubscribeChunk = null;
    }

    if (this.workletNode) {
      try {
        this.workletNode.disconnect();
      } catch {}
      this.workletNode = null;
    }

    if (this.audioContext) {
      try {
        await this.audioContext.close();
      } catch {}
      this.audioContext = null;
    }

    this.destinationNode = null;

    if (typeof window !== 'undefined' && window.electronAPI?.stopProcessAudioCapture) {
      try {
        await window.electronAPI.stopProcessAudioCapture();
      } catch (err) {
        console.warn('[ProcessAudioBridge] Error stopping capture process:', err);
      }
    }
  }

  getIsCapturing(): boolean {
    return this.isCapturing;
  }
}

export const processAudioBridge = new ProcessAudioBridge();
