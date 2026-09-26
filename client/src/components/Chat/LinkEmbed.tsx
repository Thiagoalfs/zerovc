import React, { useState, useEffect } from 'react';
import { ExternalLink, Globe, Play } from 'lucide-react';
import { LinkMetadata } from '../../types';
import { api } from '../../lib/api';

interface LinkEmbedProps {
  url: string;
  onPreviewImage?: (url: string) => void;
  className?: string;
}

// Global in-memory cache to prevent re-fetching the same link multiple times in chat
const metadataCache = new Map<string, LinkMetadata | null>();
const pendingRequests = new Map<string, Promise<LinkMetadata | null>>();

export const LinkEmbed: React.FC<LinkEmbedProps> = ({ url, onPreviewImage, className = '' }) => {
  const [metadata, setMetadata] = useState<LinkMetadata | null>(() => metadataCache.get(url) || null);
  const [loading, setLoading] = useState<boolean>(() => !metadataCache.has(url));
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);

  useEffect(() => {
    if (metadataCache.has(url)) {
      setMetadata(metadataCache.get(url) || null);
      setLoading(false);
      return;
    }

    let isMounted = true;
    setLoading(true);

    let fetchPromise = pendingRequests.get(url);
    if (!fetchPromise) {
      fetchPromise = api.linkPreview.getMetadata(url).then((res) => {
        metadataCache.set(url, res);
        pendingRequests.delete(url);
        return res;
      });
      pendingRequests.set(url, fetchPromise);
    }

    fetchPromise
      .then((data) => {
        if (isMounted) {
          setMetadata(data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (isMounted) {
          metadataCache.set(url, null);
          setMetadata(null);
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [url]);

  if (loading) {
    return null;
  }

  // If no meaningful title or description or image was found, don't show an empty box
  if (!metadata || (!metadata.title && !metadata.description && !metadata.image_url)) {
    return null;
  }

  // Check if it is a YouTube video URL for inline player
  const getYouTubeEmbedUrl = (rawUrl: string): string | null => {
    try {
      const u = new URL(rawUrl);
      if (u.hostname.includes('youtube.com')) {
        const v = u.searchParams.get('v');
        if (v) return `https://www.youtube-nocookie.com/embed/${v}?autoplay=1`;
        if (u.pathname.startsWith('/shorts/')) {
          const id = u.pathname.split('/shorts/')[1]?.split('/')[0];
          if (id) return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1`;
        }
      } else if (u.hostname.includes('youtu.be')) {
        const id = u.pathname.replace(/^\//, '').split('?')[0];
        if (id) return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1`;
      }
    } catch {}
    return null;
  };

  const youtubeEmbedUrl = getYouTubeEmbedUrl(url);

  // Border color accent based on themeColor or default brand color
  const borderColor = metadata.theme_color || '#6366f1';

  return (
    <div
      className={`my-1.5 max-w-lg w-full rounded-xl bg-background-darkest/90 border border-white/10 hover:border-white/20 transition-all overflow-hidden flex flex-col shadow-lg select-text ${className}`}
      style={{ borderLeft: `4px solid ${borderColor}` }}
    >
      <div className="p-3.5 flex flex-col gap-2">
        {/* Site Name & Favicon */}
        <div className="flex items-center justify-between gap-2 text-xs text-gray-400">
          <div className="flex items-center gap-1.5 overflow-hidden">
            {metadata.favicon ? (
              <img
                src={metadata.favicon}
                alt=""
                className="w-3.5 h-3.5 rounded-sm object-contain flex-shrink-0"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            ) : (
              <Globe className="w-3.5 h-3.5 flex-shrink-0 text-gray-500" />
            )}
            <span className="font-semibold text-gray-300 truncate">
              {metadata.site_name || new URL(url).hostname}
            </span>
          </div>

          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-gray-400 hover:text-white transition-colors flex-shrink-0 p-0.5 rounded hover:bg-white/5"
            title="Abrir link original"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

        {/* Title */}
        {metadata.title && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-sm font-bold text-brand-400 hover:text-brand-300 hover:underline leading-snug line-clamp-2 break-words"
          >
            {metadata.title}
          </a>
        )}

        {/* Description */}
        {metadata.description && (
          <p className="text-xs text-gray-300/90 leading-relaxed line-clamp-3 break-words select-text">
            {metadata.description}
          </p>
        )}
      </div>

      {/* Embedded YouTube Player or OpenGraph Image */}
      {youtubeEmbedUrl && isVideoPlaying ? (
        <div className="relative w-full aspect-video bg-black">
          <iframe
            src={youtubeEmbedUrl}
            title={metadata.title || 'Vídeo incorporado'}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="w-full h-full border-0"
          />
        </div>
      ) : metadata.image_url ? (
        <div className="relative w-full max-h-72 overflow-hidden bg-black/40 group/embed-img">
          <img
            src={metadata.image_url}
            alt={metadata.title || 'Preview do link'}
            className="w-full h-auto max-h-72 object-cover cursor-pointer hover:opacity-95 transition-opacity"
            onClick={(e) => {
              e.stopPropagation();
              if (youtubeEmbedUrl) {
                setIsVideoPlaying(true);
              } else if (onPreviewImage) {
                onPreviewImage(metadata.image_url!);
              } else {
                window.open(url, '_blank');
              }
            }}
          />

          {/* YouTube Play Overlay Icon */}
          {youtubeEmbedUrl && (
            <div
              onClick={(e) => {
                e.stopPropagation();
                setIsVideoPlaying(true);
              }}
              className="absolute inset-0 bg-black/30 hover:bg-black/10 flex items-center justify-center cursor-pointer transition-all group-hover/embed-img:scale-105"
            >
              <div className="w-12 h-12 rounded-full bg-brand-500/90 hover:bg-brand-500 text-white flex items-center justify-center shadow-lg transition-transform">
                <Play className="w-5 h-5 fill-white translate-x-0.5" />
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
};
