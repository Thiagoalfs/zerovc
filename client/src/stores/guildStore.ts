import { create } from 'zustand';
import { Channel, Guild, Message, VoiceSession } from '../types';
import { api } from '../lib/api';

interface GuildState {
  guilds: Guild[];
  activeGuild: Guild | null;
  activeChannel: Channel | null;
  messages: Message[];
  isLoadingGuilds: boolean;
  isLoadingMessages: boolean;
  typingUsers: Map<string, Set<string>>; // channelId -> Set<userId>

  fetchGuilds: () => Promise<void>;
  selectGuild: (guildId: string) => Promise<void>;
  selectChannel: (channel: Channel) => Promise<void>;
  createGuild: (name: string, iconUrl?: string) => Promise<Guild>;
  createChannel: (guildId: string, name: string, type: 'text' | 'voice', topic?: string) => Promise<Channel>;
  sendMessage: (content: string) => Promise<void>;
  addMessage: (message: Message) => void;
  updateVoiceState: (action: string, session?: VoiceSession, channelId?: string, userId?: string) => void;
  setTyping: (channelId: string, userId: string) => void;
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

      if (guilds.length > 0 && !get().activeGuild) {
        get().selectGuild(guilds[0].id);
      }
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
        const textChannel = fullGuild.channels.find((c) => c.type === 'text') || fullGuild.channels[0];
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

  sendMessage: async (content: string) => {
    const { activeChannel } = get();
    if (!activeChannel) return;
    await api.channels.sendMessage(activeChannel.id, { content });
  },

  addMessage: (message: Message) => {
    set((state) => {
      if (state.activeChannel && state.activeChannel.id === message.channel_id) {
        if (state.messages.some((m) => m.id === message.id)) {
          return state;
        }
        return { messages: [...state.messages, message] };
      }
      return state;
    });
  },

  updateVoiceState: (action: string, session?: VoiceSession, channelId?: string, userId?: string) => {
    set((state) => {
      if (!state.activeGuild || !state.activeGuild.channels) return state;

      const targetUserId = session?.user_id || userId;
      if (!targetUserId) return state;

      const updatedChannels = state.activeGuild.channels.map((ch) => {
        if (ch.type !== 'voice') return ch;

        let sessions = ch.voice_sessions ? [...ch.voice_sessions] : [];

        // 1. Always purge user from ALL channels to prevent phantom duplicate listings
        sessions = sessions.filter((s) => s.user_id !== targetUserId);

        // 2. Add user back ONLY if joining or updating this specific channel
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
}));
