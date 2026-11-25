import React, { useState, useEffect, useCallback } from 'react';
import { Mic, MicOff, Headphones, Monitor, MonitorOff, PhoneOff, Video, VideoOff, Maximize2, Minimize2, ChevronUp, EyeOff } from 'lucide-react';
import { useVoiceStore } from '../../stores/voiceStore';
import { useCallStore } from '../../stores/callStore';
import { HeadphonesOff } from '../Common/HeadphonesOff';
import { ContextMenu, useContextMenu, ContextMenuItem } from '../ContextMenu';
import { hapticMedium, hapticWarning } from '../../lib/haptics';

/**
 * Shared fullscreen toggle state (Electron window or DOM fullscreen + ESC exit)
 * for call stages across server channels, DM groups, and private DMs.
 */
export function useStageFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(false);

  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((prev) => {
      const next = !prev;
      if (window.electronAPI?.setFullScreen) {
        window.electronAPI.setFullScreen(next);
      } else if (next) {
        void document.documentElement.requestFullscreen?.().catch(() => {});
      } else if (document.fullscreenElement) {
        void document.exitFullscreen?.().catch(() => {});
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (!isFullscreen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsFullscreen(false);
        if (window.electronAPI?.setFullScreen) {
          window.electronAPI.setFullScreen(false);
        } else if (document.fullscreenElement) {
          void document.exitFullscreen?.().catch(() => {});
        }
      }
    };
    const handleFsChange = () => {
      if (!document.fullscreenElement && !window.electronAPI?.setFullScreen) {
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('fullscreenchange', handleFsChange);
    };
  }, [isFullscreen]);

  useEffect(() => {
    return () => {
      if (window.electronAPI?.setFullScreen) {
        window.electronAPI.setFullScreen(false);
      } else if (document.fullscreenElement) {
        void document.exitFullscreen?.().catch(() => {});
      }
    };
  }, []);

  return { isFullscreen, toggleFullscreen };
}

export interface VoiceControlBarPreviewState {
  isMuted: boolean;
  isDeafened: boolean;
  isCameraOn?: boolean;
  isScreensharing?: boolean;
  onToggleMute: () => void;
  onToggleDeafen: () => void;
  onToggleCamera?: () => void;
  onToggleScreenShare?: () => void;
  onDisconnect: () => void;
}

export interface VoiceControlBarProps {
  className?: string;
  onOpenScreenShare?: () => void;
  onDisconnect?: () => void;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  previewState?: VoiceControlBarPreviewState;
}

