import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Track, RemoteTrackPublication } from 'livekit-client';
import {
  Monitor,
  Maximize2,
  EyeOff,
  Mic,
  MicOff,
  Headphones,
  PhoneOff,
  Volume2,
  VolumeX,
  GripHorizontal,
} from 'lucide-react';
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
  const { activeGuild, guilds, selectGuild, selectChannel } = useGuildStore();
  const {
    currentChannelId,
    isConnected,
    isMuted,
    isDeafened,
    isScreensharing,
    participants,
    watchedParticipantId,
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
  const [showVolume, setShowVolume] = useState(false);

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

  // Find target participant to display
  const targetParticipant = participants.find(
    (p) =>
      p.identity === watchedParticipantId ||
      (p.isLocal && isScreensharing && (!watchedParticipantId || watchedParticipantId === user?.id))
  );

  const screenPub = targetParticipant?.getTrackPublication(Track.Source.ScreenShare);
  const hasScreenVideoTrack = !!screenPub?.track && !screenPub.isMuted;
  const isLocal = targetParticipant?.isLocal;

  const currentUVol = targetParticipant ? (userVolumes[targetParticipant.identity] ?? 1) : 1;
  const currentSVol = targetParticipant ? (streamVolumes[targetParticipant.identity] ?? 1) : 1;

  // Resolve target participant User info for profile modal
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

  // Attach and subscribe video stream & stream audio
  useEffect(() => {
    const el = videoRef.current;
    if (hasScreenVideoTrack && screenPub?.track && el) {
      screenPub.track.attach(el);
      el.play().catch(() => {});
    }

    if (screenPub instanceof RemoteTrackPublication) {
      screenPub.setSubscribed(true);
    }

    if (!isLocal && targetParticipant) {
      livekit.setStreamAudioSubscribed(targetParticipant.identity, true);
    }

    return () => {
      if (el && screenPub?.track) {
        screenPub.track.detach(el);
      }
      if (!isLocal && targetParticipant) {
        livekit.setStreamAudioSubscribed(targetParticipant.identity, false);
      }
    };
  }, [screenPub?.track, hasScreenVideoTrack, isLocal, targetParticipant]);

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

      const clampedX = Math.max(10, Math.min(window.innerWidth - width - 10, newX));
      const clampedY = Math.max(10, Math.min(window.innerHeight - height - 10, newY));

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
      const screenMidY = window.innerHeight / 2;

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

  if (!isConnected || !currentChannelId || !targetParticipant || !hasScreenVideoTrack) {
    return null;
  }

  const displayName = targetParticipant.name || targetParticipant.identity;

  const handleOpenVoiceRoom = () => {
    if (hasMovedSignificantlyRef.current) return;
    if (voiceChannel && parentGuild) {
      if (onNavigateToVoiceChannel) {
        onNavigateToVoiceChannel(voiceChannel.id, parentGuild.id);
      } else {
        selectGuild(parentGuild.id, voiceChannel.id);
      }
    }
  };

  const toggleFullscreen = (e: React.MouseEvent) => {
    e.stopPropagation();
    const videoEl = videoRef.current;
    if (!videoEl) return;
    if (!document.fullscreenElement) {
      if (videoEl.requestFullscreen) {
        videoEl.requestFullscreen().catch(() => {});
      }
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  const handleOpenUserProfile = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (hasMovedSignificantlyRef.current) return;
    onOpenUserProfile?.(targetUser, { x: e.clientX, y: e.clientY });
  };

  // Corner positioning CSS
  const getCornerClass = () => {
    if (dragPos) return '';
    switch (corner) {
      case 'top-left':
        return 'top-4 left-4';
      case 'top-right':
        return 'top-4 right-4';
      case 'bottom-left':
        return 'bottom-4 left-4';
      case 'bottom-right':
      default:
        return 'bottom-4 right-4';
    }
  };

  return (
    <div
      ref={containerRef}
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

      {/* Video Stream Stage */}
      <div
        onClick={handleOpenVoiceRoom}
        className="relative aspect-video bg-black cursor-pointer overflow-hidden flex items-center justify-center"
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className="w-full h-full object-contain bg-black pointer-events-none"
        />

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
                  setWatchedParticipant(null);
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
          <div className="bg-background-darkest/90 border border-white/10 px-3 py-1.5 rounded-xl text-xs font-semibold text-white flex items-center gap-1.5 shadow-xl">
            <Monitor className="w-3.5 h-3.5 text-brand-400" />
            <span>Clique para abrir a call</span>
          </div>
        </div>
      </div>

      {/* Bottom Voice Control Bar */}
      <div className="p-2.5 px-3 bg-background-darker/90 border-t border-white/5 flex items-center justify-between">
        <div
          onPointerDown={(e) => e.stopPropagation()}
          onClick={handleOpenUserProfile}
          className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity min-w-0"
          title="Clique para ver perfil do usuário em call"
        >
          <div className="w-2 h-2 rounded-full bg-online animate-pulse flex-shrink-0" />
          <span className="text-xs font-semibold text-gray-200 truncate hover:underline hover:text-white">
            {displayName} • #{voiceChannel?.name || 'Voz'}
          </span>
        </div>

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
  );
};
