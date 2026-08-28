import { create } from 'zustand';
import { User } from '../types';
import { api } from '../lib/api';
import { socket } from '../lib/socket';

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  updateProfile: (data: {
    display_name?: string;
    avatar_url?: string;
    banner_url?: string;
    bio?: string;
    status?: 'online' | 'idle' | 'dnd' | 'offline';
    custom_status?: string;
  }) => Promise<User>;
  setUser: (user: User) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: localStorage.getItem('token') || localStorage.getItem('zerovc_token'),
  isLoading: true,
  error: null,

  login: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const res = await api.auth.login({ email, password });
      if (res.token) {
        localStorage.setItem('token', res.token);
        localStorage.setItem('zerovc_token', res.token);
      }
      set({ user: res.user, token: res.token, isLoading: false });
      socket.connect();
    } catch (err: any) {
      set({ error: err.message || 'Falha ao fazer login', isLoading: false });
      throw err;
    }
  },

  register: async (username, email, password) => {
    set({ isLoading: true, error: null });
    try {
      const res = await api.auth.register({ username, email, password });
      if (res.token) {
        localStorage.setItem('token', res.token);
        localStorage.setItem('zerovc_token', res.token);
      }
      set({ user: res.user, token: res.token, isLoading: false });
      socket.connect();
    } catch (err: any) {
      set({ error: err.message || 'Falha ao criar conta', isLoading: false });
      throw err;
    }
  },

  logout: async () => {
    try {
      await api.auth.logout();
    } catch {}
    localStorage.removeItem('token');
    localStorage.removeItem('zerovc_token');
    socket.disconnect();
    set({ user: null, token: null, isLoading: false });
  },

  checkAuth: async () => {
    try {
      const user = await api.auth.me();
      const token = localStorage.getItem('token') || localStorage.getItem('zerovc_token') || 'cookie_session';
      set({ user, token, isLoading: false });
      socket.connect();
    } catch {
      localStorage.removeItem('token');
      localStorage.removeItem('zerovc_token');
      set({ user: null, token: null, isLoading: false });
    }
  },

  updateProfile: async (data) => {
    const updated = await api.users.updateProfile(data);
    set({ user: updated });
    return updated;
  },

  setUser: (user: User) => {
    set({ user });
  },
}));
