import React from 'react';
import { Plus, MessageSquare } from 'lucide-react';
import { useGuildStore } from '../../stores/guildStore';
import { useDMStore } from '../../stores/dmStore';
import { formatAssetUrl } from '../../lib/api';

interface ServerListProps {
  isHomeActive: boolean;
  onSelectHome: () => void;
  onSelectGuild?: (guildId: string) => void;
  onOpenCreateServer: () => void;
}

export const ServerList: React.FC<ServerListProps> = ({
  isHomeActive,
  onSelectHome,
  onSelectGuild,
  onOpenCreateServer,
}) => {
  const { guilds, activeGuild, selectGuild, unreadChannels, guildMentions } = useGuildStore();
  const { roomUnreadCounts } = useDMStore();

  const totalUnreadDMs = Object.values(roomUnreadCounts).reduce((acc, count) => acc + count, 0);

  return (
    <div className="w-[72px] bg-background-darkest flex flex-col items-center py-3 gap-2 select-none z-20 border-r border-black/20">
      {/* Home / Friends / Direct Messages */}
      <button
        onClick={onSelectHome}
        className={`relative group w-12 h-12 rounded-[24px] hover:rounded-[16px] flex items-center justify-center transition-all duration-200 shadow-md ${
          isHomeActive
            ? 'rounded-[16px] bg-brand-500 text-white shadow-lg shadow-brand-500/30'
            : 'bg-background-dark hover:bg-brand-500 text-gray-200 hover:text-white'
        }`}
        title="Amigos e Mensagens"
      >
        <MessageSquare className="w-6 h-6" />

        {/* Left active pill */}
        <div
          className={`absolute left-0 w-1 bg-white rounded-r-full transition-all duration-200 ${
            isHomeActive ? 'h-10' : totalUnreadDMs > 0 ? 'h-2' : 'h-0 group-hover:h-5'
          }`}
        />

        {/* Discord-style Unread DM Notification Badge */}
        {totalUnreadDMs > 0 && !isHomeActive && (
          <div className="absolute -bottom-1 -right-1 min-w-[20px] h-5 px-1 bg-dnd text-white text-[11px] font-bold rounded-full flex items-center justify-center border-2 border-background-darkest shadow-lg animate-in zoom-in-50">
            {totalUnreadDMs > 99 ? '99+' : totalUnreadDMs}
          </div>
        )}
      </button>

      <div className="w-8 h-[2px] bg-white/10 rounded-full my-1" />

      {/* Guilds List */}
      <div className="flex-1 w-full flex flex-col items-center gap-2 overflow-y-auto overflow-x-hidden no-scrollbar">
        {guilds.map((guild) => {
          const isActive = !isHomeActive && activeGuild?.id === guild.id;
          const mentionCount = guildMentions[guild.id] || 0;
          const hasUnread = guild.channels?.some((c) => unreadChannels.has(c.id));
          const initials = guild.name
            .split(' ')
            .map((w) => w[0])
            .join('')
            .slice(0, 3)
            .toUpperCase();

          return (
            <button
              key={guild.id}
              onClick={() => {
                if (onSelectGuild) {
                  onSelectGuild(guild.id);
                } else {
                  selectGuild(guild.id);
                }
              }}
              className={`relative group w-12 h-12 rounded-[24px] hover:rounded-[16px] flex items-center justify-center transition-all duration-200 font-semibold text-sm ${
                isActive
                  ? 'rounded-[16px] bg-brand-500 text-white shadow-lg shadow-brand-500/30'
                  : 'bg-background-dark hover:bg-brand-500 text-gray-200 hover:text-white'
              }`}
              title={guild.name}
            >
              {/* Left Indicator Pill (white dot for unread, long pill for active) */}
              <div
                className={`absolute left-0 w-1 bg-white rounded-r-full transition-all duration-200 ${
                  isActive ? 'h-10' : hasUnread ? 'h-2' : 'h-0 group-hover:h-5'
                }`}
              />

              {guild.icon_url ? (
                <img
                  src={formatAssetUrl(guild.icon_url)}
                  alt={guild.name}
                  className="w-full h-full object-cover rounded-[inherit]"
                />
              ) : (
                <span>{initials}</span>
              )}

              {/* Discord-style Mention Notification Badge */}
              {mentionCount > 0 && !isActive && (
                <div className="absolute -bottom-1 -right-1 min-w-[20px] h-5 px-1 bg-dnd text-white text-[11px] font-bold rounded-full flex items-center justify-center border-2 border-background-darkest shadow-lg animate-in zoom-in-50">
                  {mentionCount > 99 ? '99+' : mentionCount}
                </div>
              )}
            </button>
          );
        })}

        {/* Unified Add/Join Server Button (+) */}
        <button
          onClick={onOpenCreateServer}
          className="relative group w-12 h-12 rounded-[24px] hover:rounded-[16px] bg-background-dark hover:bg-online flex items-center justify-center text-online hover:text-white transition-all duration-200 shadow-md"
          title="Adicionar ou Entrar em um Servidor"
        >
          <Plus className="w-6 h-6 transition-transform group-hover:rotate-90 duration-200" />
        </button>
      </div>
    </div>
  );
};
