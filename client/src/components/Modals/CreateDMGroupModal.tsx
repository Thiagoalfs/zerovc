import React, { useState, useEffect } from 'react';
import { X, Users, Check } from 'lucide-react';
import { useFriendStore } from '../../stores/friendStore';
import { useDMGroupStore } from '../../stores/dmGroupStore';

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
      if (selectedFriendIds.length >= 9) {
        setError('Você pode adicionar no máximo 9 amigos (10 pessoas no total).');
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
      const group = await createGroup(name.trim() || undefined, selectedFriendIds);
      onClose();
      onGroupCreated(group.id);
    } catch (err: any) {
      setError(err.message || 'Falha ao criar grupo');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm select-none p-4">
      <div className="bg-background-dark w-full max-w-md max-h-[90vh] flex flex-col rounded-2xl overflow-hidden shadow-2xl border border-white/10 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-6 pb-3 flex items-center justify-between border-b border-white/5 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-brand-400" />
            <h2 className="text-lg font-bold text-white">Criar Grupo de DM</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleCreate} className="p-6 space-y-4 overflow-y-auto flex-1 no-scrollbar">
          {error && <div className="p-3 bg-dnd/20 text-dnd text-xs rounded-lg">{error}</div>}

          {/* Group Name Input */}
          <div>
            <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-1.5">
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

          {/* Friends Selection */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider">
                Selecione Amigos
              </label>
              <span className="text-[11px] text-gray-400">
                {selectedFriendIds.length} / 9 selecionados
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
                            <img src={friendUser.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
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
