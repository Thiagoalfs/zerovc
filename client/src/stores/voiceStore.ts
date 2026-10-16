import { create } from 'zustand';
import { Participant, DisconnectReason } from 'livekit-client';
import { api } from '../lib/api';
import { livekit } from '../lib/livekit';
import { User, DMGroup } from '../types';
import { checkCallEligibility, createE2EEOptions, livekitE2EEManager } from '../lib/livekitE2EE';
import { callKeyManager } from '../crypto/callKeys';
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

export type VoiceType = 'guild' | 'dm' | 'group';

interface VoiceState {
  voiceType: VoiceType | null;
  currentChannelId: string | null;
  currentGuildId: string | null;
  dmRoomId: string | null;
  dmRecipient: User | null;
  dmGroupId: string | null;
  dmGroup: DMGroup | null;
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
  joinDMCall: (roomId: string, recipient: User, token?: string, livekitUrl?: string, isE2EE?: boolean) => Promise<void>;
  joinGroupVoice: (groupId: string, group?: DMGroup) => Promise<void>;
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

/**
 * Safely resolves the local device UUID.
 * Guarantees a valid RFC4122 v4 UUID, preventing PostgreSQL syntax errors
 * caused by invalid placeholder strings like 'local_device'.
 */
const getLocalDeviceId = (): string => {
  try {
    const stored = typeof localStorage !== 'undefined' ? localStorage.getItem('zerovc_device_id') : null;
    if (stored && stored !== 'local_device' && stored.trim().length > 0) {
      return stored.trim();
    }
    const generated =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c: any) =>
            (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)
          );
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('zerovc_device_id', generated);
    }
    return generated;
  } catch {
    return '00000000-0000-0000-0000-000000000000';
  }
};

/**
 * Extracts the E2EE device ID from LiveKit participant metadata.
 * Participant metadata contains JSON with optional device_id.
 * Falls back to participant.identity if metadata is absent or unparseable.
 */
const extractParticipantDeviceId = (participant: Participant): string => {
  if (participant.metadata) {
    try {
      const meta = JSON.parse(participant.metadata);
      if (meta && typeof meta.device_id === 'string' && meta.device_id.trim().length > 0) {
        return meta.device_id.trim();
      }
    } catch {
      // Safely ignore non-JSON or legacy metadata
    }
  }
  return participant.identity;
};

