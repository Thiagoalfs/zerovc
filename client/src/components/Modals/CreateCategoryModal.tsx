import React, { useState, useEffect } from 'react';
import { FolderPlus } from 'lucide-react';
import { useGuildStore } from '../../stores/guildStore';
import {
  AppModal,
  AppModalHeader,
  AppModalBody,
  AppModalFooter,
} from '@/components/ui/app-modal';
import { AppInput } from '@/components/ui/app-input';
import { InlineAlert } from '@/components/ui/inline-alert';

interface CreateCategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CreateCategoryModal: React.FC<CreateCategoryModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const { activeGuild, createChannel } = useGuildStore();

  useEffect(() => {
    if (isOpen) {
      setName('');
      setError('');
    }
  }, [isOpen]);

  if (!isOpen || !activeGuild) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsLoading(true);
    setError('');
    try {
      await createChannel(
        activeGuild.id,
        name.trim(),
        'category',
        undefined,
        undefined,
        false,
        undefined
      );
      onClose();
    } catch (err: any) {
      setError(err.message || 'Erro ao criar categoria');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AppModal
      isOpen={isOpen}
      onClose={onClose}
      titleId="create-category-modal-title"
    >
      <AppModalHeader
        title="Criar Categoria"
        subtitle={`em ${activeGuild.name}`}
        titleId="create-category-modal-title"
        onClose={onClose}
      />

      <AppModalBody onSubmit={handleSubmit}>
        {error && <InlineAlert variant="error">{error}</InlineAlert>}

        {/* Name Field */}
        <AppInput
          label="Nome da Categoria"
          leftIcon={<FolderPlus className="w-4 h-4" />}
          type="text"
          required
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <AppModalFooter
          onCancel={onClose}
          confirmText={isLoading ? 'Criando...' : 'Criar Categoria'}
          confirmHtmlType="submit"
          loading={isLoading}
          disabled={!name.trim()}
        />
      </AppModalBody>
    </AppModal>
  );
};
