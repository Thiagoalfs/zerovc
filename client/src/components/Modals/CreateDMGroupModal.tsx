import React, { useState, useEffect } from 'react';
import { Check, Shield } from 'lucide-react';
import { useFriendStore } from '../../stores/friendStore';
import { useDMGroupStore } from '../../stores/dmGroupStore';
import { formatAssetUrl } from '../../lib/api';
import { SquishSwitch } from '../ui/squish-switch';
import {
  AppModal,
  AppModalHeader,
  AppModalBody,
  AppModalFooter,
} from '@/components/ui/app-modal';
import { AppInput } from '@/components/ui/app-input';
import { InlineAlert } from '@/components/ui/inline-alert';
import {
  MODAL_FIELD_LABEL_CLASS,
  MODAL_DESCRIPTION_CLASS,
} from '../../constants/modalTypography';

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
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className={MODAL_FIELD_LABEL_CLASS}>
                Selecione Amigos
              </label>
              <span className={MODAL_DESCRIPTION_CLASS}>
                {selectedFriendIds.length} / 14 selecionados
              </span>
            </div>

            {friends.length === 0 ? (
              <div className="p-6 text-center border border-dashed border-white/10 rounded-xl">
                <p className="text-xs text-gray-400">Você ainda não tem amigos adicionados.</p>
              </div>
            ) : (
              <div className="max-h-56 overflow-y-auto space-y-1 pr-1 no-scrollbar">
                {friends.map((f) => {
                  const isSelected = selectedFriendIds.includes(f.friend?.id || '');
                  const friendUser = f.friend;
                  if (!friendUser) return null;

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
                            <img src={formatAssetUrl(friendUser.avatar_url)} alt="" className="w-full h-full rounded-full object-cover" />
                          ) : (
                            <span>{friendUser.display_name?.[0]?.toUpperCase() || friendUser.username?.[0]?.toUpperCase()}</span>
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
