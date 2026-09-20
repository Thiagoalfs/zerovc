import React, { useState, useEffect } from 'react';
import { Gamepad2, Check, Plus, Trash2, Edit2, X, ChevronDown, Monitor, Sparkles } from 'lucide-react';
import { useRegisteredGamesStore, RegisteredGame } from '../../stores/registeredGamesStore';
import { useAuthStore } from '../../stores/authStore';
import { useGuildStore } from '../../stores/guildStore';
import { api } from '../../lib/api';

function formatLastPlayed(timestamp: number): string {
  if (!timestamp) return 'Nunca jogado';
  const diffMs = Date.now() - timestamp;
  if (diffMs < 0) return 'Jogado agora';
  const diffMins = Math.floor(diffMs / (60 * 1000));
  const diffHours = Math.floor(diffMs / (3600 * 1000));
  const diffDays = Math.floor(diffMs / (86400 * 1000));

  if (diffMins < 5) return 'Jogado agora';
  if (diffMins < 60) return `Jogado há ${diffMins} minutos`;
  if (diffHours === 1) return 'Jogado há 1 hora';
  if (diffHours < 24) return `Jogado há ${diffHours} horas`;
  if (diffDays === 1) return 'Jogado há 1 dia';
  if (diffDays < 30) return `Jogado há ${diffDays} dias`;
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths === 1) return 'Jogado há 1 mês';
  return `Jogado há ${diffMonths} meses`;
}

