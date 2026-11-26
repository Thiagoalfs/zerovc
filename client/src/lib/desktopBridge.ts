import type { ElectronAPI, ScreenSource, UpdateInfo, UpdateProgress } from '../types/electron';

export const isTauri = (): boolean =>
  typeof window !== 'undefined' &&
  Boolean((window as any).__TAURI_INTERNALS__ || (window as any).__TAURI__);

export const isElectron = (): boolean => false;

export const isDesktop = (): boolean => isTauri();

function detectPlatform(): string {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('win')) return 'win32';
  if (ua.includes('mac')) return 'darwin';
  if (ua.includes('linux')) return 'linux';
  return 'unknown';
}

async function tauriInvoke<T = unknown>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(cmd, args);
}

async function tauriCurrentWindow() {
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  return getCurrentWindow();
}

function createTauriEventListener<T = any>(
  eventName: string,
  callback: (payload: T) => void
): () => void {
  let unlisten: (() => void) | null = null;
  let disposed = false;

  void import('@tauri-apps/api/event')
    .then(({ listen }) =>
      listen<T>(eventName, (event) => {
        if (!disposed) callback(event.payload);
      })
    )
    .then((fn) => {
      if (disposed) {
        fn();
      } else {
        unlisten = fn;
      }
    })
    .catch(() => {});

  return () => {
    disposed = true;
    unlisten?.();
  };
}

let cachedTauriBridge: ElectronAPI | null = null;
const globalShortcutCallbacks = new Set<(action: string) => void>();

