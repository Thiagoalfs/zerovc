import React, { useState } from 'react';
import { X, Sparkles, Compass, ChevronRight, ArrowLeft } from 'lucide-react';
import { useGuildStore } from '../../stores/guildStore';
import { api } from '../../lib/api';

interface CreateServerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CreateServerModal: React.FC<CreateServerModalProps> = ({ isOpen, onClose }) => {
  const [mode, setMode] = useState<'choose' | 'create' | 'join'>('choose');
  const [name, setName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const { createGuild, fetchGuilds, selectGuild } = useGuildStore();

  if (!isOpen) return null;

  const handleClose = () => {
    setMode('choose');
    setName('');
    setInviteCode('');
    setError('');
    setIsLoading(false);
    onClose();
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsLoading(true);
    setError('');
    try {
      // Create guild with only the name (no photo/icon requested)
      await createGuild(name.trim());
      handleClose();
    } catch (err: any) {
      setError(err.message || 'Erro ao criar servidor');
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Extract 10-char hash if full url was pasted
    let cleanCode = inviteCode.trim();
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
      handleClose();
    } catch (err: any) {
      setError(err.message || 'Convite inválido ou expirado.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm select-none p-4 animate-in fade-in duration-150">
      <div className="bg-background-dark w-full max-w-md rounded-2xl overflow-hidden shadow-2xl border border-white/10 animate-in fade-in zoom-in-95 duration-150 flex flex-col">
        {/* Header */}
        <div className="p-6 pb-2 text-center relative">
          <button
            onClick={handleClose}
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-200 p-1"
          >
            <X className="w-5 h-5" />
          </button>

          {mode === 'choose' && (
            <>
              <h2 className="text-xl md:text-2xl font-bold text-white">Adicionar um Servidor</h2>
              <p className="text-xs md:text-sm text-gray-400 mt-1">
                Seu servidor é onde você e seus amigos se reúnem. Escolha uma opção para começar.
              </p>
            </>
          )}

          {mode === 'create' && (
            <>
              <h2 className="text-xl md:text-2xl font-bold text-white">Criar seu Servidor</h2>
              <p className="text-xs text-gray-400 mt-1">
                Dê um nome ao seu novo servidor. Você pode alterá-lo quando quiser.
              </p>
            </>
          )}

          {mode === 'join' && (
            <>
              <h2 className="text-xl md:text-2xl font-bold text-white">Entrar em um Servidor</h2>
              <p className="text-xs text-gray-400 mt-1">
                Digite o código de 10 caracteres ou o link de convite que você recebeu.
              </p>
            </>
          )}
        </div>

        {/* Content */}
        <div className="p-6 pt-4">
          {error && (
            <div className="mb-4 p-3 bg-dnd/20 border border-dnd/30 text-dnd text-xs rounded-xl font-medium">
              {error}
            </div>
          )}

          {/* 1. CHOOSE MODE */}
          {mode === 'choose' && (
            <div className="space-y-3">
              {/* Option 1: Create */}
              <button
                type="button"
                onClick={() => {
                  setError('');
                  setMode('create');
                }}
                className="w-full p-4 rounded-2xl bg-background-darker/80 hover:bg-background-darker border border-white/5 hover:border-brand-500/50 flex items-center justify-between text-left transition-all group"
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-11 h-11 rounded-2xl bg-brand-500/15 text-brand-400 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
                    <Sparkles className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="font-bold text-white text-sm block">Criar meu próprio servidor</span>
                    <span className="text-xs text-gray-400 mt-0.5 block leading-tight">
                      Crie um espaço personalizado para você e seus amigos
                    </span>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-white group-hover:translate-x-0.5 transition-all flex-shrink-0 ml-2" />
              </button>

              {/* Option 2: Join */}
              <button
                type="button"
                onClick={() => {
                  setError('');
                  setMode('join');
                }}
                className="w-full p-4 rounded-2xl bg-background-darker/80 hover:bg-background-darker border border-white/5 hover:border-online/50 flex items-center justify-between text-left transition-all group"
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-11 h-11 rounded-2xl bg-online/15 text-online flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
                    <Compass className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="font-bold text-white text-sm block">Entrar em um servidor</span>
                    <span className="text-xs text-gray-400 mt-0.5 block leading-tight">
                      Já tem um código ou link de convite? Entre aqui
                    </span>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-white group-hover:translate-x-0.5 transition-all flex-shrink-0 ml-2" />
              </button>
            </div>
          )}

          {/* 2. CREATE SERVER FORM */}
          {mode === 'create' && (
            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-2">
                  Nome do Servidor
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Servidor dos Amigos"
                  className="w-full bg-background-darkest text-white px-3.5 py-2.5 rounded-xl border border-white/5 focus:outline-none focus:border-brand-500 text-sm shadow-inner"
                />
              </div>

              <div className="flex justify-between items-center pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setError('');
                    setMode('choose');
                  }}
                  className="text-xs md:text-sm text-gray-400 hover:text-white flex items-center gap-1.5"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Voltar</span>
                </button>

                <button
                  type="submit"
                  disabled={isLoading || !name.trim()}
                  className="bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-semibold px-5 py-2.5 rounded-xl text-xs md:text-sm transition-colors shadow-lg shadow-brand-500/25"
                >
                  {isLoading ? 'Criando...' : 'Criar Servidor'}
                </button>
              </div>
            </form>
          )}

          {/* 3. JOIN SERVER FORM */}
          {mode === 'join' && (
            <form onSubmit={handleJoinSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-2">
                  Código de Convite ou Link
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  placeholder="Ex: aB9xK2mP8q ou http://.../invite/aB9xK2mP8q"
                  className="w-full bg-background-darkest text-white px-3.5 py-2.5 rounded-xl border border-white/5 focus:outline-none focus:border-online text-sm font-mono shadow-inner"
                />
              </div>

              <div className="flex justify-between items-center pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setError('');
                    setMode('choose');
                  }}
                  className="text-xs md:text-sm text-gray-400 hover:text-white flex items-center gap-1.5"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Voltar</span>
                </button>

                <button
                  type="submit"
                  disabled={isLoading || !inviteCode.trim()}
                  className="bg-online hover:bg-online/90 disabled:opacity-50 text-white font-semibold px-5 py-2.5 rounded-xl text-xs md:text-sm transition-colors shadow-lg shadow-online/25"
                >
                  {isLoading ? 'Entrando...' : 'Entrar no Servidor'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
