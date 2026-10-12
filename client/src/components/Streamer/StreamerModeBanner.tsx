import React from 'react';
import { X } from 'lucide-react';
import { useStreamerModeStore } from '../../stores/streamerModeStore';
import { useSettingsStore, AccentColor } from '../../stores/settingsStore';

interface StreamerModeBannerProps {
  onOpenSettings?: () => void;
}

const STREAMER_ACCENT_STYLES: Record<
  AccentColor,
  {
    bg: string;
    border: string;
    btnHover: string;
    btnBorder: string;
  }
> = {
  indigo: {
    bg: 'bg-indigo-950/90',
    border: 'border-indigo-500/40',
    btnHover: 'hover:bg-indigo-500/20',
    btnBorder: 'border-indigo-300/40 hover:border-indigo-200/80',
  },
  purple: {
    bg: 'bg-purple-950/90',
    border: 'border-purple-500/40',
    btnHover: 'hover:bg-purple-500/20',
    btnBorder: 'border-purple-300/40 hover:border-purple-200/80',
  },
  emerald: {
    bg: 'bg-emerald-950/90',
    border: 'border-emerald-500/40',
    btnHover: 'hover:bg-emerald-500/20',
    btnBorder: 'border-emerald-300/40 hover:border-emerald-200/80',
  },
  rose: {
    bg: 'bg-rose-950/90',
    border: 'border-rose-500/40',
    btnHover: 'hover:bg-rose-500/20',
    btnBorder: 'border-rose-300/40 hover:border-rose-200/80',
  },
  cyan: {
    bg: 'bg-cyan-950/90',
    border: 'border-cyan-500/40',
    btnHover: 'hover:bg-cyan-500/20',
    btnBorder: 'border-cyan-300/40 hover:border-cyan-200/80',
  },
  amber: {
    bg: 'bg-amber-950/90',
    border: 'border-amber-500/40',
    btnHover: 'hover:bg-amber-500/20',
    btnBorder: 'border-amber-300/40 hover:border-amber-200/80',
  },
};

export const StreamerModeBanner: React.FC<StreamerModeBannerProps> = ({ onOpenSettings }) => {
  const { enabled, dismissForSession } = useStreamerModeStore();
  const accentColor = useSettingsStore((state) => state.accentColor);
  const styles = STREAMER_ACCENT_STYLES[accentColor] || STREAMER_ACCENT_STYLES.indigo;

  if (!enabled) return null;

  return (
    <div
      className={`w-full ${styles.bg} border-b ${styles.border} text-white px-4 py-1.5 text-xs sm:text-sm flex items-center justify-center gap-3 shadow-lg backdrop-blur-md z-40 animate-in slide-in-from-top duration-200`}
    >
      <span
        onClick={onOpenSettings}
        className={`text-white text-xs sm:text-sm font-medium ${onOpenSettings ? 'cursor-pointer hover:underline' : ''}`}
        title={onOpenSettings ? 'Abrir configurações do Modo Streamer' : undefined}
      >
        Modo Streamer Ativado
      </span>

      <button
        type="button"
        onClick={dismissForSession}
        className={`flex items-center gap-1.5 px-2.5 py-0.5 sm:py-1 rounded-lg bg-transparent ${styles.btnHover} border ${styles.btnBorder} text-gray-200 hover:text-white text-xs transition-colors cursor-pointer`}
        title="Desativar para esta sessão"
      >
        <X className="w-3.5 h-3.5" />
        <span>Desativar</span>
      </button>
    </div>
  );
};
