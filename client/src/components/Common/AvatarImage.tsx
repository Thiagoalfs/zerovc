import React, { useEffect, useState } from 'react';

const MAX_CACHE_ENTRIES = 200;
const downscaledAvatarCache = new Map<string, string>();
const inflightRequests = new Map<string, Promise<string>>();

function setCacheEntry(key: string, value: string): void {
  if (downscaledAvatarCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = downscaledAvatarCache.keys().next().value;
    if (oldestKey) {
      const oldestVal = downscaledAvatarCache.get(oldestKey);
      if (oldestVal && oldestVal.startsWith('blob:')) {
        try {
          URL.revokeObjectURL(oldestVal);
        } catch {}
      }
      downscaledAvatarCache.delete(oldestKey);
    }
  }
  downscaledAvatarCache.set(key, value);
}

function isAnimatedOrBypassUrl(src: string): boolean {
  if (!src) return true;
  const lower = src.toLowerCase();
  if (lower.startsWith('blob:') || lower.startsWith('data:image/gif')) return true;
  const pathOnly = lower.split('?')[0].split('#')[0];
  return pathOnly.endsWith('.gif') || pathOnly.endsWith('.svg');
}

/**
 * Progressive 50% step-down mipmap downsampling on 2D canvas.
 * Prevents WebKitGTK / Chromium single-pass bilinear/nearest-neighbor aliasing
 * when shrinking large (e.g. 512x512) avatars down to 16px-64px UI slots.
 */
async function generateCrispAvatarUrl(src: string, targetPx: number): Promise<string> {
  const cacheKey = `${src}::${targetPx}`;
  const cached = downscaledAvatarCache.get(cacheKey);
  if (cached) return cached;

  const existing = inflightRequests.get(cacheKey);
  if (existing) return existing;

  const task = new Promise<string>((resolve) => {
    const img = new Image();
    if (/^https?:\/\//i.test(src)) {
      img.crossOrigin = 'anonymous';
    }
    img.decoding = 'async';

    img.onload = () => {
      try {
        const natW = img.naturalWidth || img.width;
        const natH = img.naturalHeight || img.height;

        if (!natW || !natH || (natW <= targetPx * 1.25 && natH <= targetPx * 1.25)) {
          setCacheEntry(cacheKey, src);
          resolve(src);
          return;
        }

        // Aspect-preserving cover crop to square targetPx x targetPx
        const side = Math.min(natW, natH);
        const sx = Math.floor((natW - side) / 2);
        const sy = Math.floor((natH - side) / 2);

        let curCanvas = document.createElement('canvas');
        let curSize = side;
        curCanvas.width = curSize;
        curCanvas.height = curSize;

        const firstCtx = curCanvas.getContext('2d');
        if (!firstCtx) {
          resolve(src);
          return;
        }
        firstCtx.imageSmoothingEnabled = true;
        firstCtx.imageSmoothingQuality = 'high';
        firstCtx.drawImage(img, sx, sy, side, side, 0, 0, curSize, curSize);

        // Step down by at most 50% per pass until within 2x of targetPx
        while (curSize * 0.5 > targetPx) {
          const nextSize = Math.max(targetPx, Math.round(curSize * 0.5));
          const nextCanvas = document.createElement('canvas');
          nextCanvas.width = nextSize;
          nextCanvas.height = nextSize;
          const nextCtx = nextCanvas.getContext('2d');
          if (!nextCtx) break;
          nextCtx.imageSmoothingEnabled = true;
          nextCtx.imageSmoothingQuality = 'high';
          nextCtx.drawImage(curCanvas, 0, 0, curSize, curSize, 0, 0, nextSize, nextSize);
          curCanvas = nextCanvas;
          curSize = nextSize;
        }

        if (curSize !== targetPx) {
          const finalCanvas = document.createElement('canvas');
          finalCanvas.width = targetPx;
          finalCanvas.height = targetPx;
          const finalCtx = finalCanvas.getContext('2d');
          if (finalCtx) {
            finalCtx.imageSmoothingEnabled = true;
            finalCtx.imageSmoothingQuality = 'high';
            finalCtx.drawImage(curCanvas, 0, 0, curSize, curSize, 0, 0, targetPx, targetPx);
            curCanvas = finalCanvas;
          }
        }

        curCanvas.toBlob(
          (blob) => {
            if (!blob) {
              resolve(src);
              return;
            }
            const objectUrl = URL.createObjectURL(blob);
            setCacheEntry(cacheKey, objectUrl);
            resolve(objectUrl);
          },
          'image/webp',
          0.94
        );
      } catch {
        // Canvas tainted by CORS or unsupported — fall back to original URL
        resolve(src);
      }
    };

    img.onerror = () => {
      resolve(src);
    };

    img.src = src;
  }).finally(() => {
    inflightRequests.delete(cacheKey);
  });

  inflightRequests.set(cacheKey, task);
  return task;
}

export interface AvatarImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  /** Rendered CSS size in px (used to compute a crisp 2x Retina mipmap). */
  displaySize?: number;
}

export const AvatarImage: React.FC<AvatarImageProps> = ({
  src,
  displaySize = 40,
  className = 'w-full h-full object-cover',
  decoding = 'async',
  ...rest
}) => {
  const dpr = typeof window !== 'undefined' ? Math.max(2, Math.ceil(window.devicePixelRatio || 2)) : 2;
  const targetPx = Math.min(512, Math.max(48, Math.round(displaySize * dpr)));
  const bypass = isAnimatedOrBypassUrl(src);
  const cacheKey = `${src}::${targetPx}`;

  const [resolvedSrc, setResolvedSrc] = useState<string>(() => {
    if (bypass) return src;
    return downscaledAvatarCache.get(cacheKey) || src;
  });

  useEffect(() => {
    if (bypass) {
      setResolvedSrc(src);
      return;
    }

    const cached = downscaledAvatarCache.get(cacheKey);
    if (cached) {
      setResolvedSrc(cached);
      return;
    }

    let cancelled = false;
    setResolvedSrc(src);
    void generateCrispAvatarUrl(src, targetPx).then((nextUrl) => {
      if (!cancelled) {
        setResolvedSrc(nextUrl);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [src, targetPx, bypass, cacheKey]);

  return <img src={resolvedSrc} className={className} decoding={decoding} {...rest} />;
};
