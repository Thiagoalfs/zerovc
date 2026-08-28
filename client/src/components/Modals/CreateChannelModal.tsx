import React, { useState } from 'react';
import { X, Hash, Volume2 } from 'lucide-react';
import { useGuildStore } from '../../stores/guildStore';

interface CreateChannelModalProps {
  isOpen: boolean;
  initialType?: 'text' | 'voice';
  onClose: () => void;
}

export const CreateChannelModal: React.FC<CreateChannelModalProps> = ({
  isOpen,
  initialType = 'text',
  onClose,
}) => {
  const [name, setName] = useState('');
  const [topic, setTopic] = useState('');
  const [type, setType] = useState<'text' | 'voice'>(initialType);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const { activeGuild, createChannel } = useGuildStore();

  if (!isOpen || !activeGuild) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsLoading(true);
    setError('');
    try {
      await createChannel(activeGuild.id, name.trim().toLowerCase().replace(/\s+/g, '-'), type, topic.trim() || undefined);
      setName('');
      setTopic('');
      onClose();
    } catch (err: any) {
      setError(err.message || 'Erro ao criar canal');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm select-none p-4">
      <div className="bg-background-dark w-full max-w-md rounded-2xl overflow-hidden shadow-2xl border border-white/10 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-6 pb-2 relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-200"
          >
            <X className="w-5 h-5" />
          </button>
          <h2 className="text-xl font-bold text-white">Criar Canal</h2>
          <p className="text-xs text-gray-400 mt-1">em {activeGuild.name}</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <div className="p-3 bg-dnd/20 text-dnd text-xs rounded-md">{error}</div>}

          {/* Type Selector */}
          <div>
            <label className="block text-xs font-bold text-gray-300 uppercase mb-2">
              Tipo de Canal
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
                <Hash className="w-6 h-6 text-gray-400" />
                <div className="flex flex-col">
                  <span className="font-semibold text-sm">Texto</span>
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
                <Volume2 className="w-6 h-6 text-gray-400" />
                <div className="flex flex-col">
                  <span className="font-semibold text-sm">Voz</span>
                  <span className="text-xs text-gray-400">Converse por voz e compartilhe tela</span>
                </div>
              </div>
            </div>
          </div>

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
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="novo-canal"
                className="w-full bg-background-darkest text-white pl-8 pr-3 py-2.5 rounded-lg border border-white/5 focus:outline-none focus:border-brand-500 text-sm"
              />
            </div>
          </div>

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
              {isLoading ? 'Criando...' : 'Criar Canal'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
