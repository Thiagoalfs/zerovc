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
  roomUnreadCounts: Record<string, number>;
  messagesByRoom: Record<string, DMMessage[]>;
  pinnedMessagesByRoom: Record<string, DMMessage[]>;
  isLoadingPinned: Record<string, boolean>;
  hasMoreByRoom: Record<string, boolean>;
  isLoadingRooms: boolean;
  isLoadingMessages: boolean;
  isLoadingMoreMessages: boolean;

  fetchRooms: () => Promise<void>;
  selectRoom: (room: DMRoom) => Promise<void>;
  loadMoreMessages: (roomId: string) => Promise<void>;
  fetchPinnedMessages: (roomId: string) => Promise<void>;
  openDMWithUser: (recipientId: string) => Promise<DMRoom>;
  sendMessage: (content: string, attachments?: any[], replyToId?: string) => Promise<void>;
  toggleReaction: (messageId: string, emoji: string) => Promise<void>;
  togglePin: (messageId: string) => Promise<void>;
  addMessage: (message: DMMessage) => void;
  handleDMReactionEvent: (data: { message_id: string; dm_room_id: string; user_id: string; emoji: string; is_add: boolean }) => void;
  handlePinEvent: (data: { message_id: string; room_id: string; is_pinned: boolean }) => void;
}

