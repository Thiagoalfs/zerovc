// Video Player from Hirael <https://hirael.com/components/display/video-player>
// MIT · Mohammad Shehadeh · https://github.com/MohammadShehadeh/hirael

"use client";

import * as React from "react";
import {
  Maximize,
  Minimize,
  Pause,
  Play,
  Volume2,
  VolumeX,
} from "lucide-react";
import { animate } from "motion/react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

interface VideoPlayerCtx {
  attachVideo: (video: HTMLVideoElement | null) => void;
  playing: boolean;
  duration: number;
  currentTime: number;
  buffered: number;
  volume: number;
  muted: boolean;
  fullscreen: boolean;
  toggle: () => void;
  seek: (time: number) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  toggleFullscreen: () => void;
  media: MediaHandlers;
}

type MediaHandlerName =
  | "onPlay"
  | "onPause"
  | "onEnded"
  | "onTimeUpdate"
  | "onDurationChange"
  | "onLoadedMetadata"
  | "onProgress"
  | "onVolumeChange";

type MediaHandlers = Record<
  MediaHandlerName,
  React.ReactEventHandler<HTMLVideoElement>
>;

const VideoPlayerContext = React.createContext<VideoPlayerCtx | null>(null);

const useVideoPlayer = () => {
  const ctx = React.useContext(VideoPlayerContext);
  if (!ctx) {
    throw new Error(
      "VideoPlayer compound parts must be used inside <VideoPlayer>",
    );
  }
  return ctx;
};

const formatTime = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) return "--:--";
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
};

const IDLE_MS = 2500;

export interface VideoPlayerProps extends React.ComponentProps<"div"> {
  /** Hide the controls and cursor after this many ms without pointer or key input while playing. */
  idleDelay?: number;
}

