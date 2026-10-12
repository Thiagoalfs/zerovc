import React from 'react';
import { EyeOff, X, Settings } from 'lucide-react';
import { useStreamerModeStore } from '../../stores/streamerModeStore';

interface StreamerModeBannerProps {
  onOpenSettings?: () => void;
}

export const StreamerModeBanner: React.FC<StreamerModeBannerProps> = ({ onOpenSettings }) => {
  const { enabled, dismissForSession } = useStreamerModeStore();

  if (!enabled) return null;

  return (
    <div className="w-full bg-background-darkest/95 border-b border-brand-500/30 text-gray-200 px-4 py-2 text-xs sm:text-sm flex items-center justify-between shadow-lg backdrop-blur-md z-40 animate-in slide-in-from-top duration-200">
      <div className="flex items-center gap-2.5 overflow-hidden">
        <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-brand-500"></span>
        </span>

        <EyeOff className="w-4 h-4 text-brand-400 flex-shrink-0" />

        <div className="truncate">
          <span className="font-bold text-white mr-1.5">Modo Streamer Ativado</span>
          <span className="text-gray-300 hidden sm:inline">
            — Nomes censurados, dados pessoais ocultados e sons de alerta silenciados.
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0 ml-3">
        {onOpenSettings && (
          <button
            onClick={onOpenSettings}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-gray-200 text-xs font-semibold border border-white/10 transition-colors cursor-pointer"
            title="Ajustar configurações do Modo Streamer"
          >
            <Settings className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Configurações</span>
          </button>
        )}

        <button
          onClick={dismissForSession}
          className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-brand-500 hover:bg-brand-600 text-white font-bold text-xs shadow transition-all hover:scale-[1.02] cursor-pointer"
          title="Desativar para esta sessão"
        >
          <X className="w-3.5 h-3.5" />
          <span>Desativar</span>
        </button>
      </div>
    </div>
  );
};
