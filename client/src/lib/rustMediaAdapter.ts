import { DisconnectReason, Participant, Track, TrackPublication } from 'livekit-client';
import type { AudioProcessorConfig, VadStateCallback } from './audioProcessor';
import { isTauri } from './platform';

export interface BridgeParticipant {
  identity: string;
  name: string;
  metadata: string;
  isLocal: boolean;
  isSpeaking: boolean;
  isMicrophoneEnabled: boolean;
  isCameraEnabled: boolean;
  isScreenShareEnabled: boolean;
  hasScreenShareAudio: boolean;
}

export interface BridgeMediaConnectResult {
  roomName: string;
  localIdentity: string;
  videoHubPort: number;
  videoHubToken: string;
}

export interface BridgeDeviceInfo {
  deviceId: string;
  label: string;
  kind: 'audioinput' | 'audiooutput' | 'videoinput';
}

export interface BridgeDiagnosticStats {
  isConnected: boolean;
  roomName: string;
  serverUrl: string;
  pingMs: number;
  iceState: string;
  protocol: 'udp' | 'tcp' | 'unknown';
  packetLossPercent: number;
  audioBitrateKbps: number;
  videoBitrateKbps: number;
  codec: string;
}

export interface BridgeVadState {
  isSpeaking: boolean;
  volume: number;
  speechProbability: number;
  gateOpen: boolean;
}

export interface BridgeConnectCallbacks {
  autoEnableMicrophone?: boolean;
  screenshareToken?: string;
  onParticipantsChanged?: (participants: Participant[]) => void;
  onSpeakingChanged?: (speakingUserIds: string[]) => void;
  onDeafenedChanged?: (deafenedUserIds: string[]) => void;
  onTrackUpdated?: () => void;
  onScreenShareEnded?: () => void;
  onDisconnected?: (reason?: DisconnectReason) => void;
  onParticipantConnected?: (participant: Participant) => void;
  onParticipantDisconnected?: (participant: Participant) => void;
}

export interface BridgeTrackPublicationStub {
  isMuted: boolean;
  isEnabled: boolean;
  source: Track.Source;
  trackSid: string;
}

export interface BridgeRoomStub {
  name: string;
  state: 'connected' | 'disconnected';
  localParticipant: Participant;
  remoteParticipants: Map<string, Participant>;
}

async function tauriInvoke<T = unknown>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(cmd, args);
}

function mapDisconnectReason(reason?: string): DisconnectReason | undefined {
  if (!reason) return undefined;
  const normalized = reason.toLowerCase();
  if (normalized.includes('duplicate')) return DisconnectReason.DUPLICATE_IDENTITY;
  if (normalized.includes('client')) return DisconnectReason.CLIENT_INITIATED;
  if (normalized.includes('server') || normalized.includes('shutdown')) return DisconnectReason.SERVER_SHUTDOWN;
  if (normalized.includes('removed') || normalized.includes('kicked')) return DisconnectReason.PARTICIPANT_REMOVED;
  if (normalized.includes('deleted')) return DisconnectReason.ROOM_DELETED;
  if (normalized.includes('mismatch')) return DisconnectReason.STATE_MISMATCH;
  if (normalized.includes('timeout') || normalized.includes('join')) return DisconnectReason.JOIN_FAILURE;
  return DisconnectReason.UNKNOWN_REASON;
}

function createPublicationStub(
  identity: string,
  source: Track.Source,
  enabled: boolean
): TrackPublication {
  const stub: BridgeTrackPublicationStub = {
    isMuted: !enabled,
    isEnabled: enabled,
    source,
    trackSid: `${identity}:${source}`,
  };
  return stub as unknown as TrackPublication;
}

