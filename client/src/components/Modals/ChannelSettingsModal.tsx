import React, { useState, useEffect } from 'react';
import { X, Trash2, Hash, Volume2, Folder, Lock } from 'lucide-react';
import { Channel } from '../../types';
import { useGuildStore } from '../../stores/guildStore';

interface ChannelSettingsModalProps {
  channel: Channel | null;
  isOpen: boolean;
  onClose: () => void;
}

export const ChannelSettingsModal: React.FC<ChannelSettingsModalProps> = ({
  channel,
  isOpen,
  onClose,
}) => {
  const { activeGuild, updateChannel, deleteChannel } = useGuildStore();
  const [name, setName] = useState('');
  const [topic, setTopic] = useState('');
  const [categoryId, setCategoryId] = useState<string | undefined>(undefined);
  const [isPrivate, setIsPrivate] = useState(false);
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (channel && isOpen) {
      setName(channel.name || '');
      setTopic(channel.topic || '');
      setCategoryId(channel.category_id);
      setIsPrivate(!!channel.is_private);
      setSelectedRoleIds(channel.role_ids || []);
    }
  }, [channel, isOpen]);

  if (!isOpen || !channel) return null;

  const isCategory = channel.type === 'category';
  const categories = (activeGuild?.channels || []).filter(
    (c) => c.type === 'category' && c.id !== channel.id
  );
  const roles = activeGuild?.roles || [];

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSaving(true);
    try {
      const formattedName = isCategory
        ? name.trim()
        : name.trim().toLowerCase().replace(/\s+/g, '-');

      await updateChannel(channel.id, {
        name: formattedName,
        topic: isCategory ? undefined : topic.trim(),
        category_id: isCategory ? undefined : categoryId,
        clear_category: !isCategory && !categoryId,
        is_private: isCategory ? false : isPrivate,
        role_ids: isCategory || !isPrivate ? [] : selectedRoleIds,
      } as any);
      onClose();
    } catch (err) {
      console.error('Failed to update channel:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    const confirmMessage = isCategory
      ? `Tem certeza que deseja excluir a categoria "${channel.name}"? Os canais dentro dela serão movidos para a raiz.`
      : `Tem certeza que deseja excluir o canal #${channel.name}? Esta ação não pode ser desfeita.`;

    if (confirm(confirmMessage)) {
      setIsDeleting(true);
      try {
        await deleteChannel(channel.id);
        onClose();
      } catch (err) {
        console.error('Failed to delete channel:', err);
      } finally {
        setIsDeleting(false);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 select-none">
      <div className="bg-background-darkest w-full max-w-md max-h-[90vh] flex flex-col rounded-2xl overflow-hidden shadow-2xl border border-white/10 animate-in fade-in zoom-in-95">
        {/* Header */}
        <div className="p-6 pb-4 flex items-center justify-between border-b border-white/5 flex-shrink-0">
          <div className="flex items-center gap-2">
            {isCategory ? (
              <Folder className="w-5 h-5 text-brand-400" />
            ) : channel.type === 'text' ? (
              <Hash className="w-5 h-5 text-gray-400" />
            ) : (
              <Volume2 className="w-5 h-5 text-online" />
            )}
            <h2 className="text-lg font-bold text-white">
              {isCategory ? 'Configurações da Categoria' : 'Configurações do Canal'}
            </h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSave} className="p-6 space-y-4 overflow-y-auto flex-1 no-scrollbar">
          <div>
            <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-1.5">
              {isCategory ? 'Nome da Categoria' : 'Nome do Canal'}
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={isCategory ? 'ex: COMUNIDADE' : 'ex: bate-papo'}
              className="w-full bg-background-darker border border-white/10 rounded-lg px-3.5 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-brand-500"
            />
          </div>

          {!isCategory && categories.length > 0 && (
            <div>
              <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-1.5">
                Categoria
              </label>
              <select
                value={categoryId || ''}
                onChange={(e) => setCategoryId(e.target.value ? e.target.value : undefined)}
                className="w-full bg-background-darker border border-white/10 rounded-lg px-3.5 py-2 text-sm text-gray-100 focus:outline-none focus:border-brand-500 cursor-pointer"
              >
                <option value="">Nenhuma (Raiz)</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {!isCategory && (
            <div>
              <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-1.5">
                Tópico do Canal
              </label>
              <textarea
                rows={2}
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="Descreva o propósito deste canal..."
                className="w-full bg-background-darker border border-white/10 rounded-lg px-3.5 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-brand-500 resize-none"
              />
            </div>
          )}

          {/* Private Channel Toggle */}
          {!isCategory && (
            <div className="pt-2 border-t border-white/5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Lock className="w-4 h-4 text-brand-400" />
                  <div>
                    <span className="text-xs font-bold text-white block">Canal Privado</span>
                    <span className="text-[11px] text-gray-400">Apenas cargos autorizados podem ver este canal</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setIsPrivate(!isPrivate)}
                  className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    isPrivate ? 'bg-brand-500' : 'bg-gray-700'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                      isPrivate ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Roles Multi-select when Private */}
              {isPrivate && roles.length > 0 && (
                <div className="space-y-1.5 p-3 rounded-xl bg-background-darker border border-white/5 animate-in fade-in">
                  <span className="text-[11px] font-bold text-gray-300 uppercase tracking-wider block mb-1">
                    Cargos com Acesso
                  </span>
                  <div className="max-h-32 overflow-y-auto space-y-1 pr-1 no-scrollbar">
                    {roles.map((role) => {
                      const isSelected = selectedRoleIds.includes(role.id);
                      return (
                        <div
                          key={role.id}
                          onClick={() => {
                            if (isSelected) {
                              setSelectedRoleIds(selectedRoleIds.filter((id) => id !== role.id));
                            } else {
                              setSelectedRoleIds([...selectedRoleIds, role.id]);
                            }
                          }}
                          className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-brand-500/20 text-white border border-brand-500/30'
                              : 'text-gray-400 hover:bg-white/5'
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate">
                            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: role.color }} />
                            <span className="truncate">{role.name}</span>
                          </div>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {}}
                            className="rounded border-gray-600 text-brand-500 focus:ring-0 pointer-events-none"
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="pt-3 border-t border-white/5 flex items-center justify-between">
            <button
              type="button"
              onClick={handleDelete}
              disabled={isDeleting}
              className="text-dnd hover:bg-dnd/10 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
              {isCategory ? 'Excluir Categoria' : 'Excluir Canal'}
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 text-xs text-gray-300 hover:underline cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-medium px-4 py-1.5 rounded-lg text-xs transition-colors shadow cursor-pointer"
              >
                {isSaving ? 'Salvando...' : 'Salvar Alterações'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
