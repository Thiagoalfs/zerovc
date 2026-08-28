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
    createChannel: (guildId: string, data: { name: string; type: 'text' | 'voice'; topic?: string }) =>
      request<Channel>(`/guilds/${guildId}/channels`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    createInvite: (guildId: string) =>
      request<GuildInvite>(`/guilds/${guildId}/invites`, {
        method: 'POST',
      }),
  },

  channels: {
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
    update: (channelId: string, data: { name?: string; topic?: string; position?: number }) =>
      request<Channel>(`/channels/${channelId}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    delete: (channelId: string) =>
      request<{ success: boolean }>(`/channels/${channelId}`, {
        method: 'DELETE',
      }),
    reorder: (guildId: string, channelIds: string[]) =>
      request<{ success: boolean }>(`/guilds/${guildId}/channels/positions`, {
        method: 'PUT',
        body: JSON.stringify({ channel_ids: channelIds }),
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
    sendMessage: (roomId: string, data: { content: string; attachments?: any[] }) =>
      request<DMMessage>(`/dms/${roomId}/messages`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  },

  invites: {
    get: (code: string) => request<GuildInvite>(`/invites/${code}`),
    join: (code: string) =>
      request<Guild>(`/invites/${code}/join`, {
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
};
