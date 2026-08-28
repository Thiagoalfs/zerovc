import React from 'react';
import { Crown, X } from 'lucide-react';
import { useGuildStore } from '../../stores/guildStore';
import { User } from '../../types';

interface MemberListProps {
  isOpen: boolean;
  onClose?: () => void;
}

export const MemberList: React.FC<MemberListProps> = ({ isOpen, onClose }) => {
  const { activeGuild } = useGuildStore();

  if (!isOpen || !activeGuild) return null;

  const members = activeGuild.members || [];

  const onlineMembers = members.filter((m) => m.status !== 'offline');
  const offlineMembers = members.filter((m) => m.status === 'offline');

  const renderMember = (user: User) => {
    const isOwner = user.id === activeGuild.owner_id;
    const topRole = user.roles && user.roles.length > 0 ? user.roles[0] : null;

    return (
      <div
        key={user.id}
        className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-background-light/40 group cursor-pointer transition-colors"
      >
        <div className="relative w-8 h-8 rounded-full bg-brand-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
          {user.avatar_url ? (
            <img src={user.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
          ) : (
            <span>{user.display_name?.[0]?.toUpperCase() || user.username?.[0]?.toUpperCase() || 'U'}</span>
          )}
          <div
            className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-background-darker ${
              user.status === 'online'
                ? 'bg-online'
                : user.status === 'idle'
                ? 'bg-idle'
                : user.status === 'dnd'
                ? 'bg-dnd'
                : 'bg-offline'
            }`}
          />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span
              className={`text-sm truncate font-medium ${isOwner ? 'font-semibold' : ''}`}
              style={topRole ? { color: topRole.color } : isOwner ? { color: '#5865F2' } : { color: '#E0E0E0' }}
            >
              {user.display_name || user.username}
            </span>
            {isOwner && (
              <span title="Dono do Servidor">
                <Crown className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
              </span>
            )}
          </div>

          {/* Custom Status / Roles Badges */}
          {user.custom_status ? (
            <p className="text-[11px] text-gray-500 truncate">{user.custom_status}</p>
          ) : topRole ? (
            <span
              className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-white/5 truncate max-w-fit block"
              style={{ color: topRole.color }}
            >
              {topRole.name}
            </span>
          ) : null}
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Mobile Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Member Sidebar / Drawer */}
      <div className="fixed md:static inset-y-0 right-0 z-50 md:z-0 w-64 md:w-60 bg-background-darker flex flex-col h-full border-l border-black/20 select-none p-3 overflow-y-auto no-scrollbar shadow-2xl md:shadow-none animate-in slide-in-from-right duration-200 md:animate-none">
        {/* Mobile Header */}
        <div className="flex items-center justify-between pb-3 mb-2 border-b border-white/10 md:hidden">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider">Membros do Servidor</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Online Section */}
        <div className="mb-4">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider px-2 mb-2">
            DISPONÍVEL — {onlineMembers.length}
          </h3>
          <div className="space-y-0.5">
            {onlineMembers.map(renderMember)}
          </div>
        </div>

        {/* Offline Section */}
        {offlineMembers.length > 0 && (
          <div>
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider px-2 mb-2">
              INDISPONÍVEL — {offlineMembers.length}
            </h3>
            <div className="space-y-0.5 opacity-70">
              {offlineMembers.map(renderMember)}
            </div>
          </div>
        )}
      </div>
    </>
  );
};
