import { useUserContextMenu } from '../../hooks/useUserContextMenu';
import { UserAvatar } from '../Common/UserAvatar';
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Participant, Track, RemoteTrackPublication, ParticipantEvent } from 'livekit-client';
import {
  MicOff,
  Mic,
  Monitor,
  Maximize2,
  Minimize2,
  Play,
  EyeOff,
  Radio,
  Video,
  Volume2,
  VolumeX,
  User as UserIcon,
  MessageSquare,
  Shield,
  UserMinus,
  Ban,
  Check,
  Clock,
  Headphones,
  PhoneOff,
} from 'lucide-react';
import { useVoiceStore } from '../../stores/voiceStore';
import { useAuthStore } from '../../stores/authStore';
import { useGuildStore } from '../../stores/guildStore';
import { useDMStore } from '../../stores/dmStore';
import { User, Permissions } from '../../types';
import { api, formatAssetUrl } from '../../lib/api';
import { livekit } from '../../lib/livekit';
import { getDominantColorFromImage, generateColorFromName } from '../../lib/colorExtractor';
import { ContextMenu, useContextMenu, ContextMenuItem } from '../ContextMenu';
import { UserVolumeSlider, StreamVolumeSlider } from './VolumeSliders';

interface ParticipantCardProps {
  participant: Participant;
  onOpenUserProfile?: (user: User, position?: { x: number; y: number }) => void;
  onOpenDM?: (userId: string) => void;
}

