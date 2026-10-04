import { create } from 'zustand';
import { api } from '../lib/api';
import { useAuthStore } from './authStore';
import { useSettingsStore } from './settingsStore';
import { playMessageSound, speakText } from '../utils/audio';
import { isChatActiveNow } from '../utils/activeChat';
import { DMGroup, DMGroupMessage, User } from '../types';
import { useUploadStore } from './uploadStore';
import { optimizeImageForUpload } from '../lib/imageOptimizer';

interface DMGroupState {
  groups: DMGroup[];
  activeGroup: DMGroup | null;
  messages: DMGroupMessage[];
  unreadGroups: Set<string>;
  groupUnreadCounts: Record<string, number>;
  firstUnreadMessageIdByGroup: Record<string, string | null>;
  messagesByGroup: Record<string, DMGroupMessage[]>;
  pinnedMessagesByGroup: Record<string, DMGroupMessage[]>;
  isLoadingPinned: Record<string, boolean>;
  hasMoreByGroup: Record<string, boolean>;
  isLoadingGroups: boolean;
  isLoadingMessages: boolean;
  isLoadingMoreMessages: boolean;

  fetchGroups: () => Promise<void>;
  selectGroup: (group: DMGroup) => Promise<void>;
  selectGroupById: (id: string) => Promise<void>;
  markGroupAsRead: (groupId: string) => void;
  clearUnreadDivider: (groupId: string) => void;
  loadMoreMessages: (groupId: string) => Promise<void>;
  fetchPinnedMessages: (groupId: string) => Promise<void>;
  createGroup: (name?: string, memberIds?: string[]) => Promise<DMGroup>;
  updateGroup: (groupId: string, data: { name?: string; icon_url?: string }) => Promise<void>;
  addMembers: (groupId: string, memberIds: string[]) => Promise<void>;
  removeMember: (groupId: string, userId: string) => Promise<void>;
  leaveGroup: (groupId: string) => Promise<void>;
  transferOwnership: (groupId: string, newOwnerId: string) => Promise<void>;
  sendMessage: (content: string, attachments?: any[], replyToId?: string, isTTS?: boolean, file?: File) => Promise<void>;
  editMessage: (messageId: string, content: string) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  togglePin: (messageId: string) => Promise<void>;
  removeMessageFromStore: (messageId: string, groupId?: string) => void;
  handleGroupMessageCreate: (message: DMGroupMessage) => void;
  handleGroupMessageUpdate: (message: DMGroupMessage) => void;
  handleGroupMessageDelete: (data: { message_id?: string; id?: string; group_id?: string }) => void;
  handleGroupPinEvent: (data: { message_id: string; group_id: string; is_pinned: boolean }) => void;
  handleGroupUpdate: (group: DMGroup) => void;
  handleGroupLeave: (data: { group_id: string }) => void;
}

