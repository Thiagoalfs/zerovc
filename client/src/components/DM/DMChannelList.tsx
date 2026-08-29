import React, { useEffect, useState } from 'react';
import { Users, Plus, MessageSquare, User as UserIcon, Phone, UserPlus, UserMinus, Ban, Copy, Check, Server } from 'lucide-react';
import { useDMStore } from '../../stores/dmStore';
import { useDMGroupStore } from '../../stores/dmGroupStore';
import { useGuildStore } from '../../stores/guildStore';
import { useFriendStore } from '../../stores/friendStore';
import { useAuthStore } from '../../stores/authStore';
import { useCallStore } from '../../stores/callStore';
import { DMRoom, DMGroup, User } from '../../types';
import { UserBar } from '../Sidebar/UserBar';
import { CreateDMGroupModal } from '../Modals/CreateDMGroupModal';
import { ContextMenu } from '../ContextMenu/ContextMenu';
import { useContextMenu, ContextMenuItem } from '../ContextMenu/useContextMenu';
import { api, formatAssetUrl } from '../../lib/api';

interface DMChannelListProps {
  currentView: 'friends' | 'dm' | 'group';
  onSelectFriends: () => void;
  onSelectRoom?: (room: DMRoom) => void;
  onSelectGroup?: (group: DMGroup) => void;
  onOpenUserProfile?: (user: User, position?: { x: number; y: number }) => void;
  onOpenSettings: () => void;
  onOpenScreenShare: () => void;
  onCloseMobileDrawer?: () => void;
}

