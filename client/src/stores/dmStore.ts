import { create } from 'zustand';
import { DMRoom, DMMessage } from '../types';
import { api } from '../lib/api';

interface DMState {
  rooms: DMRoom[];
  activeRoom: DMRoom | null;
  messages: DMMessage[];
  isLoadingRooms: boolean;
  isLoadingMessages: boolean;

  fetchRooms: () => Promise<void>;
  selectRoom: (room: DMRoom) => Promise<void>;
  openDMWithUser: (recipientId: string) => Promise<DMRoom>;
  sendMessage: (content: string, attachments?: any[]) => Promise<void>;
  addMessage: (message: DMMessage) => void;
}

export const useDMStore = create<DMState>((set, get) => ({
  rooms: [],
  activeRoom: null,
  messages: [],
  isLoadingRooms: false,
  isLoadingMessages: false,

  fetchRooms: async () => {
    set({ isLoadingRooms: true });
    try {
      const rooms = await api.dms.listRooms();
      set({ rooms, isLoadingRooms: false });
    } catch (err) {
      console.error('Failed to fetch DM rooms:', err);
      set({ isLoadingRooms: false });
    }
  },

  selectRoom: async (room: DMRoom) => {
    set({ activeRoom: room, messages: [], isLoadingMessages: true });
    try {
      const messages = await api.dms.getMessages(room.id);
      set({ messages, isLoadingMessages: false });
    } catch (err) {
      console.error('Failed to fetch DM messages:', err);
      set({ isLoadingMessages: false });
    }
  },

  openDMWithUser: async (recipientId: string) => {
    const room = await api.dms.createOrGet(recipientId);
    set((state) => {
      const exists = state.rooms.some((r) => r.id === room.id);
      return {
        rooms: exists ? state.rooms : [room, ...state.rooms],
      };
    });
    await get().selectRoom(room);
    return room;
  },

  sendMessage: async (content: string, attachments?: any[]) => {
    const { activeRoom } = get();
    if (!activeRoom) return;
    await api.dms.sendMessage(activeRoom.id, { content, attachments });
  },

  addMessage: (message: DMMessage) => {
    set((state) => {
      if (state.activeRoom && state.activeRoom.id === message.dm_room_id) {
        if (state.messages.some((m) => m.id === message.id)) return state;
        return { messages: [...state.messages, message] };
      }
      return state;
    });
  },
}));
