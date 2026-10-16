import React, { useEffect } from 'react';
import {
  X,
  AlertTriangle,
  Trash2,
  Info,
  ShieldAlert,
  UserX,
  CheckCircle2,
} from 'lucide-react';
import { useConfirmModalStore } from '../../stores/confirmModalStore';
import {
  MODAL_DIALOG_TITLE_CLASS,
  MODAL_HEADER_PADDING_CLASS,
  MODAL_FOOTER_PADDING_CLASS,
  MODAL_CANCEL_BUTTON_CLASS,
  MODAL_DANGER_BUTTON_CLASS,
  MODAL_PRIMARY_BUTTON_CLASS,
  MODAL_BACKDROP_CLASS,
} from '../../constants/modalTypography';

export const GlobalConfirmModal: React.FC = () => {
  const {
    isOpen,
    type,
    title,
    message,
    detail,
    confirmText,
    cancelText,
    variant,
    icon,
    handleConfirm,
    handleCancel,
  } = useConfirmModalStore();

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleCancel();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handleConfirm();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleConfirm, handleCancel]);

  if (!isOpen) return null;

  const renderIcon = () => {
    if (variant === 'danger' || icon === 'trash') {
      return (
        <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center flex-shrink-0">
          <Trash2 className="w-5 h-5" />
        </div>
      );
    }
    if (variant === 'warning' || icon === 'alert') {
      return (
        <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center flex-shrink-0">
          <AlertTriangle className="w-5 h-5" />
        </div>
      );
    }
    if (variant === 'success' || icon === 'check') {
      return (
        <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center flex-shrink-0">
          <CheckCircle2 className="w-5 h-5" />
        </div>
      );
    }
    if (icon === 'user') {
      return (
        <div className="w-10 h-10 rounded-xl bg-brand-500/10 border border-brand-500/20 text-brand-400 flex items-center justify-center flex-shrink-0">
          <UserX className="w-5 h-5" />
        </div>
      );
    }
    if (icon === 'shield') {
      return (
        <div className="w-10 h-10 rounded-xl bg-brand-500/10 border border-brand-500/20 text-brand-400 flex items-center justify-center flex-shrink-0">
          <ShieldAlert className="w-5 h-5" />
        </div>
      );
    }
    return (
      <div className="w-10 h-10 rounded-xl bg-brand-500/10 border border-brand-500/20 text-brand-400 flex items-center justify-center flex-shrink-0">
        <Info className="w-5 h-5" />
      </div>
    );
  };

  const getConfirmButtonClass = () => {
    if (variant === 'danger') return MODAL_DANGER_BUTTON_CLASS;
    if (variant === 'warning') return 'bg-amber-600 hover:bg-amber-700 text-white font-semibold px-4 py-2 rounded-xl text-xs transition-all cursor-pointer';
    if (variant === 'success') return 'bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-4 py-2 rounded-xl text-xs transition-all cursor-pointer';
    return MODAL_PRIMARY_BUTTON_CLASS;
  };

  return (
    <div
      className={MODAL_BACKDROP_CLASS}
      style={{ zIndex: 99999 }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          handleCancel();
        }
      }}
    >
      <div
        className="bg-background-dark w-full max-w-md max-h-[92dvh] my-auto rounded-2xl overflow-hidden shadow-2xl border border-white/10 animate-in fade-in zoom-in-95 duration-150 flex flex-col text-gray-200 select-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`${MODAL_HEADER_PADDING_CLASS} flex-shrink-0 pb-2`}>
          <div className="flex items-center justify-between gap-3 mb-2">
            <div className="flex items-center gap-3">
              {renderIcon()}
              <h2 className={`${MODAL_DIALOG_TITLE_CLASS} text-white`}>{title}</h2>
            </div>
            <button
              type="button"
              onClick={handleCancel}
              className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Message body */}
        <div className="px-4 sm:px-6 py-2 overflow-y-auto no-scrollbar">
          <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">{message}</p>
          {detail && (
            <div className="mt-3 p-2.5 rounded-xl bg-background-darkest/80 border border-white/5 text-xs text-gray-400 font-mono select-text break-words">
              {detail}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={`${MODAL_FOOTER_PADDING_CLASS} bg-background-darkest/40 border-t border-white/5 flex items-center justify-end gap-3 mt-4`}>
          {type === 'confirm' && (
            <button
              type="button"
              onClick={handleCancel}
              className={MODAL_CANCEL_BUTTON_CLASS}
            >
              {cancelText || 'Cancelar'}
            </button>
          )}
          <button
            type="button"
            onClick={handleConfirm}
            className={`${getConfirmButtonClass()} min-w-[100px] flex items-center justify-center`}
          >
            {confirmText || (type === 'confirm' ? 'Confirmar' : 'Entendido')}
          </button>
        </div>
      </div>
    </div>
  );
};
