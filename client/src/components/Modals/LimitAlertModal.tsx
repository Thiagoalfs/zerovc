import React from 'react';
import { X, AlertTriangle } from 'lucide-react';
import { ModalButton } from '@/components/ui/modal-button';
import {
  AppModal,
  AppModalBody,
  AppModalFooter,
} from '@/components/ui/app-modal';
import { MODAL_DIALOG_TITLE_CLASS } from '../../constants/modalTypography';

interface LimitAlertModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
  detail?: string;
}

export const LimitAlertModal: React.FC<LimitAlertModalProps> = ({
  isOpen,
  onClose,
  title,
  message,
  detail,
}) => {
  return (
    <AppModal
      isOpen={isOpen}
      onClose={onClose}
      titleId="limit-alert-modal-title"
    >
      <AppModalBody className="flex flex-col items-center text-center relative space-y-0">
        <ModalButton
          type="tertiary"
          shape="circle"
          size="small"
          svgOnly
          aria-label="Fechar"
          onClick={onClose}
          className="absolute top-4 right-4"
        >
          <X className="w-5 h-5" />
        </ModalButton>

        <div className="w-14 h-14 rounded-2xl bg-yellow-500/15 text-yellow-400 flex items-center justify-center mb-3 mt-1">
          <AlertTriangle className="w-8 h-8" />
        </div>

        <h2 id="limit-alert-modal-title" className={MODAL_DIALOG_TITLE_CLASS}>{title}</h2>
        <p className="text-sm text-gray-300 mt-2 leading-relaxed">{message}</p>
        {detail && (
          <span className="mt-2 text-xs font-mono text-gray-400 bg-background-darkest px-3 py-1 rounded-lg border border-white/5">
            {detail}
          </span>
        )}
      </AppModalBody>

      <AppModalFooter className="px-5 pb-5 pt-3 border-t-0">
        <ModalButton
          type="primary"
          fullWidth
          onClick={onClose}
        >
          Entendido
        </ModalButton>
      </AppModalFooter>
    </AppModal>
  );
};
