import React, { useState } from 'react';
import { X, Trash2, Hash, Volume2 } from 'lucide-react';
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
  const { updateChannel, deleteChannel } = useGuildStore();
  const [name, setName] = useState(channel?.name || '');
  const [topic, setTopic] = useState(channel?.topic || '');
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  if (!isOpen || !channel) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSaving(true);
    try {
      await updateChannel(channel.id, {
        name: name.trim().toLowerCase().replace(/\s+/g, '-'),
        topic: topic.trim(),
      });
      onClose();
    } catch (err) {
      console.error('Failed to update channel:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (confirm(`Tem certeza que deseja excluir o canal #${channel.name}? Esta ação não pode ser desfeita.`)) {
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
      <div className="bg-background-darkest w-full max-w-md rounded-2xl overflow-hidden shadow-2xl border border-white/10 animate-in fade-in zoom-in-95">
        {/* Header */}
        <div className="p-6 pb-4 flex items-center justify-between border-b border-white/5">
          <div className="flex items-center gap-2">
            {channel.type === 'text' ? (
              <Hash className="w-5 h-5 text-gray-400" />
            ) : (
              <Volume2 className="w-5 h-5 text-online" />
            )}
            <h2 className="text-lg font-bold text-white">Configurações do Canal</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSave} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-1.5">
              Nome do Canal
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ex: bate-papo"
              className="w-full bg-background-darker border border-white/10 rounded-lg px-3.5 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-brand-500"
            />
          </div>

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

          <div className="pt-2 border-t border-white/5 flex items-center justify-between">
            <button
              type="button"
              onClick={handleDelete}
              disabled={isDeleting}
              className="text-dnd hover:bg-dnd/10 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5"
            >
              <Trash2 className="w-4 h-4" />
              Excluir Canal
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 text-xs text-gray-300 hover:underline"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-medium px-4 py-1.5 rounded-lg text-xs transition-colors shadow"
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
