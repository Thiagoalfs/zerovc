import { create } from 'zustand';
import { Channel, Guild, Message, Role, VoiceSession } from '../types';
import { api } from '../lib/api';
import { playMessageSound } from '../utils/audio';
import { useAuthStore } from './authStore';

interface GuildState {
  guilds: Guild[];
  activeGuild: Guild | null;
  activeChannel: Channel | null;
  messages: Message[];
  unreadChannels: Set<string>;
  isLoadingGuilds: boolean;
  isLoadingMessages: boolean;
  typingUsers: Map<string, Set<string>>;

  fetchGuilds: () => Promise<void>;
  selectGuild: (guildId: string) => Promise<void>;
  selectChannel: (channel: Channel) => Promise<void>;
  createGuild: (name: string, iconUrl?: string) => Promise<Guild>;
  createChannel: (guildId: string, name: string, type: 'text' | 'voice' | 'category', topic?: string) => Promise<Channel>;
  updateChannel: (channelId: string, data: { name?: string; topic?: string; position?: number }) => Promise<void>;
  deleteChannel: (channelId: string) => Promise<void>;
  reorderChannels: (guildId: string, channelIds: string[]) => Promise<void>;

  sendMessage: (content: string, replyToId?: string) => Promise<void>;
  editMessage: (messageId: string, content: string) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  toggleReaction: (messageId: string, emoji: string) => Promise<void>;
  togglePin: (messageId: string) => Promise<void>;

  addMessage: (message: Message) => void;
  updateMessageInStore: (message: Message) => void;
  removeMessageFromStore: (messageId: string) => void;
  handleReactionEvent: (data: { message_id: string; channel_id: string; user_id: string; emoji: string; is_add: boolean }) => void;
  handlePinEvent: (data: { message_id: string; channel_id: string; is_pinned: boolean }) => void;

  updateVoiceState: (action: string, session?: VoiceSession, channelId?: string, userId?: string) => void;
  setTyping: (channelId: string, userId: string) => void;

  // Roles
  createRole: (guildId: string, name: string, color: string, permissions?: number) => Promise<Role>;
  updateRole: (guildId: string, roleId: string, data: { name?: string; color?: string; permissions?: number }) => Promise<void>;
  deleteRole: (guildId: string, roleId: string) => Promise<void>;
  assignRole: (guildId: string, userId: string, roleId: string) => Promise<void>;
  removeRole: (guildId: string, userId: string, roleId: string) => Promise<void>;
}

