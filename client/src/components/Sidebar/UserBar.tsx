import React, { useState, useRef, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Mic, MicOff, Headphones, Settings, PhoneOff, Monitor, MonitorOff, Video, VideoOff, Gamepad2, ChevronDown } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useVoiceStore } from '../../stores/voiceStore';
import { useGuildStore } from '../../stores/guildStore';
import { formatAssetUrl } from '../../lib/api';
import { livekit } from '../../lib/livekit';
import { ContextMenu, useContextMenu, ContextMenuItem } from '../ContextMenu';
import { UserAvatar } from '../Common/UserAvatar';
import { VoiceDiagnosticModal } from '../Voice/VoiceDiagnosticModal';
import { VoiceConnectionPopout } from '../Voice/VoiceConnectionPopout';
import { useActivityElapsedTime, getActivityColorClass } from '../../utils/userActivity';
import { getFormattedUsername, useStreamerModeStore } from '../../stores/streamerModeStore';
import { findBestSourceForGameFamily } from '../../utils/gameFamilyManager';
import { useSettingsStore } from '../../stores/settingsStore';
import { User, UserProfilePosition, Guild } from '../../types';
import { UserBarContextMenuControls } from './UserBarContextMenu';
import { AudioDeviceDropup } from './AudioDeviceDropup';
import { HeadphonesOff } from '../Common/HeadphonesOff';
import { ModalButton } from '@/components/ui/modal-button';

interface UserBarProps {
  onOpenSettings: (tab?: string) => void;
  onOpenScreenShare: () => void;
  onOpenUserProfile?: (user: User, position?: UserProfilePosition, guild?: Guild | null) => void;
}