function createParticipantStub(
  bp: BridgeParticipant,
  mergedScreenShare: boolean,
  mergedScreenShareAudio: boolean
): Participant {
  const listeners = new Map<string, Set<(...args: any[]) => void>>();

  const stub = {
    sid: bp.identity,
    identity: bp.identity,
    name: bp.name,
    metadata: bp.metadata,
    isLocal: bp.isLocal,
    isSpeaking: bp.isSpeaking,
    isMicrophoneEnabled: bp.isMicrophoneEnabled,
    isCameraEnabled: bp.isCameraEnabled,
    isScreenShareEnabled: mergedScreenShare,
    getTrackPublication(source: Track.Source): TrackPublication | undefined {
      switch (source) {
        case Track.Source.Microphone:
          return createPublicationStub(bp.identity, source, bp.isMicrophoneEnabled);
        case Track.Source.Camera:
          return bp.isCameraEnabled ? createPublicationStub(bp.identity, source, true) : undefined;
        case Track.Source.ScreenShare:
          return mergedScreenShare ? createPublicationStub(bp.identity, source, true) : undefined;
        case Track.Source.ScreenShareAudio:
          return mergedScreenShareAudio ? createPublicationStub(bp.identity, source, true) : undefined;
        default:
          return undefined;
      }
    },
    on(event: string, fn: (...args: any[]) => void) {
      let set = listeners.get(event);
      if (!set) {
        set = new Set();
        listeners.set(event, set);
      }
      set.add(fn);
      return stub;
    },
    off(event: string, fn: (...args: any[]) => void) {
      listeners.get(event)?.delete(fn);
      return stub;
    },
  };

  return stub as unknown as Participant;
}

class RustMediaAdapter {
  private connected = false;
  private roomName = '';
  private serverUrl = '';
  private localIdentity = '';
  private videoHubPort = 0;
  private videoHubToken = '';
  private isLocalNativeScreenSharing = false;
  private rawParticipants: BridgeParticipant[] = [];
  private visibleParticipants: Participant[] = [];
  private previousRemoteIds: Set<string> = new Set();
  private callbacks: BridgeConnectCallbacks = {};
  private vadCallback: VadStateCallback | null = null;
  private unlistenFns: Array<() => void> = [];

  isConnected(): boolean {
    return this.connected;
  }

  setLocalNativeScreenSharing(active: boolean): void {
    if (this.isLocalNativeScreenSharing === active) return;
    this.isLocalNativeScreenSharing = active;
    this.rebuildParticipants();
    this.callbacks.onTrackUpdated?.();
    this.callbacks.onParticipantsChanged?.(this.visibleParticipants);
  }

  setVadCallback(cb: VadStateCallback | null): void {
    this.vadCallback = cb;
  }

  getVideoStreamInfo(
    identity: string,
    source: 'camera' | 'screen_share'
  ): { url: string } | null {
    if (!isTauri() || !this.connected || !this.videoHubPort || !this.videoHubToken) {
      return null;
    }
    return {
      url: `http://127.0.0.1:${this.videoHubPort}/video/${this.videoHubToken}/${encodeURIComponent(
        `${identity}:${source}`
      )}`,
    };
  }

  getVisibleParticipants(): Participant[] {
    return this.visibleParticipants;
  }

  getRoomStub(): BridgeRoomStub | null {
    if (!this.connected) return null;
    const localParticipant =
      this.visibleParticipants.find((p) => p.isLocal) ??
      createParticipantStub(
        {
          identity: this.localIdentity,
          name: this.localIdentity,
          metadata: '',
          isLocal: true,
          isSpeaking: false,
          isMicrophoneEnabled: false,
          isCameraEnabled: false,
          isScreenShareEnabled: this.isLocalNativeScreenSharing,
          hasScreenShareAudio: false,
        },
        this.isLocalNativeScreenSharing,
        false
      );

    const remoteParticipants = new Map<string, Participant>();
    for (const p of this.visibleParticipants) {
      if (!p.isLocal) {
        remoteParticipants.set(p.identity, p);
      }
    }

    return {
      name: this.roomName,
      state: 'connected',
      localParticipant,
      remoteParticipants,
    };
  }

