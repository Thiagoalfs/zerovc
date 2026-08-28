import { create } from 'zustand';
import { api } from '../lib/api';
import { DMGroup, DMGroupMessage, User } from '../types';

interface DMGroupState {
  groups: DMGroup[];
  activeGroup: DMGroup | null;
  messages: DMGroupMessage[];
  messagesByGroup: Record<string, DMGroupMessage[]>;
  hasMoreByGroup: Record<string, boolean>;
  isLoadingGroups: boolean;
  isLoadingMessages: boolean;
  isLoadingMoreMessages: boolean;

  fetchGroups: () => Promise<void>;
  selectGroup: (group: DMGroup) => Promise<void>;
  selectGroupById: (id: string) => Promise<void>;
  loadMoreMessages: (groupId: string) => Promise<void>;
  createGroup: (name?: string, memberIds?: string[]) => Promise<DMGroup>;
  updateGroup: (groupId: string, data: { name?: string; icon_url?: string }) => Promise<void>;
  addMembers: (groupId: string, memberIds: string[]) => Promise<void>;
  removeMember: (groupId: string, userId: string) => Promise<void>;
  sendMessage: (content: string, attachments?: any[], replyToId?: string) => Promise<void>;
  handleGroupMessageCreate: (message: DMGroupMessage) => void;
}

export const useDMGroupStore = create<DMGroupState>((set, get) => ({
  groups: [],
  activeGroup: null,
  messages: [],
  messagesByGroup: {},
  hasMoreByGroup: {},
  isLoadingGroups: false,
  isLoadingMessages: false,
  isLoadingMoreMessages: false,

  fetchGroups: async () => {
    set({ isLoadingGroups: true });
    try {
      const groups = await api.dmGroups.list();
      set({ groups: groups || [] });
    } catch (err) {
      console.error('Failed to fetch dm groups:', err);
    } finally {
      set({ isLoadingGroups: false });
    }
  },

  selectGroup: async (group: DMGroup) => {
    const cachedMessages = get().messagesByGroup[group.id];

    set({
      activeGroup: group,
      messages: cachedMessages || [],
      isLoadingMessages: !cachedMessages,
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

    const oldestMessage = currentGroupMessages[0];
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
    set((state) => {
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

  sendMessage: async (content: string, attachments?: any[], replyToId?: string) => {
    const { activeGroup } = get();
    if (!activeGroup) return;

    try {
      const msg = await api.dmGroups.sendMessage(activeGroup.id, {
        content,
        attachments,
        reply_to_id: replyToId,
      });

      set((state) => {
        if (state.activeGroup?.id !== activeGroup.id) return state;
        const groupMsgs = state.messagesByGroup[activeGroup.id] || [];
        const exists = groupMsgs.some((m) => m.id === msg.id);
        const updatedGroupMsgs = exists ? groupMsgs : [...groupMsgs, msg];

        return {
          messages: state.messages.some((m) => m.id === msg.id) ? state.messages : [...state.messages, msg],
          messagesByGroup: {
            ...state.messagesByGroup,
            [activeGroup.id]: updatedGroupMsgs,
          },
          groups: state.groups.map((g) => (g.id === activeGroup.id ? { ...g, last_message: msg } : g)),
        };
      });
    } catch (err) {
      console.error('Failed to send group message:', err);
      throw err;
    }
  },

  handleGroupMessageCreate: (message: DMGroupMessage) => {
    set((state) => {
      const groupMsgs = state.messagesByGroup[message.group_id] || [];
      const alreadyHas = groupMsgs.some((m) => m.id === message.id);
      const updatedGroupMsgs = alreadyHas ? groupMsgs : [...groupMsgs, message];

      const isCurrentActive = state.activeGroup?.id === message.group_id;
      const updatedMessages = isCurrentActive
        ? state.messages.some((m) => m.id === message.id)
          ? state.messages
          : [...state.messages, message]
        : state.messages;

      const updatedGroups = state.groups.map((g) =>
        g.id === message.group_id ? { ...g, last_message: message } : g
      );

      return {
        messages: updatedMessages,
        messagesByGroup: {
          ...state.messagesByGroup,
          [message.group_id]: updatedGroupMsgs,
        },
        groups: updatedGroups,
      };
    });
  },
}));
