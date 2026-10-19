import { useUserContextMenu } from '../../hooks/useUserContextMenu';
import { UserAvatar } from '../Common/UserAvatar';
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Track, RemoteTrackPublication } from 'livekit-client';
import {
  ArrowLeft,
  Play,
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
import { VoiceControlBar } from './VoiceControlBar';
import { Permissions } from '../../types';
import { api } from '../../lib/api';
import { useDMStore } from '../../stores/dmStore';
import { useDMGroupStore } from '../../stores/dmGroupStore';
import { useFriendStore } from '../../stores/friendStore';
import { useVoiceStore } from '../../stores/voiceStore';
import { useGuildStore } from '../../stores/guildStore';
import { useAuthStore } from '../../stores/authStore';
import { livekit } from '../../lib/livekit';
import { formatAssetUrl } from '../../lib/api';
import { getDominantColorFromImage, generateColorFromName } from '../../lib/colorExtractor';
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
    voiceType,
    dmGroupId,
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

  // Fullscreen inactivity auto-hide controls (10 seconds timeout)
  const [areFullscreenControlsVisible, setAreFullscreenControlsVisible] = useState(true);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const resetControlsInactivityTimer = useCallback(() => {
    setAreFullscreenControlsVisible(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = setTimeout(() => {
      setAreFullscreenControlsVisible(false);
    }, 10000);
  }, []);

  useEffect(() => {
    if (!isFullscreen) {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
        controlsTimeoutRef.current = null;
      }
      return;
    }

    resetControlsInactivityTimer();

    const handleActivity = () => {
      resetControlsInactivityTimer();
    };

    window.addEventListener('mousemove', handleActivity, { passive: true });
    window.addEventListener('pointermove', handleActivity, { passive: true });
    window.addEventListener('touchstart', handleActivity, { passive: true });
    window.addEventListener('keydown', handleActivity, { passive: true });

    return () => {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
        controlsTimeoutRef.current = null;
      }
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('pointermove', handleActivity);
      window.removeEventListener('touchstart', handleActivity);
      window.removeEventListener('keydown', handleActivity);
    };
  }, [isFullscreen, resetControlsInactivityTimer]);

  useEffect(() => {
    if (!isConnected && isFullscreen) {
      setIsFullscreen(false);
    }
  }, [isConnected, isFullscreen]);

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

  // PiP Resize state
  const MIN_WIDTH = 240;
  const MAX_WIDTH = 600;
  const [pipWidth, setPipWidth] = useState<number>(() => {
    try {
      const saved = parseInt(localStorage.getItem('zerovc_pip_width') || '320', 10);
      if (!isNaN(saved) && saved >= MIN_WIDTH && saved <= MAX_WIDTH) {
        return saved;
      }
    } catch {}
    return 320;
  });
  const [isResizing, setIsResizing] = useState(false);

  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ startX: number; startY: number; initX: number; initY: number }>({
    startX: 0,
    startY: 0,
    initX: 0,
    initY: 0,
  });
  const hasMovedSignificantlyRef = useRef(false);

  // Resize handler
  const handleResizePointerDown = useCallback(
    (handleType: 'left' | 'right' | 'bottom-left' | 'bottom-right', e: React.PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      setIsResizing(true);

      const startX = e.clientX;
      const startY = e.clientY;
      const startWidth = pipWidth;

      const onPointerMove = (moveEvent: PointerEvent) => {
        let delta = 0;
        if (handleType === 'left' || handleType === 'bottom-left') {
          const dx = startX - moveEvent.clientX;
          const dy =
            (corner === 'bottom-right'
              ? startY - moveEvent.clientY
              : moveEvent.clientY - startY) *
            (16 / 9);
          delta = Math.abs(dx) > Math.abs(dy) ? dx : dy;
        } else {
          const dx = moveEvent.clientX - startX;
          const dy =
            (corner === 'bottom-left'
              ? startY - moveEvent.clientY
              : moveEvent.clientY - startY) *
            (16 / 9);
          delta = Math.abs(dx) > Math.abs(dy) ? dx : dy;
        }

        const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(startWidth + delta)));
        setPipWidth(newWidth);
      };

      const onPointerUp = () => {
        setIsResizing(false);
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        window.removeEventListener('pointercancel', onPointerUp);

        setPipWidth((curr) => {
          try {
            localStorage.setItem('zerovc_pip_width', curr.toString());
          } catch {}
          return curr;
        });
      };

      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
      window.addEventListener('pointercancel', onPointerUp);
    },
    [pipWidth, corner]
  );

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

  // Target participant is activeScreenSharer (when previewing) or streamParticipant (when watching)
  const targetParticipant = isWatchingStream ? streamParticipant : activeScreenSharer;
  const screenPub = streamParticipant?.getTrackPublication(Track.Source.ScreenShare);
  const hasScreenVideoTrack = !!screenPub?.track && !screenPub.isMuted;
  const isLocal = targetParticipant?.isLocal;

  const currentUVol = targetParticipant ? (userVolumes[targetParticipant.identity] ?? 1) : 1;
  const currentSVol = targetParticipant ? (streamVolumes[targetParticipant.identity] ?? 1) : 1;

  const [dominantBg, setDominantBg] = useState<string>('#2b2d31');

  // Resolve target participant User info, avatar and metadata
  const meta = (() => {
    try {
      return targetParticipant?.metadata ? JSON.parse(targetParticipant.metadata) : null;
    } catch {
      return null;
    }
  })();

  const activeDMRecipient = useDMStore.getState().activeRoom?.recipient;
  const voiceDMRecipient = useVoiceStore.getState().dmRecipient;
  const allDMRooms = useDMStore.getState().rooms;
  const roomRecipient = allDMRooms?.find((r) => r.recipient?.id === targetParticipant?.identity)?.recipient;
  const dmUser =
    (activeDMRecipient?.id === targetParticipant?.identity ? activeDMRecipient : null) ||
    (voiceDMRecipient?.id === targetParticipant?.identity ? voiceDMRecipient : null) ||
    roomRecipient ||
    null;

  const guildMember = activeGuild?.members?.find((m) => m.id === targetParticipant?.identity) ||
    guilds.flatMap((g) => g.members || []).find((m) => m.id === targetParticipant?.identity);
  const activeGroup = useDMGroupStore.getState().activeGroup;
  const groupMember = activeGroup?.members?.find((m) => m.id === targetParticipant?.identity);
  const allGroups = useDMGroupStore.getState().groups;
  const anyGroupMember = !groupMember
    ? allGroups?.flatMap((g) => g.members || []).find((m) => m.id === targetParticipant?.identity)
    : null;

  const friends = useFriendStore.getState().friends;
  const friendUser = friends?.find((f) => f.user?.id === targetParticipant?.identity || f.id === targetParticipant?.identity)?.user;

  const resolvedUser: User | null =
    (isLocal || targetParticipant?.identity === user?.id ? user : null) ||
    guildMember ||
    dmUser ||
    groupMember ||
    anyGroupMember ||
    friendUser ||
    null;

  const displayName =
    resolvedUser?.display_name ||
    resolvedUser?.username ||
    meta?.display_name ||
    meta?.username ||
    (targetParticipant?.name && targetParticipant.name !== targetParticipant.identity ? targetParticipant.name : null) ||
    'Usuário';

  const avatarUrl =
    resolvedUser?.avatar_url ||
    meta?.avatar_url ||
    (isLocal ? user?.avatar_url : undefined) ||
    null;

  const targetUser: User =
    resolvedUser || {
      id: targetParticipant?.identity || '',
      username: meta?.username || (targetParticipant?.name !== targetParticipant?.identity ? targetParticipant?.name : null) || 'Usuário',
      display_name: displayName,
      avatar_url: avatarUrl || undefined,
      status: 'online',
    };

  const audioPub = targetParticipant?.getTrackPublication(Track.Source.Microphone);
  const isParticipantMuted = targetParticipant ? (!targetParticipant.isMicrophoneEnabled && (!audioPub || audioPub.isMuted)) : false;
  const isParticipantSpeaking = targetParticipant ? (speakingUserIds.includes(targetParticipant.identity) && !isParticipantMuted) : false;

  useEffect(() => {
    let isMounted = true;
    if (avatarUrl) {
      getDominantColorFromImage(formatAssetUrl(avatarUrl), displayName).then((color) => {
        if (isMounted) setDominantBg(color);
      });
    } else {
      setDominantBg(generateColorFromName(displayName || targetParticipant?.identity || ''));
    }
    return () => {
      isMounted = false;
    };
  }, [avatarUrl, displayName, targetParticipant?.identity]);

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
    // Ignore drags initiated on sliders, text inputs, or explicit no-drag elements
    const target = e.target as HTMLElement;
    if (target.closest('input, textarea, select, [data-no-drag="true"]')) {
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
      const width = container?.offsetWidth || pipWidth;
      const height = container?.offsetHeight || Math.round((pipWidth * 9) / 16);

      const TOP_BOUNDARY = 44; // TitleBar (32px) + 12px margin
      const clampedX = Math.max(10, Math.min(window.innerWidth - width - 10, newX));
      const clampedY = Math.max(TOP_BOUNDARY, Math.min(window.innerHeight - height - 10, newY));

      setDragPos({ x: clampedX, y: clampedY });
    }
  }, [isDragging, pipWidth]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (isDragging) {
      setIsDragging(false);

      const container = containerRef.current;
      const width = container?.offsetWidth || pipWidth;
      const height = container?.offsetHeight || Math.round((pipWidth * 9) / 16);

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
  }, [isDragging, dragPos, pipWidth]);

  if (!isConnected || !currentChannelId || !activeScreenSharer || !targetParticipant) {
    return null;
  }

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

  const channelDisplayName =
    voiceChannel?.name ||
    (voiceType === 'dm' ? dmUser?.display_name || 'Chamada' : 'Voz');

  const handleCardClick = (e: React.MouseEvent) => {
    if (hasMovedSignificantlyRef.current) return;
    if (activeScreenSharer) {
      watchParticipant(activeScreenSharer.identity, 'exclusive');
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

    const pipContextType = voiceType === 'guild' ? 'guild' : (voiceType === 'group' ? 'dm_group' : (voiceType === 'dm' ? 'dm' : (activeGuild ? 'guild' : 'voice')));
    handleUserContextMenu(e, targetUser, {
      onOpenUserProfile,
      isVoiceActive: true,
      isVoiceMuted: !targetParticipant.isMicrophoneEnabled,
      isScreenSharing: hasScreenVideoTrack,
      voiceChannelId: voiceType === 'guild' ? (currentChannelId || undefined) : undefined,
      contextType: pipContextType,
      groupId: voiceType === 'group' ? (dmGroupId || undefined) : undefined,
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
        style={{
          width: `${pipWidth}px`,
          ...(dragPos
            ? {
                position: 'fixed',
                top: `${dragPos.y}px`,
                left: `${dragPos.x}px`,
              }
            : {}),
        }}
        className={`fixed z-40 rounded-2xl overflow-hidden shadow-2xl border border-white/10 bg-background-darkest/95 backdrop-blur-md select-none group ${getCornerClass()} ${
          isDragging
            ? 'scale-105 cursor-grabbing shadow-brand-500/20 border-brand-500/40'
            : isResizing
            ? 'shadow-brand-500/20'
            : 'transition-all duration-300 ease-out cursor-grab'
        }`}
      >
        {/* Drag Grip Handle Bar on Top */}
        <div className="absolute top-1.5 left-1/2 -translate-x-1/2 z-30 opacity-40 group-hover:opacity-100 transition-opacity pointer-events-none">
          <GripHorizontal className="w-5 h-3 text-white/60" />
        </div>

        {/* PiP Stage: Video Stream OR Live Screen Sharer Preview */}
        {isWatchingStream ? (
          <div
            onDoubleClick={(e) => {
              e.stopPropagation();
              toggleFullscreen();
            }}
            className="relative aspect-video bg-black overflow-hidden flex items-center justify-center select-none"
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

            {/* Top Left Navigation: <- #channelName */}
            <div className="absolute top-2.5 left-2.5 z-30">
              <button
                type="button"
                onClick={handleOpenVoiceRoom}
                className="flex items-center gap-1.5 bg-black/70 hover:bg-black/90 active:scale-95 text-gray-200 hover:text-white px-2 py-1 rounded-lg text-xs font-semibold backdrop-blur-md border border-white/10 transition-all cursor-pointer shadow-md"
                title="Voltar para a sala de voz"
              >
                <ArrowLeft className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="truncate max-w-[120px]">#{channelDisplayName}</span>
              </button>
            </div>

            {/* Top Right Controls: Fullscreen and Stop Watching */}
            <div className="absolute top-2.5 right-2.5 flex items-center gap-1 z-30">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (hasMovedSignificantlyRef.current) return;
                  toggleFullscreen(e);
                }}
                className="p-1.5 rounded-lg bg-black/60 hover:bg-white/20 text-gray-200 hover:text-white backdrop-blur-md transition-colors cursor-pointer"
                title="Tela cheia do vídeo"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>

              {!isLocal && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (hasMovedSignificantlyRef.current) return;
                    if (streamParticipant) {
                      unwatchParticipant(streamParticipant.identity);
                    }
                  }}
                  className="p-1.5 rounded-lg bg-black/60 hover:bg-dnd/80 text-gray-200 hover:text-white backdrop-blur-md transition-colors cursor-pointer"
                  title="Fechar transmissão"
                >
                  <EyeOff className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Bottom-left Streamer Badge */}
            <button
              type="button"
              onClick={handleOpenUserProfile}
              className="absolute bottom-2.5 left-2.5 flex items-center gap-1.5 bg-black/75 hover:bg-black/95 active:scale-95 border border-white/10 px-2 py-0.5 rounded-lg text-[11px] font-bold text-white shadow transition-all cursor-pointer z-20"
              title="Ver perfil do participante"
            >
              <div className="w-3.5 h-3.5 rounded-full bg-brand-500 flex items-center justify-center text-[8px] font-bold overflow-hidden">
                {targetUser.avatar_url ? (
                  <img
                    src={formatAssetUrl(targetUser.avatar_url)}
                    alt=""
                    draggable={false}
                    onDragStart={(e) => e.preventDefault()}
                    style={{ userSelect: 'none' }}
                    className="w-full h-full object-cover pointer-events-none select-none"
                  />
                ) : (
                  displayName?.[0]?.toUpperCase() || 'U'
                )}
              </div>
              <span className="truncate max-w-[90px]">{displayName}</span>
            </button>
          </div>
        ) : (
          <div
            onClick={handleCardClick}
            style={{ backgroundColor: dominantBg }}
            className={`relative aspect-video w-full cursor-pointer overflow-hidden flex flex-col items-center justify-center border-2 transition-all duration-150 ${
              isParticipantSpeaking
                ? 'border-[#23a55a] shadow-[0_0_12px_rgba(35,165,90,0.35)] ring-1 ring-[#23a55a]'
                : 'border-transparent'
            }`}
          >
            {/* Top Left Navigation: <- #channelName */}
            <div className="absolute top-2.5 left-2.5 z-30">
              <button
                type="button"
                onClick={handleOpenVoiceRoom}
                className="flex items-center gap-1.5 bg-black/70 hover:bg-black/90 active:scale-95 text-gray-200 hover:text-white px-2 py-1 rounded-lg text-xs font-semibold backdrop-blur-md border border-white/10 transition-all cursor-pointer shadow-md"
                title="Voltar para a sala de voz"
              >
                <ArrowLeft className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="truncate max-w-[120px]">#{channelDisplayName}</span>
              </button>
            </div>

            {/* Top Right Live Tag */}
            <div className="absolute top-2.5 right-2.5 z-20 flex items-center gap-1.5">
              <span className="bg-brand-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 shadow-sm">
                <Monitor className="w-3 h-3" /> AO VIVO
              </span>
            </div>

            {/* Avatar in Center */}
            <div className="flex flex-col items-center justify-center pointer-events-none select-none">
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full overflow-hidden flex items-center justify-center font-bold text-white text-xl sm:text-2xl shadow-xl select-none bg-black/20 pointer-events-none">
                {avatarUrl ? (
                  <img
                    src={formatAssetUrl(avatarUrl)}
                    alt={displayName}
                    draggable={false}
                    onDragStart={(e) => e.preventDefault()}
                    style={{ userSelect: 'none' }}
                    className="w-full h-full object-cover pointer-events-none select-none"
                  />
                ) : (
                  <span>{displayName?.[0]?.toUpperCase() || 'U'}</span>
                )}
              </div>
            </div>

            {/* Watch Stream Button */}
            <div className="mt-2.5 z-20">
              <button
                type="button"
                onClick={handleCardClick}
                className="bg-brand-500 hover:bg-brand-600 active:scale-95 text-white text-[11px] font-semibold px-3 py-1.5 rounded-xl backdrop-blur-md shadow-lg flex items-center gap-1.5 cursor-pointer transition-all"
                title="Assistir Transmissão"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Assistir Transmissão</span>
              </button>
            </div>

            {/* Bottom-left Name Pill */}
            <div className="absolute bottom-2.5 left-2.5 bg-[#111214]/85 backdrop-blur-md px-2.5 py-1 rounded-md flex items-center gap-1.5 text-xs font-semibold text-white shadow-md max-w-[70%] z-20 pointer-events-none">
              <span className="truncate">{displayName} {isLocal && '(Você)'}</span>
              {isParticipantMuted && (
                <MicOff className="w-3.5 h-3.5 text-dnd flex-shrink-0" />
              )}
            </div>
          </div>
        )}

        {/* Edge & Corner Resize Handles */}
        {corner === 'bottom-right' || corner === 'top-right' ? (
          <>
            {/* Left Edge Handle */}
            <div
              onPointerDown={(e) => handleResizePointerDown('left', e)}
              className="absolute left-0 top-0 bottom-0 w-2.5 cursor-ew-resize z-40 hover:bg-brand-500/20 transition-colors"
              title="Redimensionar"
            />
            {/* Bottom-left Corner Grip */}
            <div
              onPointerDown={(e) => handleResizePointerDown('bottom-left', e)}
              className="absolute bottom-0 left-0 w-6 h-6 cursor-nesw-resize z-40 flex items-end justify-start p-1 text-white/40 hover:text-white group-hover:opacity-100 opacity-0 transition-opacity"
              title="Redimensionar"
            >
              <svg className="w-3 h-3 pointer-events-none" viewBox="0 0 12 12" fill="none">
                <path d="M2 2L10 10M2 6L6 10M2 10L2 10.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
          </>
        ) : (
          <>
            {/* Right Edge Handle */}
            <div
              onPointerDown={(e) => handleResizePointerDown('right', e)}
              className="absolute right-0 top-0 bottom-0 w-2.5 cursor-ew-resize z-40 hover:bg-brand-500/20 transition-colors"
              title="Redimensionar"
            />
            {/* Bottom-right Corner Grip */}
            <div
              onPointerDown={(e) => handleResizePointerDown('bottom-right', e)}
              className="absolute bottom-0 right-0 w-6 h-6 cursor-nwse-resize z-40 flex items-end justify-end p-1 text-white/40 hover:text-white group-hover:opacity-100 opacity-0 transition-opacity"
              title="Redimensionar"
            >
              <svg className="w-3 h-3 pointer-events-none" viewBox="0 0 12 12" fill="none">
                <path d="M10 2L2 10M10 6L6 10M10 10L10 10.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
          </>
        )}
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
          onMouseMove={resetControlsInactivityTimer}
          className={`fixed ${isElectron ? 'top-8' : 'top-0'} inset-x-0 bottom-0 z-[45] bg-black flex items-center justify-center select-none ${
            areFullscreenControlsVisible ? 'cursor-default' : 'cursor-none'
          }`}
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
            className="w-full h-full object-contain bg-black"
          />

          {/* Top Fullscreen Controls Overlay */}
          <div
            className={`absolute top-4 left-4 right-4 flex items-center justify-between z-10 transition-all duration-500 ease-out transform pointer-events-none ${
              areFullscreenControlsVisible
                ? 'translate-y-0 opacity-100'
                : '-translate-y-16 opacity-0'
            }`}
          >
            <div className="flex items-center gap-2 bg-black/75 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10 shadow-lg pointer-events-auto">
              <div className="w-5 h-5 rounded-full bg-brand-500 flex items-center justify-center text-[10px] font-bold text-white overflow-hidden">
                {targetUser.avatar_url ? (
                  <img
                    src={formatAssetUrl(targetUser.avatar_url)}
                    alt=""
                    draggable={false}
                    onDragStart={(e) => e.preventDefault()}
                    style={{ userSelect: 'none' }}
                    className="w-full h-full object-cover pointer-events-none select-none"
                  />
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

          {/* Bottom Floating Voice Control Bar */}
          <div
            className={`absolute bottom-6 left-1/2 -translate-x-1/2 z-20 transition-all duration-500 ease-out transform ${
              areFullscreenControlsVisible
                ? 'translate-y-0 opacity-100 pointer-events-auto'
                : 'translate-y-24 opacity-0 pointer-events-none'
            }`}
          >
            <VoiceControlBar
              onDisconnect={() => setIsFullscreen(false)}
            />
          </div>
        </div>,
        document.body
      )}
      <ContextMenu menu={menu} onClose={closeContextMenu} />
    </>
  );
};
