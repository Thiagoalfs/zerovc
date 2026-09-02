import React, { useState, useEffect, useCallback } from 'react';
import {
  Minus,
  Square,
  Copy,
  X,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { UpdateInfo, UpdateProgress } from '../../types/electron';

interface RepoUpdateInfo {
  latestSha: string;
  shortSha: string;
  message: string;
  author: string;
  commitUrl: string;
  publishedAt?: string;
}

export const TitleBar: React.FC = () => {
  const isElectron =
    typeof window !== 'undefined' &&
    (!!window.electronAPI?.isElectron || navigator.userAgent.includes('Electron'));

  const [updateStatus, setUpdateStatus] = useState<'idle' | 'available' | 'downloading' | 'downloaded'>('idle');
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [isMaximized, setIsMaximized] = useState(false);
  const currentBuildCommit = typeof __BUILD_COMMIT__ !== 'undefined' ? __BUILD_COMMIT__ : '';

  useEffect(() => {
    if (!isElectron) return;

    // Check initial maximized state
    window.electronAPI?.isMaximized?.().then((max) => setIsMaximized(max)).catch(() => {});

    // Listen for electron-updater available release
    const unsubAvailable = window.electronAPI?.onUpdateAvailable?.(() => {
      setUpdateStatus('available');
    });

    // Listen for download progress
    const unsubProgress = window.electronAPI?.onUpdateProgress?.((prog: UpdateProgress) => {
      setUpdateStatus('downloading');
      setDownloadProgress(Math.round(prog.percent));
    });

    // Listen for update downloaded and ready to install
    const unsubDownloaded = window.electronAPI?.onUpdateDownloaded?.(() => {
      setUpdateStatus('downloaded');
    });

    return () => {
      unsubAvailable?.();
      unsubProgress?.();
      unsubDownloaded?.();
    };
  }, [isElectron]);

  if (!isElectron) {
    return null;
  }

  // Handle update action
  const handleDirectUpdate = () => {
    if (updateStatus === 'downloaded') {
      window.electronAPI?.quitAndInstall?.();
    } else if (updateStatus === 'available') {
      setUpdateStatus('downloading');
      window.electronAPI?.startDownloadUpdate?.();
    }
  };

  const handleMinimize = () => {
    window.electronAPI?.minimize();
  };

  const handleMaximize = async () => {
    window.electronAPI?.maximize();
    const max = await window.electronAPI?.isMaximized();
    setIsMaximized(!!max);
  };

  const handleClose = () => {
    window.electronAPI?.close();
  };

  return (
    <header
      className="h-8 bg-background-darkest/95 backdrop-blur-md border-b border-white/5 flex items-center justify-between px-3 select-none flex-shrink-0 z-50 relative"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* Left Branding / Title */}
      <div
        className="flex items-center gap-2 text-xs font-bold text-gray-300"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <div className="w-4 h-4 rounded-md bg-gradient-to-tr from-brand-600 to-brand-400 flex items-center justify-center shadow-sm">
          <Sparkles className="w-2.5 h-2.5 text-white" />
        </div>
        <span className="tracking-wide text-[11px] font-semibold text-gray-300">ZeroVC</span>
        {currentBuildCommit && (
          <span className="text-[9px] text-gray-500 font-mono hidden sm:inline">
            ({currentBuildCommit.substring(0, 7)})
          </span>
        )}
      </div>

      {/* Right Actions: Update Button + Window Controls */}
      <div
        className="flex items-center gap-1.5"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        {/* Direct One-Click Update Button with FontAwesome Download Icon */}
        {updateStatus === 'available' && (
          <button
            type="button"
            onClick={handleDirectUpdate}
            className="flex items-center gap-1.5 bg-brand-500 hover:bg-brand-600 active:scale-95 text-white text-[11px] font-bold px-2.5 py-0.5 rounded-full shadow-md shadow-brand-500/25 transition-all cursor-pointer mr-1"
            title="Nova atualização disponível! Clique para atualizar agora."
          >
            {/* FontAwesome Download Icon (SVG) */}
            <svg
              className="w-3 h-3 fill-current"
              viewBox="0 0 512 512"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M288 32c0-17.7-14.3-32-32-32s-32 14.3-32 32V274.7l-73.4-73.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l128 128c12.5 12.5 32.8 12.5 45.3 0l128-128c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L288 274.7V32zM64 352c-35.3 0-64 28.7-64 64v32c0 35.3 28.7 64 64 64H448c35.3 0 64-28.7 64-64V416c0-35.3-28.7-64-64-64H346.5l-45.3 45.3c-25 25-65.5 25-90.5 0L165.5 352H64zm368 56a24 24 0 1 1 0 48 24 24 0 1 1 0-48z" />
            </svg>
            <span>Update</span>
          </button>
        )}

        {/* Update: Downloading */}
        {updateStatus === 'downloading' && (
          <div className="flex items-center gap-2 bg-background-darker border border-brand-500/30 px-2.5 py-0.5 rounded-full text-[11px] text-brand-400 mr-1">
            <RefreshCw className="w-3 h-3 animate-spin text-brand-400" />
            <span className="font-mono">{downloadProgress}%</span>
            <div className="w-12 h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-brand-500 transition-all duration-200"
                style={{ width: `${downloadProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Update: Downloaded & Ready */}
        {updateStatus === 'downloaded' && (
          <button
            type="button"
            onClick={handleDirectUpdate}
            className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white text-[11px] font-bold px-3 py-0.5 rounded-full shadow-lg shadow-emerald-500/30 transition-all cursor-pointer mr-1 animate-bounce"
            title="Clique para reiniciar e aplicar a atualização agora."
          >
            <svg
              className="w-3 h-3 fill-current"
              viewBox="0 0 512 512"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M288 32c0-17.7-14.3-32-32-32s-32 14.3-32 32V274.7l-73.4-73.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l128 128c12.5 12.5 32.8 12.5 45.3 0l128-128c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L288 274.7V32zM64 352c-35.3 0-64 28.7-64 64v32c0 35.3 28.7 64 64 64H448c35.3 0 64-28.7 64-64V416c0-35.3-28.7-64-64-64H346.5l-45.3 45.3c-25 25-65.5 25-90.5 0L165.5 352H64zm368 56a24 24 0 1 1 0 48 24 24 0 1 1 0-48z" />
            </svg>
            <span>Update</span>
          </button>
        )}

        {/* Window Controls (Windows _ ▢ ✕) */}
        <div className="flex items-center ml-1">
          <button
            type="button"
            onClick={handleMinimize}
            className="w-8 h-6 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 rounded transition-colors cursor-pointer"
            title="Minimizar"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={handleMaximize}
            className="w-8 h-6 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 rounded transition-colors cursor-pointer"
            title={isMaximized ? 'Restaurar' : 'Maximizar'}
          >
            {isMaximized ? <Copy className="w-3 h-3 rotate-180" /> : <Square className="w-3 h-3" />}
          </button>

          <button
            type="button"
            onClick={handleClose}
            className="w-8 h-6 flex items-center justify-center text-gray-400 hover:text-white hover:bg-rose-600 rounded transition-colors cursor-pointer"
            title="Fechar"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </header>
  );
};