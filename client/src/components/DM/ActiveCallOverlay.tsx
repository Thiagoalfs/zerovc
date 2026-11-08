import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  PhoneOff,
  Mic,
  MicOff,
  Headphones,
  Video,
  VideoOff,
  Monitor,
  Volume2,
  ChevronDown,
  ChevronUp,
  Users,
  LayoutGrid,
} from 'lucide-react';
import { useCallStore } from '../../stores/callStore';
import { useVoiceStore } from '../../stores/voiceStore';
import { useAuthStore } from '../../stores/authStore';
import { formatAssetUrl } from '../../lib/api';
import { ParticipantCard } from '../Voice/ParticipantCard';
import { ContextMenu, useContextMenu, ContextMenuItem } from '../ContextMenu';
import { useKeepAwake } from '../../hooks/useKeepAwake';
import { hapticMedium, hapticWarning } from '../../lib/haptics';
import { User } from '../../types';
import { HeadphonesOff } from '../Common/HeadphonesOff';

interface ActiveCallOverlayProps {
  onOpenScreenShare?: () => void;
  onOpenUserProfile?: (user: User, position?: { x: number; y: number }) => void;
  onOpenDM?: (userId: string) => void;
}

export const ActiveCallOverlay: React.FC<ActiveCallOverlayProps> = ({
  onOpenScreenShare,
  onOpenUserProfile,
  onOpenDM,
}) => {
  const { callState, targetUser, endCall } = useCallStore();
  const {
    voiceType,
    isConnected,
    isConnecting,
    isMuted,
    isDeafened,
    isCameraOn,
    isScreensharing,
    participants,
    toggleMute,
    toggleDeafen,
    toggleCamera,
    stopScreenShare,
  } = useVoiceStore();

  const isDMVoiceActive =
    (callState === 'connected' || (voiceType === 'dm' && isConnected)) &&
    participants.length > 0;
  const isCalling = callState === 'calling' && !isConnected;

  useKeepAwake(isDMVoiceActive || isCalling);

  const { menu, openContextMenu, closeContextMenu } = useContextMenu();
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerDimensions, setContainerDimensions] = useState({ width: 0, height: 0 });
  const [spotlightParticipantId, setSpotlightParticipantId] = useState<string | null>(null);
  const [isBottomStripCollapsed, setIsBottomStripCollapsed] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateDim = () => {
      const rect = el.getBoundingClientRect();
      setContainerDimensions({ width: rect.width, height: rect.height });
    };

    updateDim();
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, [isDMVoiceActive]);

  // Exact 16:9 adaptive grid calculator for DM video cards
  const stageLayout = useMemo(() => {
    const count = participants.length;
    if (count === 0 || containerDimensions.width === 0 || containerDimensions.height === 0) {
      return { cardWidth: 0, cardHeight: 0, rows: [] };
    }

    const W = containerDimensions.width;
    const H = containerDimensions.height;
    const gap = count > 1 ? (W < 640 ? 8 : 12) : 0;
    const paddingX = W < 640 ? 8 : 12;
    const paddingY = W < 640 ? 8 : 12;

    const availableW = Math.max(60, W - paddingX * 2);
    const availableH = Math.max(60, H - paddingY * 2);
    const targetAspect = 16 / 9;

    let bestCols = 1;
    let bestCardW = 0;
    let bestCardH = 0;
    let maxArea = 0;

    const maxColsToTry = Math.min(count, 4);
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

      if (count === 1) {
        const maxW = Math.min(420, availableW);
        const maxH = Math.min(240, availableH);
        if (w > maxW) {
          w = maxW;
          h = w / targetAspect;
        }
        if (h > maxH) {
          h = maxH;
          w = h * targetAspect;
        }
      }

      const area = w * h;
      if (area > maxArea) {
        maxArea = area;
        bestCols = c;
        bestCardW = Math.floor(w);
        bestCardH = Math.floor(h);
      }
    }

    const rows: (typeof participants)[] = [];
    for (let i = 0; i < count; i += bestCols) {
      rows.push(participants.slice(i, i + bestCols));
    }

    return {
      cardWidth: bestCardW,
      cardHeight: bestCardH,
      rows,
    };
  }, [participants, containerDimensions]);

  const spotlightParticipant = useMemo(() => {
    if (!spotlightParticipantId) return null;
    return participants.find((p) => (p.identity || p.sid) === spotlightParticipantId) || null;
  }, [spotlightParticipantId, participants]);

  if (!isCalling && !isDMVoiceActive) return null;

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
      openContextMenu(
        { clientX: rect.left + rect.width / 2, clientY: rect.bottom + 10 },
        items,
        'Transmissão de Tela'
      );
    } else {
      if (onOpenScreenShare) {
        onOpenScreenShare();
      }
    }
  };

  return (
    <div className="w-full bg-background-darkest border-b border-white/10 p-3 md:p-4 flex flex-col items-center justify-between transition-all select-none animate-in fade-in shadow-xl">
      {/* Calling State (Waiting for answer) */}
      {isCalling && (
        <div className="w-full flex items-center justify-between max-w-2xl mx-auto py-2">
          <div className="flex items-center gap-3">
            <div className="relative w-12 h-12 rounded-full bg-brand-500 flex items-center justify-center text-white font-bold text-base shadow-lg">
              {targetUser?.avatar_url ? (
                <img
                  src={formatAssetUrl(targetUser.avatar_url)}
                  alt=""
                  className="w-full h-full rounded-full object-cover"
                />
              ) : (
                <span>
                  {targetUser?.display_name?.[0]?.toUpperCase() ||
                    targetUser?.username?.[0]?.toUpperCase() ||
                    'U'}
                </span>
              )}
              <div className="absolute inset-0 rounded-full border-2 border-brand-400 animate-ping opacity-50" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-white">
                Chamando {targetUser?.display_name || targetUser?.username}...
              </h4>
              <p className="text-xs text-gray-400 animate-pulse">Aguardando atendimento</p>
            </div>
          </div>

          <button
            onClick={() => {
              hapticWarning();
              endCall();
            }}
            className="flex items-center gap-2 bg-dnd hover:bg-rose-700 text-white font-semibold px-4 py-2 rounded-xl text-xs transition-all shadow-lg cursor-pointer active:scale-95"
          >
            <PhoneOff className="w-4 h-4" />
            <span>Cancelar</span>
          </button>
        </div>
      )}

      {/* Connected State (Active Voice / Video DM Call with Participant Cards) */}
      {isDMVoiceActive && (
        <div className="w-full max-w-5xl mx-auto flex flex-col items-center gap-3">
          {/* Dynamic Video & Audio Participants Grid */}
          <div
            ref={containerRef}
            className="w-full min-h-[200px] max-h-[360px] h-[45vh] bg-background-darker/60 rounded-2xl border border-white/5 p-2 flex items-center justify-center overflow-hidden relative shadow-inner"
          >
            {isConnecting ? (
              <div className="flex flex-col items-center gap-2 text-gray-400">
                <div className="w-7 h-7 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs font-medium">Conectando áudio e vídeo...</span>
              </div>
            ) : participants.length === 0 ? (
              <div className="flex flex-col items-center gap-2 text-gray-400">
                <Volume2 className="w-8 h-8 text-gray-500 animate-pulse" />
                <span className="text-xs">Aguardando conexão...</span>
              </div>
            ) : spotlightParticipant ? (
              /* Spotlight View (Focused card on top, participant filmstrip below - Anexo 1 & 2) */
              <div className="w-full h-full flex flex-col items-center justify-between min-h-0 min-w-0 overflow-hidden relative">
                {/* 1. Main Spotlight Card */}
                <div className="flex-1 w-full min-h-0 min-w-0 flex items-center justify-center p-1 relative overflow-hidden">
                  <div className="w-full h-full max-w-full max-h-full aspect-video flex items-center justify-center">
                    <ParticipantCard
                      participant={spotlightParticipant}
                      onOpenUserProfile={onOpenUserProfile}
                      onOpenDM={onOpenDM}
                      onOpenScreenShare={onOpenScreenShare}
                      onClick={() => setSpotlightParticipantId(null)}
                    />
                  </div>

                  {/* Exit Spotlight / Return to Grid button */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSpotlightParticipantId(null);
                    }}
                    className="absolute top-2 right-2 z-20 flex items-center gap-1.5 px-2 py-1 rounded-lg bg-black/60 hover:bg-black/80 text-gray-300 hover:text-white border border-white/10 backdrop-blur-md text-[11px] font-semibold shadow transition-all active:scale-95 cursor-pointer"
                    title="Restaurar visualização em grade"
                  >
                    <LayoutGrid className="w-3 h-3" />
                    <span>Grade</span>
                  </button>

                  {/* Floating Expand Button at base of spotlight card when collapsed (Anexo 2) */}
                  {isBottomStripCollapsed && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsBottomStripCollapsed(false);
                      }}
                      className="absolute bottom-2 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#1e1f22]/95 hover:bg-[#2b2d31] text-white border border-white/15 shadow-xl backdrop-blur-md transition-all active:scale-95 cursor-pointer animate-in fade-in zoom-in-95 group"
                      title="Mostrar participantes"
                    >
                      <ChevronUp className="w-3.5 h-3.5 text-gray-300 group-hover:text-white transition-transform" />
                      <Users className="w-3.5 h-3.5 text-gray-300 group-hover:text-white" />
                    </button>
                  )}
                </div>

                {/* 2. Bottom Filmstrip of Participants (Anexo 1 & 2) */}
                {!isBottomStripCollapsed && (
                  <div className="w-full flex-shrink-0 relative pt-2.5 pb-0.5 px-1 border-t border-white/5 bg-background-darkest/50 backdrop-blur-sm flex flex-col items-center">
                    {/* Collapse Button (Anexo 2) placed on top center of the bottom filmstrip */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsBottomStripCollapsed(true);
                      }}
                      className="absolute -top-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#1e1f22] hover:bg-[#2b2d31] text-white border border-white/15 shadow-md backdrop-blur-md transition-all active:scale-95 cursor-pointer group"
                      title="Ocultar participantes"
                    >
                      <ChevronDown className="w-3 h-3 text-gray-300 group-hover:text-white transition-transform" />
                      <Users className="w-3 h-3 text-gray-300 group-hover:text-white" />
                    </button>

                    {/* Horizontal scrollable row of participant thumbnails */}
                    <div className="w-full flex items-center justify-center gap-1.5 overflow-x-auto py-0.5 px-1 no-scrollbar max-w-full">
                      {participants.map((p) => {
                        const pId = p.identity || p.sid;
                        const isSelected = (spotlightParticipant.identity || spotlightParticipant.sid) === pId;
                        return (
                          <div
                            key={pId}
                            onClick={() => setSpotlightParticipantId(pId)}
                            className={`h-20 sm:h-24 aspect-video flex-shrink-0 rounded-xl overflow-hidden transition-all duration-150 cursor-pointer ${
                              isSelected
                                ? 'ring-2 ring-brand-500 scale-[1.02] shadow'
                                : 'opacity-85 hover:opacity-100 hover:scale-[1.02]'
                            }`}
                          >
                            <ParticipantCard
                              participant={p}
                              onOpenUserProfile={onOpenUserProfile}
                              onOpenDM={onOpenDM}
                              onOpenScreenShare={onOpenScreenShare}
                              isCompact
                              onClick={() => setSpotlightParticipantId(pId)}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center gap-2 overflow-hidden">
                {stageLayout.rows.map((row, rIdx) => (
                  <div
                    key={rIdx}
                    className="flex items-center justify-center gap-2 flex-shrink-0"
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
                          onOpenScreenShare={onOpenScreenShare}
                          onClick={() => {
                            setSpotlightParticipantId(p.sid || p.identity);
                          }}
                        />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Call Controls Bar */}
          <div className="flex items-center justify-center gap-2.5 sm:gap-3.5 pt-1 select-none">
            {/* Mute Microphone */}
            <button
              onClick={() => {
                hapticMedium();
                toggleMute();
              }}
              className={`p-2.5 sm:p-3 rounded-full transition-all cursor-pointer shadow-md active:scale-95 ${
                isMuted
                  ? 'bg-dnd text-white hover:bg-rose-700'
                  : 'bg-background-light hover:bg-white/15 text-white'
              }`}
              title={isMuted ? 'Desmutar Microfone' : 'Mutar Microfone'}
            >
              {isMuted ? <MicOff className="w-4 h-4 sm:w-5 sm:h-5" /> : <Mic className="w-4 h-4 sm:w-5 sm:h-5" />}
            </button>

            {/* Deafen Audio */}
            <button
              onClick={() => {
                hapticMedium();
                toggleDeafen();
              }}
              className={`p-2.5 sm:p-3 rounded-full transition-all cursor-pointer shadow-md active:scale-95 ${
                isDeafened
                  ? 'bg-dnd text-white hover:bg-rose-700'
                  : 'bg-background-light hover:bg-white/15 text-white'
              }`}
              title={isDeafened ? 'Desensurdecer' : 'Ensurdecer'}
            >
              {isDeafened ? (
                <HeadphonesOff className="w-4 h-4 sm:w-5 sm:h-5" />
              ) : (
                <Headphones className="w-4 h-4 sm:w-5 sm:h-5" />
              )}
            </button>

            {/* Toggle Camera / Video */}
            <button
              onClick={() => {
                hapticMedium();
                toggleCamera();
              }}
              className={`p-2.5 sm:p-3 rounded-full transition-all cursor-pointer shadow-md active:scale-95 ${
                isCameraOn
                  ? 'bg-online text-white hover:bg-emerald-600'
                  : 'bg-background-light hover:bg-white/15 text-white'
              }`}
              title={isCameraOn ? 'Desligar Câmera' : 'Ligar Câmera'}
            >
              {isCameraOn ? <Video className="w-4 h-4 sm:w-5 sm:h-5" /> : <VideoOff className="w-4 h-4 sm:w-5 sm:h-5" />}
            </button>

            {/* Screen Share */}
            <button
              onClick={handleScreenShareClick}
              className={`p-2.5 sm:p-3 rounded-full transition-all cursor-pointer shadow-md active:scale-95 ${
                isScreensharing
                  ? 'bg-online text-white hover:bg-emerald-600'
                  : 'bg-background-light hover:bg-white/15 text-white'
              }`}
              title={isScreensharing ? 'Opções de Compartilhamento' : 'Compartilhar Tela'}
            >
              <Monitor className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>

            {/* End Call Button */}
            <button
              onClick={() => {
                hapticWarning();
                endCall();
              }}
              className="bg-dnd hover:bg-rose-700 text-white p-2.5 sm:p-3 rounded-full transition-all shadow-lg cursor-pointer ml-1 active:scale-95"
              title="Desligar Chamada"
            >
              <PhoneOff className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </div>
        </div>
      )}

      {/* Context Menu Component */}
      <ContextMenu menu={menu} onClose={closeContextMenu} />
    </div>
  );
};
