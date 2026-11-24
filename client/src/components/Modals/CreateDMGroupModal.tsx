import React, { useState, useEffect, useMemo } from 'react';
import { Shield } from 'lucide-react';
import { useFriendStore } from '../../stores/friendStore';
import { useDMGroupStore } from '../../stores/dmGroupStore';
import { SquishSwitch } from '../ui/squish-switch';
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
  const { friends, fetchFriends } = useFriendStore();
  const { createGroup } = useDMGroupStore();

  const [name, setName] = useState('');
  const [selectedFriendIds, setSelectedFriendIds] = useState<string[]>([]);
  const [isE2EE, setIsE2EE] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      fetchFriends();
      setName('');
      setSelectedFriendIds([]);
      setIsE2EE(true);
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
      const group = await createGroup(name.trim() || undefined, selectedFriendIds, isE2EE);
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
        titleId="create-dm-group-modal-title"
        onClose={onClose}
      />

      <AppModalBody onSubmit={handleCreate}>
          {error && <InlineAlert variant="error">{error}</InlineAlert>}

          {/* Group Name Input */}
          <AppInput
            label="Nome do Grupo (Opcional)"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ex: Galera do Game"
          />

          {/* E2EE Opt-in Toggle */}
          <div className="p-3 rounded-xl bg-background-darkest border border-white/5 flex items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <Shield className={`w-4 h-4 mt-0.5 flex-shrink-0 ${isE2EE ? 'text-emerald-400' : 'text-gray-400'}`} />
              <div>
                <p className="text-xs font-semibold text-white">Criptografia de Ponta a Ponta (E2EE)</p>
                <p className="text-[11px] text-gray-400 leading-tight">
                  Mensagens e arquivos protegidos com chaves Megolm. Máximo de 15 pessoas.
                </p>
              </div>
            </div>
            <SquishSwitch
              size="sm"
              checked={isE2EE}
              onCheckedChange={setIsE2EE}
              className={isE2EE ? 'bg-emerald-500' : 'bg-gray-700'}
            />
          </div>

          {/* Friends Selection */}
          <FriendMultiSelect
            friends={friends.map((f) => f.friend).filter((u): u is NonNullable<typeof u> => Boolean(u))}
            selectedIds={selectedFriendIds}
            onToggle={toggleFriend}
            counterText={`${selectedFriendIds.length} / 14 selecionados`}
            emptyMessage="Você ainda não tem amigos adicionados."
          />

          <AppModalFooter
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
