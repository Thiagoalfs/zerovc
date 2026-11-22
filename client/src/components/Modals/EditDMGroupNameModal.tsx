import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useDMGroupStore } from '../../stores/dmGroupStore';
import { DMGroup } from '../../types';
import {
  AppModal,
  AppModalHeader,
  AppModalBody,
  AppModalFooter,
} from '@/components/ui/app-modal';
import { AppInput } from '@/components/ui/app-input';
import { InlineAlert } from '@/components/ui/inline-alert';
import { MODAL_DESCRIPTION_CLASS } from '../../constants/modalTypography';

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
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen && group) {
      setName(group.name || '');
      setError('');
    }
  }, [isOpen, group]);

  if (!isOpen || !group) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    try {
      await updateGroup(group.id, { name: name.trim() });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Falha ao atualizar o nome do grupo');
    } finally {
      setIsLoading(false);
    }
  };

  return createPortal(
    <AppModal
      isOpen={isOpen}
      onClose={onClose}
      titleId="edit-dm-group-name-modal-title"
    >
      <AppModalHeader
        title="Mudar Nome do Grupo"
        titleId="edit-dm-group-name-modal-title"
        onClose={onClose}
      />

      <AppModalBody onSubmit={handleSave}>
        {error && <InlineAlert variant="error">{error}</InlineAlert>}

        <div>
          <AppInput
            label="Nome do Grupo"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            autoFocus
          />
          <p className={`${MODAL_DESCRIPTION_CLASS} mt-1`}>
            Deixe em branco para usar os nomes dos participantes como padrão.
          </p>
        </div>

        <AppModalFooter
          align="end"
          onCancel={onClose}
          confirmText={isLoading ? 'Salvando...' : 'Salvar Alterações'}
          confirmHtmlType="submit"
          loading={isLoading}
        />
      </AppModalBody>
    </AppModal>,
    document.body
  );
};
