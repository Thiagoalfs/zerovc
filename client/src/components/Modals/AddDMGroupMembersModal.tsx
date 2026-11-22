import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Check, Shield } from 'lucide-react';
import { useFriendStore } from '../../stores/friendStore';
import { useDMGroupStore } from '../../stores/dmGroupStore';
import { formatAssetUrl } from '../../lib/api';
import { DMGroup } from '../../types';
import {
  AppModal,
  AppModalHeader,
  AppModalBody,
  AppModalFooter,
} from '@/components/ui/app-modal';
import { InlineAlert } from '@/components/ui/inline-alert';
import {
  MODAL_FIELD_LABEL_CLASS,
  MODAL_DESCRIPTION_CLASS,
} from '../../constants/modalTypography';

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
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className={MODAL_FIELD_LABEL_CLASS}>
                Selecione Amigos
              </label>
              <span className={MODAL_DESCRIPTION_CLASS}>
                {selectedFriendIds.length} / {maxAddable} vagas restantes
              </span>
            </div>

            {availableFriends.length === 0 ? (
              <div className="p-6 text-center border border-dashed border-white/10 rounded-xl">
                <p className="text-xs text-gray-400">
                  {friends.length === 0
                    ? 'Você ainda não tem amigos adicionados.'
                    : 'Todos os seus amigos já estão neste grupo.'}
                </p>
              </div>
            ) : (
              <div className="max-h-56 overflow-y-auto space-y-1 pr-1 no-scrollbar">
                {availableFriends.map((f) => {
                  const friendUser = f.friend;
                  if (!friendUser) return null;
                  const isSelected = selectedFriendIds.includes(friendUser.id);

                  return (
                    <div
                      key={friendUser.id}
                      onClick={() => toggleFriend(friendUser.id)}
                      className={`flex items-center justify-between p-2 rounded-xl text-xs cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-brand-500/20 text-white border border-brand-500/30'
                          : 'text-gray-300 hover:bg-white/5'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 truncate">
                        <div className="w-8 h-8 rounded-full bg-brand-500 flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
                          {friendUser.avatar_url ? (
                            <img
                              src={formatAssetUrl(friendUser.avatar_url)}
                              alt=""
                              className="w-full h-full rounded-full object-cover"
                            />
                          ) : (
                            <span>
                              {friendUser.display_name?.[0]?.toUpperCase() ||
                                friendUser.username?.[0]?.toUpperCase()}
                            </span>
                          )}
                        </div>
                        <div className="truncate">
                          <span className="font-semibold block truncate">
                            {friendUser.display_name || friendUser.username}
                          </span>
                          <span className="text-[10px] text-gray-400">@{friendUser.username}</span>
                        </div>
                      </div>

                      <div
                        className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${
                          isSelected
                            ? 'bg-brand-500 border-brand-500 text-white'
                            : 'border-white/20 bg-background-darkest'
                        }`}
                      >
                        {isSelected && <Check className="w-3.5 h-3.5" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

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