export const useGuildStore = create<GuildState>((set, get) => ({
  guilds: [],
  activeGuild: null,
  activeChannel: null,
  messages: [],
  unreadChannels: new Set(),
  isLoadingGuilds: false,
  isLoadingMessages: false,
  typingUsers: new Map(),

  fetchGuilds: async () => {
    set({ isLoadingGuilds: true });
    try {
      const guilds = await api.guilds.list();
      set({ guilds, isLoadingGuilds: false });
    } catch (err) {
      console.error('Failed to fetch guilds:', err);
      set({ isLoadingGuilds: false });
    }
  },

  selectGuild: async (guildId: string) => {
    try {
      const fullGuild = await api.guilds.getDetails(guildId);
      set({ activeGuild: fullGuild });

      if (fullGuild.channels && fullGuild.channels.length > 0) {
        const textChannel = fullGuild.channels.find((c: Channel) => c.type === 'text') || fullGuild.channels[0];
        get().selectChannel(textChannel);
      } else {
        set({ activeChannel: null, messages: [] });
      }
    } catch (err) {
      console.error('Failed to select guild:', err);
    }
  },

  selectChannel: async (channel: Channel) => {
    set((state) => {
      const unread = new Set(state.unreadChannels);
      unread.delete(channel.id);
      return { activeChannel: channel, unreadChannels: unread, isLoadingMessages: channel.type === 'text' };
    });

    if (channel.type === 'text') {
      try {
        const messages = await api.channels.getMessages(channel.id);
        set({ messages, isLoadingMessages: false });
      } catch (err) {
        console.error('Failed to fetch messages for channel:', err);
        set({ isLoadingMessages: false });
      }
    }
  },

  createGuild: async (name: string, iconUrl?: string) => {
    const guild = await api.guilds.create({ name, icon_url: iconUrl });
    set((state) => ({ guilds: [...state.guilds, guild] }));
    return guild;
  },

  createChannel: async (guildId: string, name: string, type: 'text' | 'voice' | 'category', topic?: string) => {
    const channel = await api.channels.create(guildId, { name, type, topic });
    set((state) => {
      if (!state.activeGuild || state.activeGuild.id !== guildId) return state;
      const channels = [...(state.activeGuild.channels || []), channel];
      return { activeGuild: { ...state.activeGuild, channels } };
    });
    return channel;
  },

  updateChannel: async (channelId: string, data) => {
    const updated = await api.channels.update(channelId, data);
    set((state) => {
      if (!state.activeGuild) return state;
      const channels = (state.activeGuild.channels || []).map((c) =>
        c.id === channelId ? { ...c, ...updated } : c
      );
      const activeChannel = state.activeChannel?.id === channelId ? { ...state.activeChannel, ...updated } : state.activeChannel;
      return {
        activeGuild: { ...state.activeGuild, channels },
        activeChannel,
      };
    });
  },

  deleteChannel: async (channelId: string) => {
    await api.channels.delete(channelId);
    set((state) => {
      if (!state.activeGuild) return state;
      const channels = (state.activeGuild.channels || []).filter((c) => c.id !== channelId);
      const activeChannel = state.activeChannel?.id === channelId ? (channels[0] || null) : state.activeChannel;
      return {
        activeGuild: { ...state.activeGuild, channels },
        activeChannel,
      };
    });
  },

  reorderChannels: async (guildId: string, channelIds: string[]) => {
    await api.channels.reorder(guildId, channelIds);
  },

  sendMessage: async (content: string, replyToId?: string) => {
    const { activeChannel } = get();
    if (!activeChannel) return;
    await api.channels.sendMessage(activeChannel.id, { content, reply_to_id: replyToId });
  },

  editMessage: async (messageId: string, content: string) => {
    const { activeChannel } = get();
    if (!activeChannel) return;
    const updated = await api.channels.updateMessage(activeChannel.id, messageId, { content });
    get().updateMessageInStore(updated);
  },

  deleteMessage: async (messageId: string) => {
    const { activeChannel } = get();
    if (!activeChannel) return;
    await api.channels.deleteMessage(activeChannel.id, messageId);
    get().removeMessageFromStore(messageId);
  },

  toggleReaction: async (messageId: string, emoji: string) => {
    const { activeChannel, messages } = get();
    if (!activeChannel) return;
    const currentUser = useAuthStore.getState().user;
    if (!currentUser) return;

    const msg = messages.find((m) => m.id === messageId);
    const existingReaction = msg?.reactions?.find((r) => r.emoji === emoji);
    const hasReacted = existingReaction?.user_ids.includes(currentUser.id);

    if (hasReacted) {
      await api.channels.removeReaction(activeChannel.id, messageId, emoji);
    } else {
      await api.channels.addReaction(activeChannel.id, messageId, emoji);
    }
  },

  togglePin: async (messageId: string) => {
    const { activeChannel } = get();
    if (!activeChannel) return;
    await api.channels.togglePin(activeChannel.id, messageId);
  },

  addMessage: (message: Message) => {
    const currentUser = useAuthStore.getState().user;
    const isMention = currentUser && message.content.includes(`@${currentUser.username}`);

    set((state) => {
      if (state.activeChannel && state.activeChannel.id === message.channel_id) {
        if (state.messages.some((m) => m.id === message.id)) return state;
        if (message.author_id !== currentUser?.id) {
          playMessageSound(!!isMention);
        }
        return { messages: [...state.messages, message] };
      } else {
        // Mark as unread
        const unread = new Set(state.unreadChannels);
        unread.add(message.channel_id);
        playMessageSound(!!isMention);
        return { unreadChannels: unread };
      }
    });
  },

  updateMessageInStore: (message: Message) => {
    set((state) => {
      if (state.activeChannel && state.activeChannel.id === message.channel_id) {
        return {
          messages: state.messages.map((m) => (m.id === message.id ? { ...m, ...message } : m)),
        };
      }
      return state;
    });
  },

  removeMessageFromStore: (messageId: string) => {
    set((state) => ({
      messages: state.messages.filter((m) => m.id !== messageId),
    }));
  },

  handleReactionEvent: ({ message_id, user_id, emoji, is_add }) => {
    set((state) => {
      const messages = state.messages.map((m) => {
        if (m.id !== message_id) return m;
        let reactions = [...(m.reactions || [])];
        const existing = reactions.find((r) => r.emoji === emoji);

        if (is_add) {
          if (existing) {
            if (!existing.user_ids.includes(user_id)) {
              reactions = reactions.map((r) =>
                r.emoji === emoji
                  ? { ...r, count: r.count + 1, user_ids: [...r.user_ids, user_id] }
                  : r
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

  handlePinEvent: ({ message_id, is_pinned }) => {
    set((state) => ({
      messages: state.messages.map((m) => (m.id === message_id ? { ...m, is_pinned } : m)),
    }));
  },

  updateVoiceState: (action: string, session?: VoiceSession, channelId?: string, userId?: string) => {
    set((state) => {
      if (!state.activeGuild || !state.activeGuild.channels) return state;

      const channels = state.activeGuild.channels.map((channel) => {
        if (action === 'join' && session && channel.id === session.channel_id) {
          const sessions = channel.voice_sessions || [];
          const exists = sessions.some((s) => s.user_id === session.user_id);
          if (exists) {
            return {
              ...channel,
              voice_sessions: sessions.map((s) => (s.user_id === session.user_id ? session : s)),
            };
          }
          return { ...channel, voice_sessions: [...sessions, session] };
        } else if (action === 'leave' && channelId && userId && channel.id === channelId) {
          const sessions = (channel.voice_sessions || []).filter((s) => s.user_id !== userId);
          return { ...channel, voice_sessions: sessions };
        } else if (action === 'state' && session && channel.id === session.channel_id) {
          const sessions = (channel.voice_sessions || []).map((s) =>
            s.user_id === session.user_id ? session : s
          );
          return { ...channel, voice_sessions: sessions };
        }
        return channel;
      });

      return { activeGuild: { ...state.activeGuild, channels } };
    });
  },

  setTyping: (channelId: string, userId: string) => {
    set((state) => {
      const nextMap = new Map(state.typingUsers);
      const currentSet = new Set(nextMap.get(channelId) || []);
      currentSet.add(userId);
      nextMap.set(channelId, currentSet);
      return { typingUsers: nextMap };
    });

    setTimeout(() => {
      set((state) => {
        const nextMap = new Map(state.typingUsers);
        const currentSet = new Set(nextMap.get(channelId) || []);
        currentSet.delete(userId);
        if (currentSet.size === 0) {
          nextMap.delete(channelId);
        } else {
          nextMap.set(channelId, currentSet);
        }
        return { typingUsers: nextMap };
      });
    }, 4000);
  },

  createRole: async (guildId: string, name: string, color: string, permissions = 0) => {
    const role = await api.roles.create(guildId, { name, color, permissions });
    set((state) => {
      if (!state.activeGuild || state.activeGuild.id !== guildId) return state;
      const roles = [...(state.activeGuild.roles || []), role];
      return { activeGuild: { ...state.activeGuild, roles } };
    });
    return role;
  },

  updateRole: async (guildId: string, roleId: string, data) => {
    const updated = await api.roles.update(guildId, roleId, data);
    set((state) => {
      if (!state.activeGuild || state.activeGuild.id !== guildId) return state;
      const roles = (state.activeGuild.roles || []).map((r) => (r.id === roleId ? { ...r, ...updated } : r));
      return { activeGuild: { ...state.activeGuild, roles } };
    });
  },

  deleteRole: async (guildId: string, roleId: string) => {
    await api.roles.delete(guildId, roleId);
    set((state) => {
      if (!state.activeGuild || state.activeGuild.id !== guildId) return state;
      const roles = (state.activeGuild.roles || []).filter((r) => r.id !== roleId);
      return { activeGuild: { ...state.activeGuild, roles } };
    });
  },

  assignRole: async (guildId: string, userId: string, roleId: string) => {
    await api.roles.assign(guildId, userId, roleId);
  },

  removeRole: async (guildId: string, userId: string, roleId: string) => {
    await api.roles.remove(guildId, userId, roleId);
  },
}));
