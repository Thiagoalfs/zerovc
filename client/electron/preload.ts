import { contextBridge, ipcRenderer } from 'electron';

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
}

const electronAPI: ElectronAPI = {
  isElectron: true,
  platform: process.platform,
  getScreenSources: () => ipcRenderer.invoke('get-screen-sources'),
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
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}