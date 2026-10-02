import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Volume2, Volume1, VolumeX } from 'lucide-react';

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
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekTime, setSeekTime] = useState<number>(0);
  const [playbackRateIndex, setPlaybackRateIndex] = useState(0);

  // Volume state with saved preference
  const [volume, setVolume] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('zerovc_chat_audio_volume');
      if (saved !== null) {
        const parsed = parseFloat(saved);
        if (!isNaN(parsed) && parsed >= 0 && parsed <= 1) return parsed;
      }
    } catch {}
    return 1;
  });
  const [isMuted, setIsMuted] = useState(false);
  const [isVolumeHovered, setIsVolumeHovered] = useState(false);
  const [isDraggingVolume, setIsDraggingVolume] = useState(false);
  const prevVolumeRef = useRef<number>(volume > 0 ? volume : 1);

  // Sync audio element volume
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  // Global mouse up for smooth slider dragging
  useEffect(() => {
    const handleGlobalEnd = () => {
      setIsDraggingVolume(false);
    };
    window.addEventListener('mouseup', handleGlobalEnd);
    window.addEventListener('touchend', handleGlobalEnd);
    return () => {
      window.removeEventListener('mouseup', handleGlobalEnd);
      window.removeEventListener('touchend', handleGlobalEnd);
    };
  }, []);

  // Initialize audio and extract duration reliably (handles WebM duration Infinity bug)
  useEffect(() => {
    const audio = new Audio(src);
    audioRef.current = audio;
    audio.preload = 'metadata';
    audio.volume = isMuted ? 0 : volume;

    const handleLoadedMetadata = () => {
      if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration)) {
        setDuration(audio.duration);
      } else {
        // Fix for WebM Infinity duration bug in Chromium/Firefox
        audio.currentTime = 1e101;
        const onTimeUpdate = () => {
          audio.removeEventListener('timeupdate', onTimeUpdate);
          if (isFinite(audio.duration) && audio.duration > 0) {
            setDuration(audio.duration);
          } else if (audio.currentTime > 0 && isFinite(audio.currentTime)) {
            setDuration(audio.currentTime);
          }
          audio.currentTime = 0;
        };
        audio.addEventListener('timeupdate', onTimeUpdate);
      }
    };

    const handleDurationChange = () => {
      if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration)) {
        setDuration(audio.duration);
      }
    };

    const handleTimeUpdate = () => {
      if (!isSeeking) {
        setCurrentTime(audio.currentTime);
      }
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      setSeekTime(0);
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('durationchange', handleDurationChange);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);

    // Also attempt Web Audio decoding as fallback for exact duration
    const fetchDuration = async () => {
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioCtx) return;
        const res = await fetch(src);
        const arrayBuf = await res.arrayBuffer();
        const ctx = new AudioCtx();
        const audioBuf = await ctx.decodeAudioData(arrayBuf);
        if (audioBuf && audioBuf.duration > 0) {
          setDuration(audioBuf.duration);
        }
        await ctx.close();
      } catch {
        // Ignore fallback errors
      }
    };
    fetchDuration();

    return () => {
      audio.pause();
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('durationchange', handleDurationChange);
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
      audio
        .play()
        .then(() => setIsPlaying(true))
        .catch((e) => console.log('[VoicePlayer] Play error:', e));
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

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isMuted || volume === 0) {
      const restored = prevVolumeRef.current > 0 ? prevVolumeRef.current : 1;
      setIsMuted(false);
      setVolume(restored);
      if (audioRef.current) audioRef.current.volume = restored;
    } else {
      prevVolumeRef.current = volume;
      setIsMuted(true);
      if (audioRef.current) audioRef.current.volume = 0;
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    try {
      localStorage.setItem('zerovc_chat_audio_volume', String(val));
    } catch {}
    if (val > 0) {
      setIsMuted(false);
      prevVolumeRef.current = val;
    } else {
      setIsMuted(true);
    }
    if (audioRef.current) {
      audioRef.current.volume = val;
    }
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    setSeekTime(newTime);
    setCurrentTime(newTime);
  };

  const handleSeekStart = () => {
    setIsSeeking(true);
    setSeekTime(currentTime);
  };

  const handleSeekEnd = () => {
    setIsSeeking(false);
    if (audioRef.current) {
      audioRef.current.currentTime = seekTime;
    }
  };

  const formatTime = (secs: number) => {
    if (isNaN(secs) || !isFinite(secs) || secs < 0) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const displayTime = isSeeking ? seekTime : currentTime;
  const progressPercent = duration > 0 ? Math.min(100, Math.max(0, (displayTime / duration) * 100)) : 0;
  const effectiveVolume = isMuted ? 0 : volume;

  return (
    <div
      className={`flex items-center gap-3.5 px-4 py-3 bg-background-darkest/95 hover:bg-background-darkest border border-white/10 rounded-2xl max-w-sm sm:max-w-md w-full shadow-lg select-none backdrop-blur-md transition-all ${className}`}
    >
      {/* 1. Play / Pause Button (Left) */}
      <button
        type="button"
        onClick={togglePlay}
        className="w-10 h-10 rounded-full bg-brand-500 hover:bg-brand-600 active:scale-95 text-white flex items-center justify-center flex-shrink-0 transition-all shadow-md shadow-brand-500/20 cursor-pointer"
        title={isPlaying ? 'Pausar Áudio' : 'Ouvir Áudio'}
      >
        {isPlaying ? (
          <Pause className="w-5 h-5 fill-current" />
        ) : (
          <Play className="w-5 h-5 fill-current ml-0.5" />
        )}
      </button>

      {/* 2. Time Slider & Timers (Middle) */}
      <div className="flex-1 flex flex-col justify-center gap-1.5 min-w-0">
        {/* Custom Range Slider Track */}
        <div className="relative w-full flex items-center h-4 group">
          {/* Background Bar */}
          <div className="absolute w-full h-1.5 bg-white/15 rounded-full overflow-hidden pointer-events-none">
            {/* Filled Progress Bar */}
            <div
              className="h-full bg-brand-500 rounded-full transition-[width] duration-75"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          {/* Interactive Range Input */}
          <input
            type="range"
            min={0}
            max={duration > 0 ? duration : 100}
            step={0.05}
            value={displayTime}
            onChange={handleSliderChange}
            onMouseDown={handleSeekStart}
            onMouseUp={handleSeekEnd}
            onTouchStart={handleSeekStart}
            onTouchEnd={handleSeekEnd}
            disabled={!duration}
            className="w-full h-4 opacity-0 cursor-pointer z-10"
            title="Avançar / Retroceder áudio"
          />

          {/* Draggable Thumb Indicator */}
          <div
            className="absolute h-3.5 w-3.5 bg-white rounded-full shadow-md pointer-events-none transition-transform group-hover:scale-110"
            style={{
              left: `calc(${progressPercent}% - 7px)`,
            }}
          />
        </div>

        {/* Timestamps */}
        <div className="flex items-center justify-between text-[11px] font-mono text-gray-400 leading-none px-0.5">
          <span>{formatTime(displayTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* 3. Controls Group (Right: Speed & Volume) */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {/* Speed Switch Button */}
        <button
          type="button"
          onClick={cycleSpeed}
          className="px-2 py-1 rounded-lg text-xs font-bold font-mono text-gray-300 bg-white/5 hover:bg-white/10 hover:text-white border border-white/10 hover:border-white/20 active:scale-95 transition-all cursor-pointer shadow-sm"
          title="Alterar Velocidade de Reprodução"
        >
          {SPEED_OPTIONS[playbackRateIndex]}x
        </button>

        {/* Volume Control with Hover Slider */}
        <div
          className="relative flex items-center group/vol"
          onMouseEnter={() => setIsVolumeHovered(true)}
          onMouseLeave={() => setIsVolumeHovered(false)}
        >
          <button
            type="button"
            onClick={toggleMute}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 active:scale-95 transition-all cursor-pointer border border-transparent hover:border-white/10"
            title={effectiveVolume === 0 ? 'Desmutar' : `Mutar (${Math.round(effectiveVolume * 100)}%)`}
          >
            {effectiveVolume === 0 ? (
              <VolumeX className="w-4 h-4" />
            ) : effectiveVolume < 0.5 ? (
              <Volume1 className="w-4 h-4" />
            ) : (
              <Volume2 className="w-4 h-4" />
            )}
          </button>

          {/* Expandable Slider Container */}
          <div
            className={`overflow-hidden transition-all duration-200 ease-out flex items-center ${
              isVolumeHovered || isDraggingVolume
                ? 'w-16 sm:w-20 opacity-100 ml-1'
                : 'w-0 opacity-0 ml-0 pointer-events-none'
            }`}
          >
            <div className="relative w-16 sm:w-20 flex items-center h-4 group/vtrack">
              {/* Track Background */}
              <div className="absolute w-full h-1.5 bg-white/15 rounded-full overflow-hidden pointer-events-none">
                {/* Progress Fill */}
                <div
                  className="h-full bg-brand-500 rounded-full transition-[width] duration-75"
                  style={{ width: `${effectiveVolume * 100}%` }}
                />
              </div>

              {/* Interactive Range Input */}
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={effectiveVolume}
                onChange={handleVolumeChange}
                onMouseDown={() => setIsDraggingVolume(true)}
                onMouseUp={() => setIsDraggingVolume(false)}
                onTouchStart={() => setIsDraggingVolume(true)}
                onTouchEnd={() => setIsDraggingVolume(false)}
                className="w-full h-4 opacity-0 cursor-pointer z-10"
                title={`Volume: ${Math.round(effectiveVolume * 100)}%`}
              />

              {/* Draggable Thumb */}
              <div
                className="absolute h-3 w-3 bg-white rounded-full shadow-md pointer-events-none transition-transform group-hover/vtrack:scale-110"
                style={{
                  left: `calc(${effectiveVolume * 100}% - 6px)`,
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

