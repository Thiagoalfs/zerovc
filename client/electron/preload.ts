import { contextBridge, ipcRenderer, webFrame } from 'electron';

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
  platform: string;
  getScreenSources: () => Promise<ScreenSource[]>;
  minimize: () => void;
  maximize: () => void;
  close: () => void;
  isMaximized: () => Promise<boolean>;
  checkForUpdates: () => void;
  startDownloadUpdate: () => void;
  quitAndInstall: () => void;
  openExternal: (url: string) => void;
  reloadApp: () => void;
  registerGlobalShortcut: (shortcut: string, action: string) => Promise<boolean>;
  unregisterAllShortcuts: () => Promise<boolean>;
  onGlobalShortcut: (callback: (action: string) => void) => () => void;
  onUpdateAvailable: (callback: (info: UpdateInfo) => void) => () => void;
  onUpdateProgress: (callback: (progress: UpdateProgress) => void) => () => void;
  onUpdateDownloaded: (callback: (info: UpdateInfo) => void) => () => void;
  onRepoUpdateAvailable: (callback: (info: any) => void) => () => void;
  setMinimizeToTray: (enabled: boolean) => void;
  getMinimizeToTray: () => Promise<boolean>;
  setAutoStart: (enabled: boolean) => void;
  getAutoStart: () => Promise<boolean>;
  setZoomFactor: (factor: number) => void;
  getZoomFactor: () => number;
  getGpuInfo: () => Promise<any>;
  setFullScreen: (flag: boolean) => void;
  isFullScreen: () => Promise<boolean>;
  setHardwareAcceleration: (enabled: boolean) => void;
  getHardwareAcceleration: () => Promise<boolean>;
  startProcessAudioCapture?: (options?: { sourceId?: string; mode?: 'include' | 'exclude'; pid?: number; hwnd?: string }) => Promise<{ success: boolean; error?: string }>;
  stopProcessAudioCapture?: () => Promise<{ success: boolean }>;
  onProcessAudioChunk?: (callback: (chunk: Uint8Array) => void) => () => void;
  relaunchApp: () => void;
}

const electronAPI: ElectronAPI = {
  isElectron: true,
  platform: process.platform,
  getGpuInfo: () => ipcRenderer.invoke('get-gpu-info'),
  setFullScreen: (flag: boolean) => ipcRenderer.send('window-set-fullscreen', flag),
  isFullScreen: () => ipcRenderer.invoke('window-is-fullscreen'),
  setHardwareAcceleration: (enabled: boolean) => ipcRenderer.send('set-hardware-acceleration', enabled),
  getHardwareAcceleration: () => ipcRenderer.invoke('get-hardware-acceleration'),
  relaunchApp: () => ipcRenderer.send('relaunch-app'),
  getScreenSources: () => ipcRenderer.invoke('get-screen-sources'),
  startProcessAudioCapture: (options) => ipcRenderer.invoke('start-process-audio-capture', options),
  stopProcessAudioCapture: () => ipcRenderer.invoke('stop-process-audio-capture'),
  onProcessAudioChunk: (callback) => {
    const handler = (_: any, chunk: Uint8Array) => callback(chunk);
    ipcRenderer.on('process-audio-chunk', handler);
    return () => ipcRenderer.removeListener('process-audio-chunk', handler);
  },
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  isMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  checkForUpdates: () => ipcRenderer.send('check-for-updates'),
  startDownloadUpdate: () => ipcRenderer.send('start-download-update'),
  quitAndInstall: () => ipcRenderer.send('quit-and-install'),
  openExternal: (url: string) => ipcRenderer.send('open-external', url),
  reloadApp: () => ipcRenderer.send('reload-app'),
  registerGlobalShortcut: (shortcut: string, action: string) => ipcRenderer.invoke('register-global-shortcut', shortcut, action),
  unregisterAllShortcuts: () => ipcRenderer.invoke('unregister-all-shortcuts'),
  onGlobalShortcut: (callback) => {
    const handler = (_: any, action: string) => callback(action);
    ipcRenderer.on('global-shortcut-triggered', handler);
    return () => ipcRenderer.removeListener('global-shortcut-triggered', handler);
  },
  onUpdateAvailable: (callback) => {
    const handler = (_: any, info: UpdateInfo) => callback(info);
    ipcRenderer.on('update-available', handler);
    return () => ipcRenderer.removeListener('update-available', handler);
  },
  onUpdateProgress: (callback) => {
    const handler = (_: any, progress: UpdateProgress) => callback(progress);
    ipcRenderer.on('update-progress', handler);
    return () => ipcRenderer.removeListener('update-progress', handler);
  },
  onUpdateDownloaded: (callback) => {
    const handler = (_: any, info: UpdateInfo) => callback(info);
    ipcRenderer.on('update-downloaded', handler);
    return () => ipcRenderer.removeListener('update-downloaded', handler);
  },
  onRepoUpdateAvailable: (callback) => {
    const handler = (_: any, info: any) => callback(info);
    ipcRenderer.on('repo-update-available', handler);
    return () => ipcRenderer.removeListener('repo-update-available', handler);
  },
  setMinimizeToTray: (enabled: boolean) => ipcRenderer.send('set-minimize-to-tray', enabled),
  getMinimizeToTray: () => ipcRenderer.invoke('get-minimize-to-tray'),
  setAutoStart: (enabled: boolean) => ipcRenderer.send('set-auto-start', enabled),
  getAutoStart: () => ipcRenderer.invoke('get-auto-start'),
  setZoomFactor: (factor: number) => webFrame.setZoomFactor(factor),
  getZoomFactor: () => webFrame.getZoomFactor(),
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}