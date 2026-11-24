import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Participant, Track } from 'livekit-client';
import { ChevronDown, ChevronUp, Loader2, Maximize2, Minimize2, Users } from 'lucide-react';
import { User } from '../../types';
import { useVoiceStore } from '../../stores/voiceStore';
import { ParticipantCard } from './ParticipantCard';
import { VoiceControlBar } from './VoiceControlBar';

export interface CompactCallStageWrapperProps {
  isFullscreen: boolean;
  children: React.ReactNode;
}

export const CompactCallStageWrapper: React.FC<CompactCallStageWrapperProps> = ({
  isFullscreen,
  children,
}) => (
  <div
    className={
      isFullscreen
        ? 'fixed inset-0 z-[10000000] bg-background-darkest p-4 flex flex-col items-center justify-center select-none'
        : 'w-full bg-background-darkest border-b border-white/10 p-3 md:p-4 flex flex-col items-center justify-between transition-all select-none animate-in fade-in shadow-xl'
    }
  >
    <div className={isFullscreen ? 'w-full h-full flex flex-col' : 'w-full flex flex-col'}>
      {children}
    </div>
  </div>
);

export interface CallStageProps {
  participants: Participant[];
  isConnected: boolean;
  isConnecting?: boolean;
  connectingLabel?: string;
  emptyTitle?: string;
  emptyAction?: React.ReactNode;
  gridFooter?: React.ReactNode;
  showControls?: boolean;
  controlsMode?: 'always' | 'hover';
  isHovered?: boolean;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onOpenScreenShare?: () => void;
  onDisconnect?: () => void;
  onOpenUserProfile?: (user: User, position?: { x: number; y: number }) => void;
  onOpenDM?: (userId: string) => void;
  onWatchStream?: (identity: string, mode: 'exclusive' | 'additive') => void | Promise<void>;
  spotlightParticipantId?: string | null;
  onSpotlightChange?: (id: string | null) => void;
  variant?: 'full' | 'compact';
  className?: string;
}

const GAP = 12;

function computeStageLayout(
  participants: Participant[],
  width: number,
  height: number,
  hasFooter: boolean,
  isCompactVariant: boolean
) {
  const count = participants.length;
  if (count === 0 || width <= 0 || height <= 0) {
    return { rows: [] as Participant[][], cardWidth: 0, cardHeight: 0 };
  }

  const padding = isCompactVariant ? 16 : 32;
  const buttonReservedH = hasFooter ? 56 : 0;
  const availW = Math.max(120, width - padding);
  const availH = Math.max(80, height - padding - buttonReservedH);

  if (count === 1) {
    const maxW = Math.min(500, availW);
    const maxH = Math.min(300, availH);
    const cardWidth = Math.max(120, Math.min(maxW, (maxH * 16) / 9));
    const cardHeight = (cardWidth * 9) / 16;
    return { rows: [participants], cardWidth, cardHeight };
  }

  let bestCols = 1;
  let bestCardWidth = 0;
  let bestCardHeight = 0;

  for (let cols = 1; cols <= count; cols++) {
    const numRows = Math.ceil(count / cols);
    const maxCardW = (availW - GAP * (cols - 1)) / cols;
    const maxCardH = (availH - GAP * (numRows - 1)) / numRows;
    if (maxCardW <= 0 || maxCardH <= 0) continue;

    const cardW = Math.min(maxCardW, (maxCardH * 16) / 9);
    const cardH = (cardW * 9) / 16;

    if (cardW * cardH > bestCardWidth * bestCardHeight) {
      bestCols = cols;
      bestCardWidth = cardW;
      bestCardHeight = cardH;
    }
  }

  const rows: Participant[][] = [];
  for (let i = 0; i < count; i += bestCols) {
    rows.push(participants.slice(i, i + bestCols));
  }

  return {
    rows,
    cardWidth: Math.max(80, bestCardWidth),
    cardHeight: Math.max(45, bestCardHeight),
  };
}

