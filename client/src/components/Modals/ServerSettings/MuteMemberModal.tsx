import React from 'react';
import { User } from '../../../types';
import { ModalButton } from '@/components/ui/modal-button';
import {
  AppModal,
  AppModalHeader,
  AppModalBody,
  AppModalFooter,
} from '@/components/ui/app-modal';

interface MuteMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  muteModalUser: User | null;
  onMuteDuration: (durationSeconds: number) => Promise<void>;
}

export const MuteMemberModal: React.FC<MuteMemberModalProps> = ({
  isOpen,
  onClose,
  muteModalUser,
  onMuteDuration,
}) => {
  if (!isOpen || !muteModalUser) return null;

  return (
    <AppModal
      isOpen={isOpen}
      onClose={onClose}
      titleId="mute-member-modal-title"
    >
      <AppModalHeader
        title={`Silenciar @${muteModalUser.username}`}
        titleId="mute-member-modal-title"
        onClose={onClose}
      />

      <AppModalBody>
        <div className="grid grid-cols-2 gap-2.5">
          <ModalButton
            type="secondary"
            fullWidth
            onClick={() => onMuteDuration(15 * 60)}
          >
            15 minutos
          </ModalButton>
          <ModalButton
            type="secondary"
            fullWidth
            onClick={() => onMuteDuration(60 * 60)}
          >
            1 hora
          </ModalButton>
          <ModalButton
            type="secondary"
            fullWidth
            onClick={() => onMuteDuration(24 * 60 * 60)}
          >
            24 horas (1 dia)
          </ModalButton>
          <ModalButton
            type="secondary"
            fullWidth
            onClick={() => onMuteDuration(7 * 24 * 60 * 60)}
          >
            7 dias (1 semana)
          </ModalButton>
          <ModalButton
            type="error"
            fullWidth
            onClick={() => onMuteDuration(-1)}
          >
            Permanente
          </ModalButton>
          <ModalButton
            type="secondary"
            fullWidth
            onClick={() => onMuteDuration(0)}
          >
            Remover silêncio
          </ModalButton>
        </div>

        <AppModalFooter align="end" onCancel={onClose} />
      </AppModalBody>
    </AppModal>
  );
};
