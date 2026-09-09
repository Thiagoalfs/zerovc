import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Volume2, Mic, MicOff, Headphones, Monitor, PhoneOff, Menu, Video, VideoOff, MonitorOff } from 'lucide-react';
import { Channel, User } from '../../types';
import { useVoiceStore } from '../../stores/voiceStore';
import { ParticipantCard } from './ParticipantCard';
import { ContextMenu, useContextMenu, ContextMenuItem } from '../ContextMenu';

interface VoiceRoomProps {
  channel: Channel;
  onOpenScreenShare: () => void;
  onOpenMobileDrawer?: () => void;
  onOpenUserProfile?: (user: User, position?: { x: number; y: number }) => void;
  onOpenDM?: (userId: string) => void;
}

export const VoiceRoom: React.FC<VoiceRoomProps> = ({
  channel,
  onOpenScreenShare,
  onOpenMobileDrawer,
  onOpenUserProfile,
  onOpenDM,
}) => {
  const {
    isConnected,
    isConnecting,
    currentChannelId,
    joinVoice,
    isMuted,
    isDeafened,
    isScreensharing,
    isCameraOn,
    participants,
    toggleMute,
    toggleDeafen,
    toggleCamera,
    leaveVoice,
    stopScreenShare,
  } = useVoiceStore();

  const { menu, openContextMenu, closeContextMenu } = useContextMenu();
  const isConnectedToThisChannel = isConnected && currentChannelId === channel.id;

  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setDimensions({ width, height });
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const handleScreenShareClick = (e: React.MouseEvent) => {
    if (isScreensharing) {
      const rect = e.currentTarget.getBoundingClientRect();
      const items: ContextMenuItem[] = [
        {
          id: 'switch-screen',
          label: 'Trocar tela',
          icon: <Monitor className="w-4 h-4" />,
          onClick: () => {
            onOpenScreenShare();
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
      openContextMenu(
        { clientX: rect.left + rect.width / 2, clientY: rect.top - 10 } as any,
        items,
        'Transmissão de Tela'
      );
    } else {
      onOpenScreenShare();
    }
  };

  // Discord-style exact 16:9 adaptive grid calculator
  const stageLayout = useMemo(() => {
    const count = participants.length;
    if (count === 0 || dimensions.width === 0 || dimensions.height === 0) {
      return { cardWidth: 0, cardHeight: 0, rows: [] };
    }

    const W = dimensions.width;
    const H = dimensions.height;
    const gap = W < 640 ? 8 : 16;
    const paddingX = W < 640 ? 12 : 24;
    const paddingY = H < 640 ? 12 : 24;

    const availableW = Math.max(80, W - paddingX * 2);
    const availableH = Math.max(80, H - paddingY * 2);
    const targetAspect = 16 / 9;

    let bestCols = 1;
    let bestCardW = 0;
    let bestCardH = 0;
    let maxArea = 0;

    const maxColsToTry = Math.min(count, 8);
    for (let c = 1; c <= maxColsToTry; c++) {
      const r = Math.ceil(count / c);
      const slotW = (availableW - (c - 1) * gap) / c;
      const slotH = (availableH - (r - 1) * gap) / r;

      if (slotW <= 0 || slotH <= 0) continue;

      let w = slotW;
      let h = w / targetAspect;

      if (h > slotH) {
        h = slotH;
        w = h * targetAspect;
      }

      const area = w * h;
      if (area > maxArea) {
        maxArea = area;
        bestCols = c;
        bestCardW = Math.floor(w);
        bestCardH = Math.floor(h);
      }
    }

    // Partition participants across rows based on bestCols
    const rows: (typeof participants)[] = [];
    for (let i = 0; i < count; i += bestCols) {
      rows.push(participants.slice(i, i + bestCols));
    }

    return {
      cardWidth: bestCardW,
      cardHeight: bestCardH,
      rows,
    };
  }, [participants, dimensions]);

  return (
    <div
      ref={containerRef}
      className="flex-1 w-full min-w-0 bg-background-dark flex flex-col h-full overflow-hidden select-none"
    >
      {/* Voice Room Header */}
      <div className="h-12 border-b border-black/20 px-3 md:px-4 flex items-center justify-between shadow-sm z-10 flex-shrink-0">
        <div className="flex items-center gap-2 truncate">
          {onOpenMobileDrawer && (
            <button
              onClick={onOpenMobileDrawer}
              className="md:hidden text-gray-400 hover:text-white p-1 -ml-1 rounded hover:bg-white/10 transition-colors"
              title="Menu de Canais"
            >
              <Menu className="w-5 h-5" />
            </button>
          )}
          <Volume2 className="w-5 h-5 md:w-6 md:h-6 text-online flex-shrink-0" />
          <span className="font-bold text-gray-100 truncate text-sm md:text-base">{channel.name}</span>
          <span className="text-xs text-gray-400">({participants.length})</span>
        </div>
      </div>

      {/* Main Voice / Video Dynamic Stage (Strictly fits without scrollbars) */}
      <div
        ref={containerRef}
        className="flex-1 min-h-0 min-w-0 flex items-center justify-center p-2 sm:p-4 md:p-6 overflow-hidden relative"
      >
        {isConnecting ? (
          <div className="flex flex-col items-center gap-3 text-gray-400">
            <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm font-medium">Conectando ao canal de voz...</span>
          </div>
        ) : participants.length === 0 ? (
          <div className="flex flex-col items-center gap-2 text-gray-500">
            <Volume2 className="w-12 h-12 stroke-1" />
            <span className="text-sm">Nenhum participante conectado</span>
          </div>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 sm:gap-3 md:gap-4 overflow-hidden">
            {stageLayout.rows.map((row, rIdx) => (
              <div
                key={rIdx}
                className="flex items-center justify-center gap-2 sm:gap-3 md:gap-4 flex-shrink-0"
                style={{
                  height: stageLayout.cardHeight > 0 ? `${stageLayout.cardHeight}px` : 'auto',
                }}
              >
                {row.map((p) => (
                  <div
                    key={p.sid || p.identity}
                    className="flex items-center justify-center flex-shrink-0"
                    style={{
                      width: stageLayout.cardWidth > 0 ? `${stageLayout.cardWidth}px` : 'auto',
                      height: stageLayout.cardHeight > 0 ? `${stageLayout.cardHeight}px` : 'auto',
                    }}
                  >
                    <ParticipantCard
                      participant={p}
                      onOpenUserProfile={onOpenUserProfile}
                      onOpenDM={onOpenDM}
                    />
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Floating Bottom Voice Controls */}
      <div className="p-3 md:p-4 flex justify-center bg-background-darker/80 backdrop-blur-md border-t border-black/20">
        {isConnectedToThisChannel ? (
          <div className="bg-background-darkest/95 px-4 md:px-6 py-2 rounded-2xl shadow-2xl flex items-center gap-3 md:gap-4 border border-white/10">
            {/* Mute Mic */}
            <button
              onClick={toggleMute}
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
              onClick={toggleDeafen}
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
              onClick={toggleCamera}
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
              onClick={handleScreenShareClick}
              className={`p-2.5 md:p-3 rounded-full transition-all cursor-pointer ${
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
              onClick={leaveVoice}
              className="p-2.5 md:p-3 rounded-full bg-dnd/20 text-dnd hover:bg-dnd hover:text-white transition-all cursor-pointer"
              title="Desconectar da Sala"
            >
              <PhoneOff className="w-5 h-5" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <button
              onClick={() => joinVoice(channel.id)}
              disabled={isConnecting}
              className="bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-semibold text-sm px-6 py-2.5 rounded-xl shadow-lg hover:shadow-brand-500/20 transition-all flex items-center gap-2 cursor-pointer active:scale-95"
            >
              {isConnecting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Conectando...</span>
                </>
              ) : (
                <>
                  <Volume2 className="w-4 h-4" />
                  <span>Conectar à Voz</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Context Menu Component */}
      <ContextMenu menu={menu} onClose={closeContextMenu} />
    </div>
  );
};