export const CallStage: React.FC<CallStageProps> = ({
  participants,
  isConnected,
  isConnecting = false,
  connectingLabel = 'Conectando...',
  emptyTitle = 'Ninguém conectado no canal de voz',
  emptyAction,
  gridFooter,
  showControls = true,
  controlsMode = 'always',
  isHovered = false,
  isFullscreen,
  onToggleFullscreen,
  onOpenScreenShare,
  onDisconnect,
  onOpenUserProfile,
  onOpenDM,
  onWatchStream,
  spotlightParticipantId: controlledSpotlightId,
  onSpotlightChange,
  variant = 'full',
  className = '',
}) => {
  const stageRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [internalSpotlightId, setInternalSpotlightId] = useState<string | null>(null);
  const [isBottomStripCollapsed, setIsBottomStripCollapsed] = useState(false);

  const spotlightId =
    controlledSpotlightId !== undefined ? controlledSpotlightId : internalSpotlightId;

  const setSpotlightId = (id: string | null) => {
    if (onSpotlightChange) {
      onSpotlightChange(id);
    } else {
      setInternalSpotlightId(id);
    }
  };

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;

    const update = () => {
      const rect = el.getBoundingClientRect();
      setDimensions({ width: rect.width, height: rect.height });
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const spotlightParticipant = useMemo(() => {
    if (!spotlightId) return null;
    return participants.find((p) => p.identity === spotlightId) || null;
  }, [participants, spotlightId]);

  useEffect(() => {
    if (spotlightId && !spotlightParticipant) {
      setSpotlightId(null);
    }
  }, [spotlightId, spotlightParticipant]);

  const otherParticipants = useMemo(() => {
    if (!spotlightParticipant) return [];
    return participants.filter((p) => p.identity !== spotlightParticipant.identity);
  }, [participants, spotlightParticipant]);

  const isCompactVariant = variant === 'compact' && !isFullscreen;
  const isLocalScreensharing = useVoiceStore((s) => s.isScreensharing);
  const isLocalCameraOn = useVoiceStore((s) => s.isCameraOn);

  const hasAnyActiveMedia = useMemo(() => {
    if (isConnected && (isLocalScreensharing || isLocalCameraOn)) return true;
    return participants.some((p) => {
      const screenPub = p.getTrackPublication(Track.Source.ScreenShare);
      const cameraPub = p.getTrackPublication(Track.Source.Camera);
      const isScreenSharing = p.isScreenShareEnabled || !!screenPub;
      const hasCamera = p.isCameraEnabled || (!!cameraPub?.track && !cameraPub.isMuted);
      return isScreenSharing || hasCamera;
    });
  }, [participants, isConnected, isLocalScreensharing, isLocalCameraOn]);

  const isAvatarOnlyMode = variant === 'compact' && !hasAnyActiveMedia;

  useEffect(() => {
    if (isAvatarOnlyMode && spotlightId) {
      setSpotlightId(null);
    }
  }, [isAvatarOnlyMode, spotlightId]);

  const stageLayout = useMemo(
    () =>
      computeStageLayout(
        participants,
        dimensions.width,
        dimensions.height,
        Boolean(gridFooter),
        isCompactVariant
      ),
    [participants, dimensions.width, dimensions.height, gridFooter, isCompactVariant]
  );

  const controlsFloating = controlsMode === 'hover' || isFullscreen;

  return (
    <div
      className={`relative flex flex-col min-h-0 ${
        variant === 'full' || isFullscreen ? 'flex-1 h-full w-full' : 'w-full'
      } ${className}`}
    >
      <div
        ref={stageRef}
        className={`relative flex-1 min-h-0 flex flex-col items-center justify-center overflow-hidden ${
          isAvatarOnlyMode && !isFullscreen
            ? 'py-4 px-2'
            : isCompactVariant
            ? 'h-[45vh] min-h-[200px] max-h-[380px] p-2'
            : 'p-4'
        }`}
      >
        {participants.length === 0 ? (
          isConnecting ? (
            <div className="flex flex-col items-center justify-center gap-3 text-gray-300">
              <Loader2 className="w-8 h-8 animate-spin text-accent-400" />
              <span className="text-sm font-medium">{connectingLabel}</span>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-4 text-center max-w-md px-4">
              <p className="text-gray-400 text-sm font-medium">{emptyTitle}</p>
              {emptyAction}
            </div>
          )
        ) : isAvatarOnlyMode ? (
          <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-5 py-1 w-full">
            {participants.map((participant) => (
              <ParticipantCard
                key={participant.identity}
                participant={participant}
                isCompact={isCompactVariant}
                avatarOnly
                onOpenUserProfile={onOpenUserProfile}
                onOpenDM={onOpenDM}
                onOpenScreenShare={onOpenScreenShare}
                onWatchStream={onWatchStream}
              />
            ))}
          </div>
        ) : spotlightParticipant ? (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 min-h-0">
            <div className="flex-1 min-h-0 w-full flex items-center justify-center">
              <div className="w-full h-full max-w-full max-h-full aspect-video flex items-center justify-center">
                <ParticipantCard
                  participant={spotlightParticipant}
                  onOpenUserProfile={onOpenUserProfile}
                  onOpenDM={onOpenDM}
                  onOpenScreenShare={onOpenScreenShare}
                  onWatchStream={onWatchStream}
                  onClick={() => setSpotlightId(null)}
                />
              </div>
            </div>

            {otherParticipants.length > 0 && (
              <div className="shrink-0 w-full flex flex-col items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setIsBottomStripCollapsed((prev) => !prev)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-700/80 hover:bg-surface-600/80 text-xs text-gray-300 border border-white/10 transition-colors cursor-pointer"
                >
                  {isBottomStripCollapsed ? (
                    <ChevronUp className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                  <Users className="w-3.5 h-3.5" />
                  <span>{otherParticipants.length}</span>
                </button>

                {!isBottomStripCollapsed && (
                  <div className="w-full flex items-center justify-center gap-2 overflow-x-auto pb-1">
                    {otherParticipants.map((participant) => (
                      <div
                        key={participant.identity}
                        className={
                          isCompactVariant
                            ? 'shrink-0 w-[160px] h-[90px]'
                            : 'shrink-0 w-[240px] h-[135px]'
                        }
                      >
                        <ParticipantCard
                          participant={participant}
                          isCompact={isCompactVariant}
                          onOpenUserProfile={onOpenUserProfile}
                          onOpenDM={onOpenDM}
                          onOpenScreenShare={onOpenScreenShare}
                          onWatchStream={onWatchStream}
                          onClick={() => setSpotlightId(participant.identity)}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-3 w-full h-full min-h-0">
            <div className="flex flex-col items-center justify-center gap-3">
              {stageLayout.rows.map((row, rowIdx) => (
                <div
                  key={rowIdx}
                  className="flex items-center justify-center gap-3"
                >
                  {row.map((participant) => (
                    <div
                      key={participant.identity}
                      style={{
                        width: `${stageLayout.cardWidth}px`,
                        height: `${stageLayout.cardHeight}px`,
                      }}
                    >
                      <ParticipantCard
                        participant={participant}
                        isCompact={isCompactVariant}
                        onOpenUserProfile={onOpenUserProfile}
                        onOpenDM={onOpenDM}
                        onOpenScreenShare={onOpenScreenShare}
                        onWatchStream={onWatchStream}
                        onClick={() => setSpotlightId(participant.identity)}
                      />
                    </div>
                  ))}
                </div>
              ))}
            </div>
            {gridFooter}
          </div>
        )}
      </div>

      {showControls && isConnected && (
        <div
          className={
            controlsFloating
              ? `absolute bottom-4 inset-x-4 flex items-center justify-center pointer-events-none z-30 transition-all duration-200 ${
                  controlsMode === 'hover' && !isHovered && !isFullscreen
                    ? 'opacity-0 translate-y-2 pointer-events-none'
                    : 'opacity-100 translate-y-0'
                }`
              : 'shrink-0 pt-1 pb-2 px-4 w-full relative flex items-center justify-center z-30'
          }
        >
          <button
            type="button"
            onClick={onToggleFullscreen}
            className={`absolute ${
              controlsFloating ? 'right-0' : 'right-4'
            } top-1/2 -translate-y-1/2 pointer-events-auto p-1.5 text-gray-300 hover:text-white transition-all cursor-pointer active:scale-95`}
            aria-label={isFullscreen ? 'Sair da Tela Cheia' : 'Tela Cheia'}
          >
            {isFullscreen ? (
              <Minimize2 className="w-5 h-5" />
            ) : (
              <Maximize2 className="w-5 h-5" />
            )}
          </button>

          <VoiceControlBar
            className="pointer-events-auto"
            onOpenScreenShare={onOpenScreenShare}
            onDisconnect={onDisconnect}
          />
        </div>
      )}
    </div>
  );
};