export const VoiceControlBar: React.FC<VoiceControlBarProps> = ({
  className = '',
  onOpenScreenShare,
  onDisconnect,
  isFullscreen = false,
  onToggleFullscreen,
  previewState,
}) => {
  const voiceStore = useVoiceStore();
  const { callState, endCall } = useCallStore();
  const { menu, openContextMenu, closeContextMenu } = useContextMenu();

  const isMuted = previewState ? (previewState.isMuted || previewState.isDeafened) : voiceStore.isMuted;
  const isDeafened = previewState ? previewState.isDeafened : voiceStore.isDeafened;
  const isCameraOn = previewState ? Boolean(previewState.isCameraOn) : voiceStore.isCameraOn;
  const isScreensharing = previewState ? Boolean(previewState.isScreensharing) : voiceStore.isScreensharing;
  const watchedParticipantId = previewState ? null : voiceStore.watchedParticipantId;
  const watchedParticipantIds = previewState ? undefined : voiceStore.watchedParticipantIds;
  const toggleMute = previewState ? previewState.onToggleMute : voiceStore.toggleMute;
  const toggleDeafen = previewState ? previewState.onToggleDeafen : voiceStore.toggleDeafen;
  const toggleCamera = previewState ? (previewState.onToggleCamera ?? (() => {})) : voiceStore.toggleCamera;
  const { stopScreenShare, unwatchAll, leaveVoice } = voiceStore;

  const isWatchingAny = (watchedParticipantIds?.length ?? 0) > 0 || Boolean(watchedParticipantId);

  const openScreenShareMenu = (anchorEl: HTMLElement) => {
    const rect = anchorEl.getBoundingClientRect();
    const items: ContextMenuItem[] = [
      {
        id: 'switch-screen',
        label: 'Trocar tela',
        icon: <Monitor className="w-4 h-4" />,
        onClick: () => {
          if (onOpenScreenShare) {
            onOpenScreenShare();
          } else {
            window.dispatchEvent(new CustomEvent('zerovc:open-screenshare'));
          }
        },
      },
      {
        id: 'stop-screen',
        label: 'Parar compartilhamento',
        icon: <MonitorOff className="w-4 h-4" />,
        variant: 'danger',
        onClick: () => {
          stopScreenShare();
        },
      },
    ];
    openContextMenu(
      { clientX: rect.left + rect.width / 2, clientY: rect.top - 10 },
      items,
      'Transmissão de Tela'
    );
  };

  const handleScreenShareClick = (e: React.MouseEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (previewState) {
      previewState.onToggleScreenShare?.();
      return;
    }
    if (isScreensharing) {
      openScreenShareMenu(e.currentTarget);
    } else {
      if (onOpenScreenShare) {
        onOpenScreenShare();
      } else {
        window.dispatchEvent(new CustomEvent('zerovc:open-screenshare'));
      }
    }
  };

  const performDisconnect = () => {
    hapticWarning();
    if (previewState) {
      previewState.onDisconnect();
      return;
    }
    if (callState === 'connected' || callState === 'calling') {
      endCall();
    }
    leaveVoice();
    if (onDisconnect) {
      onDisconnect();
    }
  };

  const handleDisconnectClick = () => {
    if (isWatchingAny) {
      hapticMedium();
      unwatchAll();
      return;
    }
    performDisconnect();
  };

  const openDisconnectMenu = (e: React.MouseEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const items: ContextMenuItem[] = [
      {
        id: 'unwatch-all-streams',
        label: 'Desligar transmissões',
        icon: <EyeOff className="w-4 h-4" />,
        disabled: !isWatchingAny,
        onClick: () => {
          hapticMedium();
          unwatchAll();
        },
      },
      {
        id: 'leave-call',
        label: 'Sair da call',
        icon: <PhoneOff className="w-4 h-4" />,
        variant: 'danger',
        onClick: () => {
          performDisconnect();
        },
      },
    ];
    openContextMenu(
      { clientX: rect.left + rect.width / 2, clientY: rect.top - 10 },
      items,
      'Opções da Chamada'
    );
  };

  return (
    <>
      <div
        className={`flex items-center justify-center gap-2.5 sm:gap-3.5 pt-1 select-none ${className}`}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        {/* Mute Mic */}
        <button
          type="button"
          onClick={() => {
            hapticMedium();
            toggleMute();
          }}
          className={`p-2.5 sm:p-3 rounded-full transition-all cursor-pointer shadow-md active:scale-95 ${
            isMuted
              ? 'bg-dnd text-white hover:bg-rose-700'
              : 'bg-background-light hover:bg-white/15 text-white'
          }`}
          aria-label={isMuted ? 'Desmutar Microfone' : 'Mutar Microfone'}
        >
          {isMuted ? <MicOff className="w-4 h-4 sm:w-5 sm:h-5" /> : <Mic className="w-4 h-4 sm:w-5 sm:h-5" />}
        </button>

        {/* Deafen */}
        <button
          type="button"
          onClick={() => {
            hapticMedium();
            toggleDeafen();
          }}
          className={`p-2.5 sm:p-3 rounded-full transition-all cursor-pointer shadow-md active:scale-95 ${
            isDeafened
              ? 'bg-dnd text-white hover:bg-rose-700'
              : 'bg-background-light hover:bg-white/15 text-white'
          }`}
          aria-label={isDeafened ? 'Desensurdecer' : 'Ensurdecer'}
        >
          {isDeafened ? (
            <HeadphonesOff className="w-4 h-4 sm:w-5 sm:h-5" />
          ) : (
            <Headphones className="w-4 h-4 sm:w-5 sm:h-5" />
          )}
        </button>

        {/* Camera WebCam */}
        <button
          type="button"
          onClick={() => {
            hapticMedium();
            toggleCamera();
          }}
          className={`p-2.5 sm:p-3 rounded-full transition-all cursor-pointer shadow-md active:scale-95 ${
            isCameraOn
              ? 'bg-online text-white hover:bg-emerald-600'
              : 'bg-background-light hover:bg-white/15 text-white'
          }`}
          aria-label={isCameraOn ? 'Desligar Câmera' : 'Ligar Câmera'}
        >
          {isCameraOn ? <Video className="w-4 h-4 sm:w-5 sm:h-5" /> : <VideoOff className="w-4 h-4 sm:w-5 sm:h-5" />}
        </button>

        {/* Screen Share */}
        <div className="relative inline-flex">
          <button
            type="button"
            onClick={handleScreenShareClick}
            onContextMenu={(e) => {
              if (!isScreensharing) return;
              e.preventDefault();
              e.stopPropagation();
              openScreenShareMenu(e.currentTarget);
            }}
            className={`p-2.5 sm:p-3 rounded-full transition-all cursor-pointer shadow-md active:scale-95 ${
              isScreensharing
                ? 'bg-online text-white hover:bg-emerald-600'
                : 'bg-background-light hover:bg-white/15 text-white'
            }`}
            aria-label={isScreensharing ? 'Opções de Compartilhamento' : 'Compartilhar Tela'}
          >
            <Monitor className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
          {isScreensharing && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                openScreenShareMenu(e.currentTarget);
              }}
              className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-online border border-black/30 text-white flex items-center justify-center shadow-md cursor-pointer z-10"
              aria-label="Opções de transmissão"
            >
              <ChevronUp className="w-2.5 h-2.5" />
            </button>
          )}
        </div>

        {/* Disconnect / Stop Watching Streams */}
        <div className="relative inline-flex ml-1">
          <button
            type="button"
            onClick={handleDisconnectClick}
            onContextMenu={openDisconnectMenu}
            className="bg-dnd hover:bg-rose-700 text-white p-2.5 sm:p-3 rounded-full transition-all shadow-lg cursor-pointer active:scale-95"
            aria-label={isWatchingAny ? 'Desligar Transmissões' : 'Desconectar da Voz'}
            title={isWatchingAny ? 'Desligar transmissões (clique direito para sair da call)' : 'Sair da call'}
          >
            {isWatchingAny ? (
              <MonitorOff className="w-4 h-4 sm:w-5 sm:h-5" />
            ) : (
              <PhoneOff className="w-4 h-4 sm:w-5 sm:h-5" />
            )}
          </button>
          {isWatchingAny && (
            <button
              type="button"
              onClick={openDisconnectMenu}
              className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-dnd border border-black/30 text-white flex items-center justify-center shadow-md cursor-pointer z-10"
              aria-label="Opções de desconexão"
            >
              <ChevronUp className="w-2.5 h-2.5" />
            </button>
          )}
        </div>

        {/* Optional Fullscreen Button (Server VoiceRoom) */}
        {onToggleFullscreen && (
          <button
            type="button"
            onClick={onToggleFullscreen}
            className="bg-background-light hover:bg-white/15 text-white p-2.5 sm:p-3 rounded-full transition-all cursor-pointer shadow-md active:scale-95"
            aria-label={isFullscreen ? 'Sair da Tela Cheia' : 'Tela Cheia'}
          >
            {isFullscreen ? (
              <Minimize2 className="w-4 h-4 sm:w-5 sm:h-5" />
            ) : (
              <Maximize2 className="w-4 h-4 sm:w-5 sm:h-5" />
            )}
          </button>
        )}
      </div>

      <ContextMenu menu={menu} onClose={closeContextMenu} />
    </>
  );
};
