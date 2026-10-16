import { create } from 'zustand';
import { User } from '../types';
import { api, setCsrfToken } from '../lib/api';
import { socket } from '../lib/socket';
import { livekit } from '../lib/livekit';
import { isElectron } from '../lib/platform';
import { useVoiceStore } from './voiceStore';
import { useCallStore } from './callStore';
import { useGuildStore } from './guildStore';
import { useDMStore } from './dmStore';
import { useDMGroupStore } from './dmGroupStore';
import { useFriendStore } from './friendStore';
import { deriveAccountVaultKey } from '../crypto/recovery';
import { backupManager } from '../crypto/backupManager';
import { megolmManager } from '../crypto/megolmSession';

interface AuthState {
  user: User | null;
  token: string | null;
  isCheckingAuth: boolean;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string, code?: string, turnstileToken?: string) => Promise<{ requires_2fa?: boolean; requires_verification?: boolean; email?: string } | void>;
  register: (username: string, email: string, password: string, turnstileToken?: string) => Promise<{ requires_verification?: boolean; email?: string } | void>;
  verifyEmail: (email: string, code: string) => Promise<void>;
  clearError: () => void;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  updateProfile: (data: {
    username?: string;
    phone_number?: string;
    display_name?: string;
    avatar_url?: string;
    banner_url?: string;
    bio?: string;
    status?: 'online' | 'idle' | 'dnd' | 'offline';
    custom_status?: string;
    custom_activity?: import('../types').CustomActivity | null;
    show_activity_status?: boolean;
    auto_detect_activity?: boolean;
  }) => Promise<User>;
  setUser: (user: Partial<User> & { id?: string }) => void;
}

