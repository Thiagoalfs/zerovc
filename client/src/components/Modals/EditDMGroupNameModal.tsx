import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Edit3 } from 'lucide-react';
import { useDMGroupStore } from '../../stores/dmGroupStore';
import { DMGroup } from '../../types';

interface EditDMGroupNameModalProps {
  isOpen: boolean;
  onClose: () => void;
  group: DMGroup | null;
}

export const EditDMGroupNameModal: React.FC<EditDMGroupNameModalProps> = ({
  isOpen,
  onClose,
  group,
}) => {
  const { updateGroup } = useDMGroupStore();
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen && group) {
      setName(group.name || '');
      setError('');
    }
  }, [isOpen, group]);

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

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    try {
      await updateGroup(group.id, { name: name.trim() });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Falha ao atualizar o nome do grupo');
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
            <Edit3 className="w-5 h-5 text-brand-400" />
            <h2 className="text-base sm:text-lg font-bold text-white">Mudar Nome do Grupo</h2>
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
        <form onSubmit={handleSave} className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1 no-scrollbar">
          {error && <div className="p-3 bg-dnd/20 text-dnd text-xs rounded-lg">{error}</div>}

          <div>
            <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-1.5">
              Nome do Grupo
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Digite um novo nome para o grupo"
              maxLength={100}
              className="w-full bg-background-darkest border border-white/10 rounded-lg px-3.5 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-brand-500"
              autoFocus
            />
            <p className="text-[11px] text-gray-500 mt-1">
              Deixe em branco para usar os nomes dos participantes como padrão.
            </p>
          </div>

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
              disabled={isLoading}
              className="px-4 py-2 text-xs font-semibold bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg transition-colors cursor-pointer shadow-md"
            >
              {isLoading ? 'Salvando...' : 'Salvar Alterações'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};
