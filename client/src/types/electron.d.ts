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
  onUpdateAvailable: (callback: (info: UpdateInfo) => void) => () => void;
  onUpdateProgress: (callback: (progress: UpdateProgress) => void) => () => void;
  onUpdateDownloaded: (callback: (info: UpdateInfo) => void) => () => void;
  onRepoUpdateAvailable?: (callback: (info: any) => void) => () => void;
}

declare global {
  const __BUILD_COMMIT__: string;
  const __BUILD_DATE__: string;
  interface Window {
    electronAPI?: ElectronAPI;
  }
}