import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface ImageModalProps {
  imageUrl: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export const ImageModal: React.FC<ImageModalProps> = ({ imageUrl, isOpen, onClose }) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !imageUrl) return null;

  return (
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
        className="fixed top-4 right-4 sm:top-6 sm:right-6 z-50 p-2.5 rounded-full bg-black/60 hover:bg-black/90 text-white/80 hover:text-white border border-white/15 backdrop-blur-md transition-all shadow-2xl active:scale-95"
        title="Fechar (Esc)"
      >
        <X className="w-5 h-5 sm:w-6 sm:h-6" />
      </button>

      {/* Image container: 75% viewport max on desktop, 100% horizontal on mobile */}
      <div
        className="relative flex items-center justify-center max-w-full max-h-full"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={imageUrl}
          alt="Visualização"
          className="w-full sm:w-auto max-w-[100vw] sm:max-w-[75vw] max-h-[85vh] sm:max-h-[75vh] object-contain rounded-xl sm:rounded-2xl shadow-2xl animate-in zoom-in-95 duration-150 border border-white/5"
        />
      </div>
    </div>
  );
};
