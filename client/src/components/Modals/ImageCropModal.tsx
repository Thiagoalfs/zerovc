import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Check,
  RotateCcw,
} from 'lucide-react';
import { isGif, cropImageToWebP } from '../../utils/image';
import { ModalButton } from '@/components/ui/modal-button';
import { Slider } from '@/components/ui/slider';
import {
  MODAL_DIALOG_TITLE_CLASS,
  MODAL_HEADER_PADDING_CLASS,
  MODAL_FOOTER_PADDING_CLASS,
  MODAL_BACKDROP_CLASS,
} from '../../constants/modalTypography';

export type CropType = 'avatar' | 'banner' | 'guildIcon' | 'guildBanner' | 'groupIcon';

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
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [zoom, setZoom] = useState<number>(1);
  const [rotation, setRotation] = useState<number>(0);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const panRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);
  const rafRef = useRef<number | null>(null);

  const isAnimatedGif = file ? isGif(file) : false;

  // Viewport & Output dimensions based on cropType
  const isBanner = cropType === 'banner' || cropType === 'guildBanner';
  const viewportSize = isBanner
    ? { width: 480, height: 192 } // 2.5:1 ratio
    : { width: 280, height: 280 }; // 1:1 ratio

  const outputSize = isBanner
    ? { width: 1200, height: 480 }
    : { width: 512, height: 512 };

  // Dimensions & scale normalization
  const naturalWidth = imageDimensions.width || imgRef.current?.naturalWidth || 1;
  const naturalHeight = imageDimensions.height || imgRef.current?.naturalHeight || 1;

  const isRotated90 = (rotation / 90) % 2 !== 0;
  const effectiveWidth = isRotated90 ? naturalHeight : naturalWidth;
  const effectiveHeight = isRotated90 ? naturalWidth : naturalHeight;

  // Scale to cover the viewport completely at zoom = 1 (100%)
  const coverScale = Math.max(
    viewportSize.width / effectiveWidth,
    viewportSize.height / effectiveHeight
  );

  // Minimum zoom is strictly 100% (cover) so image never leaks empty space
  const minZoom = 1;
  const maxZoom = 3;

  // Compute maximum allowable pan so image edges never pull inside the viewport
  const computeMaxPan = useCallback(
    (currentZoom: number, rot: number) => {
      const rot90 = (rot / 90) % 2 !== 0;
      const effW = rot90 ? naturalHeight : naturalWidth;
      const effH = rot90 ? naturalWidth : naturalHeight;
      const scale = Math.max(viewportSize.width / effW, viewportSize.height / effH);
      const renderedW = effW * (scale * currentZoom);
      const renderedH = effH * (scale * currentZoom);
      return {
        maxX: Math.max(0, (renderedW - viewportSize.width) / 2),
        maxY: Math.max(0, (renderedH - viewportSize.height) / 2),
      };
    },
    [naturalWidth, naturalHeight, viewportSize]
  );

  const clampPan = useCallback(
    (x: number, y: number, currentZoom: number = zoom, rot: number = rotation) => {
      const { maxX, maxY } = computeMaxPan(currentZoom, rot);
      return {
        x: Math.max(-maxX, Math.min(maxX, x)),
        y: Math.max(-maxY, Math.min(maxY, y)),
      };
    },
    [computeMaxPan, zoom, rotation]
  );

  // Escape key to cancel
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  // Load and reset image when file changes or modal opens
  useEffect(() => {
    if (isOpen && file) {
      const url = URL.createObjectURL(file);
      setImageSrc(url);
      setImageDimensions({ width: 0, height: 0 });
      setZoom(1);
      setRotation(0);
      setPan({ x: 0, y: 0 });
      panRef.current = { x: 0, y: 0 };
      setIsProcessing(false);

      return () => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        URL.revokeObjectURL(url);
      };
    } else {
      setImageSrc(null);
    }
  }, [isOpen, file]);

  const applyTransform = useCallback(
    (x: number, y: number, currentZoom: number, rot: number) => {
      if (!imgRef.current) return;
      imgRef.current.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${rot}deg) scale(${coverScale * currentZoom})`;
    },
    [coverScale]
  );

  const handleZoomChange = useCallback(
    (newZoom: number) => {
      const clampedZoom = Math.min(Math.max(newZoom, minZoom), maxZoom);
      setZoom(clampedZoom);
      setPan((prev) => {
        const next = clampPan(prev.x, prev.y, clampedZoom, rotation);
        panRef.current = next;
        return next;
      });
    },
    [minZoom, maxZoom, clampPan, rotation]
  );

  // Mouse wheel zoom
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY * -0.0015;
      handleZoomChange(zoom + delta);
    },
    [handleZoomChange, zoom]
  );

  // Pointer drag handlers (zero React re-renders during drag via rAF + direct GPU transform)
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    isDraggingRef.current = true;
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX - panRef.current.x, y: e.clientY - panRef.current.y };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    const rawX = e.clientX - dragStartRef.current.x;
    const rawY = e.clientY - dragStartRef.current.y;
    const clamped = clampPan(rawX, rawY);
    panRef.current = clamped;

    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      applyTransform(clamped.x, clamped.y, zoom, rotation);
    });
  };

  const handlePointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    setIsDragging(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setPan(panRef.current);
  };

  const handleRotate = () => {
    const nextRotation = (rotation + 90) % 360;
    setRotation(nextRotation);
    setPan((prev) => {
      const next = clampPan(prev.x, prev.y, zoom, nextRotation);
      panRef.current = next;
      return next;
    });
  };

  const handleReset = () => {
    setZoom(1);
    setRotation(0);
    panRef.current = { x: 0, y: 0 };
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
          baseScale: coverScale,
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
        return 'Enquadrar foto de perfil';
      case 'banner':
        return 'Enquadrar banner de perfil';
      case 'guildIcon':
        return 'Enquadrar ícone do servidor';
      case 'guildBanner':
        return 'Enquadrar banner do servidor';
      case 'groupIcon':
        return 'Enquadrar ícone do grupo';
      default:
        return 'Enquadrar imagem';
    }
  })();

  return createPortal(
    <div
      className={MODAL_BACKDROP_CLASS}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="image-crop-modal-title"
        className="bg-background-darkest w-full max-w-lg max-h-[92dvh] my-auto rounded-xl overflow-hidden shadow-2xl border border-white/10 flex flex-col animate-in zoom-in-95 duration-150"
      >
        
        {/* Modal Header */}
        <div className={`${MODAL_HEADER_PADDING_CLASS} flex items-center justify-between border-b border-white/5 flex-shrink-0`}>
          <div className="flex items-center gap-2">
            <h3 id="image-crop-modal-title" className={MODAL_DIALOG_TITLE_CLASS}>
              {modalTitle}
            </h3>
          </div>
          <ModalButton
            type="tertiary"
            shape="circle"
            size="small"
            svgOnly
            aria-label="Fechar"
            onClick={onCancel}
          >
            <X className="w-5 h-5" />
          </ModalButton>
        </div>

        {/* Modal Body / Crop Viewport */}
        <div className="p-4 sm:p-6 flex flex-col items-center justify-center bg-black/30 overflow-y-auto no-scrollbar flex-1">
          <div
            ref={containerRef}
            onWheel={handleWheel}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerEnd}
            onPointerCancel={handlePointerEnd}
            className="relative overflow-hidden bg-black/70 border border-white/10 rounded-xl flex items-center justify-center cursor-grab active:cursor-grabbing shadow-inner max-w-[calc(100vw-48px)] touch-none select-none"
            style={{
              width: `${isBanner ? viewportSize.width + 32 : viewportSize.width + 64}px`,
              height: `${viewportSize.height + 64}px`,
            }}
          >
            {/* Movable & Scalable Image */}
            <img
              ref={imgRef}
              src={imageSrc}
              alt="Crop Preview"
              draggable={false}
              decoding="async"
              onLoad={(e) => {
                const img = e.currentTarget;
                setImageDimensions({
                  width: img.naturalWidth,
                  height: img.naturalHeight,
                });
              }}
              className={`max-w-none pointer-events-none will-change-transform ${
                isDragging ? '' : 'transition-transform duration-150 ease-out'
              }`}
              style={{
                transform: `translate3d(${pan.x}px, ${pan.y}px, 0) rotate(${rotation}deg) scale(${coverScale * zoom})`,
                transformOrigin: 'center center',
              }}
            />

            {/* Framing Guide Overlay: clear center hole + dimmed outer area */}
            <div
              className="absolute pointer-events-none border-2 border-white"
              style={{
                width: `${viewportSize.width}px`,
                height: `${viewportSize.height}px`,
                borderRadius:
                  cropType === 'avatar'
                    ? '9999px'
                    : cropType === 'guildIcon'
                    ? '28px'
                    : '16px',
                boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.6)',
              }}
            />
          </div>

          {/* Controls Bar (Zoom, Rotate, Reset) */}
          <div className="w-full mt-6 space-y-4">
            {/* Zoom Slider */}
            <div className="flex items-center gap-3 px-2">
              <ModalButton
                type="tertiary"
                shape="circle"
                size="tiny"
                svgOnly
                onClick={() => handleZoomChange(zoom - 0.15)}
                title="Diminuir Zoom"
              >
                <ZoomOut className="w-4 h-4" />
              </ModalButton>

              <Slider
                min={minZoom}
                max={maxZoom}
                step={0.01}
                value={[zoom]}
                onValueChange={([val]) => handleZoomChange(val)}
                className="flex-1"
              />

              <ModalButton
                type="tertiary"
                shape="circle"
                size="tiny"
                svgOnly
                onClick={() => handleZoomChange(zoom + 0.15)}
                title="Aumentar Zoom"
              >
                <ZoomIn className="w-4 h-4" />
              </ModalButton>
            </div>

            {/* Extra Action Buttons */}
            <div className="flex items-center justify-between text-xs text-gray-400 pt-1 border-t border-white/5">
              <div className="flex items-center gap-2">
                <ModalButton
                  type="secondary"
                  size="small"
                  prefix={<RotateCw className="w-3.5 h-3.5" />}
                  onClick={handleRotate}
                >
                  Girar 90°
                </ModalButton>

                <ModalButton
                  type="secondary"
                  size="small"
                  prefix={<RotateCcw className="w-3.5 h-3.5" />}
                  onClick={handleReset}
                >
                  Redefinir
                </ModalButton>
              </div>

              <span className="text-[11px] text-gray-400">
                {Math.round(zoom * 100)}%
              </span>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className={`${MODAL_FOOTER_PADDING_CLASS} bg-background-darker/80 border-t border-white/5 flex items-center justify-between`}>
          <ModalButton
            type="secondary"
            onClick={onCancel}
            disabled={isProcessing}
          >
            Cancelar
          </ModalButton>

          <ModalButton
            type="primary"
            onClick={handleApply}
            loading={isProcessing}
            prefix={<Check className="w-4 h-4" />}
          >
            {isProcessing ? 'Processando...' : 'Aplicar'}
          </ModalButton>
        </div>
      </div>
    </div>,
    document.body
  );
};
