import React, { useState, useEffect } from 'react';
import { ExternalLink, Film, Loader2 } from 'lucide-react';
import { LinkMetadata } from '../../types';
import { api } from '../../lib/api';
import { GifEmbed } from './GifEmbed';
import { LinkEmbed } from './LinkEmbed';

interface SmartGifEmbedProps {
  url: string;
  onPreviewImage?: (url: string) => void;
  onImageLoad?: () => void;
  className?: string;
}

// In-memory cache for fast reuse and deduplication across chat messages
const gifMetadataCache = new Map<string, LinkMetadata | null>();
const pendingGifRequests = new Map<string, Promise<LinkMetadata | null>>();

export const SmartGifEmbed: React.FC<SmartGifEmbedProps> = ({
  url,
  onPreviewImage,
  onImageLoad,
  className = '',
}) => {
  const [metadata, setMetadata] = useState<LinkMetadata | null>(() => gifMetadataCache.get(url) || null);
  const [loading, setLoading] = useState<boolean>(() => !gifMetadataCache.has(url));
  const [hasError, setHasError] = useState<boolean>(false);

  useEffect(() => {
    if (gifMetadataCache.has(url)) {
      setMetadata(gifMetadataCache.get(url) || null);
      setLoading(false);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setHasError(false);

    let fetchPromise = pendingGifRequests.get(url);
    if (!fetchPromise) {
      fetchPromise = api.linkPreview
        .getMetadata(url)
        .then((res) => {
          gifMetadataCache.set(url, res);
          pendingGifRequests.delete(url);
          return res;
        })
        .catch((err) => {
          gifMetadataCache.set(url, null);
          pendingGifRequests.delete(url);
          throw err;
        });
      pendingGifRequests.set(url, fetchPromise);
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
          setHasError(true);
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [url]);

  // Provider label from URL domain
  const getProviderInfo = (targetUrl: string) => {
    try {
      const parsed = new URL(targetUrl);
      if (parsed.hostname.includes('tenor.com')) {
        return { name: 'Tenor', color: '#0076FF' };
      }
      if (parsed.hostname.includes('klipy.co') || parsed.hostname.includes('klipy.com')) {
        return { name: 'Klipy', color: '#6366F1' };
      }
      if (parsed.hostname.includes('giphy.com')) {
        return { name: 'GIPHY', color: '#00FF99' };
      }
    } catch {}
    return { name: 'GIF', color: '#5865F2' };
  };

  const provider = getProviderInfo(url);

  if (loading) {
    return (
      <div
        className={`w-64 h-48 sm:w-72 sm:h-52 rounded-2xl bg-background-darkest/70 border border-white/10 flex flex-col items-center justify-center gap-2.5 animate-pulse select-none ${className}`}
      >
        <div className="flex items-center gap-2 text-xs font-semibold text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin text-brand-400" />
          <span>Carregando GIF ({provider.name})...</span>
        </div>
      </div>
    );
  }

  // If loading failed or no image/video was extracted, fallback to standard link embed
  if (hasError || !metadata || (!metadata.image_url && !metadata.video_url)) {
    return <LinkEmbed url={url} onPreviewImage={onPreviewImage} className={className} />;
  }

  const mediaSrc = metadata.image_url || metadata.video_url || '';
  const isDirectVideo = !!metadata.video_url && !metadata.image_url;

  return (
    <div className={`flex flex-col items-start group/smart-gif select-none ${className}`}>
      {isDirectVideo ? (
        <div className="rounded-2xl overflow-hidden border border-white/10 max-w-sm sm:max-w-md bg-black/50 shadow-md">
          <video
            src={mediaSrc}
            controls
            autoPlay
            loop
            muted
            playsInline
            onLoadedData={() => onImageLoad?.()}
            className="max-h-[350px] max-w-full w-auto h-auto rounded-2xl block"
          />
        </div>
      ) : (
        <GifEmbed
          src={mediaSrc}
          alt={metadata.title || `GIF ${provider.name}`}
          isGif={true}
          onPreviewImage={onPreviewImage}
          onImageLoad={onImageLoad}
        />
      )}

      {/* Subtle provider attribution link (Tenor / Klipy / GIPHY) */}
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-gray-400 hover:text-gray-200 transition-colors px-1 py-0.5 rounded hover:bg-white/5"
        title={`Abrir página original no ${provider.name}`}
      >
        <Film className="w-3 h-3 text-gray-400" />
        <span>Via {metadata.site_name || provider.name}</span>
        <ExternalLink className="w-2.5 h-2.5 opacity-60" />
      </a>
    </div>
  );
};
