export interface ImageOptimizationOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  targetMimeType?: 'image/webp' | 'image/jpeg';
}

/**
 * Compresses and converts image files to lightweight WebP format before uploading.
 * Skips animated GIFs and SVGs to preserve animation and vector fidelity.
 */
export async function optimizeImageForUpload(
  file: File,
  options: ImageOptimizationOptions = {}
): Promise<File> {
  const {
    maxWidth = 1920,
    maxHeight = 1080,
    quality = 0.85,
    targetMimeType = 'image/webp',
  } = options;

  // Don't process non-images, animated GIFs, or SVGs
  if (!file.type.startsWith('image/') || file.type === 'image/gif' || file.type === 'image/svg+xml') {
    return file;
  }

  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      let width = img.naturalWidth || img.width;
      let height = img.naturalHeight || img.height;

      if (!width || !height) {
        resolve(file);
        return;
      }

      // Calculate resized dimensions while preserving aspect ratio
      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
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

          // If conversion didn't reduce file size significantly, keep original
          if (blob.size >= file.size && width === img.naturalWidth && height === img.naturalHeight) {
            resolve(file);
            return;
          }

          const originalName = file.name.replace(/\.[^/.]+$/, '');
          const extension = targetMimeType === 'image/webp' ? '.webp' : '.jpg';
          const optimizedFile = new File([blob], `${originalName}${extension}`, {
            type: targetMimeType,
            lastModified: Date.now(),
          });

          resolve(optimizedFile);
        },
        targetMimeType,
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(file);
    };

    img.src = objectUrl;
  });
}
