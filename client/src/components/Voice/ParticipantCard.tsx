import React, { useEffect, useRef, useState } from 'react';
import { Participant, Track, RemoteTrackPublication } from 'livekit-client';
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
import { api } from '../../lib/api';
import { ContextMenu, useContextMenu, ContextMenuItem } from '../ContextMenu';

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
    participantVolumes,
    setParticipantVolume,
    watchedParticipantId,
    setWatchedParticipant,
  } = useVoiceStore();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const cameraRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);

  const isSpeaking = speakingUserIds.includes(participant.identity);
  const isLocal = participant.isLocal;

  // Resolve participant profile avatar
  const meta = (() => {
    try {
      return participant.metadata ? JSON.parse(participant.metadata) : null;
    } catch {
      return null;
    }
  })();

  const avatarUrl =
    (isLocal ? user?.avatar_url : null) ||
    meta?.avatar_url ||
    activeGuild?.members?.find((m) => m.id === participant.identity)?.avatar_url ||
    (participant.identity === user?.id ? user?.avatar_url : null);

  // Check audio mute status
  const audioPub = participant.getTrackPublication(Track.Source.Microphone);
  const isMuted = !participant.isMicrophoneEnabled && (!audioPub || audioPub.isMuted);

  // Check video & screen share track
  const screenPub = participant.getTrackPublication(Track.Source.ScreenShare);
  const cameraPub = participant.getTrackPublication(Track.Source.Camera);

  const isScreenSharing = participant.isScreenShareEnabled || !!screenPub;
  const isCameraEnabled = participant.isCameraEnabled || (!!cameraPub?.track && !cameraPub.isMuted);
  const hasScreenVideoTrack = !!screenPub?.track && !screenPub.isMuted;
  const hasCameraVideoTrack = !!cameraPub?.track && !cameraPub.isMuted;

  const currentVolume = participantVolumes[participant.identity] ?? 1;
  const isWatching = (isLocal && isScreenSharing) || watchedParticipantId === participant.identity;

  // Handle Screen Share track attachment
  useEffect(() => {
    const el = videoRef.current;
    if (isWatching && hasScreenVideoTrack && screenPub?.track && el) {
      screenPub.track.attach(el);
      el.play().catch(() => {});
    }

    if (screenPub instanceof RemoteTrackPublication) {
      screenPub.setSubscribed(isWatching);
    }

    return () => {
      if (el && screenPub?.track) {
        screenPub.track.detach(el);
      }
    };
  }, [screenPub?.track, hasScreenVideoTrack, isWatching]);

  // Handle Camera track attachment
  useEffect(() => {
    const el = cameraRef.current;
    if (hasCameraVideoTrack && cameraPub?.track && el) {
      cameraPub.track.attach(el);
      el.play().catch(() => {});
    }

    if (cameraPub instanceof RemoteTrackPublication) {
      cameraPub.setSubscribed(true);
    }

    return () => {
      if (el && cameraPub?.track) {
        cameraPub.track.detach(el);
      }
    };
  }, [cameraPub?.track, hasCameraVideoTrack]);

  const handleToggleWatch = (watch: boolean) => {
    setWatchedParticipant(watch ? participant.identity : null);
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const displayName = participant.name || participant.identity;

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

    // User Volume Slider (0 - 200%, default 100%, saved locally)
    if (!isMe) {
      items.push({ label: '', separator: true });
      const currentVol = participantVolumes[targetMember.id] ?? 1;
      items.push({
        label: 'Volume de Usuário',
        customRender: (
          <div className="px-2.5 py-1.5 flex flex-col gap-1.5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between text-xs font-semibold text-gray-300">
              <div className="flex items-center gap-1.5">
                {currentVol === 0 ? (
                  <VolumeX className="w-3.5 h-3.5 text-dnd" />
                ) : (
                  <Volume2 className="w-3.5 h-3.5 text-gray-400" />
                )}
                <span>Volume de Usuário</span>
              </div>
              <span className="text-brand-400 font-mono text-[11px] font-bold">
                {Math.round(currentVol * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={2}
              step={0.01}
              value={currentVol}
              onChange={(e) => setParticipantVolume(targetMember.id, parseFloat(e.target.value))}
              className="w-full accent-brand-500 h-1.5 bg-background-light rounded-lg cursor-pointer"
            />
          </div>
        ),
      });
    }

    // Change Roles Submenu
    if (canManageRoles && guildRoles.length > 0 && (isCurrentOwner || isMe || isHierarchyAllowed)) {
      items.push({ label: '', separator: true });
      const roleSubItems: ContextMenuItem[] = guildRoles.map((role) => {
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
        className={`relative bg-background-darkest rounded-2xl overflow-hidden flex flex-col items-center justify-center min-h-[180px] aspect-video border-2 transition-all duration-200 group cursor-pointer ${
          isSpeaking
            ? 'border-online shadow-lg shadow-online/20 ring-2 ring-online/40'
            : 'border-white/5 hover:border-white/15'
        }`}
      >
        {/* 1. If screen sharing and watching: render live screen video */}
        {isScreenSharing && isWatching && hasScreenVideoTrack ? (
          <video
            ref={(el) => {
              videoRef.current = el;
              if (el && screenPub?.track) {
                screenPub.track.attach(el);
                el.play().catch(() => {});
              }
            }}
            autoPlay
            playsInline
            className="w-full h-full object-contain bg-black"
          />
        ) : hasCameraVideoTrack ? (
          /* 2. WebCam Video Stream */
          <>
            <video
              ref={(el) => {
                cameraRef.current = el;
                if (el && cameraPub?.track) {
                  cameraPub.track.attach(el);
                  el.play().catch(() => {});
                }
              }}
              autoPlay
              playsInline
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
          <div className="flex flex-col items-center justify-center gap-2">
            <div
              style={
                isSpeaking
                  ? { boxShadow: '0 0 0 3px #23a55a' }
                  : undefined
              }
              className={`w-16 h-16 md:w-20 md:h-20 rounded-full bg-brand-500 flex items-center justify-center font-bold text-white text-xl shadow-lg transition-transform ${
                isSpeaking ? 'scale-105' : ''
              }`}
            >
              {avatarUrl ? (
                <img src={avatarUrl} alt={displayName} className="w-full h-full rounded-full object-cover" />
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
        </div>

        {/* Top Right Unified Action Controls Bar (Hover) */}
        <div className="absolute top-3 right-3 flex items-center gap-1.5 z-30 opacity-0 group-hover:opacity-100 transition-opacity bg-black/75 backdrop-blur-md px-2 py-1 rounded-xl border border-white/10 shadow-lg">
          {/* Watch / Stop Live Controls & Fullscreen */}
          {isScreenSharing && isWatching && hasScreenVideoTrack && (
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

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFullscreen();
                }}
                className="p-1 text-gray-300 hover:text-white rounded hover:bg-white/10 transition-colors cursor-pointer"
                title={isFullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
              >
                {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              </button>
            </>
          )}

          {/* Volume Slider for Remote participants */}
          {!isLocal && (
            <div className="relative flex items-center">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowVolumeSlider(!showVolumeSlider);
                }}
                className="p-1 rounded text-gray-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                title="Ajustar volume do participante"
              >
                {currentVolume === 0 ? (
                  <VolumeX className="w-3.5 h-3.5 text-dnd" />
                ) : (
                  <Volume2 className="w-3.5 h-3.5" />
                )}
              </button>

              {showVolumeSlider && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowVolumeSlider(false)} />
                  <div className="absolute right-0 top-full mt-2 z-50 bg-background-darkest border border-white/10 p-3 rounded-2xl shadow-2xl w-40 flex flex-col gap-2 animate-in fade-in zoom-in-95">
                    <div className="flex items-center justify-between text-xs font-semibold text-gray-300">
                      <span>Volume</span>
                      <span className="text-brand-400">{Math.round(currentVolume * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={2}
                      step={0.05}
                      value={currentVolume}
                      onChange={(e) => setParticipantVolume(participant.identity, parseFloat(e.target.value))}
                      className="w-full accent-brand-500 h-1.5 bg-background-light rounded-lg cursor-pointer"
                    />
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Bottom Overlay Bar: Name & Mic Status */}
        <div className="absolute bottom-2 left-2 right-2 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-xl flex items-center justify-between text-xs text-white z-10">
          <span className="font-semibold truncate max-w-[140px] md:max-w-[200px]">
            {displayName} {isLocal && '(Você)'}
          </span>

          <div className="flex items-center gap-1.5">
            {isMuted && (
              <div className="bg-dnd/90 p-1 rounded-full text-white" title="Microfone Mutado">
                <MicOff className="w-3 h-3" />
              </div>
            )}
          </div>
        </div>
      </div>

      <ContextMenu menu={menu} onClose={closeContextMenu} />
    </>
  );
};