export const useDMGroupStore = create<DMGroupState>((set, get) => ({
  groups: [],
  activeGroup: null,
  messages: [],
  unreadGroups: new Set(),
  groupUnreadCounts: {},
  firstUnreadMessageIdByGroup: {},
  messagesByGroup: {},
  pinnedMessagesByGroup: {},
  isLoadingPinned: {},
  hasMoreByGroup: {},
  isLoadingGroups: false,
  isLoadingMessages: false,
  isLoadingMoreMessages: false,

  fetchGroups: async () => {
    set({ isLoadingGroups: true });
    try {
      const groups = await api.dmGroups.list();
      const sortedGroups = (groups || []).sort((a, b) => {
        const aTime = a.last_message?.created_at ? new Date(a.last_message.created_at).getTime() : new Date(a.created_at).getTime();
        const bTime = b.last_message?.created_at ? new Date(b.last_message.created_at).getTime() : new Date(b.created_at).getTime();
        return bTime - aTime;
      });
      set({ groups: sortedGroups });
    } catch (err) {
      console.error('Failed to fetch dm groups:', err);
    } finally {
      set({ isLoadingGroups: false });
    }
  },

  selectGroup: async (group: DMGroup) => {
    try {
      localStorage.setItem('zerovc_last_dm_target', `/@me/group/${group.id}`);
    } catch {}

    const cachedMessages = get().messagesByGroup[group.id];

    set((state) => {
      const wasUnread = state.unreadGroups.has(group.id);
      const unread = new Set(state.unreadGroups);
      unread.delete(group.id);
      const counts = { ...state.groupUnreadCounts };
      delete counts[group.id];
      const nextFirstUnread = { ...state.firstUnreadMessageIdByGroup };
      if (!wasUnread) {
        nextFirstUnread[group.id] = null;
      }

      return {
        activeGroup: group,
        messages: cachedMessages || [],
        unreadGroups: unread,
        groupUnreadCounts: counts,
        firstUnreadMessageIdByGroup: nextFirstUnread,
        isLoadingMessages: !cachedMessages,
      };
    });

    if (!cachedMessages) {
      try {
        const messages = await api.dmGroups.getMessages(group.id, 50);
        set((state) => ({
          messages: state.activeGroup?.id === group.id ? messages : state.messages,
          messagesByGroup: {
            ...state.messagesByGroup,
            [group.id]: messages || [],
          },
          hasMoreByGroup: {
            ...state.hasMoreByGroup,
            [group.id]: (messages || []).length === 50,
          },
          isLoadingMessages: false,
        }));
      } catch (err) {
        console.error('Failed to fetch group messages:', err);
        set({ isLoadingMessages: false });
      }
    }
  },

  markGroupAsRead: (groupId: string) => {
    set((state) => {
      const unread = new Set(state.unreadGroups);
      unread.delete(groupId);
      const counts = { ...state.groupUnreadCounts };
      delete counts[groupId];
      const nextFirstUnread = { ...state.firstUnreadMessageIdByGroup };
      nextFirstUnread[groupId] = null;
      return {
        unreadGroups: unread,
        groupUnreadCounts: counts,
        firstUnreadMessageIdByGroup: nextFirstUnread,
      };
    });
  },

  clearUnreadDivider: (groupId: string) => {
    set((state) => ({
      firstUnreadMessageIdByGroup: {
        ...state.firstUnreadMessageIdByGroup,
        [groupId]: null,
      },
    }));
  },

  selectGroupById: async (id: string) => {
    let group = get().groups.find((g) => g.id === id);
    if (!group) {
      try {
        group = await api.dmGroups.get(id);
        if (group) {
          set((state) => ({ groups: [group!, ...state.groups] }));
        }
      } catch (err) {
        console.error('Failed to get group by id:', err);
        return;
      }
    }
    if (group) {
      await get().selectGroup(group);
    }
  },

  loadMoreMessages: async (groupId: string) => {
    const state = get();
    if (state.isLoadingMoreMessages || state.hasMoreByGroup[groupId] === false) return;

    const currentGroupMessages = state.messagesByGroup[groupId] || state.messages;
    if (currentGroupMessages.length === 0) return;

    const oldestMessage = currentGroupMessages.find((m) => !m.id.startsWith('temp-')) || currentGroupMessages[0];
    set({ isLoadingMoreMessages: true });

    try {
      const olderMessages = await api.dmGroups.getMessages(groupId, 50, oldestMessage.created_at || oldestMessage.id);
      const hasMore = olderMessages.length === 50;

      const existingIds = new Set(currentGroupMessages.map((m) => m.id));
      const uniqueOlder = olderMessages.filter((m) => !existingIds.has(m.id));
      const combined = [...uniqueOlder, ...currentGroupMessages];

      set((curr) => ({
        messages: curr.activeGroup?.id === groupId ? combined : curr.messages,
        messagesByGroup: {
          ...curr.messagesByGroup,
          [groupId]: combined,
        },
        hasMoreByGroup: {
          ...curr.hasMoreByGroup,
          [groupId]: hasMore,
        },
        isLoadingMoreMessages: false,
      }));
    } catch (err) {
      console.error('Failed to load older group messages:', err);
      set({ isLoadingMoreMessages: false });
    }
  },

  createGroup: async (name?: string, memberIds: string[] = []) => {
    const group = await api.dmGroups.create({ name, member_ids: memberIds });
    set((state) => ({ groups: [group, ...state.groups], activeGroup: group }));
    return group;
  },

  updateGroup: async (groupId: string, data) => {
    const updated = await api.dmGroups.update(groupId, data);
    set((state) => ({
      groups: state.groups.map((g) => (g.id === groupId ? { ...g, ...updated } : g)),
      activeGroup: state.activeGroup?.id === groupId ? { ...state.activeGroup, ...updated } : state.activeGroup,
    }));
  },

  addMembers: async (groupId: string, memberIds: string[]) => {
    const members = await api.dmGroups.addMembers(groupId, memberIds);
    set((state) => ({
      groups: state.groups.map((g) => (g.id === groupId ? { ...g, members } : g)),
      activeGroup: state.activeGroup?.id === groupId ? { ...state.activeGroup, members } : state.activeGroup,
    }));
  },

  removeMember: async (groupId: string, userId: string) => {
    await api.dmGroups.removeMember(groupId, userId);
    const currentUserId = useAuthStore.getState().user?.id;
    const isSelf = userId === currentUserId;

    set((state) => {
      if (isSelf) {
        try {
          const saved = localStorage.getItem('zerovc_last_dm_target');
          if (saved === `/@me/group/${groupId}`) {
            localStorage.removeItem('zerovc_last_dm_target');
          }
        } catch {}

        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('zerovc:nav-home', { detail: { target: 'friends' } }));
        }

        return {
          groups: state.groups.filter((g) => g.id !== groupId),
          activeGroup: state.activeGroup?.id === groupId ? null : state.activeGroup,
        };
      }
      const nextGroups = state.groups.map((g) => {
        if (g.id !== groupId) return g;
        return { ...g, members: (g.members || []).filter((m) => m.id !== userId) };
      });
      const nextActive =
        state.activeGroup?.id === groupId
          ? { ...state.activeGroup, members: (state.activeGroup.members || []).filter((m) => m.id !== userId) }
          : state.activeGroup;
      return { groups: nextGroups, activeGroup: nextActive };
    });
  },

  leaveGroup: async (groupId: string) => {
    const currentUserId = useAuthStore.getState().user?.id;
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('zerovc:nav-home', { detail: { target: 'friends' } }));
    }
    if (currentUserId) {
      await get().removeMember(groupId, currentUserId);
    }
  },

  transferOwnership: async (groupId: string, newOwnerId: string) => {
    const updated = await api.dmGroups.transferOwnership(groupId, newOwnerId);
    set((state) => ({
      groups: state.groups.map((g) => (g.id === groupId ? { ...g, ...updated, owner_id: newOwnerId } : g)),
      activeGroup: state.activeGroup?.id === groupId ? { ...state.activeGroup, ...updated, owner_id: newOwnerId } : state.activeGroup,
    }));
  },

  sendMessage: async (content: string, attachments?: any[], replyToId?: string, isTTS?: boolean, file?: File) => {
    const { activeGroup, messages } = get();
    if (!activeGroup) return;
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
        onCancel: () => get().removeMessageFromStore(tempId, activeGroup.id),
      });
    }

    const tempMsg: DMGroupMessage = {
      id: tempId,
      tempId,
      group_id: activeGroup.id,
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

    set((state) => {
      if (state.activeGroup?.id !== activeGroup.id) return state;
      const groupMsgs = state.messagesByGroup[activeGroup.id] || [];
      return {
        messages: [...state.messages, tempMsg],
        messagesByGroup: {
          ...state.messagesByGroup,
          [activeGroup.id]: [...groupMsgs, tempMsg],
        },
        firstUnreadMessageIdByGroup: {
          ...state.firstUnreadMessageIdByGroup,
          [activeGroup.id]: null,
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

      const confirmedMsg = await api.dmGroups.sendMessage(activeGroup.id, {
        content: finalContent,
        attachments,
        reply_to_id: replyToId,
        is_tts: Boolean(isTTS),
      });
      const readyMsg: DMGroupMessage = { ...confirmedMsg, status: 'sent', tempId };

      set((state) => {
        if (state.activeGroup?.id !== activeGroup.id) return state;
        const replaceTemp = (list: DMGroupMessage[]) => {
          const confirmedIdx = list.findIndex((m) => m.id === confirmedMsg.id);
          const tempIdx = list.findIndex((m) => m.id === tempId || m.tempId === tempId);

          if (confirmedIdx !== -1) {
            const copy = [...list];
            copy[confirmedIdx] = { ...copy[confirmedIdx], ...readyMsg, status: 'sent' };
            if (tempIdx !== -1 && tempIdx !== confirmedIdx) {
              copy.splice(tempIdx, 1);
            }
            return copy;
          }

          if (tempIdx !== -1) {
            const copy = [...list];
            copy[tempIdx] = readyMsg;
            return copy;
          }

          return [...list, readyMsg];
        };

        const groupMsgs = state.messagesByGroup[activeGroup.id] || [];
        const nextGroupMsgs = replaceTemp(groupMsgs);

        const nextGroups = [...state.groups];
        const groupIdx = nextGroups.findIndex((g) => g.id === activeGroup.id);
        if (groupIdx !== -1) {
          const updatedGroup = { ...nextGroups[groupIdx], last_message: readyMsg };
          nextGroups.splice(groupIdx, 1);
          nextGroups.unshift(updatedGroup);
        }

        return {
          groups: nextGroups,
          messages: replaceTemp(state.messages),
          messagesByGroup: {
            ...state.messagesByGroup,
            [activeGroup.id]: nextGroupMsgs,
          },
        };
      });
    } catch (err: any) {
      if (file) {
        useUploadStore.getState().removeUpload(tempId);
        if (abortController?.signal.aborted) {
          get().removeMessageFromStore(tempId, activeGroup.id);
          return;
        }
      }
      console.error('Failed to send group message:', err);
      set((state) => {
        const markFailed = (list: DMGroupMessage[]) =>
          list.map((m) =>
            m.id === tempId || m.tempId === tempId
              ? { ...m, status: 'failed' as const, error: err.message || 'Falha ao enviar' }
              : m
          );

        const groupMsgs = state.messagesByGroup[activeGroup.id] || [];
        return {
          messages: markFailed(state.messages),
          messagesByGroup: {
            ...state.messagesByGroup,
            [activeGroup.id]: markFailed(groupMsgs),
          },
        };
      });
      throw err;
    }
  },

  handleGroupMessageCreate: (message: DMGroupMessage) => {
    const currentUser = useAuthStore.getState().user;
    set((state) => {
      const groupMsgs = state.messagesByGroup[message.group_id] || [];
      const existingExactIdx = groupMsgs.findIndex((m) => m.id === message.id);
      const tempMatchIdx = groupMsgs.findIndex(
        (m) =>
          m.status === 'sending' &&
          m.author_id === message.author_id &&
          (m.content === message.content ||
            (m.uploadingFile && (message.content.includes(m.content) || !m.content)))
      );

      let updatedGroupMsgs = [...groupMsgs];
      if (existingExactIdx !== -1) {
        updatedGroupMsgs[existingExactIdx] = { ...updatedGroupMsgs[existingExactIdx], ...message, status: 'sent' };
      } else if (tempMatchIdx !== -1) {
        updatedGroupMsgs[tempMatchIdx] = {
          ...message,
          status: 'sent',
          tempId: updatedGroupMsgs[tempMatchIdx].tempId || updatedGroupMsgs[tempMatchIdx].id,
        };
      } else {
        updatedGroupMsgs.push({ ...message, status: 'sent' });
      }

      if (updatedGroupMsgs.length > 200) {
        updatedGroupMsgs = updatedGroupMsgs.slice(-200);
      }

      const nextMessagesByGroup = {
        ...state.messagesByGroup,
        [message.group_id]: updatedGroupMsgs,
      };

      // Reorder groups: move to top
      const nextGroups = [...state.groups];
      const groupIdx = nextGroups.findIndex((g) => g.id === message.group_id);
      if (groupIdx !== -1) {
        const updatedGroup = { ...nextGroups[groupIdx], last_message: message };
        nextGroups.splice(groupIdx, 1);
        nextGroups.unshift(updatedGroup);
      } else {
        setTimeout(() => {
          get().fetchGroups();
        }, 50);
      }

      const isCurrentActive = state.activeGroup?.id === message.group_id;
      if (isCurrentActive) {
        const activeExactIdx = state.messages.findIndex((m) => m.id === message.id);
        const activeTempIdx = state.messages.findIndex(
          (m) =>
            m.status === 'sending' &&
            m.author_id === message.author_id &&
            (m.content === message.content ||
              (m.uploadingFile && (message.content.includes(m.content) || !m.content)))
        );
        let nextMsgs = [...state.messages];
        if (activeExactIdx !== -1) {
          nextMsgs[activeExactIdx] = { ...nextMsgs[activeExactIdx], ...message, status: 'sent' };
        } else if (activeTempIdx !== -1) {
          nextMsgs[activeTempIdx] = { ...message, status: 'sent', tempId: nextMsgs[activeTempIdx].tempId || nextMsgs[activeTempIdx].id };
        } else {
          nextMsgs.push({ ...message, status: 'sent' });
        }
        if (nextMsgs.length > 200) {
          nextMsgs = nextMsgs.slice(-200);
        }

        const isViewingThisGroup = Boolean(
          (state.activeGroup && state.activeGroup.id === message.group_id) ||
          isChatActiveNow('group', message.group_id)
        );

        if (message.author_id !== currentUser?.id) {
          playMessageSound(false);
        }

        const shouldPlayTTS = (message.is_tts || useSettingsStore.getState().textToSpeechEnabled) && Boolean(message.content);
        if (shouldPlayTTS && isViewingThisGroup) {
          speakText(message.content, message.author?.display_name || message.author?.username);
        }

        return {
          groups: nextGroups,
          messages: nextMsgs,
          messagesByGroup: nextMessagesByGroup,
        };
      } else {
        const unread = new Set(state.unreadGroups);
        unread.add(message.group_id);
        const counts = { ...state.groupUnreadCounts };
        if (message.author_id !== currentUser?.id) {
          counts[message.group_id] = (counts[message.group_id] || 0) + 1;
        }
        playMessageSound(false);

        const nextFirstUnread = { ...state.firstUnreadMessageIdByGroup };
        if (!nextFirstUnread[message.group_id]) {
          nextFirstUnread[message.group_id] = message.id;
        }

        return {
          groups: nextGroups,
          unreadGroups: unread,
          groupUnreadCounts: counts,
          messagesByGroup: nextMessagesByGroup,
          firstUnreadMessageIdByGroup: nextFirstUnread,
        };
      }
    });
  },

  editMessage: async (messageId: string, content: string) => {
    const { activeGroup } = get();
    if (!activeGroup) return;
    const updated = await api.dmGroups.updateMessage(activeGroup.id, messageId, { content });
    get().handleGroupMessageUpdate(updated);
  },

  deleteMessage: async (messageId: string) => {
    const { activeGroup } = get();
    if (!activeGroup) return;
    await api.dmGroups.deleteMessage(activeGroup.id, messageId);
    get().handleGroupMessageDelete({ message_id: messageId, group_id: activeGroup.id });
  },

  removeMessageFromStore: (messageId: string, groupId?: string) => {
    get().handleGroupMessageDelete({ message_id: messageId, group_id: groupId });
  },

  fetchPinnedMessages: async (groupId: string) => {
    set((state) => ({
      isLoadingPinned: { ...state.isLoadingPinned, [groupId]: true },
    }));
    try {
      const pins = await api.dmGroups.getPinnedMessages(groupId);
      set((state) => ({
        pinnedMessagesByGroup: {
          ...state.pinnedMessagesByGroup,
          [groupId]: pins,
        },
        isLoadingPinned: { ...state.isLoadingPinned, [groupId]: false },
      }));
    } catch (err) {
      console.error('Failed to fetch pinned group messages:', err);
      set((state) => ({
        isLoadingPinned: { ...state.isLoadingPinned, [groupId]: false },
      }));
    }
  },

  togglePin: async (messageId: string) => {
    const { activeGroup } = get();
    if (!activeGroup) return;
    await api.dmGroups.togglePin(activeGroup.id, messageId);
  },

  handleGroupPinEvent: ({ message_id, group_id, is_pinned }) => {
    set((state) => {
      const updateMsgList = (list: DMGroupMessage[]) =>
        list.map((m) => (m.id === message_id ? { ...m, is_pinned } : m));

      const nextMessagesByGroup = { ...state.messagesByGroup };
      if (nextMessagesByGroup[group_id]) {
        nextMessagesByGroup[group_id] = updateMsgList(nextMessagesByGroup[group_id]);
      }

      const currentPinned = state.pinnedMessagesByGroup[group_id] || [];
      let nextPinned: DMGroupMessage[];

      if (is_pinned) {
        const found =
          state.messagesByGroup[group_id]?.find((m) => m.id === message_id) ||
          (state.activeGroup?.id === group_id ? state.messages.find((m) => m.id === message_id) : undefined);

        if (found) {
          const pinnedMsg = { ...found, is_pinned: true };
          const alreadyInPinned = currentPinned.some((m) => m.id === message_id);
          nextPinned = alreadyInPinned
            ? currentPinned.map((m) => (m.id === message_id ? pinnedMsg : m))
            : [pinnedMsg, ...currentPinned];
        } else {
          nextPinned = currentPinned;
          setTimeout(() => {
            get().fetchPinnedMessages(group_id);
          }, 50);
        }
      } else {
        nextPinned = currentPinned.filter((m) => m.id !== message_id);
      }

      const nextPinnedByGroup = {
        ...state.pinnedMessagesByGroup,
        [group_id]: nextPinned,
      };

      return {
        messages: state.activeGroup?.id === group_id ? updateMsgList(state.messages) : state.messages,
        messagesByGroup: nextMessagesByGroup,
        pinnedMessagesByGroup: nextPinnedByGroup,
      };
    });
  },

  handleGroupMessageUpdate: (message: DMGroupMessage) => {
    set((state) => {
      const updateMsgList = (list: DMGroupMessage[]) =>
        list.map((m) => (m.id === message.id ? { ...m, ...message, is_edited: true } : m));

      const nextByGroup = { ...state.messagesByGroup };
      if (nextByGroup[message.group_id]) {
        nextByGroup[message.group_id] = updateMsgList(nextByGroup[message.group_id]);
      }

      const nextPinnedByGroup = { ...state.pinnedMessagesByGroup };
      if (nextPinnedByGroup[message.group_id]) {
        if (message.is_pinned) {
          const exists = nextPinnedByGroup[message.group_id].some((m) => m.id === message.id);
          if (exists) {
            nextPinnedByGroup[message.group_id] = nextPinnedByGroup[message.group_id].map((m) =>
              m.id === message.id ? { ...m, ...message, is_edited: true } : m
            );
          } else {
            nextPinnedByGroup[message.group_id] = [message, ...nextPinnedByGroup[message.group_id]];
          }
        } else {
          nextPinnedByGroup[message.group_id] = nextPinnedByGroup[message.group_id].filter(
            (m) => m.id !== message.id
          );
        }
      }

      return {
        messages: state.activeGroup?.id === message.group_id ? updateMsgList(state.messages) : state.messages,
        messagesByGroup: nextByGroup,
        pinnedMessagesByGroup: nextPinnedByGroup,
      };
    });
  },

  handleGroupMessageDelete: (data: { message_id?: string; id?: string; group_id?: string }) => {
    const msgId = data.message_id || data.id;
    if (!msgId) return;
    const groupId = data.group_id || get().activeGroup?.id;

    set((state) => {
      const removeMsg = (list: DMGroupMessage[]) => list.filter((m) => m.id !== msgId && m.tempId !== msgId);

      const nextByGroup = { ...state.messagesByGroup };
      if (groupId && nextByGroup[groupId]) {
        nextByGroup[groupId] = removeMsg(nextByGroup[groupId]);
      } else {
        for (const gId in nextByGroup) {
          nextByGroup[gId] = removeMsg(nextByGroup[gId]);
        }
      }

      const nextPinnedByGroup = { ...state.pinnedMessagesByGroup };
      if (groupId && nextPinnedByGroup[groupId]) {
        nextPinnedByGroup[groupId] = removeMsg(nextPinnedByGroup[groupId]);
      }

      return {
        messages: removeMsg(state.messages),
        messagesByGroup: nextByGroup,
        pinnedMessagesByGroup: nextPinnedByGroup,
      };
    });
  },

  handleGroupUpdate: (group: DMGroup) => {
    set((state) => {
      const exists = state.groups.some((g) => g.id === group.id);
      const nextGroups = exists
        ? state.groups.map((g) => (g.id === group.id ? { ...g, ...group } : g))
        : [group, ...state.groups];
      return {
        groups: nextGroups,
        activeGroup: state.activeGroup?.id === group.id ? { ...state.activeGroup, ...group } : state.activeGroup,
      };
    });
  },

  handleGroupLeave: (data: { group_id: string }) => {
    const groupId = data.group_id;
    const wasActive = get().activeGroup?.id === groupId;
    try {
      const saved = localStorage.getItem('zerovc_last_dm_target');
      if (saved === `/@me/group/${groupId}`) {
        localStorage.removeItem('zerovc_last_dm_target');
      }
    } catch {}

    set((state) => ({
      groups: state.groups.filter((g) => g.id !== groupId),
      activeGroup: state.activeGroup?.id === groupId ? null : state.activeGroup,
    }));

    if (wasActive && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('zerovc:nav-home', { detail: { target: 'friends' } }));
    }
  },
}));
