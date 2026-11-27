import { create } from 'zustand';
import { User } from '../types';
import { api, setCsrfToken, clearCsrfToken, initDesktopProxyUrl } from '../lib/api';

async function persistDesktopToken(token: string | null): Promise<void> {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem('token');
    localStorage.removeItem('zerovc_token');
  }
  if (isTauri()) {
    try {
      await desktopBridge.setAuthToken(token);
    } catch (err) {
      console.warn('[authStore] Failed to persist desktop token:', err);
    }
  }
}
import { socket } from '../lib/socket';
import { livekit } from '../lib/livekit';
import { isTauri, desktopBridge } from '../lib/platform';
import { useVoiceStore } from './voiceStore';
import { useCallStore } from './callStore';
import { useGuildStore } from './guildStore';
import { useDMStore } from './dmStore';
import { useDMGroupStore } from './dmGroupStore';
import { useFriendStore } from './friendStore';
import { deriveAccountVaultKey } from '../crypto/recovery';
import { backupManager } from '../crypto/backupManager';
import { megolmManager } from '../crypto/megolmSession';
import { keyStore } from '../crypto/keyStore';
import { deviceManager } from '../crypto/deviceManager';
import { rosterManager } from '../crypto/rosterManager';
import { keyRequestManager } from '../crypto/keyRequestManager';