  private rebuildParticipants(): void {
    const sidecarByOwner = new Map<string, BridgeParticipant>();
    const mainList: BridgeParticipant[] = [];

    for (const p of this.rawParticipants) {
      if (p.identity.startsWith('screenshare:')) {
        sidecarByOwner.set(p.identity.slice('screenshare:'.length), p);
      } else {
        mainList.push(p);
      }
    }

    // Ensure local participant appears first, matching LiveKitManager.getVisibleParticipants
    mainList.sort((a, b) => (a.isLocal === b.isLocal ? 0 : a.isLocal ? -1 : 1));

    this.visibleParticipants = mainList.map((p) => {
      const sidecar = sidecarByOwner.get(p.identity);
      const forceLocalShare = p.isLocal && this.isLocalNativeScreenSharing;
      const mergedScreenShare = Boolean(
        p.isScreenShareEnabled || sidecar?.isScreenShareEnabled || forceLocalShare
      );
      const mergedScreenShareAudio = Boolean(
        p.hasScreenShareAudio || sidecar?.hasScreenShareAudio
      );
      return createParticipantStub(p, mergedScreenShare, mergedScreenShareAudio);
    });
  }

  private async setupListeners(): Promise<void> {
    this.teardownListeners();
    const { listen } = await import('@tauri-apps/api/event');

    const unlistenParticipants = await listen<BridgeParticipant[]>(
      'media-bridge:participants-changed',
      (event) => {
        const nextRaw = Array.isArray(event.payload) ? event.payload : [];
        const prevMap = new Map(this.visibleParticipants.map((p) => [p.identity, p]));

        this.rawParticipants = nextRaw;
        this.rebuildParticipants();

        const nextRemoteIds = new Set<string>();
        for (const p of this.visibleParticipants) {
          if (!p.isLocal) {
            nextRemoteIds.add(p.identity);
            if (!this.previousRemoteIds.has(p.identity)) {
              this.callbacks.onParticipantConnected?.(p);
            }
          }
        }
        for (const oldId of this.previousRemoteIds) {
          if (!nextRemoteIds.has(oldId)) {
            const oldParticipant = prevMap.get(oldId);
            if (oldParticipant) {
              this.callbacks.onParticipantDisconnected?.(oldParticipant);
            }
          }
        }
        this.previousRemoteIds = nextRemoteIds;

        this.callbacks.onParticipantsChanged?.(this.visibleParticipants);
        this.callbacks.onTrackUpdated?.();
      }
    );

    const unlistenSpeaking = await listen<string[]>(
      'media-bridge:speaking-changed',
      (event) => {
        const ids = Array.isArray(event.payload) ? event.payload : [];
        this.callbacks.onSpeakingChanged?.(ids);
      }
    );

    const unlistenDeafened = await listen<string[]>(
      'media-bridge:deafened-changed',
      (event) => {
        const ids = Array.isArray(event.payload) ? event.payload : [];
        this.callbacks.onDeafenedChanged?.(ids);
      }
    );

    const unlistenTrackUpdated = await listen<Record<string, unknown>>(
      'media-bridge:track-updated',
      () => {
        this.callbacks.onTrackUpdated?.();
      }
    );

    const unlistenDisconnected = await listen<{ reason?: string }>(
      'media-bridge:disconnected',
      (event) => {
        const onDisconnected = this.callbacks.onDisconnected;
        this.resetState();
        onDisconnected?.(mapDisconnectReason(event.payload?.reason));
      }
    );

    const unlistenVad = await listen<BridgeVadState>(
      'media-bridge:vad-state',
      (event) => {
        if (event.payload) {
          this.vadCallback?.(event.payload);
        }
      }
    );

    this.unlistenFns = [
      unlistenParticipants,
      unlistenSpeaking,
      unlistenDeafened,
      unlistenTrackUpdated,
      unlistenDisconnected,
      unlistenVad,
    ];
  }

