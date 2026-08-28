import { contextBridge, ipcRenderer } from 'electron';

export interface ScreenSource {
  id: string;
  name: string;
  thumbnail: string;
  appIcon: string | null;
}

export interface ElectronAPI {
  getScreenSources: () => Promise<ScreenSource[]>;
  platform: string;
}

const electronAPI: ElectronAPI = {
  getScreenSources: () => ipcRenderer.invoke('get-screen-sources'),
  platform: process.platform,
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
