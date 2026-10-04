import { create } from 'zustand';
import { DMRoom, DMMessage } from '../types';
import { api } from '../lib/api';
import { playMessageSound, speakText } from '../utils/audio';
import { isChatActiveNow } from '../utils/activeChat';
import { useAuthStore } from './authStore';
import { useSettingsStore } from './settingsStore';
import { useUploadStore } from './uploadStore';
import { optimizeImageForUpload } from '../lib/imageOptimizer';

interface DMState {
  rooms: DMRoom[];
  activeRoom: DMRoom | null;
  messages: DMMessage[];
  unreadRooms: Set<string>;
  roomUnreadCounts: Record<string, number>;
  firstUnreadMessageIdByRoom: Record<string, string | null>;
  messagesByRoom: Record<string, DMMessage[]>;
  pinnedMessagesByRoom: Record<string, DMMessage[]>;
  isLoadingPinned: Record<string, boolean>;
  hasMoreByRoom: Record<string, boolean>;
  isLoadingRooms: boolean;
  isLoadingMessages: boolean;
  isLoadingMoreMessages: boolean;

  fetchRooms: () => Promise<void>;
  selectRoom: (room: DMRoom) => Promise<void>;
  markRoomAsRead: (roomId: string) => void;
  clearUnreadDivider: (roomId: string) => void;
  loadMoreMessages: (roomId: string) => Promise<void>;
  fetchPinnedMessages: (roomId: string) => Promise<void>;
  openDMWithUser: (recipientId: string) => Promise<DMRoom>;
  closeRoom: (roomId: string) => Promise<void>;
  sendMessage: (content: string, attachments?: any[], replyToId?: string, isTTS?: boolean, file?: File) => Promise<void>;
  editMessage: (messageId: string, content: string) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  removeMessageFromStore: (messageId: string, roomId?: string) => void;
  toggleReaction: (messageId: string, emoji: string) => Promise<void>;
  togglePin: (messageId: string) => Promise<void>;
  addMessage: (message: DMMessage) => void;
  handleDMReactionEvent: (data: { message_id: string; dm_room_id: string; user_id: string; emoji: string; is_add: boolean }) => void;
  handlePinEvent: (data: { message_id: string; room_id: string; is_pinned: boolean }) => void;
  handleDMMessageUpdateEvent: (message: DMMessage) => void;
  handleDMMessageDeleteEvent: (data: { message_id?: string; id?: string; room_id?: string; dm_room_id?: string }) => void;
}

