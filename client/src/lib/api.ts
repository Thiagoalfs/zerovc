import { Channel, Guild, Message, User, Friendship, GuildInvite, DMRoom, DMMessage, Role } from '../types';

let cachedApiUrl: string | null = null;

export const getApiBaseUrl = (): string => {
  if (cachedApiUrl) return cachedApiUrl;
  const stored = localStorage.getItem('zerovc_api_url');
  if (stored) {
    cachedApiUrl = stored;
    return stored;
  }
  if (typeof window !== 'undefined' && window.location.origin.startsWith('http')) {
    cachedApiUrl = window.location.origin;
    return window.location.origin;
  }
  return (import.meta as any).env?.VITE_API_URL || 'https://zerovc.safiroko.xyz';
};

export const setApiBaseUrl = (url: string): void => {
  cachedApiUrl = url;
  localStorage.setItem('zerovc_api_url', url);
};

export const API_BASE_URL = getApiBaseUrl();

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('token') || localStorage.getItem('zerovc_token');
  const baseUrl = getApiBaseUrl();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${baseUrl}/api${endpoint}`, {
    credentials: 'include',
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorMsg = `HTTP Error ${response.status}`;
    try {
      const errJson = await response.json();
      if (errJson.error) errorMsg = errJson.error;
    } catch {}
    throw new Error(errorMsg);
  }

  if (response.status === 204) {
    return {} as T;
  }

  return response.json();
}

export const api = {
  auth: {
    register: (data: { username: string; email: string; password: string }) =>
      request<{ token: string; user: User }>('/auth/register', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    login: (data: { email: string; password: string }) =>
      request<{ token: string; user: User }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    logout: () =>
      request<{ message: string }>('/auth/logout', {
        method: 'POST',
      }),
    me: () => request<User>('/auth/me'),
  },

  users: {
    updateProfile: (data: {
      display_name?: string;
      avatar_url?: string;
      banner_url?: string;
      bio?: string;
      status?: 'online' | 'idle' | 'dnd' | 'offline';
      custom_status?: string;
    }) =>
      request<User>('/users/@me', {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
  },

  guilds: {
    list: () => request<Guild[]>('/guilds'),
    create: (data: { name: string; icon_url?: string }) =>
      request<Guild>('/guilds', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    getDetails: (id: string) => request<Guild>(`/guilds/${id}`),
    join: (id: string) =>
      request<{ success: boolean }>(`/guilds/${id}/join`, {
        method: 'POST',
      }),
    createChannel: (guildId: string, data: { name: string; type: 'text' | 'voice' | 'category'; category_id?: string; topic?: string }) =>
      request<Channel>(`/guilds/${guildId}/channels`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    createInvite: (guildId: string) =>
      request<GuildInvite>(`/guilds/${guildId}/invites`, {
        method: 'POST',
      }),
    kickMember: (guildId: string, userId: string) =>
      request<{ success: boolean; user_id: string }>(`/guilds/${guildId}/members/${userId}/kick`, {
        method: 'POST',
      }),
    banMember: (guildId: string, userId: string, reason?: string) =>
      request<{ success: boolean; user_id: string }>(`/guilds/${guildId}/bans`, {
        method: 'POST',
        body: JSON.stringify({ user_id: userId, reason: reason || '' }),
      }),
    unbanMember: (guildId: string, userId: string) =>
      request<{ success: boolean; user_id: string }>(`/guilds/${guildId}/bans/${userId}`, {
        method: 'DELETE',
      }),
    muteMember: (guildId: string, userId: string, durationSeconds: number) =>
      request<{ success: boolean; user_id: string; muted_until: string | null }>(`/guilds/${guildId}/members/${userId}/mute`, {
        method: 'POST',
        body: JSON.stringify({ duration_seconds: durationSeconds }),
      }),
  },

  channels: {
    create: (guildId: string, data: { name: string; type: 'text' | 'voice' | 'category'; category_id?: string; topic?: string }) =>
      request<Channel>(`/guilds/${guildId}/channels`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    getMessages: (channelId: string, limit = 50, before?: string) => {
      const query = new URLSearchParams({ limit: String(limit) });
      if (before) query.append('before', before);
      return request<Message[]>(`/channels/${channelId}/messages?${query.toString()}`);
    },
    sendMessage: (channelId: string, data: { content: string; attachments?: any[]; reply_to_id?: string }) =>
      request<Message>(`/channels/${channelId}/messages`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    updateMessage: (channelId: string, messageId: string, data: { content: string }) =>
      request<Message>(`/channels/${channelId}/messages/${messageId}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    deleteMessage: (channelId: string, messageId: string) =>
      request<{ success: boolean }>(`/channels/${channelId}/messages/${messageId}`, {
        method: 'DELETE',
      }),
    update: (channelId: string, data: { name?: string; topic?: string; position?: number; category_id?: string; clear_category?: boolean }) =>
      request<Channel>(`/channels/${channelId}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    delete: (channelId: string) =>
      request<{ success: boolean }>(`/channels/${channelId}`, {
        method: 'DELETE',
      }),
    reorder: (guildId: string, payload: { channel_ids?: string[]; channels?: Array<{ id: string; position: number; category_id?: string; clear_category?: boolean }> }) =>
      request<{ success: boolean }>(`/guilds/${guildId}/channels/positions`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      }),
    joinVoice: (channelId: string) =>
      request<{ token: string; livekit_url: string; room_name: string }>(`/channels/${channelId}/join-voice`, {
        method: 'POST',
      }),
    leaveVoice: (channelId: string) =>
      request<{ success: boolean }>(`/channels/${channelId}/leave-voice`, {
        method: 'POST',
      }),
    updateVoiceState: (channelId: string, data: { is_muted?: boolean; is_deafened?: boolean; is_screensharing?: boolean }) =>
      request<any>(`/channels/${channelId}/voice-state`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    addReaction: (channelId: string, messageId: string, emoji: string) =>
      request<{ success: boolean; emoji: string }>(`/channels/${channelId}/messages/${messageId}/reactions`, {
        method: 'POST',
        body: JSON.stringify({ emoji }),
      }),
    removeReaction: (channelId: string, messageId: string, emoji: string) =>
      request<{ success: boolean }>(`/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`, {
        method: 'DELETE',
      }),
    togglePin: (channelId: string, messageId: string) =>
      request<{ success: boolean; is_pinned: boolean }>(`/channels/${channelId}/messages/${messageId}/pin`, {
        method: 'POST',
      }),
  },

  roles: {
    list: (guildId: string) => request<Role[]>(`/guilds/${guildId}/roles`),
    create: (guildId: string, data: { name: string; color: string; permissions?: number }) =>
      request<Role>(`/guilds/${guildId}/roles`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (guildId: string, roleId: string, data: { name?: string; color?: string; permissions?: number; position?: number }) =>
      request<Role>(`/guilds/${guildId}/roles/${roleId}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    delete: (guildId: string, roleId: string) =>
      request<{ success: boolean }>(`/guilds/${guildId}/roles/${roleId}`, {
        method: 'DELETE',
      }),
    assign: (guildId: string, userId: string, roleId: string) =>
      request<{ success: boolean }>(`/guilds/${guildId}/members/${userId}/roles/${roleId}`, {
        method: 'POST',
      }),
    remove: (guildId: string, userId: string, roleId: string) =>
      request<{ success: boolean }>(`/guilds/${guildId}/members/${userId}/roles/${roleId}`, {
        method: 'DELETE',
      }),
  },

  dms: {
    listRooms: () => request<DMRoom[]>('/dms'),
    createOrGet: (recipientId: string) =>
      request<DMRoom>('/dms', {
        method: 'POST',
        body: JSON.stringify({ recipient_id: recipientId }),
      }),
    getMessages: (roomId: string, limit = 50) =>
      request<DMMessage[]>(`/dms/${roomId}/messages?limit=${limit}`),
    sendMessage: (roomId: string, data: { content: string; attachments?: any[]; reply_to_id?: string }) =>
      request<DMMessage>(`/dms/${roomId}/messages`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    addReaction: (roomId: string, messageId: string, emoji: string) =>
      request<{ success: boolean; emoji: string }>(`/dms/${roomId}/messages/${messageId}/reactions`, {
        method: 'POST',
        body: JSON.stringify({ emoji }),
      }),
    removeReaction: (roomId: string, messageId: string, emoji: string) =>
      request<{ success: boolean }>(`/dms/${roomId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`, {
        method: 'DELETE',
      }),
  },

  invites: {
    get: (code: string) => request<{ invite: GuildInvite; member_count: number }>(`/invites/${code}`),
    join: (code: string) =>
      request<{ success: boolean; guild_id: string }>(`/invites/${code}/join`, {
        method: 'POST',
      }),
  },

  friends: {
    list: () => request<{ friends: Friendship[]; pending: Friendship[]; incoming: Friendship[] }>('/friends'),
    sendRequest: (username: string) =>
      request<Friendship>('/friends/request', {
        method: 'POST',
        body: JSON.stringify({ username }),
      }),
    accept: (id: string) =>
      request<Friendship>(`/friends/${id}/accept`, {
        method: 'POST',
      }),
    remove: (id: string) =>
      request<{ success: boolean }>(`/friends/${id}/reject`, {
        method: 'POST',
      }),
  },

  upload: {
    avatar: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      const token = localStorage.getItem('token') || localStorage.getItem('zerovc_token');
      const res = await fetch(`${getApiBaseUrl()}/api/upload/avatar`, {
        method: 'POST',
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      if (!res.ok) {
        let msg = 'Falha ao enviar avatar';
        try {
          const err = await res.json();
          if (err.error) msg = err.error;
        } catch {}
        throw new Error(msg);
      }
      return res.json() as Promise<{ url: string; filename: string; size: number }>;
    },
    guildIcon: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      const token = localStorage.getItem('token') || localStorage.getItem('zerovc_token');
      const res = await fetch(`${getApiBaseUrl()}/api/upload/guild-icon`, {
        method: 'POST',
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      if (!res.ok) {
        let msg = 'Falha ao enviar ícone do servidor';
        try {
          const err = await res.json();
          if (err.error) msg = err.error;
        } catch {}
        throw new Error(msg);
      }
      return res.json() as Promise<{ url: string; filename: string; size: number }>;
    },
    banner: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      const token = localStorage.getItem('token') || localStorage.getItem('zerovc_token');
      const res = await fetch(`${getApiBaseUrl()}/api/upload/banner`, {
        method: 'POST',
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      if (!res.ok) {
        let msg = 'Falha ao enviar banner';
        try {
          const err = await res.json();
          if (err.error) msg = err.error;
        } catch {}
        throw new Error(msg);
      }
      return res.json() as Promise<{ url: string; filename: string; size: number }>;
    },
  },
};
