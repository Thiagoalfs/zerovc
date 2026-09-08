import React from 'react';
import {
  Crown,
  X,
  User as UserIcon,
  MessageSquare,
  Shield,
  VolumeX,
  UserMinus,
  Ban,
  Check,
  Clock,
  Volume2,
} from 'lucide-react';
import { useGuildStore } from '../../stores/guildStore';
import { useAuthStore } from '../../stores/authStore';
import { useDMStore } from '../../stores/dmStore';
import { User, Permissions } from '../../types';
import { ContextMenu, useContextMenu, ContextMenuItem } from '../ContextMenu';
import { formatAssetUrl } from '../../lib/api';
import { UserVolumeSlider } from '../Voice/VolumeSliders';

interface MemberListProps {
  isOpen: boolean;
  onClose?: () => void;
  onSelectUser?: (user: User, position?: { x: number; y: number }) => void;
  onOpenDM?: (userId: string) => void;
}

export const MemberList: React.FC<MemberListProps> = ({
  isOpen,
  onClose,
  onSelectUser,
  onOpenDM,
}) => {
  const {
    activeGuild,
    kickMember,
    banMember,
    muteMember,
    assignRole,
    removeRole,
  } = useGuildStore();
  const { user: currentUser } = useAuthStore();
  const { openDMWithUser } = useDMStore();
  const { menu, openContextMenu, closeContextMenu } = useContextMenu();

  if (!isOpen || !activeGuild) return null;

  const isCurrentOwner = activeGuild.owner_id === currentUser?.id;
  const members = activeGuild.members || [];
  const guildRoles = activeGuild.roles || [];

  // Calculate current user's permissions
  const currentUserRoles = activeGuild.members?.find((m) => m.id === currentUser?.id)?.roles || [];
  let currentUserPerms = 0;
  let currentUserHighestPos = 999999;
  currentUserRoles.forEach((r) => {
    currentUserPerms |= Number(r.permissions || 0);
    if (r.position < currentUserHighestPos) {
      currentUserHighestPos = r.position;
    }
  });

  const hasAdmin = isCurrentOwner || (currentUserPerms & Permissions.ADMINISTRATOR) !== 0;
  const canManageRoles = isCurrentOwner || hasAdmin || (currentUserPerms & Permissions.MANAGE_ROLES) !== 0;
  const canKick = isCurrentOwner || hasAdmin || (currentUserPerms & Permissions.KICK_MEMBERS) !== 0;
  const canBan = isCurrentOwner || hasAdmin || (currentUserPerms & Permissions.BAN_MEMBERS) !== 0;
  const canMute = isCurrentOwner || hasAdmin || (currentUserPerms & Permissions.MUTE_MEMBERS) !== 0;

  const onlineMembers = members.filter((m) => {
    const isMe = m.id === currentUser?.id;
    const st = isMe && currentUser ? currentUser.status : m.status;
    return st && st !== 'offline';
  });

  const offlineMembers = members.filter((m) => {
    const isMe = m.id === currentUser?.id;
    const st = isMe && currentUser ? currentUser.status : m.status;
    return !st || st === 'offline';
  });

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

  // Sorted list of all hoisted roles
  const sortedHoistedRoles = [...guildRoles]
    .filter((r) => r.name !== '@everyone' && Boolean(r.hoist))
    .sort((a, b) => a.position - b.position);

  // Group online members by their highest hoisted role
  const hoistedGroups: Array<{ role: typeof guildRoles[0]; members: User[] }> = sortedHoistedRoles
    .map((role) => {
      const roleMembers = onlineMembers.filter((m) => {
        const highestHoisted = getMemberHighestHoistedRole(m);
        return highestHoisted?.id === role.id;
      });
      return { role, members: roleMembers };
    })
    .filter((g) => g.members.length > 0);

  // Members without a hoisted role (or whose roles are not hoisted)
  const generalOnlineMembers = onlineMembers.filter((m) => {
    const highestHoisted = getMemberHighestHoistedRole(m);
    return !highestHoisted;
  });

  const handleMemberContextMenu = (e: React.MouseEvent, targetMember: User) => {
    const isMe = targetMember.id === currentUser?.id;
    const isTargetOwner = targetMember.id === activeGuild.owner_id;

    // Calculate target's highest role position
    let targetHighestPos = 999999;
    const targetLiveRoles = getMemberLiveRoles(targetMember);
    targetLiveRoles.forEach((r) => {
      if (r.position < targetHighestPos) {
        targetHighestPos = r.position;
      }
    });

    const isHierarchyAllowed = isCurrentOwner || isMe || (currentUserHighestPos < targetHighestPos);

    const items: ContextMenuItem[] = [
      {
        label: 'Ver Perfil',
        icon: <UserIcon className="w-4 h-4" />,
        onClick: () => onSelectUser?.(targetMember, { x: e.clientX, y: e.clientY }),
      },
      ...(!isMe
        ? [
            {
              label: 'Enviar Mensagem',
              icon: <MessageSquare className="w-4 h-4" />,
              onClick: async () => {
                if (onOpenDM) {
                  onOpenDM(targetMember.id);
                } else {
                  await openDMWithUser(targetMember.id);
                }
              },
            },
            { label: '', separator: true },
            {
              label: 'Volume de Usuário',
              customRender: <UserVolumeSlider userId={targetMember.id} />,
            },
          ]
        : []),
    ];

    // Change Roles Submenu (allowed if has permission and hierarchy allows or is self)
    if (canManageRoles && guildRoles.length > 0 && (isCurrentOwner || isMe || isHierarchyAllowed)) {
      const roleSubItems: ContextMenuItem[] = guildRoles
        .filter((role) => role.name !== '@everyone')
        .map((role) => {
        const hasRole = (targetMember.roles || []).some((r) => r.id === role.id);
        return {
          label: role.name,
          icon: hasRole ? (
            <Check className="w-3.5 h-3.5 text-online" />
          ) : (
            <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: role.color }} />
          ),
          onClick: async () => {
            if (hasRole) {
              await removeRole(activeGuild.id, targetMember.id, role.id);
            } else {
              await assignRole(activeGuild.id, targetMember.id, role.id);
            }
          },
        };
      });

      items.push({
        label: 'Alterar Cargos',
        icon: <Shield className="w-4 h-4 text-brand-400" />,
        subItems: roleSubItems,
      });
    }

    // Mute/Timeout Submenu (allowed if has permission and hierarchy allows or is self)
    if (canMute && (isCurrentOwner || isMe || isHierarchyAllowed)) {
      const isMuted = targetMember.muted_until && new Date(targetMember.muted_until) > new Date();

      const muteSubItems: ContextMenuItem[] = [
        {
          label: '15 minutos',
          icon: <Clock className="w-3.5 h-3.5 text-gray-400" />,
          onClick: () => muteMember(activeGuild.id, targetMember.id, 900),
        },
        {
          label: '1 hora',
          icon: <Clock className="w-3.5 h-3.5 text-gray-400" />,
          onClick: () => muteMember(activeGuild.id, targetMember.id, 3600),
        },
        {
          label: '24 horas',
          icon: <Clock className="w-3.5 h-3.5 text-gray-400" />,
          onClick: () => muteMember(activeGuild.id, targetMember.id, 86400),
        },
        {
          label: '1 semana',
          icon: <Clock className="w-3.5 h-3.5 text-gray-400" />,
          onClick: () => muteMember(activeGuild.id, targetMember.id, 604800),
        },
        {
          label: 'Permanente',
          icon: <VolumeX className="w-3.5 h-3.5 text-amber-400" />,
          onClick: () => muteMember(activeGuild.id, targetMember.id, -1),
        },
        ...(isMuted
          ? [
              { label: '', separator: true },
              {
                label: 'Remover Silenciamento',
                icon: <Volume2 className="w-3.5 h-3.5 text-online" />,
                onClick: () => muteMember(activeGuild.id, targetMember.id, 0),
              },
            ]
          : []),
      ];

      items.push({
        label: isMuted ? 'Membro Silenciado' : 'Silenciar no Servidor',
        icon: <VolumeX className={`w-4 h-4 ${isMuted ? 'text-dnd' : 'text-gray-400'}`} />,
        subItems: muteSubItems,
      });
    }

    // Kick and Ban (only for other members)
    if (!isMe && !isTargetOwner && isHierarchyAllowed) {
      if (canKick) {
        items.push({
          label: `Expulsar ${targetMember.display_name || targetMember.username}`,
          icon: <UserMinus className="w-4 h-4" />,
          variant: 'danger',
          onClick: async () => {
            if (confirm(`Tem certeza que deseja expulsar ${targetMember.display_name || targetMember.username} do servidor?`)) {
              await kickMember(activeGuild.id, targetMember.id);
            }
          },
        });
      }

      if (canBan) {
        items.push({
          label: `Banir ${targetMember.display_name || targetMember.username}`,
          icon: <Ban className="w-4 h-4" />,
          variant: 'danger',
          onClick: async () => {
            const reason = prompt(`Motivo do banimento para ${targetMember.display_name || targetMember.username} (opcional):`);
            if (reason !== null) {
              await banMember(activeGuild.id, targetMember.id, reason);
            }
          },
        });
      }
    }

    openContextMenu(e, items, targetMember.display_name || targetMember.username);
  };

  const renderMember = (m: User) => {
    const isMe = m.id === currentUser?.id;
    const user = isMe && currentUser ? { ...m, ...currentUser } : m;
    const isOwner = user.id === activeGuild.owner_id;
    const liveRoles = getMemberLiveRoles(user);
    const sortedRoles = liveRoles
      .filter((r) => r.name !== '@everyone')
      .sort((a, b) => a.position - b.position);
    const topRole = sortedRoles.length > 0 ? sortedRoles[0] : null;
    const isOffline = !user.status || user.status === 'offline';
    const isMuted = user.muted_until && new Date(user.muted_until) > new Date();

    const roleColor = topRole && topRole.color && topRole.color !== '#99aab5' && topRole.color !== '#99AAB5'
      ? topRole.color
      : null;

    return (
      <div
        key={user.id}
        onClick={(e) => {
          e.stopPropagation();
          onSelectUser?.(user, { x: e.clientX, y: e.clientY });
        }}
        onContextMenu={(e) => handleMemberContextMenu(e, user)}
        className={`flex items-center gap-3 px-2 py-1.5 rounded-xl hover:bg-background-light/40 group cursor-pointer transition-all active:scale-[0.98] ${
          isOffline ? 'opacity-55 hover:opacity-100' : ''
        }`}
        title="Clique com botão esquerdo para ver o perfil ou direito para opções"
      >
        <div className="relative w-8 h-8 rounded-full bg-brand-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
          {user.avatar_url ? (
            <img src={formatAssetUrl(user.avatar_url)} alt="" className="w-full h-full rounded-full object-cover" />
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
              {user.display_name || user.username}
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

          {/* Custom Status / Roles Badges */}
          {user.custom_status ? (
            <p className="text-[11px] text-gray-400 truncate">{user.custom_status}</p>
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
          <button onClick={onClose} className="text-gray-400 hover:text-white p-1 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
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