const VideoPlayer = ({
  idleDelay = IDLE_MS,
  className,
  children,
  onPointerMove,
  ...props
}: VideoPlayerProps) => {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const idleTimerRef = React.useRef<number | null>(null);
  const [playing, setPlaying] = React.useState(false);
  const [duration, setDuration] = React.useState(Number.NaN);
  const [currentTime, setCurrentTime] = React.useState(0);
  const [buffered, setBuffered] = React.useState(0);
  const [volume, setVolumeState] = React.useState(1);
  const [muted, setMuted] = React.useState(false);
  const [nativeFullscreen, setNativeFullscreen] = React.useState(false);
  const [inAppFullscreen, setInAppFullscreen] = React.useState(false);
  const [placeholderSize, setPlaceholderSize] = React.useState<{ width: number; height: number } | null>(null);
  const savedScrollRef = React.useRef<{ el: HTMLElement; scrollTop: number; wasAtBottom: boolean } | null>(null);
  const fullscreen = nativeFullscreen || inAppFullscreen;

  // Idle lives on the DOM and motion fades the controls: pointer movement never re-renders the player.
  const setIdle = React.useCallback((idle: boolean) => {
    const root = rootRef.current;
    if (!root || root.dataset.idle === String(idle)) return;
    root.dataset.idle = String(idle);
    const controls = root.querySelector("[data-slot=video-player-controls]");
    if (controls)
      animate(
        controls,
        { opacity: idle ? 0 : 1 },
        { duration: 0.3, ease: "easeOut" },
      );
  }, []);

  const wake = React.useCallback(() => {
    setIdle(false);
    if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current);
    idleTimerRef.current = window.setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) setIdle(true);
    }, idleDelay);
  }, [idleDelay, setIdle]);

  const restoreParentScroll = React.useCallback(() => {
    const saved = savedScrollRef.current;
    if (!saved) return;
    savedScrollRef.current = null;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        saved.el.scrollTop = saved.wasAtBottom
          ? saved.el.scrollHeight
          : saved.scrollTop;
      });
    });
  }, []);

  React.useEffect(() => {
    document.documentElement.classList.toggle("video-fullscreen", fullscreen);
    return () => {
      document.documentElement.classList.remove("video-fullscreen");
    };
  }, [fullscreen]);

  React.useEffect(() => {
    const onFullscreen = () => {
      const isNative = document.fullscreenElement === rootRef.current;
      setNativeFullscreen(isNative);
      if (!isNative && !inAppFullscreen) restoreParentScroll();
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && inAppFullscreen) {
        setInAppFullscreen(false);
        setPlaceholderSize(null);
        (window as any).electronAPI?.setFullScreen?.(false);
        restoreParentScroll();
      }
    };
    document.addEventListener("fullscreenchange", onFullscreen);
    window.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreen);
      window.removeEventListener("keydown", onEsc);
      if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current);
    };
  }, [inAppFullscreen, restoreParentScroll]);

  // Metadata can load before hydration, when React isn't listening yet; read it off the element on attach.
  const attachVideo = React.useCallback((video: HTMLVideoElement | null) => {
    videoRef.current = video;
    if (!video) return;
    setDuration(video.duration);
    setCurrentTime(video.currentTime);
    setVolumeState(video.volume);
    setMuted(video.muted);
    setPlaying(!video.paused);
    if (video.buffered.length > 0)
      setBuffered(video.buffered.end(video.buffered.length - 1));
  }, []);

  const media = React.useMemo<MediaHandlers>(
    () => ({
      onPlay: () => {
        setPlaying(true);
        wake();
      },
      onPause: () => {
        setPlaying(false);
        setIdle(false);
      },
      onEnded: () => setPlaying(false),
      onTimeUpdate: (event) => setCurrentTime(event.currentTarget.currentTime),
      onDurationChange: (event) => setDuration(event.currentTarget.duration),
      onLoadedMetadata: (event) => {
        const video = event.currentTarget;
        setDuration(video.duration);
        setVolumeState(video.volume);
        setMuted(video.muted);
      },
      onProgress: (event) => {
        const ranges = event.currentTarget.buffered;
        setBuffered(ranges.length > 0 ? ranges.end(ranges.length - 1) : 0);
      },
      onVolumeChange: (event) => {
        setVolumeState(event.currentTarget.volume);
        setMuted(event.currentTarget.muted);
      },
    }),
    [wake, setIdle],
  );

  const toggle = React.useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.currentSrc) return;
    if (video.paused) void video.play().catch(() => undefined);
    else video.pause();
  }, []);

  const seek = React.useCallback((time: number) => {
    const video = videoRef.current;
    if (!video) return;
    const max = Number.isFinite(video.duration) ? video.duration : time;
    video.currentTime = Math.min(Math.max(time, 0), max);
    setCurrentTime(video.currentTime);
  }, []);

  const setVolume = React.useCallback((next: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = Math.min(Math.max(next, 0), 1);
    if (next > 0) video.muted = false;
  }, []);

  const toggleMute = React.useCallback(() => {
    const video = videoRef.current;
    if (video) video.muted = !video.muted;
  }, []);

  const toggleFullscreen = React.useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    const electronAPI = (window as any).electronAPI;

    if (inAppFullscreen || document.fullscreenElement) {
      setInAppFullscreen(false);
      setPlaceholderSize(null);
      electronAPI?.setFullScreen?.(false);
      if (document.fullscreenElement) {
        void document.exitFullscreen().catch(() => undefined);
      }
      restoreParentScroll();
      return;
    }

    let p = root.parentElement;
    while (p) {
      if (p.scrollHeight > p.clientHeight + 2) {
        const style = window.getComputedStyle(p);
        if (style.overflowY === "auto" || style.overflowY === "scroll") {
          savedScrollRef.current = {
            el: p,
            scrollTop: p.scrollTop,
            wasAtBottom: p.scrollHeight - p.scrollTop - p.clientHeight < 8,
          };
          break;
        }
      }
      p = p.parentElement;
    }

    const rect = root.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      setPlaceholderSize({ width: rect.width, height: rect.height });
    }
    setInAppFullscreen(true);
    if (electronAPI?.setFullScreen) {
      electronAPI.setFullScreen(true);
    } else if (typeof root.requestFullscreen === "function") {
      void root.requestFullscreen().catch(() => undefined);
    }
  }, [inAppFullscreen, restoreParentScroll]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    props.onKeyDown?.(event);
    wake();
    if (event.defaultPrevented) return;
    const target = event.target as HTMLElement;
    if (target.closest("button, input, textarea, select, [role='slider']"))
      return;
    if (event.key === " " || event.key === "k") {
      event.preventDefault();
      toggle();
    } else if (event.key === "f") {
      event.preventDefault();
      toggleFullscreen();
    } else if (event.key === "m") {
      event.preventDefault();
      toggleMute();
    }
  };

  const ctx = React.useMemo<VideoPlayerCtx>(
    () => ({
      attachVideo,
      playing,
      duration,
      currentTime,
      buffered,
      volume,
      muted,
      fullscreen,
      toggle,
      seek,
      setVolume,
      toggleMute,
      toggleFullscreen,
      media,
    }),
    [
      attachVideo,
      playing,
      duration,
      currentTime,
      buffered,
      volume,
      muted,
      fullscreen,
      toggle,
      seek,
      setVolume,
      toggleMute,
      toggleFullscreen,
      media,
    ],
  );

  return (
    <VideoPlayerContext.Provider value={ctx}>
      {fullscreen && placeholderSize ? (
        <div
          aria-hidden
          style={{ width: placeholderSize.width, height: placeholderSize.height }}
          className="shrink-0"
        />
      ) : null}
      <div
        ref={rootRef}
        data-slot="video-player"
        data-state={playing ? "playing" : "paused"}
        data-idle="false"
        data-fullscreen={fullscreen}
        tabIndex={-1}
        className={cn(
          "group/video-player relative overflow-hidden rounded-2xl border border-white/10 bg-black/60 text-white shadow-md outline-none data-[idle=true]:cursor-none",
          fullscreen && "!fixed !inset-0 !z-[10000000] !flex !h-screen !w-screen !max-w-none items-center justify-center !rounded-none !border-0 !bg-black",
          className,
        )}
        {...props}
        onPointerMove={(event) => {
          wake();
          onPointerMove?.(event);
        }}
        onKeyDown={handleKeyDown}
      >
        {children}
      </div>
    </VideoPlayerContext.Provider>
  );
};

