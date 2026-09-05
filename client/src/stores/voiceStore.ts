import { create } from 'zustand';
import { Participant, DisconnectReason } from 'livekit-client';
import { api } from '../lib/api';
import { livekit } from '../lib/livekit';
import { playJoinVoiceSound, playLeaveVoiceSound } from '../utils/audio';

interface VoiceState {
  currentChannelId: string | null;
  isConnected: boolean;
  isConnecting: boolean;
  isMuted: boolean;
  isDeafened: boolean;
  isScreensharing: boolean;
  isCameraOn: boolean;
  participants: Participant[];
  speakingUserIds: string[];
  userVolumes: Record<string, number>;
  streamVolumes: Record<string, number>;
  participantVolumes: Record<string, number>;
  watchedParticipantId: string | null;

  setWatchedParticipant: (identity: string | null) => void;
  joinVoice: (channelId: string) => Promise<void>;
  leaveVoice: () => Promise<void>;
  toggleMute: () => Promise<void>;
  toggleDeafen: () => Promise<void>;
  toggleCamera: () => Promise<void>;
  setUserVolume: (userId: string, volume: number) => void;
  setStreamVolume: (userId: string, volume: number) => void;
  setParticipantVolume: (userId: string, volume: number) => void;
  startScreenShare: (
    sourceId?: string,
    config?: { resolution?: '480p' | '720p' | '1080p'; fps?: 15 | 30 | 60; includeAudio?: boolean }
  ) => Promise<void>;
  stopScreenShare: () => Promise<void>;
}

