import React, { useState } from 'react';
import { PhoneOff } from 'lucide-react';
import { useCallStore } from '../../stores/callStore';
import { useVoiceStore } from '../../stores/voiceStore';
import { formatAssetUrl } from '../../lib/api';
import { CallStage } from '../Voice/CallStage';
import { useStageFullscreen } from '../Voice/VoiceControlBar';
import { useKeepAwake } from '../../hooks/useKeepAwake';
import { hapticWarning } from '../../lib/haptics';
import { User } from '../../types';

interface ActiveCallOverlayProps {
  onOpenScreenShare?: () => void;
  onOpenUserProfile?: (user: User, position?: { x: number; y: number }) => void;
  onOpenDM?: (userId: string) => void;
}

export const ActiveCallOverlay: React.FC<ActiveCallOverlayProps> = ({
  onOpenScreenShare,
  onOpenUserProfile,
  onOpenDM,
}) => {
  const { callState, targetUser, endCall } = useCallStore();
  const {
    voiceType,
    isConnected,
    isConnecting,
    participants,
    watchParticipant,
  } = useVoiceStore();

  const isDMVoiceActive =
    (callState === 'connected' || (voiceType === 'dm' && isConnected)) &&
    participants.length > 0;
  const isCalling = callState === 'calling' && !isConnected;

  useKeepAwake(isDMVoiceActive || isCalling);

  const { isFullscreen: isStageFullscreen, toggleFullscreen: toggleStageFullscreen } = useStageFullscreen();
  const [spotlightParticipantId, setSpotlightParticipantId] = useState<string | null>(null);

  const handleWatchStream = (participantIdentity: string, mode: 'exclusive' | 'additive') => {
    watchParticipant(participantIdentity, mode);
    setSpotlightParticipantId(participantIdentity);
  };

  if (!isCalling && !isDMVoiceActive) return null;

  return (
    <div
      className={
        isStageFullscreen
          ? 'fixed inset-0 z-[10000000] bg-background-darkest p-4 flex flex-col items-center justify-center select-none'
          : 'w-full bg-background-darkest border-b border-white/10 p-3 md:p-4 flex flex-col items-center justify-between transition-all select-none animate-in fade-in shadow-xl'
      }
    >
      {/* Calling State (Waiting for answer) */}
      {isCalling && (
        <div className="w-full flex items-center justify-between max-w-2xl mx-auto py-2">
          <div className="flex items-center gap-3">
            <div className="relative w-12 h-12 rounded-full bg-brand-500 flex items-center justify-center text-white font-bold text-base shadow-lg">
              {targetUser?.avatar_url ? (
                <img
                  src={formatAssetUrl(targetUser.avatar_url)}
                  alt=""
                  className="w-full h-full rounded-full object-cover"
                />
              ) : (
                <span>
                  {targetUser?.display_name?.[0]?.toUpperCase() ||
                    targetUser?.username?.[0]?.toUpperCase() ||
                    'U'}
                </span>
              )}
              <div className="absolute inset-0 rounded-full border-2 border-brand-400 animate-ping opacity-50" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-white">
                Chamando {targetUser?.display_name || targetUser?.username}...
              </h4>
              <p className="text-xs text-gray-400 animate-pulse">Aguardando atendimento</p>
            </div>
          </div>

          <button
            onClick={() => {
              hapticWarning();
              endCall();
            }}
            className="flex items-center gap-2 bg-dnd hover:bg-rose-700 text-white font-semibold px-4 py-2 rounded-xl text-xs transition-all shadow-lg cursor-pointer active:scale-95"
          >
            <PhoneOff className="w-4 h-4" />
            <span>Cancelar</span>
          </button>
        </div>
      )}

      {/* Connected State (Active Voice / Video DM Call with Participant Cards) */}
      {isDMVoiceActive && (
        <div className={isStageFullscreen ? 'w-full h-full flex flex-col' : 'w-full max-w-5xl mx-auto flex flex-col'}>
          <CallStage
            variant="compact"
            controlsMode="always"
            participants={participants}
            isConnected={isConnected}
            isConnecting={isConnecting}
            connectingLabel="Conectando áudio e vídeo..."
            emptyTitle="Aguardando conexão..."
            isFullscreen={isStageFullscreen}
            onToggleFullscreen={toggleStageFullscreen}
            onOpenScreenShare={onOpenScreenShare}
            onDisconnect={endCall}
            onOpenUserProfile={onOpenUserProfile}
            onOpenDM={onOpenDM}
            onWatchStream={handleWatchStream}
            spotlightParticipantId={spotlightParticipantId}
            onSpotlightChange={setSpotlightParticipantId}
          />
        </div>
      )}
    </div>
  );
};