  private teardownListeners(): void {
    for (const unlisten of this.unlistenFns) {
      try {
        unlisten();
      } catch {}
    }
    this.unlistenFns = [];
  }

  private resetState(): void {
    this.teardownListeners();
    this.connected = false;
    this.roomName = '';
    this.serverUrl = '';
    this.localIdentity = '';
    this.videoHubPort = 0;
    this.videoHubToken = '';
    this.isLocalNativeScreenSharing = false;
    this.rawParticipants = [];
    this.visibleParticipants = [];
    this.previousRemoteIds.clear();
  }

  async connect(params: {
    url: string;
    token: string;
    autoEnableMic: boolean;
    isE2ee: boolean;
    audioConfig: AudioProcessorConfig;
    inputDeviceId?: string | null;
    outputDeviceId?: string | null;
    callbacks: BridgeConnectCallbacks;
  }): Promise<BridgeMediaConnectResult> {
    if (this.connected) {
      await this.disconnect();
    }

    this.callbacks = params.callbacks;
    this.serverUrl = params.url;
    await this.setupListeners();

    try {
      const result = await tauriInvoke<BridgeMediaConnectResult>('media_connect', {
        url: params.url,
        token: params.token,
        autoEnableMic: params.autoEnableMic,
        isE2ee: params.isE2ee,
        audioConfig: params.audioConfig,
        inputDeviceId: params.inputDeviceId ?? null,
        outputDeviceId: params.outputDeviceId ?? null,
      });

      this.connected = true;
      this.roomName = result.roomName;
      this.localIdentity = result.localIdentity;
      this.videoHubPort = result.videoHubPort;
      this.videoHubToken = result.videoHubToken;

      if (this.visibleParticipants.length === 0 && result.localIdentity) {
        this.rawParticipants = [
          {
            identity: result.localIdentity,
            name: result.localIdentity,
            metadata: '',
            isLocal: true,
            isSpeaking: false,
            isMicrophoneEnabled: params.autoEnableMic,
            isCameraEnabled: false,
            isScreenShareEnabled: this.isLocalNativeScreenSharing,
            hasScreenShareAudio: false,
          },
        ];
        this.rebuildParticipants();
      }

      this.callbacks.onParticipantsChanged?.(this.visibleParticipants);
      return result;
    } catch (err) {
      this.resetState();
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    this.resetState();
    this.callbacks = {};
    try {
      await tauriInvoke<void>('media_disconnect', {});
    } catch {}
  }

  async setMuted(muted: boolean): Promise<void> {
    await tauriInvoke<void>('media_set_muted', { muted });
  }

  async setDeafened(deafened: boolean): Promise<void> {
    await tauriInvoke<void>('media_set_deafened', { deafened });
  }

  async setMicrophoneEnabled(enabled: boolean): Promise<void> {
    await tauriInvoke<void>('media_set_muted', { muted: !enabled });
  }

  async setCameraEnabled(enabled: boolean, deviceId?: string | null): Promise<void> {
    await tauriInvoke<void>('media_set_camera_enabled', {
      enabled,
      deviceId: deviceId ?? null,
    });
  }

  async setUserVolume(identity: string, volume: number): Promise<void> {
    await tauriInvoke<void>('media_set_user_volume', { identity, volume });
  }

  async setStreamVolume(identity: string, volume: number): Promise<void> {
    await tauriInvoke<void>('media_set_stream_volume', { identity, volume });
  }

  async setOutputVolume(volume: number): Promise<void> {
    await tauriInvoke<void>('media_set_output_volume', { volume });
  }

  async setInputVolume(volume: number): Promise<void> {
    await tauriInvoke<void>('media_set_input_volume', { volume });
  }

  async setStreamSubscribed(identity: string, subscribed: boolean): Promise<void> {
    await tauriInvoke<void>('media_set_stream_subscribed', { identity, subscribed });
  }

  async updateMicrophoneConfig(config: AudioProcessorConfig): Promise<void> {
    await tauriInvoke<void>('media_update_mic_config', { config });
  }

  async setAudioInputDevice(deviceId: string): Promise<void> {
    await tauriInvoke<void>('media_set_input_device', { deviceId });
  }

  async setAudioOutputDevice(deviceId: string): Promise<void> {
    await tauriInvoke<void>('media_set_output_device', { deviceId });
  }

  async setVideoInputDevice(deviceId: string): Promise<void> {
    await tauriInvoke<void>('media_set_video_device', { deviceId });
  }

  async listDevices(): Promise<BridgeDeviceInfo[]> {
    return tauriInvoke<BridgeDeviceInfo[]>('media_list_devices', {});
  }

  async setE2eeKey(keyBase64: string): Promise<void> {
    await tauriInvoke<void>('media_set_e2ee_key', { keyBase64 });
  }

  async ratchetE2eeKey(identity?: string | null, keyIndex?: number | null): Promise<void> {
    await tauriInvoke<void>('media_ratchet_e2ee_key', {
      identity: identity ?? null,
      keyIndex: keyIndex ?? null,
    });
  }

  async getDiagnosticStats(): Promise<BridgeDiagnosticStats> {
    if (!this.connected) {
      return {
        isConnected: false,
        roomName: '',
        serverUrl: '',
        pingMs: 0,
        iceState: 'disconnected',
        protocol: 'unknown',
        packetLossPercent: 0,
        audioBitrateKbps: 0,
        videoBitrateKbps: 0,
        codec: 'Opus 48kHz (Rust Native)',
      };
    }
    const stats = await tauriInvoke<BridgeDiagnosticStats>('media_get_diagnostic_stats', {});
    return {
      ...stats,
      roomName: stats.roomName || this.roomName || 'Canal de Voz',
      serverUrl: stats.serverUrl || this.serverUrl || 'LiveKit Gateway',
    };
  }
}

export const rustMediaAdapter = new RustMediaAdapter();

// -----------------------------------------------------------------------------
// Reusable WebGL I420 -> RGB Canvas Stream Renderer (with VideoFrame 2D fallback)
// -----------------------------------------------------------------------------

interface WebGLRendererState {
  gl: WebGLRenderingContext;
  program: WebGLProgram;
  yTex: WebGLTexture;
  uTex: WebGLTexture;
  vTex: WebGLTexture;
  texWidth: number;
  texHeight: number;
}

const VERTEX_SHADER_SRC = `
  attribute vec2 a_position;
  attribute vec2 a_texCoord;
  varying vec2 v_texCoord;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
    v_texCoord = a_texCoord;
  }
`;

const FRAGMENT_SHADER_SRC = `
  precision mediump float;
  varying vec2 v_texCoord;
  uniform sampler2D u_texY;
  uniform sampler2D u_texU;
  uniform sampler2D u_texV;

  void main() {
    float y = texture2D(u_texY, v_texCoord).r;
    float u = texture2D(u_texU, v_texCoord).r;
    float v = texture2D(u_texV, v_texCoord).r;

    // BT.709 studio-range YUV -> RGB
    y = (y - 0.0627451) * 1.16438356;
    u = u - 0.50196078;
    v = v - 0.50196078;

    float r = y + 1.79274107 * v;
    float g = y - 0.21324861 * u - 0.53290933 * v;
    float b = y + 2.11240179 * u;

    gl_FragColor = vec4(clamp(vec3(r, g, b), 0.0, 1.0), 1.0);
  }
`;

const webglStateByCanvas = new WeakMap<HTMLCanvasElement, WebGLRendererState | 'unavailable'>();

function compileShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function createPlaneTexture(gl: WebGLRenderingContext): WebGLTexture | null {
  const tex = gl.createTexture();
  if (!tex) return null;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

function getOrCreateWebGLRenderer(canvas: HTMLCanvasElement): WebGLRendererState | null {
  const cached = webglStateByCanvas.get(canvas);
  if (cached === 'unavailable') return null;
  if (cached) {
    if (cached.gl.isContextLost()) {
      webglStateByCanvas.set(canvas, 'unavailable');
      return null;
    }
    return cached;
  }

  const gl = (canvas.getContext('webgl', {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: false,
  }) ||
    canvas.getContext('experimental-webgl', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
    })) as WebGLRenderingContext | null;

  if (!gl) {
    webglStateByCanvas.set(canvas, 'unavailable');
    return null;
  }

  const vs = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER_SRC);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SRC);
  if (!vs || !fs) {
    if (vs) gl.deleteShader(vs);
    if (fs) gl.deleteShader(fs);
    webglStateByCanvas.set(canvas, 'unavailable');
    return null;
  }

  const program = gl.createProgram();
  if (!program) {
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    webglStateByCanvas.set(canvas, 'unavailable');
    return null;
  }

  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    webglStateByCanvas.set(canvas, 'unavailable');
    return null;
  }

  gl.useProgram(program);

  const quadBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([
      -1, -1, 0, 1,
       1, -1, 1, 1,
      -1,  1, 0, 0,
       1,  1, 1, 0,
    ]),
    gl.STATIC_DRAW
  );

  const posLoc = gl.getAttribLocation(program, 'a_position');
  const texLoc = gl.getAttribLocation(program, 'a_texCoord');
  gl.enableVertexAttribArray(posLoc);
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 16, 0);
  gl.enableVertexAttribArray(texLoc);
  gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, 16, 8);

  const yTex = createPlaneTexture(gl);
  const uTex = createPlaneTexture(gl);
  const vTex = createPlaneTexture(gl);
  if (!yTex || !uTex || !vTex) {
    if (yTex) gl.deleteTexture(yTex);
    if (uTex) gl.deleteTexture(uTex);
    if (vTex) gl.deleteTexture(vTex);
    gl.deleteProgram(program);
    webglStateByCanvas.set(canvas, 'unavailable');
    return null;
  }

  gl.uniform1i(gl.getUniformLocation(program, 'u_texY'), 0);
  gl.uniform1i(gl.getUniformLocation(program, 'u_texU'), 1);
  gl.uniform1i(gl.getUniformLocation(program, 'u_texV'), 2);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

  const state: WebGLRendererState = {
    gl,
    program,
    yTex,
    uTex,
    vTex,
    texWidth: 0,
    texHeight: 0,
  };
  webglStateByCanvas.set(canvas, state);
  return state;
}

