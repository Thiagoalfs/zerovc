import React, { useEffect, useRef } from 'react';
import { X, Copy, Download, Link, ExternalLink } from 'lucide-react';
import { useContextMenu, ContextMenuItem } from '../ContextMenu/useContextMenu';
import { ContextMenu } from '../ContextMenu/ContextMenu';
import { copyToClipboard } from '../../utils/clipboard';

interface ImageModalProps {
  imageUrl: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export const ImageModal: React.FC<ImageModalProps> = ({ imageUrl, isOpen, onClose }) => {
  const { menu, openContextMenu, closeContextMenu } = useContextMenu();
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (menu) {
          closeContextMenu();
        } else {
          onClose();
        }
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose, menu, closeContextMenu]);

  if (!isOpen || !imageUrl) return null;

  const getFullUrl = (url: string) => {
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    return new URL(url, window.location.origin).href;
  };

  const copyImageToClipboard = async (url: string) => {
    try {
      const fullUrl = getFullUrl(url);
      const res = await fetch(fullUrl);
      const blob = await res.blob();
      let pngBlob = blob;

      if (blob.type !== 'image/png') {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = reject;
          img.src = fullUrl;
        });

        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          pngBlob = await new Promise<Blob>((resolve, reject) => {
            canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Canvas conversion failed'))), 'image/png');
          });
        }
      }

      if (navigator.clipboard && typeof navigator.clipboard.write === 'function' && typeof ClipboardItem !== 'undefined') {
        await navigator.clipboard.write([
          new ClipboardItem({
            'image/png': pngBlob,
          }),
        ]);
        return;
      }
    } catch (err) {
      console.warn('Direct image copy failed, copying link fallback:', err);
    }
    await copyToClipboard(getFullUrl(url));
  };

  const saveImage = async (url: string) => {
    try {
      const fullUrl = getFullUrl(url);
      const res = await fetch(fullUrl);
      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = blobUrl;
      const pathname = new URL(fullUrl).pathname;
      const rawFilename = pathname.split('/').pop() || 'imagem';
      const filename = rawFilename.includes('.') ? rawFilename : `${rawFilename}.png`;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(blobUrl);
      }, 150);
    } catch {
      const a = document.createElement('a');
      a.href = getFullUrl(url);
      a.download = 'imagem.png';
      a.target = '_blank';
      a.click();
    }
  };

  const copyImageLink = async (url: string) => {
    await copyToClipboard(getFullUrl(url));
  };

  const openImageLink = (url: string) => {
    window.open(getFullUrl(url), '_blank', 'noopener,noreferrer');
  };

  const getMenuItems = (): ContextMenuItem[] => [
    {
      label: 'Copiar imagem',
      icon: <Copy className="w-4 h-4 text-gray-300" />,
      onClick: () => copyImageToClipboard(imageUrl),
    },
    {
      label: 'Salvar imagem',
      icon: <Download className="w-4 h-4 text-gray-300" />,
      onClick: () => saveImage(imageUrl),
    },
    {
      label: '',
      separator: true,
    },
    {
      label: 'Copiar link da imagem',
      icon: <Link className="w-4 h-4 text-gray-300" />,
      onClick: () => copyImageLink(imageUrl),
    },
    {
      label: 'Abrir link da imagem',
      icon: <ExternalLink className="w-4 h-4 text-gray-300" />,
      onClick: () => openImageLink(imageUrl),
    },
  ];

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    openContextMenu(e, getMenuItems());
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    const clientX = touch.clientX;
    const clientY = touch.clientY;

    longPressTimerRef.current = setTimeout(() => {
      openContextMenu({ clientX, clientY, preventDefault: () => {}, stopPropagation: () => {} }, getMenuItems());
    }, 500);
  };

  const handleTouchEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md select-none p-2 sm:p-6 animate-in fade-in duration-150"
        onClick={onClose}
      >
        {/* Close button outside the image */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="fixed top-4 right-4 sm:top-6 sm:right-6 z-50 p-2.5 rounded-full bg-black/60 hover:bg-black/90 text-white/80 hover:text-white border border-white/15 backdrop-blur-md transition-all shadow-2xl active:scale-95 cursor-pointer"
          title="Fechar (Esc)"
        >
          <X className="w-5 h-5 sm:w-6 sm:h-6" />
        </button>

        {/* Image container: 75% viewport max on desktop, 100% horizontal on mobile */}
        <div
          className="relative flex items-center justify-center max-w-full max-h-full cursor-context-menu"
          onClick={(e) => e.stopPropagation()}
          onContextMenu={handleContextMenu}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onTouchMove={handleTouchEnd}
        >
          <img
            src={imageUrl}
            alt="Visualização"
            className="w-full sm:w-auto max-w-[100vw] sm:max-w-[75vw] max-h-[85vh] sm:max-h-[75vh] object-contain rounded-xl shadow-2xl animate-in zoom-in-95 duration-150 border border-white/5 select-none"
          />
        </div>
      </div>

      <ContextMenu menu={menu} onClose={closeContextMenu} />
    </>
  );
};