export const useDMStore = create<DMState>((set, get) => ({
  rooms: [],
  activeRoom: null,
  messages: [],
  unreadRooms: new Set(),
  roomUnreadCounts: {},
  firstUnreadMessageIdByRoom: {},
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
      const sortedRooms = [...rooms].sort((a, b) => {
        const aTime = a.last_message?.created_at ? new Date(a.last_message.created_at).getTime() : new Date(a.created_at).getTime();
        const bTime = b.last_message?.created_at ? new Date(b.last_message.created_at).getTime() : new Date(b.created_at).getTime();
        return bTime - aTime;
      });
      set({ rooms: sortedRooms, isLoadingRooms: false });
    } catch (err) {
      console.error('Failed to fetch DM rooms:', err);
      set({ isLoadingRooms: false });
    }
  },

  selectRoom: async (room: DMRoom) => {
    try {
      localStorage.setItem('zerovc_last_dm_target', `/@me/${room.id}`);
    } catch {}

    const cachedMessages = get().messagesByRoom[room.id];

    set((state) => {
      const wasUnread = state.unreadRooms.has(room.id);
      const unread = new Set(state.unreadRooms);
      unread.delete(room.id);
      const counts = { ...state.roomUnreadCounts };
      delete counts[room.id];
      const nextFirstUnread = { ...state.firstUnreadMessageIdByRoom };
      if (!wasUnread) {
        nextFirstUnread[room.id] = null;
      }

      return {
        activeRoom: room,
        messages: cachedMessages || [],
        unreadRooms: unread,
        roomUnreadCounts: counts,
        firstUnreadMessageIdByRoom: nextFirstUnread,
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

  markRoomAsRead: (roomId: string) => {
    set((state) => {
      const unread = new Set(state.unreadRooms);
      unread.delete(roomId);
      const counts = { ...state.roomUnreadCounts };
      delete counts[roomId];
      const nextFirstUnread = { ...state.firstUnreadMessageIdByRoom };
      nextFirstUnread[roomId] = null;
      return {
        unreadRooms: unread,
        roomUnreadCounts: counts,
        firstUnreadMessageIdByRoom: nextFirstUnread,
      };
    });
  },

  clearUnreadDivider: (roomId: string) => {
    set((state) => ({
      firstUnreadMessageIdByRoom: {
        ...state.firstUnreadMessageIdByRoom,
        [roomId]: null,
      },
    }));
  },

  loadMoreMessages: async (roomId: string) => {
    const state = get();
    if (state.isLoadingMoreMessages || state.hasMoreByRoom[roomId] === false) return;

    const currentRoomMessages = state.messagesByRoom[roomId] || state.messages;
    if (currentRoomMessages.length === 0) return;

    const oldestMessage = currentRoomMessages.find((m) => !m.id.startsWith('temp-')) || currentRoomMessages[0];
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
    if (recipientId === '00000000-0000-0000-0000-000000000001') {
      throw new Error('Não é possível iniciar conversa privada com bots.');
    }
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

  closeRoom: async (roomId: string) => {
    try {
      const saved = localStorage.getItem('zerovc_last_dm_target');
      if (saved === `/@me/${roomId}`) {
        localStorage.removeItem('zerovc_last_dm_target');
      }
    } catch {}

    const wasActive = get().activeRoom?.id === roomId;

    set((state) => {
      const newRooms = state.rooms.filter((r) => r.id !== roomId);
      const isCurActive = state.activeRoom?.id === roomId;
      const unread = new Set(state.unreadRooms);
      unread.delete(roomId);
      const counts = { ...state.roomUnreadCounts };
      delete counts[roomId];

      return {
        rooms: newRooms,
        activeRoom: isCurActive ? null : state.activeRoom,
        unreadRooms: unread,
        roomUnreadCounts: counts,
      };
    });

    if (wasActive && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('zerovc:nav-home', { detail: { target: 'friends' } }));
    }

    try {
      await api.dms.closeRoom(roomId);
    } catch (err) {
      console.error('Failed to close DM room:', err);
    }
  },

  sendMessage: async (content: string, attachments?: any[], replyToId?: string, isTTS?: boolean, file?: File) => {
    const { activeRoom, messages } = get();
    if (!activeRoom) return;
    const currentUser = useAuthStore.getState().user;
    if (!currentUser) return;

    let replyInfo = undefined;
    if (replyToId) {
      const parentMsg = messages.find((m) => m.id === replyToId);
      if (parentMsg) {
        replyInfo = {
          id: parentMsg.id,
          author: parentMsg.author,
          content: parentMsg.content,
        };
      }
    }

    const tempId = `temp-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const abortController = file ? new AbortController() : null;

    if (file && abortController) {
      useUploadStore.getState().startUpload({
        id: tempId,
        fileName: file.name,
        fileSize: file.size,
        progress: 0,
        abortController,
        onCancel: () => get().removeMessageFromStore(tempId, activeRoom.id),
      });
    }

    const tempMsg: DMMessage = {
      id: tempId,
      tempId,
      dm_room_id: activeRoom.id,
      author_id: currentUser.id,
      author: currentUser,
      content,
      attachments: attachments || [],
      reply_to_id: replyToId,
      reply_to: replyInfo,
      reactions: [],
      is_pinned: false,
      is_tts: Boolean(isTTS),
      status: 'sending',
      uploadingFile: file
        ? {
            name: file.name,
            size: file.size,
          }
        : undefined,
      created_at: new Date().toISOString(),
    };

    // 1. Instantly append optimistically
    set((state) => {
      if (state.activeRoom?.id !== activeRoom.id) return state;
      const roomMsgs = state.messagesByRoom[activeRoom.id] || [];
      return {
        messages: [...state.messages, tempMsg],
        messagesByRoom: {
          ...state.messagesByRoom,
          [activeRoom.id]: [...roomMsgs, tempMsg],
        },
        firstUnreadMessageIdByRoom: {
          ...state.firstUnreadMessageIdByRoom,
          [activeRoom.id]: null,
        },
      };
    });

    try {
      let finalContent = content;

      if (file && abortController) {
        const optimizedFile = await optimizeImageForUpload(file, { maxWidth: 2048, maxHeight: 2048, quality: 0.85 });
        const uploaded = await api.upload.attachment(optimizedFile, {
          signal: abortController.signal,
          onProgress: (percent) => {
            useUploadStore.getState().updateProgress(tempId, percent);
          },
        });
        useUploadStore.getState().removeUpload(tempId);
        finalContent = finalContent ? `${finalContent}\n${uploaded.url}` : uploaded.url;
      }

      const confirmedMsg = await api.dms.sendMessage(activeRoom.id, { content: finalContent, attachments, reply_to_id: replyToId, is_tts: Boolean(isTTS) });
      const readyMsg: DMMessage = { ...confirmedMsg, status: 'sent', tempId };

      set((state) => {
        const replaceTemp = (list: DMMessage[]) => {
          const hasConfirmed = list.some((m) => m.id === confirmedMsg.id);
          const tempIdx = list.findIndex((m) => m.id === tempId || m.tempId === tempId);

          if (hasConfirmed) {
            if (tempIdx !== -1) {
              const copy = [...list];
              copy.splice(tempIdx, 1);
              return copy;
            }
            return list;
          }

          if (tempIdx !== -1) {
            const copy = [...list];
            copy[tempIdx] = readyMsg;
            return copy;
          }

          return [...list, readyMsg];
        };

        const nextByRoom = { ...state.messagesByRoom };
        if (nextByRoom[activeRoom.id]) {
          nextByRoom[activeRoom.id] = replaceTemp(nextByRoom[activeRoom.id]);
        }

        const nextRooms = [...state.rooms];
        const roomIdx = nextRooms.findIndex((r) => r.id === activeRoom.id);
        if (roomIdx !== -1) {
          const updatedRoom = { ...nextRooms[roomIdx], last_message: readyMsg };
          nextRooms.splice(roomIdx, 1);
          nextRooms.unshift(updatedRoom);
        }

        return {
          rooms: nextRooms,
          messages: state.activeRoom?.id === activeRoom.id ? replaceTemp(state.messages) : state.messages,
          messagesByRoom: nextByRoom,
        };
      });
    } catch (err: any) {
      if (file) {
        useUploadStore.getState().removeUpload(tempId);
        if (abortController?.signal.aborted) {
          get().removeMessageFromStore(tempId, activeRoom.id);
          return;
        }
      }
      console.error('Failed to send DM message:', err);
      set((state) => {
        const markFailed = (list: DMMessage[]) =>
          list.map((m) =>
            m.id === tempId || m.tempId === tempId
              ? { ...m, status: 'failed' as const, error: err.message || 'Falha ao enviar' }
              : m
          );

        const nextByRoom = { ...state.messagesByRoom };
        if (nextByRoom[activeRoom.id]) {
          nextByRoom[activeRoom.id] = markFailed(nextByRoom[activeRoom.id]);
        }

        return {
          messages: state.activeRoom?.id === activeRoom.id ? markFailed(state.messages) : state.messages,
          messagesByRoom: nextByRoom,
        };
      });
      throw err;
    }
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
      const existingExactIdx = roomMsgs.findIndex((m) => m.id === message.id);
      const tempMatchIdx = roomMsgs.findIndex(
        (m) =>
          m.status === 'sending' &&
          m.author_id === message.author_id &&
          (m.content === message.content ||
            (m.uploadingFile && (message.content.includes(m.content) || !m.content)))
      );

      let updatedRoomMsgs = [...roomMsgs];
      if (existingExactIdx !== -1) {
        updatedRoomMsgs[existingExactIdx] = { ...updatedRoomMsgs[existingExactIdx], ...message, status: 'sent' };
      } else if (tempMatchIdx !== -1) {
        updatedRoomMsgs[tempMatchIdx] = { ...message, status: 'sent' };
      } else {
        updatedRoomMsgs.push({ ...message, status: 'sent' });
      }

      // Cap memory at 200 messages per DM room
      if (updatedRoomMsgs.length > 200) {
        updatedRoomMsgs = updatedRoomMsgs.slice(-200);
      }

      const nextMessagesByRoom = {
        ...state.messagesByRoom,
        [message.dm_room_id]: updatedRoomMsgs,
      };

      // Reorder rooms: move this room to top and update last_message
      const nextRooms = [...state.rooms];
      const roomIdx = nextRooms.findIndex((r) => r.id === message.dm_room_id);
      if (roomIdx !== -1) {
        const updatedRoom = { ...nextRooms[roomIdx], last_message: message };
        nextRooms.splice(roomIdx, 1);
        nextRooms.unshift(updatedRoom);
      } else {
        setTimeout(() => {
          get().fetchRooms();
        }, 50);
      }

      if (state.activeRoom && state.activeRoom.id === message.dm_room_id) {
        const activeExactIdx = state.messages.findIndex((m) => m.id === message.id);
        const activeTempIdx = state.messages.findIndex(
          (m) =>
            m.status === 'sending' &&
            m.author_id === message.author_id &&
            (m.content === message.content ||
              (m.uploadingFile && (message.content.includes(m.content) || !m.content)))
        );

        let nextMessages = [...state.messages];
        if (activeExactIdx !== -1) {
          nextMessages[activeExactIdx] = { ...nextMessages[activeExactIdx], ...message, status: 'sent' };
        } else if (activeTempIdx !== -1) {
          nextMessages[activeTempIdx] = { ...message, status: 'sent', tempId: nextMessages[activeTempIdx].tempId || nextMessages[activeTempIdx].id };
        } else {
          nextMessages.push({ ...message, status: 'sent' });
        }

        if (nextMessages.length > 200) {
          nextMessages = nextMessages.slice(-200);
        }

        const isViewingThisDM = Boolean(
          (state.activeRoom && state.activeRoom.id === message.dm_room_id) ||
          isChatActiveNow('dm', message.dm_room_id)
        );

        if (message.author_id !== currentUser?.id) {
          playMessageSound(false);
        }

        const shouldPlayTTS = (message.is_tts || useSettingsStore.getState().textToSpeechEnabled) && Boolean(message.content);
        if (shouldPlayTTS && isViewingThisDM) {
          speakText(message.content, message.author?.display_name || message.author?.username);
        }
        return {
          rooms: nextRooms,
          messages: nextMessages,
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

        const nextFirstUnread = { ...state.firstUnreadMessageIdByRoom };
        if (!nextFirstUnread[message.dm_room_id]) {
          nextFirstUnread[message.dm_room_id] = message.id;
        }

        return {
          rooms: nextRooms,
          unreadRooms: unread,
          roomUnreadCounts: counts,
          messagesByRoom: nextMessagesByRoom,
          firstUnreadMessageIdByRoom: nextFirstUnread,
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

  editMessage: async (messageId: string, content: string) => {
    const { activeRoom } = get();
    if (!activeRoom) return;
    const updated = await api.dms.updateMessage(activeRoom.id, messageId, { content });
    get().handleDMMessageUpdateEvent(updated);
  },

  deleteMessage: async (messageId: string) => {
    const { activeRoom } = get();
    if (!activeRoom) return;
    await api.dms.deleteMessage(activeRoom.id, messageId);
    get().handleDMMessageDeleteEvent({ message_id: messageId, room_id: activeRoom.id });
  },

  removeMessageFromStore: (messageId: string, roomId?: string) => {
    get().handleDMMessageDeleteEvent({ message_id: messageId, room_id: roomId });
  },

  handleDMMessageUpdateEvent: (message: DMMessage) => {
    set((state) => {
      const updateMsgList = (list: DMMessage[]) =>
        list.map((m) => (m.id === message.id ? { ...m, ...message, is_edited: true } : m));

      const nextByRoom = { ...state.messagesByRoom };
      if (nextByRoom[message.dm_room_id]) {
        nextByRoom[message.dm_room_id] = updateMsgList(nextByRoom[message.dm_room_id]);
      }

      return {
        messages: state.activeRoom?.id === message.dm_room_id ? updateMsgList(state.messages) : state.messages,
        messagesByRoom: nextByRoom,
      };
    });
  },

  handleDMMessageDeleteEvent: (data: { message_id?: string; id?: string; room_id?: string; dm_room_id?: string }) => {
    const msgId = data.message_id || data.id;
    if (!msgId) return;
    const roomId = data.room_id || data.dm_room_id || get().activeRoom?.id;

    set((state) => {
      const removeMsg = (list: DMMessage[]) => list.filter((m) => m.id !== msgId && m.tempId !== msgId);

      const nextByRoom = { ...state.messagesByRoom };
      if (roomId && nextByRoom[roomId]) {
        nextByRoom[roomId] = removeMsg(nextByRoom[roomId]);
      } else {
        for (const rId in nextByRoom) {
          nextByRoom[rId] = removeMsg(nextByRoom[rId]);
        }
      }

      const nextPinnedByRoom = { ...state.pinnedMessagesByRoom };
      if (roomId && nextPinnedByRoom[roomId]) {
        nextPinnedByRoom[roomId] = removeMsg(nextPinnedByRoom[roomId]);
      }

      return {
        messages: removeMsg(state.messages),
        messagesByRoom: nextByRoom,
        pinnedMessagesByRoom: nextPinnedByRoom,
      };
    });
  },
}));