export const useVoiceStore = create<VoiceState>((set, get) => {
  // Helper to attach LiveKit room connection listeners and sync state
  const connectLiveKitRoom = async (
    livekitUrl: string,
    token: string,
    shouldMute: boolean,
    shouldDeafen: boolean,
    isE2EERoom: boolean = false,
    callId?: string
  ) => {
    let e2eeSetup = undefined;
    if (isE2EERoom) {
      const eligibility = checkCallEligibility({ isE2EERoom: true });
      if (eligibility.status === 'BLOCKED') {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('zerovc:upgrade_required', {
              detail: { modal: 'UPGRADE_REQUIRED', reason: 'E2EE_CALL_UNSUPPORTED' },
            })
          );
        }
        throw new Error('E2EE_CALL_UNSUPPORTED: Platform lacks Insertable Streams. Plaintext fallback strictly forbidden.');
      }
      e2eeSetup = createE2EEOptions();
    }

    let prevParticipantIds = new Set<string>();
    let prevScreenShareIds = new Set<string>();
    let isInitialSync = true;
    const participantDeviceMap = new Map<string, string>();

    await livekit.connect(livekitUrl, token, {
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
        const { currentChannelId, voiceType } = get();
        if (voiceType === 'guild' && currentChannelId) {
          api.channels.updateVoiceState(currentChannelId, { is_screensharing: false }).catch(() => {});
        }
      },
      onParticipantConnected: (participant) => {
        const deviceId = extractParticipantDeviceId(participant);
        participantDeviceMap.set(participant.identity, deviceId);
        callKeyManager.handleParticipantJoined(deviceId);
      },
      onParticipantDisconnected: (participant) => {
        const deviceId = participantDeviceMap.get(participant.identity) || extractParticipantDeviceId(participant);
        participantDeviceMap.delete(participant.identity);
        callKeyManager.handleParticipantLeft(deviceId);
      },
      onDisconnected: (reason) => {
        participantDeviceMap.clear();
        callKeyManager.endCall();
        livekitE2EEManager.cleanup();
        console.warn('[Voice] LiveKit room disconnected. Reason:', reason);
        playLeaveVoiceSound();
        const isDuplicate =
          reason === DisconnectReason.DUPLICATE_IDENTITY ||
          String(reason).toLowerCase().includes('duplicate');

        set({
          voiceType: null,
          currentChannelId: null,
          currentGuildId: null,
          dmRoomId: null,
          dmRecipient: null,
          dmGroupId: null,
          dmGroup: null,
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
    }, e2eeSetup);

    // Sync pre-existing room participants into CallKeyManager immediately after connect
    if (isE2EERoom && callId) {
      const myDeviceId = getLocalDeviceId();
      const existingDeviceIds: string[] = [];
      const room = livekit.getRoom();

      if (room && room.remoteParticipants) {
        for (const participant of room.remoteParticipants.values()) {
          const devId = extractParticipantDeviceId(participant);
          participantDeviceMap.set(participant.identity, devId);
          existingDeviceIds.push(devId);
        }
      }

      await callKeyManager.startCall(callId, myDeviceId, existingDeviceIds);
    }

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
      isScreensharing: false,
    });

    setTimeout(() => {
      isInitialSync = false;
    }, 500);
  };

  const cleanupPreviousConnection = async () => {
    callKeyManager.endCall();
    livekitE2EEManager.cleanup();
    const { voiceType, currentChannelId, dmRoomId, isScreensharing } = get();
    if (isScreensharing) {
      try {
        await livekit.setScreenShareEnabled(false);
      } catch {}
    }
    if (voiceType === 'guild' && currentChannelId) {
      api.channels.leaveVoice(currentChannelId).catch(() => {});
    } else if (voiceType === 'dm' && dmRoomId) {
      api.dms.leaveCall(dmRoomId).catch(() => {});
    }
    await livekit.disconnect().catch(() => {});
  };

  return {
    voiceType: null,
    currentChannelId: null,
    currentGuildId: null,
    dmRoomId: null,
    dmRecipient: null,
    dmGroupId: null,
    dmGroup: null,
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
      if (
        get().voiceType === 'guild' &&
        get().currentChannelId === channelId &&
        (get().isConnected || get().isConnecting)
      ) {
        return;
      }

      await cleanupPreviousConnection();

      set({
        voiceType: 'guild',
        isConnecting: true,
        currentChannelId: channelId,
        currentGuildId: guildId || null,
        dmRoomId: null,
        dmRecipient: null,
        dmGroupId: null,
        dmGroup: null,
      });

      const isPTT = localStorage.getItem('zerovc_input_mode') === 'ptt';
      const shouldDeafen = get().isDeafened;
      const shouldMute = shouldDeafen || isPTT || get().isMuted;

      try {
        const res = await api.channels.joinVoice(channelId, {
          is_muted: shouldMute,
          is_deafened: shouldDeafen,
        });

        // Check if user changed mind or joined another channel while requesting
        if (get().currentChannelId !== channelId || get().voiceType !== 'guild') return;

        await connectLiveKitRoom(
          res.livekit_url,
          res.token,
          shouldMute,
          shouldDeafen,
          Boolean((res as any)?.e2ee_enabled),
          channelId
        );

        // Sync initial voice state with backend
        if (shouldMute || shouldDeafen) {
          api.channels
            .updateVoiceState(channelId, {
              is_muted: shouldMute,
              is_deafened: shouldDeafen,
            })
            .catch(() => {});
        }
      } catch (err) {
        callKeyManager.endCall();
        livekitE2EEManager.cleanup();
        console.error('[Voice] Failed to join guild voice:', err);
        set({
          voiceType: null,
          isConnected: false,
          isConnecting: false,
          currentChannelId: null,
          currentGuildId: null,
        });
      }
    },

    joinDMCall: async (roomId: string, recipient: User, token?: string, livekitUrl?: string, isE2EE?: boolean) => {
      if (
        get().voiceType === 'dm' &&
        get().dmRoomId === roomId &&
        (get().isConnected || get().isConnecting)
      ) {
        return;
      }

      await cleanupPreviousConnection();

      set({
        voiceType: 'dm',
        isConnecting: true,
        dmRoomId: roomId,
        dmRecipient: recipient,
        currentChannelId: null,
        currentGuildId: null,
        dmGroupId: null,
        dmGroup: null,
      });

      const isPTT = localStorage.getItem('zerovc_input_mode') === 'ptt';
      const shouldDeafen = get().isDeafened;
      const shouldMute = shouldDeafen || isPTT || get().isMuted;

      try {
        let finalToken = token;
        let finalUrl = livekitUrl;
        let finalIsE2EE = isE2EE;

        if (!finalToken || !finalUrl) {
          const res = await api.dms.acceptCall(roomId);
          finalToken = res.token;
          finalUrl = res.livekit_url;
          if ((res as any)?.e2ee_enabled !== undefined) {
            finalIsE2EE = Boolean((res as any)?.e2ee_enabled);
          }
        }

        if (get().dmRoomId !== roomId || get().voiceType !== 'dm') return;

        await connectLiveKitRoom(
          finalUrl,
          finalToken,
          shouldMute,
          shouldDeafen,
          Boolean(finalIsE2EE),
          roomId
        );
      } catch (err) {
        callKeyManager.endCall();
        livekitE2EEManager.cleanup();
        console.error('[Voice] Failed to join DM call:', err);
        set({
          voiceType: null,
          isConnected: false,
          isConnecting: false,
          dmRoomId: null,
          dmRecipient: null,
        });
        throw err;
      }
    },

    joinGroupVoice: async (groupId: string, group?: DMGroup) => {
      if (
        get().voiceType === 'group' &&
        get().dmGroupId === groupId &&
        (get().isConnected || get().isConnecting)
      ) {
        return;
      }

      await cleanupPreviousConnection();

      set({
        voiceType: 'group',
        isConnecting: true,
        dmGroupId: groupId,
        dmGroup: group || null,
        currentChannelId: null,
        currentGuildId: null,
        dmRoomId: null,
        dmRecipient: null,
      });

      const isPTT = localStorage.getItem('zerovc_input_mode') === 'ptt';
      const shouldDeafen = get().isDeafened;
      const shouldMute = shouldDeafen || isPTT || get().isMuted;

      try {
        const res = await api.dmGroups.getVoiceToken(groupId);

        if (get().dmGroupId !== groupId || get().voiceType !== 'group') return;

        await connectLiveKitRoom(
          res.livekit_url,
          res.token,
          shouldMute,
          shouldDeafen,
          Boolean((res as any)?.e2ee_enabled),
          groupId
        );
      } catch (err) {
        callKeyManager.endCall();
        livekitE2EEManager.cleanup();
        console.error('[Voice] Failed to join DM group voice:', err);
        set({
          voiceType: null,
          isConnected: false,
          isConnecting: false,
          dmGroupId: null,
          dmGroup: null,
        });
        throw err;
      }
    },

    leaveVoice: async () => {
      callKeyManager.endCall();
      livekitE2EEManager.cleanup();
      const { voiceType, currentChannelId, dmRoomId } = get();
      if (!voiceType && !currentChannelId && !dmRoomId) return;

      try {
        if (voiceType === 'guild' && currentChannelId) {
          await api.channels.leaveVoice(currentChannelId);
        } else if (voiceType === 'dm' && dmRoomId) {
          await api.dms.leaveCall(dmRoomId);
        }
      } catch (err) {
        console.warn('[Voice] Failed to notify leave API:', err);
      }

      try {
        await get().stopScreenShare();
      } catch {}
      await livekit.disconnect();

      set({
        voiceType: null,
        currentChannelId: null,
        currentGuildId: null,
        dmRoomId: null,
        dmRecipient: null,
        dmGroupId: null,
        dmGroup: null,
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
      const { isMuted, isDeafened, currentChannelId, voiceType } = get();
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

      if (voiceType === 'guild' && currentChannelId) {
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
      const { isDeafened, currentChannelId, voiceType } = get();
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

      if (voiceType === 'guild' && currentChannelId) {
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

    startScreenShare: async (
      sourceId?: string,
      config?: { resolution?: '480p' | '720p' | '1080p'; fps?: 15 | 30 | 60; includeAudio?: boolean }
    ) => {
      const { currentChannelId, voiceType } = get();
      try {
        await livekit.setScreenShareEnabled(true, sourceId, config);
        set({ isScreensharing: true });

        if (voiceType === 'guild' && currentChannelId) {
          api.channels.updateVoiceState(currentChannelId, { is_screensharing: true }).catch(() => {});
        }
      } catch (err) {
        console.error('[Voice] Failed to start screen share:', err);
        set({ isScreensharing: false });
      }
    },

    stopScreenShare: async () => {
      const { currentChannelId, voiceType } = get();
      try {
        await livekit.setScreenShareEnabled(false);
        set({ isScreensharing: false });

        if (voiceType === 'guild' && currentChannelId) {
          api.channels.updateVoiceState(currentChannelId, { is_screensharing: false }).catch(() => {});
        }
      } catch (err) {
        console.error('[Voice] Failed to stop screen share:', err);
      }
    },
  };
});