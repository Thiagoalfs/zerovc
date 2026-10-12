import React from 'react';
import { X } from 'lucide-react';
import { useStreamerModeStore } from '../../stores/streamerModeStore';

interface StreamerModeBannerProps {
  onOpenSettings?: () => void;
}

export const StreamerModeBanner: React.FC<StreamerModeBannerProps> = () => {
  const { enabled, dismissForSession } = useStreamerModeStore();

  if (!enabled) return null;

  return (
    <div className="w-full bg-indigo-950/90 border-b border-indigo-500/30 text-white px-4 py-1.5 text-xs sm:text-sm flex items-center justify-center gap-3 shadow-lg backdrop-blur-md z-40 animate-in slide-in-from-top duration-200">
      <span className="text-white text-xs sm:text-sm">
        Modo Streamer Ativado
      </span>

      <button
        type="button"
        onClick={dismissForSession}
        className="flex items-center gap-1.5 px-2.5 py-0.5 sm:py-1 rounded-lg bg-transparent hover:bg-white/10 border border-gray-300/40 hover:border-gray-200/80 text-gray-200 hover:text-white text-xs transition-colors cursor-pointer"
        title="Desativar para esta sessão"
      >
        <X className="w-3.5 h-3.5" />
        <span>Desativar</span>
      </button>
    </div>
  );
};
