/**
 * Image processing utilities for ZeroVC:
 * - WebP conversion for static images (PNG, JPG, BMP)
 * - GIF preservation for animated avatars/banners
 * - High-resolution crop & frame rendering
 */

export function isGif(file: File): boolean {
  return file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif');
}

export async function convertToWebP(
  file: File,
  options?: { quality?: number; maxWidth?: number; maxHeight?: number }
): Promise<File> {
  // If it's not an image, or if it's an animated GIF, preserve original format
  if (!file.type.startsWith('image/') || isGif(file)) {
    return file;
  }

  // If it's already WebP, return as is
  if (file.type === 'image/webp') {
    return file;
  }

  const quality = options?.quality ?? 0.88;
  const maxWidth = options?.maxWidth ?? 2560;
  const maxHeight = options?.maxHeight ?? 2560;

  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      let width = img.naturalWidth || img.width;
      let height = img.naturalHeight || img.height;

      // Maintain aspect ratio while respecting maximum dimensions
      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.max(1, Math.round(width * ratio));
        height = Math.max(1, Math.round(height * ratio));
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(file);
        return;
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(file);
            return;
          }
          const baseName = file.name.replace(/\.[^/.]+$/, '');
          const newFile = new File([blob], `${baseName}.webp`, {
            type: 'image/webp',
            lastModified: Date.now(),
          });
          resolve(newFile);
        },
        'image/webp',
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };

    img.src = url;
  });
}

export interface CropParameters {
  zoom: number;
  rotation: number; // in degrees (0, 90, 180, 270)
  pan: { x: number; y: number }; // pan offsets in pixels relative to viewport center
  viewportSize: { width: number; height: number }; // pixel dimensions of the crop window
  outputSize: { width: number; height: number }; // target output dimensions (e.g. 512x512)
  originalFile: File;
  baseScale?: number; // base scale factor that normalizes natural image size to viewport
}

export async function cropImageToWebP(
  imageSource: HTMLImageElement,
  params: CropParameters
): Promise<File> {
  // If original is a GIF, preserve the animated GIF file structure
  if (isGif(params.originalFile)) {
    return params.originalFile;
  }

  const { zoom, rotation, pan, viewportSize, outputSize, originalFile } = params;

  const canvas = document.createElement('canvas');
  canvas.width = outputSize.width;
  canvas.height = outputSize.height;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return convertToWebP(originalFile);
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // Clear background (supports transparent avatar background)
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const imgWidth = imageSource.naturalWidth || imageSource.width || 1;
  const imgHeight = imageSource.naturalHeight || imageSource.height || 1;

  const isRotated90 = (rotation / 90) % 2 !== 0;
  const effectiveWidth = isRotated90 ? imgHeight : imgWidth;
  const effectiveHeight = isRotated90 ? imgWidth : imgHeight;

  // Base scale: covers the viewport at zoom = 1
  const baseScale =
    params.baseScale ??
    Math.max(
      viewportSize.width / effectiveWidth,
      viewportSize.height / effectiveHeight
    );

  // Calculate scale factor between viewport and output resolution
  const outputScale = outputSize.width / viewportSize.width;

  // 1. Translate to center of canvas
  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);

  // 2. Apply screen pan translated to canvas resolution
  ctx.translate(pan.x * outputScale, pan.y * outputScale);

  // 3. Apply rotation
  if (rotation !== 0) {
    ctx.rotate((rotation * Math.PI) / 180);
  }

  // 4. Apply scale (baseScale * zoom * outputScale)
  const finalScale = baseScale * zoom * outputScale;
  ctx.scale(finalScale, finalScale);

  // 5. Draw image centered
  ctx.drawImage(imageSource, -imgWidth / 2, -imgHeight / 2, imgWidth, imgHeight);

  ctx.restore();

  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          resolve(originalFile);
          return;
        }
        const baseName = originalFile.name.replace(/\.[^/.]+$/, '');
        const croppedFile = new File([blob], `${baseName}_cropped.webp`, {
          type: 'image/webp',
          lastModified: Date.now(),
        });
        resolve(croppedFile);
      },
      'image/webp',
      0.92
    );
  });
}
