import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, UserPlus, Check } from 'lucide-react';
import { useFriendStore } from '../../stores/friendStore';
import { useDMGroupStore } from '../../stores/dmGroupStore';
import { formatAssetUrl } from '../../lib/api';
import { DMGroup } from '../../types';

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
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm select-none p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-150"
    >
      <div className="bg-background-dark w-full max-w-md max-h-[92dvh] my-auto flex flex-col rounded-2xl overflow-hidden shadow-2xl border border-white/10 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-4 sm:p-6 pb-3 flex items-center justify-between border-b border-white/5 flex-shrink-0">
          <div className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-brand-400" />
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white leading-tight">Adicionar ao Grupo</h2>
              <p className="text-xs text-gray-400">{group.name || 'Grupo de DM'}</p>
            </div>
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
        <form onSubmit={handleAdd} className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1 no-scrollbar">
          {error && <div className="p-3 bg-dnd/20 text-dnd text-xs rounded-lg">{error}</div>}

          {/* Friends Selection */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider">
                Selecione Amigos
              </label>
              <span className="text-[11px] text-gray-400">
                {selectedFriendIds.length} / {maxAddable} vagas restantes
              </span>
            </div>

            {availableFriends.length === 0 ? (
              <div className="p-6 text-center border border-dashed border-white/10 rounded-xl">
                <p className="text-xs text-gray-400">
                  {friends.length === 0
                    ? 'Você ainda não tem amigos adicionados.'
                    : 'Todos os seus amigos já estão neste grupo!'}
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

          {/* Footer actions */}
          <div className="flex justify-end gap-2 pt-2 border-t border-white/5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-gray-300 hover:text-white hover:bg-white/5 rounded-lg transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isLoading || selectedFriendIds.length === 0 || maxAddable <= 0}
              className="px-4 py-2 text-xs font-semibold bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg transition-colors cursor-pointer shadow-md"
            >
              {isLoading ? 'Adicionando...' : `Adicionar (${selectedFriendIds.length})`}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};
