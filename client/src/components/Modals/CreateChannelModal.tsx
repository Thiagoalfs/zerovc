import React, { useState, useEffect } from 'react';
import { X, Hash, Volume2, Lock } from 'lucide-react';
import { useGuildStore } from '../../stores/guildStore';

interface CreateChannelModalProps {
  isOpen: boolean;
  initialType?: 'text' | 'voice';
  initialCategoryId?: string;
  onClose: () => void;
}

export const CreateChannelModal: React.FC<CreateChannelModalProps> = ({
  isOpen,
  initialType = 'text',
  initialCategoryId,
  onClose,
}) => {
  const [name, setName] = useState('');
  const [topic, setTopic] = useState('');
  const [type, setType] = useState<'text' | 'voice'>(initialType);
  const [isPrivate, setIsPrivate] = useState(false);
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const { activeGuild, createChannel } = useGuildStore();

  useEffect(() => {
    if (isOpen) {
      setType(initialType);
      setName('');
      setTopic('');
      setIsPrivate(false);
      setSelectedRoleIds([]);
      setError('');
    }
  }, [isOpen, initialType]);

  if (!isOpen || !activeGuild) return null;

  const roles = activeGuild.roles || [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsLoading(true);
    setError('');
    try {
      const formattedName = name.trim().toLowerCase().replace(/\s+/g, '-');

      await createChannel(
        activeGuild.id,
        formattedName,
        type,
        type === 'text' ? (topic.trim() || undefined) : undefined,
        initialCategoryId,
        isPrivate,
        !isPrivate ? undefined : selectedRoleIds
      );
      onClose();
    } catch (err: any) {
      setError(err.message || 'Erro ao criar canal');
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
          <h2 className="text-lg sm:text-xl font-bold text-white">Criar Canal</h2>
          <p className="text-xs text-gray-400 mt-1 truncate">em {activeGuild.name}</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1 no-scrollbar">
          {error && <div className="p-3 bg-dnd/20 text-dnd text-xs rounded-md">{error}</div>}

          {/* Type Selector */}
          <div>
            <label className="block text-xs font-bold text-gray-300 uppercase mb-2">
              Tipo do Canal
            </label>
            <div className="space-y-2">
              {/* Text Option */}
              <div
                onClick={() => setType('text')}
                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                  type === 'text'
                    ? 'bg-background-light border-brand-500 text-white'
                    : 'bg-background-darkest border-white/5 text-gray-400 hover:bg-background-light/40'
                }`}
              >
                <Hash className="w-5 h-5 text-gray-400" />
                <div className="flex flex-col">
                  <span className="font-semibold text-sm">Canal de Texto</span>
                  <span className="text-xs text-gray-400">Poste mensagens, imagens e memes</span>
                </div>
              </div>

              {/* Voice Option */}
              <div
                onClick={() => setType('voice')}
                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                  type === 'voice'
                    ? 'bg-background-light border-brand-500 text-white'
                    : 'bg-background-darkest border-white/5 text-gray-400 hover:bg-background-light/40'
                }`}
              >
                <Volume2 className="w-5 h-5 text-gray-400" />
                <div className="flex flex-col">
                  <span className="font-semibold text-sm">Canal de Voz</span>
                  <span className="text-xs text-gray-400">Converse por voz e compartilhe tela</span>
                </div>
              </div>
            </div>
          </div>

          {/* Name Field */}
          <div>
            <label className="block text-xs font-bold text-gray-300 uppercase mb-2">
              Nome do Canal
            </label>
            <div className="relative flex items-center">
              <span className="absolute left-3 text-gray-400">
                {type === 'text' ? '#' : <Volume2 className="w-4 h-4" />}
              </span>
              <input
                type="text"
                required
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={type === 'text' ? 'novo-canal' : 'novo-canal-de-voz'}
                className="w-full bg-background-darkest text-white pl-8 pr-3 py-2.5 rounded-lg border border-white/5 focus:outline-none focus:border-brand-500 text-sm"
              />
            </div>
          </div>

          {/* Topic for Text channels */}
          {type === 'text' && (
            <div>
              <label className="block text-xs font-bold text-gray-300 uppercase mb-2">
                Tópico (Opcional)
              </label>
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="Sobre o que é este canal?"
                className="w-full bg-background-darkest text-white px-3 py-2.5 rounded-lg border border-white/5 focus:outline-none focus:border-brand-500 text-sm"
              />
            </div>
          )}

          {/* Private Channel Toggle */}
          <div className="pt-2 border-t border-white/5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-brand-400" />
                <div>
                  <span className="text-xs font-bold text-white block">Canal Privado</span>
                  <span className="text-[11px] text-gray-400">Apenas cargos selecionados podem ver este canal</span>
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
              <div className="space-y-1.5 p-3 rounded-xl bg-background-darkest/70 border border-white/5 animate-in fade-in">
                <span className="text-[11px] font-bold text-gray-300 uppercase tracking-wider block mb-1">
                  Quem pode acessar este canal?
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
                          className="rounded border-gray-600 text-brand-500 focus:ring-0 pointer-events-none cursor-pointer"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
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
              {isLoading ? 'Criando...' : 'Criar Canal'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
