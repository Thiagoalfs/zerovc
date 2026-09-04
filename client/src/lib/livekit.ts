import {
  Room,
  RoomEvent,
  VideoPresets,
  Track,
  Participant,
  DisconnectReason,
} from 'livekit-client';

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
      const ids = speakers.map((s) => s.identity);
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
          audioEl.muted = true; // Initially muted until user explicitly watches this stream!
          this.attachedStreamAudioElements.set(sid, audioEl);
          const streamVol = this.streamVolumes.get(participant.identity) ?? 1;
          audioEl.volume = Math.min(Math.max(streamVol, 0), 1);
          if (typeof (track as any).setVolume === 'function') {
            (track as any).setVolume(streamVol);
          }
        } else {
          audioEl.muted = false;
          this.attachedUserAudioElements.set(sid, audioEl);
          const userVol = this.userVolumes.get(participant.identity) ?? 1;
          audioEl.volume = Math.min(Math.max(userVol, 0), 1);
          if (typeof (track as any).setVolume === 'function') {
            (track as any).setVolume(userVol);
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

    await room.connect(url, token);

    // Auto-enable and publish microphone track on connect if not disabled
    if (callbacks.autoEnableMicrophone !== false) {
      try {
        await room.localParticipant.setMicrophoneEnabled(true);
      } catch (err) {
        console.warn('[LiveKit] Could not auto-enable microphone:', err);
      }
    }

    updateParticipants();
    return room;
  }

  async setMicrophoneEnabled(enabled: boolean) {
    if (this.room) {
      await this.room.localParticipant.setMicrophoneEnabled(enabled);
      if (enabled) {
        this.room.startAudio().catch(() => {});
      }
    }
  }

  async setMuted(muted: boolean) {
    if (this.room) {
      await this.room.localParticipant.setMicrophoneEnabled(!muted);
    }
  }

  async setDeafened(deafened: boolean) {
    if (this.room) {
      this.attachedAudioElements.forEach((el) => {
        el.muted = deafened;
      });
      if (deafened) {
        await this.room.localParticipant.setMicrophoneEnabled(false);
      }
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

      const maxBitrate = (() => {
        if (res === '480p') return frameRate === 15 ? 600_000 : frameRate === 30 ? 1_200_000 : 2_000_000;
        if (res === '1080p') return frameRate === 15 ? 3_000_000 : frameRate === 30 ? 6_000_000 : 10_000_000;
        return frameRate === 15 ? 1_500_000 : frameRate === 30 ? 3_000_000 : 5_500_000;
      })();

      if (sourceId && (window as any).electronAPI) {
        // Electron Screen Capture API with Hardware Accelerated WGC & Framerate constraints
        const stream = await navigator.mediaDevices.getUserMedia({
          // Áudio do sistema (loopback) via a mesma API legada do Electron.
          // Funciona de forma confiável só no Windows — é limitação do Chromium/Electron,
          // não do nosso código. No macOS/Linux normalmente vem sem faixa de áudio.
          audio: config?.includeAudio
            ? ({
                mandatory: {
                  chromeMediaSource: 'desktop',
                },
              } as any)
            : false,
          video: {
            // @ts-ignore
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: sourceId,
              minWidth: dims.width,
              maxWidth: dims.width,
              minHeight: dims.height,
              maxHeight: dims.height,
              minFrameRate: frameRate,
              maxFrameRate: frameRate,
            },
          },
        });

        const videoTrack = stream.getVideoTracks()[0];
        videoTrack.contentHint = frameRate >= 60 ? 'motion' : 'detail';
        videoTrack.onended = () => {
          this.setScreenShareEnabled(false);
          this.onScreenShareEnded?.();
        };

        const pub = await this.room.localParticipant.publishTrack(videoTrack, {
          name: 'screen_share',
          source: Track.Source.ScreenShare,
          simulcast: true,
          videoEncoding: {
            maxBitrate: maxBitrate,
            maxFramerate: frameRate,
            priority: 'high',
          },
        });

        // Publica o áudio do sistema (se capturado) como track separada,
        // igual ao que o player já espera via Track.Source.ScreenShareAudio.
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
          });
        }

        // Set WebRTC degradationPreference to maintain 60 FPS or detail
        try {
          const sender = (pub?.track as any)?.sender as RTCRtpSender | undefined;
          if (sender && typeof sender.getParameters === 'function') {
            const params = sender.getParameters();
            if (params) {
              params.degradationPreference = frameRate >= 60 ? 'maintain-framerate' : 'maintain-resolution';
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
        // Native W3C getDisplayMedia for Web Browsers
        const pub = await this.room.localParticipant.setScreenShareEnabled(
          true,
          {
            audio: true,
            selfBrowserSurface: 'include',
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
            simulcast: true,
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
                params.degradationPreference = frameRate >= 60 ? 'maintain-framerate' : 'maintain-resolution';
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
            mediaStreamTrack.onended = () => {
              this.setScreenShareEnabled(false);
              this.onScreenShareEnded?.();
            };
          }
        }
      }
    } else {
      await this.room.localParticipant.setScreenShareEnabled(false);
      const screenPub = this.room.localParticipant.getTrackPublication(Track.Source.ScreenShare);
      if (screenPub && screenPub.track) {
        this.room.localParticipant.unpublishTrack(screenPub.track);
      }

      // Limpa também a track de áudio do sistema, se estiver publicada.
      const screenAudioPub = this.room.localParticipant.getTrackPublication(Track.Source.ScreenShareAudio);
      if (screenAudioPub && screenAudioPub.track) {
        this.room.localParticipant.unpublishTrack(screenAudioPub.track);
      }
    }

    this.onTrackUpdated?.();
  }

  async setCameraEnabled(enabled: boolean) {
    if (!this.room) return;
    await this.room.localParticipant.setCameraEnabled(enabled);
    this.onTrackUpdated?.();
  }

  async setAudioInputDevice(deviceId: string) {
    if (!this.room) return;
    await this.room.switchActiveDevice('audioinput', deviceId);
  }

  async setAudioOutputDevice(deviceId: string) {
    if (!this.room) return;
    await this.room.switchActiveDevice('audiooutput', deviceId);
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
    // 1. Mute or unmute all stream audio elements for this participant
    this.attachedStreamAudioElements.forEach((el, key) => {
      if (key.includes(participantIdentity) || el.id.includes(participantIdentity)) {
        el.muted = !subscribed;
      }
    });

    // 2. Adjust subscription on remote participant track publication if applicable
    if (this.room) {
      const remote = this.room.remoteParticipants.get(participantIdentity);
      if (remote) {
        remote.audioTrackPublications.forEach((pub) => {
          if (pub.source === Track.Source.ScreenShareAudio) {
            pub.setSubscribed(subscribed);
          }
        });
      }
    }
  }

  setParticipantVolume(participantIdentity: string, volume: number) {
    this.setUserVolume(participantIdentity, volume);
  }

  async disconnect() {
    this.attachedAudioElements.forEach((el) => el.remove());
    this.attachedAudioElements.clear();
    this.attachedUserAudioElements.clear();
    this.attachedStreamAudioElements.clear();

    if (this.room) {
      await this.room.disconnect();
      this.room = null;
    }
  }
}

export const livekit = new LiveKitManager();