import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Shield } from 'lucide-react';
import { useFriendStore } from '../../stores/friendStore';
import { useDMGroupStore } from '../../stores/dmGroupStore';
import { DMGroup } from '../../types';
import {
  AppModal,
  AppModalHeader,
  AppModalBody,
  AppModalFooter,
} from '@/components/ui/app-modal';
import { InlineAlert } from '@/components/ui/inline-alert';
import { FriendMultiSelect } from './FriendMultiSelect';

interface AddDMGroupMembersModalProps {
  isOpen: boolean;
  onClose: () => void;
  group: DMGroup | null;
}

export const AddDMGroupMembersModal: React.FC<AddDMGroupMembersModalProps> = ({
  isOpen,
  onClose,
  group,
}) => {
  const { friends, fetchFriends } = useFriendStore();
  const { addMembers } = useDMGroupStore();

  const [selectedFriendIds, setSelectedFriendIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const currentMembersCount = group?.members?.length || 0;
  const maxAddable = Math.max(0, 15 - currentMembersCount);

  // Filter friends who are NOT already in the group
  const availableFriends = React.useMemo(() => {
    if (!group?.members) return [];
    const existingMemberIds = new Set(group.members.map((m) => m.id));
    return friends.filter((f) => f.friend && !existingMemberIds.has(f.friend.id));
  }, [friends, group?.members]);

  useEffect(() => {
    if (isOpen) {
      fetchFriends();
      setSelectedFriendIds([]);
      setError('');
    }
  }, [isOpen]);

  if (!isOpen || !group) return null;

  const toggleFriend = (friendId: string) => {
    if (selectedFriendIds.includes(friendId)) {
      setSelectedFriendIds(selectedFriendIds.filter((id) => id !== friendId));
    } else {
      if (selectedFriendIds.length >= maxAddable) {
        setError(`O grupo suporta até 15 membros. Você pode adicionar no máximo mais ${maxAddable} amigo(s).`);
        return;
      }
      setError('');
      setSelectedFriendIds([...selectedFriendIds, friendId]);
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedFriendIds.length === 0) {
      setError('Selecione pelo menos 1 amigo para adicionar ao grupo.');
      return;
    }

    setIsLoading(true);
    setError('');
    try {
      await addMembers(group.id, selectedFriendIds);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Falha ao adicionar membros ao grupo');
    } finally {
      setIsLoading(false);
    }
  };

  return createPortal(
    <AppModal
      isOpen={isOpen}
      onClose={onClose}
      titleId="add-dm-group-members-modal-title"
    >
      <AppModalHeader
        title="Adicionar ao Grupo"
        subtitle={group.name || 'Grupo de DM'}
        titleId="add-dm-group-members-modal-title"
        onClose={onClose}
      />

      <AppModalBody onSubmit={handleAdd}>
          {error && <InlineAlert variant="error">{error}</InlineAlert>}

          {group.e2ee_enabled && (
            <InlineAlert variant="info" icon={<Shield className="w-4 h-4 text-brand-400" />}>
              <p className="font-semibold text-white">Grupo Criptografado (E2EE)</p>
              <p className="text-[11px] text-gray-300 leading-tight mt-0.5">
                Novos membros não terão acesso a mensagens anteriores.
              </p>
            </InlineAlert>
          )}

          {maxAddable === 0 && (
            <InlineAlert variant="warning">
              Este grupo atingiu a capacidade máxima de 15 membros.
            </InlineAlert>
          )}

          {/* Friends Selection */}
          <FriendMultiSelect
            friends={availableFriends
              .map((f) => f.friend)
              .filter((u): u is NonNullable<typeof u> => Boolean(u))}
            selectedIds={selectedFriendIds}
            onToggle={toggleFriend}
            counterText={`${selectedFriendIds.length} / ${maxAddable} vagas restantes`}
            emptyMessage={
              friends.length === 0
                ? 'Você ainda não tem amigos adicionados.'
                : 'Todos os seus amigos já estão neste grupo.'
            }
          />

          <AppModalFooter
            align="end"
            onCancel={onClose}
            confirmText={isLoading ? 'Adicionando...' : `Adicionar (${selectedFriendIds.length})`}
            confirmHtmlType="submit"
            loading={isLoading}
            disabled={selectedFriendIds.length === 0 || maxAddable <= 0}
          />
        </AppModalBody>
      </AppModal>,
    document.body
  );
};
