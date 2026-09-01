import React, { useState, useEffect, useCallback } from 'react';
import {
  Minus,
  Square,
  Copy,
  X,
  DownloadCloud,
  RefreshCw,
  Sparkles,
  CheckCircle2,
  ExternalLink,
  AlertCircle,
} from 'lucide-react';
import { UpdateInfo, UpdateProgress } from '../../types/electron';

export const TitleBar: React.FC = () => {
  const isElectron =
    typeof window !== 'undefined' &&
    (!!window.electronAPI?.isElectron || navigator.userAgent.includes('Electron'));

  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'available' | 'downloading' | 'downloaded'>('idle');
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [isMaximized, setIsMaximized] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Local build commit hash from Vite define (badge informativo no header, não relacionado ao updater)
  const currentBuildCommit = typeof __BUILD_COMMIT__ !== 'undefined' ? __BUILD_COMMIT__ : '';

  useEffect(() => {
    if (!isElectron) return;

    // Check initial maximized state
    window.electronAPI?.isMaximized?.().then((max) => setIsMaximized(max)).catch(() => {});

    // Listen for electron-updater available release
    const unsubAvailable = window.electronAPI?.onUpdateAvailable?.((info) => {
      setUpdateInfo(info);
      setUpdateStatus('available');
    });

    // Listen for download progress
    const unsubProgress = window.electronAPI?.onUpdateProgress?.((prog: UpdateProgress) => {
      setUpdateStatus('downloading');
      setDownloadProgress(Math.round(prog.percent));
    });

    // Listen for update downloaded and ready to install
    const unsubDownloaded = window.electronAPI?.onUpdateDownloaded?.((info) => {
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
    if (updateInfo) {
      setUpdateStatus('downloading');
      setDownloadProgress(0);
      window.electronAPI?.startDownloadUpdate?.();
    } else {
      setIsModalOpen(true);
    }
  };

  const handleQuitAndInstall = () => {
    window.electronAPI?.quitAndInstall?.();
  };

  const handleOpenGitHub = (url?: string) => {
    const targetUrl = url || 'https://github.com/Thiagoalfs/zerovc/releases';
    if (window.electronAPI?.openExternal) {
      window.electronAPI.openExternal(targetUrl);
    } else {
      window.open(targetUrl, '_blank');
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
    <>
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

        {/* Right Actions: Update Button (Next to Windows Controls) + Windows Controls */}
        <div
          className="flex items-center gap-1.5"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          {/* Update: Available (Pulsing button right beside windows controls) */}
          {updateStatus === 'available' && (
            <button
              type="button"
              onClick={handleStartDownload}
              className="flex items-center gap-1.5 bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 hover:from-emerald-600 hover:to-teal-600 active:scale-95 text-white text-[11px] font-bold px-2.5 py-0.5 rounded-full shadow-lg shadow-emerald-500/25 transition-all cursor-pointer animate-pulse mr-1"
              title="Nova versão encontrada! Clique para atualizar."
            >
              <DownloadCloud className="w-3.5 h-3.5" />
              <span>{updateInfo?.version ? `Update v${updateInfo.version}` : 'Update Disponível'}</span>
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
              className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white text-[11px] font-bold px-3 py-0.5 rounded-full shadow-lg shadow-emerald-500/30 transition-all cursor-pointer mr-1 animate-bounce"
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

      {/* Update Details Modal */}
      {isModalOpen && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 animate-in fade-in select-none"
          onClick={() => setIsModalOpen(false)}
        >
          <div
            className="bg-background-darker border border-white/10 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-md">
                  <DownloadCloud className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white leading-tight">Nova Atualização Disponível</h3>
                  <span className="text-xs text-emerald-400 font-medium">
                    {updateInfo ? `Versão ${updateInfo.version}` : 'Uma nova versão do ZeroVC está pronta'}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-white/5 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {updateInfo?.releaseNotes && (
              <div className="bg-background-darkest/70 border border-white/5 rounded-xl p-3.5 text-xs text-gray-300 leading-relaxed max-h-32 overflow-y-auto">
                {typeof updateInfo.releaseNotes === 'string' ? updateInfo.releaseNotes : 'Melhorias e correções de bugs.'}
              </div>
            )}

            {updateStatus === 'downloading' && (
              <div className="space-y-1.5">
                <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-500 to-teal-600 transition-all"
                    style={{ width: `${downloadProgress}%` }}
                  />
                </div>
                <span className="text-[11px] text-gray-400">Baixando... {downloadProgress}%</span>
              </div>
            )}

            <div className="flex flex-col gap-2 pt-2">
              {updateStatus === 'downloaded' ? (
                <button
                  type="button"
                  onClick={handleQuitAndInstall}
                  className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 active:scale-98 text-white text-xs font-bold py-2.5 px-4 rounded-xl transition-all shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>Reiniciar e Instalar</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleStartDownload}
                  disabled={updateStatus === 'downloading'}
                  className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 active:scale-98 disabled:opacity-60 disabled:cursor-not-allowed text-white text-xs font-bold py-2.5 px-4 rounded-xl transition-all shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <DownloadCloud className="w-4 h-4" />
                  <span>{updateStatus === 'downloading' ? 'Baixando...' : 'Baixar Atualização'}</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => handleOpenGitHub()}
                className="w-full bg-white/5 hover:bg-white/10 active:scale-98 text-gray-300 hover:text-white text-xs font-semibold py-2 px-4 rounded-xl border border-white/10 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Ver no GitHub</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};