function drawI420Frame(
  canvas: HTMLCanvasElement,
  i420: Uint8Array,
  width: number,
  height: number
): boolean {
  const yLen = width * height;
  const uvWidth = width >> 1;
  const uvHeight = height >> 1;
  const uvLen = uvWidth * uvHeight;
  if (i420.length < yLen + uvLen * 2) return false;

  const renderer = getOrCreateWebGLRenderer(canvas);
  if (renderer) {
    const { gl, program, yTex, uTex, vTex } = renderer;
    gl.useProgram(program);

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    const needsAlloc = renderer.texWidth !== width || renderer.texHeight !== height;
    if (needsAlloc) {
      gl.viewport(0, 0, width, height);
    }

    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

    const yPlane = i420.subarray(0, yLen);
    const uPlane = i420.subarray(yLen, yLen + uvLen);
    const vPlane = i420.subarray(yLen + uvLen, yLen + uvLen * 2);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, yTex);
    if (needsAlloc) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, width, height, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, yPlane);
    } else {
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height, gl.LUMINANCE, gl.UNSIGNED_BYTE, yPlane);
    }

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, uTex);
    if (needsAlloc) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, uvWidth, uvHeight, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, uPlane);
    } else {
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, uvWidth, uvHeight, gl.LUMINANCE, gl.UNSIGNED_BYTE, uPlane);
    }

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, vTex);
    if (needsAlloc) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, uvWidth, uvHeight, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, vPlane);
    } else {
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, uvWidth, uvHeight, gl.LUMINANCE, gl.UNSIGNED_BYTE, vPlane);
    }

    if (needsAlloc) {
      renderer.texWidth = width;
      renderer.texHeight = height;
    }

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return true;
  }

  // Fallback to 2D canvas + VideoFrame when WebGL context is unavailable
  if (typeof VideoFrame !== 'undefined') {
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const ctx = canvas.getContext('2d', { alpha: false });
    if (ctx) {
      const vf = new VideoFrame(i420, {
        format: 'I420',
        codedWidth: width,
        codedHeight: height,
        timestamp: Math.round(performance.now() * 1000),
        colorSpace: {
          primaries: 'bt709',
          transfer: 'bt709',
          matrix: 'bt709',
          fullRange: false,
        },
      });
      ctx.drawImage(vf, 0, 0);
      vf.close();
      return true;
    }
  }

  return false;
}

