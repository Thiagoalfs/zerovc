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
  GitCommit,
  AlertCircle,
} from 'lucide-react';
import { UpdateInfo, UpdateProgress, RepoUpdateInfo } from '../../types/electron';

export const TitleBar: React.FC = () => {
  const isElectron =
    typeof window !== 'undefined' &&
    (!!window.electronAPI?.isElectron || navigator.userAgent.includes('Electron'));

  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [repoUpdateInfo, setRepoUpdateInfo] = useState<RepoUpdateInfo | null>(null);
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'available' | 'downloading' | 'downloaded'>('idle');
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [isMaximized, setIsMaximized] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Local build commit hash from Vite define
  const currentBuildCommit = typeof __BUILD_COMMIT__ !== 'undefined' ? __BUILD_COMMIT__ : '';

  // Direct GitHub API checker in renderer as fallback/guarantee
  const checkGitHubDirectly = useCallback(async () => {
    try {
      const res = await fetch('https://api.github.com/repos/Thiagoalfs/zerovc/commits/main', {
        headers: {
          Accept: 'application/vnd.github.v3+json',
        },
      });
      if (res.ok) {
        const data = await res.json();
        const latestSha = data.sha || '';
        const shortSha = latestSha.substring(0, 7);
        const message = data.commit?.message?.split('\n')[0] || 'Atualizações disponíveis no repositório';
        const author = data.commit?.author?.name || 'GitHub';
        const commitUrl = data.html_url || 'https://github.com/Thiagoalfs/zerovc';
        const publishedAt = data.commit?.author?.date;

        // If latest commit is different from the bundled commit
        if (latestSha && currentBuildCommit && !latestSha.startsWith(currentBuildCommit) && !currentBuildCommit.startsWith(shortSha)) {
          setRepoUpdateInfo({
            latestSha,
            shortSha,
            message,
            author,
            commitUrl,
            publishedAt,
          });
          if (updateStatus === 'idle') {
            setUpdateStatus('available');
          }
        }
      }
    } catch {
      // Offline or rate-limited
    }
  }, [currentBuildCommit, updateStatus]);

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

    // Listen for direct GitHub repository commit updates
    const unsubRepo = window.electronAPI?.onRepoUpdateAvailable?.((info: RepoUpdateInfo) => {
      if (info?.latestSha && currentBuildCommit && !info.latestSha.startsWith(currentBuildCommit)) {
        setRepoUpdateInfo(info);
        setUpdateStatus('available');
      }
    });

    // Run direct check on mount and every 30s
    checkGitHubDirectly();
    const interval = setInterval(checkGitHubDirectly, 30 * 1000);

    return () => {
      unsubAvailable?.();
      unsubProgress?.();
      unsubDownloaded?.();
      unsubRepo?.();
      clearInterval(interval);
    };
  }, [isElectron, checkGitHubDirectly, currentBuildCommit]);

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

  const handleReloadApp = () => {
    if (window.electronAPI?.reloadApp) {
      window.electronAPI.reloadApp();
    } else {
      window.location.reload();
    }
  };

  const handleOpenGitHub = (url?: string) => {
    const targetUrl = url || repoUpdateInfo?.commitUrl || 'https://github.com/Thiagoalfs/zerovc';
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
              title="Nova versão ou alterações no repositório encontradas! Clique para atualizar."
            >
              <DownloadCloud className="w-3.5 h-3.5" />
              <span>
                {updateInfo?.version
                  ? `Update v${updateInfo.version}`
                  : repoUpdateInfo?.shortSha
                  ? `Update (${repoUpdateInfo.shortSha})`
                  : 'Update Disponível'}
              </span>
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
                    Alterações detectadas no repositório GitHub
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

            {repoUpdateInfo && (
              <div className="bg-background-darkest/70 border border-white/5 rounded-xl p-3.5 space-y-2 text-xs">
                <div className="flex items-center justify-between text-gray-400">
                  <span className="flex items-center gap-1 font-semibold text-gray-300">
                    <GitCommit className="w-3.5 h-3.5 text-brand-400" />
                    Commit Recente:
                  </span>
                  <span className="font-mono bg-white/5 px-2 py-0.5 rounded text-emerald-300 font-bold">
                    {repoUpdateInfo.shortSha}
                  </span>
                </div>
                <p className="text-gray-200 font-medium leading-relaxed bg-white/5 p-2 rounded-lg">
                  "{repoUpdateInfo.message}"
                </p>
                <div className="flex items-center justify-between text-[11px] text-gray-500 pt-1">
                  <span>Por {repoUpdateInfo.author}</span>
                  {repoUpdateInfo.publishedAt && (
                    <span>{new Date(repoUpdateInfo.publishedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  )}
                </div>
              </div>
            )}

            <div className="flex flex-col gap-2 pt-2">
              <button
                type="button"
                onClick={handleReloadApp}
                className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 active:scale-98 text-white text-xs font-bold py-2.5 px-4 rounded-xl transition-all shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-2 cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Recarregar & Aplicar Atualizações</span>
              </button>

              <button
                type="button"
                onClick={() => handleOpenGitHub()}
                className="w-full bg-white/5 hover:bg-white/10 active:scale-98 text-gray-300 hover:text-white text-xs font-semibold py-2 px-4 rounded-xl border border-white/10 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Ver Alterações no GitHub</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
