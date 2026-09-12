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
  const { menu, openContextMenu, closeContextMenu } = useContextMenu();
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

  // Handle Screen Share video track attachment
  useEffect(() => {
    const el = videoRef.current;
    if (isWatching && hasScreenVideoTrack && screenPub?.track && el) {
      try {
        screenPub.track.attach(el);
        el.play().catch(() => {});
      } catch (err) {
        console.warn('[ParticipantCard] Error attaching screen video track:', err);
      }
    }

    if (screenPub instanceof RemoteTrackPublication) {
      try {
        screenPub.setSubscribed(isWatching);
      } catch {}
    }

    return () => {
      if (el && screenPub?.track) {
        try {
          screenPub.track.detach(el);
        } catch {}
      }
    };
  }, [screenPub?.track, hasScreenVideoTrack, isWatching]);

  // Handle Camera track attachment
  useEffect(() => {
    const el = cameraRef.current;
    if (hasCameraVideoTrack && cameraPub?.track && el) {
      try {
        cameraPub.track.attach(el);
        el.play().catch(() => {});
      } catch (err) {
        console.warn('[ParticipantCard] Error attaching camera track:', err);
      }
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
  }, [cameraPub?.track, hasCameraVideoTrack]);

  // Handle Fullscreen video attachment
  useEffect(() => {
    const el = fullscreenVideoRef.current;
    if (!isFullscreen || !el) return;

    const track = (isScreenSharing && isWatching && screenPub?.track) || (hasCameraVideoTrack && cameraPub?.track);
    if (track) {
      try {
        track.attach(el);
        el.play().catch(() => {});
      } catch {}
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
    if (!activeGuild || !user) return;

    const targetMember: User =
      activeGuild.members?.find((m) => m.id === participant.identity) || {
        id: participant.identity,
        username: participant.name || 'Usuário',
        display_name: meta?.display_name || participant.name,
        avatar_url: avatarUrl || undefined,
        status: 'online',
      };

    const isMe = targetMember.id === user.id;
    const isTargetOwner = targetMember.id === activeGuild.owner_id;
    const isCurrentOwner = activeGuild.owner_id === user.id;

    // Calculate permissions
    const currentUserRoles = activeGuild.members?.find((m) => m.id === user.id)?.roles || [];
    let currentUserPerms = 0;
    let currentUserHighestPos = 999999;
    currentUserRoles.forEach((r) => {
      currentUserPerms |= Number(r.permissions || 0);
      if (r.position < currentUserHighestPos) {
        currentUserHighestPos = r.position;
      }
    });

    const hasAdmin = isCurrentOwner || (currentUserPerms & Permissions.ADMINISTRATOR) !== 0;
    const canManageRoles = isCurrentOwner || hasAdmin || (currentUserPerms & Permissions.MANAGE_ROLES) !== 0;
    const canKick = isCurrentOwner || hasAdmin || (currentUserPerms & Permissions.KICK_MEMBERS) !== 0;
    const canBan = isCurrentOwner || hasAdmin || (currentUserPerms & Permissions.BAN_MEMBERS) !== 0;
    const canMute = isCurrentOwner || hasAdmin || (currentUserPerms & Permissions.MUTE_MEMBERS) !== 0;

    let targetHighestPos = 999999;
    (targetMember.roles || []).forEach((r) => {
      if (r.position < targetHighestPos) {
        targetHighestPos = r.position;
      }
    });

    const isHierarchyAllowed = isCurrentOwner || isMe || currentUserHighestPos < targetHighestPos;
    const guildRoles = activeGuild.roles || [];

    const items: ContextMenuItem[] = [
      {
        label: 'Ver Perfil',
        icon: <UserIcon className="w-4 h-4" />,
        onClick: () => onOpenUserProfile?.(targetMember, { x: e.clientX, y: e.clientY }),
      },
      ...(!isMe
        ? [
            {
              label: 'Enviar Mensagem',
              icon: <MessageSquare className="w-4 h-4" />,
              onClick: async () => {
                if (onOpenDM) {
                  onOpenDM(targetMember.id);
                } else {
                  await openDMWithUser(targetMember.id);
                }
              },
            },
          ]
        : []),
    ];

    // Voice Call Moderation (Admin / Host)
    if (currentChannelId && (canMute || isCurrentOwner || hasAdmin)) {
      items.push({ label: '', separator: true });

      items.push({
        label: isMuted ? 'Desmutar Microfone na Call' : 'Mutar Microfone na Call',
        icon: isMuted ? <Mic className="w-4 h-4 text-online" /> : <MicOff className="w-4 h-4 text-amber-400" />,
        onClick: async () => {
          await api.channels.adminUpdateVoiceState(currentChannelId, targetMember.id, {
            is_muted: !isMuted,
          });
        },
      });

      items.push({
        label: 'Ensurdecer na Call',
        icon: <Headphones className="w-4 h-4 text-amber-400" />,
        onClick: async () => {
          await api.channels.adminUpdateVoiceState(currentChannelId, targetMember.id, {
            is_deafened: true,
          });
        },
      });

      if (!isMe) {
        items.push({
          label: 'Desconectar da Call',
          icon: <PhoneOff className="w-4 h-4 text-dnd" />,
          onClick: async () => {
            await api.channels.adminUpdateVoiceState(currentChannelId, targetMember.id, {
              disconnect: true,
            });
          },
        });
      }
    }

    // User & Stream Volume Sliders (0 - 200%, default 100%, saved locally)
    if (!isMe) {
      items.push({ label: '', separator: true });
      items.push({
        label: 'Volume de Usuário',
        customRender: <UserVolumeSlider userId={targetMember.id} />,
      });

      if (isScreenSharing) {
        items.push({
          label: 'Volume da Transmissão',
          customRender: <StreamVolumeSlider userId={targetMember.id} />,
        });
      }
    }

    // Change Roles Submenu
    if (canManageRoles && guildRoles.length > 0 && (isCurrentOwner || isMe || isHierarchyAllowed)) {
      const roleSubItems: ContextMenuItem[] = guildRoles
        .filter((role) => role.name !== '@everyone')
        .map((role) => {
        const hasRole = (targetMember.roles || []).some((r) => r.id === role.id);
        return {
          label: role.name,
          icon: hasRole ? (
            <Check className="w-3.5 h-3.5 text-online" />
          ) : (
            <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: role.color }} />
          ),
          onClick: async () => {
            if (hasRole) {
              await removeRole(activeGuild.id, targetMember.id, role.id);
            } else {
              await assignRole(activeGuild.id, targetMember.id, role.id);
            }
          },
        };
      });

      items.push({
        label: 'Alterar Cargos',
        icon: <Shield className="w-4 h-4 text-brand-400" />,
        subItems: roleSubItems,
      });
    }

    // Mute/Timeout Submenu
    if (canMute && (isCurrentOwner || isMe || isHierarchyAllowed)) {
      const isServerMuted = targetMember.muted_until && new Date(targetMember.muted_until) > new Date();

      const muteSubItems: ContextMenuItem[] = [
        {
          label: '15 minutos',
          icon: <Clock className="w-3.5 h-3.5 text-gray-400" />,
          onClick: () => muteMember(activeGuild.id, targetMember.id, 900),
        },
        {
          label: '1 hora',
          icon: <Clock className="w-3.5 h-3.5 text-gray-400" />,
          onClick: () => muteMember(activeGuild.id, targetMember.id, 3600),
        },
        {
          label: '24 horas',
          icon: <Clock className="w-3.5 h-3.5 text-gray-400" />,
          onClick: () => muteMember(activeGuild.id, targetMember.id, 86400),
        },
        {
          label: '1 semana',
          icon: <Clock className="w-3.5 h-3.5 text-gray-400" />,
          onClick: () => muteMember(activeGuild.id, targetMember.id, 604800),
        },
        {
          label: 'Permanente',
          icon: <VolumeX className="w-3.5 h-3.5 text-amber-400" />,
          onClick: () => muteMember(activeGuild.id, targetMember.id, -1),
        },
        ...(isServerMuted
          ? [
              { label: '', separator: true },
              {
                label: 'Remover Silenciamento',
                icon: <Volume2 className="w-3.5 h-3.5 text-online" />,
                onClick: () => muteMember(activeGuild.id, targetMember.id, 0),
              },
            ]
          : []),
      ];

      items.push({
        label: isServerMuted ? 'Membro Silenciado' : 'Silenciar no Servidor',
        icon: <VolumeX className={`w-4 h-4 ${isServerMuted ? 'text-dnd' : 'text-gray-400'}`} />,
        subItems: muteSubItems,
      });
    }

    // Kick and Ban
    if (!isMe && !isTargetOwner && isHierarchyAllowed) {
      if (canKick) {
        items.push({
          label: `Expulsar ${targetMember.display_name || targetMember.username}`,
          icon: <UserMinus className="w-4 h-4" />,
          variant: 'danger',
          onClick: async () => {
            if (confirm(`Tem certeza que deseja expulsar ${targetMember.display_name || targetMember.username}?`)) {
              await kickMember(activeGuild.id, targetMember.id);
            }
          },
        });
      }

      if (canBan) {
        items.push({
          label: `Banir ${targetMember.display_name || targetMember.username}`,
          icon: <Ban className="w-4 h-4" />,
          variant: 'danger',
          onClick: async () => {
            const reason = prompt(`Motivo do banimento para ${targetMember.display_name || targetMember.username} (opcional):`);
            if (reason !== null) {
              await banMember(activeGuild.id, targetMember.id, reason);
            }
          },
        });
      }
    }

    openContextMenu(e, items, targetMember.display_name || targetMember.username);
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
        {/* 1. If screen sharing and watching: render live screen video */}
        {isScreenSharing && isWatching && hasScreenVideoTrack ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-contain bg-black"
          />
        ) : hasCameraVideoTrack ? (
          /* 2. WebCam Video Stream */
          <>
            <video
              ref={cameraRef}
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
    </>
  );
};

