import { create } from 'zustand';
import { Participant } from 'livekit-client';
import { api } from '../lib/api';
import { User } from '../types';
import { useVoiceStore } from './voiceStore';

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
  startScreenShare: (
    sourceId?: string,
    config?: { resolution?: '480p' | '720p' | '1080p'; fps?: 15 | 30 | 60; includeAudio?: boolean }
  ) => Promise<void>;
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
    const { roomId, incomingCaller } = get();
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
    const { roomId, targetUser, incomingCaller } = get();
    const recipient = targetUser || incomingCaller;
    if (!roomId || !recipient) return;

    try {
      await useVoiceStore.getState().joinDMCall(roomId, recipient, token, livekitUrl);
      set({
        callState: 'connected',
        incomingCaller: null,
      });
    } catch (err) {
      console.error('Failed to connect LiveKit in DM call:', err);
      set({ callState: 'idle', roomId: null, incomingCaller: null });
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

    await useVoiceStore.getState().leaveVoice();
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
    await useVoiceStore.getState().leaveVoice();
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
    await useVoiceStore.getState().toggleMute();
  },

  toggleDeafen: async () => {
    await useVoiceStore.getState().toggleDeafen();
  },

  toggleCamera: async () => {
    await useVoiceStore.getState().toggleCamera();
  },

  startScreenShare: async (sourceId?: string, config?: { resolution?: '480p' | '720p' | '1080p'; fps?: 15 | 30 | 60; includeAudio?: boolean }) => {
    await useVoiceStore.getState().startScreenShare(sourceId, config);
  },

  stopScreenShare: async () => {
    await useVoiceStore.getState().stopScreenShare();
  },
}));
