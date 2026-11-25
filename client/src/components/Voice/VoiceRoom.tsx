import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Volume2 } from 'lucide-react';
import { Channel, User, VoiceSession } from '../../types';
import { ChatHeader } from '../Chat/ChatHeader';
import { useVoiceStore } from '../../stores/voiceStore';
import { useGuildStore } from '../../stores/guildStore';
import { useAuthStore } from '../../stores/authStore';
import { Participant } from 'livekit-client';
import { ContextMenu, useContextMenu, ContextMenuItem } from '../ContextMenu';
import { useKeepAwake } from '../../hooks/useKeepAwake';
import { hapticMedium, hapticWarning } from '../../lib/haptics';
import { getDesktopAPI } from '../../lib/desktopBridge';
import { CallStage } from './CallStage';
import { useStageFullscreen } from './VoiceControlBar';
import { ModalButton } from '@/components/ui/modal-button';
import { canUserConnectVoice } from '../../utils/userActivity';
import { showAlert } from '../../stores/confirmModalStore';

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
    watchParticipant,
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
  const canConnectToThisChannel = useMemo(
    () => canUserConnectVoice(liveChannel, activeGuild, user),
    [liveChannel, activeGuild, user]
  );

  const handleJoinChannel = async () => {
    if (!canConnectToThisChannel) {
      hapticWarning();
      showAlert({
        title: 'Sem permissão',
        message: 'Você não tem permissão para entrar neste canal de voz.',
        variant: 'warning',
      });
      return false;
    }
    hapticMedium();
    await joinVoice(channel.id, channel.guild_id);
    const state = useVoiceStore.getState();
    return state.isConnected && state.currentChannelId === channel.id;
  };

  const handleWatchStream = async (participantIdentity: string, mode: 'exclusive' | 'additive') => {
    if (isConnectedToThisChannel) {
      watchParticipant(participantIdentity, mode);
      setSpotlightParticipantId(participantIdentity);
      return;
    }
    const joined = await handleJoinChannel();
    if (joined) {
      watchParticipant(participantIdentity, mode);
      setSpotlightParticipantId(participantIdentity);
    }
  };

  // Keep mobile screen awake while connected in voice channel
  useKeepAwake(isConnectedToThisChannel);

  const voiceRoomRef = useRef<HTMLDivElement>(null);
  const [spotlightParticipantId, setSpotlightParticipantId] = useState<string | null>(null);
  const [isVoiceRoomHovered, setIsVoiceRoomHovered] = useState(false);
  const { isFullscreen: isRoomFullscreen, toggleFullscreen: toggleRoomFullscreen } = useStageFullscreen();

  const isFloatingOverlayOpen = () =>
    Boolean(
      menu ||
        document.querySelector(
          '[role="dialog"], [aria-modal="true"], [data-radix-popper-content-wrapper], [data-floating-overlay="true"]'
        )
    );

  useEffect(() => {
    const clearHover = () => setIsVoiceRoomHovered(false);
    const handlePointerMove = (e: PointerEvent) => {
      if (isFloatingOverlayOpen()) {
        setIsVoiceRoomHovered(false);
        return;
      }
      const el = voiceRoomRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const inside =
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom;
      if (!inside) {
        setIsVoiceRoomHovered(false);
      } else if (e.movementX !== 0 || e.movementY !== 0) {
        // Ignore synthetic pointermove (0,0) fired by slide-up animation as cursor exits
        setIsVoiceRoomHovered(true);
      }
    };
    const handleWindowMouseOut = (e: MouseEvent) => {
      if (!e.relatedTarget) {
        setIsVoiceRoomHovered(false);
      }
    };
    window.addEventListener('pointermove', handlePointerMove, { passive: true, capture: true });
    window.addEventListener('mouseout', handleWindowMouseOut);
    document.documentElement.addEventListener('pointerleave', clearHover);
    document.addEventListener('mouseleave', clearHover);
    window.addEventListener('blur', clearHover);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove, { capture: true });
      window.removeEventListener('mouseout', handleWindowMouseOut);
      document.documentElement.removeEventListener('pointerleave', clearHover);
      document.removeEventListener('mouseleave', clearHover);
      window.removeEventListener('blur', clearHover);
    };
  }, [Boolean(menu)]);

  // Safety net if the OS/Wayland compositor drops the exit event during animation
  useEffect(() => {
    if (!isVoiceRoomHovered) return;
    let cancelled = false;
    const timer = setInterval(async () => {
      if (isFloatingOverlayOpen()) {
        setIsVoiceRoomHovered(false);
        return;
      }
      const el = voiceRoomRef.current;
      if (el && !el.matches(':hover')) {
        setIsVoiceRoomHovered(false);
        return;
      }
      const desktopAPI = getDesktopAPI();
      if (desktopAPI?.isCursorInWindow) {
        const insideWin = await desktopAPI.isCursorInWindow().catch(() => true);
        if (!cancelled && !insideWin) {
          setIsVoiceRoomHovered(false);
        }
      }
    }, 100);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [isVoiceRoomHovered, Boolean(menu)]);

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
          isMicrophoneEnabled: !vs.is_muted && !vs.is_deafened && !vs.server_muted && !vs.server_deafened,
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

  const connectButton = !isConnectedToThisChannel ? (
    <ModalButton
      htmlType="button"
      type="primary"
      size="medium"
      loading={isConnectingToThisChannel}
      disabled={isConnectingToThisChannel}
      onClick={() => {
        void handleJoinChannel();
      }}
      prefix={!isConnectingToThisChannel ? <Volume2 className="w-4 h-4" /> : undefined}
    >
      {isConnectingToThisChannel ? 'Conectando...' : 'Conectar à Voz'}
    </ModalButton>
  ) : null;

  return (
    <div
      ref={voiceRoomRef}
      data-hovered={isVoiceRoomHovered ? 'true' : 'false'}
      onMouseEnter={() => {
        if (!isFloatingOverlayOpen()) setIsVoiceRoomHovered(true);
      }}
      onMouseLeave={() => setIsVoiceRoomHovered(false)}
      className={`${
        isRoomFullscreen ? 'fixed inset-0 z-[10000000]' : 'flex-1 w-full min-w-0 h-full relative'
      } bg-background-darkest flex flex-col overflow-hidden select-none group/voiceroom`}
    >
      {/* Voice Room Header */}
      <ChatHeader
        variant="call"
        onOpenMobileDrawer={onOpenMobileDrawer}
        icon={<Volume2 className="w-6 h-6 text-gray-500 flex-shrink-0" />}
        title={
          <span className="font-bold text-gray-100 truncate text-[17px] md:text-base">{channel.name}</span>
        }
      />

      {/* Main Voice / Video Dynamic Stage */}
      <CallStage
        variant="full"
        controlsMode="always"
        isHovered={isVoiceRoomHovered}
        participants={displayedParticipants}
        isConnected={isConnectedToThisChannel}
        isConnecting={isConnectingToThisChannel}
        connectingLabel="Conectando ao canal de voz..."
        emptyTitle="Nenhum participante conectado"
        emptyAction={connectButton}
        gridFooter={connectButton ? <div className="pt-2 flex-shrink-0">{connectButton}</div> : undefined}
        isFullscreen={isRoomFullscreen}
        onToggleFullscreen={toggleRoomFullscreen}
        onOpenScreenShare={onOpenScreenShare}
        onOpenUserProfile={onOpenUserProfile}
        onOpenDM={onOpenDM}
        onWatchStream={handleWatchStream}
        spotlightParticipantId={spotlightParticipantId}
        onSpotlightChange={setSpotlightParticipantId}
      />

      {/* Context Menu Component */}
      <ContextMenu menu={menu} onClose={closeContextMenu} />
    </div>
  );
};
