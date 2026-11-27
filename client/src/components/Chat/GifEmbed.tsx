import React, { useState, useRef, useEffect } from 'react';
import { Star } from 'lucide-react';
import { useSettingsStore } from '../../stores/settingsStore';
import { useFavoriteGifStore } from '../../stores/favoriteGifStore';

interface GifEmbedProps {
  src: string;
  alt?: string;
  isGif?: boolean;
  onPreviewImage?: (url: string) => void;
  onImageLoad?: () => void;
  className?: string;
}

export const GifEmbed: React.FC<GifEmbedProps> = ({
  src,
  alt = 'GIF / Imagem',
  isGif = false,
  onPreviewImage,
  onImageLoad,
  className = '',
}) => {
  const autoplayGifs = useSettingsStore((s) => s.autoplayGifs);
  const { isFavorited, toggleFavorite } = useFavoriteGifStore();
  const favorited = isFavorited(src);

  const [isHovered, setIsHovered] = useState(false);
  const [isPlayingManual, setIsPlayingManual] = useState(false);
  const [frozenSrc, setFrozenSrc] = useState<string | null>(null);

  const imgRef = useRef<HTMLImageElement>(null);

  const shouldAnimate = !isGif || autoplayGifs || isHovered || isPlayingManual;

  // Generate static frame when autoplay is disabled
  useEffect(() => {
    if (!isGif || autoplayGifs) {
      setFrozenSrc(null);
      return;
    }

    let isMounted = true;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = src;

    img.onload = () => {
      if (!isMounted) return;
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || 300;
        canvas.height = img.naturalHeight || 200;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/png');
          setFrozenSrc(dataUrl);
        }
      } catch {
        // Fallback for strict CORS
      }
    };

    return () => {
      isMounted = false;
    };
  }, [src, isGif, autoplayGifs]);

  const activeSrc = shouldAnimate ? src : frozenSrc || src;

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`relative group/gif overflow-hidden rounded-2xl border border-white/10 shadow-md select-none w-fit ${className}`}
    >
      <img
        ref={imgRef}
        src={activeSrc}
        alt={alt}
        loading="lazy"
        decoding="async"
        onLoad={() => onImageLoad?.()}
        onClick={(e) => {
          e.stopPropagation();
          if (onPreviewImage) {
            onPreviewImage(src);
          } else {
            window.open(src, '_blank');
          }
        }}
        className="max-h-[350px] max-w-full w-auto h-auto object-contain rounded-2xl cursor-pointer hover:opacity-95 transition-opacity block"
      />

      {/* Static / Paused Corner Badge */}
      {isGif && !autoplayGifs && !shouldAnimate && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIsPlayingManual(true);
          }}
          className="absolute top-2 left-2 z-10 bg-black/75 hover:bg-black/90 text-white border border-white/15 rounded px-1.5 py-0.5 font-bold text-[10px] tracking-wider uppercase shadow-sm cursor-pointer transition-colors"
          aria-label="Clique ou passe o mouse para reproduzir GIF"
        >
          GIF
        </button>
      )}

      {/* Favorite Star Button */}
      {isGif && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            toggleFavorite(src);
          }}
          className={`absolute top-2 right-2 p-1.5 rounded-xl backdrop-blur-md transition-all shadow-md cursor-pointer z-10 ${
            favorited
              ? 'bg-amber-500 text-white opacity-100'
              : 'bg-black/60 text-white/70 hover:text-white hover:bg-black/90 opacity-0 group-hover/gif:opacity-100'
          }`}
          aria-label={favorited ? 'Remover dos favoritos' : 'Favoritar GIF'}
        >
          <Star className={`w-4 h-4 ${favorited ? 'fill-current' : ''}`} />
        </button>
      )}
    </div>
  );
};
