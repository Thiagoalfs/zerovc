import React, { useState, useEffect, useCallback } from 'react';
import { Mic, MicOff, Headphones, Monitor, MonitorOff, PhoneOff, Video, VideoOff, Maximize2, Minimize2 } from 'lucide-react';
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

export interface VoiceControlBarProps {
  className?: string;
  onOpenScreenShare?: () => void;
  onDisconnect?: () => void;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
}

export const VoiceControlBar: React.FC<VoiceControlBarProps> = ({
  className = '',
  onOpenScreenShare,
  onDisconnect,
  isFullscreen = false,
  onToggleFullscreen,
}) => {
  const {
    isMuted,
    isDeafened,
    isCameraOn,
    isScreensharing,
    toggleMute,
    toggleDeafen,
    toggleCamera,
    stopScreenShare,
    leaveVoice,
  } = useVoiceStore();

  const { callState, endCall } = useCallStore();
  const { menu, openContextMenu, closeContextMenu } = useContextMenu();

  const handleScreenShareClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isScreensharing) {
      const rect = e.currentTarget.getBoundingClientRect();
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
    } else {
      if (onOpenScreenShare) {
        onOpenScreenShare();
      } else {
        window.dispatchEvent(new CustomEvent('zerovc:open-screenshare'));
      }
    }
  };

  const handleDisconnect = () => {
    hapticWarning();
    if (callState === 'connected' || callState === 'calling') {
      endCall();
    }
    leaveVoice();
    if (onDisconnect) {
      onDisconnect();
    }
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
        <button
          type="button"
          onClick={handleScreenShareClick}
          className={`p-2.5 sm:p-3 rounded-full transition-all cursor-pointer shadow-md active:scale-95 ${
            isScreensharing
              ? 'bg-online text-white hover:bg-emerald-600'
              : 'bg-background-light hover:bg-white/15 text-white'
          }`}
          aria-label={isScreensharing ? 'Opções de Compartilhamento' : 'Compartilhar Tela'}
        >
          <Monitor className="w-4 h-4 sm:w-5 sm:h-5" />
        </button>

        {/* Disconnect */}
        <button
          type="button"
          onClick={handleDisconnect}
          className="bg-dnd hover:bg-rose-700 text-white p-2.5 sm:p-3 rounded-full transition-all shadow-lg cursor-pointer ml-1 active:scale-95"
          aria-label="Desconectar da Voz"
        >
          <PhoneOff className="w-4 h-4 sm:w-5 sm:h-5" />
        </button>

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
