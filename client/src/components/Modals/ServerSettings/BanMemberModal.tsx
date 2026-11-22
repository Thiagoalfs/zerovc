import React from 'react';
import { User } from '../../../types';
import { MODAL_DESCRIPTION_CLASS } from '../../../constants/modalTypography';
import {
  AppModal,
  AppModalHeader,
  AppModalBody,
  AppModalFooter,
} from '@/components/ui/app-modal';
import { AppTextarea } from '@/components/ui/app-input';

interface BanMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  banModalUser: User | null;
  banReason: string;
  setBanReason: (val: string) => void;
  onConfirmBan: (e: React.FormEvent) => Promise<void>;
}

export const BanMemberModal: React.FC<BanMemberModalProps> = ({
  isOpen,
  onClose,
  banModalUser,
  banReason,
  setBanReason,
  onConfirmBan,
}) => {
  if (!isOpen || !banModalUser) return null;

  return (
    <AppModal
      isOpen={isOpen}
      onClose={onClose}
      titleId="ban-member-modal-title"
      className="border-red-500/30"
    >
      <AppModalHeader
        title={`Banir @${banModalUser.username}`}
        titleId="ban-member-modal-title"
        onClose={onClose}
      />

      <AppModalBody onSubmit={onConfirmBan}>
        <p className={MODAL_DESCRIPTION_CLASS}>
          O membro será desconectado e impedido de reentrar no servidor até ser desbanido.
        </p>

        <AppTextarea
          label="Motivo do banimento (opcional)"
          value={banReason}
          onChange={(e) => setBanReason(e.target.value)}
          placeholder="Ex: Violação das regras da comunidade..."
          rows={3}
          className="text-xs focus:border-red-500"
        />

        <AppModalFooter
          align="end"
          onCancel={onClose}
          confirmText="Confirmar banimento"
          confirmType="error"
          confirmHtmlType="submit"
        />
      </AppModalBody>
    </AppModal>
  );
};
