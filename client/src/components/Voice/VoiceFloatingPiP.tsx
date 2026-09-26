import { useUserContextMenu } from '../../hooks/useUserContextMenu';
import { UserAvatar } from '../Common/UserAvatar';
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Track, RemoteTrackPublication } from 'livekit-client';
import {
  Monitor,
  Maximize2,
  Minimize2,
  EyeOff,
  Mic,
  MicOff,
  Headphones,
  PhoneOff,
  Volume2,
  VolumeX,
  GripHorizontal,
  User as UserIcon,
  MessageSquare,
  Shield,
  UserMinus,
  Ban,
  Check,
  Clock,
} from 'lucide-react';
import { ContextMenu, useContextMenu, ContextMenuItem } from '../ContextMenu';
import { UserVolumeSlider, StreamVolumeSlider } from './VolumeSliders';
import { Permissions } from '../../types';
import { api } from '../../lib/api';
import { useDMStore } from '../../stores/dmStore';
import { useVoiceStore } from '../../stores/voiceStore';
import { useGuildStore } from '../../stores/guildStore';
import { useAuthStore } from '../../stores/authStore';
import { livekit } from '../../lib/livekit';
import { formatAssetUrl } from '../../lib/api';
import { User } from '../../types';

type PiPCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

interface VoiceFloatingPiPProps {
  onNavigateToVoiceChannel?: (channelId: string, guildId?: string) => void;
  onOpenUserProfile?: (user: User, position?: { x: number; y: number }) => void;
}

