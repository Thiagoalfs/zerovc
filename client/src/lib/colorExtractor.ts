/**
 * Dominant color extraction utility for Discord-like participant card backgrounds.
 */

const colorCache = new Map<string, string>();

/**
 * Extracts dominant/average color from an image URL using an offscreen canvas.
 * Falls back to a deterministic pleasing dark tone if CORS or loading fails.
 */
export async function getDominantColorFromImage(imageUrl: string, fallbackSeed?: string): Promise<string> {
  if (!imageUrl) {
    return fallbackSeed ? generateColorFromName(fallbackSeed) : '#2b2d31';
  }

  if (colorCache.has(imageUrl)) {
    return colorCache.get(imageUrl)!;
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = imageUrl;

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          const fallback = fallbackSeed ? generateColorFromName(fallbackSeed) : '#2b2d31';
          resolve(fallback);
          return;
        }

        // Downsample to 24x24 for instant computation
        canvas.width = 24;
        canvas.height = 24;
        ctx.drawImage(img, 0, 0, 24, 24);

        const imageData = ctx.getImageData(0, 0, 24, 24).data;
        let rSum = 0;
        let gSum = 0;
        let bSum = 0;
        let count = 0;

        for (let i = 0; i < imageData.length; i += 4) {
          const a = imageData[i + 3];
          if (a > 40) {
            rSum += imageData[i];
            gSum += imageData[i + 1];
            bSum += imageData[i + 2];
            count++;
          }
        }

        if (count > 0) {
          const r = Math.round(rSum / count);
          const g = Math.round(gSum / count);
          const b = Math.round(bSum / count);

          const result = `rgb(${r}, ${g}, ${b})`;
          colorCache.set(imageUrl, result);
          resolve(result);
        } else {
          const fallback = fallbackSeed ? generateColorFromName(fallbackSeed) : '#2b2d31';
          colorCache.set(imageUrl, fallback);
          resolve(fallback);
        }
      } catch {
        const fallback = fallbackSeed ? generateColorFromName(fallbackSeed) : '#2b2d31';
        colorCache.set(imageUrl, fallback);
        resolve(fallback);
      }
    };

    img.onerror = () => {
      const fallback = fallbackSeed ? generateColorFromName(fallbackSeed) : '#2b2d31';
      colorCache.set(imageUrl, fallback);
      resolve(fallback);
    };
  });
}

/**
 * Generates a consistent, dark Discord-style background color from any string seed.
 */
export function generateColorFromName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash) % 360;
  return `hsl(${h}, 25%, 22%)`;
}
