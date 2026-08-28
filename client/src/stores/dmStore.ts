import { create } from 'zustand';
import { DMRoom, DMMessage } from '../types';
import { api } from '../lib/api';
import { playMessageSound } from '../utils/audio';
import { useAuthStore } from './authStore';

interface DMState {
  rooms: DMRoom[];
  activeRoom: DMRoom | null;
  messages: DMMessage[];
  unreadRooms: Set<string>;
  isLoadingRooms: boolean;
  isLoadingMessages: boolean;

  fetchRooms: () => Promise<void>;
  selectRoom: (room: DMRoom) => Promise<void>;
  openDMWithUser: (recipientId: string) => Promise<DMRoom>;
  sendMessage: (content: string, attachments?: any[], replyToId?: string) => Promise<void>;
  toggleReaction: (messageId: string, emoji: string) => Promise<void>;
  addMessage: (message: DMMessage) => void;
  handleDMReactionEvent: (data: { message_id: string; dm_room_id: string; user_id: string; emoji: string; is_add: boolean }) => void;
}

export const useDMStore = create<DMState>((set, get) => ({
  rooms: [],
  activeRoom: null,
  messages: [],
  unreadRooms: new Set(),
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
    set((state) => {
      const unread = new Set(state.unreadRooms);
      unread.delete(room.id);
      return { activeRoom: room, unreadRooms: unread, messages: [], isLoadingMessages: true };
    });
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

  sendMessage: async (content: string, attachments?: any[], replyToId?: string) => {
    const { activeRoom } = get();
    if (!activeRoom) return;
    await api.dms.sendMessage(activeRoom.id, { content, attachments, reply_to_id: replyToId });
  },

  toggleReaction: async (messageId: string, emoji: string) => {
    const { activeRoom, messages } = get();
    if (!activeRoom) return;
    const currentUser = useAuthStore.getState().user;
    if (!currentUser) return;

    const msg = messages.find((m) => m.id === messageId);
    const existing = msg?.reactions?.find((r) => r.emoji === emoji);
    const hasReacted = existing?.user_ids.includes(currentUser.id);

    if (hasReacted) {
      await api.dms.removeReaction(activeRoom.id, messageId, emoji);
    } else {
      await api.dms.addReaction(activeRoom.id, messageId, emoji);
    }
  },

  addMessage: (message: DMMessage) => {
    const currentUser = useAuthStore.getState().user;
    set((state) => {
      if (state.activeRoom && state.activeRoom.id === message.dm_room_id) {
        if (state.messages.some((m) => m.id === message.id)) return state;
        if (message.author_id !== currentUser?.id) {
          playMessageSound(false);
        }
        return { messages: [...state.messages, message] };
      } else {
        const unread = new Set(state.unreadRooms);
        unread.add(message.dm_room_id);
        playMessageSound(false);
        return { unreadRooms: unread };
      }
    });
  },

  handleDMReactionEvent: ({ message_id, user_id, emoji, is_add }) => {
    set((state) => {
      const messages = state.messages.map((m) => {
        if (m.id !== message_id) return m;
        let reactions = [...(m.reactions || [])];
        const existing = reactions.find((r) => r.emoji === emoji);

        if (is_add) {
          if (existing) {
            if (!existing.user_ids.includes(user_id)) {
              reactions = reactions.map((r) =>
                r.emoji === emoji ? { ...r, count: r.count + 1, user_ids: [...r.user_ids, user_id] } : r
              );
            }
          } else {
            reactions.push({ emoji, count: 1, user_ids: [user_id] });
          }
        } else {
          if (existing) {
            const nextUsers = existing.user_ids.filter((id) => id !== user_id);
            if (nextUsers.length === 0) {
              reactions = reactions.filter((r) => r.emoji !== emoji);
            } else {
              reactions = reactions.map((r) =>
                r.emoji === emoji ? { ...r, count: nextUsers.length, user_ids: nextUsers } : r
              );
            }
          }
        }
        return { ...m, reactions };
      });
      return { messages };
    });
  },
}));