const VideoPlayerVideo = React.forwardRef<
  HTMLVideoElement,
  React.ComponentPropsWithoutRef<"video">
>(({ className, onClick, ...props }, ref) => {
  const { attachVideo, toggle, media, fullscreen } = useVideoPlayer();
  const composedRef = React.useCallback(
    (video: HTMLVideoElement | null) => {
      attachVideo(video);
      if (typeof ref === "function") ref(video);
      else if (ref) (ref as React.MutableRefObject<HTMLVideoElement | null>).current = video;
    },
    [attachVideo, ref],
  );
  const handlers = Object.fromEntries(
    (Object.keys(media) as MediaHandlerName[]).map((name) => [
      name,
      (event: React.SyntheticEvent<HTMLVideoElement>) => {
        media[name](event);
        props[name]?.(event);
      },
    ]),
  ) as MediaHandlers;

  return (
    <video
      ref={composedRef}
      data-slot="video-player-video"
      playsInline
      preload="metadata"
      className={cn(
        "block size-full object-contain",
        fullscreen && "!h-full !w-full !max-h-none",
        className,
      )}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) toggle();
      }}
      {...props}
      {...handlers}
    />
  );
});
VideoPlayerVideo.displayName = "VideoPlayerVideo";

const VideoPlayerControls = ({
  className,
  onClick,
  ...props
}: React.ComponentProps<"div">) => {
  return (
    <div
      data-slot="video-player-controls"
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(e);
      }}
      className={cn(
        "absolute inset-x-0 bottom-0 flex items-center gap-1 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-2 pt-8 pb-2",
        "group-data-[idle=true]/video-player:pointer-events-none",
        className,
      )}
      {...props}
    />
  );
};

const controlButton =
  "h-8 w-8 rounded-lg text-white/90 hover:text-white hover:bg-white/10";

const VideoPlayerPlay = ({
  className,
  ...props
}: React.ComponentProps<typeof Button>) => {
  const { playing, toggle } = useVideoPlayer();

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      data-slot="video-player-play"
      aria-label={playing ? "Pause" : "Play"}
      onClick={toggle}
      className={cn(controlButton, className)}
      {...props}
    >
      {playing ? <Pause /> : <Play />}
    </Button>
  );
};

