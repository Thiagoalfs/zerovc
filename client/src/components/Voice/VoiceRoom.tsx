import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Volume2, Mic, MicOff, Headphones, Monitor, PhoneOff, Menu, Video, VideoOff, MonitorOff } from 'lucide-react';
import { Channel, User, VoiceSession } from '../../types';
import { useVoiceStore } from '../../stores/voiceStore';
import { useGuildStore } from '../../stores/guildStore';
import { useAuthStore } from '../../stores/authStore';
import { Participant } from 'livekit-client';
import { ParticipantCard } from './ParticipantCard';
import { ContextMenu, useContextMenu, ContextMenuItem } from '../ContextMenu';
import { useKeepAwake } from '../../hooks/useKeepAwake';
import { hapticMedium, hapticWarning } from '../../lib/haptics';

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
  const { user } = useAuthStore();
  const activeGuild = useGuildStore((s) => s.activeGuild);
  const liveChannel = activeGuild?.channels?.find((c) => c.id === channel.id) || channel;

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
  const isConnectingToThisChannel = isConnecting && currentChannelId === channel.id;

  // Keep mobile screen awake while connected in voice channel
  useKeepAwake(isConnectedToThisChannel);

  const stageRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;

    const updateDimensions = () => {
      const rect = el.getBoundingClientRect();
      setDimensions({ width: rect.width, height: rect.height });
    };

    updateDimensions();

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
        { clientX: rect.left + rect.width / 2, clientY: rect.top - 10 },
        items,
        'Transmissão de Tela'
      );
    } else {
      onOpenScreenShare();
    }
  };

  // Synchronized voice sessions matching sidebar ChannelList in real time
  const rawVoiceSessions = liveChannel.voice_sessions || [];

  const effectiveVoiceSessions = useMemo(() => {
    const sessions = [...rawVoiceSessions];
    if (user && (isConnectedToThisChannel || isConnectingToThisChannel)) {
      const alreadyPresent = sessions.some((s) => s.user_id === user.id);
      if (!alreadyPresent) {
        const currentGuildMember = activeGuild?.members?.find((m) => m.id === user.id);
        const selfSession: VoiceSession = {
          id: `self-${user.id}-${channel.id}`,
          channel_id: channel.id,
          user_id: user.id,
          is_muted: isMuted,
          is_deafened: isDeafened,
          is_screensharing: isScreensharing,
          joined_at: new Date().toISOString(),
          user: {
            ...user,
            display_name: currentGuildMember?.display_name || user.display_name,
            avatar_url: currentGuildMember?.avatar_url || user.avatar_url,
            roles: currentGuildMember?.roles || user.roles || [],
          },
        };
        sessions.push(selfSession);
      }
    }
    return sessions;
  }, [
    rawVoiceSessions,
    user,
    isConnectedToThisChannel,
    isConnectingToThisChannel,
    channel.id,
    activeGuild,
    isMuted,
    isDeafened,
    isScreensharing,
  ]);

  const displayedParticipants = useMemo(() => {
    const livekitMap = new Map<string, Participant>();
    if (isConnectedToThisChannel && participants && participants.length > 0) {
      participants.forEach((p) => {
        livekitMap.set(p.identity, p);
      });
    }

    const result: Participant[] = [];
    const seenIdentities = new Set<string>();

    effectiveVoiceSessions.forEach((vs) => {
      seenIdentities.add(vs.user_id);
      const lkParticipant = livekitMap.get(vs.user_id);
      if (lkParticipant) {
        result.push(lkParticipant);
      } else {
        const isLocal = vs.user_id === user?.id;
        const member = activeGuild?.members?.find((m) => m.id === vs.user_id);
        const metaObj = {
          avatar_url: member?.avatar_url || vs.user?.avatar_url || '',
          display_name: member?.display_name || vs.user?.display_name || '',
          username: member?.username || vs.user?.username || '',
        };

        const syntheticParticipant = {
          sid: vs.id || vs.user_id,
          identity: vs.user_id,
          name: member?.display_name || vs.user?.display_name || member?.username || vs.user?.username || vs.user_id,
          isLocal,
          metadata: JSON.stringify(metaObj),
          isMicrophoneEnabled: !vs.is_muted && !vs.is_deafened,
          isCameraEnabled: false,
          isScreenShareEnabled: !!vs.is_screensharing,
          getTrackPublication: () => undefined,
          on: () => {},
          off: () => {},
        } as unknown as Participant;

        result.push(syntheticParticipant);
      }
    });

    if (isConnectedToThisChannel && participants) {
      participants.forEach((p) => {
        if (!seenIdentities.has(p.identity)) {
          seenIdentities.add(p.identity);
          result.push(p);
        }
      });
    }

    return result;
  }, [effectiveVoiceSessions, isConnectedToThisChannel, participants, user?.id, activeGuild]);

  // Exact 16:9 adaptive grid calculator
  const stageLayout = useMemo(() => {
    const count = displayedParticipants.length;
    if (count === 0 || dimensions.width === 0 || dimensions.height === 0) {
      return { cardWidth: 0, cardHeight: 0, rows: [] };
    }

    const W = dimensions.width;
    const H = dimensions.height;
    const gap = count > 1 ? (W < 640 ? 8 : 14) : 0;
    const paddingX = W < 640 ? 8 : 16;
    const buttonReservedH = !isConnectedToThisChannel ? 56 : 0;
    const paddingY = (H < 640 ? 8 : 16) + (buttonReservedH > 0 ? 8 : 0);

    const availableW = Math.max(60, W - paddingX * 2);
    const availableH = Math.max(60, H - paddingY * 2 - buttonReservedH);
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

      // If single participant, cap size so it maintains a clean centered card and doesn't blow up full screen
      if (count === 1) {
        const maxW = Math.min(500, availableW);
        const maxH = Math.min(300, availableH);
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

    // Partition participants across rows based on bestCols
    const rows: (typeof displayedParticipants)[] = [];
    for (let i = 0; i < count; i += bestCols) {
      rows.push(displayedParticipants.slice(i, i + bestCols));
    }

    return {
      cardWidth: bestCardW,
      cardHeight: bestCardH,
      rows,
    };
  }, [displayedParticipants, dimensions, isConnectedToThisChannel]);

  return (
    <div
      className="flex-1 w-full min-w-0 bg-background-dark flex flex-col h-full overflow-hidden select-none"
    >
      {/* Voice Room Header */}
      <div className="h-14 md:h-12 border-b border-black/20 px-3 md:px-4 flex items-center justify-between shadow-sm z-10 flex-shrink-0">
        <div className="flex items-center gap-2.5 md:gap-2 truncate">
          {onOpenMobileDrawer && (
            <button
              onClick={onOpenMobileDrawer}
              className="md:hidden text-gray-400 hover:text-white p-1.5 -ml-1 rounded-lg hover:bg-white/10 transition-colors"
              title="Menu de Canais"
            >
              <Menu className="w-6 h-6" />
            </button>
          )}
          <Volume2 className="w-6 h-6 text-online flex-shrink-0" />
          <span className="font-bold text-gray-100 truncate text-[17px] md:text-base">{channel.name}</span>
          <span className="text-xs text-gray-400">({displayedParticipants.length})</span>
        </div>
      </div>

      {/* Main Voice / Video Dynamic Stage (Strictly fits without scrollbars) */}
      <div
        ref={stageRef}
        className="flex-1 min-h-0 min-w-0 flex items-center justify-center p-2 sm:p-4 overflow-hidden relative"
      >
        {/* Floating Connecting Pill Badge */}
        {isConnectingToThisChannel && displayedParticipants.length > 0 && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 bg-brand-500/90 text-white text-xs font-semibold px-4 py-1.5 rounded-full shadow-lg backdrop-blur-md animate-pulse">
            <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            <span>Conectando à voz...</span>
          </div>
        )}

        {displayedParticipants.length === 0 ? (
          <div className="flex flex-col items-center gap-4 text-gray-500 animate-in fade-in">
            <div className="flex flex-col items-center gap-2">
              <Volume2 className="w-12 h-12 stroke-1 text-gray-500" />
              <span className="text-sm font-medium text-gray-400">
                {isConnectingToThisChannel ? 'Conectando ao canal de voz...' : 'Nenhum participante conectado'}
              </span>
            </div>

            {!isConnectedToThisChannel && (
              <button
                disabled={isConnectingToThisChannel}
                onClick={() => {
                  hapticMedium();
                  joinVoice(channel.id, channel.guild_id);
                }}
                className="bg-brand-500 hover:bg-brand-600 disabled:opacity-75 text-white font-semibold text-sm px-6 py-2.5 rounded-xl shadow-lg hover:shadow-brand-500/20 transition-all flex items-center gap-2 cursor-pointer active:scale-95 animate-in zoom-in-95"
              >
                {isConnectingToThisChannel ? (
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
            )}
          </div>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-3 overflow-hidden">
            {/* Participant Cards Grid */}
            <div className="flex flex-col items-center justify-center gap-2 sm:gap-3 overflow-hidden">
              {stageLayout.rows.map((row, rIdx) => (
                <div
                  key={rIdx}
                  className="flex items-center justify-center gap-2 sm:gap-3 flex-shrink-0"
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
                        maxWidth: '100%',
                        maxHeight: '100%',
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

            {/* Connect to Voice Button (Always centered below cards when not connected) */}
            {!isConnectedToThisChannel && (
              <div className="pt-2 flex-shrink-0">
                <button
                  disabled={isConnectingToThisChannel}
                  onClick={() => {
                    hapticMedium();
                    joinVoice(channel.id, channel.guild_id);
                  }}
                  className="bg-brand-500 hover:bg-brand-600 disabled:opacity-75 text-white font-semibold text-sm px-6 py-2.5 rounded-xl shadow-lg hover:shadow-brand-500/20 transition-all flex items-center gap-2 cursor-pointer active:scale-95 animate-in zoom-in-95"
                >
                  {isConnectingToThisChannel ? (
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
        )}
      </div>

      {/* Floating Bottom Voice Controls (Only rendered when user is connected to this voice channel) */}
      {isConnectedToThisChannel && (
        <div 
          style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 0.75rem)' }}
          className="p-3 md:p-4 flex justify-center bg-background-darker/80 backdrop-blur-md border-t border-black/20 select-none z-10 flex-shrink-0 animate-in slide-in-from-bottom-2 duration-200"
        >
          <div className="bg-background-darkest/95 px-4 md:px-6 py-2 rounded-2xl shadow-2xl flex items-center gap-3 md:gap-4 border border-white/10">
            {/* Mute Mic */}
            <button
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
              onClick={handleScreenShareClick}
              className={`hidden md:flex p-2.5 md:p-3 rounded-full transition-all cursor-pointer ${
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
              onClick={() => {
                hapticWarning();
                leaveVoice();
              }}
              className="p-2.5 md:p-3 rounded-full bg-dnd/20 text-dnd hover:bg-dnd hover:text-white transition-all cursor-pointer active:scale-95"
              title="Desconectar da Sala"
            >
              <PhoneOff className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* Context Menu Component */}
      <ContextMenu menu={menu} onClose={closeContextMenu} />
    </div>
  );
};
