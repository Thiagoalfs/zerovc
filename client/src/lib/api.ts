import { Channel, Guild, Message, User, Friendship, GuildInvite, DMRoom, DMMessage, Role, DMGroup, DMGroupMessage, FavoriteGIF, AuditLog, ChannelReadState, GuildEmoji, ChannelPermissionOverwrite, LinkMetadata, CustomActivity, ServerFolder, UserSession, VoiceSession, GameSearchResult } from '../types';
import { convertToWebP } from '../utils/image';
import { isElectron } from './platform';

const getStorageItem = (key: string): string | null => {
  if (typeof localStorage === 'undefined') return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const setStorageItem = (key: string, value: string): void => {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(key, value);
  } catch {}
};

let cachedApiUrl: string | null = null;

export const getApiBaseUrl = (): string => {
  if (cachedApiUrl) return cachedApiUrl;
  const stored = getStorageItem('zerovc_api_url');
  if (stored) {
    cachedApiUrl = stored;
    return stored;
  }
  if (
    typeof window !== 'undefined' &&
    window.location.origin &&
    window.location.origin.startsWith('http') &&
    !window.location.origin.includes('localhost:5173')
  ) {
    cachedApiUrl = window.location.origin;
    return window.location.origin;
  }
  return (import.meta as any).env?.VITE_API_URL || 'https://zerovc.safiroko.xyz';
};

export const setApiBaseUrl = (url: string): void => {
  cachedApiUrl = url;
  setStorageItem('zerovc_api_url', url);
};

export const formatAssetUrl = (url?: string | null): string => {
  if (!url) return '';
  if (
    url.startsWith('http://') ||
    url.startsWith('https://') ||
    url.startsWith('data:') ||
    url.startsWith('blob:')
  ) {
    return url;
  }
  const base = getApiBaseUrl();
  const cleanPath = url.startsWith('/') ? url : `/${url}`;
  return `${base}${cleanPath}`;
};

let memoryCsrfToken: string | null = null;

export const setCsrfToken = (token: string): void => {
  memoryCsrfToken = token;
  setStorageItem('zerovc_csrf_token', token);
};

export const getCsrfToken = (): string => {
  if (memoryCsrfToken) return memoryCsrfToken;
  const stored = getStorageItem('zerovc_csrf_token');
  if (stored) {
    memoryCsrfToken = stored;
    return stored;
  }
  if (typeof document !== 'undefined' && document.cookie) {
    const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
    if (match) {
      const token = decodeURIComponent(match[1]);
      memoryCsrfToken = token;
      return token;
    }
  }
  return '';
};

export const CLIENT_E2EE_VERSION = 1;

export const API_BASE_URL = getApiBaseUrl();

async function request<T>(endpoint: string, options: RequestInit = {}, isRetry = false): Promise<T> {
  const baseUrl = getApiBaseUrl();
  const method = (options.method || 'GET').toUpperCase();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Client-E2EE-Version': String(CLIENT_E2EE_VERSION),
    ...(options.headers as Record<string, string>),
  };

  const isPublicAuth =
    endpoint.startsWith('/auth/login') ||
    endpoint.startsWith('/auth/register') ||
    endpoint.startsWith('/auth/verify') ||
    endpoint.startsWith('/auth/resend') ||
    endpoint.startsWith('/auth/forgot') ||
    endpoint.startsWith('/auth/reset');

  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    let csrf = getCsrfToken();
    if (!csrf && !isPublicAuth && !isRetry) {
      try {
        await request<User>('/auth/me', {}, true);
        csrf = getCsrfToken();
      } catch {}
    }
    if (csrf && !headers['X-CSRF-Token']) {
      headers['X-CSRF-Token'] = csrf;
    }
  }

  // Só o Electron precisa do Bearer token (ver client/src/lib/platform.ts).
  // No navegador a sessão é 100% via cookie httpOnly enviado por credentials: 'include'.
  if (isElectron()) {
    const token = getStorageItem('token') || getStorageItem('zerovc_token');
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  const response = await fetch(`${baseUrl}/api${endpoint}`, {
    credentials: 'include',
    ...options,
    headers,
  });

  // Captura CSRF token retornado no cabeçalho se disponível
  const resCsrf = response.headers.get('X-CSRF-Token');
  if (resCsrf) {
    setCsrfToken(resCsrf);
  }

  if (!response.ok) {
    let errorMsg = `HTTP Error ${response.status}`;
    let isRequires2FA = response.status === 428;
    let isUpgradeRequired = response.status === 426;
    let minVersion: number | undefined;

    try {
      const errJson = await response.json();
      if (errJson.message) errorMsg = errJson.message;
      else if (errJson.error) errorMsg = errJson.error;
      if (errJson.min_version) minVersion = errJson.min_version;
      if (errJson.requires_2fa || errJson.error === '2fa_required' || response.status === 428) {
        isRequires2FA = true;
      }
    } catch {}

    // Auto-recuperação transparente se o token CSRF expirou ou dessincronizou
    if (response.status === 403 && errorMsg.toLowerCase().includes('csrf') && !isRetry && !isPublicAuth) {
      try {
        await request<User>('/auth/me', {}, true);
        return await request<T>(endpoint, options, true);
      } catch {}
    }

    if (response.status === 426) {
      isUpgradeRequired = true;
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('zerovc:upgrade_required', {
            detail: { minVersion, error: errorMsg, endpoint },
          })
        );
      }
    }

    const error: any = new Error(errorMsg);
    error.status = response.status;
    error.requires_2fa = isRequires2FA;
    error.upgrade_required = isUpgradeRequired;
    error.min_version = minVersion;
    throw error;
  }

  if (response.status === 204) {
    return {} as T;
  }

  const data = await response.json();
  if (data && typeof data === 'object') {
    if ('csrf_token' in data && typeof (data as any).csrf_token === 'string') {
      setCsrfToken((data as any).csrf_token);
    }
  }
  return data as T;
}

