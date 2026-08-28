import { create } from 'zustand';
import { Channel, Guild, Message, Role, VoiceSession } from '../types';
import { api } from '../lib/api';

interface GuildState {
  guilds: Guild[];
  activeGuild: Guild | null;
  activeChannel: Channel | null;
  messages: Message[];
  isLoadingGuilds: boolean;
  isLoadingMessages: boolean;
  typingUsers: Map<string, Set<string>>;

  fetchGuilds: () => Promise<void>;
  selectGuild: (guildId: string) => Promise<void>;
  selectChannel: (channel: Channel) => Promise<void>;
  createGuild: (name: string, iconUrl?: string) => Promise<Guild>;
  createChannel: (guildId: string, name: string, type: 'text' | 'voice', topic?: string) => Promise<Channel>;
  updateChannel: (channelId: string, data: { name?: string; topic?: string; position?: number }) => Promise<void>;
  deleteChannel: (channelId: string) => Promise<void>;
  reorderChannels: (guildId: string, channelIds: string[]) => Promise<void>;

  sendMessage: (content: string) => Promise<void>;
  editMessage: (messageId: string, content: string) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  addMessage: (message: Message) => void;
  updateMessageInStore: (message: Message) => void;
  removeMessageFromStore: (messageId: string) => void;

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
      console.error('Failed to get guild details:', err);
    }
  },

  selectChannel: async (channel: Channel) => {
    set({ activeChannel: channel, messages: [], isLoadingMessages: true });
    if (channel.type === 'text') {
      try {
        const messages = await api.channels.getMessages(channel.id);
        set({ messages, isLoadingMessages: false });
      } catch (err) {
        console.error('Failed to get messages:', err);
        set({ isLoadingMessages: false });
      }
    } else {
      set({ isLoadingMessages: false });
    }
  },

  createGuild: async (name: string, iconUrl?: string) => {
    const newGuild = await api.guilds.create({ name, icon_url: iconUrl });
    const fullGuild = await api.guilds.getDetails(newGuild.id);
    set((state) => ({
      guilds: [...state.guilds, fullGuild],
      activeGuild: fullGuild,
    }));
    if (fullGuild.channels && fullGuild.channels.length > 0) {
      get().selectChannel(fullGuild.channels[0]);
    }
    return fullGuild;
  },

  createChannel: async (guildId: string, name: string, type: 'text' | 'voice', topic?: string) => {
    const channel = await api.guilds.createChannel(guildId, { name, type, topic });
    set((state) => {
      if (state.activeGuild && state.activeGuild.id === guildId) {
        return {
          activeGuild: {
            ...state.activeGuild,
            channels: [...(state.activeGuild.channels || []), channel],
          },
        };
      }
      return state;
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

  sendMessage: async (content: string) => {
    const { activeChannel } = get();
    if (!activeChannel) return;
    await api.channels.sendMessage(activeChannel.id, { content });
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

  addMessage: (message: Message) => {
    set((state) => {
      if (state.activeChannel && state.activeChannel.id === message.channel_id) {
        if (state.messages.some((m) => m.id === message.id)) return state;
        return { messages: [...state.messages, message] };
      }
      return state;
    });
  },

  updateMessageInStore: (message: Message) => {
    set((state) => {
      if (state.activeChannel && state.activeChannel.id === message.channel_id) {
        return {
          messages: state.messages.map((m) => (m.id === message.id ? message : m)),
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

  updateVoiceState: (action: string, session?: VoiceSession, channelId?: string, userId?: string) => {
    set((state) => {
      if (!state.activeGuild || !state.activeGuild.channels) return state;

      const targetUserId = session?.user_id || userId;
      if (!targetUserId) return state;

      const updatedChannels = state.activeGuild.channels.map((ch) => {
        if (ch.type !== 'voice') return ch;

        let sessions = ch.voice_sessions ? [...ch.voice_sessions] : [];
        sessions = sessions.filter((s) => s.user_id !== targetUserId);

        if ((action === 'join' || action === 'update') && session && ch.id === session.channel_id) {
          sessions.push(session);
        }

        return { ...ch, voice_sessions: sessions };
      });

      return {
        activeGuild: {
          ...state.activeGuild,
          channels: updatedChannels,
        },
      };
    });
  },

  setTyping: (channelId: string, userId: string) => {
    set((state) => {
      const map = new Map(state.typingUsers);
      const setForChan = new Set(map.get(channelId) || []);
      setForChan.add(userId);
      map.set(channelId, setForChan);

      setTimeout(() => {
        set((curr) => {
          const m = new Map(curr.typingUsers);
          const s = m.get(channelId);
          if (s) {
            s.delete(userId);
            if (s.size === 0) m.delete(channelId);
            else m.set(channelId, s);
          }
          return { typingUsers: m };
        });
      }, 4000);

      return { typingUsers: map };
    });
  },

  createRole: async (guildId: string, name: string, color: string, permissions?: number) => {
    const role = await api.roles.create(guildId, { name, color, permissions });
    set((state) => {
      if (state.activeGuild && state.activeGuild.id === guildId) {
        return {
          activeGuild: {
            ...state.activeGuild,
            roles: [...(state.activeGuild.roles || []), role],
          },
        };
      }
      return state;
    });
    return role;
  },

  updateRole: async (guildId: string, roleId: string, data) => {
    const role = await api.roles.update(guildId, roleId, data);
    set((state) => {
      if (state.activeGuild && state.activeGuild.id === guildId) {
        return {
          activeGuild: {
            ...state.activeGuild,
            roles: (state.activeGuild.roles || []).map((r) => (r.id === roleId ? role : r)),
          },
        };
      }
      return state;
    });
  },

  deleteRole: async (guildId: string, roleId: string) => {
    await api.roles.delete(guildId, roleId);
    set((state) => {
      if (state.activeGuild && state.activeGuild.id === guildId) {
        return {
          activeGuild: {
            ...state.activeGuild,
            roles: (state.activeGuild.roles || []).filter((r) => r.id !== roleId),
          },
        };
      }
      return state;
    });
  },

  assignRole: async (guildId: string, userId: string, roleId: string) => {
    await api.roles.assign(guildId, userId, roleId);
    get().selectGuild(guildId);
  },

  removeRole: async (guildId: string, userId: string, roleId: string) => {
    await api.roles.remove(guildId, userId, roleId);
    get().selectGuild(guildId);
  },
}));
