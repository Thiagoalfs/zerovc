import React, { useState } from 'react';
import { X } from 'lucide-react';
import { useGuildStore } from '../../stores/guildStore';

interface CreateServerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CreateServerModal: React.FC<CreateServerModalProps> = ({ isOpen, onClose }) => {
  const [name, setName] = useState('');
  const [iconUrl, setIconUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const { createGuild } = useGuildStore();

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsLoading(true);
    setError('');
    try {
      await createGuild(name.trim(), iconUrl.trim() || undefined);
      setName('');
      setIconUrl('');
      onClose();
    } catch (err: any) {
      setError(err.message || 'Erro ao criar servidor');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm select-none p-4">
      <div className="bg-background-dark w-full max-w-md rounded-2xl overflow-hidden shadow-2xl border border-white/10 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-6 pb-2 text-center relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-200"
          >
            <X className="w-5 h-5" />
          </button>
          <h2 className="text-2xl font-bold text-white">Criar seu servidor</h2>
          <p className="text-sm text-gray-400 mt-1">
            Seu servidor é onde você e seus amigos se reúnem para conversar por texto e voz.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <div className="p-3 bg-dnd/20 text-dnd text-xs rounded-md">{error}</div>}

          <div>
            <label className="block text-xs font-bold text-gray-300 uppercase mb-2">
              Nome do Servidor
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Sala dos Amigos"
              className="w-full bg-background-darkest text-white px-3 py-2.5 rounded-lg border border-white/5 focus:outline-none focus:border-brand-500 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-300 uppercase mb-2">
              URL do Ícone (Opcional)
            </label>
            <input
              type="url"
              value={iconUrl}
              onChange={(e) => setIconUrl(e.target.value)}
              placeholder="https://..."
              className="w-full bg-background-darkest text-white px-3 py-2.5 rounded-lg border border-white/5 focus:outline-none focus:border-brand-500 text-sm"
            />
          </div>

          {/* Footer actions */}
          <div className="flex justify-between items-center pt-4">
            <button
              type="button"
              onClick={onClose}
              className="text-sm text-gray-300 hover:underline"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isLoading || !name.trim()}
              className="bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-medium px-5 py-2 rounded-lg text-sm transition-colors"
            >
              {isLoading ? 'Criando...' : 'Criar Servidor'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
