import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface RegisteredGame {
  id: string;
  name: string;
  executable?: string;
  lastPlayed: number; // timestamp in ms
  enabled: boolean; // whether activity is broadcasted
  isVerified?: boolean; // detected from known games list
}

const DEFAULT_GAMES: RegisteredGame[] = [
  { id: 'game-osu', name: 'osu!', lastPlayed: Date.now() - 2 * 3600 * 1000, enabled: true, isVerified: true },
  { id: 'game-lol', name: 'League of Legends', lastPlayed: Date.now() - 11 * 3600 * 1000, enabled: true, isVerified: true },
  { id: 'game-wallpaper-engine', name: 'Wallpaper Engine', lastPlayed: Date.now() - 3 * 86400 * 1000, enabled: true, isVerified: false },
  { id: 'game-roblox', name: 'ROBLOX', lastPlayed: Date.now() - 7 * 86400 * 1000, enabled: true, isVerified: true },
  { id: 'game-overwatch', name: 'Overwatch', lastPlayed: Date.now() - 7 * 86400 * 1000, enabled: true, isVerified: true },
  { id: 'game-nte', name: 'NTE: Neverness to Everness', lastPlayed: Date.now() - 7 * 86400 * 1000, enabled: true, isVerified: true },
  { id: 'game-peak', name: 'PEAK', lastPlayed: Date.now() - 12 * 86400 * 1000, enabled: true, isVerified: true },
  { id: 'game-valorant', name: 'VALORANT', lastPlayed: Date.now() - 14 * 86400 * 1000, enabled: true, isVerified: true },
];

interface RegisteredGamesState {
  games: RegisteredGame[];
  addOrUpdateGame: (name: string, isVerified?: boolean, executable?: string) => void;
  toggleGameEnabled: (id: string) => void;
  setGameEnabled: (name: string, enabled: boolean) => void;
  removeGame: (id: string) => void;
  renameGame: (id: string, newName: string) => void;
  isGameEnabled: (name: string) => boolean;
}

export const useRegisteredGamesStore = create<RegisteredGamesState>()(
  persist(
    (set, get) => ({
      games: DEFAULT_GAMES,

      addOrUpdateGame: (name: string, isVerified = false, executable?: string) => {
        if (!name || !name.trim()) return;
        const trimmed = name.trim();
        const existing = get().games.find(
          (g) => g.name.toLowerCase() === trimmed.toLowerCase() || (executable && g.executable === executable)
        );

        if (existing) {
          set((state) => ({
            games: state.games.map((g) =>
              g.id === existing.id
                ? { ...g, lastPlayed: Date.now(), isVerified: isVerified || g.isVerified }
                : g
            ),
          }));
        } else {
          const newGame: RegisteredGame = {
            id: `game-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            name: trimmed,
            executable,
            lastPlayed: Date.now(),
            enabled: true,
            isVerified,
          };
          set((state) => ({
            games: [newGame, ...state.games],
          }));
        }
      },

      toggleGameEnabled: (id: string) => {
        set((state) => ({
          games: state.games.map((g) => (g.id === id ? { ...g, enabled: !g.enabled } : g)),
        }));
      },

      setGameEnabled: (name: string, enabled: boolean) => {
        set((state) => ({
          games: state.games.map((g) =>
            g.name.toLowerCase() === name.trim().toLowerCase() ? { ...g, enabled } : g
          ),
        }));
      },

      removeGame: (id: string) => {
        set((state) => ({
          games: state.games.filter((g) => g.id !== id),
        }));
      },

      renameGame: (id: string, newName: string) => {
        if (!newName || !newName.trim()) return;
        set((state) => ({
          games: state.games.map((g) => (g.id === id ? { ...g, name: newName.trim() } : g)),
        }));
      },

      isGameEnabled: (name: string) => {
        if (!name) return true;
        const game = get().games.find((g) => g.name.toLowerCase() === name.trim().toLowerCase());
        return game ? game.enabled : true;
      },
    }),
    {
      name: 'zerovc_registered_games',
    }
  )
);
