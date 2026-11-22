import React, { useEffect } from 'react';
import { useConfirmModalStore } from '../../stores/confirmModalStore';
import {
  AppModal,
  AppModalHeader,
  AppModalBody,
  AppModalFooter,
} from '@/components/ui/app-modal';
import { MODAL_DESCRIPTION_CLASS } from '../../constants/modalTypography';

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
    handleConfirm,
    handleCancel,
  } = useConfirmModalStore();

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleConfirm();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleConfirm]);

  const confirmButtonType =
    variant === 'danger' ? 'error' : variant === 'warning' ? 'warning' : 'primary';

  return (
    <AppModal
      isOpen={isOpen}
      onClose={handleCancel}
      titleId="global-confirm-modal-title"
      zIndex={99999}
    >
      <AppModalHeader
        title={title}
        titleId="global-confirm-modal-title"
        onClose={handleCancel}
      />

      <AppModalBody>
        <p className={`${MODAL_DESCRIPTION_CLASS} whitespace-pre-wrap`}>{message}</p>
        {detail && (
          <div className="p-2.5 rounded-xl bg-background-darkest/80 border border-white/5 text-xs text-gray-400 font-mono select-text break-words">
            {detail}
          </div>
        )}

        <AppModalFooter
          align={type === 'confirm' ? 'between' : 'end'}
          cancelText={cancelText || 'Cancelar'}
          onCancel={type === 'confirm' ? handleCancel : undefined}
          confirmText={confirmText || (type === 'confirm' ? 'Confirmar' : 'Entendido')}
          confirmType={confirmButtonType}
          onConfirm={handleConfirm}
        />
      </AppModalBody>
    </AppModal>
  );
};