const loadSavedUserVolumes = (): Record<string, number> => {
  try {
    const raw = localStorage.getItem('zerovc_user_volumes');
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

const loadSavedStreamVolumes = (): Record<string, number> => {
  try {
    const raw = localStorage.getItem('zerovc_stream_volumes');
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

const loadSavedMuteState = (): boolean => {
  try {
    return localStorage.getItem('zerovc_user_muted') === 'true';
  } catch {
    return false;
  }
};

const loadSavedDeafenState = (): boolean => {
  try {
    return localStorage.getItem('zerovc_user_deafened') === 'true';
  } catch {
    return false;
  }
};

const saveUserVolumesToStorage = (volumes: Record<string, number>) => {
  try {
    localStorage.setItem('zerovc_user_volumes', JSON.stringify(volumes));
  } catch {}
};

const saveStreamVolumesToStorage = (volumes: Record<string, number>) => {
  try {
    localStorage.setItem('zerovc_stream_volumes', JSON.stringify(volumes));
  } catch {}
};

const initialUserVolumes = loadSavedUserVolumes();
const initialStreamVolumes = loadSavedStreamVolumes();
const initialMuted = loadSavedMuteState();
const initialDeafened = loadSavedDeafenState();

export const useVoiceStore = create<VoiceState>((set, get) => ({
  currentChannelId: null,
  isConnected: false,
  isConnecting: false,
  isMuted: initialMuted || initialDeafened,
  isDeafened: initialDeafened,
  isScreensharing: false,
  isCameraOn: false,
  participants: [],
  speakingUserIds: [],
  userVolumes: initialUserVolumes,
  streamVolumes: initialStreamVolumes,
  participantVolumes: initialUserVolumes,
  watchedParticipantId: null,

  setWatchedParticipant: (identity: string | null) => {
    set({ watchedParticipantId: identity });
  },

  joinVoice: async (channelId: string) => {
    // If already in this channel or currently connecting to it, do nothing
    if (get().currentChannelId === channelId && (get().isConnected || get().isConnecting)) {
      return;
    }

    const previousChannelId = get().currentChannelId;
    if (previousChannelId && previousChannelId !== channelId) {
      // Disconnect previous channel in background without blocking current join request
      api.channels.leaveVoice(previousChannelId).catch(() => {});
      livekit.disconnect().catch(() => {});
    }

    set({ isConnecting: true, currentChannelId: channelId });

    try {
      const res = await api.channels.joinVoice(channelId);

      // Check if user changed mind or joined another channel while requesting
      if (get().currentChannelId !== channelId) return;

      const isPTT = localStorage.getItem('zerovc_input_mode') === 'ptt';
      const shouldDeafen = get().isDeafened;
      const shouldMute = shouldDeafen || isPTT || get().isMuted;

      await livekit.connect(res.livekit_url, res.token, {
        autoEnableMicrophone: !shouldMute,
        onParticipantsChanged: (participants) => {
          set({ participants });
          // Apply saved user & stream volumes to participants
          const { userVolumes, streamVolumes } = get();
          participants.forEach((p) => {
            if (!p.isLocal) {
              if (userVolumes[p.identity] !== undefined) {
                livekit.setUserVolume(p.identity, userVolumes[p.identity]);
              }
              if (streamVolumes[p.identity] !== undefined) {
                livekit.setStreamVolume(p.identity, streamVolumes[p.identity]);
              }
            }
          });
        },
        onSpeakingChanged: (speakingUserIds) => {
          set({ speakingUserIds });
        },
        onTrackUpdated: () => {
          const room = livekit.getRoom();
          if (room) {
            const participants = [room.localParticipant, ...Array.from(room.remoteParticipants.values())];
            set({ participants });
            const { userVolumes, streamVolumes } = get();
            participants.forEach((p) => {
              if (!p.isLocal) {
                if (userVolumes[p.identity] !== undefined) {
                  livekit.setUserVolume(p.identity, userVolumes[p.identity]);
                }
                if (streamVolumes[p.identity] !== undefined) {
                  livekit.setStreamVolume(p.identity, streamVolumes[p.identity]);
                }
              }
            });
          }
        },
        onScreenShareEnded: () => {
          set({ isScreensharing: false });
          const { currentChannelId } = get();
          if (currentChannelId) {
            api.channels.updateVoiceState(currentChannelId, { is_screensharing: false }).catch(() => {});
          }
        },
        onDisconnected: (reason) => {
          console.warn('[Voice] LiveKit room disconnected. Reason:', reason);
          playLeaveVoiceSound();
          const isDuplicate = reason === DisconnectReason.DUPLICATE_IDENTITY || String(reason).toLowerCase().includes('duplicate');
          
          set({
            currentChannelId: null,
            isConnected: false,
            isConnecting: false,
            isScreensharing: false,
            isCameraOn: false,
            participants: [],
            speakingUserIds: [],
            watchedParticipantId: null,
          });

          if (isDuplicate) {
            alert('Você entrou na chamada por outro dispositivo ou navegador.');
          }
        },
      });

      playJoinVoiceSound();

      if (shouldDeafen) {
        livekit.setDeafened(true).catch(() => {});
        livekit.setMuted(true).catch(() => {});
      } else if (shouldMute) {
        livekit.setMuted(true).catch(() => {});
      }

      set({
        isConnected: true,
        isConnecting: false,
        isMuted: shouldMute,
        isDeafened: shouldDeafen,
        isCameraOn: false,
      });

      // Sync initial voice state with backend
      if (shouldMute || shouldDeafen) {
        api.channels.updateVoiceState(channelId, {
          is_muted: shouldMute,
          is_deafened: shouldDeafen,
        }).catch(() => {});
      }
    } catch (err) {
      console.error('[Voice] Failed to join voice:', err);
      set({ isConnected: false, isConnecting: false, currentChannelId: null });
    }
  },

  leaveVoice: async () => {
    const { currentChannelId } = get();
    if (!currentChannelId) return;

    try {
      await api.channels.leaveVoice(currentChannelId);
    } catch (err) {
      console.warn('[Voice] Failed to notify leave API:', err);
    }

    playLeaveVoiceSound();
    await livekit.disconnect();
    set({
      currentChannelId: null,
      isConnected: false,
      isConnecting: false,
      isScreensharing: false,
      isCameraOn: false,
      participants: [],
      speakingUserIds: [],
      watchedParticipantId: null,
    });
  },

  toggleMute: async () => {
    const { isMuted, isDeafened, currentChannelId } = get();
    const nextMuted = !isMuted;
    const nextDeafened = nextMuted ? isDeafened : false;

    try {
      localStorage.setItem('zerovc_user_muted', String(nextMuted));
      localStorage.setItem('zerovc_user_deafened', String(nextDeafened));
    } catch {}

    await livekit.setMuted(nextMuted);
    if (!nextMuted && isDeafened) {
      await livekit.setDeafened(false);
    }

    set({ isMuted: nextMuted, isDeafened: nextDeafened });

    if (currentChannelId) {
      try {
        await api.channels.updateVoiceState(currentChannelId, {
          is_muted: nextMuted,
          is_deafened: nextDeafened,
        });
      } catch (err) {
        console.warn('[Voice] Failed to sync mute state:', err);
      }
    }
  },

  toggleDeafen: async () => {
    const { isDeafened, currentChannelId } = get();
    const nextDeafened = !isDeafened;
    const nextMuted = nextDeafened ? true : get().isMuted;

    try {
      localStorage.setItem('zerovc_user_deafened', String(nextDeafened));
      if (nextDeafened) {
        localStorage.setItem('zerovc_user_muted', 'true');
      }
    } catch {}

    await livekit.setDeafened(nextDeafened);
    set({ isDeafened: nextDeafened, isMuted: nextMuted });

    if (currentChannelId) {
      try {
        await api.channels.updateVoiceState(currentChannelId, {
          is_deafened: nextDeafened,
          is_muted: nextMuted,
        });
      } catch (err) {
        console.warn('[Voice] Failed to sync deafen state:', err);
      }
    }
  },

  toggleCamera: async () => {
    const { isCameraOn } = get();
    const nextCamera = !isCameraOn;
    await livekit.setCameraEnabled(nextCamera);
    set({ isCameraOn: nextCamera });
  },

  setUserVolume: (userId: string, volume: number) => {
    livekit.setUserVolume(userId, volume);
    const updated = {
      ...get().userVolumes,
      [userId]: volume,
    };
    saveUserVolumesToStorage(updated);
    set({ userVolumes: updated, participantVolumes: updated });
  },

  setStreamVolume: (userId: string, volume: number) => {
    livekit.setStreamVolume(userId, volume);
    const updated = {
      ...get().streamVolumes,
      [userId]: volume,
    };
    saveStreamVolumesToStorage(updated);
    set({ streamVolumes: updated });
  },

  setParticipantVolume: (userId: string, volume: number) => {
    get().setUserVolume(userId, volume);
  },

  startScreenShare: async (sourceId?: string, config?: { resolution?: '480p' | '720p' | '1080p'; fps?: 15 | 30 | 60; includeAudio?: boolean }) => {
    const { currentChannelId } = get();
    try {
      await livekit.setScreenShareEnabled(true, sourceId, config);
      set({ isScreensharing: true });

      if (currentChannelId) {
        api.channels.updateVoiceState(currentChannelId, { is_screensharing: true }).catch(() => {});
      }
    } catch (err) {
      console.error('[Voice] Failed to start screen share:', err);
      set({ isScreensharing: false });
    }
  },

  stopScreenShare: async () => {
    const { currentChannelId } = get();
    try {
      await livekit.setScreenShareEnabled(false);
      set({ isScreensharing: false });

      if (currentChannelId) {
        api.channels.updateVoiceState(currentChannelId, { is_screensharing: false }).catch(() => {});
      }
    } catch (err) {
      console.error('[Voice] Failed to stop screen share:', err);
    }
  },
}));