function sleepAbortable(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

export async function renderI420StreamToCanvas(
  url: string,
  canvasGetter: () => HTMLCanvasElement | null,
  signal: AbortSignal,
  onFirstFrame?: () => void
): Promise<void> {
  const headerBuf = new Uint8Array(8);
  const headerView = new DataView(headerBuf.buffer);
  let frameBuf = new Uint8Array(0);
  let firstFrameNotified = false;

  while (!signal.aborted) {
    try {
      const res = await fetch(url, { signal, cache: 'no-store' });
      if (!res.ok || !res.body) {
        if (signal.aborted) break;
        await sleepAbortable(250, signal);
        continue;
      }

      const reader = res.body.getReader();
      let headerOffset = 0;
      let frameOffset = 0;
      let frameWidth = 0;
      let frameHeight = 0;
      let frameSize = 0;

      try {
        while (!signal.aborted) {
          const { value, done } = await reader.read();
          if (done || !value) break;

          let srcOff = 0;
          while (srcOff < value.length && !signal.aborted) {
            if (headerOffset < 8) {
              const copyLen = Math.min(8 - headerOffset, value.length - srcOff);
              headerBuf.set(value.subarray(srcOff, srcOff + copyLen), headerOffset);
              headerOffset += copyLen;
              srcOff += copyLen;

              if (headerOffset === 8) {
                frameWidth = headerView.getUint32(0, true);
                frameHeight = headerView.getUint32(4, true);

                if (
                  frameWidth === 0 ||
                  frameHeight === 0 ||
                  frameWidth > 8192 ||
                  frameHeight > 8192
                ) {
                  // Corrupted stream framing; break inner loop to reconnect cleanly
                  headerOffset = 0;
                  frameSize = 0;
                  break;
                }

                frameSize = Math.floor((frameWidth * frameHeight * 3) / 2);
                if (frameBuf.length < frameSize) {
                  frameBuf = new Uint8Array(frameSize);
                }
                frameOffset = 0;
              }
            } else {
              const copyLen = Math.min(frameSize - frameOffset, value.length - srcOff);
              frameBuf.set(value.subarray(srcOff, srcOff + copyLen), frameOffset);
              frameOffset += copyLen;
              srcOff += copyLen;

              if (frameOffset === frameSize) {
                const canvas = canvasGetter();
                if (canvas) {
                  const drawn = drawI420Frame(
                    canvas,
                    frameBuf.subarray(0, frameSize),
                    frameWidth,
                    frameHeight
                  );
                  if (drawn && !firstFrameNotified) {
                    firstFrameNotified = true;
                    onFirstFrame?.();
                  }
                }
                headerOffset = 0;
                frameOffset = 0;
              }
            }
          }
        }
      } finally {
        try {
          await reader.cancel();
        } catch {}
      }
    } catch {
      if (signal.aborted) break;
    }

    if (!signal.aborted) {
      await sleepAbortable(250, signal);
    }
  }
}
