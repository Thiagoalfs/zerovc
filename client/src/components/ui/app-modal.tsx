import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ModalButton, ModalButtonProps } from '@/components/ui/modal-button';
import {
  MODAL_BACKDROP_CLASS,
  MODAL_BODY_PADDING_CLASS,
  MODAL_HEADER_PADDING_CLASS,
  MODAL_TITLE_CLASS,
} from '@/constants/modalTypography';

const MODAL_SIZES = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
} as const;

export interface AppModalProps {
  isOpen: boolean;
  onClose: () => void;
  size?: keyof typeof MODAL_SIZES;
  titleId?: string;
  zIndex?: number;
  closeOnBackdrop?: boolean;
  closeOnEsc?: boolean;
  className?: string;
  backdropClassName?: string;
  children: React.ReactNode;
}

export const AppModal: React.FC<AppModalProps> = ({
  isOpen,
  onClose,
  size = 'md',
  titleId,
  zIndex,
  closeOnBackdrop = true,
  closeOnEsc = true,
  className,
  backdropClassName,
  children,
}) => {
  useEffect(() => {
    if (!isOpen || !closeOnEsc) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, closeOnEsc, onClose]);

  if (!isOpen) return null;

  const modal = (
    <div
      className={cn(MODAL_BACKDROP_CLASS, backdropClassName)}
      style={zIndex !== undefined ? { zIndex } : undefined}
      onClick={(e) => {
        if (closeOnBackdrop && e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'bg-background-dark w-full max-h-[92dvh] my-auto flex flex-col rounded-xl overflow-hidden shadow-2xl border border-white/10 animate-in fade-in zoom-in-95 duration-150 text-gray-200 select-none',
          MODAL_SIZES[size],
          className
        )}
      >
        {children}
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modal, document.body) : modal;
};

export interface AppModalHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  titleId?: string;
  onClose?: () => void;
  closeDisabled?: boolean;
  className?: string;
}

export const AppModalHeader: React.FC<AppModalHeaderProps> = ({
  title,
  subtitle,
  titleId,
  onClose,
  closeDisabled = false,
  className,
}) => (
  <div
    className={cn(
      MODAL_HEADER_PADDING_CLASS,
      'relative flex-shrink-0 border-b border-white/5',
      className
    )}
  >
    {onClose && (
      <ModalButton
        type="tertiary"
        shape="circle"
        size="small"
        svgOnly
        onClick={onClose}
        disabled={closeDisabled}
        aria-label="Fechar"
        className="absolute top-4 right-4"
      >
        <X className="w-5 h-5" />
      </ModalButton>
    )}
    <h2 id={titleId} className={cn(MODAL_TITLE_CLASS, onClose && 'pr-8')}>
      {title}
    </h2>
    {subtitle && (
      <p className="text-xs text-gray-400 mt-1 truncate">{subtitle}</p>
    )}
  </div>
);

export interface AppModalBodyProps {
  children: React.ReactNode;
  onSubmit?: React.FormEventHandler<HTMLFormElement>;
  className?: string;
}

export const AppModalBody: React.FC<AppModalBodyProps> = ({
  children,
  onSubmit,
  className,
}) => {
  const classes = cn(
    MODAL_BODY_PADDING_CLASS,
    'space-y-4 overflow-y-auto flex-1 no-scrollbar',
    className
  );

  if (onSubmit) {
    return (
      <form onSubmit={onSubmit} className={classes}>
        {children}
      </form>
    );
  }

  return <div className={classes}>{children}</div>;
};

export interface AppModalFooterProps {
  children?: React.ReactNode;
  align?: 'between' | 'end';
  className?: string;
  cancelText?: string;
  onCancel?: () => void;
  cancelDisabled?: boolean;
  confirmText?: string;
  confirmType?: ModalButtonProps['type'];
  confirmHtmlType?: 'button' | 'submit';
  onConfirm?: () => void;
  loading?: boolean;
  disabled?: boolean;
}

export const AppModalFooter: React.FC<AppModalFooterProps> = ({
  children,
  align = 'between',
  className,
  cancelText = 'Cancelar',
  onCancel,
  cancelDisabled = false,
  confirmText,
  confirmType = 'primary',
  confirmHtmlType = 'button',
  onConfirm,
  loading = false,
  disabled = false,
}) => (
  <div
    className={cn(
      'flex items-center gap-3 pt-3 border-t border-white/5',
      align === 'between' ? 'justify-between' : 'justify-end',
      className
    )}
  >
    {children ?? (
      <>
        {onCancel && (
          <ModalButton
            type="secondary"
            onClick={onCancel}
            disabled={cancelDisabled || loading}
          >
            {cancelText}
          </ModalButton>
        )}
        {confirmText && (
          <ModalButton
            type={confirmType}
            htmlType={confirmHtmlType}
            onClick={onConfirm}
            loading={loading}
            disabled={disabled}
          >
            {confirmText}
          </ModalButton>
        )}
      </>
    )}
  </div>
);
