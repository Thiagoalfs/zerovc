import { create } from 'zustand';
import { Channel, Guild, Message, Role, VoiceSession, User } from '../types';
import { api } from '../lib/api';
import { playMessageSound } from '../utils/audio';
import { useAuthStore } from './authStore';

interface GuildState {
  guilds: Guild[];
  activeGuild: Guild | null;
  activeChannel: Channel | null;
  messages: Message[];
  unreadChannels: Set<string>;
  guildMentions: Record<string, number>;
  channelMentions: Record<string, number>;
  messagesByChannel: Record<string, Message[]>;
  hasMoreByChannel: Record<string, boolean>;
  isLoadingGuilds: boolean;
  isLoadingMessages: boolean;
  isLoadingMoreMessages: boolean;
  typingUsers: Map<string, Set<string>>;

  fetchGuilds: () => Promise<void>;
  selectGuild: (guildId: string, initialChannelId?: string) => Promise<void>;
  selectChannel: (channel: Channel) => Promise<void>;
  loadMoreMessages: (channelId: string) => Promise<void>;
  createGuild: (name: string, iconUrl?: string) => Promise<Guild>;
  createChannel: (guildId: string, name: string, type: 'text' | 'voice' | 'category', topic?: string, categoryId?: string, isPrivate?: boolean, roleIds?: string[]) => Promise<Channel>;
  updateChannel: (channelId: string, data: { name?: string; topic?: string; position?: number; category_id?: string; clear_category?: boolean }) => Promise<void>;
  deleteChannel: (channelId: string) => Promise<void>;
  reorderChannels: (guildId: string, payload: string[] | Array<{ id: string; position: number; category_id?: string; clear_category?: boolean }>) => Promise<void>;

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
  updateMemberInGuild: (user: Partial<User> & { id: string }) => void;
  handleGuildMemberAdd: (guildId: string, member: User) => void;
  handleGuildMemberRemove: (guildId: string, userId: string) => void;
  handleGuildMemberUpdate: (guildId: string, userId: string, data: Partial<User>) => void;
  handlePresenceUpdate: (userId: string, status: string, customStatus?: string) => void;

  updateVoiceState: (action: string, session?: VoiceSession, channelId?: string, userId?: string) => void;
  setTyping: (channelId: string, userId: string) => void;

  // Roles
  createRole: (guildId: string, name: string, color: string, permissions?: number) => Promise<Role>;
  updateRole: (guildId: string, roleId: string, data: { name?: string; color?: string; permissions?: number }) => Promise<void>;
  deleteRole: (guildId: string, roleId: string) => Promise<void>;
  assignRole: (guildId: string, userId: string, roleId: string) => Promise<void>;
  removeRole: (guildId: string, userId: string, roleId: string) => Promise<void>;

  // Moderation
  kickMember: (guildId: string, userId: string) => Promise<void>;
  banMember: (guildId: string, userId: string, reason?: string) => Promise<void>;
  unbanMember: (guildId: string, userId: string) => Promise<void>;
  muteMember: (guildId: string, userId: string, durationSeconds: number) => Promise<void>;
}

