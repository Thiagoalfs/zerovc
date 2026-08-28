import React from 'react';
import { Plus, Compass, MessageSquare, Settings } from 'lucide-react';
import { useGuildStore } from '../../stores/guildStore';

interface ServerListProps {
  onOpenCreateServer: () => void;
  onOpenSettings: () => void;
}

export const ServerList: React.FC<ServerListProps> = ({ onOpenCreateServer, onOpenSettings }) => {
  const { guilds, activeGuild, selectGuild } = useGuildStore();

  return (
    <div className="w-[72px] bg-background-darkest flex flex-col items-center py-3 gap-2 select-none z-20 border-r border-black/20">
      {/* Home / Direct Messages */}
      <button
        onClick={() => {}}
        className="relative group w-12 h-12 rounded-[24px] hover:rounded-[16px] bg-background-dark hover:bg-brand-500 flex items-center justify-center text-gray-200 hover:text-white transition-all duration-200 shadow-md"
        title="Mensagens Diretas"
      >
        <MessageSquare className="w-6 h-6" />
        <div className="absolute left-0 w-1 bg-white rounded-r-full transition-all duration-200 h-0 group-hover:h-5" />
      </button>

      <div className="w-8 h-[2px] bg-white/10 rounded-full my-1" />

      {/* Guilds List */}
      <div className="flex-1 w-full flex flex-col items-center gap-2 overflow-y-auto overflow-x-hidden no-scrollbar">
        {guilds.map((guild) => {
          const isActive = activeGuild?.id === guild.id;
          const initials = guild.name
            .split(' ')
            .map((w) => w[0])
            .join('')
            .slice(0, 3)
            .toUpperCase();

          return (
            <button
              key={guild.id}
              onClick={() => selectGuild(guild.id)}
              className={`relative group w-12 h-12 rounded-[24px] hover:rounded-[16px] flex items-center justify-center transition-all duration-200 font-semibold text-sm ${
                isActive
                  ? 'rounded-[16px] bg-brand-500 text-white shadow-lg shadow-brand-500/30'
                  : 'bg-background-dark hover:bg-brand-500 text-gray-200 hover:text-white'
              }`}
              title={guild.name}
            >
              {/* Left Indicator Pill */}
              <div
                className={`absolute left-0 w-1 bg-white rounded-r-full transition-all duration-200 ${
                  isActive ? 'h-10' : 'h-0 group-hover:h-5'
                }`}
              />

              {guild.icon_url ? (
                <img
                  src={guild.icon_url}
                  alt={guild.name}
                  className="w-full h-full object-cover rounded-[inherit]"
                />
              ) : (
                <span>{initials}</span>
              )}
            </button>
          );
        })}

        {/* Add Server Button */}
        <button
          onClick={onOpenCreateServer}
          className="relative group w-12 h-12 rounded-[24px] hover:rounded-[16px] bg-background-dark hover:bg-online flex items-center justify-center text-online hover:text-white transition-all duration-200"
          title="Criar um Servidor"
        >
          <Plus className="w-6 h-6 transition-transform group-hover:rotate-90 duration-200" />
        </button>
      </div>

      {/* Settings Button */}
      <button
        onClick={onOpenSettings}
        className="w-12 h-12 rounded-[24px] hover:rounded-[16px] bg-background-dark hover:bg-background-light flex items-center justify-center text-gray-400 hover:text-gray-200 transition-all duration-200 mt-auto"
        title="Configurações"
      >
        <Settings className="w-5 h-5" />
      </button>
    </div>
  );
};