export const RegisteredGamesView: React.FC = () => {
  const { games, addOrUpdateGame, toggleGameEnabled, removeGame, renameGame } = useRegisteredGamesStore();
  const { user, setUser, updateProfile } = useAuthStore();

  const [isAddingGame, setIsAddingGame] = useState(false);
  const [customGameName, setCustomGameName] = useState('');
  const [runningWindows, setRunningWindows] = useState<string[]>([]);
  const [editingGameId, setEditingGameId] = useState<string | null>(null);
  const [editingGameName, setEditingGameName] = useState('');

  // Fetch running windows in Electron if available
  useEffect(() => {
    if (isAddingGame && typeof window !== 'undefined' && window.electronAPI?.getScreenSources) {
      window.electronAPI.getScreenSources().then((sources) => {
        const names = Array.from(
          new Set(
            sources
              .filter((s) => s.id.startsWith('window:') && s.name.trim().length > 0)
              .map((s) => s.name.trim())
          )
        );
        setRunningWindows(names);
      }).catch(() => {});
    }
  }, [isAddingGame]);

  const activeActivity = user?.custom_activity;
  const currentRunningGame = games.find(
    (g) => g.name.toLowerCase() === activeActivity?.name?.toLowerCase()
  ) || (activeActivity?.name ? {
    id: 'current-live-game',
    name: activeActivity.name,
    lastPlayed: Date.now(),
    enabled: true,
    isVerified: true,
  } : null);

  const handleToggleGame = async (game: RegisteredGame) => {
    toggleGameEnabled(game.id);
    const willBeEnabled = !game.enabled;

    // If this is the currently running game and user toggled it off, stop broadcasting
    if (activeActivity && activeActivity.name.toLowerCase() === game.name.toLowerCase()) {
      if (!willBeEnabled) {
        setUser({ custom_activity: null });
        if (user?.id) {
          useGuildStore.getState().updateMemberInGuild({ id: user.id, custom_activity: null });
        }
        try {
          const updated = await updateProfile({ custom_activity: null });
          setUser(updated);
        } catch (err) {
          console.error('Failed to clear activity:', err);
        }
      }
    }
  };

  const handleAddCustomGame = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!customGameName.trim()) return;
    addOrUpdateGame(customGameName.trim(), false);
    setCustomGameName('');
    setIsAddingGame(false);
  };

  const handleSelectWindow = (name: string) => {
    if (!name.trim()) return;
    addOrUpdateGame(name.trim(), false);
    setCustomGameName('');
    setIsAddingGame(false);
  };

  const handleSaveRename = (id: string) => {
    if (editingGameName.trim()) {
      renameGame(id, editingGameName.trim());
    }
    setEditingGameId(null);
    setEditingGameName('');
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      {/* 1. CURRENT GAME SECTION */}
      <div>
        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
          <Gamepad2 className="w-3.5 h-3.5 text-brand-400" />
          <span>Jogo Atual</span>
        </h4>

        {currentRunningGame ? (
          <div className="bg-background-darkest/90 rounded-2xl border border-white/5 p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-brand-500/20 text-brand-400 flex items-center justify-center shrink-0">
                <Gamepad2 className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-white truncate">{currentRunningGame.name}</span>
                  {currentRunningGame.isVerified && (
                    <span
                      className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-[#5865F2] text-white shadow-xs shrink-0"
                      title="Jogo Verificado"
                    >
                      <Check className="w-2.5 h-2.5 stroke-[3]" />
                    </span>
                  )}
                </div>
                <span className="text-[11px] text-emerald-400 font-medium flex items-center gap-1.5 mt-0.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  Em execução agora
                </span>
              </div>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={currentRunningGame.enabled}
              onClick={() => handleToggleGame(currentRunningGame)}
              className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors duration-200 cursor-pointer flex-shrink-0 ${
                currentRunningGame.enabled ? 'bg-brand-500' : 'bg-white/10'
              }`}
            >
              <div
                className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
                  currentRunningGame.enabled ? 'translate-x-6' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        ) : (
          <div className="bg-background-darkest/90 rounded-2xl border border-white/5 p-5">
            <h5 className="text-sm font-bold text-white mb-1">Nenhum jogo detectado</h5>
            <p className="text-xs text-gray-400">
              Não está vendo seu jogo?{' '}
              <button
                type="button"
                onClick={() => setIsAddingGame(true)}
                className="text-brand-400 hover:text-brand-300 font-semibold hover:underline cursor-pointer transition-colors"
              >
                Adicione-o!
              </button>
            </p>
          </div>
        )}
      </div>

      {/* ADD GAME DROPDOWN / MODAL */}
      {isAddingGame && (
        <div className="bg-background-darker p-4 rounded-2xl border border-brand-500/30 space-y-3 animate-in fade-in">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5 text-brand-400" />
              Adicionar Jogo ou Aplicativo
            </span>
            <button
              type="button"
              onClick={() => {
                setIsAddingGame(false);
                setCustomGameName('');
              }}
              className="p-1 text-gray-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Running Windows selector if in Electron */}
          {runningWindows.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-[11px] font-semibold text-gray-400">Janelas e Processos Ativos:</span>
              <div className="max-h-36 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                {runningWindows.map((win) => (
                  <button
                    key={win}
                    type="button"
                    onClick={() => handleSelectWindow(win)}
                    className="w-full flex items-center justify-between px-3 py-2 bg-background-darkest hover:bg-brand-500/10 hover:border-brand-500/40 rounded-xl border border-white/5 text-left text-xs text-gray-200 transition-all cursor-pointer"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <Monitor className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                      <span className="truncate">{win}</span>
                    </div>
                    <span className="text-[10px] text-brand-400 font-semibold shrink-0">Adicionar</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Manual Input */}
          <form onSubmit={handleAddCustomGame} className="flex gap-2 pt-1">
            <input
              type="text"
              value={customGameName}
              onChange={(e) => setCustomGameName(e.target.value)}
              placeholder="Ou digite o nome do jogo customizado..."
              className="flex-1 bg-background-darkest border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-brand-500"
            />
            <button
              type="submit"
              disabled={!customGameName.trim()}
              className="bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-semibold px-4 py-2 rounded-xl text-xs transition-all cursor-pointer shadow-sm"
            >
              Adicionar
            </button>
          </form>
        </div>
      )}

      {/* DIVIDER */}
      <div className="border-t border-white/5" />

      {/* 2. ADDED GAMES LIST */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div>
            <h4 className="text-sm font-bold text-white">Jogos Registrados</h4>
            <p className="text-[11px] text-gray-400 mt-0.5">
              Algumas informações sobre jogos (como gênero ou arte da capa) são fornecidas pelo sistema.
            </p>
          </div>
          {!isAddingGame && (
            <button
              type="button"
              onClick={() => setIsAddingGame(true)}
              className="bg-background-dark hover:bg-white/10 text-gray-200 hover:text-white px-3 py-1.5 rounded-xl text-xs font-semibold border border-white/10 transition-colors flex items-center gap-1.5 cursor-pointer shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Adicionar Jogo</span>
            </button>
          )}
        </div>

        <div className="divide-y divide-white/5 mt-3">
          {games.map((game) => (
            <div
              key={game.id}
              className="group py-3 flex items-center justify-between gap-3 hover:bg-white/[0.02] px-2 rounded-xl transition-colors"
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                {editingGameId === game.id ? (
                  <div className="flex items-center gap-2 flex-1 max-w-xs">
                    <input
                      type="text"
                      value={editingGameName}
                      onChange={(e) => setEditingGameName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveRename(game.id);
                        if (e.key === 'Escape') setEditingGameId(null);
                      }}
                      autoFocus
                      className="bg-background-darkest border border-brand-500 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none w-full"
                    />
                    <button
                      type="button"
                      onClick={() => handleSaveRename(game.id)}
                      className="p-1 text-emerald-400 hover:text-emerald-300 cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingGameId(null)}
                      className="p-1 text-gray-400 hover:text-white cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white truncate">{game.name}</span>
                      {game.isVerified && (
                        <span
                          className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-[#5865F2] text-white shadow-xs shrink-0"
                          title="Jogo Verificado"
                        >
                          <Check className="w-2 h-2 stroke-[3]" />
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-gray-400 block mt-0.5">
                      {formatLastPlayed(game.lastPlayed)}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3 shrink-0">
                {/* Edit custom game name */}
                {!game.isVerified && editingGameId !== game.id && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingGameId(game.id);
                      setEditingGameName(game.name);
                    }}
                    className="p-1.5 text-gray-500 hover:text-gray-200 opacity-0 group-hover:opacity-100 transition-all rounded-lg hover:bg-white/5 cursor-pointer"
                    title="Renomear jogo"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                )}

                {/* Delete button */}
                <button
                  type="button"
                  onClick={() => removeGame(game.id)}
                  className="p-1.5 text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all rounded-lg hover:bg-white/5 cursor-pointer"
                  title="Remover jogo registrado"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>

                {/* Toggle switch */}
                <button
                  type="button"
                  role="switch"
                  aria-checked={game.enabled}
                  onClick={() => handleToggleGame(game)}
                  className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors duration-200 cursor-pointer flex-shrink-0 ${
                    game.enabled ? 'bg-brand-500' : 'bg-white/10'
                  }`}
                >
                  <div
                    className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
                      game.enabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>
          ))}

          {games.length === 0 && (
            <div className="py-8 text-center text-xs text-gray-500">
              Nenhum jogo registrado no momento.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
