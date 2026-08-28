import { create } from 'zustand';
import { Friendship } from '../types';
import { api } from '../lib/api';

interface FriendState {
  friends: Friendship[];
  pending: Friendship[];
  incoming: Friendship[];
  isLoading: boolean;
  error: string | null;

  fetchFriends: () => Promise<void>;
  sendRequest: (username: string) => Promise<void>;
  acceptRequest: (friendshipId: string) => Promise<void>;
  removeFriend: (friendshipId: string) => Promise<void>;
  handleFriendEvent: (event: any) => void;
}

export const useFriendStore = create<FriendState>((set, get) => ({
  friends: [],
  pending: [],
  incoming: [],
  isLoading: false,
  error: null,

  fetchFriends: async () => {
    set({ isLoading: true, error: null });
    try {
      const data = await api.friends.list();
      set({
        friends: data.friends,
        pending: data.pending,
        incoming: data.incoming,
        isLoading: false,
      });
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
    }
  },

  sendRequest: async (username: string) => {
    set({ error: null });
    try {
      const friendship = await api.friends.sendRequest(username);
      if (friendship.status === 'accepted') {
        // Auto accepted
        get().fetchFriends();
      } else {
        set((state) => ({ pending: [friendship, ...state.pending] }));
      }
    } catch (err: any) {
      set({ error: err.message });
      throw err;
    }
  },

  acceptRequest: async (friendshipId: string) => {
    await api.friends.accept(friendshipId);
    get().fetchFriends();
  },

  removeFriend: async (friendshipId: string) => {
    await api.friends.remove(friendshipId);
    get().fetchFriends();
  },

  handleFriendEvent: (event: any) => {
    get().fetchFriends();
  },
}));
