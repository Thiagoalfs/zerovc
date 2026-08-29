import React, { useState, useEffect } from 'react';
import { Minus, Square, Copy, X, DownloadCloud, RefreshCw, Sparkles, CheckCircle2 } from 'lucide-react';
import { UpdateInfo, UpdateProgress } from '../../types/electron';

export const TitleBar: React.FC = () => {
  const isElectron = typeof window !== 'undefined' && (!!window.electronAPI?.isElectron || navigator.userAgent.includes('Electron'));
  
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'available' | 'downloading' | 'downloaded'>('idle');
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (!isElectron || !window.electronAPI) return;

    // Check initial maximized state
    window.electronAPI.isMaximized?.().then((max) => setIsMaximized(max)).catch(() => {});

    // Listen for available update
    const unsubAvailable = window.electronAPI.onUpdateAvailable((info) => {
      setUpdateInfo(info);
      setUpdateStatus('available');
    });

    // Listen for download progress
    const unsubProgress = window.electronAPI.onUpdateProgress((prog: UpdateProgress) => {
      setUpdateStatus('downloading');
      setDownloadProgress(Math.round(prog.percent));
    });

    // Listen for update downloaded and ready to install
    const unsubDownloaded = window.electronAPI.onUpdateDownloaded((info) => {
      setUpdateInfo(info);
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

  const handleStartDownload = () => {
    setUpdateStatus('downloading');
    setDownloadProgress(0);
    window.electronAPI?.startDownloadUpdate();
  };

  const handleQuitAndInstall = () => {
    window.electronAPI?.quitAndInstall();
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
      className="h-8 bg-background-darkest/95 backdrop-blur-md border-b border-white/5 flex items-center justify-between px-3 select-none flex-shrink-0 z-50"
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
      </div>

      {/* Right Actions: Update Button (Next to Windows Controls) + Windows Controls */}
      <div
        className="flex items-center gap-1.5"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        {/* Update: Available */}
        {updateStatus === 'available' && (
          <button
            type="button"
            onClick={handleStartDownload}
            className="flex items-center gap-1.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white text-[11px] font-semibold px-2.5 py-0.5 rounded-full shadow-md shadow-emerald-500/20 transition-all cursor-pointer animate-pulse mr-1"
            title={`Nova versão ${updateInfo?.version || ''} encontrada! Clique para baixar.`}
          >
            <DownloadCloud className="w-3.5 h-3.5" />
            <span>Update {updateInfo?.version ? `v${updateInfo.version}` : ''}</span>
          </button>
        )}

        {/* Update: Downloading */}
        {updateStatus === 'downloading' && (
          <div className="flex items-center gap-2 bg-background-darker border border-emerald-500/30 px-2.5 py-0.5 rounded-full text-[11px] text-emerald-400 mr-1">
            <RefreshCw className="w-3 h-3 animate-spin text-emerald-400" />
            <span className="font-mono">{downloadProgress}%</span>
            <div className="w-12 h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 transition-all duration-200"
                style={{ width: `${downloadProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Update: Downloaded & Ready to Restart */}
        {updateStatus === 'downloaded' && (
          <button
            type="button"
            onClick={handleQuitAndInstall}
            className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-[11px] font-bold px-3 py-0.5 rounded-full shadow-lg shadow-emerald-500/30 transition-all cursor-pointer mr-1 animate-bounce"
            title="Atualização baixada! Clique para reiniciar o ZeroVC agora."
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Reiniciar e Atualizar</span>
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
