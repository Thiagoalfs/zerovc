import React, { useEffect, useRef, useState } from 'react';
import { Participant, Track, RemoteTrackPublication } from 'livekit-client';
import { MicOff, Monitor, Maximize2, Minimize2, Play, EyeOff, Radio } from 'lucide-react';
import { useVoiceStore } from '../../stores/voiceStore';

interface ParticipantCardProps {
  participant: Participant;
}

export const ParticipantCard: React.FC<ParticipantCardProps> = ({ participant }) => {
  const { speakingUserIds, stopScreenShare } = useVoiceStore();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isWatching, setIsWatching] = useState(false);

  const isSpeaking = speakingUserIds.includes(participant.identity);
  const isLocal = participant.isLocal;

  // Check audio mute status
  const audioPub = participant.getTrackPublication(Track.Source.Microphone);
  const isMuted = !participant.isMicrophoneEnabled && (!audioPub || audioPub.isMuted);

  // Check video & screen share track
  const screenPub = participant.getTrackPublication(Track.Source.ScreenShare);
  const cameraPub = participant.getTrackPublication(Track.Source.Camera);
  const videoPub = screenPub || cameraPub;

  const isScreenSharing = participant.isScreenShareEnabled || !!screenPub;
  const hasVideoTrack = !!videoPub?.track && !videoPub.isMuted;

  // Auto-watch for local participant
  useEffect(() => {
    if (isLocal && isScreenSharing) {
      setIsWatching(true);
    }
  }, [isLocal, isScreenSharing]);

  // Handle track attachment and subscription
  useEffect(() => {
    const el = videoRef.current;
    if (isWatching && hasVideoTrack && videoPub?.track && el) {
      videoPub.track.attach(el);
      el.play().catch(() => {});
    }

    if (videoPub instanceof RemoteTrackPublication) {
      videoPub.setSubscribed(isWatching);
    }

    return () => {
      if (el && videoPub?.track) {
        videoPub.track.detach(el);
      }
    };
  }, [videoPub?.track, hasVideoTrack, isWatching]);

  const handleToggleWatch = (watch: boolean) => {
    setIsWatching(watch);
    if (videoPub instanceof RemoteTrackPublication) {
      videoPub.setSubscribed(watch);
    }
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

  return (
    <div
      ref={containerRef}
      className={`relative bg-background-darkest rounded-2xl overflow-hidden flex flex-col items-center justify-center min-h-[180px] aspect-video border-2 transition-all duration-200 group ${
        isSpeaking
          ? 'border-online shadow-lg shadow-online/20 ring-2 ring-online/40'
          : 'border-white/5 hover:border-white/15'
      }`}
    >
      {/* 1. If screen sharing and watching: render live video */}
      {isScreenSharing && isWatching && hasVideoTrack ? (
        <>
          <video
            ref={(el) => {
              videoRef.current = el;
              if (el && videoPub?.track) {
                videoPub.track.attach(el);
                el.play().catch(() => {});
              }
            }}
            autoPlay
            playsInline
            className="w-full h-full object-contain bg-black"
          />

          {/* Top Controls Bar when watching */}
          <div className="absolute top-2 right-2 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity z-20">
            {!isLocal && (
              <button
                onClick={() => handleToggleWatch(false)}
                className="px-2.5 py-1 rounded-lg bg-black/75 hover:bg-black/90 text-gray-200 hover:text-white text-xs font-medium flex items-center gap-1.5 backdrop-blur-md transition-colors border border-white/10"
                title="Parar de assistir transmissão sem sair da sala de voz"
              >
                <EyeOff className="w-3.5 h-3.5 text-dnd" />
                <span>Parar de Assistir</span>
              </button>
            )}

            {isLocal && (
              <button
                onClick={stopScreenShare}
                className="px-2.5 py-1 rounded-lg bg-dnd/80 hover:bg-dnd text-white text-xs font-semibold flex items-center gap-1.5 backdrop-blur-md transition-colors"
                title="Parar compartilhamento"
              >
                <span>Parar Transmissão</span>
              </button>
            )}

            <button
              onClick={toggleFullscreen}
              className="p-1.5 rounded-lg bg-black/75 hover:bg-black/90 text-white backdrop-blur-md transition-colors border border-white/10"
              title={isFullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          </div>
        </>
      ) : isScreenSharing && !isWatching && !isLocal ? (
        /* 2. Stream is active but user is NOT watching yet -> Clean Watch Stream Prompt */
        <div className="flex flex-col items-center justify-center p-4 text-center space-y-3 z-10">
          <div className="relative">
            <div className="w-14 h-14 rounded-full bg-brand-500 flex items-center justify-center text-lg font-bold text-white shadow-lg">
              <span>{participant.name?.[0]?.toUpperCase() || participant.identity?.[0]?.toUpperCase() || 'U'}</span>
            </div>
            <div className="absolute -bottom-1 -right-1 bg-online text-white rounded-full p-1 shadow-md animate-pulse">
              <Radio className="w-3.5 h-3.5" />
            </div>
          </div>

          <div>
            <span className="text-xs font-bold text-gray-100 block truncate max-w-[160px]">
              {participant.name || participant.identity}
            </span>
            <span className="text-[11px] text-online font-semibold flex items-center justify-center gap-1 mt-0.5">
              <Monitor className="w-3 h-3" />
              <span>Transmitindo Tela</span>
            </span>
          </div>

          <button
            onClick={() => handleToggleWatch(true)}
            className="bg-brand-500 hover:bg-brand-600 active:scale-95 text-white font-semibold text-xs px-4 py-2 rounded-xl flex items-center gap-1.5 shadow-lg shadow-brand-500/25 transition-all"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Assistir Transmissão</span>
          </button>
        </div>
      ) : (
        /* 3. Normal voice user card */
        <div className="flex flex-col items-center gap-2">
          <div
            className={`w-16 h-16 rounded-full bg-brand-500 flex items-center justify-center text-xl font-bold text-white shadow-md transition-transform duration-150 ${
              isSpeaking ? 'scale-105 ring-4 ring-online ring-offset-2 ring-offset-background-darkest' : ''
            }`}
          >
            <span>{participant.name?.[0]?.toUpperCase() || participant.identity?.[0]?.toUpperCase() || 'U'}</span>
          </div>
        </div>
      )}

      {/* Bottom Name & Status Pill */}
      <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between pointer-events-none bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-lg z-10 border border-white/5">
        <span className="text-xs font-semibold text-white truncate max-w-[130px]">
          {participant.name || participant.identity}
          {isLocal ? ' (Você)' : ''}
        </span>

        <div className="flex items-center gap-1.5">
          {isScreenSharing && (
            <span className="flex items-center gap-1 text-[10px] font-bold text-online bg-online/20 px-1.5 py-0.5 rounded">
              <Monitor className="w-3 h-3" />
              <span>AO VIVO</span>
            </span>
          )}
          {isMuted && <MicOff className="w-3.5 h-3.5 text-dnd" />}
        </div>
      </div>
    </div>
  );
};
