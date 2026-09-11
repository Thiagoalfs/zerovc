import {
  Room,
  RoomEvent,
  VideoPresets,
  AudioPresets,
  Track,
  Participant,
  DisconnectReason,
} from 'livekit-client';

export type GpuVendor = 'nvidia' | 'amd' | 'intel' | 'apple' | 'unknown';

export interface GpuDetectionResult {
  vendor: GpuVendor;
  name: string;
  hardwareAcceleration: boolean;
  preferredCodec: 'h264' | 'vp9' | 'vp8';
}

export async function detectGpuVendor(): Promise<GpuDetectionResult> {
  // Check user hardware acceleration preference
  const userHwSetting = typeof localStorage !== 'undefined'
    ? localStorage.getItem('zerovc_hardware_acceleration')
    : null;
  const isHwEnabledByUser = userHwSetting === null || userHwSetting === 'true';

  if (!isHwEnabledByUser) {
    console.log('[LiveKit GPU] Hardware acceleration is explicitly DISABLED by user in settings. Forcing VP8 software codec.');
    return {
      vendor: 'unknown',
      name: 'Software Fallback (GPU Acceleration Disabled)',
      hardwareAcceleration: false,
      preferredCodec: 'vp8',
    };
  }

  let detectedVendor: GpuVendor = 'unknown';
  let deviceName = 'Generic Graphics Device';
  let hwAcceleration = true;

  try {
    // 1. Electron Native GPU Info
    if (typeof window !== 'undefined' && window.electronAPI?.getGpuInfo) {
      const info = await window.electronAPI.getGpuInfo();
      const devices = info?.basic?.gpuDevice;
      if (Array.isArray(devices) && devices.length > 0) {
        for (const dev of devices) {
          const vId = dev.vendorId;
          const str = `${dev.driverVendor || ''} ${dev.deviceString || ''} ${dev.driverVersion || ''}`.toLowerCase();

          if (vId === 0x10de || str.includes('nvidia') || str.includes('geforce') || str.includes('quadro') || str.includes('rtx') || str.includes('gtx')) {
            detectedVendor = 'nvidia';
            deviceName = dev.deviceString || 'NVIDIA GPU';
            break;
          } else if (vId === 0x1002 || vId === 0x1022 || str.includes('amd') || str.includes('radeon') || str.includes('advanced micro') || str.includes('rx ')) {
            detectedVendor = 'amd';
            deviceName = dev.deviceString || 'AMD Radeon GPU';
            break;
          } else if (vId === 0x8086 || str.includes('intel') || str.includes('arc') || str.includes('iris') || str.includes('uhd')) {
            detectedVendor = 'intel';
            deviceName = dev.deviceString || 'Intel GPU';
            break;
          } else if (vId === 0x106b || str.includes('apple') || str.includes('m1') || str.includes('m2') || str.includes('m3')) {
            detectedVendor = 'apple';
            deviceName = dev.deviceString || 'Apple Silicon GPU';
            break;
          }
        }
      }
      if (info?.features) {
        hwAcceleration = info.features.video_encode === 'enabled' || info.features.video_encode === 'enabled_readback';
      }
    }

    // 2. WebGL Fallback detection (works in all modern browsers)
    if (detectedVendor === 'unknown' && typeof document !== 'undefined') {
      const canvas = document.createElement('canvas');
      const gl = (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
      if (gl) {
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        if (ext) {
          const renderer = (gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '').toLowerCase();
          if (renderer.includes('nvidia') || renderer.includes('geforce') || renderer.includes('quadro') || renderer.includes('rtx') || renderer.includes('gtx')) {
            detectedVendor = 'nvidia';
            deviceName = renderer;
          } else if (renderer.includes('amd') || renderer.includes('radeon') || renderer.includes('ati ') || renderer.includes('rx ')) {
            detectedVendor = 'amd';
            deviceName = renderer;
          } else if (renderer.includes('intel') || renderer.includes('iris') || renderer.includes('uhd') || renderer.includes('arc')) {
            detectedVendor = 'intel';
            deviceName = renderer;
          } else if (renderer.includes('apple') || renderer.includes('m1') || renderer.includes('m2') || renderer.includes('m3') || renderer.includes('metal')) {
            detectedVendor = 'apple';
            deviceName = renderer;
          }
        }
      }
    }
  } catch (e) {
    console.warn('[LiveKit] GPU Detection warning:', e);
  }

  // H.264 uses native hardware encoder on all vendors (NVENC for NVIDIA, AMF for AMD, QSV for Intel, VideoToolbox for Apple)
  const preferredCodec: 'h264' | 'vp9' | 'vp8' = hwAcceleration ? 'h264' : 'vp8';

  console.log(`[LiveKit GPU] Detected: ${detectedVendor.toUpperCase()} (${deviceName}) | Hardware Acceleration: ${hwAcceleration} | Codec: ${preferredCodec}`);

  return {
    vendor: detectedVendor,
    name: deviceName,
    hardwareAcceleration: hwAcceleration,
    preferredCodec,
  };
}

class LiveKitManager {
  private room: Room | null = null;
  private onParticipantsChanged?: (participants: Participant[]) => void;
  private onSpeakingChanged?: (speakingUserIds: string[]) => void;
  private onTrackUpdated?: () => void;
  private onScreenShareEnded?: () => void;
  private onDisconnected?: (reason?: DisconnectReason) => void;
  private attachedAudioElements: Map<string, HTMLMediaElement> = new Map();
  private attachedUserAudioElements: Map<string, HTMLMediaElement> = new Map();
  private attachedStreamAudioElements: Map<string, HTMLMediaElement> = new Map();
  private userVolumes: Map<string, number> = new Map();
  private streamVolumes: Map<string, number> = new Map();
  private watchedParticipantIdentities: Set<string> = new Set();
  private isDeafened: boolean = false;
  private activeMediaStreamTracks: Set<MediaStreamTrack> = new Set();
  // Dispositivo de saída "principal" atualmente selecionado (o que setAudioOutputDevice
  // define). É o dispositivo que a captura de áudio do sistema (screen share) vai ler.
  private currentOutputDeviceId: string | null = null;
  // Enquanto true, o áudio de microfone dos DEMAIS participantes é roteado (via setSinkId)
  // para um dispositivo de saída SECUNDÁRIO, diferente do currentOutputDeviceId. Isso evita
  // que a captura de áudio do sistema (usada ao compartilhar tela com "áudio do sistema")
  // re-capture as vozes da própria call e as retransmita como eco para quem está assistindo
  // — sem silenciar nem abaixar nada para quem está compartilhando, que continua ouvindo
  // todo mundo normalmente, só que por outra saída (ex: fone em vez de alto-falante).
  // Exige que existam 2+ dispositivos de saída de áudio no sistema; se não existir um
  // segundo dispositivo, não há como separar fisicamente "o que a pessoa ouve" de "o que é
  // capturado" — nesse caso o roteamento não é aplicado (ver pickSecondaryOutputDeviceId).
  private isRoutingCallAudioForCapture: boolean = false;

  getRoom(): Room | null {
    return this.room;
  }

  async connect(
    url: string,
    token: string,
    callbacks: {
      autoEnableMicrophone?: boolean;
      onParticipantsChanged?: (participants: Participant[]) => void;
      onSpeakingChanged?: (speakingUserIds: string[]) => void;
      onTrackUpdated?: () => void;
      onScreenShareEnded?: () => void;
      onDisconnected?: (reason?: DisconnectReason) => void;
    }
  ) {
    if (this.room) {
      await this.disconnect();
    }

    this.onParticipantsChanged = callbacks.onParticipantsChanged;
    this.onSpeakingChanged = callbacks.onSpeakingChanged;
    this.onTrackUpdated = callbacks.onTrackUpdated;
    this.onScreenShareEnded = callbacks.onScreenShareEnded;
    this.onDisconnected = callbacks.onDisconnected;

    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
      audioCaptureDefaults: {
        autoGainControl: true,
        echoCancellation: true,
        noiseSuppression: true,
      },
      videoCaptureDefaults: {
        resolution: VideoPresets.h720.resolution,
      },
    });

    this.room = room;

    const updateParticipants = () => {
      if (!this.room) return;
      const all: Participant[] = [this.room.localParticipant, ...Array.from(this.room.remoteParticipants.values())];
      this.onParticipantsChanged?.(all);
    };

    room.on(RoomEvent.Connected, async () => {
      console.log('[LiveKit] Connected to room:', room.name);
      try {
        await room.startAudio();
      } catch (err) {
        console.warn('[LiveKit] startAudio error:', err);
      }
      updateParticipants();
    });

    room.on(RoomEvent.AudioPlaybackStatusChanged, () => {
      if (!room.canPlaybackAudio) {
        room.startAudio().catch(() => {});
      }
    });

    room.on(RoomEvent.ParticipantConnected, () => {
      updateParticipants();
    });

    room.on(RoomEvent.ParticipantDisconnected, () => {
      updateParticipants();
    });

    room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
      // Filter out participants whose microphone tracks are muted or disabled
      const ids = speakers
        .filter((s) => {
          const micPub = s.getTrackPublication(Track.Source.Microphone);
          return micPub && !micPub.isMuted && micPub.isEnabled !== false;
        })
        .map((s) => s.identity);
      this.onSpeakingChanged?.(ids);
    });

    room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
      if (track.kind === Track.Kind.Audio) {
        const isScreenAudio = publication.source === Track.Source.ScreenShareAudio;
        const audioEl = track.attach();
        audioEl.id = isScreenAudio
          ? `audio-stream-${participant.identity}-${track.sid || 'audio'}`
          : `audio-user-${participant.identity}-${track.sid || 'audio'}`;
        audioEl.style.display = 'none';
        document.body.appendChild(audioEl);
        audioEl.play().catch((err) => console.log('[LiveKit] Audio play blocked:', err));

        const sid = track.sid || `${participant.identity}-${isScreenAudio ? 'screen' : 'mic'}`;
        this.attachedAudioElements.set(sid, audioEl);

        if (isScreenAudio) {
          const isCurrentlyWatched = this.watchedParticipantIdentities.has(participant.identity);
          audioEl.muted = !isCurrentlyWatched;
          this.attachedStreamAudioElements.set(sid, audioEl);
          const streamVol = this.streamVolumes.get(participant.identity) ?? 1;
          audioEl.volume = Math.min(Math.max(streamVol, 0), 1);
          if (typeof (track as any).setVolume === 'function') {
            (track as any).setVolume(streamVol);
          }
          if (isCurrentlyWatched) {
            audioEl.play().catch((err) => console.log('[LiveKit] Auto-play stream audio error:', err));
          }
        } else {
          audioEl.muted = this.isDeafened;
          this.attachedUserAudioElements.set(sid, audioEl);
          const userVol = this.userVolumes.get(participant.identity) ?? 1;
          audioEl.volume = Math.min(Math.max(userVol, 0), 1);
          if (typeof (track as any).setVolume === 'function') {
            (track as any).setVolume(userVol);
          }
          // Se o roteamento de áudio de call já estiver ativo (esse participante entrou
          // ou reconectou durante um compartilhamento de tela com áudio em andamento),
          // aplica o mesmo dispositivo secundário imediatamente a esse novo elemento.
          if (this.isRoutingCallAudioForCapture) {
            void this.applyCallAudioRouting();
          }
        }
      }
      this.onTrackUpdated?.();
      updateParticipants();
    });

    room.on(RoomEvent.TrackUnsubscribed, (track, _publication, participant) => {
      const sid = track.sid;
      if (sid) {
        const audioEl = this.attachedAudioElements.get(sid);
        if (audioEl) {
          audioEl.remove();
          this.attachedAudioElements.delete(sid);
          this.attachedUserAudioElements.delete(sid);
          this.attachedStreamAudioElements.delete(sid);
        }
      }
      track.detach().forEach((el) => el.remove());
      this.onTrackUpdated?.();
      updateParticipants();
    });

    room.on(RoomEvent.TrackMuted, () => {
      this.onTrackUpdated?.();
      updateParticipants();
    });

    room.on(RoomEvent.TrackUnmuted, () => {
      this.onTrackUpdated?.();
      updateParticipants();
    });

    room.on(RoomEvent.LocalTrackPublished, () => {
      this.onTrackUpdated?.();
      updateParticipants();
    });

    room.on(RoomEvent.LocalTrackUnpublished, () => {
      this.onTrackUpdated?.();
      updateParticipants();
    });

    room.on(RoomEvent.Disconnected, (reason) => {
      console.log('[LiveKit] Disconnected from room. Reason:', reason);
      this.attachedAudioElements.forEach((el) => el.remove());
      this.attachedAudioElements.clear();
      this.attachedUserAudioElements.clear();
      this.attachedStreamAudioElements.clear();
      this.onDisconnected?.(reason);
    });

    await room.connect(url, token, {
      autoSubscribe: true,
      maxRetries: 3,
      peerConnectionTimeout: 30000,
      websocketTimeout: 20000,
      rtcConfig: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
        ],
        iceCandidatePoolSize: 2,
        iceTransportPolicy: 'all',
      },
    });

    // Auto-enable microphone in background without blocking fast connection
    if (callbacks.autoEnableMicrophone !== false) {
      const isMobilePlatform = typeof navigator !== 'undefined' && (
        /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
        (typeof window !== 'undefined' && ((window as any).Capacitor?.isNativePlatform?.() || (window as any).Capacitor !== undefined))
      );
      const autoGain = typeof localStorage !== 'undefined' ? localStorage.getItem('zerovc_auto_gain_control') !== 'false' : true;
      const echoCanc = typeof localStorage !== 'undefined' ? localStorage.getItem('zerovc_echo_cancellation') !== 'false' : true;
      const noiseSupp = typeof localStorage !== 'undefined' ? localStorage.getItem('zerovc_noise_suppression') !== 'false' : true;
      const devId = !isMobilePlatform && typeof localStorage !== 'undefined' ? localStorage.getItem('zerovc_audio_input_device') || undefined : undefined;

      room.localParticipant.setMicrophoneEnabled(true, {
        deviceId: devId,
        autoGainControl: autoGain,
        echoCancellation: echoCanc,
        noiseSuppression: noiseSupp,
      }).catch((err) => {
        console.warn('[LiveKit] Could not auto-enable microphone:', err);
      });
    }

    updateParticipants();
    return room;
  }

  async setMicrophoneEnabled(enabled: boolean) {
    if (this.room) {
      const isMobilePlatform = typeof navigator !== 'undefined' && (
        /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
        (typeof window !== 'undefined' && ((window as any).Capacitor?.isNativePlatform?.() || (window as any).Capacitor !== undefined))
      );
      const autoGain = typeof localStorage !== 'undefined' ? localStorage.getItem('zerovc_auto_gain_control') !== 'false' : true;
      const echoCanc = typeof localStorage !== 'undefined' ? localStorage.getItem('zerovc_echo_cancellation') !== 'false' : true;
      const noiseSupp = typeof localStorage !== 'undefined' ? localStorage.getItem('zerovc_noise_suppression') !== 'false' : true;
      const devId = !isMobilePlatform && typeof localStorage !== 'undefined' ? localStorage.getItem('zerovc_audio_input_device') || undefined : undefined;

      await this.room.localParticipant.setMicrophoneEnabled(enabled, {
        deviceId: devId,
        autoGainControl: autoGain,
        echoCancellation: echoCanc,
        noiseSuppression: noiseSupp,
      });
      if (enabled) {
        this.room.startAudio().catch(() => {});
      }
    }
  }

  async setMuted(muted: boolean) {
    if (this.room) {
      await this.setMicrophoneEnabled(!muted);
    }
  }

  async setDeafened(deafened: boolean) {
    this.isDeafened = deafened;
    if (this.room) {
      // Deafen only mutes voice audio from participants; screen share audio stays audible
      this.attachedUserAudioElements.forEach((el) => {
        el.muted = deafened;
      });
      if (deafened) {
        await this.room.localParticipant.setMicrophoneEnabled(false);
      }
    }
  }

  // Escolhe um dispositivo de saída de áudio DIFERENTE do currentOutputDeviceId (o
  // dispositivo "principal", que é o que a captura de áudio do sistema vai ler ao
  // compartilhar tela). Retorna null se só existir um dispositivo de saída no sistema —
  // nesse caso não há como separar fisicamente "o que a pessoa ouve" do que é capturado.
  private async pickSecondaryOutputDeviceId(): Promise<string | null> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) return null;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const outputs = devices.filter((d) => d.kind === 'audiooutput' && d.deviceId);
      if (outputs.length < 2) return null;

      const mainId = this.currentOutputDeviceId || 'default';

      // 1) Prioriza um dispositivo salvo explicitamente pelo usuário para esse fim (ver
      // setCallAudioOutputDevice / configurações).
      const savedSecondary = typeof localStorage !== 'undefined'
        ? localStorage.getItem('zerovc_call_audio_output_device')
        : null;
      if (savedSecondary && outputs.some((d) => d.deviceId === savedSecondary) && savedSecondary !== mainId) {
        return savedSecondary;
      }

      // 2) Prioriza o papel "eCommunications" do Windows (exposto pelo Chrome como o
      // deviceId especial 'communications'), quando ele já estiver configurado no sistema
      // operacional para apontar para um hardware físico diferente do "Dispositivo Padrão"
      // ('default'). É o mesmo mecanismo que Discord/Teams usam para separar "áudio de
      // chamada" de "áudio geral", e acompanha automaticamente se a pessoa trocar o
      // dispositivo de comunicação nas configurações do Windows. groupId identifica o
      // hardware físico por trás do deviceId "mágico" — comparamos por ele, não pelo
      // deviceId em si, já que 'default'/'communications' são só ponteiros para o hardware
      // real e não têm significado físico próprio.
      const defaultEntry = outputs.find((d) => d.deviceId === 'default');
      const commsEntry = outputs.find((d) => d.deviceId === 'communications');
      if (commsEntry && defaultEntry && commsEntry.groupId && commsEntry.groupId !== defaultEntry.groupId) {
        return commsEntry.deviceId;
      }

      // 3) Sem preferência do SO disponível: pega o primeiro dispositivo físico que não
      // seja o principal (evitando também os apelidos 'default'/'communications', que não
      // são hardware por si só).
      const candidate = outputs.find((d) => d.deviceId !== mainId && d.deviceId !== 'default');
      return candidate?.deviceId ?? null;
    } catch (err) {
      console.warn('[LiveKit] Failed to enumerate output devices for call audio routing:', err);
      return null;
    }
  }

  // Aplica (ou reverte, se nenhum dispositivo secundário existir) o roteamento do áudio de
  // microfone dos demais participantes para um dispositivo de saída separado do que a
  // captura de tela está lendo. Chamado ao iniciar/parar compartilhamento de tela com áudio
  // do sistema, e sempre que o dispositivo de saída principal muda enquanto isso está ativo.
  private async applyCallAudioRouting(): Promise<void> {
    if (!this.isRoutingCallAudioForCapture) return;

    const secondaryId = await this.pickSecondaryOutputDeviceId();
    const targetSinkId = secondaryId ?? this.currentOutputDeviceId ?? '';

    if (!secondaryId) {
      console.warn(
        '[LiveKit] Only one audio output device detected — cannot route call audio away from ' +
        'what system-audio screen capture reads. This is a hardware limitation, not fixable ' +
        'in software: connect a second output device (e.g. headphones) to avoid hearing an ' +
        'echo of the call through this screen share.'
      );
    }

    for (const el of this.attachedUserAudioElements.values()) {
      if (typeof (el as any).setSinkId === 'function') {
        try {
          await (el as any).setSinkId(targetSinkId);
        } catch (err) {
          console.warn('[LiveKit] setSinkId failed for call audio element:', err);
        }
      }
    }
  }

  // Ativa/desativa o roteamento acima. `active` reflete se este usuário está publicando
  // uma track de áudio de tela (screen share com áudio do sistema) no momento.
  private async setCallAudioRoutingForCapture(active: boolean): Promise<void> {
    if (this.isRoutingCallAudioForCapture === active) return;
    this.isRoutingCallAudioForCapture = active;

    if (active) {
      await this.applyCallAudioRouting();
      return;
    }

    // Restaura todo mundo para o dispositivo de saída principal normal.
    const restoreId = this.currentOutputDeviceId ?? '';
    for (const el of this.attachedUserAudioElements.values()) {
      if (typeof (el as any).setSinkId === 'function') {
        try {
          await (el as any).setSinkId(restoreId);
        } catch (err) {
          console.warn('[LiveKit] setSinkId restore failed for call audio element:', err);
        }
      }
    }
  }

  // Permite o usuário escolher manualmente, nas configurações, qual dispositivo deve
  // receber as vozes da call durante compartilhamento de tela com áudio (em vez do
  // primeiro dispositivo secundário detectado automaticamente).
  setCallAudioOutputDevice(deviceId: string) {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('zerovc_call_audio_output_device', deviceId);
    }
    if (this.isRoutingCallAudioForCapture) {
      void this.applyCallAudioRouting();
    }
  }

  async setScreenShareEnabled(
    enabled: boolean,
    sourceId?: string,
    config?: { resolution?: '480p' | '720p' | '1080p'; fps?: 15 | 30 | 60; includeAudio?: boolean }
  ) {
    if (!this.room) return;

    if (enabled) {
      const res = config?.resolution || '720p';
      const frameRate = config?.fps || 30;

      const dims = (() => {
        switch (res) {
          case '480p': return { width: 854, height: 480 };
          case '1080p': return { width: 1920, height: 1080 };
          default: return { width: 1280, height: 720 };
        }
      })();

      // Discord-style optimized bitrate curves
      const maxBitrate = (() => {
        if (res === '480p') return frameRate === 15 ? 500_000 : frameRate === 30 ? 1_000_000 : 1_800_000;
        if (res === '1080p') return frameRate === 15 ? 2_500_000 : frameRate === 30 ? 3_500_000 : 6_000_000;
        return frameRate === 15 ? 1_200_000 : frameRate === 30 ? 1_800_000 : 3_500_000;
      })();

      const gpu = await detectGpuVendor();
      const selectedCodec = gpu.preferredCodec;

      if (sourceId && (window as any).electronAPI) {
        // Electron Screen Capture API with Hardware Accelerated WGC & Flexible Framerate constraints
        const stream = await navigator.mediaDevices.getUserMedia({
          // Audio loopback (system loopback with echo cancellation and high-fidelity music settings)
          audio: config?.includeAudio
            ? ({
                mandatory: {
                  chromeMediaSource: 'desktop',
                },
                optional: [
                  { restrictOwnAudio: true },
                  { suppressLocalAudioPlayback: true },
                  { echoCancellation: true },
                  { googEchoCancellation: true },
                  { googEchoCancellation2: true },
                  { googDAEchoCancellation: true },
                  { noiseSuppression: false },
                  { autoGainControl: false },
                  { googAutoGainControl: false },
                  { googNoiseSuppression: false },
                  { googHighpassFilter: false },
                  { googTypingNoiseDetection: false },
                  { googAudioMirroring: false },
                ],
              } as any)
            : false,
          video: {
            // @ts-ignore
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: sourceId,
              maxWidth: dims.width,
              maxHeight: dims.height,
              maxFrameRate: frameRate,
            },
            // @ts-ignore
            optional: [
              { width: { ideal: dims.width } },
              { height: { ideal: dims.height } },
              { frameRate: { ideal: frameRate } },
            ],
          },
        });

        // Register tracks for cleanup
        stream.getTracks().forEach((t) => this.activeMediaStreamTracks.add(t));

        const videoTrack = stream.getVideoTracks()[0];
        videoTrack.contentHint = frameRate >= 60 ? 'motion' : 'detail';
        videoTrack.onended = () => {
          this.setScreenShareEnabled(false);
          this.onScreenShareEnded?.();
        };

        // Cleanly stop and unpublish previous screen/audio tracks before publishing new ones (seamless switch)
        const oldScreenPub = this.room.localParticipant.getTrackPublication(Track.Source.ScreenShare);
        if (oldScreenPub?.track) {
          try { oldScreenPub.track.stop(); } catch {}
          await this.room.localParticipant.unpublishTrack(oldScreenPub.track);
        }
        const oldAudioPub = this.room.localParticipant.getTrackPublication(Track.Source.ScreenShareAudio);
        if (oldAudioPub?.track) {
          try { oldAudioPub.track.stop(); } catch {}
          await this.room.localParticipant.unpublishTrack(oldAudioPub.track);
        }

        // Publish track with backupCodec enabled for intelligent fallback (H.264 -> VP8 if GPU drops frames/crashes)
        let pub;
        try {
          pub = await this.room.localParticipant.publishTrack(videoTrack, {
            name: 'screen_share',
            source: Track.Source.ScreenShare,
            simulcast: false,
            videoCodec: selectedCodec,
            backupCodec: true,
            videoEncoding: {
              maxBitrate: maxBitrate,
              maxFramerate: frameRate,
              priority: 'high',
            },
          });
        } catch (pubErr) {
          console.warn('[LiveKit] Failed to publish screen share with preferred codec, falling back to VP8:', pubErr);
          pub = await this.room.localParticipant.publishTrack(videoTrack, {
            name: 'screen_share',
            source: Track.Source.ScreenShare,
            simulcast: false,
            videoCodec: 'vp8',
            backupCodec: false,
            videoEncoding: {
              maxBitrate: maxBitrate,
              maxFramerate: frameRate,
              priority: 'high',
            },
          });
        }

        // Publish captured system audio as dedicated high-fidelity stereo track
        const audioTrack = stream.getAudioTracks()[0];
        if (audioTrack) {
          audioTrack.onended = () => {
            const audioPub = this.room?.localParticipant.getTrackPublication(Track.Source.ScreenShareAudio);
            if (audioPub?.track) {
              this.room?.localParticipant.unpublishTrack(audioPub.track);
            }
          };
          await this.room.localParticipant.publishTrack(audioTrack, {
            name: 'screen_share_audio',
            source: Track.Source.ScreenShareAudio,
            audioPreset: AudioPresets.musicHighQualityStereo,
            dtx: false,
            red: false,
          });
          void this.setCallAudioRoutingForCapture(true);
        }

        // Set WebRTC degradationPreference to maintain-resolution with smooth adaptive framerate
        try {
          const sender = (pub?.track as any)?.sender as RTCRtpSender | undefined;
          if (sender && typeof sender.getParameters === 'function') {
            const params = sender.getParameters();
            if (params) {
              params.degradationPreference = 'maintain-resolution';
              if (params.encodings && params.encodings.length > 0) {
                params.encodings[0].maxBitrate = maxBitrate;
                params.encodings[0].maxFramerate = frameRate;
                params.encodings[0].networkPriority = 'high';
              }
              await sender.setParameters(params);
            }
          }
        } catch (e) {
          console.warn('[LiveKit] Could not set degradationPreference on sender:', e);
        }
      } else {
        // Native W3C getDisplayMedia for Web Browsers (excluding own surface to avoid infinite audio loop)
        const pub = await this.room.localParticipant.setScreenShareEnabled(
          true,
          {
            audio: {
              echoCancellation: true,
              noiseSuppression: false,
              autoGainControl: false,
              restrictOwnAudio: true,
              suppressLocalAudioPlayback: true,
              channelCount: 2,
              sampleRate: 48000,
            } as any,
            selfBrowserSurface: 'exclude',
            surfaceSwitching: 'include',
            systemAudio: 'include',
            resolution: {
              width: dims.width,
              height: dims.height,
              frameRate: frameRate,
            },
            contentHint: frameRate >= 60 ? 'motion' : 'detail',
          },
          {
            simulcast: false,
            videoCodec: selectedCodec,
            backupCodec: true,
            audioPreset: AudioPresets.musicHighQualityStereo,
            dtx: false,
            videoEncoding: {
              maxBitrate: maxBitrate,
              maxFramerate: frameRate,
              priority: 'high',
            },
          }
        );

        if (pub && pub.track) {
          try {
            const sender = (pub.track as any)?.sender as RTCRtpSender | undefined;
            if (sender && typeof sender.getParameters === 'function') {
              const params = sender.getParameters();
              if (params) {
                params.degradationPreference = 'maintain-resolution';
                if (params.encodings && params.encodings.length > 0) {
                  params.encodings[0].maxBitrate = maxBitrate;
                  params.encodings[0].maxFramerate = frameRate;
                  params.encodings[0].networkPriority = 'high';
                }
                await sender.setParameters(params);
              }
            }
          } catch (e) {
            console.warn('[LiveKit] Could not set degradationPreference on sender:', e);
          }

          const mediaStreamTrack = pub.track.mediaStreamTrack;
          if (mediaStreamTrack) {
            this.activeMediaStreamTracks.add(mediaStreamTrack);
            mediaStreamTrack.onended = () => {
              this.setScreenShareEnabled(false);
              this.onScreenShareEnded?.();
            };
          }
        }

        // O picker nativo do navegador decide se o áudio do sistema foi realmente incluído
        // (checkbox "compartilhar áudio"), então só sabemos depois de tentar publicar —
        // se existir uma publicação de ScreenShareAudio, o ducking precisa ser ativado.
        const nativeAudioPub = this.room.localParticipant.getTrackPublication(Track.Source.ScreenShareAudio);
        if (nativeAudioPub) {
          void this.setCallAudioRoutingForCapture(true);
        }
      }
    } else {
      await this.room.localParticipant.setScreenShareEnabled(false);
      const screenPub = this.room.localParticipant.getTrackPublication(Track.Source.ScreenShare);
      if (screenPub && screenPub.track) {
        try { screenPub.track.stop(); } catch {}
        this.room.localParticipant.unpublishTrack(screenPub.track);
      }

      // Limpa também a track de áudio do sistema, se estiver publicada.
      const screenAudioPub = this.room.localParticipant.getTrackPublication(Track.Source.ScreenShareAudio);
      if (screenAudioPub && screenAudioPub.track) {
        try { screenAudioPub.track.stop(); } catch {}
        this.room.localParticipant.unpublishTrack(screenAudioPub.track);
      }

      void this.setCallAudioRoutingForCapture(false);
    }

    this.onTrackUpdated?.();
  }

  async setCameraEnabled(enabled: boolean) {
    if (!this.room) return;
    const devId = typeof localStorage !== 'undefined' ? localStorage.getItem('zerovc_video_device') || undefined : undefined;
    await this.room.localParticipant.setCameraEnabled(enabled, devId ? { deviceId: { exact: devId } } : undefined);
    this.onTrackUpdated?.();
  }

  async setAudioInputDevice(deviceId: string) {
    const isMobile = typeof navigator !== 'undefined' && (
      /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
      (typeof window !== 'undefined' && ((window as any).Capacitor?.isNativePlatform?.() || (window as any).Capacitor !== undefined))
    );
    if (!this.room || isMobile) return;
    await this.room.switchActiveDevice('audioinput', deviceId);
  }

  async setAudioOutputDevice(deviceId: string) {
    const isMobile = typeof navigator !== 'undefined' && (
      /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
      (typeof window !== 'undefined' && ((window as any).Capacitor?.isNativePlatform?.() || (window as any).Capacitor !== undefined))
    );
    this.currentOutputDeviceId = deviceId;
    if (!this.room || isMobile) return;
    await this.room.switchActiveDevice('audiooutput', deviceId);
    // Se o roteamento de áudio de call estiver ativo, reavaliar: o dispositivo secundário
    // escolhido precisa continuar sendo diferente do novo dispositivo principal.
    if (this.isRoutingCallAudioForCapture) {
      await this.applyCallAudioRouting();
    }
  }

  async setVideoInputDevice(deviceId: string) {
    if (!this.room) return;
    await this.room.switchActiveDevice('videoinput', deviceId);
  }

  setUserVolume(participantIdentity: string, volume: number) {
    this.userVolumes.set(participantIdentity, volume);
    if (!this.room) return;

    // Adjust user audio elements (microphone)
    this.attachedUserAudioElements.forEach((el, key) => {
      if (key.includes(participantIdentity) || el.id.includes(participantIdentity)) {
        el.volume = Math.min(Math.max(volume, 0), 1);
      }
    });

    const remote = this.room.remoteParticipants.get(participantIdentity);
    if (remote) {
      // Find microphone audio track
      remote.audioTrackPublications.forEach((pub) => {
        if (pub.source === Track.Source.Microphone && pub.audioTrack) {
          if (typeof (pub.audioTrack as any).setVolume === 'function') {
            (pub.audioTrack as any).setVolume(volume);
          }
        }
      });
    }
  }

  setStreamVolume(participantIdentity: string, volume: number) {
    this.streamVolumes.set(participantIdentity, volume);
    if (!this.room) return;

    // Adjust screen share audio elements
    this.attachedStreamAudioElements.forEach((el, key) => {
      if (key.includes(participantIdentity) || el.id.includes(participantIdentity)) {
        el.volume = Math.min(Math.max(volume, 0), 1);
      }
    });

    const remote = this.room.remoteParticipants.get(participantIdentity);
    if (remote) {
      // Find screen share audio track
      remote.audioTrackPublications.forEach((pub) => {
        if (pub.source === Track.Source.ScreenShareAudio && pub.audioTrack) {
          if (typeof (pub.audioTrack as any).setVolume === 'function') {
            (pub.audioTrack as any).setVolume(volume);
          }
        }
      });
    }
  }

  setStreamAudioSubscribed(participantIdentity: string, subscribed: boolean) {
    if (subscribed) {
      this.watchedParticipantIdentities.add(participantIdentity);
    } else {
      this.watchedParticipantIdentities.delete(participantIdentity);
    }

    // 1. Mute or unmute all stream audio elements for this participant
    this.attachedStreamAudioElements.forEach((el, key) => {
      if (key.includes(participantIdentity) || el.id.includes(participantIdentity)) {
        el.muted = !subscribed;
        if (subscribed) {
          const streamVol = this.streamVolumes.get(participantIdentity) ?? 1;
          el.volume = Math.min(Math.max(streamVol, 0), 1);
          el.play().catch((err) => console.log('[LiveKit] Stream audio play error:', err));
        }
      }
    });

    // 2. Adjust subscription on remote participant track publication if applicable
    if (this.room) {
      const remote = this.room.remoteParticipants.get(participantIdentity);
      if (remote) {
        remote.audioTrackPublications.forEach((pub) => {
          if (pub.source === Track.Source.ScreenShareAudio) {
            pub.setSubscribed(subscribed);
            if (pub.audioTrack) {
              const streamVol = this.streamVolumes.get(participantIdentity) ?? 1;
              if (typeof (pub.audioTrack as any).setVolume === 'function') {
                (pub.audioTrack as any).setVolume(streamVol);
              }
            }
          }
        });
      }
    }
  }

  setParticipantVolume(participantIdentity: string, volume: number) {
    this.setUserVolume(participantIdentity, volume);
  }

  async disconnect() {
    this.watchedParticipantIdentities.clear();
    this.attachedAudioElements.forEach((el) => el.remove());
    this.attachedAudioElements.clear();
    this.attachedUserAudioElements.clear();
    this.attachedStreamAudioElements.clear();

    // Stop and unpublish all local tracks
    if (this.room?.localParticipant) {
      for (const pub of this.room.localParticipant.trackPublications.values()) {
        try {
          pub.track?.stop();
        } catch {}
        if (pub.track) {
          try {
            await this.room.localParticipant.unpublishTrack(pub.track);
          } catch {}
        }
      }
    }

    // Clean up any remaining native MediaStreamTracks
    this.activeMediaStreamTracks.forEach((track) => {
      try {
        track.stop();
      } catch {}
    });
    this.activeMediaStreamTracks.clear();

    if (this.room) {
      await this.room.disconnect();
      this.room = null;
    }
  }
}

export const livekit = new LiveKitManager();