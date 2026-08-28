import { create } from 'zustand';
import { Participant } from 'livekit-client';
import { api } from '../lib/api';
import { livekit } from '../lib/livekit';

interface VoiceState {
  currentChannelId: string | null;
  isConnected: boolean;
  isConnecting: boolean;
  isMuted: boolean;
  isDeafened: boolean;
  isScreensharing: boolean;
  participants: Participant[];
  speakingUserIds: string[];

  joinVoice: (channelId: string) => Promise<void>;
  leaveVoice: () => Promise<void>;
  toggleMute: () => Promise<void>;
  toggleDeafen: () => Promise<void>;
  startScreenShare: (sourceId: string) => Promise<void>;
  stopScreenShare: () => Promise<void>;
}

export const useVoiceStore = create<VoiceState>((set, get) => ({
  currentChannelId: null,
  isConnected: false,
  isConnecting: false,
  isMuted: false,
  isDeafened: false,
  isScreensharing: false,
  participants: [],
  speakingUserIds: [],

  joinVoice: async (channelId: string) => {
    // If already in this channel, do nothing
    if (get().currentChannelId === channelId && get().isConnected) return;

    // If in another channel, leave it first
    if (get().currentChannelId) {
      await get().leaveVoice();
    }

    set({ isConnecting: true, currentChannelId: channelId });

    try {
      const res = await api.channels.joinVoice(channelId);

      await livekit.connect(res.livekit_url, res.token, {
        onParticipantsChanged: (participants) => {
          set({ participants });
        },
        onSpeakingChanged: (speakingUserIds) => {
          set({ speakingUserIds });
        },
        onTrackUpdated: () => {
          // Force update participants list to reflect tracks
          const room = livekit.getRoom();
          if (room) {
            set({
              participants: [room.localParticipant, ...Array.from(room.remoteParticipants.values())],
            });
          }
        },
      });

      set({ isConnected: true, isConnecting: false, isMuted: false });
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

    await livekit.disconnect();
    set({
      currentChannelId: null,
      isConnected: false,
      isConnecting: false,
      isScreensharing: false,
      participants: [],
      speakingUserIds: [],
    });
  },

  toggleMute: async () => {
    const { isMuted, currentChannelId } = get();
    const newMuted = !isMuted;
    set({ isMuted: newMuted });

    await livekit.setMicrophoneEnabled(!newMuted);

    if (currentChannelId) {
      api.channels.updateVoiceState(currentChannelId, { is_muted: newMuted }).catch(() => {});
    }
  },

  toggleDeafen: async () => {
    const { isDeafened, currentChannelId } = get();
    const newDeafened = !isDeafened;
    set({ isDeafened: newDeafened, isMuted: newDeafened ? true : get().isMuted });

    if (newDeafened) {
      await livekit.setMicrophoneEnabled(false);
    } else {
      await livekit.setMicrophoneEnabled(!get().isMuted);
    }

    if (currentChannelId) {
      api.channels.updateVoiceState(currentChannelId, {
        is_deafened: newDeafened,
        is_muted: get().isMuted,
      }).catch(() => {});
    }
  },

  startScreenShare: async (sourceId: string) => {
    const { currentChannelId } = get();
    try {
      await livekit.setScreenShareEnabled(true, sourceId);
      set({ isScreensharing: true });

      if (currentChannelId) {
        api.channels.updateVoiceState(currentChannelId, { is_screensharing: true }).catch(() => {});
      }
    } catch (err) {
      console.error('[Voice] Failed to start screen share:', err);
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
