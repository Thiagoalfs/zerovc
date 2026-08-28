import React from 'react';
import { Mic, MicOff, Headphones, Settings, PhoneOff, Monitor, Radio } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useVoiceStore } from '../../stores/voiceStore';
import { useGuildStore } from '../../stores/guildStore';

interface UserBarProps {
  onOpenSettings: () => void;
  onOpenScreenShare: () => void;
}

export const UserBar: React.FC<UserBarProps> = ({ onOpenSettings, onOpenScreenShare }) => {
  const { user } = useAuthStore();
  const {
    currentChannelId,
    isConnected,
    isConnecting,
    isMuted,
    isDeafened,
    isScreensharing,
    toggleMute,
    toggleDeafen,
    leaveVoice,
    stopScreenShare,
  } = useVoiceStore();

  const { activeGuild } = useGuildStore();

  const activeVoiceChannel = activeGuild?.channels?.find((c) => c.id === currentChannelId);

  return (
    <div className="flex flex-col bg-background-darkest select-none">
      {/* Active Voice Connection Bar */}
      {(isConnected || isConnecting) && (
        <div className="bg-background-darkest/90 border-b border-white/5 p-2 px-3 flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-online animate-pulse" />
              <div className="flex flex-col">
                <span className="text-xs font-bold text-online leading-tight">
                  {isConnecting ? 'Conectando...' : 'Voz Conectada'}
                </span>
                <span className="text-[11px] text-gray-400 truncate max-w-[130px]">
                  {activeVoiceChannel?.name || 'Canal de Voz'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1">
              {/* Screen share toggle */}
              <button
                onClick={() => {
                  if (isScreensharing) {
                    stopScreenShare();
                  } else {
                    onOpenScreenShare();
                  }
                }}
                className={`p-1.5 rounded hover:bg-background-light transition-colors ${
                  isScreensharing ? 'text-online bg-online/10' : 'text-gray-300'
                }`}
                title={isScreensharing ? 'Parar Transmissão' : 'Transmitir Tela'}
              >
                <Monitor className="w-4 h-4" />
              </button>

              {/* Disconnect button */}
              <button
                onClick={leaveVoice}
                className="p-1.5 rounded hover:bg-dnd/20 text-gray-300 hover:text-dnd transition-colors"
                title="Desconectar"
              >
                <PhoneOff className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* User Info and Controls */}
      <div className="h-[52px] px-2 flex items-center justify-between bg-background-darkest/60">
        <div className="flex items-center gap-2 p-1 rounded hover:bg-background-light/50 cursor-pointer max-w-[120px] transition-colors">
          {/* Avatar */}
          <div className="relative w-8 h-8 rounded-full bg-brand-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
            {user?.avatar_url ? (
              <img src={user.avatar_url} alt={user.username} className="w-full h-full rounded-full object-cover" />
            ) : (
              <span>{user?.username?.[0]?.toUpperCase() || 'U'}</span>
            )}
            {/* Status dot */}
            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-online border-2 border-background-darkest" />
          </div>

          <div className="flex flex-col truncate">
            <span className="text-sm font-semibold text-gray-100 truncate leading-tight">
              {user?.username || 'Usuário'}
            </span>
            <span className="text-[11px] text-gray-400 truncate leading-tight">Online</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center text-gray-400">
          <button
            onClick={toggleMute}
            className={`p-1.5 rounded hover:bg-background-light hover:text-gray-200 transition-colors ${
              isMuted ? 'text-dnd hover:text-dnd' : ''
            }`}
            title={isMuted ? 'Desmutar' : 'Mutar'}
          >
            {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>

          <button
            onClick={toggleDeafen}
            className={`p-1.5 rounded hover:bg-background-light hover:text-gray-200 transition-colors ${
              isDeafened ? 'text-dnd hover:text-dnd' : ''
            }`}
            title={isDeafened ? 'Ensurdecer' : 'Desensurdecer'}
          >
            <Headphones className="w-4 h-4" />
          </button>

          <button
            onClick={onOpenSettings}
            className="p-1.5 rounded hover:bg-background-light hover:text-gray-200 transition-colors"
            title="Configurações do Usuário"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
