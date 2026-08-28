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
  logout: () => void;
  checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: localStorage.getItem('zerovc_token'),
  isLoading: true,
  error: null,

  login: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const res = await api.auth.login({ email, password });
      localStorage.setItem('zerovc_token', res.token);
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
      localStorage.setItem('zerovc_token', res.token);
      set({ user: res.user, token: res.token, isLoading: false });
      socket.connect();
    } catch (err: any) {
      set({ error: err.message || 'Falha ao criar conta', isLoading: false });
      throw err;
    }
  },

  logout: () => {
    localStorage.removeItem('zerovc_token');
    socket.disconnect();
    set({ user: null, token: null, isLoading: false });
  },

  checkAuth: async () => {
    const token = localStorage.getItem('zerovc_token');
    if (!token) {
      set({ user: null, token: null, isLoading: false });
      return;
    }

    try {
      const user = await api.auth.me();
      set({ user, token, isLoading: false });
      socket.connect();
    } catch {
      localStorage.removeItem('zerovc_token');
      set({ user: null, token: null, isLoading: false });
    }
  },
}));