const VideoPlayerSeek = ({
  className,
  ...props
}: React.ComponentProps<"div">) => {
  const { duration, currentTime, buffered, seek } = useVideoPlayer();
  const [scrub, setScrub] = React.useState<number | null>(null);

  const hasDuration = Number.isFinite(duration) && duration > 0;
  const max = hasDuration ? duration : 1;
  const value = scrub ?? Math.min(currentTime, max);
  const bufferedPct = hasDuration ? Math.min(buffered / duration, 1) * 100 : 0;

  return (
    <div
      data-slot="video-player-seek"
      className={cn(
        "relative mx-1 flex min-w-0 flex-1 items-center",
        className,
      )}
      {...props}
    >
      <div
        aria-hidden
        data-slot="video-player-buffered"
        className="pointer-events-none absolute left-0 top-1/2 h-1 w-full origin-left -translate-y-1/2 rounded-sm bg-white/25"
        style={{ transform: `translateY(-50%) scaleX(${bufferedPct / 100})` }}
      />
      <Slider
        value={[value]}
        min={0}
        max={max}
        step={0.1}
        disabled={!hasDuration}
        aria-label="Seek"
        onValueChange={(values) => setScrub(values[0] ?? 0)}
        onValueCommit={(values) => {
          seek(values[0] ?? 0);
          setScrub(null);
        }}
      />
    </div>
  );
};

export interface VideoPlayerTimeProps extends React.ComponentProps<"span"> {
  mode?: "elapsed" | "remaining" | "duration";
}

const VideoPlayerTime = ({
  mode = "elapsed",
  className,
  ...props
}: VideoPlayerTimeProps) => {
  const { currentTime, duration } = useVideoPlayer();

  const value =
    mode === "duration"
      ? duration
      : mode === "remaining"
        ? duration - currentTime
        : currentTime;
  const label = formatTime(value);

  return (
    <span
      data-slot="video-player-time"
      data-mode={mode}
      className={cn(
        "shrink-0 px-1 text-xs tabular-nums text-gray-300",
        className,
      )}
      {...props}
    >
      {mode === "remaining" && label !== "--:--" ? `-${label}` : label}
    </span>
  );
};

const VideoPlayerVolume = ({
  className,
  ...props
}: React.ComponentProps<"div">) => {
  const { volume, muted, setVolume, toggleMute } = useVideoPlayer();
  const silent = muted || volume === 0;

  return (
    <div
      data-slot="video-player-volume"
      className={cn("flex shrink-0 items-center gap-1", className)}
      {...props}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        data-slot="video-player-mute"
        aria-label={silent ? "Unmute" : "Mute"}
        onClick={toggleMute}
        className={controlButton}
      >
        {silent ? <VolumeX /> : <Volume2 />}
      </Button>
      <Slider
        value={[muted ? 0 : volume]}
        min={0}
        max={1}
        step={0.01}
        aria-label="Volume"
        onValueChange={(values) => setVolume(values[0] ?? 0)}
        className="w-16 max-sm:hidden"
      />
    </div>
  );
};

const VideoPlayerFullscreen = ({
  className,
  ...props
}: React.ComponentProps<typeof Button>) => {
  const { fullscreen, toggleFullscreen } = useVideoPlayer();

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      data-slot="video-player-fullscreen"
      aria-label={fullscreen ? "Exit full screen" : "Full screen"}
      onClick={(e) => {
        e.stopPropagation();
        toggleFullscreen();
      }}
      className={cn(controlButton, className)}
      {...props}
    >
      {fullscreen ? <Minimize /> : <Maximize />}
    </Button>
  );
};

export {
  VideoPlayer,
  VideoPlayerVideo,
  VideoPlayerControls,
  VideoPlayerPlay,
  VideoPlayerSeek,
  VideoPlayerTime,
  VideoPlayerVolume,
  VideoPlayerFullscreen,
  useVideoPlayer,
};

export default VideoPlayer;
