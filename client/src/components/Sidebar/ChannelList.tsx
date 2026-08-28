import React, { useState } from 'react';
import {
  Hash,
  Volume2,
  Plus,
  UserPlus,
  Users,
  X,
  Settings,
  ChevronDown,
  ChevronRight,
  GripVertical,
  FolderPlus,
  Folder,
  Trash2,
  CheckCheck,
  Lock,
  User as UserIcon,
  MessageSquare,
  Shield,
  VolumeX,
  UserMinus,
  Ban,
  Check,
  Clock,
  MicOff,
  Mic,
  Headphones,
  PhoneOff,
} from 'lucide-react';
import { Channel, User, Permissions } from '../../types';
import { useGuildStore } from '../../stores/guildStore';
import { useVoiceStore } from '../../stores/voiceStore';
import { useAuthStore } from '../../stores/authStore';
import { useDMStore } from '../../stores/dmStore';
import { api } from '../../lib/api';
import { UserBar } from './UserBar';
import { ContextMenu, useContextMenu, ContextMenuItem } from '../ContextMenu';

interface ChannelListProps {
  isHomeActive: boolean;
  onSelectChannel?: (channel: Channel) => void;
  onOpenCreateChannel: (type: 'text' | 'voice' | 'category', categoryId?: string) => void;
  onOpenInviteModal: () => void;
  onOpenSettings: () => void;
  onOpenServerSettings?: () => void;
  onOpenChannelSettings?: (channel: Channel) => void;
  onOpenMemberList?: () => void;
  onSelectUser?: (user: User, position?: { x: number; y: number }) => void;
  onOpenDM?: (userId: string) => void;
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
  onSelectUser,
  onOpenDM,
  onOpenScreenShare,
  onCloseMobileDrawer,
}) => {
  const { user } = useAuthStore();
  const {
    activeGuild,
    activeChannel,
    selectChannel,
    unreadChannels,
    channelMentions,
    reorderChannels,
    deleteChannel,
    kickMember,
    banMember,
    muteMember,
    assignRole,
    removeRole,
  } = useGuildStore();
  const { openDMWithUser } = useDMStore();
  const {
    currentChannelId,
    joinVoice,
    isConnected,
    speakingUserIds,
    participantVolumes,
    setParticipantVolume,
  } = useVoiceStore();

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});
  const [draggedChannelId, setDraggedChannelId] = useState<string | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<{ id: string; isCategory?: boolean } | null>(null);

  const { menu, openContextMenu, closeContextMenu } = useContextMenu();

  const isOwner = activeGuild?.owner_id === user?.id;
  const channels = activeGuild?.channels || [];

  // Group channels
  const categories = channels.filter((c) => c.type === 'category');
  const rootChannels = channels.filter((c) => c.type !== 'category' && !c.category_id);
  const categoryChannelsMap: Record<string, Channel[]> = {};

  categories.forEach((cat) => {
    categoryChannelsMap[cat.id] = channels.filter((c) => c.category_id === cat.id);
  });

  const toggleCategoryCollapse = (categoryId: string) => {
    setCollapsedCategories((prev) => ({
      ...prev,
      [categoryId]: !prev[categoryId],
    }));
  };

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

  // Drag and Drop Logic
  const handleDropOnChannel = (targetChannel: Channel) => {
    if (!activeGuild || !draggedChannelId || draggedChannelId === targetChannel.id) {
      setDraggedChannelId(null);
      setDragOverTarget(null);
      return;
    }

    const dragged = channels.find((c) => c.id === draggedChannelId);
    if (!dragged) return;

    const newCategoryId = targetChannel.category_id;
    const isMovingToRoot = !newCategoryId;

    // Filter relevant list
    const siblingChannels = channels.filter((c) =>
      isMovingToRoot ? !c.category_id && c.type !== 'category' : c.category_id === newCategoryId
    );

    const filtered = siblingChannels.filter((c) => c.id !== dragged.id);
    const targetIdx = filtered.findIndex((c) => c.id === targetChannel.id);
    const insertIdx = targetIdx === -1 ? filtered.length : targetIdx;

    filtered.splice(insertIdx, 0, { ...dragged, category_id: newCategoryId });

    const reorderedPayload = filtered.map((c, idx) => ({
      id: c.id,
      position: idx,
      category_id: newCategoryId,
      clear_category: isMovingToRoot,
    }));

    reorderChannels(activeGuild.id, reorderedPayload);
    setDraggedChannelId(null);
    setDragOverTarget(null);
  };

  const handleDropOnCategory = (category: Channel) => {
    if (!activeGuild || !draggedChannelId) {
      setDraggedChannelId(null);
      setDragOverTarget(null);
      return;
    }

    const dragged = channels.find((c) => c.id === draggedChannelId);
    if (!dragged || dragged.type === 'category') return;

    const childChannels = categoryChannelsMap[category.id] || [];
    const filtered = childChannels.filter((c) => c.id !== dragged.id);
    filtered.push({ ...dragged, category_id: category.id });

    const reorderedPayload = filtered.map((c, idx) => ({
      id: c.id,
      position: idx,
      category_id: category.id,
      clear_category: false,
    }));

    reorderChannels(activeGuild.id, reorderedPayload);
    setDraggedChannelId(null);
    setDragOverTarget(null);
  };

  // Right-Click Context Menus
  const handleChannelContextMenu = (e: React.MouseEvent, channel: Channel) => {
    const isText = channel.type === 'text';
    const isUnread = unreadChannels.has(channel.id);

    const items: ContextMenuItem[] = [
      ...(isText && isUnread
        ? [
            {
              label: 'Marcar como Lido',
              icon: <CheckCheck className="w-4 h-4" />,
              onClick: () => selectChannel(channel),
            },
            { label: '', separator: true },
          ]
        : []),
      ...(isOwner
        ? [
            {
              label: 'Configurações do Canal',
              icon: <Settings className="w-4 h-4" />,
              onClick: () => onOpenChannelSettings?.(channel),
            },
            { label: '', separator: true },
            {
              label: 'Excluir Canal',
              icon: <Trash2 className="w-4 h-4" />,
              variant: 'danger' as const,
              onClick: () => {
                if (confirm(`Excluir canal #${channel.name}?`)) {
                  deleteChannel(channel.id);
                }
              },
            },
          ]
        : []),
    ];

    if (items.length > 0) {
      openContextMenu(e, items, `#${channel.name}`);
    }
  };

  const handleCategoryContextMenu = (e: React.MouseEvent, category: Channel) => {
    const isCollapsed = !!collapsedCategories[category.id];

    const items: ContextMenuItem[] = [
      {
        label: isCollapsed ? 'Expandir Categoria' : 'Colapsar Categoria',
        icon: isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />,
        onClick: () => toggleCategoryCollapse(category.id),
      },
      ...(isOwner
        ? [
            {
              label: 'Criar Canal Aqui',
              icon: <Plus className="w-4 h-4" />,
              onClick: () => onOpenCreateChannel('text', category.id),
            },
            {
              label: 'Editar Categoria',
              icon: <Settings className="w-4 h-4" />,
              onClick: () => onOpenChannelSettings?.(category),
            },
            { label: '', separator: true },
            {
              label: 'Excluir Categoria',
              icon: <Trash2 className="w-4 h-4" />,
              variant: 'danger' as const,
              onClick: () => {
                if (confirm(`Excluir categoria "${category.name}"? Os canais serão movidos para a raiz.`)) {
                  deleteChannel(category.id);
                }
              },
            },
          ]
        : []),
    ];

    openContextMenu(e, items, category.name);
  };

  const handleSidebarContextMenu = (e: React.MouseEvent) => {
    if (!isOwner) return;

    const items: ContextMenuItem[] = [
      {
        label: 'Criar Canal de Texto',
        icon: <Hash className="w-4 h-4" />,
        onClick: () => onOpenCreateChannel('text'),
      },
      {
        label: 'Criar Canal de Voz',
        icon: <Volume2 className="w-4 h-4" />,
        onClick: () => onOpenCreateChannel('voice'),
      },
      {
        label: 'Criar Categoria',
        icon: <FolderPlus className="w-4 h-4" />,
        onClick: () => onOpenCreateChannel('category'),
      },
      ...(onOpenServerSettings
        ? [
            { label: '', separator: true },
            {
              label: 'Configurações do Servidor',
              icon: <Settings className="w-4 h-4" />,
              onClick: () => onOpenServerSettings(),
            },
          ]
        : []),
    ];

    openContextMenu(e, items, activeGuild?.name || 'Servidor');
  };

  const handleVoiceMemberContextMenu = (
    e: React.MouseEvent,
    channel: Channel,
    vs: any,
    targetMember: User
  ) => {
    e.stopPropagation();
    if (!activeGuild || !user) return;

    const isMe = targetMember.id === user.id;
    const isTargetOwner = targetMember.id === activeGuild.owner_id;
    const isCurrentOwner = activeGuild.owner_id === user.id;

    // Calculate permissions
    const currentUserRoles = activeGuild.members?.find((m) => m.id === user.id)?.roles || [];
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

    let targetHighestPos = 999999;
    (targetMember.roles || []).forEach((r) => {
      if (r.position < targetHighestPos) {
        targetHighestPos = r.position;
      }
    });

    const isHierarchyAllowed = isCurrentOwner || isMe || currentUserHighestPos < targetHighestPos;
    const guildRoles = activeGuild.roles || [];

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
          ]
        : []),
    ];

    // Voice Call Moderation (Admin)
    if (canMute || isCurrentOwner || hasAdmin) {
      items.push({ label: '', separator: true });

      items.push({
        label: vs.is_muted ? 'Desmutar Microfone na Call' : 'Mutar Microfone na Call',
        icon: vs.is_muted ? <Mic className="w-4 h-4 text-online" /> : <MicOff className="w-4 h-4 text-amber-400" />,
        onClick: async () => {
          await api.channels.adminUpdateVoiceState(channel.id, targetMember.id, {
            is_muted: !vs.is_muted,
          });
        },
      });

      items.push({
        label: vs.is_deafened ? 'Desativar Ensurdecimento' : 'Ensurdecer na Call',
        icon: <Headphones className={`w-4 h-4 ${vs.is_deafened ? 'text-online' : 'text-amber-400'}`} />,
        onClick: async () => {
          await api.channels.adminUpdateVoiceState(channel.id, targetMember.id, {
            is_deafened: !vs.is_deafened,
          });
        },
      });

      if (!isMe) {
        items.push({
          label: 'Desconectar da Call',
          icon: <PhoneOff className="w-4 h-4 text-dnd" />,
          onClick: async () => {
            await api.channels.adminUpdateVoiceState(channel.id, targetMember.id, {
              disconnect: true,
            });
          },
        });
      }
    }

    // User Volume Slider (0 - 200%, default 100%, saved locally)
    if (!isMe) {
      items.push({ label: '', separator: true });
      const currentVol = participantVolumes[targetMember.id] ?? 1;
      items.push({
        label: 'Volume de Usuário',
        customRender: (
          <div className="px-2.5 py-1.5 flex flex-col gap-1.5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between text-xs font-semibold text-gray-300">
              <div className="flex items-center gap-1.5">
                {currentVol === 0 ? (
                  <VolumeX className="w-3.5 h-3.5 text-dnd" />
                ) : (
                  <Volume2 className="w-3.5 h-3.5 text-gray-400" />
                )}
                <span>Volume de Usuário</span>
              </div>
              <span className="text-brand-400 font-mono text-[11px] font-bold">
                {Math.round(currentVol * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={2}
              step={0.01}
              value={currentVol}
              onChange={(e) => setParticipantVolume(targetMember.id, parseFloat(e.target.value))}
              className="w-full accent-brand-500 h-1.5 bg-background-light rounded-lg cursor-pointer"
            />
          </div>
        ),
      });
    }

    // Change Roles Submenu
    if (canManageRoles && guildRoles.length > 0 && (isCurrentOwner || isMe || isHierarchyAllowed)) {
      items.push({ label: '', separator: true });
      const roleSubItems: ContextMenuItem[] = guildRoles.map((role) => {
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

    // Mute/Timeout Submenu
    if (canMute && (isCurrentOwner || isMe || isHierarchyAllowed)) {
      const isServerMuted = targetMember.muted_until && new Date(targetMember.muted_until) > new Date();

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
        ...(isServerMuted
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
        label: isServerMuted ? 'Membro Silenciado' : 'Silenciar no Servidor',
        icon: <VolumeX className={`w-4 h-4 ${isServerMuted ? 'text-dnd' : 'text-gray-400'}`} />,
        subItems: muteSubItems,
      });
    }

    // Kick and Ban
    if (!isMe && !isTargetOwner && isHierarchyAllowed) {
      if (canKick) {
        items.push({
          label: `Expulsar ${targetMember.display_name || targetMember.username}`,
          icon: <UserMinus className="w-4 h-4" />,
          variant: 'danger',
          onClick: async () => {
            if (confirm(`Tem certeza que deseja expulsar ${targetMember.display_name || targetMember.username}?`)) {
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

  // Render a Single Channel Row (Text or Voice)
  const renderChannelItem = (channel: Channel) => {
    const isText = channel.type === 'text';
    const isActive = activeChannel?.id === channel.id;
    const isUnread = isText && unreadChannels.has(channel.id) && !isActive;
    const mentionCount = isText ? channelMentions[channel.id] || 0 : 0;
    const isInThisVoice = !isText && currentChannelId === channel.id && isConnected;
    const isDragging = draggedChannelId === channel.id;
    const isDragOver = dragOverTarget?.id === channel.id && !isDragging;

    return (
      <div key={channel.id} className="space-y-0.5">
        <div
          draggable={isOwner}
          onDragStart={(e) => {
            if (!isOwner) return;
            e.dataTransfer.setData('text/plain', channel.id);
            e.dataTransfer.effectAllowed = 'move';
            setDraggedChannelId(channel.id);
          }}
          onDragOver={(e) => {
            if (!isOwner || !draggedChannelId) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            setDragOverTarget({ id: channel.id });
          }}
          onDragLeave={() => {
            if (dragOverTarget?.id === channel.id) {
              setDragOverTarget(null);
            }
          }}
          onDrop={(e) => {
            e.preventDefault();
            handleDropOnChannel(channel);
          }}
          onDragEnd={() => {
            setDraggedChannelId(null);
            setDragOverTarget(null);
          }}
          onContextMenu={(e) => handleChannelContextMenu(e, channel)}
          className={`group flex items-center justify-between px-2 py-1.5 rounded-lg text-sm transition-all relative ${
            isOwner ? 'cursor-grab active:cursor-grabbing' : ''
          } ${isDragging ? 'opacity-30 scale-[0.98]' : ''} ${
            isDragOver ? 'border-t-2 border-brand-500 bg-brand-500/10' : ''
          } ${
            isActive
              ? 'bg-background-light text-white font-medium shadow-sm'
              : isInThisVoice
              ? 'bg-online/15 text-online font-medium'
              : isUnread
              ? 'text-white font-semibold'
              : 'text-gray-400 hover:bg-background-light/40 hover:text-gray-200'
          }`}
        >
          {/* Left white indicator dot for unread */}
          {isUnread && (
            <div className="absolute -left-1 w-1.5 h-2 rounded-r-full bg-white shadow-sm" />
          )}

          {/* Drag Handle icon for owner */}
          {isOwner && (
            <GripVertical className="w-3.5 h-3.5 text-gray-500 opacity-0 group-hover:opacity-60 hover:opacity-100 flex-shrink-0 -ml-0.5 mr-0.5 transition-opacity" />
          )}

          <button
            onClick={() => (isText ? handleChannelClick(channel) : handleVoiceChannelClick(channel))}
            className="flex items-center gap-1.5 truncate flex-1 text-left min-w-0"
          >
            {isText ? (
              <Hash className={`w-4 h-4 flex-shrink-0 ${isUnread ? 'text-white' : 'text-gray-400'}`} />
            ) : (
              <Volume2
                className={`w-4 h-4 flex-shrink-0 ${isInThisVoice ? 'text-online' : 'text-gray-400'}`}
              />
            )}
            <span className="truncate">{channel.name}</span>
            {channel.is_private && (
              <span title="Canal Privado">
                <Lock className="w-3 h-3 text-gray-400 flex-shrink-0 ml-0.5" />
              </span>
            )}
          </button>

          {/* Mention Badge */}
          {mentionCount > 0 && !isActive && (
            <div className="ml-1 px-1.5 py-0.5 min-w-[18px] h-[18px] bg-dnd text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow-sm flex-shrink-0 animate-in zoom-in-50">
              {mentionCount > 99 ? '99+' : mentionCount}
            </div>
          )}

          {isOwner && onOpenChannelSettings && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onOpenChannelSettings(channel);
              }}
              className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-white p-0.5 rounded transition-opacity ml-1"
              title="Configurações do Canal"
            >
              <Settings className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Connected Voice Members */}
        {!isText && channel.voice_sessions && channel.voice_sessions.length > 0 && (
          <div className="pl-6 pr-2 py-1 space-y-0.5">
            {channel.voice_sessions.map((vs) => {
              const isSpeaking = speakingUserIds.includes(vs.user_id);
              const targetUser: User =
                activeGuild?.members?.find((m) => m.id === vs.user_id) ||
                vs.user || {
                  id: vs.user_id,
                  username: 'Usuário',
                  status: 'online',
                };

              return (
                <div
                  key={vs.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectUser?.(targetUser, { x: e.clientX, y: e.clientY });
                  }}
                  onContextMenu={(e) => handleVoiceMemberContextMenu(e, channel, vs, targetUser)}
                  className="flex items-center justify-between py-1 px-1.5 rounded-lg hover:bg-background-light/40 text-xs text-gray-300 cursor-pointer transition-colors group/voice-member"
                  title="Clique com botão esquerdo para perfil ou direito para opções"
                >
                  <div className="flex items-center gap-2 truncate">
                    <div
                      style={
                        isSpeaking
                          ? { boxShadow: '0 0 0 2px #23a55a' }
                          : undefined
                      }
                      className="w-5 h-5 rounded-full bg-brand-500 flex items-center justify-center text-[10px] font-bold text-white transition-all flex-shrink-0"
                    >
                      {targetUser.avatar_url ? (
                        <img
                          src={targetUser.avatar_url}
                          alt=""
                          className="w-full h-full rounded-full object-cover"
                        />
                      ) : (
                        <span>
                          {targetUser.display_name?.[0]?.toUpperCase() ||
                            targetUser.username?.[0]?.toUpperCase() ||
                            'U'}
                        </span>
                      )}
                    </div>
                    <span className={`truncate ${isSpeaking ? 'text-white font-semibold' : ''}`}>
                      {targetUser.display_name || targetUser.username || 'Usuário'}
                    </span>
                  </div>

                  {/* Voice state indicators */}
                  <div className="flex items-center gap-1 flex-shrink-0 opacity-70 group-hover/voice-member:opacity-100">
                    {vs.is_muted && (
                      <span title="Microfone Mutado">
                        <MicOff className="w-3 h-3 text-dnd" />
                      </span>
                    )}
                    {vs.is_deafened && (
                      <span title="Áudio Desativado">
                        <Headphones className="w-3 h-3 text-dnd" />
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <div
        onContextMenu={handleSidebarContextMenu}
        className="w-60 bg-background-darker flex flex-col h-full border-r border-black/20 select-none flex-shrink-0 relative"
      >
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
          <div className="relative z-30 flex-shrink-0">
            {/* Clickable Server Name Header */}
            <button
              type="button"
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              style={
                activeGuild?.banner_url
                  ? {
                      backgroundImage: `url(${activeGuild.banner_url})`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                    }
                  : undefined
              }
              className={`w-full px-4 border-b border-black/20 flex justify-between font-bold text-gray-100 shadow-sm transition-all group cursor-pointer text-left relative overflow-hidden ${
                activeGuild?.banner_url
                  ? 'h-36 pt-3.5 items-start hover:brightness-105'
                  : 'h-12 items-center hover:bg-white/5'
              }`}
            >
              {/* Gradient overlay for banner readability */}
              {activeGuild?.banner_url && (
                <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/35 to-transparent pointer-events-none" />
              )}

              <span className="truncate max-w-[170px] text-sm md:text-base font-bold text-white group-hover:text-gray-100 relative z-10 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                {activeGuild?.name || 'Servidor'}
              </span>
              <ChevronDown
                className={`w-4 h-4 text-gray-300 group-hover:text-white transition-transform duration-200 flex-shrink-0 relative z-10 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] ${
                  isDropdownOpen ? 'rotate-180 text-brand-400' : ''
                }`}
              />
            </button>

            {/* Dropdown Menu */}
            {isDropdownOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setIsDropdownOpen(false)} />
                <div
                  className={`absolute left-2 right-2 z-50 bg-background-darkest rounded-xl p-1.5 shadow-2xl border border-white/10 space-y-1 animate-in fade-in zoom-in-95 duration-100 ${
                    activeGuild?.banner_url ? 'top-38' : 'top-13'
                  }`}
                >
                  <button
                    onClick={() => {
                      setIsDropdownOpen(false);
                      onOpenInviteModal();
                    }}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold text-brand-400 hover:bg-brand-500/10 transition-colors cursor-pointer"
                  >
                    <span>Convidar Pessoas</span>
                    <UserPlus className="w-4 h-4" />
                  </button>

                  {isOwner && (
                    <>
                      <button
                        onClick={() => {
                          setIsDropdownOpen(false);
                          onOpenCreateChannel('text');
                        }}
                        className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold text-gray-300 hover:bg-white/5 transition-colors cursor-pointer"
                      >
                        <span>Criar Canal</span>
                        <Plus className="w-4 h-4" />
                      </button>

                      <button
                        onClick={() => {
                          setIsDropdownOpen(false);
                          onOpenCreateChannel('category');
                        }}
                        className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold text-gray-300 hover:bg-white/5 transition-colors cursor-pointer"
                      >
                        <span>Criar Categoria</span>
                        <FolderPlus className="w-4 h-4" />
                      </button>
                    </>
                  )}

                  {isOwner && onOpenServerSettings && (
                    <button
                      onClick={() => {
                        setIsDropdownOpen(false);
                        onOpenServerSettings();
                      }}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold text-gray-300 hover:bg-white/5 transition-colors cursor-pointer"
                    >
                      <span>Configurações do Servidor</span>
                      <Settings className="w-4 h-4" />
                    </button>
                  )}

                  {onOpenMemberList && (
                    <button
                      onClick={() => {
                        setIsDropdownOpen(false);
                        onOpenMemberList();
                      }}
                      className="w-full md:hidden flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold text-gray-300 hover:bg-white/5 transition-colors cursor-pointer"
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

        {/* Channels List Body */}
        <div className="flex-1 overflow-y-auto px-2 py-3 space-y-4 no-scrollbar">
          {!isHomeActive && (
            <>
              {/* 1. Root Channels (no category) */}
              {rootChannels.length > 0 && (
                <div className="space-y-0.5">
                  {rootChannels.map(renderChannelItem)}
                </div>
              )}

              {/* 2. Categorized Channels */}
              {categories.map((category) => {
                const isCollapsed = !!collapsedCategories[category.id];
                const childChannels = categoryChannelsMap[category.id] || [];
                const isDragOverCategory = dragOverTarget?.id === category.id && dragOverTarget.isCategory;

                return (
                  <div
                    key={category.id}
                    onDragOver={(e) => {
                      if (!isOwner || !draggedChannelId) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                      setDragOverTarget({ id: category.id, isCategory: true });
                    }}
                    onDragLeave={() => {
                      if (dragOverTarget?.id === category.id) {
                        setDragOverTarget(null);
                      }
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      handleDropOnCategory(category);
                    }}
                    className={`space-y-0.5 rounded-lg transition-colors ${
                      isDragOverCategory ? 'bg-brand-500/10 ring-1 ring-brand-500/40 p-1' : ''
                    }`}
                  >
                    {/* Category Header */}
                    <div
                      onContextMenu={(e) => handleCategoryContextMenu(e, category)}
                      className="flex items-center justify-between px-1 py-1 group text-xs font-bold text-gray-400 uppercase tracking-wider hover:text-gray-200 cursor-pointer rounded transition-colors"
                      onClick={() => toggleCategoryCollapse(category.id)}
                    >
                      <div className="flex items-center gap-1 truncate min-w-0">
                        {isCollapsed ? (
                          <ChevronRight className="w-3.5 h-3.5 text-gray-400 flex-shrink-0 transition-transform" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5 text-gray-400 flex-shrink-0 transition-transform" />
                        )}
                        <span className="truncate">{category.name}</span>
                      </div>

                      {isOwner && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenCreateChannel('text', category.id);
                          }}
                          className="p-1 opacity-0 group-hover:opacity-100 hover:text-white transition-opacity"
                          title="Criar Canal na Categoria"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Category Child Channels */}
                    {!isCollapsed && (
                      <div className="space-y-0.5 pl-1">
                        {childChannels.map(renderChannelItem)}
                        {childChannels.length === 0 && (
                          <div className="px-2 py-1 text-[11px] text-gray-500 italic">
                            Nenhum canal nesta categoria
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Empty State when server has no channels */}
              {channels.length === 0 && (
                <div className="text-center py-6 px-3">
                  <p className="text-xs text-gray-400 mb-2">Nenhum canal criado ainda.</p>
                  {isOwner && (
                    <button
                      onClick={() => onOpenCreateChannel('text')}
                      className="text-xs text-brand-400 hover:underline font-semibold"
                    >
                      + Criar primeiro canal
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* User Status Bar */}
        <UserBar onOpenSettings={onOpenSettings} onOpenScreenShare={onOpenScreenShare} />
      </div>

      {/* Context Menu Component */}
      <ContextMenu menu={menu} onClose={closeContextMenu} />
    </>
  );
};
