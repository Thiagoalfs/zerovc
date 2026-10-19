import React from 'react';
import { Mic, MicOff, Headphones, Monitor, PhoneOff, Video, VideoOff } from 'lucide-react';
import { useVoiceStore } from '../../stores/voiceStore';
import { useCallStore } from '../../stores/callStore';
import { ContextMenu, useContextMenu, ContextMenuItem } from '../ContextMenu';
import { hapticMedium, hapticWarning } from '../../lib/haptics';

export interface VoiceControlBarProps {
  className?: string;
  onOpenScreenShare?: () => void;
  onDisconnect?: () => void;
}

export const VoiceControlBar: React.FC<VoiceControlBarProps> = ({
  className = '',
  onOpenScreenShare,
  onDisconnect,
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
          variant: 'danger',
          onClick: () => {
            stopScreenShare();
          },
        },
      ];
      openContextMenu(e, items);
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
        className={`bg-background-darkest/95 px-4 md:px-6 py-2 rounded-2xl shadow-2xl flex items-center gap-3 md:gap-4 border border-white/10 select-none ${className}`}
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
          className={`p-2.5 md:p-3 rounded-full transition-all cursor-pointer ${
            isMuted
              ? 'bg-dnd text-white hover:bg-dnd/80'
              : 'bg-background-light text-gray-200 hover:bg-white/20'
          }`}
          title={isMuted ? 'Desmutar Microfone' : 'Mutar Microfone'}
        >
          {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
        </button>

        {/* Deafen */}
        <button
          type="button"
          onClick={() => {
            hapticMedium();
            toggleDeafen();
          }}
          className={`p-2.5 md:p-3 rounded-full transition-all cursor-pointer ${
            isDeafened
              ? 'bg-dnd text-white hover:bg-dnd/80'
              : 'bg-background-light text-gray-200 hover:bg-white/20'
          }`}
          title={isDeafened ? 'Desensurdecer' : 'Ensurdecer'}
        >
          <Headphones className="w-5 h-5" />
        </button>

        {/* Camera WebCam */}
        <button
          type="button"
          onClick={() => {
            hapticMedium();
            toggleCamera();
          }}
          className={`p-2.5 md:p-3 rounded-full transition-all cursor-pointer ${
            isCameraOn
              ? 'bg-online text-white hover:bg-online/80 ring-2 ring-online/50'
              : 'bg-background-light text-gray-200 hover:bg-white/20'
          }`}
          title={isCameraOn ? 'Desligar Câmera' : 'Ligar Câmera'}
        >
          {isCameraOn ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
        </button>

        {/* Screen Share */}
        <button
          type="button"
          onClick={handleScreenShareClick}
          className={`flex p-2.5 md:p-3 rounded-full transition-all cursor-pointer ${
            isScreensharing
              ? 'bg-online text-white hover:bg-online/80 ring-2 ring-online/50'
              : 'bg-background-light text-gray-200 hover:bg-white/20'
          }`}
          title={isScreensharing ? 'Opções de Compartilhamento de Tela' : 'Compartilhar Tela'}
        >
          <Monitor className="w-5 h-5" />
        </button>

        <div className="w-[1px] h-7 bg-white/10 mx-0.5" />

        {/* Disconnect */}
        <button
          type="button"
          onClick={handleDisconnect}
          className="p-2.5 md:p-3 rounded-full bg-dnd/20 text-dnd hover:bg-dnd hover:text-white transition-all cursor-pointer active:scale-95"
          title="Desconectar da Sala"
        >
          <PhoneOff className="w-5 h-5" />
        </button>
      </div>

      <ContextMenu menu={menu} onClose={closeContextMenu} />
    </>
  );
};