export const UserBar: React.FC<UserBarProps> = ({ onOpenSettings, onOpenScreenShare, onOpenUserProfile }) => {
  const { user, updateProfile } = useAuthStore();
  const censorUsernames = useStreamerModeStore((s) => s.enabled && s.censorUsernames);
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [showVoicePopout, setShowVoicePopout] = useState(false);
  const [showDiagnostic, setShowDiagnostic] = useState(false);
  const [showMicDropup, setShowMicDropup] = useState(false);
  const [showDeafenDropup, setShowDeafenDropup] = useState(false);
  const [pingMs, setPingMs] = useState<number | null>(null);
  const [signalTooltipPos, setSignalTooltipPos] = useState<{ left: number; top: number } | null>(null);
  const voiceBarRef = useRef<HTMLDivElement>(null);
  const signalIconRef = useRef<HTMLDivElement>(null);
  const micAnchorRef = useRef<HTMLDivElement>(null);
  const deafenAnchorRef = useRef<HTMLDivElement>(null);
  const { menu, openContextMenu, closeContextMenu } = useContextMenu();
  const {
    voiceType,
    currentChannelId,
    dmRoomId,
    dmRecipient,
    dmGroupId,
    dmGroup,
    isConnected,
    isConnecting,
    isMuted,
    isDeafened,
    isScreensharing,
    isCameraOn,
    toggleMute,
    toggleDeafen,
    toggleCamera,
    leaveVoice,
    startScreenShare,
    stopScreenShare,
    participants,
    speakingUserIds,
  } = useVoiceStore();

  const showVoiceUsersInBar = useSettingsStore((state) => state.showVoiceUsersInBar);

  const { activeGuild, selectChannel } = useGuildStore();
  const activeVoiceChannel = activeGuild?.channels?.find((c) => c.id === currentChannelId);

  const otherParticipants = useMemo(() => {
    return (participants || []).filter((p) => !p.isLocal && p.identity !== user?.id);
  }, [participants, user?.id]);

  const getParticipantUser = (p: any) => {
    let meta: any = null;
    try {
      meta = p.metadata ? JSON.parse(p.metadata) : null;
    } catch {}

    const guildMember = activeGuild?.members?.find((m) => m.id === p.identity);
    const dmUser = dmRecipient?.id === p.identity ? dmRecipient : null;
    const groupMember = dmGroup?.members?.find((m) => m.id === p.identity);

    const resolved = guildMember || dmUser || groupMember || null;
    const displayName =
      resolved?.display_name ||
      resolved?.username ||
      meta?.display_name ||
      meta?.username ||
      p.name ||
      'Usuário';

    return {
      user: (resolved || {
        id: p.identity,
        username: displayName,
        avatar_url: meta?.avatar_url,
        status: 'online',
      }) as User,
      displayName,
    };
  };

  const handleUserBarContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    openContextMenu(
      { clientX: e.clientX, clientY: e.clientY },
      [
        {
          id: 'userbar-voice-controls',
          label: 'Configurações de Voz',
          customRender: (
            <UserBarContextMenuControls
              onOpenSettings={() => {
                closeContextMenu();
                onOpenSettings();
              }}
            />
          ),
        },
      ],
      'Opções de Voz e Áudio'
    );
  };

  const voiceTitle = useMemo(() => {
    if (voiceType === 'guild') {
      return activeVoiceChannel?.name || 'Canal de Voz';
    }
    if (voiceType === 'dm') {
      return getFormattedUsername(dmRecipient?.display_name || dmRecipient?.username || 'Chamada 1:1');
    }
    if (voiceType === 'group') {
      return dmGroup?.name || 'Chamada em Grupo';
    }
    return 'Voz Conectada';
  }, [voiceType, activeVoiceChannel, dmRecipient, dmGroup, censorUsernames]);

  const voiceSubtitle = useMemo(() => {
    if (voiceType === 'guild') {
      return activeGuild?.name || 'Servidor';
    }
    if (voiceType === 'dm') {
      return 'Em chamada direta';
    }
    if (voiceType === 'group') {
      return 'Grupo de DM';
    }
    return 'ZeroVC';
  }, [voiceType, activeGuild]);

  const isInVoice = Boolean(isConnected || isConnecting);

  useEffect(() => {
    if (!isConnected || isConnecting) {
      setPingMs(null);
      setSignalTooltipPos(null);
      return;
    }
    let cancelled = false;
    const fetchPing = async () => {
      try {
        const stats = await livekit.getDiagnosticStats();
        if (!cancelled && stats.isConnected) {
          setPingMs(stats.pingMs);
        }
      } catch {}
    };
    void fetchPing();
    const timer = setInterval(fetchPing, 3000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [isConnected, isConnecting]);

  const signalQuality = useMemo(() => {
    if (isConnecting || pingMs === null) {
      return {
        bars: 2,
        colorClass: 'text-amber-400 animate-pulse',
        label: isConnecting ? 'Conectando...' : 'Medindo ping...',
      };
    }
    if (pingMs < 60) {
      return { bars: 4, colorClass: 'text-online', label: `${pingMs} ms` };
    }
    if (pingMs < 120) {
      return { bars: 3, colorClass: 'text-online', label: `${pingMs} ms` };
    }
    if (pingMs < 220) {
      return { bars: 2, colorClass: 'text-amber-400', label: `${pingMs} ms` };
    }
    return { bars: 1, colorClass: 'text-dnd', label: `${pingMs} ms` };
  }, [isConnecting, pingMs]);
  const isGameActive = Boolean(
    user?.status !== 'offline' &&
    user?.custom_activity &&
    user.custom_activity.name !== 'OBS Studio' &&
    !user.custom_activity.name.toLowerCase().includes('obs') &&
    user?.show_activity_status !== false &&
    user.custom_activity.type === 'playing' &&
    user.custom_activity.name
  );

  const userActivityObj = useMemo(() => {
    if (!user?.custom_activity) return null;
    return {
      kind: 'game' as const,
      type: user.custom_activity.type,
      header: 'Jogando',
      name: user.custom_activity.name,
      start_time: user.custom_activity.start_time,
    };
  }, [user?.custom_activity]);

  const elapsedGameTime = useActivityElapsedTime(userActivityObj, user?.id);

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'online': return 'bg-online';
      case 'idle': return 'bg-idle';
      case 'dnd': return 'bg-dnd';
      default: return 'bg-offline';
    }
  };

  const getStatusLabel = (status?: string) => {
    switch (status) {
      case 'online': return 'Disponível';
      case 'idle': return 'Ausente';
      case 'dnd': return 'Não Perturbe';
      default: return 'Invisível';
    }
  };

  const handleSetStatus = async (newStatus: 'online' | 'idle' | 'dnd' | 'offline') => {
    try {
      await updateProfile({ status: newStatus });
      setShowStatusMenu(false);
    } catch (err) {
      console.error('Failed to change status:', err);
    }
  };

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
          icon: <MonitorOff className="w-4 h-4" />,
          variant: 'danger',
          onClick: () => {
            stopScreenShare();
          },
        },
      ];
      openContextMenu(
        { clientX: rect.left, clientY: rect.top - 10 },
        items,
        'Transmissão de Tela'
      );
    } else {
      onOpenScreenShare();
    }
  };

  const handleStreamGameClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (isScreensharing) {
      const rect = e.currentTarget.getBoundingClientRect();
      const items: ContextMenuItem[] = [
        {
          id: 'switch-screen',
          label: 'Trocar tela / janela',
          icon: <Monitor className="w-4 h-4" />,
          onClick: () => {
            onOpenScreenShare();
          },
        },
        {
          id: 'stop-screen',
          label: 'Parar transmissão',
          icon: <MonitorOff className="w-4 h-4" />,
          variant: 'danger',
          onClick: () => {
            stopScreenShare();
          },
        },
      ];
      openContextMenu(
        { clientX: rect.left, clientY: rect.top - 10 },
        items,
        'Transmissão'
      );
      return;
    }

    const gameName = user?.custom_activity?.name;
    const isElectron = Boolean(typeof window !== 'undefined' && (window as any).electronAPI?.getScreenSources);

    if (isElectron && gameName) {
      try {
        const sources = await (window as any).electronAPI.getScreenSources({ thumbnail: false, fetchWindowIcons: false });
        const windowSources = sources.filter((s: any) => s.id?.startsWith('window:'));

        // 1. Intelligent Game Family Priority (Partida in-game > Launcher/Lobby)
        const familyMatch = findBestSourceForGameFamily(gameName, sources);
        if (familyMatch) {
          console.log('[UserBar] Auto-streaming game family prioritized window:', familyMatch.source.name, familyMatch.source.id);
          try {
            await startScreenShare(familyMatch.source.id, { resolution: '720p', fps: 30, includeAudio: true }, familyMatch.family);
            return;
          } catch (shareErr) {
            console.warn('[UserBar] Direct window screen share failed, falling back to modal:', shareErr);
          }
        }

        const cleanGame = gameName.toLowerCase().trim();

        // 2. Direct or partial window title match
        let matched = windowSources.find((s: any) => {
          const sName = (s.name || '').toLowerCase().trim();
          return sName.includes(cleanGame) || cleanGame.includes(sName);
        });

        // 3. Word-based match fallback
        if (!matched) {
          const gameWords = cleanGame.split(/\s+/).filter((w: string) => w.length > 2);
          if (gameWords.length > 0) {
            matched = windowSources.find((s: any) => {
              const sName = (s.name || '').toLowerCase();
              return gameWords.some((gw: string) => sName.includes(gw));
            });
          }
        }

        if (matched) {
          console.log('[UserBar] Auto-streaming detected game window with audio:', matched.name, matched.id);
          try {
            await startScreenShare(matched.id, { resolution: '720p', fps: 30, includeAudio: true });
            return;
          } catch (shareErr) {
            console.warn('[UserBar] Direct matched window screen share failed, falling back to modal:', shareErr);
          }
        }
      } catch (err) {
        console.warn('[UserBar] Error auto-detecting game window source:', err);
      }
    }

    // Fallback if not in Electron or matching window not found
    onOpenScreenShare();
  };

  return (
    <div
      onContextMenu={handleUserBarContextMenu}
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 0.75rem)' }}
      className="w-full min-w-0 max-w-full flex-shrink-0 overflow-hidden flex flex-col border-r border-black/20 select-none relative px-2 md:px-2.5 pt-0"
    >
      {/* Background Columns: 72px ServerList Darkest + Remainder ChannelList Darker */}
      <div className="absolute inset-0 flex pointer-events-none -z-10">
        <div className="w-[72px] h-full bg-background-darkest border-r border-black/20 hidden md:block flex-shrink-0" />
        <div className="flex-1 h-full bg-background-darker" />
      </div>

      {/* Quick Status Menu Popover */}
      {showStatusMenu && (
        <>
          <div
            className="fixed inset-0 z-[99]"
            onClick={(e) => {
              e.stopPropagation();
              setShowStatusMenu(false);
            }}
          />
          <div className="fixed bottom-20 left-3 sm:left-4 z-[100] bg-background-darkest border border-white/10 rounded-2xl p-2 shadow-2xl w-52 animate-in fade-in zoom-in-95">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-2 py-1 block">
              Definir Status
            </span>
            <div className="space-y-1 mt-1">
              {(['online', 'idle', 'dnd', 'offline'] as const).map((st) => (
                <button
                  key={st}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSetStatus(st);
                  }}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    user?.status === st ? 'bg-brand-500 text-white' : 'text-gray-300 hover:bg-white/5'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${getStatusColor(st)}`} />
                  <span>{getStatusLabel(st)}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Full WebRTC Technical Diagnostics Modal */}
      <VoiceDiagnosticModal
        isOpen={showDiagnostic}
        onClose={() => setShowDiagnostic(false)}
      />

      {/* Unified User, Voice & Game Container */}
      <div
        ref={voiceBarRef}
        className={`w-full min-w-0 max-w-full bg-background-darkest border border-white/5 rounded-2xl shadow-inner overflow-visible relative transition-all duration-200 ${
          isInVoice || isGameActive
            ? 'p-2 md:p-2.5 flex flex-col gap-2'
            : 'h-[48px] md:h-[56px] min-h-[48px] md:min-h-[56px] px-2 md:px-2.5 flex items-center justify-between'
        }`}
      >
        {/* Floating Voice Connection Popout */}
        {isInVoice && (
          <VoiceConnectionPopout
            isOpen={showVoicePopout}
            onClose={() => setShowVoicePopout(false)}
            onOpenDiagnostic={() => setShowDiagnostic(true)}
            channelName={activeVoiceChannel?.name}
            serverName={activeGuild?.name}
            anchorRef={voiceBarRef}
          />
        )}

        {/* 1. Game Activity Preview Bar (Top Tier - Expands upwards when game is detected) */}
        {isGameActive && user?.custom_activity && (
          <div className="flex items-center justify-between gap-2 px-1 py-1 animate-in fade-in slide-in-from-bottom-2 duration-200 min-w-0">
            <div className="flex items-center gap-2.5 min-w-0 flex-1 overflow-hidden">
              {user.custom_activity.icon_url ? (
                <img
                  src={formatAssetUrl(user.custom_activity.icon_url)}
                  alt={user.custom_activity.name}
                  className="w-8 h-8 rounded-lg object-cover bg-background-darkest flex-shrink-0 border border-white/10 shadow-sm"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
              ) : (
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center flex-shrink-0 shadow-sm">
                  <Gamepad2 className="w-4 h-4" />
                </div>
              )}
              <div className="flex flex-col min-w-0 flex-1 overflow-hidden">
                <span className="text-xs font-bold text-white truncate leading-tight">
                  {user.custom_activity.name}
                </span>
                <span className={`text-[10px] truncate leading-tight mt-0.5 font-medium ${
                  elapsedGameTime ? getActivityColorClass(userActivityObj) : 'text-gray-400'
                }`}>
                  {elapsedGameTime || user.custom_activity.details || user.custom_activity.state || 'Jogando agora'}
                </span>
              </div>
            </div>

            {/* Screen Share / Stream Button if connected to a voice call */}
            {isInVoice && (
              <button
                type="button"
                onClick={handleStreamGameClick}
                className={`p-1.5 rounded-lg flex items-center justify-center transition-all cursor-pointer shadow-sm active:scale-95 flex-shrink-0 ${
                  isScreensharing
                    ? 'bg-brand-500 text-white shadow-brand-500/20 hover:bg-brand-600'
                    : 'bg-white/5 hover:bg-brand-500 hover:text-white text-gray-300 border border-white/5'
                }`}
                title={isScreensharing ? 'Opções de transmissão' : `Transmitir ${user.custom_activity.name} com som`}
              >
                <Monitor className="w-4 h-4" />
              </button>
            )}
          </div>
        )}

        {/* Divider between Game Activity and Voice Connection if both are active */}
        {isGameActive && isInVoice && (
          <div className="h-[1px] bg-white/5 -mx-1" />
        )}

        {/* 2. Voice Connection Status Bar (Middle Tier - Shown ONLY when connected/connecting) */}
        {isInVoice && (
          <>
            <div className="flex items-center justify-between min-w-0 gap-1.5 animate-in fade-in slide-in-from-bottom-1 duration-150">
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  setShowVoicePopout(!showVoicePopout);
                }}
                onMouseEnter={() => {
                  const target = signalIconRef.current;
                  if (!target) return;
                  const rect = target.getBoundingClientRect();
                  setSignalTooltipPos({ left: rect.left + rect.width / 2, top: rect.top - 8 });
                }}
                onMouseLeave={() => setSignalTooltipPos(null)}
                className="flex items-center gap-2 cursor-pointer hover:opacity-85 transition-opacity min-w-0 flex-1 overflow-hidden group py-1 -my-1"
                title={signalQuality.label}
              >
                <div
                  ref={signalIconRef}
                  className={`flex-shrink-0 flex items-center justify-center p-1 -m-1 ${signalQuality.colorClass}`}
                >
                  <svg
                    viewBox="0 0 16 16"
                    className="w-4 h-4"
                    fill="none"
                    aria-hidden="true"
                  >
                    <rect x="1" y="11" width="2.5" height="4" rx="0.8" fill="currentColor" opacity={signalQuality.bars >= 1 ? 1 : 0.25} />
                    <rect x="5" y="8" width="2.5" height="7" rx="0.8" fill="currentColor" opacity={signalQuality.bars >= 2 ? 1 : 0.25} />
                    <rect x="9" y="5" width="2.5" height="10" rx="0.8" fill="currentColor" opacity={signalQuality.bars >= 3 ? 1 : 0.25} />
                    <rect x="13" y="2" width="2.5" height="13" rx="0.8" fill="currentColor" opacity={signalQuality.bars >= 4 ? 1 : 0.25} />
                  </svg>
                </div>
                {signalTooltipPos &&
                  createPortal(
                    <div
                      style={{ left: signalTooltipPos.left, top: signalTooltipPos.top }}
                      className="fixed -translate-x-1/2 -translate-y-full z-[10000] px-2 py-1 rounded-md bg-background-darkest border border-white/10 text-[11px] font-semibold text-white shadow-xl pointer-events-none whitespace-nowrap"
                    >
                      {signalQuality.label}
                    </div>,
                    document.body
                  )}
                <div className="flex flex-col min-w-0 flex-1 overflow-hidden">
                  <span className="text-xs font-bold text-online leading-tight truncate group-hover:underline">
                    {isConnecting ? 'Conectando...' : 'Voz Conectada'}
                  </span>
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      if (voiceType === 'guild' && activeVoiceChannel) {
                        selectChannel(activeVoiceChannel);
                      }
                    }}
                    className="text-[11px] text-gray-400 hover:text-gray-200 truncate leading-tight block min-w-0 cursor-pointer"
                    title={voiceSubtitle ? `${voiceTitle} / ${voiceSubtitle}` : voiceTitle}
                  >
                    {voiceTitle}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-0.5 flex-shrink-0">
                <button
                  type="button"
                  onClick={leaveVoice}
                  className="p-1.5 rounded-lg hover:bg-red-500/20 text-gray-400 hover:text-red-400 transition-colors flex-shrink-0 cursor-pointer"
                  title="Desconectar"
                >
                  <PhoneOff className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Connected Participants Row (if enabled and other participants in call) */}
            {showVoiceUsersInBar && otherParticipants.length > 0 && (
              <div className="flex items-center gap-1.5 overflow-x-auto py-1.5 px-1.5 -mt-0.5 scrollbar-none animate-in fade-in duration-150">
                {otherParticipants.map((p) => {
                  const { user: participantUser, displayName } = getParticipantUser(p);
                  const isSpeaking = !isDeafened && Boolean(speakingUserIds.includes(p.identity) || (p as any).isSpeaking);
                  const initial = displayName?.[0]?.toUpperCase() || '?';

                  return (
                    <button
                      key={p.identity}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (participantUser && onOpenUserProfile) {
                          const rect = e.currentTarget.getBoundingClientRect();
                          onOpenUserProfile(
                            participantUser,
                            {
                              x: rect.right + 8,
                              y: rect.top,
                              anchorRect: {
                                left: rect.left,
                                top: rect.top,
                                right: rect.right,
                                bottom: rect.bottom,
                                width: rect.width,
                                height: rect.height,
                              },
                            },
                            voiceType === 'guild' ? activeGuild : null
                          );
                        }
                      }}
                      className="relative group/voiceuser flex-shrink-0 cursor-pointer focus:outline-none transition-transform hover:scale-110 active:scale-95"
                      title={displayName}
                    >
                      <div
                        className={`w-6 h-6 rounded-full overflow-hidden flex items-center justify-center bg-brand-500 transition-all duration-150 ${
                          isSpeaking
                            ? 'ring-2 ring-[#23a55a] shadow-[0_0_8px_rgba(35,165,90,0.85)]'
                            : 'ring-1 ring-white/10 group-hover/voiceuser:ring-white/40'
                        }`}
                      >
                        {participantUser?.avatar_url ? (
                          <img
                            src={formatAssetUrl(participantUser.avatar_url)}
                            alt={displayName}
                            className="w-full h-full object-cover rounded-full"
                          />
                        ) : (
                          <span className="text-[10px] font-bold text-white leading-none">
                            {initial}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Large Action Buttons (Camera & Screen Share) */}
            <div className="grid grid-cols-2 gap-1.5 w-full animate-in fade-in slide-in-from-bottom-1 duration-150">
              <ModalButton
                htmlType="button"
                type="secondary"
                size="small"
                fullWidth
                onClick={(e) => {
                  e.stopPropagation();
                  toggleCamera();
                }}
                prefix={isCameraOn ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
                className={isCameraOn ? 'border-online/40 bg-online text-white hover:bg-online/90 active:bg-online/80' : undefined}
                title={isCameraOn ? 'Desligar Câmera' : 'Ligar Câmera'}
              >
                Câmera
              </ModalButton>

              <ModalButton
                htmlType="button"
                type="secondary"
                size="small"
                fullWidth
                onClick={handleScreenShareClick}
                prefix={<Monitor className="w-4 h-4" />}
                className={isScreensharing ? 'border-brand-400/40 bg-brand-500 text-white hover:bg-brand-600 active:bg-brand-700' : undefined}
                title={isScreensharing ? 'Opções de transmissão (Clique para trocar de tela)' : 'Compartilhar Tela'}
              >
                Tela
              </ModalButton>
            </div>
          </>
        )}

        {/* Divider above User Row if Voice or Game is active */}
        {(isInVoice || isGameActive) && (
          <div className="h-[1px] bg-white/5 -mx-1" />
        )}

        {/* 3. User Info & Controls Row (Bottom tier) */}
        <div
          onClick={() => {
            if (typeof window !== 'undefined' && window.innerWidth < 768) {
              onOpenSettings();
            }
          }}
          className={`w-full min-w-0 max-w-full flex items-center justify-between cursor-pointer md:cursor-default overflow-hidden gap-1.5 transition-all ${
            isInVoice || isGameActive ? 'pt-0.5' : 'h-full'
          }`}
        >
          <div
            onClick={(e) => {
              e.stopPropagation();
              if (typeof window !== 'undefined' && window.innerWidth < 768) {
                onOpenSettings();
              } else {
                setShowStatusMenu((prev) => !prev);
              }
            }}
            className="flex items-center gap-2 p-1 -ml-1 rounded-xl hover:bg-white/5 cursor-pointer flex-1 min-w-0 transition-colors group/usercard overflow-hidden"
            title={typeof window !== 'undefined' && window.innerWidth < 768 ? 'Abrir Configurações' : 'Definir Status'}
          >
            {/* Avatar */}
            <UserAvatar
              user={user}
              size="md"
              showStatus={true}
              statusBorderColor="border-background-darkest"
            />

            <div className="flex flex-col truncate min-w-0 flex-1 overflow-hidden">
              <div className="flex items-center gap-1 min-w-0 w-full overflow-hidden">
                <span className="text-[13px] md:text-[14px] font-bold text-white truncate leading-tight group-hover/usercard:text-brand-300 transition-colors block min-w-0 flex-1">
                  {getFormattedUsername(user?.display_name || user?.username || 'Usuário')}
                </span>
              </div>
              <span className="text-[11px] md:text-[12px] text-gray-400 truncate leading-tight mt-0.5 block min-w-0 w-full">
                {user?.status !== 'offline' && user?.custom_activity && user.custom_activity.name !== 'OBS Studio' && !user.custom_activity.name.toLowerCase().includes('obs') && user?.show_activity_status !== false && !isGameActive ? (
                  <span className={`font-medium flex items-center gap-1 truncate ${getActivityColorClass({ type: user.custom_activity.type })}`}>
                    <span className="truncate">
                      {user.custom_activity.type === 'playing' ? 'Jogando ' :
                       user.custom_activity.type === 'listening' ? 'Ouvindo ' :
                       user.custom_activity.type === 'watching' ? 'Assistindo ' :
                       user.custom_activity.type === 'streaming' ? 'Transmitindo ' : ''}
                      {user.custom_activity.name}
                    </span>
                  </span>
                ) : (
                  user?.custom_status || getStatusLabel(user?.status)
                )}
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="hidden md:flex items-center gap-0.5 text-gray-400 flex-shrink-0 select-none">
            {/* 1. Microphone Split Button */}
            <div
              ref={micAnchorRef}
              draggable={false}
              onDragStart={(e) => e.preventDefault()}
              className="flex items-center select-none"
            >
              <button
                type="button"
                draggable={false}
                onDragStart={(e) => e.preventDefault()}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleMute();
                }}
                className={`p-1.5 rounded-md hover:bg-white/10 transition-colors cursor-pointer select-none flex items-center justify-center ${
                  isMuted ? 'text-dnd hover:text-red-400' : 'text-gray-400 hover:text-white'
                }`}
                title={isMuted ? 'Desmutar' : 'Mutar'}
              >
                {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </button>

              <button
                type="button"
                draggable={false}
                onDragStart={(e) => e.preventDefault()}
                onClick={(e) => {
                  e.stopPropagation();
                  setShowDeafenDropup(false);
                  setShowMicDropup((prev) => !prev);
                }}
                className={`p-1 rounded-md hover:bg-white/10 transition-colors cursor-pointer select-none flex items-center justify-center -ml-0.5 text-gray-400 hover:text-white ${
                  showMicDropup ? 'text-white bg-white/10' : ''
                }`}
                title="Dispositivos de Entrada de Áudio"
              >
                <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-150 ${showMicDropup ? 'rotate-180' : ''}`} />
              </button>
            </div>

            {/* 2. Deafen Split Button */}
            <div
              ref={deafenAnchorRef}
              draggable={false}
              onDragStart={(e) => e.preventDefault()}
              className="flex items-center select-none"
            >
              <button
                type="button"
                draggable={false}
                onDragStart={(e) => e.preventDefault()}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleDeafen();
                }}
                className={`p-1.5 rounded-md hover:bg-white/10 transition-colors cursor-pointer select-none flex items-center justify-center ${
                  isDeafened ? 'text-dnd hover:text-red-400' : 'text-gray-400 hover:text-white'
                }`}
                title={isDeafened ? 'Desensurdecer' : 'Ensurdecer'}
              >
                {isDeafened ? (
                  <HeadphonesOff className="w-5 h-5" />
                ) : (
                  <Headphones className="w-5 h-5" />
                )}
              </button>

              <button
                type="button"
                draggable={false}
                onDragStart={(e) => e.preventDefault()}
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMicDropup(false);
                  setShowDeafenDropup((prev) => !prev);
                }}
                className={`p-1 rounded-md hover:bg-white/10 transition-colors cursor-pointer select-none flex items-center justify-center -ml-0.5 text-gray-400 hover:text-white ${
                  showDeafenDropup ? 'text-white bg-white/10' : ''
                }`}
                title="Dispositivos de Saída de Áudio"
              >
                <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-150 ${showDeafenDropup ? 'rotate-180' : ''}`} />
              </button>
            </div>

            {/* 3. Settings Button */}
            <button
              type="button"
              draggable={false}
              onDragStart={(e) => e.preventDefault()}
              onClick={(e) => {
                e.stopPropagation();
                onOpenSettings();
              }}
              className="p-1.5 rounded-md hover:bg-white/10 hover:text-white text-gray-400 transition-colors cursor-pointer select-none flex items-center justify-center flex-shrink-0"
              title="Configurações de Usuário"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Audio Device Dropups */}
      <AudioDeviceDropup
        type="input"
        isOpen={showMicDropup}
        onClose={() => setShowMicDropup(false)}
        onOpenSettings={onOpenSettings}
        anchorRef={micAnchorRef}
      />
      <AudioDeviceDropup
        type="output"
        isOpen={showDeafenDropup}
        onClose={() => setShowDeafenDropup(false)}
        onOpenSettings={onOpenSettings}
        anchorRef={deafenAnchorRef}
      />

      {/* Context Menu Component */}
      <ContextMenu menu={menu} onClose={closeContextMenu} />
    </div>
  );
};