export const api = {
  auth: {
    register: (data: { username: string; email: string; password: string }) =>
      request<{ token?: string; csrf_token?: string; requires_verification?: boolean; email?: string; user?: User }>('/auth/register', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    verifyEmail: (data: { email: string; code: string }) =>
      request<{ token: string; csrf_token?: string; user: User }>('/auth/verify-email', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    resendVerification: (data: { email: string }) =>
      request<{ message: string }>('/auth/resend-verification', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    forgotPassword: (data: { email: string }) =>
      request<{ message: string }>('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    verifyResetToken: (data: { token: string }) =>
      request<{ valid: boolean; username: string; requires_2fa: boolean }>('/auth/verify-reset-token', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    resetPassword: (data: { token: string; new_password: string; code?: string }) =>
      request<{ message: string }>('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    login: (data: { email: string; password: string; code?: string }) =>
      request<{ token?: string; csrf_token?: string; requires_2fa?: boolean; requires_verification?: boolean; email?: string; user?: User }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    logout: () =>
      request<{ message: string }>('/auth/logout', {
        method: 'POST',
      }),
    me: () => request<User>('/auth/me'),
    generate2FA: () =>
      request<{ secret: string; otpauth_uri: string }>('/auth/2fa/generate', {
        method: 'POST',
      }),
    enable2FA: (data: { secret: string; code: string }) =>
      request<{ success: boolean; two_factor_enabled: boolean; backup_codes?: string[] }>('/auth/2fa/enable', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    disable2FA: (data: { password?: string; code?: string }) =>
      request<{ success: boolean; two_factor_enabled: boolean }>('/auth/2fa/disable', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    exportData: () => request<Record<string, unknown>>('/auth/export-data'),
    deleteAccount: (data: { password: string }) =>
      request<{ success: boolean; message: string }>('/auth/delete-account', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    changePassword: (data: { current_password: string; new_password: string }) =>
      request<{ success: boolean; message: string }>('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    changeEmail: (data: { password: string; new_email: string }) =>
      request<{ success: boolean; email: string }>('/auth/change-email', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    changePhone: (data: { phone_number: string }) =>
      request<{ success: boolean; phone_number: string }>('/auth/change-phone', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    getSessions: () => request<UserSession[]>('/auth/sessions'),
    revokeSession: (id: string) =>
      request<{ message: string }>(`/auth/sessions/${id}/revoke`, {
        method: 'POST',
      }),
    revokeOtherSessions: () =>
      request<{ message: string }>('/auth/sessions/revoke-others', {
        method: 'POST',
      }),
  },

  users: {
    updateProfile: (data: {
      username?: string;
      phone_number?: string;
      display_name?: string;
      avatar_url?: string;
      banner_url?: string;
      bio?: string;
      status?: 'online' | 'idle' | 'dnd' | 'offline';
      custom_status?: string;
      custom_activity?: CustomActivity | null;
      show_activity_status?: boolean;
      auto_detect_activity?: boolean;
      server_folders?: ServerFolder[];
      guild_positions?: string[];
    }) =>
      request<User>('/users/@me', {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    getFavoriteGifs: () => request<FavoriteGIF[]>('/users/me/favorite-gifs'),
    addFavoriteGif: (data: { gif_url: string; preview_url?: string; title?: string }) =>
      request<FavoriteGIF>('/users/me/favorite-gifs', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    removeFavoriteGif: (gifUrl: string) =>
      request<{ success: boolean }>('/users/me/favorite-gifs', {
        method: 'DELETE',
        body: JSON.stringify({ gif_url: gifUrl }),
      }),
    block: (userId: string) =>
      request<{ success: boolean; blocked_user_id: string }>(`/users/${userId}/block`, {
        method: 'POST',
      }),
    unblock: (userId: string) =>
      request<{ success: boolean; unblocked_user_id: string }>(`/users/${userId}/block`, {
        method: 'DELETE',
      }),
    listBlocks: () => request<User[]>('/users/me/blocks'),
  },

  guilds: {
    list: () => request<Guild[]>('/guilds'),
    create: (data: { name: string; icon_url?: string }) =>
      request<Guild>('/guilds', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    getDetails: (id: string) => request<Guild>(`/guilds/${id}`),
    update: (id: string, data: { name?: string; icon_url?: string; banner_url?: string; system_channel_id?: string; clear_system_channel?: boolean }) =>
      request<Guild>(`/guilds/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    transferOwnership: (guildId: string, newOwnerId: string) =>
      request<{ success: boolean; owner_id: string }>(`/guilds/${guildId}/transfer-ownership`, {
        method: 'POST',
        body: JSON.stringify({ new_owner_id: newOwnerId }),
      }),
    delete: (id: string, code?: string) =>
      request<{ success: boolean; guild_id: string }>(
        `/guilds/${id}${code ? `?code=${encodeURIComponent(code)}` : ''}`,
        {
          method: 'DELETE',
          headers: code ? { 'X-2FA-Code': code } : undefined,
        }
      ),
    join: (id: string) =>
      request<{ success: boolean }>(`/guilds/${id}/join`, {
        method: 'POST',
      }),
    leave: (id: string) =>
      request<{ success: boolean; guild_id: string }>(`/guilds/${id}/leave`, {
        method: 'POST',
      }),
    toggleMute: (id: string) =>
      request<{ success: boolean; guild_id: string; is_muted: boolean }>(`/guilds/${id}/mute`, {
        method: 'POST',
      }),
    createChannel: (guildId: string, data: { name: string; type: 'text' | 'voice' | 'category'; category_id?: string; topic?: string }) =>
      request<Channel>(`/guilds/${guildId}/channels`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    getInvites: (guildId: string) => request<GuildInvite[]>(`/guilds/${guildId}/invites`),
    createInvite: (
      guildId: string,
      options?: boolean | { forceNew?: boolean; max_age?: number; max_uses?: number }
    ) => {
      const isBool = typeof options === 'boolean';
      const forceNew = isBool ? options : options?.forceNew;
      const maxAge = !isBool ? options?.max_age : undefined;
      const maxUses = !isBool ? options?.max_uses : undefined;

      const params = new URLSearchParams();
      if (forceNew) params.append('new', 'true');
      if (maxAge !== undefined) params.append('max_age', String(maxAge));
      if (maxUses !== undefined) params.append('max_uses', String(maxUses));

      const qs = params.toString() ? `?${params.toString()}` : '';
      return request<GuildInvite>(`/guilds/${guildId}/invites${qs}`, {
        method: 'POST',
        body: JSON.stringify({ max_age: maxAge, max_uses: maxUses }),
      });
    },
    deleteInvite: (guildId: string, code: string) =>
      request<{ success: boolean; code: string }>(`/guilds/${guildId}/invites/${code}`, {
        method: 'DELETE',
      }),
    getEmojis: (guildId: string) => request<GuildEmoji[]>(`/guilds/${guildId}/emojis`),
    createEmoji: (guildId: string, data: { name: string; image_url: string }) =>
      request<GuildEmoji>(`/guilds/${guildId}/emojis`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    updateEmoji: (guildId: string, emojiId: string, data: { name: string }) =>
      request<GuildEmoji>(`/guilds/${guildId}/emojis/${emojiId}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    deleteEmoji: (guildId: string, emojiId: string) =>
      request<{ success: boolean; id: string }>(`/guilds/${guildId}/emojis/${emojiId}`, {
        method: 'DELETE',
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
    getAuditLogs: (guildId: string, params?: { action?: string; before?: string }) => {
      const q = new URLSearchParams();
      if (params?.action) q.append('action', params.action);
      if (params?.before) q.append('before', params.before);
      const queryStr = q.toString() ? `?${q.toString()}` : '';
      return request<AuditLog[]>(`/guilds/${guildId}/audit-logs${queryStr}`);
    },
    getReadStates: (guildId: string) => request<ChannelReadState[]>(`/guilds/${guildId}/read-states`),
    getVoiceStates: (guildId: string) =>
      request<{ voice_states: Record<string, VoiceSession[]> }>(`/guilds/${guildId}/voice-states`),
    searchMessages: (guildId: string, query: string) => {
      const q = new URLSearchParams({ q: query });
      return request<Message[]>(`/guilds/${guildId}/messages/search?${q.toString()}`);
    },
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
    search: (channelId: string, query: string) => {
      const q = new URLSearchParams({ q: query });
      return request<Message[]>(`/channels/${channelId}/messages/search?${q.toString()}`);
    },
    ack: (channelId: string, messageId?: string) =>
      request<{ success: boolean; channel_id: string; last_read_message_id?: string }>(`/channels/${channelId}/ack`, {
        method: 'POST',
        body: JSON.stringify({ message_id: messageId }),
      }),
    sendMessage: (channelId: string, data: {
      content: string;
      attachments?: any[];
      reply_to_id?: string;
      is_tts?: boolean;
      message_id?: string;
      encrypted?: boolean;
      e2ee_ciphertext?: string;
      e2ee_meta?: any;
    }) =>
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
    update: (channelId: string, data: { name?: string; topic?: string; position?: number; category_id?: string; clear_category?: boolean; is_private?: boolean; role_ids?: string[]; permission_overwrites?: ChannelPermissionOverwrite[] }) =>
      request<Channel>(`/channels/${channelId}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    updatePermissionOverwrite: (channelId: string, roleId: string, data: { allow: number; deny: number }) =>
      request<Channel>(`/channels/${channelId}/permissions/${roleId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    deletePermissionOverwrite: (channelId: string, roleId: string) =>
      request<Channel>(`/channels/${channelId}/permissions/${roleId}`, {
        method: 'DELETE',
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
    joinVoice: (channelId: string, data?: { is_muted?: boolean; is_deafened?: boolean }) =>
      request<{ token: string; livekit_url: string; room_name: string; e2ee_enabled?: boolean }>(`/channels/${channelId}/join-voice`, {
        method: 'POST',
        body: data ? JSON.stringify(data) : undefined,
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
    adminUpdateVoiceState: (
      channelId: string,
      userId: string,
      data: { is_muted?: boolean; is_deafened?: boolean; disconnect?: boolean; target_channel_id?: string }
    ) =>
      request<any>(`/channels/${channelId}/members/${userId}/voice-state`, {
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
    getPinnedMessages: (channelId: string) =>
      request<Message[]>(`/channels/${channelId}/pins`),
  },

  roles: {
    list: (guildId: string) => request<Role[]>(`/guilds/${guildId}/roles`),
    create: (guildId: string, data: { name: string; color: string; permissions?: number; hoist?: boolean; mentionable?: boolean }) =>
      request<Role>(`/guilds/${guildId}/roles`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (guildId: string, roleId: string, data: { name?: string; color?: string; permissions?: number; position?: number; hoist?: boolean; mentionable?: boolean }) =>
      request<Role>(`/guilds/${guildId}/roles/${roleId}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    reorder: (guildId: string, roles: Array<{ id: string; position: number }>) =>
      request<Role[]>(`/guilds/${guildId}/roles/positions`, {
        method: 'PUT',
        body: JSON.stringify(roles),
      }),
    delete: (guildId: string, roleId: string) =>
      request<{ success: boolean }>(`/guilds/${guildId}/roles/${roleId}`, {
        method: 'DELETE',
      }),
    assign: (guildId: string, userId: string, roleId: string) =>
      request<{ success: boolean; roles: Role[] }>(`/guilds/${guildId}/members/${userId}/roles/${roleId}`, {
        method: 'POST',
      }),
    remove: (guildId: string, userId: string, roleId: string) =>
      request<{ success: boolean; roles: Role[] }>(`/guilds/${guildId}/members/${userId}/roles/${roleId}`, {
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
    closeRoom: (roomId: string) =>
      request<{ status: string }>(`/dms/${roomId}/close`, {
        method: 'POST',
      }),
    getMessages: (roomId: string, limit = 50, before?: string) => {
      const query = new URLSearchParams({ limit: String(limit) });
      if (before) query.append('before', before);
      return request<DMMessage[]>(`/dms/${roomId}/messages?${query.toString()}`);
    },
    getPinnedMessages: (roomId: string) =>
      request<DMMessage[]>(`/dms/${roomId}/pins`),
    sendMessage: (roomId: string, data: { content: string; attachments?: any[]; reply_to_id?: string; is_tts?: boolean; message_id?: string; encrypted?: boolean; e2ee_ciphertext?: string; e2ee_meta?: any }) =>
      request<DMMessage>(`/dms/${roomId}/messages`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    updateMessage: (roomId: string, messageId: string, data: { content: string }) =>
      request<DMMessage>(`/dms/${roomId}/messages/${messageId}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    deleteMessage: (roomId: string, messageId: string) =>
      request<{ success: boolean }>(`/dms/${roomId}/messages/${messageId}`, {
        method: 'DELETE',
      }),
    togglePin: (roomId: string, messageId: string) =>
      request<{ success: boolean; is_pinned: boolean }>(`/dms/${roomId}/messages/${messageId}/pin`, {
        method: 'POST',
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
    inviteCall: (roomId: string) =>
      request<{ success: boolean; room_id: string; e2ee_enabled?: boolean }>(`/dms/${roomId}/call/invite`, {
        method: 'POST',
      }),
    acceptCall: (roomId: string) =>
      request<{ success: boolean; room_id: string; room_name: string; token: string; livekit_url: string; e2ee_enabled?: boolean }>(`/dms/${roomId}/call/accept`, {
        method: 'POST',
      }),
    rejectCall: (roomId: string) =>
      request<{ success: boolean }>(`/dms/${roomId}/call/reject`, {
        method: 'POST',
      }),
    leaveCall: (roomId: string) =>
      request<{ success: boolean }>(`/dms/${roomId}/call/leave`, {
        method: 'POST',
      }),
  },

  dmGroups: {
    list: () => request<DMGroup[]>('/dm/groups'),
    create: (data: { name?: string; member_ids: string[] }) =>
      request<DMGroup>('/dm/groups', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    get: (id: string) => request<DMGroup>(`/dm/groups/${id}`),
    update: (id: string, data: { name?: string; icon_url?: string }) =>
      request<DMGroup>(`/dm/groups/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    addMembers: (id: string, memberIds: string[]) =>
      request<User[]>(`/dm/groups/${id}/members`, {
        method: 'POST',
        body: JSON.stringify({ member_ids: memberIds }),
      }),
    removeMember: (id: string, userId: string) =>
      request<{ success: boolean }>(`/dm/groups/${id}/members/${userId}`, {
        method: 'DELETE',
      }),
    transferOwnership: (id: string, newOwnerId: string) =>
      request<DMGroup>(`/dm/groups/${id}/transfer-ownership`, {
        method: 'POST',
        body: JSON.stringify({ new_owner_id: newOwnerId }),
      }),
    getMessages: (id: string, limit = 50, before?: string) => {
      const query = new URLSearchParams({ limit: String(limit) });
      if (before) query.append('before', before);
      return request<DMGroupMessage[]>(`/dm/groups/${id}/messages?${query.toString()}`);
    },
    getPinnedMessages: (id: string) =>
      request<DMGroupMessage[]>(`/dm/groups/${id}/pins`),
    sendMessage: (id: string, data: { content: string; attachments?: any[]; reply_to_id?: string; is_tts?: boolean; message_id?: string; encrypted?: boolean; e2ee_ciphertext?: string; e2ee_meta?: any }) =>
      request<DMGroupMessage>(`/dm/groups/${id}/messages`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    updateMessage: (id: string, messageId: string, data: { content: string }) =>
      request<DMGroupMessage>(`/dm/groups/${id}/messages/${messageId}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    deleteMessage: (id: string, messageId: string) =>
      request<{ success: boolean }>(`/dm/groups/${id}/messages/${messageId}`, {
        method: 'DELETE',
      }),
    togglePin: (id: string, messageId: string) =>
      request<{ success: boolean; is_pinned: boolean }>(`/dm/groups/${id}/messages/${messageId}/pin`, {
        method: 'POST',
      }),
    getVoiceToken: (id: string) =>
      request<{ token: string; livekit_url: string; room_name: string; e2ee_enabled?: boolean }>(`/dm/groups/${id}/voice-token`, {
        method: 'POST',
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
      const optimizedFile = await convertToWebP(file);
      const formData = new FormData();
      formData.append('file', optimizedFile);
      const headers: Record<string, string> = {};
      const token = getStorageItem('token') || getStorageItem('zerovc_token');
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const csrf = getCsrfToken();
      if (csrf) headers['X-CSRF-Token'] = csrf;
      const res = await fetch(`${getApiBaseUrl()}/api/upload/avatar`, {
        method: 'POST',
        credentials: 'include',
        headers,
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
      const optimizedFile = await convertToWebP(file);
      const formData = new FormData();
      formData.append('file', optimizedFile);
      const headers: Record<string, string> = {};
      const token = getStorageItem('token') || getStorageItem('zerovc_token');
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const csrf = getCsrfToken();
      if (csrf) headers['X-CSRF-Token'] = csrf;
      const res = await fetch(`${getApiBaseUrl()}/api/upload/guild-icon`, {
        method: 'POST',
        credentials: 'include',
        headers,
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
    groupIcon: async (file: File) => {
      const optimizedFile = await convertToWebP(file);
      const formData = new FormData();
      formData.append('file', optimizedFile);
      const headers: Record<string, string> = {};
      const token = getStorageItem('token') || getStorageItem('zerovc_token');
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const csrf = getCsrfToken();
      if (csrf) headers['X-CSRF-Token'] = csrf;
      const res = await fetch(`${getApiBaseUrl()}/api/upload/guild-icon`, {
        method: 'POST',
        credentials: 'include',
        headers,
        body: formData,
      });
      if (!res.ok) {
        let msg = 'Falha ao enviar ícone do grupo';
        try {
          const err = await res.json();
          if (err.error) msg = err.error;
        } catch {}
        throw new Error(msg);
      }
      return res.json() as Promise<{ url: string; filename: string; size: number }>;
    },
    guildBanner: async (file: File) => {
      const optimizedFile = await convertToWebP(file);
      const formData = new FormData();
      formData.append('file', optimizedFile);
      const headers: Record<string, string> = {};
      const token = getStorageItem('token') || getStorageItem('zerovc_token');
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const csrf = getCsrfToken();
      if (csrf) headers['X-CSRF-Token'] = csrf;
      const res = await fetch(`${getApiBaseUrl()}/api/upload/guild-banner`, {
        method: 'POST',
        credentials: 'include',
        headers,
        body: formData,
      });
      if (!res.ok) {
        let msg = 'Falha ao enviar banner do servidor';
        try {
          const err = await res.json();
          if (err.error) msg = err.error;
        } catch {}
        throw new Error(msg);
      }
      return res.json() as Promise<{ url: string; filename: string; size: number }>;
    },
    banner: async (file: File) => {
      const optimizedFile = await convertToWebP(file);
      const formData = new FormData();
      formData.append('file', optimizedFile);
      const headers: Record<string, string> = {};
      const token = getStorageItem('token') || getStorageItem('zerovc_token');
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const csrf = getCsrfToken();
      if (csrf) headers['X-CSRF-Token'] = csrf;
      const res = await fetch(`${getApiBaseUrl()}/api/upload/banner`, {
        method: 'POST',
        credentials: 'include',
        headers,
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
    attachment: async (
      file: File,
      options?: {
        temp?: boolean;
        signal?: AbortSignal;
        onProgress?: (percent: number, loaded: number, total: number) => void;
      }
    ) => {
      const optimizedFile = await convertToWebP(file);
      const formData = new FormData();
      formData.append('file', optimizedFile);
      const token = getStorageItem('token') || getStorageItem('zerovc_token');
      const csrf = getCsrfToken();
      const params = new URLSearchParams();
      if (options?.temp) params.append('temp', 'true');
      const qs = params.toString() ? `?${params.toString()}` : '';
      const uploadUrl = `${getApiBaseUrl()}/api/upload/attachment${qs}`;

      return new Promise<{ url: string; filename: string; size: number }>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', uploadUrl, true);
        xhr.withCredentials = true;

        if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        if (csrf) xhr.setRequestHeader('X-CSRF-Token', csrf);

        if (options?.signal) {
          if (options.signal.aborted) {
            return reject(new DOMException('Upload aborted', 'AbortError'));
          }
          options.signal.addEventListener('abort', () => {
            xhr.abort();
            reject(new DOMException('Upload aborted', 'AbortError'));
          });
        }

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable && options?.onProgress) {
            const percent = Math.min(99, Math.round((event.loaded / event.total) * 100));
            options.onProgress(percent, event.loaded, event.total);
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const res = JSON.parse(xhr.responseText);
              options?.onProgress?.(100, file.size, file.size);
              resolve(res);
            } catch {
              reject(new Error('Resposta inválida do servidor'));
            }
          } else {
            let msg = 'Falha ao enviar arquivo';
            try {
              const err = JSON.parse(xhr.responseText);
              if (err.error) msg = err.error;
            } catch {}
            reject(new Error(msg));
          }
        };

        xhr.onerror = () => {
          reject(new Error('Falha de rede ao enviar arquivo'));
        };

        xhr.onabort = () => {
          reject(new DOMException('Upload cancelado', 'AbortError'));
        };

        xhr.send(formData);
      });
    },
  },
  linkPreview: {
    getMetadata: async (targetUrl: string): Promise<LinkMetadata | null> => {
      try {
        const res = await fetch(`${getApiBaseUrl()}/api/link-preview?url=${encodeURIComponent(targetUrl)}`);
        if (!res.ok) return null;
        return res.json() as Promise<LinkMetadata>;
      } catch {
        return null;
      }
    },
  },
  games: {
    search: (query: string) => {
      const q = new URLSearchParams({ q: query });
      return request<GameSearchResult[]>(`/games/search?${q.toString()}`);
    },
  },
  commands: {
    executeChannelCommand: (channelId: string, data: { command: string; subcommand?: string; args?: Record<string, any>; attachments?: any[] }) =>
      request<Message>(`/channels/${channelId}/bot/command`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    executeDMRoomCommand: (roomId: string, data: { command: string; subcommand?: string; args?: Record<string, any>; attachments?: any[] }) =>
      request<DMMessage>(`/dm/rooms/${roomId}/bot/command`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    executeDMGroupCommand: (groupId: string, data: { command: string; subcommand?: string; args?: Record<string, any>; attachments?: any[] }) =>
      request<DMGroupMessage>(`/dm/groups/${groupId}/bot/command`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  },
  e2ee: {
    registerIdentity: (identity_public_key: string) =>
      request<{ user_id: string; identity_public_key: string }>('/e2ee/identities', {
        method: 'POST',
        body: JSON.stringify({ identity_public_key }),
      }),

    getIdentity: (userId: string) =>
      request<{ user_id: string; identity_public_key: string }>(`/e2ee/identities/${userId}`),

    registerDevice: (data: {
      curve25519_key: string;
      ed25519_key: string;
      identity_signature: string;
      fallback_key?: string;
      one_time_keys: Record<string, string>;
    }) =>
      request<any>('/e2ee/devices', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    getUserDevices: (userId: string) =>
      request<any[]>(`/e2ee/users/${userId}/devices`),

    replenishOTKs: (deviceId: string, keys: Record<string, string>) =>
      request<{ added: number }>(`/e2ee/devices/${deviceId}/keys`, {
        method: 'POST',
        body: JSON.stringify({ keys }),
      }),

    revokeDevice: (deviceId: string) =>
      request<{ message: string }>(`/e2ee/devices/${deviceId}/revoke`, {
        method: 'POST',
      }),

    claimOTKs: (deviceIds: string[]) =>
      request<Record<string, { key_id: string; public_key: string }>>('/e2ee/devices/keys/claim', {
        method: 'POST',
        body: JSON.stringify({ device_ids: deviceIds }),
      }),

    sendToDevice: (messages: Array<{
      recipient_device_id: string;
      sender_device_id: string;
      msg_type: string;
      payload: string;
    }>) =>
      request<{ queued: number }>('/e2ee/to-device', {
        method: 'POST',
        body: JSON.stringify({ messages }),
      }),

    getToDevice: () =>
      request<Array<{
        id: string;
        recipient_device_id: string;
        sender_device_id: string;
        msg_type: string;
        payload: string;
        created_at: string;
      }>>('/e2ee/to-device'),

    ackToDevice: (messageIds: string[]) =>
      request<{ acked: number }>('/e2ee/to-device/ack', {
        method: 'POST',
        body: JSON.stringify({ message_ids: messageIds }),
      }),

    submitRoster: (roster: any) =>
      request<any>('/e2ee/rosters', {
        method: 'POST',
        body: JSON.stringify(roster),
      }),

    getLatestRoster: (conversationId: string) =>
      request<any>(`/e2ee/rosters/${conversationId}`),

    getConfig: () =>
      request<{ min_version: number; recommended_version: number; features: Record<string, boolean> }>('/e2ee/config'),

    enableDME2EE: (roomId: string) =>
      request<{ e2ee_enabled: boolean; rotation_epoch: number }>(`/dms/${roomId}/e2ee/enable`, {
        method: 'POST',
      }),

    enableDMGroupE2EE: (groupId: string) =>
      request<{ e2ee_enabled: boolean; rotation_epoch: number }>(`/dm/groups/${groupId}/e2ee/enable`, {
        method: 'POST',
      }),

    getChannelAudience: (channelId: string) =>
      request<{
        channel_id: string;
        audience_hash: string;
        rotation_epoch: number;
        epoch?: number;
        audience_limit: number;
        member_count: number;
        members: string[];
        devices: Array<{
          user_id: string;
          device_id: string;
          curve25519_key: string;
          ed25519_key: string;
        }>;
      }>(`/channels/${channelId}/e2ee/audience`),

    enableChannelE2EE: (channelId: string) =>
      request<{
        status: string;
        channel_id: string;
        e2ee_enabled: boolean;
        rotation_epoch: number;
        audience_hash: string;
      }>(`/channels/${channelId}/e2ee/enable`, {
        method: 'POST',
      }),

    uploadAttachment: async (
      blob: Blob | ArrayBuffer,
      filename = 'encrypted.bin',
      onProgress?: (percent: number) => void
    ): Promise<{ id: string; url: string; size: number }> => {
      const baseUrl = getApiBaseUrl();
      const token = getStorageItem('token');
      const body = blob instanceof Blob ? blob : new Blob([blob], { type: 'application/octet-stream' });

      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${baseUrl}/api/e2ee/attachments`);
        if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        xhr.setRequestHeader('Content-Type', 'application/octet-stream');
        xhr.setRequestHeader('X-Client-E2EE-Version', '1');
        const csrfToken = getCsrfToken();
        if (csrfToken) xhr.setRequestHeader('X-CSRF-Token', csrfToken);

        if (xhr.upload && onProgress) {
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              onProgress(Math.round((e.loaded / e.total) * 100));
            }
          };
        }

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              resolve(JSON.parse(xhr.responseText));
            } catch {
              resolve({ id: '', url: '', size: body.size });
            }
          } else {
            reject(new Error(`Falha no upload do anexo: HTTP ${xhr.status}`));
          }
        };
        xhr.onerror = () => reject(new Error('Erro de conexão ao enviar anexo E2EE'));
        xhr.send(body);
      });
    },

    requestKey: (params: {
      conversation_id: string;
      conversation_type: 'dm' | 'dm_group' | 'channel';
      session_id: string;
      epoch: number;
      requester_device_id: string;
    }) =>
      request<{ success: boolean }>('/e2ee/key-requests', {
        method: 'POST',
        body: JSON.stringify(params),
      }),

    uploadBackup: (data: {
      ciphertext?: string;
      backup_ciphertext?: string;
      iv: string;
      salt?: string;
      key_count?: number;
      version: number;
      backup_public_key?: string;
      wrapped_private_key?: string;
    }) =>
      request<{ status: string; version: number }>('/e2ee/backup', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    getBackup: () =>
      request<{
        backup: {
          user_id: string;
          ciphertext?: string;
          backup_ciphertext?: string;
          iv?: string;
          salt?: string;
          key_count?: number;
          version: number;
          backup_public_key?: string;
          wrapped_private_key?: string;
          created_at?: string;
          updated_at?: string;
        };
        ciphertext?: string;
        iv?: string;
        version?: number;
        status?: string;
      }>('/e2ee/backup'),

    deleteBackup: () =>
      request<{ status: string }>('/e2ee/backup/delete', {
        method: 'POST',
      }),

    saveRoomKey: (payload: {
      conversation_type: string;
      conversation_id: string;
      session_id: string;
      session_key: string;
      sender_device_id?: string;
      epoch?: number;
    }) =>
      request<{ status: string }>('/e2ee/room-keys', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),

    getMyRoomKeys: () =>
      request<
        Array<{
          id: string;
          conversation_type: string;
          conversation_id: string;
          session_id: string;
          session_key: string;
          sender_device_id?: string;
          epoch: number;
        }>
      >('/e2ee/my-room-keys'),

    getConversationRoomKeys: (conversationId: string) =>
      request<
        Array<{
          id: string;
          conversation_type: string;
          conversation_id: string;
          session_id: string;
          session_key: string;
          sender_device_id?: string;
          epoch: number;
        }>
      >(`/e2ee/conversations/${conversationId}/keys`),
  },
};