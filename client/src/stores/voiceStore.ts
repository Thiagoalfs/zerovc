import { create } from 'zustand';
import { Participant, DisconnectReason } from 'livekit-client';
import { api } from '../lib/api';
import { livekit } from '../lib/livekit';
import {
  playJoinVoiceSound,
  playLeaveVoiceSound,
  playUserJoinCallSound,
  playUserLeaveCallSound,
  playStartStreamSound,
  playStopStreamSound,
  playMuteSound,
  playUnmuteSound,
  playDeafenSound,
  playUndeafenSound,
} from '../utils/audio';

interface VoiceState {
  currentChannelId: string | null;
  currentGuildId: string | null;
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
  watchedParticipantIds: string[];

  watchParticipant: (identity: string, mode?: 'exclusive' | 'additive') => void;
  unwatchParticipant: (identity: string) => void;
  toggleWatchParticipant: (identity: string) => void;
  unwatchAll: () => void;
  setWatchedParticipant: (identity: string | null) => void;
  joinVoice: (channelId: string, guildId?: string) => Promise<void>;
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
  currentGuildId: null,
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
  watchedParticipantIds: [],

  watchParticipant: (identity: string, mode: 'exclusive' | 'additive' = 'exclusive') => {
    const current = get().watchedParticipantIds;
    if (mode === 'exclusive') {
      current.forEach((id) => {
        if (id !== identity) {
          livekit.setStreamSubscribed(id, false);
        }
      });
      livekit.setStreamSubscribed(identity, true);
      set({
        watchedParticipantIds: [identity],
        watchedParticipantId: identity,
      });
    } else {
      if (!current.includes(identity)) {
        livekit.setStreamSubscribed(identity, true);
        const next = [...current, identity];
        set({
          watchedParticipantIds: next,
          watchedParticipantId: identity,
        });
      }
    }
  },

  unwatchParticipant: (identity: string) => {
    const current = get().watchedParticipantIds;
    livekit.setStreamSubscribed(identity, false);
    const next = current.filter((id) => id !== identity);
    set({
      watchedParticipantIds: next,
      watchedParticipantId: next.length > 0 ? next[next.length - 1] : null,
    });
  },

  toggleWatchParticipant: (identity: string) => {
    const current = get().watchedParticipantIds;
    if (current.includes(identity)) {
      get().unwatchParticipant(identity);
    } else {
      get().watchParticipant(identity, 'additive');
    }
  },

  unwatchAll: () => {
    const current = get().watchedParticipantIds;
    current.forEach((id) => {
      livekit.setStreamSubscribed(id, false);
    });
    set({
      watchedParticipantIds: [],
      watchedParticipantId: null,
    });
  },

  setWatchedParticipant: (identity: string | null) => {
    if (!identity) {
      get().unwatchAll();
    } else {
      get().watchParticipant(identity, 'exclusive');
    }
  },

  joinVoice: async (channelId: string, guildId?: string) => {
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

    set({ isConnecting: true, currentChannelId: channelId, currentGuildId: guildId || null });

    const isPTT = localStorage.getItem('zerovc_input_mode') === 'ptt';
    const shouldDeafen = get().isDeafened;
    const shouldMute = shouldDeafen || isPTT || get().isMuted;

    try {
      const res = await api.channels.joinVoice(channelId, {
        is_muted: shouldMute,
        is_deafened: shouldDeafen,
      });

      // Check if user changed mind or joined another channel while requesting
      if (get().currentChannelId !== channelId) return;

      let prevParticipantIds = new Set<string>();
      let prevScreenShareIds = new Set<string>();
      let isInitialSync = true;

      await livekit.connect(res.livekit_url, res.token, {
        autoEnableMicrophone: !shouldMute,
        onParticipantsChanged: (participants) => {
          set({ participants });

          if (!isInitialSync && get().isConnected) {
            const currentIds = new Set(participants.map((p) => p.identity));
            // Another user joined
            for (const p of participants) {
              if (!p.isLocal && !prevParticipantIds.has(p.identity)) {
                playUserJoinCallSound();
                break;
              }
            }
            // Another user left
            for (const prevId of prevParticipantIds) {
              if (!currentIds.has(prevId)) {
                playUserLeaveCallSound();
                break;
              }
            }
          }
          prevParticipantIds = new Set(participants.map((p) => p.identity));

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
          const current = get().speakingUserIds;
          if (
            current.length === speakingUserIds.length &&
            current.every((id, idx) => id === speakingUserIds[idx])
          ) {
            return;
          }
          set({ speakingUserIds });
        },
        onTrackUpdated: () => {
          const room = livekit.getRoom();
          if (room) {
            const participants = [room.localParticipant, ...Array.from(room.remoteParticipants.values())];
            set({ participants });

            const currentScreenShares = new Set(
              participants.filter((p) => p.isScreenShareEnabled).map((p) => p.identity)
            );

            if (!isInitialSync && get().isConnected) {
              // Screen share started
              for (const id of currentScreenShares) {
                if (!prevScreenShareIds.has(id)) {
                  playStartStreamSound();
                  break;
                }
              }
              // Screen share stopped
              for (const prevId of prevScreenShareIds) {
                if (!currentScreenShares.has(prevId)) {
                  playStopStreamSound();
                  break;
                }
              }
            }
            prevScreenShareIds = currentScreenShares;

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
          playStopStreamSound();
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
            watchedParticipantIds: [],
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

      setTimeout(() => {
        isInitialSync = false;
      }, 500);

      // Sync initial voice state with backend
      if (shouldMute || shouldDeafen) {
        api.channels.updateVoiceState(channelId, {
          is_muted: shouldMute,
          is_deafened: shouldDeafen,
        }).catch(() => {});
      }
    } catch (err) {
      console.error('[Voice] Failed to join voice:', err);
      set({ isConnected: false, isConnecting: false, currentChannelId: null, currentGuildId: null });
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
    try {
      await get().stopScreenShare();
    } catch {}
    await livekit.disconnect();
    set({
      currentChannelId: null,
      currentGuildId: null,
      isConnected: false,
      isConnecting: false,
      isScreensharing: false,
      isCameraOn: false,
      participants: [],
      speakingUserIds: [],
      watchedParticipantId: null,
      watchedParticipantIds: [],
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

    if (nextMuted) {
      playMuteSound();
    } else {
      playUnmuteSound();
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

    if (nextDeafened) {
      playDeafenSound();
    } else {
      playUndeafenSound();
    }

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
    try {
      await livekit.setCameraEnabled(nextCamera);
      set({ isCameraOn: nextCamera });
    } catch (err) {
      console.error('[Voice] Failed to toggle camera:', err);
      set({ isCameraOn: false });
    }
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