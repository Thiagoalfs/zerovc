import React, { useState } from 'react';
import { Mic, MicOff, Headphones, Settings, PhoneOff, Monitor, MonitorOff } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useVoiceStore } from '../../stores/voiceStore';
import { useGuildStore } from '../../stores/guildStore';
import { formatAssetUrl } from '../../lib/api';
import { ContextMenu, useContextMenu, ContextMenuItem } from '../ContextMenu';

interface UserBarProps {
  onOpenSettings: () => void;
  onOpenScreenShare: () => void;
}

export const UserBar: React.FC<UserBarProps> = ({ onOpenSettings, onOpenScreenShare }) => {
  const { user, updateProfile } = useAuthStore();
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const { menu, openContextMenu, closeContextMenu } = useContextMenu();
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

  const { activeGuild, selectChannel } = useGuildStore();
  const activeVoiceChannel = activeGuild?.channels?.find((c) => c.id === currentChannelId);

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'online': return 'bg-online';
      case 'idle': return 'bg-idle';
      case 'dnd': return 'bg-dnd';
      default: return 'bg-offline';
    }
  };

  const getStatusLabel = (status?: string) => {
    switch (status) {
      case 'online': return 'Disponível';
      case 'idle': return 'Ausente';
      case 'dnd': return 'Não Perturbe';
      default: return 'Invisível';
    }
  };

  const handleSetStatus = async (newStatus: 'online' | 'idle' | 'dnd' | 'offline') => {
    try {
      await updateProfile({ status: newStatus });
      setShowStatusMenu(false);
    } catch (err) {
      console.error('Failed to change status:', err);
    }
  };

  const handleScreenShareClick = (e: React.MouseEvent) => {
    if (isScreensharing) {
      const rect = e.currentTarget.getBoundingClientRect();
      const items: ContextMenuItem[] = [
        {
          id: 'switch-screen',
          label: 'Trocar tela',
          icon: <Monitor className="w-4 h-4 text-brand-400" />,
          onClick: () => {
            onOpenScreenShare();
          },
        },
        {
          id: 'stop-screen',
          label: 'Parar compartilhamento',
          icon: <MonitorOff className="w-4 h-4 text-dnd" />,
          variant: 'danger',
          onClick: () => {
            stopScreenShare();
          },
        },
      ];
      openContextMenu(
        { clientX: rect.left, clientY: rect.top - 10 } as any,
        items,
        'Transmissão de Tela'
      );
    } else {
      onOpenScreenShare();
    }
  };

  return (
    <div className="flex flex-col bg-background-darkest select-none relative">
      {/* Quick Status Menu Popover */}
      {showStatusMenu && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setShowStatusMenu(false)}
          />
          <div className="absolute bottom-16 left-2 z-50 bg-background-darkest border border-white/10 rounded-2xl p-2 shadow-2xl w-48 animate-in fade-in zoom-in-95">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-2 py-1 block">
              Definir Status
            </span>
            <div className="space-y-1 mt-1">
              {(['online', 'idle', 'dnd', 'offline'] as const).map((st) => (
                <button
                  key={st}
                  onClick={() => handleSetStatus(st)}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    user?.status === st ? 'bg-brand-500 text-white' : 'text-gray-300 hover:bg-white/5'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${getStatusColor(st)}`} />
                  <span>{getStatusLabel(st)}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Active Voice Connection Bar */}
      {(isConnected || isConnecting) && (
        <div className="bg-background-darkest/90 border-b border-white/5 p-2 px-3 flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <div
              onClick={() => {
                if (activeVoiceChannel) selectChannel(activeVoiceChannel);
              }}
              className="flex items-center gap-2 cursor-pointer hover:opacity-85 transition-opacity"
              title="Abrir canal de voz"
            >
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
              <button
                onClick={handleScreenShareClick}
                className={`p-1.5 rounded hover:bg-background-light transition-colors cursor-pointer ${
                  isScreensharing ? 'text-online bg-online/10' : 'text-gray-300'
                }`}
                title={isScreensharing ? 'Opções de Compartilhamento' : 'Transmitir Tela'}
              >
                <Monitor className="w-4 h-4" />
              </button>

              <button
                onClick={leaveVoice}
                className="p-1.5 rounded hover:bg-dnd/20 text-gray-300 hover:text-dnd transition-colors cursor-pointer"
                title="Desconectar"
              >
                <PhoneOff className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* User Info and Controls */}
      <div className="h-[60px] md:h-[52px] px-2.5 md:px-2 flex items-center justify-between bg-background-darkest/60 gap-1.5 border-t border-white/5">
        {/* User Card - Clicking this whole container opens settings */}
        <div
          onClick={onOpenSettings}
          className="flex-1 flex items-center gap-2 p-1.5 md:p-1 rounded-xl hover:bg-background-light/50 cursor-pointer min-w-0 transition-colors group/usercard"
          title="Editar Meu Perfil e Configurações"
        >
          {/* Avatar with Status Popover trigger */}
          <div
            onClick={(e) => {
              e.stopPropagation();
              setShowStatusMenu(!showStatusMenu);
            }}
            className="relative w-9 h-9 md:w-8 md:h-8 rounded-full bg-brand-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0 cursor-pointer hover:opacity-90 transition-opacity"
            title="Alterar Status"
          >
            {user?.avatar_url ? (
              <img src={formatAssetUrl(user.avatar_url)} alt={user.username} className="w-full h-full rounded-full object-cover" />
            ) : (
              <span>{user?.display_name?.[0]?.toUpperCase() || user?.username?.[0]?.toUpperCase() || 'U'}</span>
            )}
            {/* Status dot */}
            <div
              className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-background-darkest ${getStatusColor(
                user?.status
              )}`}
            />
          </div>

          <div className="flex flex-col min-w-0 flex-1 justify-center">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-gray-100 truncate leading-tight group-hover/usercard:text-brand-300 transition-colors">
                {user?.display_name || user?.username || 'Usuário'}
              </span>
              {/* Decorative settings gear on mobile for visual affordance */}
              <Settings className="w-3.5 h-3.5 text-gray-400 group-hover/usercard:text-brand-400 md:hidden flex-shrink-0 transition-transform group-hover/usercard:rotate-45" />
            </div>
            <span className="text-[10px] text-gray-400 truncate leading-tight mt-0.5">
              {user?.custom_status || getStatusLabel(user?.status)}
            </span>
          </div>
        </div>

        {/* Action Buttons (Voice/Mute controls + Desktop settings button) */}
        <div className="flex items-center text-gray-400 flex-shrink-0">
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleMute();
            }}
            className={`p-2 md:p-1.5 rounded-lg md:rounded hover:bg-background-light hover:text-gray-200 transition-colors ${
              isMuted ? 'text-dnd hover:text-dnd' : ''
            }`}
            title={isMuted ? 'Desmutar' : 'Mutar'}
          >
            {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleDeafen();
            }}
            className={`p-2 md:p-1.5 rounded-lg md:rounded hover:bg-background-light hover:text-gray-200 transition-colors ${
              isDeafened ? 'text-dnd hover:text-dnd' : ''
            }`}
            title={isDeafened ? 'Ensurdecer' : 'Desensurdecer'}
          >
            <Headphones className="w-4 h-4" />
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenSettings();
            }}
            className="hidden md:flex p-1.5 rounded hover:bg-background-light hover:text-gray-200 transition-colors"
            title="Editar Meu Perfil"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Context Menu Component */}
      <ContextMenu menu={menu} onClose={closeContextMenu} />
    </div>
  );
};
