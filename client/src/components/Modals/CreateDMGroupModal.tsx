import React, { useState, useEffect, useMemo } from 'react';
import { useFriendStore } from '../../stores/friendStore';
import { useDMGroupStore } from '../../stores/dmGroupStore';
import { useAuthStore } from '../../stores/authStore';
import { User } from '../../types';
import {
  AppModal,
  AppModalHeader,
  AppModalBody,
  AppModalFooter,
} from '@/components/ui/app-modal';
import { AppInput } from '@/components/ui/app-input';
import { InlineAlert } from '@/components/ui/inline-alert';
import { FriendMultiSelect } from './FriendMultiSelect';

interface CreateDMGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGroupCreated: (groupId: string) => void;
}

export const CreateDMGroupModal: React.FC<CreateDMGroupModalProps> = ({
  isOpen,
  onClose,
  onGroupCreated,
}) => {
  const { user: currentUser } = useAuthStore();
  const { friends, fetchFriends } = useFriendStore();
  const { createGroup } = useDMGroupStore();

  const friendUsers = useMemo(() => {
    const unique = new Map<string, User>();
    for (const f of friends) {
      const other = currentUser?.id && f.friend?.id === currentUser.id ? f.user : (f.friend || f.user);
      if (other && other.id !== currentUser?.id && !unique.has(other.id)) {
        unique.set(other.id, other);
      }
    }
    return Array.from(unique.values());
  }, [friends, currentUser?.id]);

  const [name, setName] = useState('');
  const [selectedFriendIds, setSelectedFriendIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      fetchFriends();
      setName('');
      setSelectedFriendIds([]);
      setError('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const toggleFriend = (friendId: string) => {
    if (selectedFriendIds.includes(friendId)) {
      setSelectedFriendIds(selectedFriendIds.filter((id) => id !== friendId));
    } else {
      if (selectedFriendIds.length >= 14) {
        setError('Você pode adicionar no máximo 14 amigos (15 pessoas no total).');
        return;
      }
      setError('');
      setSelectedFriendIds([...selectedFriendIds, friendId]);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedFriendIds.length === 0) {
      setError('Selecione pelo menos 1 amigo para criar o grupo.');
      return;
    }

    setIsLoading(true);
    setError('');
    try {
      const group = await createGroup(name.trim() || undefined, selectedFriendIds, true);
      onClose();
      onGroupCreated(group.id);
    } catch (err: any) {
      setError(err.message || 'Falha ao criar grupo');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AppModal
      isOpen={isOpen}
      onClose={onClose}
      titleId="create-dm-group-modal-title"
    >
      <AppModalHeader
        title="Criar Grupo de DM"
        subtitle="Reúna até 15 pessoas em uma conversa privada"
        titleId="create-dm-group-modal-title"
        onClose={onClose}
      />

      <AppModalBody onSubmit={handleCreate}>
          {error && <InlineAlert variant="error">{error}</InlineAlert>}

          {/* Group Name Input */}
          <AppInput
            label="Nome do Grupo (Opcional)"
            type="text"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ex: Galera do Game"
          />

          {/* Friends Selection */}
          <FriendMultiSelect
            friends={friendUsers}
            selectedIds={selectedFriendIds}
            onToggle={toggleFriend}
            counterText={`${selectedFriendIds.length} / 14 selecionados`}
            emptyMessage="Você ainda não tem amigos adicionados."
          />

          <AppModalFooter
            align="end"
            onCancel={onClose}
            confirmText={isLoading ? 'Criando...' : 'Criar Grupo'}
            confirmHtmlType="submit"
            loading={isLoading}
            disabled={selectedFriendIds.length === 0}
          />
        </AppModalBody>
      </AppModal>
  );
};
