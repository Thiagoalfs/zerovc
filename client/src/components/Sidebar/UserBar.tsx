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
          icon: <Monitor className="w-4 h-4" />,
          onClick: () => {
            onOpenScreenShare();
          },
        },
        {
          id: 'stop-screen',
          label: 'Parar compartilhamento',
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
                className={`hidden md:inline-flex p-1.5 rounded hover:bg-background-light transition-colors cursor-pointer ${
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
      <div
        onClick={() => {
          if (typeof window !== 'undefined' && window.innerWidth < 768) {
            onOpenSettings();
          }
        }}
        className="h-[60px] md:h-[56px] px-2.5 flex items-center justify-between bg-background-darkest/95 border-t border-white/5 cursor-pointer md:cursor-default"
      >
        <div
          onClick={(e) => {
            if (typeof window !== 'undefined' && window.innerWidth >= 768) {
              setShowStatusMenu(!showStatusMenu);
            }
          }}
          className="flex items-center gap-2.5 p-1 rounded-xl hover:bg-white/5 cursor-pointer flex-1 min-w-0 mr-1.5 transition-colors group/usercard"
          title="Editar Meu Perfil e Configurações"
        >
          {/* Avatar */}
          <div className="relative w-9 h-9 rounded-full bg-brand-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0 shadow-sm">
            {user?.avatar_url ? (
              <img src={formatAssetUrl(user.avatar_url)} alt={user.username} className="w-full h-full rounded-full object-cover" />
            ) : (
              <span>{user?.display_name?.[0]?.toUpperCase() || user?.username?.[0]?.toUpperCase() || 'U'}</span>
            )}
            {/* Status dot */}
            <div
              className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-background-darkest ${getStatusColor(
                user?.status
              )}`}
            />
          </div>

          <div className="flex flex-col truncate min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-[14px] font-bold text-white truncate leading-tight group-hover/usercard:text-brand-300 transition-colors">
                {user?.display_name || user?.username || 'Usuário'}
              </span>
              <Settings className="w-3.5 h-3.5 text-gray-400 group-hover/usercard:text-brand-400 md:hidden flex-shrink-0 transition-transform group-hover/usercard:rotate-45" />
            </div>
            <span className="text-[12px] text-gray-400 truncate leading-tight mt-0.5">
              {user?.custom_status || getStatusLabel(user?.status)}
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="hidden md:flex items-center gap-0.5 text-gray-400">
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleMute();
            }}
            className={`w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/10 hover:text-gray-200 transition-colors cursor-pointer ${
              isMuted ? 'text-dnd hover:text-dnd bg-dnd/10' : ''
            }`}
            title={isMuted ? 'Desmutar' : 'Mutar'}
          >
            {isMuted ? <MicOff className="w-[18px] h-[18px]" /> : <Mic className="w-[18px] h-[18px]" />}
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleDeafen();
            }}
            className={`w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/10 hover:text-gray-200 transition-colors cursor-pointer ${
              isDeafened ? 'text-dnd hover:text-dnd bg-dnd/10' : ''
            }`}
            title={isDeafened ? 'Ensurdecer' : 'Desensurdecer'}
          >
            <Headphones className="w-[18px] h-[18px]" />
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenSettings();
            }}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/10 hover:text-gray-200 transition-colors cursor-pointer"
            title="Configurações de Usuário"
          >
            <Settings className="w-[18px] h-[18px]" />
          </button>
        </div>
      </div>

      {/* Context Menu Component */}
      <ContextMenu menu={menu} onClose={closeContextMenu} />
    </div>
  );
};
