import React, { useState } from 'react';
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
      if (res.id) {
        await selectGuild(res.id);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm select-none p-4">
      <div className="bg-background-dark w-full max-w-md rounded-2xl overflow-hidden shadow-2xl border border-white/10 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-6 pb-2 text-center relative">
          <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-200">
            <X className="w-5 h-5" />
          </button>
          <div className="w-12 h-12 bg-online/10 text-online rounded-2xl flex items-center justify-center mx-auto mb-2">
            <Compass className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-white">Entrar em um Servidor</h2>
          <p className="text-xs text-gray-400 mt-1">
            Digite o código de 10 caracteres ou o link de convite que você recebeu.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
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
            <button type="button" onClick={onClose} className="text-sm text-gray-300 hover:underline">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isLoading || !inputCode.trim()}
              className="bg-online hover:bg-online/90 disabled:opacity-50 text-white font-semibold px-5 py-2 rounded-xl text-sm transition-colors"
            >
              {isLoading ? 'Entrando...' : 'Entrar no Servidor'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
