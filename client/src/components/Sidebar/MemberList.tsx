import React, { useMemo } from 'react';
import {
  Crown,
  VolumeX,
  Hash,
  ArrowLeft,
  Search,
  Pin,
  Gamepad2,
  Music,
  Tv,
  Radio,
  Sparkles,
} from 'lucide-react';
import { useGuildStore } from '../../stores/guildStore';
import { useAuthStore } from '../../stores/authStore';
import { User } from '../../types';
import { useSettingsStore } from '../../stores/settingsStore';
import { SidebarResizer } from './SidebarResizer';
import { ContextMenu } from '../ContextMenu';
import { UserAvatar } from '../Common/UserAvatar';
import { useUserContextMenu } from '../../hooks/useUserContextMenu';

interface MemberListProps {
  isOpen: boolean;
  onClose?: () => void;
  onSelectUser?: (user: User, position?: { x: number; y: number }) => void;
  onOpenDM?: (userId: string) => void;
  onOpenSearch?: () => void;
  onOpenPins?: () => void;
  isDragging?: boolean;
  dragOffset?: number | null;
  dragProgress?: number | null;
}

export const MemberList: React.FC<MemberListProps> = ({
  isOpen,
  onClose,
  onSelectUser,
  onOpenDM,
  onOpenSearch,
  onOpenPins,
  isDragging = false,
  dragOffset = null,
  dragProgress = null,
}) => {
  const { activeGuild, activeChannel } = useGuildStore();
  const { user: currentUser } = useAuthStore();
  const { menu, closeContextMenu, handleUserContextMenu } = useUserContextMenu();
  const memberListWidth = useSettingsStore((s) => s.memberListWidth);

  if (!activeGuild) return null;
  if (!isOpen && !isDragging) return null;

  const members = activeGuild.members || [];
  const guildRoles = activeGuild.roles || [];

  // Helper to get roles with live metadata from activeGuild.roles
  const getMemberLiveRoles = (member: User) => {
    return (member.roles || []).map((r) => {
      const liveRole = guildRoles.find((gr) => gr.id === r.id);
      return liveRole ? { ...r, ...liveRole } : r;
    });
  };

  // Helper to find a member's highest hoisted role
  const getMemberHighestHoistedRole = (member: User) => {
    const liveRoles = getMemberLiveRoles(member);
    const hoisted = liveRoles
      .filter((r) => r.name !== '@everyone' && Boolean(r.hoist))
      .sort((a, b) => a.position - b.position);
    return hoisted.length > 0 ? hoisted[0] : null;
  };

  const { onlineMembers, offlineMembers, hoistedGroups, generalOnlineMembers } = useMemo(() => {
    const online = members.filter((m) => {
      const isMe = m.id === currentUser?.id;
      const st = isMe && currentUser ? currentUser.status : m.status;
      return st && st !== 'offline';
    });

    const offline = members.filter((m) => {
      const isMe = m.id === currentUser?.id;
      const st = isMe && currentUser ? currentUser.status : m.status;
      return !st || st === 'offline';
    });

    const sortedHoistedRoles = [...guildRoles]
      .filter((r) => r.name !== '@everyone' && Boolean(r.hoist))
      .sort((a, b) => a.position - b.position);

    const groups: Array<{ role: typeof guildRoles[0]; members: User[] }> = sortedHoistedRoles
      .map((role) => {
        const roleMembers = online.filter((m) => {
          const highestHoisted = getMemberHighestHoistedRole(m);
          return highestHoisted?.id === role.id;
        });
        return { role, members: roleMembers };
      })
      .filter((g) => g.members.length > 0);

    const generalOnline = online.filter((m) => {
      const highestHoisted = getMemberHighestHoistedRole(m);
      return !highestHoisted;
    });

    return {
      onlineMembers: online,
      offlineMembers: offline,
      hoistedGroups: groups,
      generalOnlineMembers: generalOnline,
    };
  }, [members, guildRoles, currentUser?.id, currentUser?.status]);

  const renderMember = (member: User) => {
    const isMe = member.id === currentUser?.id;
    const status = isMe && currentUser ? currentUser.status : member.status;
    const isOwner = member.id === activeGuild.owner_id;
    const liveRoles = getMemberLiveRoles(member);
    const sortedRoles = liveRoles
      .filter((r) => r.name !== '@everyone')
      .sort((a, b) => a.position - b.position);
    const topRole = sortedRoles.length > 0 ? sortedRoles[0] : null;
    const isOffline = !status || status === 'offline';
    const isMuted = member.muted_until && new Date(member.muted_until) > new Date();

    const roleColor = topRole && topRole.color && topRole.color !== '#99aab5' && topRole.color !== '#99AAB5'
      ? topRole.color
      : null;

    return (
      <div
        key={member.id}
        onClick={(e) => {
          e.stopPropagation();
          onSelectUser?.(member, { x: e.clientX, y: e.clientY });
        }}
        onContextMenu={(e) =>
          handleUserContextMenu(e, member, {
            onOpenUserProfile: onSelectUser,
            onOpenDM,
            contextType: 'guild',
          })
        }
        className={`flex items-center gap-3 px-2 py-1.5 rounded-xl hover:bg-background-light/40 group cursor-pointer transition-all active:scale-[0.98] ${
          isOffline ? 'opacity-55 hover:opacity-100' : ''
        }`}
        title="Clique com botão esquerdo para ver o perfil ou direito para opções"
      >
        <UserAvatar
          user={member}
          size="sm"
          showStatus={true}
          status={status}
        />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span
              className={`text-sm truncate font-medium group-hover:underline ${
                isOwner ? 'font-semibold' : ''
              } ${isOffline ? 'text-gray-400' : ''}`}
              style={
                !isOffline && roleColor
                  ? { color: roleColor }
                  : !isOffline && isOwner
                  ? { color: '#5865F2' }
                  : isOffline
                  ? { color: '#888888' }
                  : { color: '#E0E0E0' }
              }
            >
              {member.display_name || member.username}
            </span>
            {isOwner && (
              <span title="Dono do Servidor">
                <Crown className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
              </span>
            )}
            {isMuted && (
              <span title="Membro Silenciado">
                <VolumeX className="w-3.5 h-3.5 text-dnd flex-shrink-0" />
              </span>
            )}
          </div>

          {/* Activity / Custom Status / Roles Badges */}
          {((isMe && currentUser
            ? currentUser.show_activity_status !== false && !!currentUser.custom_activity
            : member.status !== 'offline' && member.show_activity_status !== false && !!member.custom_activity)) ? (
            (() => {
              const act = isMe && currentUser ? currentUser.custom_activity! : member.custom_activity!;
              return (
                <p className="text-[11px] text-brand-300 font-medium truncate flex items-center gap-1">
                  {act.type === 'playing' ? <Gamepad2 className="w-3 h-3 flex-shrink-0" /> :
                   act.type === 'listening' ? <Music className="w-3 h-3 flex-shrink-0" /> :
                   act.type === 'watching' ? <Tv className="w-3 h-3 flex-shrink-0" /> :
                   act.type === 'streaming' ? <Radio className="w-3 h-3 flex-shrink-0" /> :
                   <Sparkles className="w-3 h-3 flex-shrink-0" />}
                  <span className="truncate">
                    {act.type === 'playing' ? 'Jogando ' :
                     act.type === 'listening' ? 'Ouvindo ' :
                     act.type === 'watching' ? 'Assistindo ' : ''}
                    {act.name}
                  </span>
                </p>
              );
            })()
          ) : member.custom_status ? (
            <p className="text-[11px] text-gray-400 truncate">{member.custom_status}</p>
          ) : topRole ? (
            <span
              className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-white/5 truncate max-w-fit block"
              style={{ color: roleColor || topRole.color || '#99aab5' }}
            >
              {topRole.name}
            </span>
          ) : null}
        </div>
      </div>
    );
  };

  const isCapacitor =
    typeof window !== 'undefined' &&
    (typeof (window as any).Capacitor !== 'undefined' &&
      ((window as any).Capacitor?.isNativePlatform?.() ||
        (window as any).Capacitor?.getPlatform?.() === 'android' ||
        (window as any).Capacitor?.getPlatform?.() === 'ios') ||
      window.matchMedia?.('(display-mode: standalone)')?.matches);

  return (
    <>
      {/* Mobile Backdrop */}
      {(isOpen || isDragging) && (
        <div
          style={{
            opacity: isDragging && dragProgress !== null && dragProgress !== undefined
              ? dragProgress * 0.7
              : isOpen
              ? 0.7
              : 0,
            transition: isDragging ? 'none' : 'opacity 0.25s ease',
          }}
          className="fixed inset-0 bg-black backdrop-blur-sm z-40 md:hidden"
          onClick={onClose}
        />
      )}

      {/* Member Sidebar / Drawer */}
      <div
        style={{
          width: typeof window !== 'undefined' && window.innerWidth < 768 ? '100vw' : `${memberListWidth}px`,
          transform: isDragging && dragOffset !== null && dragOffset !== undefined
            ? `translateX(${dragOffset}px)`
            : undefined,
          transition: isDragging ? 'none' : 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
          paddingTop: isCapacitor && typeof window !== 'undefined' && window.innerWidth < 768 ? 'max(env(safe-area-inset-top, 0px), 28px)' : undefined,
        }}
        className={`fixed md:static inset-y-0 right-0 z-40 md:z-0 w-full md:w-64 bg-background-darker flex flex-col h-full border-l border-black/20 select-none p-3 overflow-y-auto no-scrollbar shadow-2xl md:shadow-none md:relative flex-shrink-0 ${
          isDragging ? '' : isOpen ? 'translate-x-0' : 'translate-x-full md:translate-x-0'
        }`}
      >
        {/* Resizer Handle */}
        <SidebarResizer side="left" target="memberList" />
        {/* Mobile Header */}
        <div className="md:hidden flex-shrink-0 -mx-3 -mt-3 mb-3 bg-background-dark/95 backdrop-blur-sm border-b border-black/20 px-4 py-3 shadow-sm">
          {/* Top Row: Back button on left, Search & Pins on right */}
          <div className="flex items-center justify-between mb-2.5">
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white p-1.5 -ml-1.5 rounded-lg hover:bg-white/10 transition-colors cursor-pointer flex items-center gap-1"
              title="Voltar para o chat"
            >
              <ArrowLeft className="w-6 h-6" />
            </button>

            <div className="flex items-center gap-1">
              {onOpenSearch && (
                <button
                  onClick={onOpenSearch}
                  className="p-2 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-white/10 transition-colors cursor-pointer"
                  title="Buscar no canal"
                >
                  <Search className="w-5 h-5" />
                </button>
              )}
              {onOpenPins && (
                <button
                  onClick={onOpenPins}
                  className="p-2 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-white/10 transition-colors cursor-pointer"
                  title="Mensagens Fixadas"
                >
                  <Pin className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>

          {/* Channel Name Header */}
          <div className="flex items-center gap-2">
            <Hash className="w-6 h-6 text-gray-400 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <h2 className="text-[17px] font-bold text-white truncate leading-tight">
                {activeChannel?.name || 'Membros do Servidor'}
              </h2>
              {activeChannel?.topic ? (
                <p className="text-xs text-gray-400 truncate mt-0.5">{activeChannel.topic}</p>
              ) : (
                <p className="text-xs text-gray-400 truncate mt-0.5">Lista de Membros</p>
              )}
            </div>
          </div>
        </div>

        {/* Hoisted Role Sections */}
        {hoistedGroups.map((group) => (
          <div key={group.role.id} className="mb-4">
            <h3
              className="text-xs font-bold uppercase tracking-wider px-2 mb-2 flex items-center justify-between"
              style={{ color: group.role.color && group.role.color !== '#99aab5' && group.role.color !== '#99AAB5' ? group.role.color : '#949ba4' }}
            >
              <span className="truncate">{group.role.name}</span>
              <span className="text-[11px] opacity-75 font-mono">({group.members.length})</span>
            </h3>
            <div className="space-y-0.5">
              {group.members.map(renderMember)}
            </div>
          </div>
        ))}

        {/* General Online Section */}
        {generalOnlineMembers.length > 0 && (
          <div className="mb-4">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider px-2 mb-2 flex items-center justify-between">
              <span>DISPONÍVEL</span>
              <span className="text-[11px] text-gray-500 font-mono">({generalOnlineMembers.length})</span>
            </h3>
            <div className="space-y-0.5">
              {generalOnlineMembers.map(renderMember)}
            </div>
          </div>
        )}

        {/* Offline Section */}
        {offlineMembers.length > 0 && (
          <div>
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider px-2 mb-2 flex items-center justify-between">
              <span>INDISPONÍVEL</span>
              <span className="text-[11px] text-gray-600 font-mono">({offlineMembers.length})</span>
            </h3>
            <div className="space-y-0.5 opacity-70">
              {offlineMembers.map(renderMember)}
            </div>
          </div>
        )}
      </div>

      {/* Context Menu Component */}
      <ContextMenu menu={menu} onClose={closeContextMenu} />
    </>
  );
};
