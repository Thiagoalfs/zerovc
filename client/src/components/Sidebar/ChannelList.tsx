import React from 'react';
import { Hash, Volume2, Plus, UserPlus, Users, MessageSquare } from 'lucide-react';
import { Channel } from '../../types';
import { useGuildStore } from '../../stores/guildStore';
import { useVoiceStore } from '../../stores/voiceStore';
import { useFriendStore } from '../../stores/friendStore';
import { UserBar } from './UserBar';

interface ChannelListProps {
  isHomeActive: boolean;
  onOpenCreateChannel: (type: 'text' | 'voice') => void;
  onOpenInviteModal: () => void;
  onOpenSettings: () => void;
  onOpenScreenShare: () => void;
}

export const ChannelList: React.FC<ChannelListProps> = ({
  isHomeActive,
  onOpenCreateChannel,
  onOpenInviteModal,
  onOpenSettings,
  onOpenScreenShare,
}) => {
  const { activeGuild, activeChannel, selectChannel } = useGuildStore();
  const { currentChannelId, joinVoice, isConnected, speakingUserIds } = useVoiceStore();
  const { friends } = useFriendStore();

  const textChannels = activeGuild?.channels?.filter((c) => c.type === 'text') || [];
  const voiceChannels = activeGuild?.channels?.filter((c) => c.type === 'voice') || [];

  return (
    <div className="w-60 bg-background-darker flex flex-col h-full border-r border-black/20 select-none">
      {/* Server Header or Home Header */}
      {isHomeActive ? (
        <div className="h-12 px-4 border-b border-black/20 flex items-center font-bold text-gray-100 shadow-sm">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-brand-500" />
            <span>Painel de Amigos</span>
          </div>
        </div>
      ) : (
        <div className="h-12 px-4 border-b border-black/20 flex items-center justify-between font-bold text-gray-100 shadow-sm">
          <span className="truncate">{activeGuild?.name || 'Selecione um servidor'}</span>
          {activeGuild && (
            <button
              onClick={onOpenInviteModal}
              className="text-gray-400 hover:text-white p-1 rounded hover:bg-white/10 transition-colors"
              title="Convidar Pessoas (Código de 10 Caracteres)"
            >
              <UserPlus className="w-4 h-4 text-brand-500" />
            </button>
          )}
        </div>
      )}

      {/* Channels List / Friends DM List */}
      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-4 no-scrollbar">
        {isHomeActive ? (
          <div>
            <div className="flex items-center justify-between px-2 mb-2 text-xs font-bold text-gray-400 uppercase tracking-wider">
              <span>MENSAGENS DIRETAS</span>
            </div>

            <div className="space-y-0.5">
              {friends.length === 0 ? (
                <div className="px-2 py-4 text-xs text-gray-500 text-center">
                  Adicione amigos para começar a conversar!
                </div>
              ) : (
                friends.map((f) => {
                  const target = f.friend?.id ? f.friend : f.user;
                  return (
                    <button
                      key={f.id}
                      className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-sm text-gray-400 hover:bg-background-light/40 hover:text-gray-200 transition-colors"
                    >
                      <div className="relative w-6 h-6 rounded-full bg-brand-500 flex items-center justify-center text-white text-[11px] font-bold">
                        {target?.avatar_url ? (
                          <img src={target.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
                        ) : (
                          <span>{target?.username?.[0]?.toUpperCase()}</span>
                        )}
                        <div
                          className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-background-darker ${
                            target?.status === 'online' ? 'bg-online' : 'bg-offline'
                          }`}
                        />
                      </div>
                      <span className="truncate text-gray-300 font-medium">{target?.username}</span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        ) : (
          <>
            {/* Text Channels Section */}
            <div>
              <div className="flex items-center justify-between px-2 mb-1 group text-xs font-bold text-gray-400 uppercase tracking-wider">
                <span>Canais de Texto</span>
                {activeGuild && (
                  <button
                    onClick={() => onOpenCreateChannel('text')}
                    className="opacity-0 group-hover:opacity-100 hover:text-gray-200 transition-opacity"
                    title="Criar Canal de Texto"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="space-y-0.5">
                {textChannels.map((channel) => {
                  const isActive = activeChannel?.id === channel.id;
                  return (
                    <button
                      key={channel.id}
                      onClick={() => selectChannel(channel)}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors ${
                        isActive
                          ? 'bg-background-light text-white font-medium'
                          : 'text-gray-400 hover:bg-background-light/40 hover:text-gray-200'
                      }`}
                    >
                      <Hash className="w-4 h-4 flex-shrink-0 text-gray-400" />
                      <span className="truncate">{channel.name}</span>
                    </button>
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
                    className="opacity-0 group-hover:opacity-100 hover:text-gray-200 transition-opacity"
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
                      <button
                        onClick={() => {
                          selectChannel(channel);
                          joinVoice(channel.id);
                        }}
                        className={`w-full flex items-center justify-between px-2 py-1.5 rounded-md text-sm transition-colors ${
                          isInThisVoice
                            ? 'bg-online/15 text-online font-medium'
                            : 'text-gray-400 hover:bg-background-light/40 hover:text-gray-200'
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <Volume2 className={`w-4 h-4 flex-shrink-0 ${isInThisVoice ? 'text-online' : 'text-gray-400'}`} />
                          <span className="truncate">{channel.name}</span>
                        </div>
                      </button>

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
                                      <span>{vs.user?.username?.[0]?.toUpperCase() || 'U'}</span>
                                    )}
                                  </div>
                                  <span className={`truncate ${isSpeaking ? 'text-white font-semibold' : ''}`}>
                                    {vs.user?.username || 'Usuário'}
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
