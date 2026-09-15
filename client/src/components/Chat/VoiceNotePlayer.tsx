import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Volume2 } from 'lucide-react';

interface VoiceNotePlayerProps {
  src: string;
  className?: string;
}

const SPEED_OPTIONS = [1, 1.5, 2];

export const VoiceNotePlayer: React.FC<VoiceNotePlayerProps> = ({ src, className = '' }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState<number>(0);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [playbackRateIndex, setPlaybackRateIndex] = useState(0);

  // Generate a deterministic pseudo-random waveform pattern for aesthetics
  const waveformBars = [
    35, 55, 80, 45, 90, 60, 30, 75, 100, 85,
    65, 40, 70, 95, 50, 80, 60, 45, 70, 90,
    55, 35, 65, 80, 40, 60, 85, 100, 70, 45,
    30, 50, 75, 90, 60, 40
  ];

  useEffect(() => {
    const audio = new Audio(src);
    audioRef.current = audio;

    const handleLoadedMetadata = () => {
      if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration)) {
        setDuration(audio.duration);
      }
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.pause();
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audioRef.current = null;
    };
  }, [src]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.playbackRate = SPEED_OPTIONS[playbackRateIndex];
      audio.play().then(() => setIsPlaying(true)).catch((e) => console.log('[VoicePlayer] Play error:', e));
    }
  };

  const cycleSpeed = (e: React.MouseEvent) => {
    e.stopPropagation();
    const nextIdx = (playbackRateIndex + 1) % SPEED_OPTIONS.length;
    setPlaybackRateIndex(nextIdx);
    if (audioRef.current) {
      audioRef.current.playbackRate = SPEED_OPTIONS[nextIdx];
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    audio.currentTime = ratio * duration;
    setCurrentTime(audio.currentTime);
  };

  const formatTime = (secs: number) => {
    if (isNaN(secs) || !isFinite(secs)) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const progressRatio = duration > 0 ? currentTime / duration : 0;

  return (
    <div className={`flex items-center gap-3 p-3 bg-background-darkest/90 rounded-2xl border border-white/10 max-w-sm sm:max-w-md w-full shadow-lg select-none backdrop-blur-md ${className}`}>
      {/* Play / Pause Round Button */}
      <button
        type="button"
        onClick={togglePlay}
        className="w-11 h-11 rounded-full bg-brand-500 hover:bg-brand-600 text-white flex items-center justify-center flex-shrink-0 transition-transform active:scale-95 shadow-md cursor-pointer hover:shadow-brand-500/25"
        title={isPlaying ? 'Pausar Áudio' : 'Ouvir Áudio'}
      >
        {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
      </button>

      {/* Waveform Scrubber & Time */}
      <div className="flex-1 flex flex-col gap-1.5 min-w-0">
        {/* Interactive Waveform */}
        <div 
          onClick={handleSeek}
          className="h-8 flex items-center gap-[3px] cursor-pointer group py-1"
          title="Clique para avançar/retroceder"
        >
          {waveformBars.map((barHeight, idx) => {
            const barRatio = idx / waveformBars.length;
            const isFilled = barRatio <= progressRatio;
            return (
              <div
                key={idx}
                style={{ height: `${Math.max(15, barHeight)}%` }}
                className={`flex-1 rounded-full transition-colors duration-100 min-w-[2px] ${
                  isFilled 
                    ? 'bg-brand-400 group-hover:bg-brand-300' 
                    : 'bg-white/20 group-hover:bg-white/30'
                }`}
              />
            );
          })}
        </div>

        {/* Timers & Speed Selector */}
        <div className="flex items-center justify-between text-[11px] font-mono text-gray-400 px-0.5">
          <span>{formatTime(currentTime)}</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={cycleSpeed}
              className="px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white font-bold text-[10px] transition-colors cursor-pointer border border-white/5"
              title="Velocidade de Reprodução"
            >
              {SPEED_OPTIONS[playbackRateIndex]}x
            </button>
            <span>{formatTime(duration || 0)}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
