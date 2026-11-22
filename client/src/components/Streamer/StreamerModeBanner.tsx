import React from 'react';
import { X } from 'lucide-react';
import { useStreamerModeStore } from '../../stores/streamerModeStore';
import { useSettingsStore, AccentColor } from '../../stores/settingsStore';
import { ModalButton } from '@/components/ui/modal-button';

interface StreamerModeBannerProps {
  onOpenSettings?: () => void;
}

const STREAMER_ACCENT_STYLES: Record<
  AccentColor,
  {
    bg: string;
    border: string;
  }
> = {
  indigo: {
    bg: 'bg-indigo-950/90',
    border: 'border-indigo-500/40',
  },
  purple: {
    bg: 'bg-purple-950/90',
    border: 'border-purple-500/40',
  },
  emerald: {
    bg: 'bg-emerald-950/90',
    border: 'border-emerald-500/40',
  },
  rose: {
    bg: 'bg-rose-950/90',
    border: 'border-rose-500/40',
  },
  cyan: {
    bg: 'bg-cyan-950/90',
    border: 'border-cyan-500/40',
  },
  amber: {
    bg: 'bg-amber-950/90',
    border: 'border-amber-500/40',
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

      <ModalButton
        htmlType="button"
        type="secondary"
        size="tiny"
        onClick={dismissForSession}
        prefix={<X className="w-3.5 h-3.5" />}
        title="Desativar para esta sessão"
      >
        Desativar
      </ModalButton>
    </div>
  );
};