const cleanupAllStoresAndConnections = async () => {
  try {
    await useVoiceStore.getState().leaveVoice();
  } catch {}
  try {
    await useCallStore.getState().endCall();
  } catch {}
  try {
    await livekit.disconnect();
  } catch {}
  try {
    socket.disconnect();
  } catch {}

  // Reset stores to clean initial state
  useGuildStore.setState({
    guilds: [],
    activeGuild: null,
    activeChannel: null,
    messages: [],
    unreadChannels: new Set(),
    guildMentions: {},
    channelMentions: {},
    messagesByChannel: {},
    pinnedMessagesByChannel: {},
    isLoadingPinned: {},
    hasMoreByChannel: {},
    isLoadingGuilds: false,
    isLoadingMessages: false,
    isLoadingMoreMessages: false,
    typingUsers: new Map(),
  });

  useDMStore.setState({
    rooms: [],
    activeRoom: null,
    messages: [],
    unreadRooms: new Set(),
    roomUnreadCounts: {},
    messagesByRoom: {},
    pinnedMessagesByRoom: {},
    isLoadingPinned: {},
    hasMoreByRoom: {},
    isLoadingRooms: false,
    isLoadingMessages: false,
    isLoadingMoreMessages: false,
  });

  useDMGroupStore.setState({
    groups: [],
    activeGroup: null,
    messages: [],
    messagesByGroup: {},
    hasMoreByGroup: {},
    isLoadingGroups: false,
    isLoadingMessages: false,
    isLoadingMoreMessages: false,
  });

  useFriendStore.setState({
    friends: [],
    pending: [],
    incoming: [],
    isLoading: false,
    error: null,
  });

  useVoiceStore.setState({
    currentChannelId: null,
    isConnected: false,
    isConnecting: false,
    isScreensharing: false,
    isCameraOn: false,
    participants: [],
    speakingUserIds: [],
    watchedParticipantId: null,
  });

  useCallStore.setState({
    callState: 'idle',
    roomId: null,
    targetUser: null,
    incomingCaller: null,
    isCameraOn: false,
    isScreensharing: false,
    participants: [],
    speakingUserIds: [],
  });
};

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: isElectron() ? localStorage.getItem('token') || localStorage.getItem('zerovc_token') : null,
  isCheckingAuth: true,
  isLoading: false,
  error: null,

  clearError: () => set({ error: null }),

  login: async (email, password, code, turnstileToken) => {
    set({ isLoading: true, error: null });
    try {
      const res = await api.auth.login({ email, password, code, turnstile_token: turnstileToken });
      if (res.requires_2fa) {
        set({ isLoading: false });
        return { requires_2fa: true };
      }
      if (res.requires_verification) {
        set({ isLoading: false });
        return { requires_verification: true, email: res.email || email };
      }
      if (res.token && res.user) {
        if (isElectron()) {
          localStorage.setItem('token', res.token);
          localStorage.setItem('zerovc_token', res.token);
        }
        if (res.csrf_token) {
          setCsrfToken(res.csrf_token);
        } else if (res.user.csrf_token) {
          setCsrfToken(res.user.csrf_token);
        }

        try {
          const { key, rawBytes } = await deriveAccountVaultKey(password, res.user.id);
          backupManager.setVaultKey(key, res.user.id);
          await backupManager.saveVaultKeyToStore(rawBytes);
          await backupManager.autoRestore(key);
        } catch (vaultErr) {
          console.warn('[authStore] Failed to derive or autoRestore account vault key:', vaultErr);
        }

        set({ user: res.user, token: isElectron() ? res.token : 'cookie_session', isLoading: false });
        megolmManager.syncAllUserRoomKeys().catch(() => {});
        megolmManager.syncAllLocalKeysToServer().catch(() => {});
        socket.connect();
      }
    } catch (err: any) {
      set({ error: err.message || 'Falha ao fazer login', isLoading: false });
      throw err;
    }
  },

  register: async (username, email, password, turnstileToken) => {
    set({ isLoading: true, error: null });
    try {
      const res = await api.auth.register({ username, email, password, turnstile_token: turnstileToken });
      if (res.requires_verification) {
        set({ isLoading: false });
        return { requires_verification: true, email: res.email || email };
      }
      if (res.token && res.user) {
        if (isElectron()) {
          localStorage.setItem('token', res.token);
          localStorage.setItem('zerovc_token', res.token);
        }
        if (res.csrf_token) {
          setCsrfToken(res.csrf_token);
        } else if (res.user.csrf_token) {
          setCsrfToken(res.user.csrf_token);
        }

        try {
          const { key, rawBytes } = await deriveAccountVaultKey(password, res.user.id);
          backupManager.setVaultKey(key, res.user.id);
          await backupManager.saveVaultKeyToStore(rawBytes);
        } catch (vaultErr) {
          console.warn('[authStore] Failed to initialize account vault key on register:', vaultErr);
        }

        set({ user: res.user, token: isElectron() ? res.token : 'cookie_session', isLoading: false });
        megolmManager.syncAllUserRoomKeys().catch(() => {});
        megolmManager.syncAllLocalKeysToServer().catch(() => {});
        socket.connect();
      }
    } catch (err: any) {
      set({ error: err.message || 'Falha ao criar conta', isLoading: false });
      throw err;
    }
  },

  verifyEmail: async (email, code) => {
    set({ isLoading: true, error: null });
    try {
      const res = await api.auth.verifyEmail({ email, code });
      if (res.token && res.user) {
        if (isElectron()) {
          localStorage.setItem('token', res.token);
          localStorage.setItem('zerovc_token', res.token);
        }
        if (res.csrf_token) {
          setCsrfToken(res.csrf_token);
        } else if (res.user.csrf_token) {
          setCsrfToken(res.user.csrf_token);
        }
        set({ user: res.user, token: isElectron() ? res.token : 'cookie_session', isLoading: false });
        socket.connect();
      }
    } catch (err: any) {
      set({ error: err.message || 'Código de verificação inválido ou expirado', isLoading: false });
      throw err;
    }
  },

  logout: async () => {
    try {
      backupManager.clearVaultKey();
    } catch {}
    try {
      await api.auth.logout();
    } catch {}
    if (isElectron()) {
      localStorage.removeItem('token');
      localStorage.removeItem('zerovc_token');
    }
    await cleanupAllStoresAndConnections();
    set({ user: null, token: null, isCheckingAuth: false, isLoading: false });
  },

  checkAuth: async () => {
    try {
      const user = await api.auth.me();
      if (user?.csrf_token) {
        setCsrfToken(user.csrf_token);
      }
      if (user?.id) {
        try {
          const key = await backupManager.loadVaultKeyFromStore();
          if (key) {
            backupManager.setVaultKey(key, user.id);
            backupManager.autoRestore(key).catch((err) => {
              console.warn('[checkAuth] autoRestore error in background:', err);
            });
          }
        } catch (vaultErr) {
          console.warn('[checkAuth] Failed to load vault key from store:', vaultErr);
        }
      }
      const token = isElectron()
        ? localStorage.getItem('token') || localStorage.getItem('zerovc_token') || 'cookie_session'
        : 'cookie_session';
      set({ user, token, isCheckingAuth: false, isLoading: false });
      megolmManager.syncAllUserRoomKeys().catch(() => {});
      megolmManager.syncAllLocalKeysToServer().catch(() => {});
      socket.connect();
    } catch {
      try {
        backupManager.clearVaultKey();
      } catch {}
      if (isElectron()) {
        localStorage.removeItem('token');
        localStorage.removeItem('zerovc_token');
      }
      await cleanupAllStoresAndConnections();
      set({ user: null, token: null, isCheckingAuth: false, isLoading: false });
    }
  },

  updateProfile: async (data) => {
    const updated = await api.users.updateProfile(data);
    set({ user: updated });
    return updated;
  },

  setUser: (user: Partial<User> & { id?: string }) => {
    set((state) => ({
      user: state.user
        ? {
            ...state.user,
            ...user,
            custom_activity:
              'custom_activity' in user
                ? (user.custom_activity || null)
                : (user.status === 'offline' ? null : state.user.custom_activity),
          }
        : (user as User),
    }));
  },
}));