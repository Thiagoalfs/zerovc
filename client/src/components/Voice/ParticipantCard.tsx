import React, { useEffect, useRef } from 'react';
import { Participant, Track } from 'livekit-client';
import { MicOff, Monitor } from 'lucide-react';
import { useVoiceStore } from '../../stores/voiceStore';

interface ParticipantCardProps {
  participant: Participant;
}

export const ParticipantCard: React.FC<ParticipantCardProps> = ({ participant }) => {
  const { speakingUserIds } = useVoiceStore();
  const videoRef = useRef<HTMLVideoElement>(null);

  const isSpeaking = speakingUserIds.includes(participant.identity);
  
  // Check if mic is enabled
  const hasUnmutedAudioTrack = Array.from(participant.audioTrackPublications.values()).some(
    (pub) => !pub.isMuted && pub.track
  );
  const isMuted = !participant.isMicrophoneEnabled && !hasUnmutedAudioTrack;
  const isScreenSharing = participant.isScreenShareEnabled;

  // Handle Video / Screen Share Track attachment
  useEffect(() => {
    const videoPublication = Array.from(participant.videoTrackPublications.values()).find(
      (pub) => isScreenSharing ? pub.source === Track.Source.ScreenShare : pub.track
    ) || Array.from(participant.videoTrackPublications.values())[0];

    if (videoPublication && videoPublication.track && videoRef.current) {
      videoPublication.track.attach(videoRef.current);
    }

    return () => {
      if (videoPublication && videoPublication.track && videoRef.current) {
        videoPublication.track.detach(videoRef.current);
      }
    };
  }, [participant, isScreenSharing]);

  const hasVideoTrack = Array.from(participant.videoTrackPublications.values()).some(
    (pub) => pub.track && !pub.isMuted
  );

  return (
    <div
      className={`relative bg-background-darkest rounded-xl overflow-hidden flex flex-col items-center justify-center min-h-[160px] aspect-video border-2 transition-all duration-150 ${
        isSpeaking
          ? 'border-online shadow-lg shadow-online/20 ring-2 ring-online/50'
          : 'border-transparent hover:border-white/10'
      }`}
    >
      {/* Video / Screen Stream */}
      {hasVideoTrack ? (
        <video
          ref={videoRef}
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

      {/* Name and Status Bar */}
      <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between pointer-events-none bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-md">
        <span className="text-xs font-semibold text-white truncate max-w-[120px]">
          {participant.name || participant.identity}
        </span>

        <div className="flex items-center gap-1">
          {isScreenSharing && <Monitor className="w-3.5 h-3.5 text-online" />}
          {isMuted && <MicOff className="w-3.5 h-3.5 text-dnd" />}
        </div>
      </div>
    </div>
  );
};