export const VoiceFloatingPiP: React.FC<VoiceFloatingPiPProps> = ({
  onNavigateToVoiceChannel,
  onOpenUserProfile,
}) => {
  const { user } = useAuthStore();
  const {
    activeGuild,
    guilds,
    selectGuild,
    selectChannel,
    kickMember,
    banMember,
    muteMember,
    assignRole,
    removeRole,
  } = useGuildStore();
  const { openDMWithUser } = useDMStore();
  const { menu, closeContextMenu, handleUserContextMenu } = useUserContextMenu();

  const isElectron =
    typeof window !== 'undefined' &&
    (!!window.electronAPI?.isElectron || navigator.userAgent.includes('Electron'));
  const {
    currentChannelId,
    isConnected,
    isMuted,
    isDeafened,
    isScreensharing,
    participants,
    speakingUserIds,
    watchedParticipantId,
    watchedParticipantIds,
    watchParticipant,
    unwatchParticipant,
    setWatchedParticipant,
    toggleMute,
    toggleDeafen,
    leaveVoice,
    userVolumes,
    streamVolumes,
    setUserVolume,
    setStreamVolume,
  } = useVoiceStore();

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showVolume, setShowVolume] = useState(false);

  // Keep fullscreen state in sync with ESC key
  useEffect(() => {
    if (!isFullscreen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

  // Drag and Snap Corner state
  const [corner, setCorner] = useState<PiPCorner>(() => {
    try {
      const saved = localStorage.getItem('zerovc_pip_corner') as PiPCorner;
      if (['top-left', 'top-right', 'bottom-left', 'bottom-right'].includes(saved)) {
        return saved;
      }
    } catch {}
    return 'bottom-right';
  });

  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ startX: number; startY: number; initX: number; initY: number }>({
    startX: 0,
    startY: 0,
    initX: 0,
    initY: 0,
  });
  const hasMovedSignificantlyRef = useRef(false);

  // Check if any participant is actively sharing screen
  const activeScreenSharer = participants.find((p) => {
    const pub = p.getTrackPublication(Track.Source.ScreenShare);
    return (p.isScreenShareEnabled || !!pub) && (!pub || !pub.isMuted);
  }) || (isScreensharing ? participants.find((p) => p.isLocal) : null);

  // Determine if user explicitly requested to watch a stream (or is local streamer)
  const streamParticipant =
    (watchedParticipantIds?.length > 0
      ? participants.find((p) => {
          if (!watchedParticipantIds.includes(p.identity)) return false;
          const pub = p.getTrackPublication(Track.Source.ScreenShare);
          return (p.isScreenShareEnabled || !!pub) && (!pub || !pub.isMuted);
        })
      : null) || (isScreensharing ? participants.find((p) => p.isLocal) : null);

  const isWatchingStream = !!streamParticipant;

  // Active Speaker resolution (when not watching a video stream)
  const speakingParticipant = participants.find((p) => {
    const isSpeaking = speakingUserIds.includes(p.identity);
    const isMicOn = p.isMicrophoneEnabled;
    return isSpeaking && isMicOn;
  });

  const activeSpeaker =
    speakingParticipant ||
    participants.find((p) => !p.isLocal) ||
    participants.find((p) => p.isLocal);

  const targetParticipant = isWatchingStream ? streamParticipant : activeSpeaker;
  const screenPub = streamParticipant?.getTrackPublication(Track.Source.ScreenShare);
  const hasScreenVideoTrack = !!screenPub?.track && !screenPub.isMuted;
  const isLocal = targetParticipant?.isLocal;

  const currentUVol = targetParticipant ? (userVolumes[targetParticipant.identity] ?? 1) : 1;
  const currentSVol = targetParticipant ? (streamVolumes[targetParticipant.identity] ?? 1) : 1;

  // Resolve target participant User info for profile modal and context menu
  const targetUser: User =
    activeGuild?.members?.find((m) => m.id === targetParticipant?.identity) || {
      id: targetParticipant?.identity || '',
      username: targetParticipant?.name || 'Usuário',
      display_name: targetParticipant?.name,
      avatar_url: isLocal ? user?.avatar_url : undefined,
      status: 'online',
    };

  // Find the voice channel info
  const voiceChannel =
    activeGuild?.channels?.find((c) => c.id === currentChannelId) ||
    guilds.flatMap((g) => g.channels || []).find((c) => c.id === currentChannelId);

  const parentGuild =
    (voiceChannel && guilds.find((g) => g.id === voiceChannel.guild_id)) || activeGuild;

  // Attach and subscribe video stream & stream audio ONLY when watching
  useEffect(() => {
    if (!isWatchingStream || !streamParticipant) {
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      return;
    }

    const el = videoRef.current;
    if (hasScreenVideoTrack && screenPub?.track && el) {
      try {
        screenPub.track.attach(el);
        el.play().catch(() => {});
      } catch (err) {
        console.warn('[VoiceFloatingPiP] Error attaching video track:', err);
      }
    }

    if (screenPub instanceof RemoteTrackPublication) {
      try {
        screenPub.setSubscribed(true);
      } catch (err) {
        console.warn('[VoiceFloatingPiP] Error subscribing screenPub:', err);
      }
    }

    if (!streamParticipant.isLocal) {
      livekit.setStreamSubscribed(streamParticipant.identity, true);
    }

    return () => {
      if (el && screenPub?.track) {
        try {
          screenPub.track.detach(el);
        } catch {}
      }
    };
  }, [isWatchingStream, screenPub?.track, hasScreenVideoTrack, streamParticipant, screenPub]);

  // Drag Handlers
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    // Ignore clicks on buttons, inputs, links
    const target = e.target as HTMLElement;
    if (target.closest('button, input, textarea, a, select, [role="button"]')) {
      return;
    }

    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initX: rect.left,
      initY: rect.top,
    };
    hasMovedSignificantlyRef.current = false;
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (dragStartRef.current.startX === 0 && dragStartRef.current.startY === 0) return;

    const dx = e.clientX - dragStartRef.current.startX;
    const dy = e.clientY - dragStartRef.current.startY;

    if (!isDragging && Math.hypot(dx, dy) > 5) {
      setIsDragging(true);
      hasMovedSignificantlyRef.current = true;
    }

    if (isDragging || Math.hypot(dx, dy) > 5) {
      const newX = dragStartRef.current.initX + dx;
      const newY = dragStartRef.current.initY + dy;

      const container = containerRef.current;
      const width = container?.offsetWidth || 320;
      const height = container?.offsetHeight || 220;

      const TOP_BOUNDARY = 44; // TitleBar (32px) + 12px margin
      const clampedX = Math.max(10, Math.min(window.innerWidth - width - 10, newX));
      const clampedY = Math.max(TOP_BOUNDARY, Math.min(window.innerHeight - height - 10, newY));

      setDragPos({ x: clampedX, y: clampedY });
    }
  }, [isDragging]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (isDragging) {
      setIsDragging(false);

      const container = containerRef.current;
      const width = container?.offsetWidth || 320;
      const height = container?.offsetHeight || 220;

      const currentX = dragPos?.x ?? dragStartRef.current.initX;
      const currentY = dragPos?.y ?? dragStartRef.current.initY;

      const centerX = currentX + width / 2;
      const centerY = currentY + height / 2;

      const screenMidX = window.innerWidth / 2;
      const screenMidY = (window.innerHeight + 44) / 2;

      let nearestCorner: PiPCorner = 'bottom-right';
      if (centerX < screenMidX) {
        nearestCorner = centerY < screenMidY ? 'top-left' : 'bottom-left';
      } else {
        nearestCorner = centerY < screenMidY ? 'top-right' : 'bottom-right';
      }

      setCorner(nearestCorner);
      setDragPos(null);

      try {
        localStorage.setItem('zerovc_pip_corner', nearestCorner);
      } catch {}
    }

    dragStartRef.current = { startX: 0, startY: 0, initX: 0, initY: 0 };
  }, [isDragging, dragPos]);

  if (!isConnected || !currentChannelId || !targetParticipant) {
    return null;
  }

  const displayName = targetParticipant.name || targetParticipant.identity;

  const handleOpenVoiceRoom = async (e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    if (hasMovedSignificantlyRef.current) return;

    const curChId = currentChannelId || voiceChannel?.id;
    let curGId = parentGuild?.id || useVoiceStore.getState().currentGuildId;

    if (!curGId && curChId) {
      const foundGuild = guilds.find((g) => g.channels?.some((c) => c.id === curChId));
      if (foundGuild) {
        curGId = foundGuild.id;
      }
    }

    if (curChId && curGId) {
      if (onNavigateToVoiceChannel) {
        onNavigateToVoiceChannel(curChId, curGId);
      } else {
        await selectGuild(curGId, curChId);
      }
    } else if (curChId) {
      const activeG = useGuildStore.getState().activeGuild;
      if (activeG) {
        if (onNavigateToVoiceChannel) {
          onNavigateToVoiceChannel(curChId, activeG.id);
        } else {
          await selectGuild(activeG.id, curChId);
        }
      }
    }
  };

  const toggleFullscreen = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setIsFullscreen((prev) => !prev);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user || !targetParticipant) return;

    handleUserContextMenu(e, targetUser, {
      onOpenUserProfile,
      isVoiceActive: true,
      isVoiceMuted: !targetParticipant.isMicrophoneEnabled,
      isScreenSharing: hasScreenVideoTrack,
      voiceChannelId: currentChannelId || undefined,
      contextType: activeGuild ? 'guild' : 'voice',
    });
  };

  const handleOpenUserProfile = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (hasMovedSignificantlyRef.current) return;
    onOpenUserProfile?.(targetUser, { x: e.clientX, y: e.clientY });
  };

  // Corner positioning CSS (ensuring top corners are below the 32px TitleBar)
  const getCornerClass = () => {
    if (dragPos) return '';
    switch (corner) {
      case 'top-left':
        return 'top-12 left-4';
      case 'top-right':
        return 'top-12 right-4';
      case 'bottom-left':
        return 'bottom-4 left-4';
      case 'bottom-right':
      default:
        return 'bottom-4 right-4';
    }
  };

  // Disable floating PiP completely on mobile devices
  const isMobile =
    typeof window !== 'undefined' &&
    (/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
      Boolean((window as any).Capacitor?.isNativePlatform?.() || (window as any).Capacitor !== undefined) ||
      window.innerWidth < 768);

  if (isMobile) {
    return null;
  }

  return (
    <>
      <div
        ref={containerRef}
      onContextMenu={handleContextMenu}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      style={
        dragPos
          ? {
              position: 'fixed',
              top: `${dragPos.y}px`,
              left: `${dragPos.x}px`,
            }
          : undefined
      }
      className={`fixed z-40 w-72 sm:w-80 rounded-2xl overflow-hidden shadow-2xl border border-white/10 bg-background-darkest/95 backdrop-blur-md select-none group ${getCornerClass()} ${
        isDragging
          ? 'scale-105 cursor-grabbing shadow-brand-500/20 border-brand-500/40'
          : 'transition-all duration-300 ease-out cursor-grab'
      }`}
    >
      {/* Drag Grip Handle Bar on Top */}
      <div className="absolute top-1.5 left-1/2 -translate-x-1/2 z-30 opacity-40 group-hover:opacity-100 transition-opacity pointer-events-none">
        <GripHorizontal className="w-5 h-3 text-white/60" />
      </div>

      {/* PiP Stage: Video Stream OR Discord-Style Active Speaker */}
      {isWatchingStream ? (
        <div
          onClick={handleOpenVoiceRoom}
          className="relative aspect-video bg-black cursor-pointer overflow-hidden flex items-center justify-center"
        >
          <video
            ref={(el) => {
              videoRef.current = el;
              if (el && screenPub?.track && !screenPub.isMuted) {
                try {
                  screenPub.track.attach(el);
                  el.play().catch(() => {});
                } catch {}
              }
            }}
            autoPlay
            playsInline
            className={`w-full h-full object-contain bg-black pointer-events-none transition-opacity duration-200 ${
              hasScreenVideoTrack ? 'opacity-100' : 'opacity-0 absolute inset-0'
            }`}
          />

          {!hasScreenVideoTrack && (
            <div className="flex flex-col items-center justify-center gap-2 p-3 text-center pointer-events-none">
              <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-[11px] font-medium text-gray-300">Carregando...</span>
            </div>
          )}

          {/* Top Floating Bar */}
          <div className="absolute top-2 left-2 right-2 flex items-center justify-between z-20">
            {/* User Profile Badge (Click to open profile modal) */}
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={handleOpenUserProfile}
              className="flex items-center gap-1.5 bg-black/75 hover:bg-black/95 active:scale-95 border border-white/10 px-2 py-0.5 rounded-lg text-[11px] font-bold text-white shadow transition-all cursor-pointer z-30"
              title="Ver perfil do participante"
            >
              <div className="w-3.5 h-3.5 rounded-full bg-brand-500 flex items-center justify-center text-[8px] font-bold overflow-hidden">
                {targetUser.avatar_url ? (
                  <img src={formatAssetUrl(targetUser.avatar_url)} alt="" className="w-full h-full object-cover" />
                ) : (
                  displayName?.[0]?.toUpperCase() || 'U'
                )}
              </div>
              <span className="truncate max-w-[90px]">{displayName}</span>
              <span className="bg-brand-500 text-white text-[8px] px-1 py-0.2 rounded uppercase font-bold">
                Ao Vivo
              </span>
            </button>

            <div className="flex items-center gap-1" onPointerDown={(e) => e.stopPropagation()}>
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={toggleFullscreen}
                className="p-1 rounded-lg bg-black/60 hover:bg-white/20 text-gray-200 hover:text-white backdrop-blur-md transition-colors cursor-pointer"
                title="Tela cheia do vídeo"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>

              {!isLocal && (
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (streamParticipant) {
                      unwatchParticipant(streamParticipant.identity);
                    }
                  }}
                  className="p-1 rounded-lg bg-black/60 hover:bg-dnd/80 text-gray-200 hover:text-white backdrop-blur-md transition-colors cursor-pointer"
                  title="Fechar transmissão"
                >
                  <EyeOff className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Center Hover Click Overlay */}
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
            <div className="bg-background-darkest/95 border border-white/10 px-3.5 py-2 rounded-xl text-xs font-semibold text-white flex items-center gap-2 shadow-2xl backdrop-blur-md">
              <Monitor className="w-4 h-4 text-brand-400" />
              <span>Clique aqui para voltar para a call</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-3 pt-4 flex flex-col gap-2.5">
          {/* Active Speaker Card */}
          <div
            onClick={handleOpenUserProfile}
            className="flex items-center gap-3 p-2 rounded-xl bg-background-dark/80 border border-white/5 cursor-pointer hover:bg-background-dark hover:border-white/10 transition-all group/speaker"
            title="Ver perfil do usuário"
          >
            <div className="relative flex-shrink-0">
              <div
                className={`w-11 h-11 rounded-full bg-brand-500 flex items-center justify-center text-white font-bold text-sm shadow-sm overflow-hidden transition-all ${
                  speakingUserIds.includes(targetParticipant.identity) && targetParticipant.isMicrophoneEnabled
                    ? 'ring-2 ring-online ring-offset-2 ring-offset-background-darkest animate-pulse'
                    : ''
                }`}
              >
                {targetUser.avatar_url ? (
                  <img src={formatAssetUrl(targetUser.avatar_url)} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span>{displayName?.[0]?.toUpperCase() || 'U'}</span>
                )}
              </div>
            </div>

            <div className="flex flex-col min-w-0 flex-1">
              <span className="text-xs font-bold text-gray-200 truncate group-hover/speaker:text-white">
                {displayName}
              </span>
              <span className="text-[11px] text-gray-400 flex items-center gap-1">
                {speakingUserIds.includes(targetParticipant.identity) && targetParticipant.isMicrophoneEnabled ? (
                  <span className="text-online font-semibold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-online animate-ping" />
                    Falando...
                  </span>
                ) : !targetParticipant.isMicrophoneEnabled ? (
                  <span className="text-gray-500 flex items-center gap-1">
                    <MicOff className="w-3 h-3 text-dnd" />
                    Mutado
                  </span>
                ) : (
                  <span className="text-gray-400">Na call</span>
                )}
              </span>
            </div>
          </div>

          {/* Watch Stream Button (If another member is streaming) */}
          {activeScreenSharer && !activeScreenSharer.isLocal && (
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => watchParticipant(activeScreenSharer.identity, 'exclusive')}
              className="w-full py-2 px-3 bg-brand-500 hover:bg-brand-600 active:scale-98 text-white text-xs font-semibold rounded-xl shadow-lg shadow-brand-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
              title="Assistir Transmissão"
            >
              <Monitor className="w-3.5 h-3.5" />
              <span className="truncate">Assistir Transmissão ({activeScreenSharer.name || 'Usuário'})</span>
            </button>
          )}
        </div>
      )}

      {/* Bottom Voice Control Bar */}
      <div className="p-2.5 px-3 bg-background-darker/90 border-t border-white/5 flex items-center justify-between">
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={handleOpenVoiceRoom}
          className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity min-w-0 text-left flex-1 mr-2"
          title="Clique aqui para voltar para a call"
        >
          <div className="w-2 h-2 rounded-full bg-online animate-pulse flex-shrink-0" />
          <span className="text-xs font-semibold text-gray-200 truncate hover:underline hover:text-white">
            #{voiceChannel?.name || 'Voz'}
          </span>
        </button>

        <div
          className="flex items-center gap-1.5 flex-shrink-0"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          {!isLocal && targetParticipant && (
            <div className="relative">
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  setShowVolume(!showVolume);
                }}
                className="p-1.5 rounded-lg text-gray-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                title="Ajustar volumes"
              >
                {currentUVol === 0 ? (
                  <VolumeX className="w-3.5 h-3.5 text-dnd" />
                ) : (
                  <Volume2 className="w-3.5 h-3.5" />
                )}
              </button>

              {showVolume && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowVolume(false)} />
                  <div className="absolute right-0 bottom-full mb-2 z-50 bg-background-darkest border border-white/10 p-3 rounded-2xl shadow-2xl w-44 flex flex-col gap-2.5 animate-in fade-in zoom-in-95">
                    {/* User Voice Volume */}
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center justify-between text-[11px] font-semibold text-gray-300">
                        <div className="flex items-center gap-1">
                          <Volume2 className="w-3 h-3 text-gray-400" />
                          <span>Voz</span>
                        </div>
                        <span className="text-brand-400 font-mono text-[10px] font-bold">{Math.round(currentUVol * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={2}
                        step={0.05}
                        value={currentUVol}
                        onChange={(e) =>
                          setUserVolume(targetParticipant.identity, parseFloat(e.target.value))
                        }
                        className="w-full accent-brand-500 h-1.5 bg-background-light rounded-lg cursor-pointer"
                      />
                    </div>

                    {/* Stream Audio Volume */}
                    {hasScreenVideoTrack && (
                      <div className="flex flex-col gap-1 pt-2 border-t border-white/10">
                        <div className="flex items-center justify-between text-[11px] font-semibold text-gray-300">
                          <div className="flex items-center gap-1">
                            <Monitor className="w-3 h-3 text-brand-400" />
                            <span>Transmissão</span>
                          </div>
                          <span className="text-brand-400 font-mono text-[10px] font-bold">{Math.round(currentSVol * 100)}%</span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={2}
                          step={0.05}
                          value={currentSVol}
                          onChange={(e) =>
                            setStreamVolume(targetParticipant.identity, parseFloat(e.target.value))
                          }
                          className="w-full accent-brand-500 h-1.5 bg-background-light rounded-lg cursor-pointer"
                        />
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={toggleMute}
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
              isMuted
                ? 'bg-dnd text-white hover:bg-rose-700'
                : 'text-gray-300 hover:text-white hover:bg-white/10'
            }`}
            title={isMuted ? 'Desmutar Microfone' : 'Mutar Microfone'}
          >
            {isMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
          </button>

          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={toggleDeafen}
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
              isDeafened
                ? 'bg-dnd text-white hover:bg-rose-700'
                : 'text-gray-300 hover:text-white hover:bg-white/10'
            }`}
            title={isDeafened ? 'Desativar Áudio' : 'Ensurdecer'}
          >
            <Headphones className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={leaveVoice}
            className="p-1.5 rounded-lg text-dnd hover:bg-dnd/20 transition-colors cursor-pointer"
            title="Desconectar da call"
          >
            <PhoneOff className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>

    <ContextMenu menu={menu} onClose={closeContextMenu} />

    {/* Fullscreen Video Portal (Respects TitleBar in Electron) */}
    {isFullscreen &&
      createPortal(
        <div
          onContextMenu={handleContextMenu}
          onDoubleClick={(e) => {
            e.stopPropagation();
            toggleFullscreen();
          }}
          className={`fixed ${isElectron ? 'top-8' : 'top-0'} inset-x-0 bottom-0 z-[45] bg-black flex items-center justify-center select-none`}
        >
          <video
            ref={(el) => {
              if (el && screenPub?.track) {
                try {
                  screenPub.track.attach(el);
                  el.play().catch(() => {});
                } catch {}
              }
            }}
            onContextMenu={handleContextMenu}
            autoPlay
            playsInline
            className="w-full h-full object-contain bg-black cursor-default"
          />

          {/* Top Fullscreen Controls Overlay */}
          <div className="absolute top-4 left-4 right-4 flex items-center justify-between z-10 pointer-events-none">
            <div className="flex items-center gap-2 bg-black/75 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10 shadow-lg pointer-events-auto">
              <div className="w-5 h-5 rounded-full bg-brand-500 flex items-center justify-center text-[10px] font-bold text-white overflow-hidden">
                {targetUser.avatar_url ? (
                  <img src={formatAssetUrl(targetUser.avatar_url)} alt="" className="w-full h-full object-cover" />
                ) : (
                  displayName?.[0]?.toUpperCase() || 'U'
                )}
              </div>
              <span className="text-sm font-semibold text-white">{displayName}</span>
              <span className="bg-brand-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1">
                <Monitor className="w-3 h-3" /> AO VIVO
              </span>
            </div>

            <div className="flex items-center gap-2 bg-black/75 backdrop-blur-md px-2 py-1.5 rounded-xl border border-white/10 shadow-lg pointer-events-auto">
              {/* 1. Stop Watching (Keeps label) */}
              {!isLocal && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFullscreen();
                    if (streamParticipant) {
                      unwatchParticipant(streamParticipant.identity);
                    }
                  }}
                  className="p-1.5 text-gray-300 hover:text-white rounded-lg hover:bg-white/10 text-xs flex items-center gap-1.5 font-medium transition-colors cursor-pointer"
                  title="Parar de assistir transmissão"
                >
                  <EyeOff className="w-4 h-4" />
                  <span className="text-xs">Parar de Ver</span>
                </button>
              )}

              {/* 2. Fullscreen Toggle (Icon Only) */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFullscreen();
                }}
                className="p-1.5 text-gray-300 hover:text-white rounded-lg hover:bg-white/10 transition-colors cursor-pointer flex items-center justify-center text-xs"
                title="Sair da tela cheia (ESC)"
              >
                <Minimize2 className="w-4 h-4" />
              </button>

              {/* 3. Fullscreen Volume Controls Popover (Icon Only) */}
              {!isLocal && targetParticipant && (
                <div className="relative flex items-center">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowVolume(!showVolume);
                    }}
                    className="p-1.5 rounded-lg text-gray-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer flex items-center justify-center text-xs"
                    title="Ajustar volumes"
                  >
                    {currentUVol === 0 && (!hasScreenVideoTrack || currentSVol === 0) ? (
                      <VolumeX className="w-4 h-4 text-dnd" />
                    ) : (
                      <Volume2 className="w-4 h-4" />
                    )}
                  </button>

                  {showVolume && (
                    <>
                      <div
                        className="fixed inset-0 z-40"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setShowVolume(false);
                        }}
                      />
                      <div
                        className="absolute right-0 top-full mt-2 z-50 bg-background-darkest border border-white/10 p-3 rounded-2xl shadow-2xl w-60 flex flex-col gap-2.5 animate-in fade-in zoom-in-95 pointer-events-auto"
                        onClick={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                      >
                        <UserVolumeSlider userId={targetParticipant.identity} label="Volume de Voz" className="p-0" />
                        {hasScreenVideoTrack && (
                          <div className="pt-2 border-t border-white/10">
                            <StreamVolumeSlider userId={targetParticipant.identity} label="Volume da Transmissão" className="p-0" />
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
      <ContextMenu menu={menu} onClose={closeContextMenu} />
    </>
  );
};