function createTauriBridge(): ElectronAPI {
  if (cachedTauriBridge) return cachedTauriBridge;

  let currentZoomFactor = 1;

  cachedTauriBridge = {
    isElectron: false,
    isTauri: true,
    platform: detectPlatform(),

    setAuthToken: async (token: string | null) => {
      await tauriInvoke<void>('set_auth_token', { token });
    },

    getProxyUrl: async () => {
      if (typeof window !== 'undefined' && window.__ZEROVC_PROXY_URL__) {
        return window.__ZEROVC_PROXY_URL__;
      }
      try {
        const url = await tauriInvoke<string | null>('get_proxy_url');
        return url || null;
      } catch {
        return null;
      }
    },

    setAudioOutputDevice: async (deviceId: string) => {
      await tauriInvoke<void>('set_audio_output_device', { deviceId });
    },

    getScreenSources: async (opts) => {
      try {
        return await tauriInvoke<ScreenSource[]>('get_screen_sources', { opts });
      } catch {
        return [];
      }
    },

    isProcessRunning: async (processes: string[]) => {
      try {
        return await tauriInvoke<boolean>('is_process_running', { processes });
      } catch {
        return false;
      }
    },

    minimize: () => {
      void tauriCurrentWindow()
        .then((win) => win.minimize())
        .catch(() => {});
    },

    maximize: () => {
      void tauriCurrentWindow()
        .then((win) => win.toggleMaximize())
        .catch(() => {});
    },

    close: () => {
      void tauriCurrentWindow()
        .then((win) => win.close())
        .catch(() => {});
    },

    isMaximized: async () => {
      try {
        const win = await tauriCurrentWindow();
        return await win.isMaximized();
      } catch {
        return false;
      }
    },

    setFullScreen: (flag: boolean) => {
      void tauriCurrentWindow()
        .then((win) => win.setFullscreen(flag))
        .catch(() => {});
    },

    isFullScreen: async () => {
      try {
        const win = await tauriCurrentWindow();
        return await win.isFullscreen();
      } catch {
        return false;
      }
    },

    checkForUpdates: () => {
      void import('@tauri-apps/plugin-updater')
        .then(({ check }) => check())
        .then(async (update) => {
          const { emit } = await import('@tauri-apps/api/event');
          if (update) {
            await emit('update-available', {
              version: update.version,
              releaseNotes: update.body ?? undefined,
            } satisfies UpdateInfo);
            await emit('update-check-result', {
              status: 'available',
              version: update.version,
            });
          } else {
            await emit('update-check-result', {
              status: 'up-to-date',
            });
          }
        })
        .catch(async (err) => {
          console.warn('[Updater] checkForUpdates failed:', err);
          try {
            const { emit } = await import('@tauri-apps/api/event');
            await emit('update-check-result', { status: 'error' });
          } catch {}
        });
    },

    startDownloadUpdate: () => {
      void import('@tauri-apps/plugin-updater')
        .then(({ check }) => check())
        .then(async (update) => {
          if (!update) return;
          const { emit } = await import('@tauri-apps/api/event');
          let downloaded = 0;
          let total = 0;
          await update.downloadAndInstall((event) => {
            if (event.event === 'Started') {
              total = event.data.contentLength ?? 0;
            } else if (event.event === 'Progress') {
              downloaded += event.data.chunkLength;
              const percent = total > 0 ? Math.min(100, Math.round((downloaded / total) * 100)) : 0;
              void emit('update-progress', {
                percent,
                bytesPerSecond: 0,
                transferred: downloaded,
                total,
              } satisfies UpdateProgress);
            } else if (event.event === 'Finished') {
              void emit('update-downloaded', {
                version: update.version,
                releaseNotes: update.body ?? undefined,
              } satisfies UpdateInfo);
            }
          });
        })
        .catch(() => {});
    },

    quitAndInstall: () => {
      void tauriInvoke('relaunch_app').catch(() => {});
    },

    restartToUpdate: () => {
      void import('@tauri-apps/plugin-updater')
        .then(({ check }) => check())
        .then(async (update) => {
          if (update) {
            await update.downloadAndInstall();
          }
          await tauriInvoke('relaunch_app');
        })
        .catch(() => {});
    },

    applyTitlebarUpdate: async () => {
      try {
        return await tauriInvoke<{ action: 'restarting' | 'downloading' | 'reload' }>('apply_titlebar_update');
      } catch {
        return { action: 'reload' };
      }
    },

    openExternal: (url: string) => {
      void tauriInvoke('open_external', { url }).catch(() => {
        if (typeof window !== 'undefined') {
          window.open(url, '_blank', 'noopener,noreferrer');
        }
      });
    },

    reloadApp: () => {
      if (typeof window !== 'undefined') {
        window.location.reload();
      }
    },

    relaunchApp: () => {
      void tauriInvoke('relaunch_app').catch(() => {
        if (typeof window !== 'undefined') {
          window.location.reload();
        }
      });
    },

    registerGlobalShortcut: async (shortcut: string, action: string) => {
      try {
        const { register } = await import('@tauri-apps/plugin-global-shortcut');
        await register(shortcut, (event) => {
          if (event.state === 'Pressed') {
            globalShortcutCallbacks.forEach((cb) => {
              try {
                cb(action);
              } catch {}
            });
          }
        });
        return true;
      } catch {
        return false;
      }
    },

    unregisterAllShortcuts: async () => {
      try {
        const { unregisterAll } = await import('@tauri-apps/plugin-global-shortcut');
        await unregisterAll();
        return true;
      } catch {
        return false;
      }
    },

    onGlobalShortcut: (callback) => {
      globalShortcutCallbacks.add(callback);
      const unlistenEvent = createTauriEventListener<string>('global-shortcut-triggered', callback);
      return () => {
        globalShortcutCallbacks.delete(callback);
        unlistenEvent();
      };
    },

    onUpdateAvailable: (callback) => createTauriEventListener<UpdateInfo>('update-available', callback),
    onTrayCheckUpdates: (callback) => createTauriEventListener<void>('tray-check-updates', () => callback()),
    onUpdateProgress: (callback) => createTauriEventListener<UpdateProgress>('update-progress', callback),
    onUpdateDownloaded: (callback) => createTauriEventListener<UpdateInfo>('update-downloaded', callback),
    onRepoUpdateAvailable: (callback) => createTauriEventListener<any>('repo-update-available', callback),

    startProcessAudioCapture: async (options) => {
      try {
        return await tauriInvoke<{ success: boolean; error?: string }>('start_process_audio_capture', { options });
      } catch (err: any) {
        return { success: false, error: err?.message || 'Not supported in Tauri' };
      }
    },

    stopProcessAudioCapture: async () => {
      try {
        return await tauriInvoke<{ success: boolean; error?: string }>('stop_process_audio_capture');
      } catch (err: any) {
        return { success: false, error: err?.message || 'Not supported in Tauri' };
      }
    },

    onProcessAudioChunk: (callback) => createTauriEventListener<Uint8Array>('process-audio-chunk', callback),
    onProcessAudioFallback: (callback) => createTauriEventListener<{ reason: string }>('process-audio-fallback', callback),

    startNativeScreenShare: async (options) => {
      try {
        return await tauriInvoke<{ success: boolean; error?: string }>('start_native_screenshare', { options });
      } catch (err: any) {
        return { success: false, error: err?.message || 'Not supported in Tauri' };
      }
    },

    stopNativeScreenShare: async () => {
      try {
        return await tauriInvoke<{ success: boolean }>('stop_native_screenshare');
      } catch {
        return { success: false };
      }
    },

    onNativeScreenShareEvent: (callback) =>
      createTauriEventListener<{ event: string; message?: string; [key: string]: any }>(
        'native-screenshare-event',
        callback
      ),

    setMinimizeToTray: (enabled: boolean) => {
      void tauriInvoke('set_minimize_to_tray', { enabled }).catch(() => {});
    },

    getMinimizeToTray: async () => {
      try {
        return await tauriInvoke<boolean>('get_minimize_to_tray');
      } catch {
        return false;
      }
    },

    setTrayVoiceState: (state) => {
      void tauriInvoke('set_tray_voice_state', { state }).catch(() => {});
    },

    isCursorInWindow: async () => {
      try {
        return await tauriInvoke<boolean>('is_cursor_in_window');
      } catch {
        return false;
      }
    },

    setAutoStart: (enabled: boolean) => {
      void import('@tauri-apps/plugin-autostart')
        .then(({ enable, disable }) => (enabled ? enable() : disable()))
        .catch(() => {
          void tauriInvoke('set_auto_start', { enabled }).catch(() => {});
        });
    },

    getAutoStart: async () => {
      try {
        const { isEnabled } = await import('@tauri-apps/plugin-autostart');
        return await isEnabled();
      } catch {
        try {
          return await tauriInvoke<boolean>('get_auto_start');
        } catch {
          return false;
        }
      }
    },

    setZoomFactor: (factor: number) => {
      currentZoomFactor = factor;
      void tauriCurrentWindow()
        .then((win) => (win as any).setZoom?.(factor))
        .catch(() => {});
      if (typeof document !== 'undefined') {
        document.documentElement.style.zoom = factor === 1 ? '' : `${Math.round(factor * 100)}%`;
      }
    },

    getZoomFactor: () => currentZoomFactor,

    getGpuInfo: async () => {
      try {
        return await tauriInvoke('get_gpu_info');
      } catch {
        return null;
      }
    },

    setHardwareAcceleration: (enabled: boolean) => {
      void tauriInvoke('set_hardware_acceleration', { enabled }).catch(() => {});
    },

    getHardwareAcceleration: async () => {
      try {
        return await tauriInvoke<boolean>('get_hardware_acceleration');
      } catch {
        return true;
      }
    },

    onActivityDetected: (callback) => createTauriEventListener<any>('activity-detected', callback),

    getCurrentActivity: async () => {
      try {
        return await tauriInvoke('get_current_activity');
      } catch {
        return null;
      }
    },

    onStreamerSoftwareStatus: (callback) =>
      createTauriEventListener<{ runningApps: string[] }>('streamer-software-status', callback),

    setCustomStreamerProcesses: (processes: string[]) => {
      void tauriInvoke('set_custom_streamer_processes', { processes }).catch(() => {});
    },

    getStreamerSoftwareStatus: async () => {
      try {
        return await tauriInvoke<{ runningApps: string[] }>('get_streamer_software_status');
      } catch {
        return { runningApps: [] };
      }
    },

    setSplashColors: async (colors) => {
      try {
        await tauriInvoke('set_splash_colors', { colors });
      } catch {}
    },

    onSplashUpdate: (callback) => createTauriEventListener<any>('splash-update', callback),
  };

  return cachedTauriBridge;
}

export const getDesktopAPI = (): ElectronAPI | null => {
  if (isTauri()) {
    return createTauriBridge();
  }
  return null;
};

export const desktopBridge = {
  isTauri,
  isElectron,
  isDesktop,
  getDesktopAPI,
  setAuthToken: async (token: string | null): Promise<void> => {
    await getDesktopAPI()?.setAuthToken?.(token);
  },
  getProxyUrl: async (): Promise<string | null> => {
    return (await getDesktopAPI()?.getProxyUrl?.()) ?? null;
  },
  setAudioOutputDevice: async (deviceId: string): Promise<void> => {
    await getDesktopAPI()?.setAudioOutputDevice?.(deviceId);
  },
};

export function resetDesktopBridgeCacheForTests(): void {
  cachedTauriBridge = null;
  globalShortcutCallbacks.clear();
}
