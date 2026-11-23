import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ModalButton } from '@/components/ui/modal-button';

/**
 * Guards modal closing when there are unsaved changes, triggering a brief shake
 * and red border highlight on the floating confirmation footer instead.
 */
export function useUnsavedGuard(hasUnsavedChanges: boolean, onClose: () => void) {
  const [isShaking, setIsShaking] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!hasUnsavedChanges) {
      setIsShaking(false);
    }
  }, [hasUnsavedChanges]);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, []);

  const triggerShake = useCallback(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    setIsShaking(false);
    requestAnimationFrame(() => {
      setIsShaking(true);
      timerRef.current = window.setTimeout(() => setIsShaking(false), 500);
    });
  }, []);

  const attemptClose = useCallback(() => {
    if (hasUnsavedChanges) {
      triggerShake();
      return;
    }
    onClose();
  }, [hasUnsavedChanges, onClose, triggerShake]);

  return { isShaking, attemptClose, triggerShake };
}

interface UnsavedChangesBarProps {
  show: boolean;
  isShaking: boolean;
  isSaving?: boolean;
  error?: string | null;
  onSave: () => void;
  onRevert: () => void;
}

export const UnsavedChangesBar: React.FC<UnsavedChangesBarProps> = ({
  show,
  isShaking,
  isSaving = false,
  error,
  onSave,
  onRevert,
}) => {
  const [shouldRender, setShouldRender] = useState(show);
  const [isVisible, setIsVisible] = useState(show);

  useEffect(() => {
    if (show) {
      setShouldRender(true);
      const raf = requestAnimationFrame(() => {
        requestAnimationFrame(() => setIsVisible(true));
      });
      return () => cancelAnimationFrame(raf);
    } else {
      setIsVisible(false);
      const timer = window.setTimeout(() => setShouldRender(false), 220);
      return () => window.clearTimeout(timer);
    }
  }, [show]);

  if (!shouldRender || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className={`fixed bottom-5 left-1/2 -translate-x-1/2 z-[220] w-[calc(100%-2rem)] max-w-xl transition-all duration-200 ease-out ${
        isVisible ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0 pointer-events-none'
      }`}
    >
      <div
        role="status"
        aria-live="polite"
        className={`rounded-2xl bg-[#111214]/95 backdrop-blur-md px-4 py-3 shadow-2xl flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 transition-colors duration-200 ${
          isShaking
            ? 'border-2 border-red-500 ring-2 ring-red-500/35 animate-unsaved-shake'
            : 'border border-white/15'
        }`}
      >
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-100">
            Você tem alterações não salvas!
          </p>
          {error && <p className="text-xs text-red-400 mt-0.5 truncate">{error}</p>}
        </div>

        <div className="flex items-center gap-2 shrink-0 ml-auto">
          <ModalButton
            type="secondary"
            size="small"
            disabled={isSaving}
            onClick={onRevert}
          >
            Reverter
          </ModalButton>
          <ModalButton
            type="primary"
            size="small"
            loading={isSaving}
            onClick={onSave}
          >
            {isSaving ? 'Salvando...' : 'Salvar Alterações'}
          </ModalButton>
        </div>
      </div>
    </div>,
    document.body
  );
};
