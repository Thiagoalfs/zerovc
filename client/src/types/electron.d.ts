export interface ScreenSource {
  id: string;
  name: string;
  thumbnail: string;
  appIcon: string | null;
}

export interface UpdateInfo {
  version: string;
  releaseNotes?: string | Array<{ version: string; note: string }>;
}

export interface UpdateProgress {
  percent: number;
  bytesPerSecond: number;
  transferred: number;
  total: number;
}

export interface ElectronAPI {
  isElectron: boolean;
  isTauri?: boolean;
  platform: string;
  setAuthToken?: (token: string | null) => Promise<void>;
  getProxyUrl?: () => Promise<string | null>;
  setAudioOutputDevice?: (deviceId: string) => Promise<void>;
  getScreenSources: (opts?: { thumbnail?: boolean; fetchWindowIcons?: boolean }) => Promise<ScreenSource[]>;
  isProcessRunning?: (processes: string[]) => Promise<boolean>;
  minimize: () => void;
  maximize: () => void;
  close: () => void;
  isMaximized: () => Promise<boolean>;
  checkForUpdates: () => void;
  startDownloadUpdate: () => void;
  quitAndInstall: () => void;
  openExternal: (url: string) => void;
  reloadApp: () => void;
  registerGlobalShortcut?: (shortcut: string, action: string) => Promise<boolean>;
  unregisterAllShortcuts?: () => Promise<boolean>;
  onGlobalShortcut?: (callback: (action: string) => void) => () => void;
  onUpdateAvailable: (callback: (info: UpdateInfo) => void) => () => void;
  onTrayCheckUpdates?: (callback: () => void) => () => void;
  onUpdateProgress: (callback: (progress: UpdateProgress) => void) => () => void;
  onUpdateDownloaded: (callback: (info: UpdateInfo) => void) => () => void;
  onRepoUpdateAvailable?: (callback: (info: any) => void) => () => void;
  startProcessAudioCapture?: (options?: { sourceId?: string; mode?: 'include' | 'exclude' }) => Promise<{ success: boolean; error?: string }>;
  stopProcessAudioCapture?: () => Promise<{ success: boolean; error?: string }>;
  onProcessAudioChunk?: (callback: (chunk: Uint8Array) => void) => () => void;
  onProcessAudioFallback?: (callback: (info: { reason: string }) => void) => () => void;
  startNativeScreenShare?: (options: {
    url: string;
    token: string;
    sourceId: string;
    width: number;
    height: number;
    fps: number;
    bitrate: number;
    includeAudio: boolean;
    e2eeKey?: string;
  }) => Promise<{ success: boolean; error?: string }>;
  stopNativeScreenShare?: () => Promise<{ success: boolean }>;
  onNativeScreenShareEvent?: (callback: (ev: { event: string; message?: string; [key: string]: any }) => void) => () => void;
  setMinimizeToTray?: (enabled: boolean) => void;
  setTrayVoiceState?: (state: 'idle' | 'in-call' | 'speaking' | 'muted' | 'deafened') => void;
  isCursorInWindow?: () => Promise<boolean>;
  getMinimizeToTray?: () => Promise<boolean>;
  setAutoStart?: (enabled: boolean) => void;
  getAutoStart?: () => Promise<boolean>;
  setZoomFactor?: (factor: number) => void;
  getZoomFactor?: () => number;
  getGpuInfo?: () => Promise<any>;
  setFullScreen?: (flag: boolean) => void;
  isFullScreen?: () => Promise<boolean>;
  setHardwareAcceleration?: (enabled: boolean) => void;
  getHardwareAcceleration?: () => Promise<boolean>;
  relaunchApp?: () => void;
  onActivityDetected?: (callback: (activity: any) => void) => () => void;
  getCurrentActivity?: () => Promise<any>;
  onStreamerSoftwareStatus?: (callback: (status: { runningApps: string[] }) => void) => () => void;
  setCustomStreamerProcesses?: (processes: string[]) => void;
  getStreamerSoftwareStatus?: () => Promise<{ runningApps: string[] }>;
  restartToUpdate?: () => void;
  applyTitlebarUpdate?: () => Promise<{ action: 'restarting' | 'downloading' | 'reload' }>;
  setSplashColors?: (colors: { accent: string; bg: string }) => Promise<void>;
  onSplashUpdate?: (callback: (data: { phase: string; percent?: number; version?: string; message?: string }) => void) => () => void;
}

declare global {
  const __BUILD_COMMIT__: string;
  const __BUILD_DATE__: string;
  interface Window {
    electronAPI?: ElectronAPI;
    __TAURI_INTERNALS__?: unknown;
    __TAURI__?: unknown;
    __ZEROVC_PROXY_URL__?: string;
  }
}
