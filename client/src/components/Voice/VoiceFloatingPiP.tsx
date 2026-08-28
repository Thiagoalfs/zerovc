import React, { useEffect, useRef, useState } from 'react';
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
} from 'lucide-react';
import { useVoiceStore } from '../../stores/voiceStore';
import { useGuildStore } from '../../stores/guildStore';
import { useAuthStore } from '../../stores/authStore';

interface VoiceFloatingPiPProps {
  onNavigateToVoiceChannel?: (channelId: string, guildId?: string) => void;
}

export const VoiceFloatingPiP: React.FC<VoiceFloatingPiPProps> = ({ onNavigateToVoiceChannel }) => {
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
    participantVolumes,
    setParticipantVolume,
  } = useVoiceStore();

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [showVolume, setShowVolume] = useState(false);

  // Find target participant to display
  const targetParticipant = participants.find(
    (p) =>
      p.identity === watchedParticipantId ||
      (p.isLocal && isScreensharing && (!watchedParticipantId || watchedParticipantId === user?.id))
  );

  const screenPub = targetParticipant?.getTrackPublication(Track.Source.ScreenShare);
  const hasScreenVideoTrack = !!screenPub?.track && !screenPub.isMuted;
  const isLocal = targetParticipant?.isLocal;

  // Find the voice channel info
  const voiceChannel =
    activeGuild?.channels?.find((c) => c.id === currentChannelId) ||
    guilds.flatMap((g) => g.channels || []).find((c) => c.id === currentChannelId);

  const parentGuild =
    (voiceChannel && guilds.find((g) => g.id === voiceChannel.guild_id)) || activeGuild;

  // Attach and subscribe video stream
  useEffect(() => {
    const el = videoRef.current;
    if (hasScreenVideoTrack && screenPub?.track && el) {
      screenPub.track.attach(el);
      el.play().catch(() => {});
    }

    if (screenPub instanceof RemoteTrackPublication) {
      screenPub.setSubscribed(true);
    }

    return () => {
      if (el && screenPub?.track) {
        screenPub.track.detach(el);
      }
    };
  }, [screenPub?.track, hasScreenVideoTrack]);

  if (!isConnected || !currentChannelId || !targetParticipant || !hasScreenVideoTrack) {
    return null;
  }

  const currentVolume = participantVolumes[targetParticipant.identity] ?? 1;
  const displayName = targetParticipant.name || targetParticipant.identity;

  const handleOpenVoiceRoom = () => {
    if (voiceChannel && parentGuild) {
      if (onNavigateToVoiceChannel) {
        onNavigateToVoiceChannel(voiceChannel.id, parentGuild.id);
      } else {
        selectGuild(parentGuild.id);
        selectChannel(voiceChannel);
      }
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-40 w-72 sm:w-80 rounded-2xl overflow-hidden shadow-2xl border border-white/10 bg-background-darkest/95 backdrop-blur-md select-none group animate-in slide-in-from-bottom-3 fade-in duration-150">
      {/* Video Stream Stage */}
      <div
        onClick={handleOpenVoiceRoom}
        className="relative aspect-video bg-black cursor-pointer overflow-hidden flex items-center justify-center"
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className="w-full h-full object-contain bg-black"
        />

        {/* Top Floating Bar */}
        <div className="absolute top-2 left-2 right-2 flex items-center justify-between z-20">
          <div className="flex items-center gap-1.5 bg-black/60 backdrop-blur-md px-2 py-0.5 rounded-lg text-[10px] font-bold text-white shadow">
            <Monitor className="w-3 h-3 text-brand-400" />
            <span className="truncate max-w-[110px]">{displayName}</span>
            <span className="bg-brand-500 text-white text-[9px] px-1 py-0.2 rounded uppercase font-bold">
              Ao Vivo
            </span>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleOpenVoiceRoom();
              }}
              className="p-1 rounded-lg bg-black/60 hover:bg-white/20 text-gray-200 hover:text-white backdrop-blur-md transition-colors cursor-pointer"
              title="Expandir canal de voz"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>

            {!isLocal && (
              <button
                type="button"
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
            <Maximize2 className="w-3.5 h-3.5 text-brand-400" />
            <span>Clique para abrir a call</span>
          </div>
        </div>
      </div>

      {/* Bottom Voice Control Bar */}
      <div className="p-2.5 px-3 bg-background-darker/90 border-t border-white/5 flex items-center justify-between">
        <div
          onClick={handleOpenVoiceRoom}
          className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity min-w-0"
        >
          <div className="w-2 h-2 rounded-full bg-online animate-pulse flex-shrink-0" />
          <span className="text-xs font-semibold text-gray-200 truncate">
            #{voiceChannel?.name || 'Canal de Voz'}
          </span>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {!isLocal && (
            <div className="relative">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowVolume(!showVolume);
                }}
                className="p-1.5 rounded-lg text-gray-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                title="Ajustar volume"
              >
                {currentVolume === 0 ? (
                  <VolumeX className="w-3.5 h-3.5 text-dnd" />
                ) : (
                  <Volume2 className="w-3.5 h-3.5" />
                )}
              </button>

              {showVolume && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowVolume(false)} />
                  <div className="absolute right-0 bottom-full mb-2 z-50 bg-background-darkest border border-white/10 p-3 rounded-2xl shadow-2xl w-36 flex flex-col gap-2 animate-in fade-in zoom-in-95">
                    <div className="flex items-center justify-between text-[11px] font-semibold text-gray-300">
                      <span>Volume</span>
                      <span className="text-brand-400">{Math.round(currentVolume * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={2}
                      step={0.05}
                      value={currentVolume}
                      onChange={(e) =>
                        setParticipantVolume(targetParticipant.identity, parseFloat(e.target.value))
                      }
                      className="w-full accent-brand-500 h-1.5 bg-background-light rounded-lg cursor-pointer"
                    />
                  </div>
                </>
              )}
            </div>
          )}

          <button
            type="button"
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