export const useDMStore = create<DMState>((set, get) => ({
  rooms: [],
  activeRoom: null,
  messages: [],
  unreadRooms: new Set(),
  roomUnreadCounts: {},
  messagesByRoom: {},
  pinnedMessagesByRoom: {},
  isLoadingPinned: {},
  hasMoreByRoom: {},
  isLoadingRooms: false,
  isLoadingMessages: false,
  isLoadingMoreMessages: false,

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
    const cachedMessages = get().messagesByRoom[room.id];

    set((state) => {
      const unread = new Set(state.unreadRooms);
      unread.delete(room.id);
      const counts = { ...state.roomUnreadCounts };
      delete counts[room.id];

      return {
        activeRoom: room,
        messages: cachedMessages || [],
        unreadRooms: unread,
        roomUnreadCounts: counts,
        isLoadingMessages: !cachedMessages,
      };
    });

    if (!cachedMessages) {
      try {
        const messages = await api.dms.getMessages(room.id, 50);
        set((state) => ({
          messages: state.activeRoom?.id === room.id ? messages : state.messages,
          messagesByRoom: {
            ...state.messagesByRoom,
            [room.id]: messages,
          },
          hasMoreByRoom: {
            ...state.hasMoreByRoom,
            [room.id]: messages.length === 50,
          },
          isLoadingMessages: false,
        }));
      } catch (err) {
        console.error('Failed to fetch DM messages:', err);
        set({ isLoadingMessages: false });
      }
    }
  },

  loadMoreMessages: async (roomId: string) => {
    const state = get();
    if (state.isLoadingMoreMessages || state.hasMoreByRoom[roomId] === false) return;

    const currentRoomMessages = state.messagesByRoom[roomId] || state.messages;
    if (currentRoomMessages.length === 0) return;

    const oldestMessage = currentRoomMessages[0];
    set({ isLoadingMoreMessages: true });

    try {
      const olderMessages = await api.dms.getMessages(roomId, 50, oldestMessage.created_at || oldestMessage.id);
      const hasMore = olderMessages.length === 50;

      const existingIds = new Set(currentRoomMessages.map((m) => m.id));
      const uniqueOlder = olderMessages.filter((m) => !existingIds.has(m.id));
      const combined = [...uniqueOlder, ...currentRoomMessages];

      set((curr) => ({
        messages: curr.activeRoom?.id === roomId ? combined : curr.messages,
        messagesByRoom: {
          ...curr.messagesByRoom,
          [roomId]: combined,
        },
        hasMoreByRoom: {
          ...curr.hasMoreByRoom,
          [roomId]: hasMore,
        },
        isLoadingMoreMessages: false,
      }));
    } catch (err) {
      console.error('Failed to load older DM messages:', err);
      set({ isLoadingMoreMessages: false });
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
    const msg = await api.dms.sendMessage(activeRoom.id, { content, attachments, reply_to_id: replyToId });

    // Instantly append if active
    set((state) => {
      if (state.activeRoom?.id !== activeRoom.id) return state;
      const roomMsgs = state.messagesByRoom[activeRoom.id] || [];
      const alreadyHas = roomMsgs.some((m) => m.id === msg.id);
      const updated = alreadyHas ? roomMsgs : [...roomMsgs, msg];

      return {
        messages: state.messages.some((m) => m.id === msg.id) ? state.messages : [...state.messages, msg],
        messagesByRoom: {
          ...state.messagesByRoom,
          [activeRoom.id]: updated,
        },
      };
    });
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
      const roomMsgs = state.messagesByRoom[message.dm_room_id] || [];
      const alreadyHas = roomMsgs.some((m) => m.id === message.id);
      const updatedRoomMsgs = alreadyHas ? roomMsgs : [...roomMsgs, message];

      const nextMessagesByRoom = {
        ...state.messagesByRoom,
        [message.dm_room_id]: updatedRoomMsgs,
      };

      if (state.activeRoom && state.activeRoom.id === message.dm_room_id) {
        if (state.messages.some((m) => m.id === message.id)) {
          return { messagesByRoom: nextMessagesByRoom };
        }
        if (message.author_id !== currentUser?.id) {
          playMessageSound(false);
        }
        return {
          messages: [...state.messages, message],
          messagesByRoom: nextMessagesByRoom,
        };
      } else {
        const unread = new Set(state.unreadRooms);
        unread.add(message.dm_room_id);
        const counts = { ...state.roomUnreadCounts };
        if (message.author_id !== currentUser?.id) {
          counts[message.dm_room_id] = (counts[message.dm_room_id] || 0) + 1;
        }
        playMessageSound(false);
        return {
          unreadRooms: unread,
          roomUnreadCounts: counts,
          messagesByRoom: nextMessagesByRoom,
        };
      }
    });
  },

  handleDMReactionEvent: ({ message_id, dm_room_id, user_id, emoji, is_add }) => {
    set((state) => {
      const updateMsgList = (list: DMMessage[]) =>
        list.map((m) => {
          if (m.id !== message_id) return m;
          const reactions = [...(m.reactions || [])];
          const rxIndex = reactions.findIndex((r) => r.emoji === emoji);

          if (is_add) {
            if (rxIndex > -1) {
              const rx = reactions[rxIndex];
              if (!rx.user_ids.includes(user_id)) {
                reactions[rxIndex] = {
                  ...rx,
                  count: rx.count + 1,
                  user_ids: [...rx.user_ids, user_id],
                };
              }
            } else {
              reactions.push({
                emoji,
                count: 1,
                user_ids: [user_id],
              });
            }
          } else {
            if (rxIndex > -1) {
              const rx = reactions[rxIndex];
              const nextUsers = rx.user_ids.filter((id) => id !== user_id);
              if (nextUsers.length === 0) {
                reactions.splice(rxIndex, 1);
              } else {
                reactions[rxIndex] = {
                  ...rx,
                  count: Math.max(0, rx.count - 1),
                  user_ids: nextUsers,
                };
              }
            }
          }
          return { ...m, reactions };
        });

      const nextMessagesByRoom = { ...state.messagesByRoom };
      if (nextMessagesByRoom[dm_room_id]) {
        nextMessagesByRoom[dm_room_id] = updateMsgList(nextMessagesByRoom[dm_room_id]);
      }

      return {
        messages: state.activeRoom?.id === dm_room_id ? updateMsgList(state.messages) : state.messages,
        messagesByRoom: nextMessagesByRoom,
      };
    });
  },

  fetchPinnedMessages: async (roomId: string) => {
    set((state) => ({
      isLoadingPinned: { ...state.isLoadingPinned, [roomId]: true },
    }));
    try {
      const pins = await api.dms.getPinnedMessages(roomId);
      set((state) => ({
        pinnedMessagesByRoom: {
          ...state.pinnedMessagesByRoom,
          [roomId]: pins,
        },
        isLoadingPinned: { ...state.isLoadingPinned, [roomId]: false },
      }));
    } catch (err) {
      console.error('Failed to fetch pinned DM messages:', err);
      set((state) => ({
        isLoadingPinned: { ...state.isLoadingPinned, [roomId]: false },
      }));
    }
  },

  togglePin: async (messageId: string) => {
    const { activeRoom } = get();
    if (!activeRoom) return;
    await api.dms.togglePin(activeRoom.id, messageId);
  },

  handlePinEvent: ({ message_id, room_id, is_pinned }) => {
    set((state) => {
      const updateMsgList = (list: DMMessage[]) =>
        list.map((m) => (m.id === message_id ? { ...m, is_pinned } : m));

      const nextMessagesByRoom = { ...state.messagesByRoom };
      if (nextMessagesByRoom[room_id]) {
        nextMessagesByRoom[room_id] = updateMsgList(nextMessagesByRoom[room_id]);
      }

      const currentPinned = state.pinnedMessagesByRoom[room_id] || [];
      let nextPinned: DMMessage[];

      if (is_pinned) {
        const found =
          state.messagesByRoom[room_id]?.find((m) => m.id === message_id) ||
          (state.activeRoom?.id === room_id ? state.messages.find((m) => m.id === message_id) : undefined);

        if (found) {
          const pinnedMsg = { ...found, is_pinned: true };
          const alreadyInPinned = currentPinned.some((m) => m.id === message_id);
          nextPinned = alreadyInPinned
            ? currentPinned.map((m) => (m.id === message_id ? pinnedMsg : m))
            : [pinnedMsg, ...currentPinned];
        } else {
          nextPinned = currentPinned;
          setTimeout(() => {
            get().fetchPinnedMessages(room_id);
          }, 50);
        }
      } else {
        nextPinned = currentPinned.filter((m) => m.id !== message_id);
      }

      const nextPinnedByRoom = {
        ...state.pinnedMessagesByRoom,
        [room_id]: nextPinned,
      };

      return {
        messages: state.activeRoom?.id === room_id ? updateMsgList(state.messages) : state.messages,
        messagesByRoom: nextMessagesByRoom,
        pinnedMessagesByRoom: nextPinnedByRoom,
      };
    });
  },
}));
