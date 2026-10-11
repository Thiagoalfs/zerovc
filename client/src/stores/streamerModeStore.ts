import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface StreamerModeState {
  enabled: boolean;
  autoDetect: boolean;
  censorUsernames: boolean;
  hidePersonalData: boolean;
  hideInviteLinks: boolean;
  disableSounds: boolean;
  disableNotifications: boolean;
  customProcesses: string[];
  runningStreamApps: string[];
  sessionDismissed: boolean;

  // Actions
  setEnabled: (enabled: boolean) => void;
  setAutoDetect: (autoDetect: boolean) => void;
  setCensorUsernames: (censor: boolean) => void;
  setHidePersonalData: (hide: boolean) => void;
  setHideInviteLinks: (hide: boolean) => void;
  setDisableSounds: (disable: boolean) => void;
  setDisableNotifications: (disable: boolean) => void;
  addCustomProcess: (processName: string) => void;
  removeCustomProcess: (processName: string) => void;
  dismissForSession: () => void;
  handleStreamAppsUpdate: (runningApps: string[]) => void;
}

export function censorUsername(name?: string | null): string {
  if (!name) return '';
  const trimmed = name.trim();
  if (trimmed.length <= 3) {
    return `${trimmed}...`;
  }
  return `${trimmed.slice(0, 3)}...`;
}

export function getFormattedUsername(name?: string | null): string {
  if (!name) return '';
  const state = useStreamerModeStore.getState();
  if (state.enabled && state.censorUsernames) {
    return censorUsername(name);
  }
  return name;
}

export function useFormattedUsername(name?: string | null): string {
  const enabled = useStreamerModeStore((s) => s.enabled);
  const censorUsernames = useStreamerModeStore((s) => s.censorUsernames);
  if (!name) return '';
  if (enabled && censorUsernames) {
    return censorUsername(name);
  }
  return name;
}

export const useStreamerModeStore = create<StreamerModeState>()(
  persist(
    (set, get) => ({
      enabled: false,
      autoDetect: true,
      censorUsernames: true,
      hidePersonalData: true,
      hideInviteLinks: true,
      disableSounds: true,
      disableNotifications: true,
      customProcesses: [],
      runningStreamApps: [],
      sessionDismissed: false,

      setEnabled: (enabled: boolean) => {
        set({ enabled });
      },

      setAutoDetect: (autoDetect: boolean) => {
        set({ autoDetect });
      },

      setCensorUsernames: (censorUsernames: boolean) => {
        set({ censorUsernames });
      },

      setHidePersonalData: (hidePersonalData: boolean) => {
        set({ hidePersonalData });
      },

      setHideInviteLinks: (hideInviteLinks: boolean) => {
        set({ hideInviteLinks });
      },

      setDisableSounds: (disableSounds: boolean) => {
        set({ disableSounds });
      },

      setDisableNotifications: (disableNotifications: boolean) => {
        set({ disableNotifications });
      },

      addCustomProcess: (processName: string) => {
        const clean = processName.toLowerCase().trim();
        if (!clean) return;
        const formatted = clean.endsWith('.exe') ? clean : `${clean}.exe`;
        const current = get().customProcesses;
        if (!current.includes(formatted)) {
          const updated = [...current, formatted];
          set({ customProcesses: updated });
          if (typeof window !== 'undefined' && (window as any).electronAPI?.setCustomStreamerProcesses) {
            (window as any).electronAPI.setCustomStreamerProcesses(updated);
          }
        }
      },

      removeCustomProcess: (processName: string) => {
        const clean = processName.toLowerCase().trim();
        const current = get().customProcesses;
        const updated = current.filter((p) => p.toLowerCase().trim() !== clean);
        set({ customProcesses: updated });
        if (typeof window !== 'undefined' && (window as any).electronAPI?.setCustomStreamerProcesses) {
          (window as any).electronAPI.setCustomStreamerProcesses(updated);
        }
      },

      dismissForSession: () => {
        set({ enabled: false, sessionDismissed: true });
      },

      handleStreamAppsUpdate: (runningApps: string[]) => {
        const state = get();
        const prevApps = state.runningStreamApps;
        const hasAppsNow = runningApps.length > 0;
        const hadAppsBefore = prevApps.length > 0;

        set({ runningStreamApps: runningApps });

        // If auto-detect is disabled, do nothing automatically
        if (!state.autoDetect) {
          return;
        }

        // Auto-activate if streaming apps opened and user hasn't dismissed for this session
        if (hasAppsNow && !hadAppsBefore && !state.sessionDismissed && !state.enabled) {
          set({ enabled: true });
        } else if (hasAppsNow && !state.enabled && !state.sessionDismissed) {
          set({ enabled: true });
        }

        // Auto-deactivate when all streaming apps close
        if (!hasAppsNow && hadAppsBefore && state.enabled) {
          set({ enabled: false });
        }
      },
    }),
    {
      name: 'zerovc_streamer_mode_settings',
      partialize: (state) => ({
        autoDetect: state.autoDetect,
        censorUsernames: state.censorUsernames,
        hidePersonalData: state.hidePersonalData,
        hideInviteLinks: state.hideInviteLinks,
        disableSounds: state.disableSounds,
        disableNotifications: state.disableNotifications,
        customProcesses: state.customProcesses,
        // enabled and sessionDismissed are intentional session states that don't persist on fresh startup
      }),
    }
  )
);