export const DMChannelList: React.FC<DMChannelListProps> = ({
  currentView,
  onSelectFriends,
  onSelectRoom,
  onSelectGroup,
  onOpenUserProfile,
  onOpenSettings,
  onOpenScreenShare,
  onCloseMobileDrawer,
}) => {
  const { user: currentUser } = useAuthStore();
  const { rooms, activeRoom, selectRoom, fetchRooms, roomUnreadCounts, unreadRooms, openDMWithUser } = useDMStore();
  const { groups, activeGroup, selectGroup, fetchGroups } = useDMGroupStore();
  const { guilds } = useGuildStore();
  const { friends, fetchFriends, sendRequest, removeFriend } = useFriendStore();
  const { startCall } = useCallStore();
  const { menu, openContextMenu, closeContextMenu } = useContextMenu();
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [copiedUserId, setCopiedUserId] = useState<string | null>(null);

  useEffect(() => {
    fetchRooms();
    fetchGroups();
  }, []);

  const handleSelectRoom = (room: DMRoom) => {
    selectRoom(room);
    if (onSelectRoom) onSelectRoom(room);
    if (onCloseMobileDrawer) onCloseMobileDrawer();
  };

  const handleSelectGroup = (group: DMGroup) => {
    selectGroup(group);
    if (onSelectGroup) onSelectGroup(group);
    if (onCloseMobileDrawer) onCloseMobileDrawer();
  };

  const handleSelectFriends = () => {
    onSelectFriends();
    if (onCloseMobileDrawer) onCloseMobileDrawer();
  };

  const getStatusColor = (s?: string) => {
    switch (s) {
      case 'online': return 'bg-online';
      case 'idle': return 'bg-idle';
      case 'dnd': return 'bg-dnd';
      default: return 'bg-offline';
    }
  };

  const handleUserContextMenu = (e: React.MouseEvent, targetUser?: User, roomId?: string) => {
    if (!targetUser) return;
    const isMe = targetUser.id === currentUser?.id;
    const friendship = friends.find(
      (f) => (f.friend?.id === targetUser.id || f.user?.id === targetUser.id)
    );
    const isFriend = !!friendship && friendship.status === 'accepted';

    // Submenu para convidar para servidor
    const inviteSubmenu: ContextMenuItem[] = (guilds || []).map((g) => ({
      label: g.name,
      icon: <Server className="w-3.5 h-3.5" />,
      onClick: async () => {
        try {
          const invite = await api.guilds.createInvite(g.id);
          const r = roomId ? { id: roomId } : await openDMWithUser(targetUser.id);
          const inviteLink = `${window.location.origin}/invite/${invite.code}`;
          await api.dms.sendMessage(r.id, { content: `Aqui está o convite para o servidor **${g.name}**:\n${inviteLink}` });
          alert(`Convite para o servidor "${g.name}" enviado com sucesso na DM de @${targetUser.username}!`);
        } catch (err: any) {
          alert(err?.message || 'Erro ao enviar convite para o servidor');
        }
      },
    }));

    const items: ContextMenuItem[] = [
      {
        id: 'view-profile',
        label: 'Ver Perfil',
        icon: <UserIcon className="w-4 h-4" />,
        onClick: () => {
          onOpenUserProfile?.(targetUser, { x: e.clientX, y: e.clientY });
        },
      },
      ...(!isMe
        ? [
            {
              id: 'start-call',
              label: 'Ligar',
              icon: <Phone className="w-4 h-4 text-emerald-400" />,
              onClick: async () => {
                try {
                  const r = roomId ? { id: roomId } : await openDMWithUser(targetUser.id);
                  await startCall(r.id, targetUser);
                } catch (err: any) {
                  alert(err?.message || 'Erro ao iniciar chamada');
                }
              },
            },
          ]
        : []),
      ...(guilds.length > 0 && !isMe
        ? [
            {
              id: 'invite-to-server',
              label: 'Convidar para Servidor',
              icon: <Server className="w-4 h-4 text-brand-400" />,
              subItems: inviteSubmenu,
            },
          ]
        : []),
      {
        separator: true,
        label: '',
      },
      ...(!isMe
        ? [
            isFriend
              ? {
                  id: 'remove-friend',
                  label: 'Remover Amigo',
                  icon: <UserMinus className="w-4 h-4" />,
                  variant: 'danger' as const,
                  onClick: async () => {
                    if (window.confirm(`Tem certeza que deseja remover @${targetUser.username} dos seus amigos?`)) {
                      try {
                        if (friendship) await removeFriend(friendship.id);
                      } catch (err: any) {
                        alert(err?.message || 'Erro ao remover amigo');
                      }
                    }
                  },
                }
              : {
                  id: 'add-friend',
                  label: 'Adicionar Amigo',
                  icon: <UserPlus className="w-4 h-4 text-online" />,
                  onClick: async () => {
                    try {
                      await sendRequest(targetUser.username);
                      alert(`Pedido de amizade enviado para @${targetUser.username}!`);
                    } catch (err: any) {
                      alert(err?.message || 'Erro ao enviar pedido de amizade');
                    }
                  },
                },
            {
              id: 'block-user',
              label: 'Bloquear',
              icon: <Ban className="w-4 h-4" />,
              variant: 'danger' as const,
              onClick: async () => {
                if (window.confirm(`Tem certeza que deseja bloquear @${targetUser.username}? Vocês não poderão mais trocar mensagens nem ver o status um do outro.`)) {
                  try {
                    await api.users.block(targetUser.id);
                    await fetchFriends();
                    alert(`Usuário @${targetUser.username} bloqueado.`);
                  } catch (err: any) {
                    alert(err?.message || 'Erro ao bloquear usuário');
                  }
                }
              },
            },
            {
              separator: true,
              label: '',
            },
          ]
        : []),
      {
        id: 'copy-user-id',
        label: copiedUserId === targetUser.id ? 'ID Copiado!' : 'Copiar ID de Usuário',
        icon: copiedUserId === targetUser.id ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />,
        onClick: () => {
          navigator.clipboard.writeText(targetUser.id);
          setCopiedUserId(targetUser.id);
          setTimeout(() => setCopiedUserId(null), 2000);
        },
      },
    ];

    openContextMenu(e, items, targetUser.display_name || `@${targetUser.username}`);
  };

  return (
    <>
      <div className="w-60 bg-background-darker flex flex-col h-full select-none border-r border-black/20">
        {/* Header */}
        <div className="h-12 border-b border-black/20 px-4 flex items-center justify-between shadow-sm">
          <span className="font-bold text-gray-100 text-sm">Mensagens Diretas</span>
        </div>

        {/* Friends Button */}
        <div className="p-3 pb-1">
          <button
            onClick={handleSelectFriends}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-semibold transition-colors cursor-pointer ${
              currentView === 'friends'
                ? 'bg-brand-500 text-white shadow-md'
                : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
            }`}
          >
            <Users className="w-5 h-5" />
            <span>Amigos</span>
          </button>
        </div>

        {/* Channels & Groups Feed */}
        <div className="flex-1 overflow-y-auto px-2 py-2 space-y-4 no-scrollbar">
          {/* DM Groups Section */}
          <div>
            <div className="flex items-center justify-between px-2 py-1">
              <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                Grupos
              </span>
              <button
                onClick={() => setIsCreateGroupOpen(true)}
                className="text-gray-400 hover:text-white p-0.5 rounded hover:bg-white/10 transition-colors cursor-pointer"
                title="Criar Grupo de DM"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            {groups.length > 0 && (
              <div className="space-y-0.5 mt-1">
                {groups.map((group) => {
                  const isSelected = currentView === 'group' && activeGroup?.id === group.id;
                  const groupDisplayName = group.name || group.members?.map((m) => m.display_name || m.username).join(', ') || 'Grupo de DM';

                  return (
                    <button
                      key={group.id}
                      onClick={() => handleSelectGroup(group)}
                      className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-white/10 text-white'
                          : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                      }`}
                    >
                      <div className="w-7 h-7 rounded-full bg-brand-600 flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
                        <Users className="w-3.5 h-3.5" />
                      </div>
                      <div className="flex flex-col text-left truncate flex-1 min-w-0">
                        <span className="text-gray-200 truncate">{groupDisplayName}</span>
                        <span className="text-[10px] text-gray-500 truncate">
                          {group.members?.length || 0} membros
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* DM 1x1 Section */}
          <div>
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider px-2 py-1 block">
              Mensagens Diretas
            </span>

            {rooms.length === 0 ? (
              <div className="px-2 py-2 text-xs text-gray-500">
                Nenhuma conversa recente.
              </div>
            ) : (
              <div className="space-y-0.5 mt-1">
                {rooms.map((room) => {
                  const isSelected = currentView === 'dm' && activeRoom?.id === room.id;
                  const recipient = room.recipient;
                  const unreadCount = roomUnreadCounts[room.id] || (unreadRooms.has(room.id) ? 1 : 0);

                  return (
                    <button
                      key={room.id}
                      onClick={() => handleSelectRoom(room)}
                      onContextMenu={(e) => handleUserContextMenu(e, recipient, room.id)}
                      className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-white/10 text-white'
                          : unreadCount > 0
                          ? 'text-white font-bold hover:bg-white/5'
                          : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                      }`}
                    >
                      <div className="relative w-7 h-7 rounded-full bg-brand-500 flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
                        {recipient?.avatar_url ? (
                          <img src={formatAssetUrl(recipient.avatar_url)} alt="" className="w-full h-full rounded-full object-cover" />
                        ) : (
                          <span>{recipient?.display_name?.[0]?.toUpperCase() || recipient?.username[0]?.toUpperCase() || 'U'}</span>
                        )}
                        <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border border-background-darker ${getStatusColor(recipient?.status)}`} />
                      </div>

                      <div className="flex flex-col text-left truncate flex-1 min-w-0">
                        <span className={`truncate ${unreadCount > 0 && !isSelected ? 'text-white font-bold' : 'text-gray-200'}`}>
                          {recipient?.display_name || recipient?.username}
                        </span>
                        <span className="text-[10px] text-gray-500 truncate">
                          @{recipient?.username}
                        </span>
                      </div>

                      {unreadCount > 0 && !isSelected && (
                        <div className="ml-1 px-1.5 py-0.5 min-w-[18px] h-[18px] bg-dnd text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow-sm flex-shrink-0 animate-in zoom-in-50">
                          {unreadCount > 99 ? '99+' : unreadCount}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* User Footer */}
        <UserBar onOpenSettings={onOpenSettings} onOpenScreenShare={onOpenScreenShare} />
      </div>

      {/* Create Group Modal */}
      <CreateDMGroupModal
        isOpen={isCreateGroupOpen}
        onClose={() => setIsCreateGroupOpen(false)}
        onGroupCreated={(groupId) => {
          // Handled via store select
        }}
      />

      <ContextMenu menu={menu} onClose={closeContextMenu} />
    </>
  );
};