export const ParticipantCard: React.FC<ParticipantCardProps> = ({
  participant,
  onOpenUserProfile,
  onOpenDM,
}) => {
  const { user } = useAuthStore();
  const {
    activeGuild,
    kickMember,
    banMember,
    muteMember,
    assignRole,
    removeRole,
  } = useGuildStore();
  const { openDMWithUser } = useDMStore();
  const { menu, closeContextMenu, handleUserContextMenu } = useUserContextMenu();
  const {
    currentChannelId,
    speakingUserIds,
    stopScreenShare,
    userVolumes,
    streamVolumes,
    setUserVolume,
    setStreamVolume,
    watchedParticipantId,
    setWatchedParticipant,
  } = useVoiceStore();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const cameraRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const [dominantBg, setDominantBg] = useState<string>('#2b2d31');
  const [, setTrackUpdateTick] = useState(0);

  // Re-render immediately when LiveKit participant track status changes
  useEffect(() => {
    const handleUpdate = () => {
      setTrackUpdateTick((t) => t + 1);
    };

    participant.on(ParticipantEvent.TrackSubscribed, handleUpdate);
    participant.on(ParticipantEvent.TrackUnsubscribed, handleUpdate);
    participant.on(ParticipantEvent.TrackMuted, handleUpdate);
    participant.on(ParticipantEvent.TrackUnmuted, handleUpdate);
    participant.on(ParticipantEvent.TrackPublished, handleUpdate);
    participant.on(ParticipantEvent.TrackUnpublished, handleUpdate);
    participant.on(ParticipantEvent.IsSpeakingChanged, handleUpdate);
    participant.on(ParticipantEvent.ParticipantMetadataChanged, handleUpdate);

    return () => {
      participant.off(ParticipantEvent.TrackSubscribed, handleUpdate);
      participant.off(ParticipantEvent.TrackUnsubscribed, handleUpdate);
      participant.off(ParticipantEvent.TrackMuted, handleUpdate);
      participant.off(ParticipantEvent.TrackUnmuted, handleUpdate);
      participant.off(ParticipantEvent.TrackPublished, handleUpdate);
      participant.off(ParticipantEvent.TrackUnpublished, handleUpdate);
      participant.off(ParticipantEvent.IsSpeakingChanged, handleUpdate);
      participant.off(ParticipantEvent.ParticipantMetadataChanged, handleUpdate);
    };
  }, [participant]);

  const isElectron =
    typeof window !== 'undefined' &&
    (!!window.electronAPI?.isElectron || navigator.userAgent.includes('Electron'));

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

  const isLocal = participant.isLocal;

  // Resolve participant profile avatar (store first for realtime updates, meta token as last fallback)
  const meta = (() => {
    try {
      return participant.metadata ? JSON.parse(participant.metadata) : null;
    } catch {
      return null;
    }
  })();

  const dmRecipient = useDMStore.getState().activeRoom?.recipient;
  const dmUser = dmRecipient?.id === participant.identity ? dmRecipient : null;
  const guildMember = activeGuild?.members?.find((m) => m.id === participant.identity);

  const avatarUrl =
    (isLocal || participant.identity === user?.id ? user?.avatar_url : null) ||
    guildMember?.avatar_url ||
    dmUser?.avatar_url ||
    meta?.avatar_url;

  // Check audio mute status
  const audioPub = participant.getTrackPublication(Track.Source.Microphone);
  const isMuted = !participant.isMicrophoneEnabled && (!audioPub || audioPub.isMuted);
  const isSpeaking = speakingUserIds.includes(participant.identity) && !isMuted;

  // Check video & screen share track
  const screenPub = participant.getTrackPublication(Track.Source.ScreenShare);
  const cameraPub = participant.getTrackPublication(Track.Source.Camera);

  const isScreenSharing = participant.isScreenShareEnabled || !!screenPub;
  const isCameraEnabled = participant.isCameraEnabled || (!!cameraPub?.track && !cameraPub.isMuted);
  const hasScreenVideoTrack = !!screenPub?.track && !screenPub.isMuted;
  const hasCameraVideoTrack = !!cameraPub?.track && !cameraPub.isMuted;

  const currentUVol = userVolumes[participant.identity] ?? 1;
  const currentSVol = streamVolumes[participant.identity] ?? 1;
  const isWatching = (isLocal && isScreenSharing) || watchedParticipantId === participant.identity;

  const fullscreenVideoRef = useRef<HTMLVideoElement | null>(null);

  // Helper to safely attach track to HTMLVideoElement
  const attachVideoTrack = (el: HTMLVideoElement | null, track: any) => {
    if (!el || !track) return;
    try {
      track.attach(el);
      el.play().catch(() => {});
    } catch (err) {
      console.warn('[ParticipantCard] Error attaching video track:', err);
    }
  };

  // Handle Screen Share video track attachment and LiveKit subscription
  useEffect(() => {
    const el = videoRef.current;
    if (isWatching && hasScreenVideoTrack && screenPub?.track && el) {
      attachVideoTrack(el, screenPub.track);
    }

    if (screenPub instanceof RemoteTrackPublication) {
      try {
        screenPub.setSubscribed(isWatching);
      } catch (err) {
        console.warn('[ParticipantCard] Error setting screenPub subscription:', err);
      }
    }

    return () => {
      if (el && screenPub?.track) {
        try {
          screenPub.track.detach(el);
        } catch {}
      }
    };
  }, [screenPub?.track, hasScreenVideoTrack, isWatching, screenPub]);

  // Handle Camera track attachment
  useEffect(() => {
    const el = cameraRef.current;
    if (hasCameraVideoTrack && cameraPub?.track && el) {
      attachVideoTrack(el, cameraPub.track);
    }

    if (cameraPub instanceof RemoteTrackPublication) {
      try {
        cameraPub.setSubscribed(true);
      } catch {}
    }

    return () => {
      if (el && cameraPub?.track) {
        try {
          cameraPub.track.detach(el);
        } catch {}
      }
    };
  }, [cameraPub?.track, hasCameraVideoTrack, cameraPub]);

  // Handle Fullscreen video attachment
  useEffect(() => {
    const el = fullscreenVideoRef.current;
    if (!isFullscreen || !el) return;

    const track = (isScreenSharing && isWatching && screenPub?.track) || (hasCameraVideoTrack && cameraPub?.track);
    if (track) {
      attachVideoTrack(el, track);
    }

    return () => {
      if (track && el) {
        try {
          track.detach(el);
        } catch {}
      }
    };
  }, [isFullscreen, isScreenSharing, isWatching, screenPub?.track, hasCameraVideoTrack, cameraPub?.track]);

  const handleToggleWatch = (watch: boolean) => {
    setWatchedParticipant(watch ? participant.identity : null);
  };

  const toggleFullscreen = () => {
    setIsFullscreen((prev) => !prev);
  };

  const displayName = participant.name || participant.identity;

  useEffect(() => {
    let isMounted = true;
    if (avatarUrl) {
      getDominantColorFromImage(formatAssetUrl(avatarUrl), displayName).then((color) => {
        if (isMounted) setDominantBg(color);
      });
    } else {
      setDominantBg(generateColorFromName(displayName || participant.identity));
    }
    return () => {
      isMounted = false;
    };
  }, [avatarUrl, displayName, participant.identity]);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) return;

    const targetMember: User =
      activeGuild?.members?.find((m) => m.id === participant.identity) ||
      dmUser || {
        id: participant.identity,
        username: participant.name || 'Usuário',
        display_name: meta?.display_name || participant.name,
        avatar_url: avatarUrl || undefined,
        status: 'online',
      };

    handleUserContextMenu(e, targetMember, {
      onOpenUserProfile,
      onOpenDM,
      isVoiceActive: true,
      isVoiceMuted: isMuted,
      isScreenSharing,
      voiceChannelId: currentChannelId || undefined,
      contextType: activeGuild ? 'guild' : 'voice',
    });
  };

  return (
    <>
      <div
        ref={containerRef}
        onContextMenu={handleContextMenu}
        onDoubleClick={(e) => {
          e.stopPropagation();
          if ((isScreenSharing && isWatching) || hasCameraVideoTrack) {
            toggleFullscreen();
          }
        }}
        style={{
          backgroundColor: (isScreenSharing && isWatching) || hasCameraVideoTrack ? '#000000' : dominantBg,
        }}
        className={`relative rounded-2xl overflow-hidden flex flex-col items-center justify-center w-full h-full min-h-0 aspect-video border-2 transition-all duration-150 group cursor-pointer ${
          isSpeaking
            ? 'border-[#23a55a] shadow-[0_0_12px_rgba(35,165,90,0.35)] ring-1 ring-[#23a55a]'
            : 'border-transparent hover:border-white/10'
        }`}
      >
        {/* 1. If screen sharing and watching: render live screen video container */}
        {isScreenSharing && isWatching ? (
          <div className="relative w-full h-full flex items-center justify-center bg-black">
            <video
              ref={(el) => {
                videoRef.current = el;
                if (el && screenPub?.track && !screenPub.isMuted) {
                  attachVideoTrack(el, screenPub.track);
                }
              }}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-contain bg-black transition-opacity duration-200 ${
                hasScreenVideoTrack ? 'opacity-100' : 'opacity-0 absolute inset-0 pointer-events-none'
              }`}
            />
            {!hasScreenVideoTrack && (
              <div className="flex flex-col items-center justify-center gap-2.5 p-4 text-center">
                <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs font-medium text-gray-300">Carregando transmissão...</span>
              </div>
            )}
          </div>
        ) : hasCameraVideoTrack ? (
          /* 2. WebCam Video Stream */
          <>
            <video
              ref={(el) => {
                cameraRef.current = el;
                if (el && cameraPub?.track && !cameraPub.isMuted) {
                  attachVideoTrack(el, cameraPub.track);
                }
              }}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover bg-black"
            />
            <div className="absolute top-3 right-3 p-1 rounded-lg bg-black/60 backdrop-blur-sm text-brand-400 z-10">
              <Video className="w-3.5 h-3.5" />
            </div>
          </>
        ) : isScreenSharing && !isWatching ? (
          /* 3. Screen sharing active but user is NOT watching */
          <div className="flex flex-col items-center justify-center gap-3 p-4 text-center">
            <div className="relative">
              <div className="w-16 h-16 rounded-2xl bg-brand-500/20 border border-brand-500/40 flex items-center justify-center text-brand-400 shadow-xl">
                <Radio className="w-8 h-8 animate-pulse text-brand-400" />
              </div>
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-brand-500" />
              </span>
            </div>

            <div>
              <h3 className="text-sm font-bold text-white mb-0.5">{displayName}</h3>
              <p className="text-xs text-brand-400 font-medium">está transmitindo tela</p>
            </div>

            <button
              onClick={() => handleToggleWatch(true)}
              className="mt-1 bg-brand-500 hover:bg-brand-600 active:scale-95 text-white text-xs font-semibold px-4 py-2 rounded-xl transition-all shadow-lg shadow-brand-500/30 flex items-center gap-1.5 cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Assistir Transmissão</span>
            </button>
          </div>
        ) : (
          /* 4. Default Voice Participant Avatar View */
          <div className="flex flex-col items-center justify-center">
            <div className="w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 rounded-full overflow-hidden flex items-center justify-center font-bold text-white text-xl sm:text-2xl shadow-xl select-none bg-black/20">
              {avatarUrl ? (
                <img src={formatAssetUrl(avatarUrl)} alt={displayName} className="w-full h-full object-cover" />
              ) : (
                <span>{displayName?.[0]?.toUpperCase() || 'U'}</span>
              )}
            </div>
          </div>
        )}

        {/* Top Left Indicators: Screen & Camera Tags */}
        <div className="absolute top-3 left-3 flex items-center gap-1.5 z-10">
          {isScreenSharing && (
            <span className="bg-brand-500/90 backdrop-blur-md text-white text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 shadow-sm">
              <Monitor className="w-3 h-3" /> AO VIVO
            </span>
          )}
          {isScreenSharing && !isWatching && isMuted && (
            <span className="bg-dnd/90 backdrop-blur-md text-white text-[10px] font-bold p-1 rounded-md flex items-center shadow-sm" title="Microfone Mutado">
              <MicOff className="w-3 h-3" />
            </span>
          )}
        </div>

        {/* Top Right Unified Action Controls Bar (Hover) */}
        <div className="absolute top-3 right-3 flex items-center gap-1.5 z-30 opacity-0 group-hover:opacity-100 transition-opacity bg-black/75 backdrop-blur-md px-2 py-1 rounded-xl border border-white/10 shadow-lg">
          {/* Watch / Stop Live Controls */}
          {isScreenSharing && isWatching && (
            <>
              {!isLocal ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleWatch(false);
                  }}
                  className="p-1 text-gray-300 hover:text-white rounded hover:bg-white/10 text-xs flex items-center gap-1 font-medium transition-colors cursor-pointer"
                  title="Parar de assistir transmissão"
                >
                  <EyeOff className="w-3.5 h-3.5" />
                  <span className="text-[11px] hidden sm:inline">Parar de Ver</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    stopScreenShare();
                  }}
                  className="p-1 text-dnd hover:bg-dnd/20 rounded text-xs flex items-center gap-1 font-medium transition-colors cursor-pointer"
                  title="Encerrar compartilhamento"
                >
                  <Monitor className="w-3.5 h-3.5" />
                  <span className="text-[11px] hidden sm:inline">Parar Live</span>
                </button>
              )}
            </>
          )}

          {/* Fullscreen Button for Screen Share OR Camera Stream */}
          {((isScreenSharing && isWatching) || hasCameraVideoTrack) && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleFullscreen();
              }}
              className="p-1 text-gray-300 hover:text-white rounded hover:bg-white/10 transition-colors cursor-pointer"
              title="Tela cheia"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Volume Sliders for Remote participants */}
          {!isLocal && (
            <div className="relative flex items-center">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowVolumeSlider(!showVolumeSlider);
                }}
                className="p-1 rounded text-gray-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                title="Ajustar volumes"
              >
                {currentUVol === 0 && (!isScreenSharing || currentSVol === 0) ? (
                  <VolumeX className="w-3.5 h-3.5 text-dnd" />
                ) : (
                  <Volume2 className="w-3.5 h-3.5" />
                )}
              </button>

              {showVolumeSlider && (
                <>
                  <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setShowVolumeSlider(false); }} />
                  <div
                    className="absolute right-0 top-full mt-2 z-50 bg-background-darkest border border-white/10 p-3 rounded-2xl shadow-2xl w-56 flex flex-col gap-2.5 animate-in fade-in zoom-in-95 pointer-events-auto"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* User Mic Volume */}
                    <UserVolumeSlider userId={participant.identity} label="Volume de Voz" className="p-0" />

                    {/* Stream Audio Volume if Screen Sharing */}
                    {isScreenSharing && (
                      <div className="pt-2 border-t border-white/10">
                        <StreamVolumeSlider userId={participant.identity} label="Volume da Transmissão" className="p-0" />
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Bottom-left Discord-style Name Pill */}
        {!(isScreenSharing && !isWatching) && (
          <div className="absolute bottom-2.5 left-2.5 bg-[#111214]/85 backdrop-blur-md px-2.5 py-1 rounded-md flex items-center gap-1.5 text-xs font-semibold text-white shadow-md max-w-[85%] z-20 pointer-events-none">
            <span className="truncate">{displayName} {isLocal && '(Você)'}</span>
            {isMuted && (
              <MicOff className="w-3.5 h-3.5 text-dnd flex-shrink-0" />
            )}
          </div>
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
            className={`fixed ${isElectron ? 'top-8' : 'top-0'} inset-x-0 bottom-0 z-[45] bg-black flex items-center justify-center select-none`}
          >
            <video
              ref={fullscreenVideoRef}
              onContextMenu={handleContextMenu}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-contain bg-black cursor-default"
            />

            {/* Top Fullscreen Controls Overlay */}
            <div className="absolute top-4 left-4 right-4 flex items-center justify-between z-10 pointer-events-none">
              <div className="flex items-center gap-2 bg-black/75 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10 shadow-lg pointer-events-auto">
                <div className="w-5 h-5 rounded-full bg-brand-500 flex items-center justify-center text-[10px] font-bold text-white overflow-hidden">
                  {avatarUrl ? (
                    <img src={formatAssetUrl(avatarUrl)} alt="" className="w-full h-full object-cover" />
                  ) : (
                    displayName?.[0]?.toUpperCase() || 'U'
                  )}
                </div>
                <span className="text-sm font-semibold text-white">{displayName}</span>
                {isScreenSharing && (
                  <span className="bg-brand-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1">
                    <Monitor className="w-3 h-3" /> AO VIVO
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 bg-black/75 backdrop-blur-md px-2 py-1.5 rounded-xl border border-white/10 shadow-lg pointer-events-auto">
                {/* 1. Stop Watching / Stop Screen Share (Keeps label) */}
                {isScreenSharing && isWatching && (
                  <>
                    {!isLocal ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFullscreen();
                          handleToggleWatch(false);
                        }}
                        className="p-1.5 text-gray-300 hover:text-white rounded-lg hover:bg-white/10 text-xs flex items-center gap-1.5 font-medium transition-colors cursor-pointer"
                        title="Parar de assistir transmissão"
                      >
                        <EyeOff className="w-4 h-4" />
                        <span className="text-xs">Parar de Ver</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFullscreen();
                          stopScreenShare();
                        }}
                        className="p-1.5 text-dnd hover:bg-dnd/20 rounded-lg text-xs flex items-center gap-1.5 font-medium transition-colors cursor-pointer"
                        title="Encerrar compartilhamento"
                      >
                        <Monitor className="w-4 h-4" />
                        <span className="text-xs">Parar Live</span>
                      </button>
                    )}
                  </>
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
                {!isLocal && (
                  <div className="relative flex items-center">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowVolumeSlider(!showVolumeSlider);
                      }}
                      className="p-1.5 rounded-lg text-gray-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer flex items-center justify-center text-xs"
                      title="Ajustar volumes"
                    >
                      {currentUVol === 0 && (!isScreenSharing || currentSVol === 0) ? (
                        <VolumeX className="w-4 h-4 text-dnd" />
                      ) : (
                        <Volume2 className="w-4 h-4" />
                      )}
                    </button>

                    {showVolumeSlider && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setShowVolumeSlider(false); }} />
                        <div
                          className="absolute right-0 top-full mt-2 z-50 bg-background-darkest border border-white/10 p-3 rounded-2xl shadow-2xl w-60 flex flex-col gap-2.5 animate-in fade-in zoom-in-95 pointer-events-auto"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <UserVolumeSlider userId={participant.identity} label="Volume de Voz" className="p-0" />
                          {isScreenSharing && (
                            <div className="pt-2 border-t border-white/10">
                              <StreamVolumeSlider userId={participant.identity} label="Volume da Transmissão" className="p-0" />
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

