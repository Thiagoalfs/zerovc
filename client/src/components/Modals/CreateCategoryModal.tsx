import React, { useState, useEffect } from 'react';
import { X, FolderPlus } from 'lucide-react';
import { useGuildStore } from '../../stores/guildStore';

interface CreateCategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CreateCategoryModal: React.FC<CreateCategoryModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const { activeGuild, createChannel } = useGuildStore();

  useEffect(() => {
    if (isOpen) {
      setName('');
      setError('');
    }
  }, [isOpen]);

  if (!isOpen || !activeGuild) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsLoading(true);
    setError('');
    try {
      await createChannel(
        activeGuild.id,
        name.trim(),
        'category',
        undefined,
        undefined,
        false,
        undefined
      );
      onClose();
    } catch (err: any) {
      setError(err.message || 'Erro ao criar categoria');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm select-none p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-150"
    >
      <div className="bg-background-dark w-full max-w-md max-h-[92dvh] my-auto flex flex-col rounded-2xl overflow-hidden shadow-2xl border border-white/10 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-4 sm:p-6 pb-2 relative flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-200 cursor-pointer p-1 rounded-lg hover:bg-white/5 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <FolderPlus className="w-5 h-5 text-brand-400" />
            <h2 className="text-lg sm:text-xl font-bold text-white">Criar Categoria</h2>
          </div>
          <p className="text-xs text-gray-400 mt-1 truncate">em {activeGuild.name}</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 overflow-y-auto no-scrollbar flex-1">
          {error && <div className="p-3 bg-dnd/20 text-dnd text-xs rounded-md">{error}</div>}

          {/* Name Field */}
          <div>
            <label className="block text-xs font-bold text-gray-300 uppercase mb-2">
              Nome da Categoria
            </label>
            <div className="relative flex items-center">
              <span className="absolute left-3 text-gray-400">
                <FolderPlus className="w-4 h-4" />
              </span>
              <input
                type="text"
                required
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="NOVA CATEGORIA"
                className="w-full bg-background-darkest text-white pl-9 pr-3 py-2.5 rounded-lg border border-white/5 focus:outline-none focus:border-brand-500 text-sm"
              />
            </div>
            <p className="text-[11px] text-gray-400 mt-1.5">
              Use categorias para organizar seus canais de texto e voz.
            </p>
          </div>

          {/* Footer actions */}
          <div className="flex justify-between items-center pt-4 border-t border-white/5">
            <button
              type="button"
              onClick={onClose}
              className="text-sm text-gray-300 hover:underline cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isLoading || !name.trim()}
              className="bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-medium px-5 py-2 rounded-lg text-sm transition-colors cursor-pointer"
            >
              {isLoading ? 'Criando...' : 'Criar Categoria'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
