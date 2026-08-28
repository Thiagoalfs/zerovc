import { Channel, Guild, Message, User, VoiceSession } from '../types';

export function getApiBaseUrl(): string {
  const saved = localStorage.getItem('zerovc_server_url');
  if (saved) return saved;

  // If accessed directly from browser (e.g. http://162.35.97.76:8081)
  if (typeof window !== 'undefined' && window.location && window.location.origin && !window.location.origin.includes('5173')) {
    return window.location.origin;
  }

  return 'http://162.35.97.76:8081';
}

export function setApiBaseUrl(url: string) {
  let cleaned = url.trim().replace(/\/+$/, '');
  if (!cleaned.startsWith('http://') && !cleaned.startsWith('https://')) {
    cleaned = `http://${cleaned}`;
  }
  localStorage.setItem('zerovc_server_url', cleaned);
}

function getAuthHeader(): Record<string, string> {
  const token = localStorage.getItem('zerovc_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${getApiBaseUrl()}${path}`;
  const headers = {
    'Content-Type': 'application/json',
    ...getAuthHeader(),
    ...options.headers,
  };

  try {
    const res = await fetch(url, { ...options, headers });
    if (!res.ok) {
      let errorMsg = 'Erro na requisição';
      try {
        const data = await res.json();
        errorMsg = data.error || errorMsg;
      } catch {
        errorMsg = await res.text();
      }
      throw new Error(errorMsg);
    }
    return res.json();
  } catch (err: any) {
    if (err.message.includes('Failed to fetch') || err.name === 'TypeError') {
      throw new Error(`Não foi possível conectar ao servidor em ${getApiBaseUrl()}.`);
    }
    throw err;
  }
}

export const api = {
  auth: {
    register: (data: { username: string; email: string; password: string }) =>
      request<{ token: string; user: User }>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    login: (data: { email: string; password: string }) =>
      request<{ token: string; user: User }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    me: () => request<User>('/api/auth/me'),
  },
  guilds: {
    list: () => request<Guild[]>('/api/guilds'),
    create: (data: { name: string; icon_url?: string }) =>
      request<Guild>('/api/guilds', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    getDetails: (guildId: string) => request<Guild>(`/api/guilds/${guildId}`),
    join: (guildId: string) =>
      request<{ success: boolean }>(`/api/guilds/${guildId}/join`, {
        method: 'POST',
      }),
    createChannel: (guildId: string, data: { name: string; type: 'text' | 'voice'; topic?: string }) =>
      request<Channel>(`/api/guilds/${guildId}/channels`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  },
  channels: {
    getMessages: (channelId: string, limit = 50, before?: string) => {
      const params = new URLSearchParams({ limit: limit.toString() });
      if (before) params.append('before', before);
      return request<Message[]>(`/api/channels/${channelId}/messages?${params.toString()}`);
    },
    sendMessage: (channelId: string, data: { content: string; reply_to_id?: string }) =>
      request<Message>(`/api/channels/${channelId}/messages`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    joinVoice: (channelId: string) =>
      request<{ token: string; livekit_url: string; room_name: string }>(`/api/channels/${channelId}/join-voice`, {
        method: 'POST',
      }),
    leaveVoice: (channelId: string) =>
      request<{ success: boolean }>(`/api/channels/${channelId}/leave-voice`, {
        method: 'POST',
      }),
    updateVoiceState: (channelId: string, data: { is_muted?: boolean; is_deafened?: boolean; is_screensharing?: boolean }) =>
      request<VoiceSession>(`/api/channels/${channelId}/voice-state`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  },
};
