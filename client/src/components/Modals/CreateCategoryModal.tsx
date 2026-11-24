import React from 'react';
import { FolderPlus } from 'lucide-react';
import { useGuildStore } from '../../stores/guildStore';
import { SingleInputModal } from './SingleInputModal';

interface CreateCategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CreateCategoryModal: React.FC<CreateCategoryModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { activeGuild, createChannel } = useGuildStore();
  if (!isOpen || !activeGuild) return null;

  return (
    <SingleInputModal
      isOpen={isOpen}
      onClose={onClose}
      titleId="create-category-modal-title"
      title="Criar Categoria"
      subtitle={`em ${activeGuild.name}`}
      label="Nome da Categoria"
      leftIcon={<FolderPlus className="w-4 h-4" />}
      confirmText="Criar Categoria"
      loadingText="Criando..."
      onSubmit={(name) =>
        createChannel(activeGuild.id, name, 'category', undefined, undefined, false, undefined)
      }
    />
  );
};
