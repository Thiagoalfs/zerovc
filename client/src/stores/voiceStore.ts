import { create } from 'zustand';
import { Participant } from 'livekit-client';
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
  participantVolumes: Record<string, number>;
  watchedParticipantId: string | null;

  setWatchedParticipant: (identity: string | null) => void;
  joinVoice: (channelId: string) => Promise<void>;
  leaveVoice: () => Promise<void>;
  toggleMute: () => Promise<void>;
  toggleDeafen: () => Promise<void>;
  toggleCamera: () => Promise<void>;
  setParticipantVolume: (userId: string, volume: number) => void;
  startScreenShare: (
    sourceId?: string,
    config?: { resolution?: '480p' | '720p' | '1080p'; fps?: 15 | 30 | 60 }
  ) => Promise<void>;
  stopScreenShare: () => Promise<void>;
}

const loadSavedVolumes = (): Record<string, number> => {
  try {
    const raw = localStorage.getItem('zerovc_user_volumes');
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

const saveVolumesToStorage = (volumes: Record<string, number>) => {
  try {
    localStorage.setItem('zerovc_user_volumes', JSON.stringify(volumes));
  } catch {}
};

export const useVoiceStore = create<VoiceState>((set, get) => ({
  currentChannelId: null,
  isConnected: false,
  isConnecting: false,
  isMuted: false,
  isDeafened: false,
  isScreensharing: false,
  isCameraOn: false,
  participants: [],
  speakingUserIds: [],
  participantVolumes: loadSavedVolumes(),
  watchedParticipantId: null,

  setWatchedParticipant: (identity: string | null) => {
    set({ watchedParticipantId: identity });
  },

  joinVoice: async (channelId: string) => {
    if (get().currentChannelId === channelId && get().isConnected) return;

    if (get().currentChannelId) {
      await get().leaveVoice();
    }

    set({ isConnecting: true, currentChannelId: channelId });

    try {
      const res = await api.channels.joinVoice(channelId);

      await livekit.connect(res.livekit_url, res.token, {
        onParticipantsChanged: (participants) => {
          set({ participants });
          // Apply saved volumes to participants
          const savedVolumes = get().participantVolumes;
          participants.forEach((p) => {
            if (!p.isLocal && savedVolumes[p.identity] !== undefined) {
              livekit.setParticipantVolume(p.identity, savedVolumes[p.identity]);
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
            const savedVolumes = get().participantVolumes;
            participants.forEach((p) => {
              if (!p.isLocal && savedVolumes[p.identity] !== undefined) {
                livekit.setParticipantVolume(p.identity, savedVolumes[p.identity]);
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
      });

      playJoinVoiceSound();
      const isPTT = localStorage.getItem('zerovc_input_mode') === 'ptt';
      if (isPTT) {
        await livekit.setMuted(true);
      }
      set({ isConnected: true, isConnecting: false, isMuted: isPTT, isCameraOn: false });
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
    const { isMuted, currentChannelId } = get();
    const nextMuted = !isMuted;

    await livekit.setMuted(nextMuted);
    set({ isMuted: nextMuted });

    if (currentChannelId) {
      try {
        await api.channels.updateVoiceState(currentChannelId, { is_muted: nextMuted });
      } catch (err) {
        console.warn('[Voice] Failed to sync mute state:', err);
      }
    }
  },

  toggleDeafen: async () => {
    const { isDeafened, currentChannelId } = get();
    const nextDeafened = !isDeafened;

    await livekit.setDeafened(nextDeafened);
    set({ isDeafened: nextDeafened, isMuted: nextDeafened ? true : get().isMuted });

    if (currentChannelId) {
      try {
        await api.channels.updateVoiceState(currentChannelId, {
          is_deafened: nextDeafened,
          is_muted: nextDeafened ? true : get().isMuted,
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

  setParticipantVolume: (userId: string, volume: number) => {
    livekit.setParticipantVolume(userId, volume);
    const updated = {
      ...get().participantVolumes,
      [userId]: volume,
    };
    saveVolumesToStorage(updated);
    set({ participantVolumes: updated });
  },

  startScreenShare: async (sourceId?: string, config?: { resolution?: '480p' | '720p' | '1080p'; fps?: 15 | 30 | 60 }) => {
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