interface AuthState {
  user: User | null;
  token: string | null;
  isCheckingAuth: boolean;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string, code?: string, turnstileToken?: string, twofaChallenge?: string) => Promise<{ requires_2fa?: boolean; twofa_challenge?: string; requires_verification?: boolean; email?: string } | void>;
  register: (username: string, email: string, password: string, turnstileToken?: string) => Promise<{ requires_verification?: boolean; email?: string } | void>;
  verifyEmail: (email: string, code: string) => Promise<void>;
  loginWithDesktopCode: (code: string) => Promise<void>;
  clearError: () => void;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  updateProfile: (data: {
    username?: string;
    code?: string;
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
    fetchedChannels: {},
    lastReadMessageIdByChannel: {},
    unreadCountByChannel: {},
    firstUnreadMessageIdByChannel: {},
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

// Track in-flight profile updates per key so stale responses and USER_UPDATE broadcasts don't clobber newer optimistic clicks.
const pendingProfileCount: Record<string, number> = {};
const latestProfileSeq: Record<string, number> = {};

export const hasPendingProfileField = (key: string): boolean => (pendingProfileCount[key] || 0) > 0;

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  isCheckingAuth: true,
  isLoading: false,
  error: null,

  clearError: () => set({ error: null }),

  login: async (email, password, code, turnstileToken, twofaChallenge) => {
    set({ isLoading: true, error: null });
    try {
      const res = await api.auth.login({
        email,
        password,
        code,
        turnstile_token: turnstileToken,
        twofa_challenge: twofaChallenge,
      });
      if (res.requires_2fa) {
        set({ isLoading: false });
        return { requires_2fa: true, twofa_challenge: res.twofa_challenge };
      }
      if (res.requires_verification) {
        set({ isLoading: false });
        return { requires_verification: true, email: res.email || email };
      }
      if (res.token && res.user) {
        await persistDesktopToken(res.token);
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
          if (res.user.e2ee_backup_enabled !== false) {
            backupManager.ensureActiveBackup(true).catch((err) => {
              console.warn('[authStore] Initial backup on login failed:', err);
            });
          }
        } catch (vaultErr) {
          console.warn('[authStore] Failed to derive or autoRestore account vault key:', vaultErr);
        }

        set({ user: res.user, token: 'cookie_session', isLoading: false });
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
        await persistDesktopToken(res.token);
        if (res.csrf_token) {
          setCsrfToken(res.csrf_token);
        } else if (res.user.csrf_token) {
          setCsrfToken(res.user.csrf_token);
        }

        try {
          const { key, rawBytes } = await deriveAccountVaultKey(password, res.user.id);
          backupManager.setVaultKey(key, res.user.id);
          await backupManager.saveVaultKeyToStore(rawBytes);
          if (res.user.e2ee_backup_enabled !== false) {
            backupManager.ensureActiveBackup(true).catch((err) => {
              console.warn('[authStore] Initial backup on register failed:', err);
            });
          }
        } catch (vaultErr) {
          console.warn('[authStore] Failed to initialize account vault key on register:', vaultErr);
        }

        set({ user: res.user, token: 'cookie_session', isLoading: false });
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
        await persistDesktopToken(res.token);
        if (res.csrf_token) {
          setCsrfToken(res.csrf_token);
        } else if (res.user.csrf_token) {
          setCsrfToken(res.user.csrf_token);
        }
        set({ user: res.user, token: 'cookie_session', isLoading: false });
        socket.connect();
      }
    } catch (err: any) {
      set({ error: err.message || 'Código de verificação inválido ou expirado', isLoading: false });
      throw err;
    }
  },

  loginWithDesktopCode: async (code) => {
    set({ isLoading: true, error: null });
    try {
      if (isTauri()) {
        await initDesktopProxyUrl();
      }
      const res = await api.auth.exchangeDesktopCode(code);
      if (res.token && res.user) {
        await persistDesktopToken(res.token);
        if (res.csrf_token) {
          setCsrfToken(res.csrf_token);
        } else if (res.user.csrf_token) {
          setCsrfToken(res.user.csrf_token);
        }
        try {
          const key = await backupManager.loadVaultKeyFromStore(res.user.id);
          if (key) {
            backupManager.setVaultKey(key, res.user.id);
          }
        } catch {}
        set({ user: res.user, token: 'cookie_session', isCheckingAuth: false, isLoading: false });
        megolmManager.syncAllUserRoomKeys().catch(() => {});
        megolmManager.syncAllLocalKeysToServer().catch(() => {});
        socket.connect();
      }
    } catch (err: any) {
      set({ error: err.message || 'Falha ao autenticar com o código do navegador', isLoading: false });
      throw err;
    }
  },

  logout: async () => {
    try {
      backupManager.clearVaultKey();
      deviceManager.clear();
      rosterManager.clear();
      keyRequestManager.clear();
    } catch {}
    try {
      await api.auth.logout();
    } catch {}
    await persistDesktopToken(null);
    clearCsrfToken();
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem('zerovc_device_id');
        localStorage.removeItem('zerovc_csrf_token');
      } catch {}
    }
    try {
      await keyStore.clearAll();
    } catch {}
    await cleanupAllStoresAndConnections();
    set({ user: null, token: null, isCheckingAuth: false, isLoading: false });

    // Clean URL completely on logout: remove any /@me/... or channel IDs
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.removeItem('pending_redirect_path');
        if (window.location.protocol === 'file:') {
          window.history.replaceState(null, '', '#/');
        } else {
          window.history.replaceState(null, '', '/');
        }
        window.dispatchEvent(new PopStateEvent('popstate'));
      } catch {}
    }
  },

  checkAuth: async () => {
    try {
      if (isTauri()) {
        await initDesktopProxyUrl();
      }
      const user = await api.auth.me();
      if (user?.csrf_token) {
        setCsrfToken(user.csrf_token);
      }
      if (user?.id) {
        try {
          const key = await backupManager.loadVaultKeyFromStore(user.id);
          if (key) {
            backupManager.setVaultKey(key, user.id);
            backupManager
              .autoRestore(key)
              .catch((err) => {
                console.warn('[checkAuth] autoRestore error in background:', err);
              })
              .finally(() => {
                if (user.e2ee_backup_enabled !== false) {
                  backupManager.ensureActiveBackup().catch((err) => {
                    console.warn('[checkAuth] ensureActiveBackup error in background:', err);
                  });
                }
              });
          }
        } catch (vaultErr) {
          console.warn('[checkAuth] Failed to load vault key from store:', vaultErr);
        }
      }
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('token');
        localStorage.removeItem('zerovc_token');
      }
      set({ user, token: 'cookie_session', isCheckingAuth: false, isLoading: false });
      megolmManager.syncAllUserRoomKeys().catch(() => {});
      megolmManager.syncAllLocalKeysToServer().catch(() => {});
      socket.connect();
    } catch (err: any) {
      const status = err?.status;
      const isUnauthorized = status === 401 || status === 403;
      try {
        backupManager.clearVaultKey();
      } catch {}
      if (isUnauthorized) {
        await persistDesktopToken(null);
      }
      await cleanupAllStoresAndConnections();
      set({ user: null, token: null, isCheckingAuth: false, isLoading: false });
    }
  },

  updateProfile: async (data) => {
    const keys = Object.keys(data);
    const mySeq: Record<string, number> = {};
    for (const key of keys) {
      pendingProfileCount[key] = (pendingProfileCount[key] || 0) + 1;
      latestProfileSeq[key] = (latestProfileSeq[key] || 0) + 1;
      mySeq[key] = latestProfileSeq[key];
    }
    try {
      const updated = await api.users.updateProfile(data);
      set((state) => {
        if (!state.user) return { user: updated };
        const patched: Record<string, any> = {};
        for (const key of keys) {
          if (mySeq[key] === latestProfileSeq[key] && key in updated) {
            patched[key] = (updated as any)[key];
          }
        }
        return Object.keys(patched).length > 0 ? { user: { ...state.user, ...patched } } : state;
      });
      return updated;
    } finally {
      for (const key of keys) {
        pendingProfileCount[key] = Math.max(0, (pendingProfileCount[key] || 1) - 1);
      }
    }
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