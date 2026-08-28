import { create } from 'zustand';
import { Participant } from 'livekit-client';
import { api } from '../lib/api';
import { livekit } from '../lib/livekit';
import { User } from '../types';
import { playJoinVoiceSound, playLeaveVoiceSound } from '../utils/audio';

export type CallState = 'idle' | 'calling' | 'ringing' | 'connected' | 'ended';

interface CallStoreState {
  callState: CallState;
  roomId: string | null;
  targetUser: User | null;
  incomingCaller: User | null;
  isMuted: boolean;
  isDeafened: boolean;
  isCameraOn: boolean;
  isScreensharing: boolean;
  participants: Participant[];
  speakingUserIds: string[];

  startCall: (roomId: string, recipient: User) => Promise<void>;
  handleIncomingCall: (roomId: string, caller: User) => void;
  acceptCall: () => Promise<void>;
  handleCallAccepted: (token: string, livekitUrl: string, roomName: string) => Promise<void>;
  rejectCall: () => Promise<void>;
  endCall: () => Promise<void>;
  handleCallEnded: () => Promise<void>;

  toggleMute: () => Promise<void>;
  toggleDeafen: () => Promise<void>;
  toggleCamera: () => Promise<void>;
  startScreenShare: () => Promise<void>;
  stopScreenShare: () => Promise<void>;
}

export const useCallStore = create<CallStoreState>((set, get) => ({
  callState: 'idle',
  roomId: null,
  targetUser: null,
  incomingCaller: null,
  isMuted: false,
  isDeafened: false,
  isCameraOn: false,
  isScreensharing: false,
  participants: [],
  speakingUserIds: [],

  startCall: async (roomId: string, recipient: User) => {
    set({
      callState: 'calling',
      roomId,
      targetUser: recipient,
      incomingCaller: null,
      isMuted: false,
      isDeafened: false,
      isCameraOn: false,
      isScreensharing: false,
    });

    try {
      await api.dms.inviteCall(roomId);
    } catch (err) {
      console.error('Failed to initiate call:', err);
      set({ callState: 'idle', roomId: null, targetUser: null });
      throw err;
    }
  },

  handleIncomingCall: (roomId: string, caller: User) => {
    if (get().callState !== 'idle') {
      return;
    }

    set({
      callState: 'ringing',
      roomId,
      incomingCaller: caller,
      targetUser: caller,
    });
  },

  acceptCall: async () => {
    const { roomId } = get();
    if (!roomId) return;

    try {
      const res = await api.dms.acceptCall(roomId);
      await get().handleCallAccepted(res.token, res.livekit_url, res.room_name);
    } catch (err) {
      console.error('Failed to accept call:', err);
      set({ callState: 'idle', roomId: null, incomingCaller: null });
    }
  },

  handleCallAccepted: async (token: string, livekitUrl: string, _roomName: string) => {
    try {
      await livekit.connect(livekitUrl, token, {
        onParticipantsChanged: (participants) => {
          set({ participants });
        },
        onSpeakingChanged: (speakingUserIds) => {
          set({ speakingUserIds });
        },
      });

      playJoinVoiceSound();
      set({
        callState: 'connected',
        isMuted: false,
        isDeafened: false,
        isCameraOn: false,
        isScreensharing: false,
      });
    } catch (err) {
      console.error('Failed to connect LiveKit in DM call:', err);
      set({ callState: 'idle', roomId: null });
    }
  },

  rejectCall: async () => {
    const { roomId } = get();
    if (roomId) {
      try {
        await api.dms.rejectCall(roomId);
      } catch (err) {
        console.error('Failed to reject call:', err);
      }
    }
    set({ callState: 'idle', roomId: null, incomingCaller: null, targetUser: null });
  },

  endCall: async () => {
    const { roomId } = get();
    if (roomId) {
      try {
        await api.dms.leaveCall(roomId);
      } catch (err) {
        console.error('Failed to leave call:', err);
      }
    }

    await livekit.disconnect();
    playLeaveVoiceSound();
    set({
      callState: 'idle',
      roomId: null,
      targetUser: null,
      incomingCaller: null,
      participants: [],
      speakingUserIds: [],
      isScreensharing: false,
      isCameraOn: false,
    });
  },

  handleCallEnded: async () => {
    await livekit.disconnect();
    playLeaveVoiceSound();
    set({
      callState: 'idle',
      roomId: null,
      targetUser: null,
      incomingCaller: null,
      participants: [],
      speakingUserIds: [],
      isScreensharing: false,
      isCameraOn: false,
    });
  },

  toggleMute: async () => {
    const nextMuted = !get().isMuted;
    await livekit.setMuted(nextMuted);
    set({ isMuted: nextMuted });
  },

  toggleDeafen: async () => {
    const nextDeafened = !get().isDeafened;
    await livekit.setDeafened(nextDeafened);
    set({ isDeafened: nextDeafened, isMuted: nextDeafened ? true : get().isMuted });
  },

  toggleCamera: async () => {
    const nextCamera = !get().isCameraOn;
    await livekit.setCameraEnabled(nextCamera);
    set({ isCameraOn: nextCamera });
  },

  startScreenShare: async () => {
    try {
      await livekit.setScreenShareEnabled(true);
      set({ isScreensharing: true });
    } catch (err) {
      console.error('[Call] Screen share error:', err);
      set({ isScreensharing: false });
    }
  },

  stopScreenShare: async () => {
    try {
      await livekit.setScreenShareEnabled(false);
      set({ isScreensharing: false });
    } catch (err) {
      console.error('[Call] Stop screen share error:', err);
    }
  },
}));
