import React from 'react';
import { useDMGroupStore } from '../../stores/dmGroupStore';
import { DMGroup } from '../../types';
import { SingleInputModal } from './SingleInputModal';

interface EditDMGroupNameModalProps {
  isOpen: boolean;
  onClose: () => void;
  group: DMGroup | null;
}

export const EditDMGroupNameModal: React.FC<EditDMGroupNameModalProps> = ({
  isOpen,
  onClose,
  group,
}) => {
  const { updateGroup } = useDMGroupStore();
  if (!isOpen || !group) return null;

  return (
    <SingleInputModal
      isOpen={isOpen}
      onClose={onClose}
      titleId="edit-dm-group-name-modal-title"
      title="Mudar Nome do Grupo"
      label="Nome do Grupo"
      initialValue={group.name || ''}
      maxLength={100}
      allowEmpty
      helperText="Deixe em branco para usar os nomes dos participantes como padrão."
      confirmText="Salvar Alterações"
      loadingText="Salvando..."
      footerAlign="end"
      usePortal
      onSubmit={(name) => updateGroup(group.id, { name })}
    />
  );
};
