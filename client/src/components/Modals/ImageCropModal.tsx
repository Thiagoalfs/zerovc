import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  X,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Sparkles,
  Check,
  Move,
  RotateCcw,
  Film,
} from 'lucide-react';
import { isGif, cropImageToWebP } from '../../utils/image';

export type CropType = 'avatar' | 'banner' | 'guildIcon' | 'guildBanner';

interface ImageCropModalProps {
  isOpen: boolean;
  file: File | null;
  cropType: CropType;
  onConfirm: (croppedFile: File) => void;
  onCancel: () => void;
}

export const ImageCropModal: React.FC<ImageCropModalProps> = ({
  isOpen,
  file,
  cropType,
  onConfirm,
  onCancel,
}) => {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [zoom, setZoom] = useState<number>(1);
  const [rotation, setRotation] = useState<number>(0);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isProcessing, setIsProcessing] = useState(false);

  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const isAnimatedGif = file ? isGif(file) : false;

  // Viewport & Output dimensions based on cropType
  const isBanner = cropType === 'banner' || cropType === 'guildBanner';
  const viewportSize = isBanner
    ? { width: 480, height: 192 } // 2.5:1 ratio
    : { width: 280, height: 280 }; // 1:1 ratio

  const outputSize = isBanner
    ? { width: 1200, height: 480 }
    : { width: 512, height: 512 };

  // Load and reset image when file changes or modal opens
  useEffect(() => {
    if (isOpen && file) {
      const url = URL.createObjectURL(file);
      setImageSrc(url);
      setZoom(1);
      setRotation(0);
      setPan({ x: 0, y: 0 });
      setIsProcessing(false);

      return () => {
        URL.revokeObjectURL(url);
      };
    } else {
      setImageSrc(null);
    }
  }, [isOpen, file]);

  // Mouse wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY * -0.0015;
    setZoom((prev) => Math.min(Math.max(prev + delta, 0.5), 3));
  }, []);

  // Mouse drag handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Touch drag handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      setIsDragging(true);
      setDragStart({
        x: e.touches[0].clientX - pan.x,
        y: e.touches[0].clientY - pan.y,
      });
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || e.touches.length !== 1) return;
    setPan({
      x: e.touches[0].clientX - dragStart.x,
      y: e.touches[0].clientY - dragStart.y,
    });
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };

  const handleRotate = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  const handleReset = () => {
    setZoom(1);
    setRotation(0);
    setPan({ x: 0, y: 0 });
  };

  const handleApply = async () => {
    if (!file || !imgRef.current) return;
    setIsProcessing(true);

    try {
      if (isAnimatedGif) {
        // For animated GIFs, pass original file intact to keep all animation frames
        onConfirm(file);
      } else {
        const croppedFile = await cropImageToWebP(imgRef.current, {
          zoom,
          rotation,
          pan,
          viewportSize,
          outputSize,
          originalFile: file,
        });
        onConfirm(croppedFile);
      }
    } catch (err) {
      console.error('Failed to crop image:', err);
      onConfirm(file);
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isOpen || !file || !imageSrc) return null;

  const modalTitle = (() => {
    switch (cropType) {
      case 'avatar':
        return 'Enquadrar Foto de Perfil';
      case 'banner':
        return 'Enquadrar Banner de Perfil';
      case 'guildIcon':
        return 'Enquadrar Ícone do Servidor';
      case 'guildBanner':
        return 'Enquadrar Banner do Servidor';
    }
  })();

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 select-none animate-in fade-in duration-150"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <div className="bg-background-darkest w-full max-w-lg rounded-3xl overflow-hidden shadow-2xl border border-white/10 flex flex-col animate-in zoom-in-95 duration-150">
        
        {/* Modal Header */}
        <div className="p-5 pb-3 flex items-center justify-between border-b border-white/5">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-white tracking-tight">
              {modalTitle}
            </h3>
            {isAnimatedGif ? (
              <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 text-[10px] font-semibold border border-purple-500/30 flex items-center gap-1">
                <Film className="w-3 h-3" />
                <span>GIF Animado</span>
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full bg-brand-500/20 text-brand-300 text-[10px] font-semibold border border-brand-500/30 flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                <span>WebP</span>
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="text-gray-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body / Crop Viewport */}
        <div className="p-6 flex flex-col items-center justify-center bg-black/30">
          <div
            ref={containerRef}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            className="relative overflow-hidden bg-black/60 border border-white/10 flex items-center justify-center cursor-grab active:cursor-grabbing shadow-inner"
            style={{
              width: `${viewportSize.width}px`,
              height: `${viewportSize.height}px`,
              borderRadius:
                cropType === 'avatar'
                  ? '9999px'
                  : cropType === 'guildIcon'
                  ? '28px'
                  : '16px',
            }}
          >
            {/* Movable & Scalable Image */}
            <img
              ref={imgRef}
              src={imageSrc}
              alt="Crop Preview"
              draggable={false}
              className="max-w-none pointer-events-none transition-transform duration-75"
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom}) rotate(${rotation}deg)`,
                transformOrigin: 'center center',
              }}
            />

            {/* Framing Guide Overlay */}
            <div className="absolute inset-0 border-2 border-brand-400/40 pointer-events-none rounded-[inherit]" />

            {/* Pan Indicator Hint */}
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/60 backdrop-blur-sm px-2.5 py-0.5 rounded-full text-[10px] text-gray-300 pointer-events-none flex items-center gap-1 opacity-60">
              <Move className="w-3 h-3" />
              <span>Arraste para reposicionar</span>
            </div>
          </div>

          {/* Controls Bar (Zoom, Rotate, Reset) */}
          <div className="w-full mt-6 space-y-4">
            {/* Zoom Slider */}
            <div className="flex items-center gap-3 px-2">
              <button
                type="button"
                onClick={() => setZoom((prev) => Math.max(prev - 0.15, 0.5))}
                className="text-gray-400 hover:text-white transition-colors"
                title="Diminuir Zoom"
              >
                <ZoomOut className="w-4 h-4" />
              </button>

              <input
                type="range"
                min="0.5"
                max="3"
                step="0.01"
                value={zoom}
                onChange={(e) => setZoom(parseFloat(e.target.value))}
                className="flex-1 accent-brand-500 h-1.5 bg-background-darker rounded-lg cursor-pointer"
              />

              <button
                type="button"
                onClick={() => setZoom((prev) => Math.min(prev + 0.15, 3))}
                className="text-gray-400 hover:text-white transition-colors"
                title="Aumentar Zoom"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
            </div>

            {/* Extra Action Buttons */}
            <div className="flex items-center justify-between text-xs text-gray-400 pt-1 border-t border-white/5">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleRotate}
                  className="px-3 py-1.5 rounded-xl bg-background-darker hover:bg-white/5 text-gray-300 hover:text-white transition-colors flex items-center gap-1.5 border border-white/5 cursor-pointer"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  <span>Girar 90°</span>
                </button>

                <button
                  type="button"
                  onClick={handleReset}
                  className="px-3 py-1.5 rounded-xl bg-background-darker hover:bg-white/5 text-gray-300 hover:text-white transition-colors flex items-center gap-1.5 border border-white/5 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Redefinir</span>
                </button>
              </div>

              <span className="text-[11px] text-gray-400">
                {Math.round(zoom * 100)}%
              </span>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-background-darker/80 border-t border-white/5 flex items-center justify-between">
          <button
            type="button"
            onClick={onCancel}
            disabled={isProcessing}
            className="text-xs md:text-sm text-gray-400 hover:text-white font-medium px-4 py-2 cursor-pointer transition-colors"
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={handleApply}
            disabled={isProcessing}
            className="bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white text-xs md:text-sm font-semibold px-6 py-2.5 rounded-xl shadow-lg shadow-brand-500/25 transition-all flex items-center gap-2 cursor-pointer"
          >
            {isProcessing ? (
              <span>Processando...</span>
            ) : (
              <>
                <Check className="w-4 h-4" />
                <span>Aplicar</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
