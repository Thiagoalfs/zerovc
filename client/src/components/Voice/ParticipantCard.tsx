import React, { useEffect, useRef, useState } from 'react';
import { Participant, Track, RemoteTrackPublication } from 'livekit-client';
import { MicOff, Monitor, Maximize2, Minimize2, Play, EyeOff, Radio, Video, Volume2, VolumeX } from 'lucide-react';
import { useVoiceStore } from '../../stores/voiceStore';

interface ParticipantCardProps {
  participant: Participant;
}

export const ParticipantCard: React.FC<ParticipantCardProps> = ({ participant }) => {
  const { speakingUserIds, stopScreenShare, participantVolumes, setParticipantVolume } = useVoiceStore();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const cameraRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isWatching, setIsWatching] = useState(false);
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);

  const isSpeaking = speakingUserIds.includes(participant.identity);
  const isLocal = participant.isLocal;

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

  // Auto-watch for local participant
  useEffect(() => {
    if (isLocal && isScreenSharing) {
      setIsWatching(true);
    }
  }, [isLocal, isScreenSharing]);

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
    setIsWatching(watch);
    if (screenPub instanceof RemoteTrackPublication) {
      screenPub.setSubscribed(watch);
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

  const displayName = participant.name || participant.identity;

  return (
    <div
      ref={containerRef}
      className={`relative bg-background-darkest rounded-2xl overflow-hidden flex flex-col items-center justify-center min-h-[180px] aspect-video border-2 transition-all duration-200 group ${
        isSpeaking
          ? 'border-online shadow-lg shadow-online/20 ring-2 ring-online/40'
          : 'border-white/5 hover:border-white/15'
      }`}
    >
      {/* 1. If screen sharing and watching: render live screen video */}
      {isScreenSharing && isWatching && hasScreenVideoTrack ? (
        <>
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

          {/* Controls Bar on Hover */}
          <div className="absolute top-3 right-3 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity bg-black/70 backdrop-blur-md px-2 py-1 rounded-xl border border-white/10 z-20">
            {!isLocal && (
              <button
                onClick={() => handleToggleWatch(false)}
                className="p-1 text-gray-300 hover:text-white rounded hover:bg-white/10 text-xs flex items-center gap-1 font-medium transition-colors"
                title="Parar de assistir transmissão"
              >
                <EyeOff className="w-3.5 h-3.5" />
                <span className="text-[11px] hidden sm:inline">Parar de Ver</span>
              </button>
            )}

            {isLocal && (
              <button
                onClick={stopScreenShare}
                className="p-1 text-dnd hover:bg-dnd/20 rounded text-xs flex items-center gap-1 font-medium transition-colors"
                title="Encerrar compartilhamento"
              >
                <Monitor className="w-3.5 h-3.5" />
                <span className="text-[11px] hidden sm:inline">Parar Live</span>
              </button>
            )}

            <button
              onClick={toggleFullscreen}
              className="p-1 text-gray-300 hover:text-white rounded hover:bg-white/10 transition-colors"
              title="Tela cheia"
            >
              {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
          </div>
        </>
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
            className="mt-1 bg-brand-500 hover:bg-brand-600 active:scale-95 text-white text-xs font-semibold px-4 py-2 rounded-xl transition-all shadow-lg shadow-brand-500/30 flex items-center gap-1.5"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Assistir Transmissão</span>
          </button>
        </div>
      ) : (
        /* 4. Default Voice Participant Avatar View */
        <div className="flex flex-col items-center justify-center gap-2">
          <div
            className={`w-16 h-16 md:w-20 md:h-20 rounded-full bg-brand-500 flex items-center justify-center font-bold text-white text-xl shadow-lg transition-transform ${
              isSpeaking ? 'scale-105 ring-4 ring-online ring-offset-2 ring-offset-background-darkest' : ''
            }`}
          >
            <span>{displayName?.[0]?.toUpperCase() || 'U'}</span>
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

      {/* Top Right Controls: Volume Slider */}
      {!isLocal && (
        <div className="absolute top-3 right-3 z-30 opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="relative">
            <button
              onClick={() => setShowVolumeSlider(!showVolumeSlider)}
              className="p-1.5 rounded-lg bg-black/60 hover:bg-black/90 text-gray-300 hover:text-white backdrop-blur-sm transition-colors"
              title="Ajustar volume"
            >
              {currentVolume === 0 ? <VolumeX className="w-3.5 h-3.5 text-dnd" /> : <Volume2 className="w-3.5 h-3.5" />}
            </button>

            {showVolumeSlider && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowVolumeSlider(false)} />
                <div className="absolute right-0 top-full mt-1.5 z-50 bg-background-darkest border border-white/10 p-3 rounded-2xl shadow-2xl w-40 flex flex-col gap-2 animate-in fade-in zoom-in-95">
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
        </div>
      )}

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
  );
};
