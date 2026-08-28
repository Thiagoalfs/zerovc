import React, { useState } from 'react';
import { Hash, Volume2, Plus, UserPlus, Users, X, Settings, ChevronDown } from 'lucide-react';
import { Channel } from '../../types';
import { useGuildStore } from '../../stores/guildStore';
import { useVoiceStore } from '../../stores/voiceStore';
import { useAuthStore } from '../../stores/authStore';
import { UserBar } from './UserBar';

interface ChannelListProps {
  isHomeActive: boolean;
  onSelectChannel?: (channel: Channel) => void;
  onOpenCreateChannel: (type: 'text' | 'voice') => void;
  onOpenInviteModal: () => void;
  onOpenSettings: () => void;
  onOpenServerSettings?: () => void;
  onOpenChannelSettings?: (channel: Channel) => void;
  onOpenMemberList?: () => void;
  onOpenScreenShare: () => void;
  onCloseMobileDrawer?: () => void;
}

export const ChannelList: React.FC<ChannelListProps> = ({
  isHomeActive,
  onSelectChannel,
  onOpenCreateChannel,
  onOpenInviteModal,
  onOpenSettings,
  onOpenServerSettings,
  onOpenChannelSettings,
  onOpenMemberList,
  onOpenScreenShare,
  onCloseMobileDrawer,
}) => {
  const { user } = useAuthStore();
  const { activeGuild, activeChannel, selectChannel, unreadChannels } = useGuildStore();
  const { currentChannelId, joinVoice, isConnected, speakingUserIds } = useVoiceStore();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const isOwner = activeGuild?.owner_id === user?.id;
  const textChannels = activeGuild?.channels?.filter((c) => c.type === 'text') || [];
  const voiceChannels = activeGuild?.channels?.filter((c) => c.type === 'voice') || [];

  const handleChannelClick = (channel: Channel) => {
    selectChannel(channel);
    if (onSelectChannel) onSelectChannel(channel);
    onCloseMobileDrawer?.();
  };

  const handleVoiceChannelClick = (channel: Channel) => {
    selectChannel(channel);
    if (onSelectChannel) onSelectChannel(channel);
    joinVoice(channel.id);
    onCloseMobileDrawer?.();
  };

  return (
    <div className="w-60 bg-background-darker flex flex-col h-full border-r border-black/20 select-none flex-shrink-0 relative">
      {/* Server Header or Home Header */}
      {isHomeActive ? (
        <div className="h-12 px-4 border-b border-black/20 flex items-center justify-between font-bold text-gray-100 shadow-sm">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-brand-500" />
            <span className="truncate">Painel de Amigos</span>
          </div>
          {onCloseMobileDrawer && (
            <button
              onClick={onCloseMobileDrawer}
              className="md:hidden text-gray-400 hover:text-white p-1"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      ) : (
        <div className="relative z-30">
          {/* Clickable Server Name Header */}
          <button
            type="button"
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="w-full h-12 px-4 border-b border-black/20 flex items-center justify-between font-bold text-gray-100 shadow-sm hover:bg-white/5 transition-colors group cursor-pointer text-left"
          >
            <span className="truncate max-w-[170px] text-sm md:text-base font-bold text-white group-hover:text-gray-100">
              {activeGuild?.name || 'Servidor'}
            </span>
            <ChevronDown
              className={`w-4 h-4 text-gray-400 group-hover:text-white transition-transform duration-200 flex-shrink-0 ${
                isDropdownOpen ? 'rotate-180 text-brand-400' : ''
              }`}
            />
          </button>

          {/* Dropdown Menu */}
          {isDropdownOpen && (
            <>
              {/* Invisible backdrop to dismiss */}
              <div
                className="fixed inset-0 z-40"
                onClick={() => setIsDropdownOpen(false)}
              />

              {/* Menu Card */}
              <div className="absolute top-13 left-2 right-2 z-50 bg-background-darkest rounded-2xl p-1.5 shadow-2xl border border-white/10 animate-in fade-in zoom-in-95 duration-150 space-y-1">
                {/* 1. Convidar Membros */}
                <button
                  type="button"
                  onClick={() => {
                    setIsDropdownOpen(false);
                    onOpenInviteModal();
                  }}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs md:text-sm font-semibold text-brand-400 hover:bg-brand-500 hover:text-white transition-colors"
                >
                  <span>Convidar Membros</span>
                  <UserPlus className="w-4 h-4" />
                </button>

                {/* 2. Configurações do Servidor */}
                {isOwner && onOpenServerSettings && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsDropdownOpen(false);
                      onOpenServerSettings();
                    }}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs md:text-sm font-medium text-gray-200 hover:bg-brand-500 hover:text-white transition-colors"
                  >
                    <span>Configurar Servidor</span>
                    <Settings className="w-4 h-4" />
                  </button>
                )}

                {/* 3. Membros do Servidor */}
                {onOpenMemberList && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsDropdownOpen(false);
                      onOpenMemberList();
                    }}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs md:text-sm font-medium text-gray-200 hover:bg-brand-500 hover:text-white transition-colors"
                  >
                    <span>Membros ({activeGuild?.members?.length || 0})</span>
                    <Users className="w-4 h-4" />
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Channels List */}
      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-4 no-scrollbar">
        {!isHomeActive && (
          <>
            {/* Text Channels Section */}
            <div>
              <div className="flex items-center justify-between px-2 mb-1 group text-xs font-bold text-gray-400 uppercase tracking-wider">
                <span>Canais de Texto</span>
                {activeGuild && (
                  <button
                    onClick={() => onOpenCreateChannel('text')}
                    className="p-1 hover:text-gray-200 transition-colors"
                    title="Criar Canal de Texto"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="space-y-0.5">
                {textChannels.map((channel) => {
                  const isActive = activeChannel?.id === channel.id;
                  const isUnread = unreadChannels.has(channel.id) && !isActive;
                  return (
                    <div
                      key={channel.id}
                      className={`group flex items-center justify-between px-2.5 py-2 rounded-lg text-sm transition-colors relative ${
                        isActive
                          ? 'bg-background-light text-white font-medium'
                          : isUnread
                          ? 'text-white font-semibold'
                          : 'text-gray-400 hover:bg-background-light/40 hover:text-gray-200'
                      }`}
                    >
                      {/* Left white indicator dot for unread */}
                      {isUnread && (
                        <div className="absolute -left-1 w-1.5 h-2 rounded-r-full bg-white shadow-sm" />
                      )}

                      <button
                        onClick={() => handleChannelClick(channel)}
                        className="flex items-center gap-2 truncate flex-1 text-left"
                      >
                        <Hash className={`w-4 h-4 flex-shrink-0 ${isUnread ? 'text-white' : 'text-gray-400'}`} />
                        <span className="truncate">{channel.name}</span>
                      </button>

                      {isOwner && onOpenChannelSettings && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenChannelSettings(channel);
                          }}
                          className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-white p-0.5 rounded transition-opacity"
                          title="Editar Canal"
                        >
                          <Settings className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Voice Channels Section */}
            <div>
              <div className="flex items-center justify-between px-2 mb-1 group text-xs font-bold text-gray-400 uppercase tracking-wider">
                <span>Canais de Voz</span>
                {activeGuild && (
                  <button
                    onClick={() => onOpenCreateChannel('voice')}
                    className="p-1 hover:text-gray-200 transition-colors"
                    title="Criar Canal de Voz"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="space-y-0.5">
                {voiceChannels.map((channel) => {
                  const isInThisVoice = currentChannelId === channel.id && isConnected;
                  return (
                    <div key={channel.id} className="space-y-0.5">
                      <div
                        className={`group flex items-center justify-between px-2.5 py-2 rounded-lg text-sm transition-colors ${
                          isInThisVoice
                            ? 'bg-online/15 text-online font-medium'
                            : 'text-gray-400 hover:bg-background-light/40 hover:text-gray-200'
                        }`}
                      >
                        <button
                          onClick={() => handleVoiceChannelClick(channel)}
                          className="flex items-center gap-2 truncate flex-1 text-left"
                        >
                          <Volume2 className={`w-4 h-4 flex-shrink-0 ${isInThisVoice ? 'text-online' : 'text-gray-400'}`} />
                          <span className="truncate">{channel.name}</span>
                        </button>

                        {isOwner && onOpenChannelSettings && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenChannelSettings(channel);
                            }}
                            className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-white p-0.5 rounded transition-opacity"
                            title="Editar Canal"
                          >
                            <Settings className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      {/* Connected Voice Members */}
                      {channel.voice_sessions && channel.voice_sessions.length > 0 && (
                        <div className="pl-6 pr-2 py-1 space-y-1">
                          {channel.voice_sessions.map((vs) => {
                            const isSpeaking = speakingUserIds.includes(vs.user_id);
                            return (
                              <div
                                key={vs.id}
                                className="flex items-center justify-between py-1 px-1.5 rounded hover:bg-background-light/30 text-xs text-gray-300"
                              >
                                <div className="flex items-center gap-2 truncate">
                                  <div
                                    className={`w-5 h-5 rounded-full bg-brand-500 flex items-center justify-center text-[10px] font-bold text-white transition-all ${
                                      isSpeaking ? 'ring-2 ring-online ring-offset-1 ring-offset-background-darker' : ''
                                    }`}
                                  >
                                    {vs.user?.avatar_url ? (
                                      <img src={vs.user.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
                                    ) : (
                                      <span>{vs.user?.display_name?.[0]?.toUpperCase() || vs.user?.username?.[0]?.toUpperCase() || 'U'}</span>
                                    )}
                                  </div>
                                  <span className={`truncate ${isSpeaking ? 'text-white font-semibold' : ''}`}>
                                    {vs.user?.display_name || vs.user?.username || 'Usuário'}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>

      {/* User Status Bar */}
      <UserBar onOpenSettings={onOpenSettings} onOpenScreenShare={onOpenScreenShare} />
    </div>
  );
};
