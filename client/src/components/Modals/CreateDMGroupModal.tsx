import React, { useState, useEffect } from 'react';
import { X, Users, Check, Shield } from 'lucide-react';
import { useFriendStore } from '../../stores/friendStore';
import { useDMGroupStore } from '../../stores/dmGroupStore';
import { formatAssetUrl } from '../../lib/api';
import {
  MODAL_TITLE_CLASS,
  MODAL_FIELD_LABEL_CLASS,
  MODAL_HEADER_PADDING_CLASS,
  MODAL_BODY_PADDING_CLASS,
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
  const [isE2EE, setIsE2EE] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      fetchFriends();
      setName('');
      setSelectedFriendIds([]);
      setIsE2EE(false);
      setError('');
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

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
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm select-none p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-150"
    >
      <div className="bg-background-dark w-full max-w-md max-h-[92dvh] my-auto flex flex-col rounded-xl overflow-hidden shadow-2xl border border-white/10 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className={`${MODAL_HEADER_PADDING_CLASS} flex items-center justify-between border-b border-white/5 flex-shrink-0`}>
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-brand-400" />
            <h2 className={MODAL_TITLE_CLASS}>Criar Grupo de DM</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-white cursor-pointer p-1 rounded-lg hover:bg-white/5 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleCreate} className={`${MODAL_BODY_PADDING_CLASS} space-y-4 overflow-y-auto flex-1 no-scrollbar`}>
          {error && <div className="p-3 bg-dnd/20 text-dnd text-xs rounded-lg">{error}</div>}

          {/* Group Name Input */}
          <div>
            <label className={MODAL_FIELD_LABEL_CLASS}>
              Nome do Grupo (Opcional)
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ex: Galera do Game"
              className="w-full bg-background-darkest border border-white/10 rounded-lg px-3.5 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-brand-500"
            />
          </div>

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
            <button
              type="button"
              onClick={() => setIsE2EE(!isE2EE)}
              className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                isE2EE ? 'bg-emerald-500' : 'bg-gray-700'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  isE2EE ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
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

          {/* Footer actions */}
          <div className="pt-3 border-t border-white/5 flex items-center justify-between">
            <button
              type="button"
              onClick={onClose}
              className="text-xs text-gray-300 hover:underline cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isLoading || selectedFriendIds.length === 0}
              className="bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-medium px-4 py-2 rounded-lg text-xs transition-colors shadow cursor-pointer"
            >
              {isLoading ? 'Criando...' : 'Criar Grupo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
