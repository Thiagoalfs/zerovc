import { create } from 'zustand';
import { FavoriteGIF } from '../types';
import { api } from '../lib/api';

interface FavoriteGifState {
  favoriteGifs: FavoriteGIF[];
  isLoading: boolean;
  hasLoaded: boolean;
  fetchFavorites: () => Promise<void>;
  toggleFavorite: (gifUrl: string, previewUrl?: string, title?: string) => Promise<boolean>;
  isFavorited: (gifUrl: string) => boolean;
  removeFavorite: (gifUrl: string) => Promise<void>;
}

export const useFavoriteGifStore = create<FavoriteGifState>((set, get) => ({
  favoriteGifs: [],
  isLoading: false,
  hasLoaded: false,

  fetchFavorites: async () => {
    set({ isLoading: true });
    try {
      const list = await api.users.getFavoriteGifs();
      set({ favoriteGifs: list, isLoading: false, hasLoaded: true });
    } catch (err) {
      console.error('Failed to fetch favorite gifs:', err);
      set({ isLoading: false });
    }
  },

  isFavorited: (gifUrl: string) => {
    return get().favoriteGifs.some((g) => g.gif_url === gifUrl);
  },

  toggleFavorite: async (gifUrl: string, previewUrl?: string, title?: string) => {
    const isFav = get().isFavorited(gifUrl);
    if (isFav) {
      // Remove from favorites
      set((state) => ({
        favoriteGifs: state.favoriteGifs.filter((g) => g.gif_url !== gifUrl),
      }));
      try {
        await api.users.removeFavoriteGif(gifUrl);
      } catch (err) {
        console.error('Failed to remove favorite GIF:', err);
      }
      return false;
    } else {
      // Add to favorites (optimistic update to top of list)
      const tempId = `temp-${Date.now()}`;
      const newGif: FavoriteGIF = {
        id: tempId,
        user_id: '',
        gif_url: gifUrl,
        preview_url: previewUrl || gifUrl,
        title: title || '',
        created_at: new Date().toISOString(),
      };
      set((state) => ({
        favoriteGifs: [newGif, ...state.favoriteGifs.filter((g) => g.gif_url !== gifUrl)],
      }));
      try {
        const saved = await api.users.addFavoriteGif({
          gif_url: gifUrl,
          preview_url: previewUrl || gifUrl,
          title: title || '',
        });
        set((state) => ({
          favoriteGifs: state.favoriteGifs.map((g) => (g.id === tempId ? saved : g)),
        }));
      } catch (err) {
        console.error('Failed to add favorite GIF:', err);
      }
      return true;
    }
  },

  removeFavorite: async (gifUrl: string) => {
    set((state) => ({
      favoriteGifs: state.favoriteGifs.filter((g) => g.gif_url !== gifUrl),
    }));
    try {
      await api.users.removeFavoriteGif(gifUrl);
    } catch (err) {
      console.error('Failed to remove favorite GIF:', err);
    }
  },
}));