export const useGuildStore = create<GuildState>((set, get) => ({
  guilds: [],
  activeGuild: null,
  activeChannel: null,
  messages: [],
  unreadChannels: new Set(),
  guildMentions: {},
  channelMentions: {},
  messagesByChannel: {},
  hasMoreByChannel: {},
  isLoadingGuilds: false,
  isLoadingMessages: false,
  isLoadingMoreMessages: false,
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

  selectGuild: async (guildId: string, initialChannelId?: string) => {
    try {
      const fullGuild = await api.guilds.getDetails(guildId);
      set({ activeGuild: fullGuild });

      if (fullGuild.channels && fullGuild.channels.length > 0) {
        const targetChannel = initialChannelId
          ? fullGuild.channels.find((c: Channel) => c.id === initialChannelId) || fullGuild.channels[0]
          : fullGuild.channels.find((c: Channel) => c.type === 'text') || fullGuild.channels[0];
        get().selectChannel(targetChannel);
      } else {
        set({ activeChannel: null, messages: [] });
      }
    } catch (err) {
      console.error('Failed to select guild:', err);
    }
  },

  selectChannel: async (channel: Channel) => {
    const cachedMessages = get().messagesByChannel[channel.id];

    set((state) => {
      const unread = new Set(state.unreadChannels);
      unread.delete(channel.id);

      const chMentions = state.channelMentions[channel.id] || 0;
      const curGuild = state.activeGuild;
      const nextGuildMentions = { ...state.guildMentions };
      const nextChannelMentions = { ...state.channelMentions };

      if (chMentions > 0) {
        delete nextChannelMentions[channel.id];
        if (curGuild) {
          nextGuildMentions[curGuild.id] = Math.max(0, (nextGuildMentions[curGuild.id] || 0) - chMentions);
        }
      }

      return {
        activeChannel: channel,
        messages: cachedMessages || [],
        unreadChannels: unread,
        guildMentions: nextGuildMentions,
        channelMentions: nextChannelMentions,
        isLoadingMessages: channel.type === 'text' && !cachedMessages,
      };
    });

    if (channel.type === 'text' && !cachedMessages) {
      try {
        const messages = await api.channels.getMessages(channel.id, 50);
        set((state) => ({
          messages: state.activeChannel?.id === channel.id ? messages : state.messages,
          messagesByChannel: {
            ...state.messagesByChannel,
            [channel.id]: messages,
          },
          hasMoreByChannel: {
            ...state.hasMoreByChannel,
            [channel.id]: messages.length === 50,
          },
          isLoadingMessages: false,
        }));
      } catch (err) {
        console.error('Failed to fetch messages for channel:', err);
        set({ isLoadingMessages: false });
      }
    }
  },

  loadMoreMessages: async (channelId: string) => {
    const state = get();
    if (state.isLoadingMoreMessages || state.hasMoreByChannel[channelId] === false) return;

    const currentChannelMessages = state.messagesByChannel[channelId] || state.messages;
    if (currentChannelMessages.length === 0) return;

    const oldestMessage = currentChannelMessages[0];
    set({ isLoadingMoreMessages: true });

    try {
      const olderMessages = await api.channels.getMessages(channelId, 50, oldestMessage.created_at || oldestMessage.id);
      const hasMore = olderMessages.length === 50;

      // Filter out any duplicates
      const existingIds = new Set(currentChannelMessages.map((m) => m.id));
      const uniqueOlder = olderMessages.filter((m) => !existingIds.has(m.id));
      const combined = [...uniqueOlder, ...currentChannelMessages];

      set((curr) => ({
        messages: curr.activeChannel?.id === channelId ? combined : curr.messages,
        messagesByChannel: {
          ...curr.messagesByChannel,
          [channelId]: combined,
        },
        hasMoreByChannel: {
          ...curr.hasMoreByChannel,
          [channelId]: hasMore,
        },
        isLoadingMoreMessages: false,
      }));
    } catch (err) {
      console.error('Failed to load older messages:', err);
      set({ isLoadingMoreMessages: false });
    }
  },

  createGuild: async (name: string, iconUrl?: string) => {
    const guild = await api.guilds.create({ name, icon_url: iconUrl });
    set((state) => ({ guilds: [...state.guilds, guild] }));
    return guild;
  },

  createChannel: async (guildId: string, name: string, type: 'text' | 'voice' | 'category', topic?: string, categoryId?: string, isPrivate?: boolean, roleIds?: string[]) => {
    const channel = await api.channels.create(guildId, {
      name,
      type,
      topic,
      category_id: categoryId,
      is_private: isPrivate,
      role_ids: roleIds,
    } as any);
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
      // If deleted channel was a category, reset category_id of children
      const channels = (state.activeGuild.channels || [])
        .filter((c) => c.id !== channelId)
        .map((c) => (c.category_id === channelId ? { ...c, category_id: undefined } : c));
      const activeChannel = state.activeChannel?.id === channelId ? (channels[0] || null) : state.activeChannel;
      return {
        activeGuild: { ...state.activeGuild, channels },
        activeChannel,
      };
    });
  },

  reorderChannels: async (guildId: string, payload: string[] | Array<{ id: string; position: number; category_id?: string; clear_category?: boolean }>) => {
    set((state) => {
      if (!state.activeGuild || state.activeGuild.id !== guildId) return state;

      if (Array.isArray(payload) && typeof payload[0] === 'string') {
        const channelIds = payload as string[];
        const orderMap = new Map(channelIds.map((id, idx) => [id, idx]));
        const channels = [...(state.activeGuild.channels || [])].map((c) => ({
          ...c,
          position: orderMap.has(c.id) ? orderMap.get(c.id)! : (c.position ?? 999),
        })).sort((a, b) => (a.position ?? 999) - (b.position ?? 999));
        return { activeGuild: { ...state.activeGuild, channels } };
      } else {
        const items = payload as Array<{ id: string; position: number; category_id?: string; clear_category?: boolean }>;
        const itemMap = new Map(items.map((it) => [it.id, it]));
        const channels = [...(state.activeGuild.channels || [])].map((c) => {
          const it = itemMap.get(c.id);
          if (it) {
            return {
              ...c,
              position: it.position,
              category_id: it.clear_category ? undefined : (it.category_id !== undefined ? it.category_id : c.category_id),
            };
          }
          return c;
        }).sort((a, b) => (a.position ?? 999) - (b.position ?? 999));
        return { activeGuild: { ...state.activeGuild, channels } };
      }
    });

    try {
      if (Array.isArray(payload) && typeof payload[0] === 'string') {
        await api.channels.reorder(guildId, { channel_ids: payload as string[] });
      } else {
        await api.channels.reorder(guildId, { channels: payload as any });
      }
    } catch (err) {
      console.error('Failed to persist channel reorder:', err);
    }
  },

  sendMessage: async (content: string, replyToId?: string) => {
    const { activeChannel } = get();
    if (!activeChannel) return;
    const msg = await api.channels.sendMessage(activeChannel.id, { content, reply_to_id: replyToId });
    if (msg) {
      get().addMessage(msg);
    }
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
    const isMention = !!(
      currentUser &&
      message.author_id !== currentUser.id &&
      (message.content.includes(`@${currentUser.username}`) ||
        (currentUser.display_name && message.content.includes(`@${currentUser.display_name}`)) ||
        message.content.includes('@everyone') ||
        message.content.includes('@here'))
    );

    set((state) => {
      const channelMsgs = state.messagesByChannel[message.channel_id] || [];
      const alreadyHas = channelMsgs.some((m) => m.id === message.id);
      const updatedChannelMsgs = alreadyHas ? channelMsgs : [...channelMsgs, message];

      const nextMessagesByChannel = {
        ...state.messagesByChannel,
        [message.channel_id]: updatedChannelMsgs,
      };

      if (state.activeChannel && state.activeChannel.id === message.channel_id) {
        if (state.messages.some((m) => m.id === message.id)) {
          return { messagesByChannel: nextMessagesByChannel };
        }
        if (message.author_id !== currentUser?.id) {
          playMessageSound(isMention);
        }
        return {
          messages: [...state.messages, message],
          messagesByChannel: nextMessagesByChannel,
        };
      } else {
        // Mark as unread
        const unread = new Set(state.unreadChannels);
        unread.add(message.channel_id);
        playMessageSound(isMention);

        const nextGuildMentions = { ...state.guildMentions };
        const nextChannelMentions = { ...state.channelMentions };

        if (isMention) {
          let targetGuildId = '';
          for (const g of state.guilds) {
            if (g.channels?.some((c) => c.id === message.channel_id)) {
              targetGuildId = g.id;
              break;
            }
          }
          if (!targetGuildId && state.activeGuild?.channels?.some((c) => c.id === message.channel_id)) {
            targetGuildId = state.activeGuild.id;
          }

          nextChannelMentions[message.channel_id] = (nextChannelMentions[message.channel_id] || 0) + 1;
          if (targetGuildId) {
            nextGuildMentions[targetGuildId] = (nextGuildMentions[targetGuildId] || 0) + 1;
          }
        }

        return {
          unreadChannels: unread,
          guildMentions: nextGuildMentions,
          channelMentions: nextChannelMentions,
          messagesByChannel: nextMessagesByChannel,
        };
      }
    });
  },

  updateMessageInStore: (message: Message) => {
    set((state) => {
      const channelMsgs = state.messagesByChannel[message.channel_id];
      const nextMessagesByChannel = channelMsgs
        ? {
            ...state.messagesByChannel,
            [message.channel_id]: channelMsgs.map((m) => (m.id === message.id ? { ...m, ...message } : m)),
          }
        : state.messagesByChannel;

      if (state.activeChannel && state.activeChannel.id === message.channel_id) {
        return {
          messages: state.messages.map((m) => (m.id === message.id ? { ...m, ...message } : m)),
          messagesByChannel: nextMessagesByChannel,
        };
      }
      return { messagesByChannel: nextMessagesByChannel };
    });
  },

  removeMessageFromStore: (messageId: string) => {
    set((state) => {
      const nextMessagesByChannel: Record<string, Message[]> = {};
      for (const [chId, msgs] of Object.entries(state.messagesByChannel)) {
        nextMessagesByChannel[chId] = msgs.filter((m) => m.id !== messageId);
      }
      return {
        messages: state.messages.filter((m) => m.id !== messageId),
        messagesByChannel: nextMessagesByChannel,
      };
    });
  },

  handleReactionEvent: ({ message_id, channel_id, user_id, emoji, is_add }) => {
    set((state) => {
      const updateMsgList = (list: Message[]) =>
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

      const nextMessagesByChannel = { ...state.messagesByChannel };
      if (nextMessagesByChannel[channel_id]) {
        nextMessagesByChannel[channel_id] = updateMsgList(nextMessagesByChannel[channel_id]);
      }

      return {
        messages: state.activeChannel?.id === channel_id ? updateMsgList(state.messages) : state.messages,
        messagesByChannel: nextMessagesByChannel,
      };
    });
  },

  handlePinEvent: ({ message_id, channel_id, is_pinned }) => {
    set((state) => {
      const updateMsgList = (list: Message[]) =>
        list.map((m) => (m.id === message_id ? { ...m, is_pinned } : m));

      const nextMessagesByChannel = { ...state.messagesByChannel };
      if (nextMessagesByChannel[channel_id]) {
        nextMessagesByChannel[channel_id] = updateMsgList(nextMessagesByChannel[channel_id]);
      }

      return {
        messages: state.activeChannel?.id === channel_id ? updateMsgList(state.messages) : state.messages,
        messagesByChannel: nextMessagesByChannel,
      };
    });
  },

  updateMemberInGuild: (updatedUser) => {
    set((state) => {
      if (!state.activeGuild) return state;
      const members = (state.activeGuild.members || []).map((m) =>
        m.id === updatedUser.id ? ({ ...m, ...updatedUser } as User) : m
      );
      const messages = state.messages.map((msg) =>
        msg.author_id === updatedUser.id ? { ...msg, author: { ...msg.author, ...updatedUser } as User } : msg
      );
      return {
        activeGuild: { ...state.activeGuild, members },
        messages,
      };
    });
  },

  handleGuildMemberAdd: (guildId, member) => {
    set((state) => {
      if (!state.activeGuild || state.activeGuild.id !== guildId) return state;
      const currentMembers = state.activeGuild.members || [];
      if (currentMembers.some((m) => m.id === member.id)) {
        return {
          activeGuild: {
            ...state.activeGuild,
            members: currentMembers.map((m) => (m.id === member.id ? { ...m, ...member } : m)),
          },
        };
      }
      return {
        activeGuild: {
          ...state.activeGuild,
          members: [...currentMembers, member],
        },
      };
    });
  },

  handleGuildMemberRemove: (guildId, userId) => {
    set((state) => {
      if (!state.activeGuild || state.activeGuild.id !== guildId) return state;
      const members = (state.activeGuild.members || []).filter((m) => m.id !== userId);
      return {
        activeGuild: {
          ...state.activeGuild,
          members,
        },
      };
    });
  },

  handleGuildMemberUpdate: (guildId, userId, data) => {
    set((state) => {
      if (!state.activeGuild || state.activeGuild.id !== guildId) return state;
      const members = (state.activeGuild.members || []).map((m) =>
        m.id === userId ? ({ ...m, ...data } as User) : m
      );
      return {
        activeGuild: {
          ...state.activeGuild,
          members,
        },
      };
    });
  },

  handlePresenceUpdate: (userId, status, customStatus) => {
    set((state) => {
      if (!state.activeGuild) return state;
      const members = (state.activeGuild.members || []).map((m) =>
        m.id === userId ? ({ ...m, status: status as any, custom_status: customStatus } as User) : m
      );
      return {
        activeGuild: {
          ...state.activeGuild,
          members,
        },
      };
    });
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

  kickMember: async (guildId: string, userId: string) => {
    await api.guilds.kickMember(guildId, userId);
    set((state) => {
      if (!state.activeGuild || state.activeGuild.id !== guildId) return state;
      const members = (state.activeGuild.members || []).filter((m) => m.id !== userId);
      return { activeGuild: { ...state.activeGuild, members } };
    });
  },

  banMember: async (guildId: string, userId: string, reason?: string) => {
    await api.guilds.banMember(guildId, userId, reason);
    set((state) => {
      if (!state.activeGuild || state.activeGuild.id !== guildId) return state;
      const members = (state.activeGuild.members || []).filter((m) => m.id !== userId);
      return { activeGuild: { ...state.activeGuild, members } };
    });
  },

  unbanMember: async (guildId: string, userId: string) => {
    await api.guilds.unbanMember(guildId, userId);
  },

  muteMember: async (guildId: string, userId: string, durationSeconds: number) => {
    const res = await api.guilds.muteMember(guildId, userId, durationSeconds);
    set((state) => {
      if (!state.activeGuild || state.activeGuild.id !== guildId) return state;
      const members = (state.activeGuild.members || []).map((m) =>
        m.id === userId ? { ...m, muted_until: res.muted_until || undefined } : m
      );
      return { activeGuild: { ...state.activeGuild, members } };
    });
  },
}));
