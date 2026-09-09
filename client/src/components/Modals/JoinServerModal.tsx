import React, { useState, useEffect } from 'react';
import { X, Compass, Check } from 'lucide-react';
import { api } from '../../lib/api';
import { useGuildStore } from '../../stores/guildStore';

interface JoinServerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const JoinServerModal: React.FC<JoinServerModalProps> = ({ isOpen, onClose }) => {
  const [inputCode, setInputCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const { fetchGuilds, selectGuild } = useGuildStore();

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Extract 10-char hash if full url was pasted
    let cleanCode = inputCode.trim();
    if (cleanCode.includes('/invite/')) {
      cleanCode = cleanCode.split('/invite/').pop()?.trim() || cleanCode;
    }
    cleanCode = cleanCode.replace(/[^a-zA-Z0-9]/g, '');

    if (cleanCode.length !== 10) {
      setError('O código de convite deve conter exatamente 10 caracteres.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await api.invites.join(cleanCode);
      await fetchGuilds();
      if (res.guild_id) {
        await selectGuild(res.guild_id);
      }
      setInputCode('');
      onClose();
    } catch (err: any) {
      setError(err.message || 'Convite inválido ou expirado.');
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
        <div className="p-4 sm:p-6 pb-2 text-center relative flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-200 p-1 rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="w-12 h-12 bg-online/10 text-online rounded-2xl flex items-center justify-center mx-auto mb-2">
            <Compass className="w-6 h-6" />
          </div>
          <h2 className="text-lg sm:text-xl font-bold text-white">Entrar em um Servidor</h2>
          <p className="text-xs text-gray-400 mt-1">
            Digite o código de 10 caracteres ou o link de convite que você recebeu.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 overflow-y-auto no-scrollbar flex-1">
          {error && <div className="p-3 bg-dnd/20 text-dnd text-xs rounded-lg font-medium">{error}</div>}

          <div>
            <label className="block text-xs font-bold text-gray-300 uppercase mb-2">
              Link ou Código de Convite (10 Caracteres)
            </label>
            <input
              type="text"
              required
              value={inputCode}
              onChange={(e) => setInputCode(e.target.value)}
              placeholder="Ex: aB9xK2mP8q ou http://.../invite/aB9xK2mP8q"
              className="w-full bg-background-darkest text-white px-3.5 py-2.5 rounded-xl border border-white/5 focus:outline-none focus:border-brand-500 text-sm font-mono"
            />
          </div>

          <div className="flex justify-between items-center pt-2">
            <button
              type="button"
              onClick={onClose}
              className="text-sm text-gray-300 hover:underline cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isLoading || !inputCode.trim()}
              className="bg-online hover:bg-online/90 disabled:opacity-50 text-white font-semibold px-5 py-2 rounded-xl text-sm transition-colors cursor-pointer"
            >
              {isLoading ? 'Entrando...' : 'Entrar no Servidor'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
