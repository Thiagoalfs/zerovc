import React, { useEffect, useRef, useState } from 'react';
import { Participant, Track } from 'livekit-client';
import { MicOff, Monitor, Maximize2, Minimize2 } from 'lucide-react';
import { useVoiceStore } from '../../stores/voiceStore';

interface ParticipantCardProps {
  participant: Participant;
}

export const ParticipantCard: React.FC<ParticipantCardProps> = ({ participant }) => {
  const { speakingUserIds } = useVoiceStore();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const isSpeaking = speakingUserIds.includes(participant.identity);

  // Check audio mute status
  const audioPub = participant.getTrackPublication(Track.Source.Microphone);
  const isMuted = !participant.isMicrophoneEnabled && (!audioPub || audioPub.isMuted);

  // Check video & screen share track
  const screenPub = participant.getTrackPublication(Track.Source.ScreenShare);
  const cameraPub = participant.getTrackPublication(Track.Source.Camera);
  const videoPub = screenPub || cameraPub;

  const isScreenSharing = participant.isScreenShareEnabled || !!screenPub;
  const hasVideoTrack = !!videoPub?.track && !videoPub.isMuted;

  // Track attachment handler
  useEffect(() => {
    const el = videoRef.current;
    if (el && videoPub?.track) {
      videoPub.track.attach(el);
      el.play().catch(() => {});
    }

    return () => {
      if (el && videoPub?.track) {
        videoPub.track.detach(el);
      }
    };
  }, [videoPub?.track, hasVideoTrack]);

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
      className={`relative bg-background-darkest rounded-xl overflow-hidden flex flex-col items-center justify-center min-h-[160px] aspect-video border-2 transition-all duration-150 group ${
        isSpeaking
          ? 'border-online shadow-lg shadow-online/20 ring-2 ring-online/50'
          : 'border-transparent hover:border-white/10'
      }`}
    >
      {/* Video / Screen Stream */}
      {hasVideoTrack ? (
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
      ) : (
        /* Avatar Placeholder */
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

      {/* Screen Share Fullscreen Button */}
      {hasVideoTrack && (
        <button
          onClick={toggleFullscreen}
          className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 hover:bg-black/80 text-white backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity z-20"
          title={isFullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
        >
          {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>
      )}

      {/* Name and Status Bar */}
      <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between pointer-events-none bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-md z-10">
        <span className="text-xs font-semibold text-white truncate max-w-[120px]">
          {participant.name || participant.identity}
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
