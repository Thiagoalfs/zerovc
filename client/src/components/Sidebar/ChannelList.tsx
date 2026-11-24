import React, { useState, useEffect } from 'react';
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
  PhoneForwarded,
  Monitor,
  Copy,
} from 'lucide-react';
import { Channel, User, Permissions, VoiceSession } from '../../types';
import {
  Dropdown,
  DropdownTrigger,
  DropdownContent,
  DropdownItem,
} from '@/components/ui/r-dropdown';
import { useGuildStore } from '../../stores/guildStore';
import { useVoiceStore } from '../../stores/voiceStore';
import { useAuthStore } from '../../stores/authStore';
import { useDMStore } from '../../stores/dmStore';
import { api, formatAssetUrl } from '../../lib/api';
import { copyToClipboard } from '../../utils/clipboard';
import { useSettingsStore } from '../../stores/settingsStore';
import { UserBar } from './UserBar';
import { SidebarResizer } from './SidebarResizer';
import { ContextMenu, useContextMenu, ContextMenuItem } from '../ContextMenu';
import { useUserContextMenu } from '../../hooks/useUserContextMenu';
import { useGuildPermissions } from '../../hooks/useGuildPermissions';
import {
  canUserViewChannel,
  canUserManageChannel,
  canUserMuteVoice,
  canUserDeafenVoice,
} from '../../utils/userActivity';
import { HeadphonesOff } from '../Common/HeadphonesOff';
import { getFormattedUsername, useStreamerModeStore } from '../../stores/streamerModeStore';
import { DeleteChannelModal } from '../Modals/DeleteChannelModal';
import { showConfirm } from '../../stores/confirmModalStore';

interface ChannelListProps {
  isHomeActive: boolean;
  onSelectChannel?: (channel: Channel) => void;
  onOpenCreateChannel: (type?: 'text' | 'voice', categoryId?: string) => void;
  onOpenCreateCategory: () => void;
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
  onOpenCreateCategory,
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
  useStreamerModeStore((s) => s.enabled && s.censorUsernames);
  const {
    activeGuild,
    activeChannel,
    selectChannel,
    unreadChannels,
    channelMentions,
    markChannelAsRead,
    reorderChannels,
    deleteChannel,
    deleteGuild,
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
    isConnecting,
    speakingUserIds,
    userVolumes,
    streamVolumes,
    setUserVolume,
    setStreamVolume,
  } = useVoiceStore();
  const channelListWidth = useSettingsStore((s) => s.channelListWidth);

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});
  const [draggedChannelId, setDraggedChannelId] = useState<string | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<{
    id: string;
    isCategory?: boolean;
    isRoot?: boolean;
    position?: 'top' | 'bottom';
  } | null>(null);

  const { menu, openContextMenu, closeContextMenu } = useContextMenu();
  const { menu: userMenu, closeContextMenu: closeUserContextMenu, handleUserContextMenu } = useUserContextMenu();
  const [channelToDelete, setChannelToDelete] = useState<Channel | null>(null);
  const [isDeletingChannel, setIsDeletingChannel] = useState(false);

  const handleConfirmDeleteChannel = async () => {
    if (!channelToDelete) return;
    setIsDeletingChannel(true);
    try {
      await deleteChannel(channelToDelete.id);
      setChannelToDelete(null);
    } catch (err) {
      console.error('Failed to delete channel/category:', err);
    } finally {
      setIsDeletingChannel(false);
    }
  };

  const perms = useGuildPermissions(activeGuild);
  const isOwner = perms.isCurrentOwner;
  const canManageChannels = isOwner || perms.hasAdmin || perms.canManageChannels;
  const canManageServer = isOwner || perms.hasAdmin || perms.canManageGuild;
  const channels = activeGuild?.channels || [];
  const draggedChannel = draggedChannelId ? channels.find((c) => c.id === draggedChannelId) : null;

  // Group channels with stable position ordering
  const categories = channels
    .filter((c) => c.type === 'category')
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const rootChannels = channels
    .filter((c) => c.type !== 'category' && !c.category_id && canUserViewChannel(c, activeGuild, user))
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const categoryChannelsMap: Record<string, Channel[]> = {};

  categories.forEach((cat) => {
    categoryChannelsMap[cat.id] = channels
      .filter((c) => c.category_id === cat.id && canUserViewChannel(c, activeGuild, user))
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  });

  const toggleCategoryCollapse = (categoryId: string) => {
    setCollapsedCategories((prev) => ({
      ...prev,
      [categoryId]: !prev[categoryId],
    }));
  };

  const [voiceElapsedSeconds, setVoiceElapsedSeconds] = useState(0);
  useEffect(() => {
    if (!isConnected || !currentChannelId) {
      setVoiceElapsedSeconds(0);
      return;
    }
    const startedAt = Date.now();
    setVoiceElapsedSeconds(0);
    const interval = setInterval(() => {
      setVoiceElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [isConnected, currentChannelId]);

  const formatCallDuration = (totalSeconds: number) => {
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    return hrs > 0 ? `${hrs}:${pad(mins)}:${pad(secs)}` : `${mins}:${pad(secs)}`;
  };

  const handleChannelClick = (channel: Channel) => {
    selectChannel(channel);
    if (onSelectChannel) onSelectChannel(channel);
    onCloseMobileDrawer?.();
  };

  const handleVoiceChannelClick = (channel: Channel) => {
    selectChannel(channel);
    if (onSelectChannel) onSelectChannel(channel);
    if (currentChannelId !== channel.id || (!isConnected && !isConnecting)) {
      joinVoice(channel.id, channel.guild_id || activeGuild?.id);
    }
    onCloseMobileDrawer?.();
  };

  // Drag and Drop Logic
  const handleDropOnChannel = (targetChannel: Channel, dropPosition: 'top' | 'bottom') => {
    if (!canManageChannels || !activeGuild || !draggedChannelId || draggedChannelId === targetChannel.id) {
      setDraggedChannelId(null);
      setDragOverTarget(null);
      return;
    }

    const dragged = channels.find((c) => c.id === draggedChannelId);
    if (!dragged) return;

    const newCategoryId = targetChannel.category_id;
    const isMovingToRoot = !newCategoryId;

    // Filter relevant list of sibling channels
    const siblingChannels = channels
      .filter((c) =>
        isMovingToRoot ? !c.category_id && c.type !== 'category' : c.category_id === newCategoryId
      )
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

    const filtered = siblingChannels.filter((c) => c.id !== dragged.id);
    const targetIdx = filtered.findIndex((c) => c.id === targetChannel.id);

    let insertIdx = targetIdx;
    if (targetIdx === -1) {
      insertIdx = filtered.length;
    } else if (dropPosition === 'bottom') {
      insertIdx = targetIdx + 1;
    }

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
    if (!canManageChannels || !activeGuild || !draggedChannelId) {
      setDraggedChannelId(null);
      setDragOverTarget(null);
      return;
    }

    const dragged = channels.find((c) => c.id === draggedChannelId);
    if (!dragged || dragged.type === 'category') return;

    const childChannels = (categoryChannelsMap[category.id] || [])
      .filter((c) => c.id !== dragged.id)
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

    // Place at the top of the category
    childChannels.unshift({ ...dragged, category_id: category.id });

    const reorderedPayload = childChannels.map((c, idx) => ({
      id: c.id,
      position: idx,
      category_id: category.id,
      clear_category: false,
    }));

    reorderChannels(activeGuild.id, reorderedPayload);
    setDraggedChannelId(null);
    setDragOverTarget(null);
  };

  const handleDropOnRoot = (position: 'top' | 'bottom' = 'bottom') => {
    if (!canManageChannels || !activeGuild || !draggedChannelId) {
      setDraggedChannelId(null);
      setDragOverTarget(null);
      return;
    }

    const dragged = channels.find((c) => c.id === draggedChannelId);
    if (!dragged || dragged.type === 'category') return;

    const rootList = channels
      .filter((c) => !c.category_id && c.type !== 'category' && c.id !== dragged.id)
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

    if (position === 'top') {
      rootList.unshift({ ...dragged, category_id: undefined });
    } else {
      rootList.push({ ...dragged, category_id: undefined });
    }

    const reorderedPayload = rootList.map((c, idx) => ({
      id: c.id,
      position: idx,
      clear_category: true,
    }));

    reorderChannels(activeGuild.id, reorderedPayload);
    setDraggedChannelId(null);
    setDragOverTarget(null);
  };

  // Right-Click Context Menus
  const handleChannelContextMenu = (e: React.MouseEvent, channel: Channel) => {
    e.preventDefault();
    e.stopPropagation();
    const isText = channel.type === 'text';
    const isUnread = isText && (unreadChannels.has(channel.id) || (channelMentions[channel.id] || 0) > 0);
    const canManageThisChannel = canUserManageChannel(channel, activeGuild, user);

    const items: ContextMenuItem[] = [
      ...(isText
        ? [
            {
              id: 'mark-channel-read',
              label: 'Marcar como Lido',
              icon: <CheckCheck className="w-4 h-4" />,
              disabled: !isUnread,
              onClick: () => markChannelAsRead(channel.id),
            },
            { label: '', separator: true },
          ]
        : []),
      ...(canManageThisChannel
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
                setChannelToDelete(channel);
              },
            },
          ]
        : []),
      { label: '', separator: true },
      {
        label: 'Copiar ID do Canal',
        icon: <Copy className="w-4 h-4" />,
        onClick: () => {
          copyToClipboard(channel.id);
        },
      },
    ];

    if (items.length > 0) {
      openContextMenu(e, items, `#${channel.name}`);
    }
  };

  const handleCategoryContextMenu = (e: React.MouseEvent, category: Channel) => {
    e.preventDefault();
    e.stopPropagation();
    const isCollapsed = !!collapsedCategories[category.id];
    const catChannels = categoryChannelsMap[category.id] || [];
    const isCatUnread = catChannels.some(
      (c) => c.type === 'text' && (unreadChannels.has(c.id) || (channelMentions[c.id] || 0) > 0)
    );
    const canManageThisCat = canUserManageChannel(category, activeGuild, user);

    const items: ContextMenuItem[] = [
      {
        id: 'mark-category-read',
        label: 'Marcar como Lido',
        icon: <CheckCheck className="w-4 h-4" />,
        disabled: !isCatUnread,
        onClick: () => {
          catChannels.forEach((c) => {
            if (c.type === 'text') {
              markChannelAsRead(c.id);
            }
          });
        },
      },
      { label: '', separator: true },
      {
        label: isCollapsed ? 'Expandir Categoria' : 'Colapsar Categoria',
        icon: isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />,
        onClick: () => toggleCategoryCollapse(category.id),
      },
      ...(canManageThisCat
        ? [
            {
              label: 'Criar Canal',
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
                setChannelToDelete(category);
              },
            },
          ]
        : []),
      { label: '', separator: true },
      {
        label: 'Copiar ID da Categoria',
        icon: <Copy className="w-4 h-4" />,
        onClick: () => {
          copyToClipboard(category.id);
        },
      },
    ];

    openContextMenu(e, items, category.name);
  };

  const handleSidebarContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!canManageChannels) return;

    const items: ContextMenuItem[] = [
      {
        label: 'Criar Canal',
        icon: <Plus className="w-4 h-4" />,
        onClick: () => onOpenCreateChannel('text'),
      },
      {
        label: 'Criar Categoria',
        icon: <FolderPlus className="w-4 h-4" />,
        onClick: () => onOpenCreateCategory(),
      },
    ];

    openContextMenu(e, items);
  };

  const handleVoiceMemberContextMenu = (
    e: React.MouseEvent,
    channel: Channel,
    vs: any,
    targetMember: User
  ) => {
    if (!activeGuild || !user) return;
    handleUserContextMenu(e, targetMember, {
      onOpenUserProfile: onSelectUser,
      onOpenDM,
      isVoiceActive: Boolean(isConnected && currentChannelId === channel.id),
      isVoiceMuted: Boolean(vs.server_muted),
      isVoiceDeafened: Boolean(vs.server_deafened),
      isScreenSharing: Boolean(vs.is_screensharing),
      voiceChannelId: channel.id,
      contextType: 'guild',
    });
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
    const isDragOverTop = isDragOver && dragOverTarget?.position === 'top';
    const isDragOverBottom = isDragOver && dragOverTarget?.position === 'bottom';
    const canManageThisChannel = canUserManageChannel(channel, activeGuild, user);

    return (
      <div key={channel.id} className="space-y-0.5 relative">
        {/* Top drop indicator bar */}
        {isDragOverTop && (
          <div className="absolute -top-[2px] left-1 right-1 h-[2px] bg-brand-500 rounded-full z-30 pointer-events-none shadow-[0_0_8px_rgba(99,102,241,1)]">
            <div className="absolute -left-1 -top-[3px] w-2 h-2 rounded-full bg-brand-500 shadow-sm" />
          </div>
        )}

        {/* Bottom drop indicator bar */}
        {isDragOverBottom && (
          <div className="absolute -bottom-[2px] left-1 right-1 h-[2px] bg-brand-500 rounded-full z-30 pointer-events-none shadow-[0_0_8px_rgba(99,102,241,1)]">
            <div className="absolute -left-1 -top-[3px] w-2 h-2 rounded-full bg-brand-500 shadow-sm" />
          </div>
        )}

        <div
          draggable={canManageThisChannel}
          onDragStart={(e) => {
            if (!canManageThisChannel) {
              e.preventDefault();
              return;
            }
            e.dataTransfer.setData('text/plain', channel.id);
            e.dataTransfer.effectAllowed = 'move';
            setDraggedChannelId(channel.id);
          }}
          onDragOver={(e) => {
            if (!canManageChannels || !draggedChannelId) return;
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = 'move';

            if (draggedChannelId === channel.id) {
              if (dragOverTarget) setDragOverTarget(null);
              return;
            }

            const rect = e.currentTarget.getBoundingClientRect();
            const midY = rect.top + rect.height / 2;
            const position: 'top' | 'bottom' = e.clientY < midY ? 'top' : 'bottom';

            if (dragOverTarget?.id !== channel.id || dragOverTarget?.position !== position) {
              setDragOverTarget({ id: channel.id, position });
            }
          }}
          onDragLeave={(e) => {
            const related = e.relatedTarget as Node | null;
            if (related && e.currentTarget.contains(related)) {
              return;
            }
            if (dragOverTarget?.id === channel.id) {
              setDragOverTarget(null);
            }
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!canManageChannels || !draggedChannelId || draggedChannelId === channel.id) return;
            let pos = dragOverTarget?.position;
            if (!pos) {
              const rect = e.currentTarget.getBoundingClientRect();
              const midY = rect.top + rect.height / 2;
              pos = e.clientY < midY ? 'top' : 'bottom';
            }
            handleDropOnChannel(channel, pos);
          }}
          onDragEnd={() => {
            setDraggedChannelId(null);
            setDragOverTarget(null);
          }}
          onContextMenu={(e) => handleChannelContextMenu(e, channel)}
          className={`group flex items-center justify-between px-2 py-1.5 rounded-lg text-[14px] transition-all relative ${
            canManageThisChannel ? 'cursor-grab active:cursor-grabbing' : ''
          } ${isDragging ? 'opacity-30 scale-[0.98]' : ''} ${
            isInThisVoice
              ? 'bg-white/[0.07] text-white font-semibold'
              : isActive
              ? 'bg-white/[0.08] text-white font-medium'
              : isUnread
              ? 'text-white font-semibold hover:bg-white/[0.04]'
              : 'text-gray-400 hover:bg-white/[0.04] hover:text-gray-200'
          }`}
        >
          {/* Left white indicator dot for unread */}
          {isUnread && (
            <div className="absolute -left-1 w-1.5 h-2 rounded-r-full bg-white shadow-sm" />
          )}

          <div
            role="button"
            tabIndex={0}
            onClick={() => (isText ? handleChannelClick(channel) : handleVoiceChannelClick(channel))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                isText ? handleChannelClick(channel) : handleVoiceChannelClick(channel);
              }
            }}
            className="flex items-center gap-2 truncate flex-1 text-left min-w-0 cursor-pointer select-none"
          >
            {isText ? (
              <Hash className={`w-[18px] h-[18px] flex-shrink-0 pointer-events-none ${isUnread || isActive ? 'text-gray-200' : 'text-gray-500 group-hover:text-gray-300'}`} />
            ) : (
              <Volume2
                className={`w-[18px] h-[18px] flex-shrink-0 pointer-events-none ${isInThisVoice ? 'text-online' : 'text-gray-500 group-hover:text-gray-300'}`}
              />
            )}
            <span className={`truncate pointer-events-none ${isInThisVoice || isUnread || isActive ? 'text-white font-semibold' : 'text-gray-400 group-hover:text-gray-200 font-medium'}`}>
              {channel.name}
            </span>
            {channel.is_private && (
              <span className="pointer-events-none">
                <Lock className="w-3 h-3 text-gray-500 flex-shrink-0 ml-0.5" />
              </span>
            )}
          </div>

          {/* Live Call Duration Timer when connected to this voice channel */}
          {isInThisVoice && (
            <span className="ml-1.5 text-xs font-medium text-online tabular-nums flex-shrink-0">
              {formatCallDuration(voiceElapsedSeconds)}
            </span>
          )}

          {/* Unread Dot / Mention Badge on the Right */}
          {!isActive && (
            <>
              {mentionCount > 0 ? (
                <div
                  className="ml-1.5 px-1 min-w-[18px] h-[18px] bg-dnd text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow-sm flex-shrink-0 animate-in zoom-in-50"
                >
                  {mentionCount > 9 ? '9+' : mentionCount}
                </div>
              ) : isUnread ? (
                <div
                  className="ml-1.5 w-2 h-2 rounded-full bg-white flex-shrink-0 shadow-sm animate-in zoom-in-50"
                />
              ) : null}
            </>
          )}

          {canManageThisChannel && onOpenChannelSettings && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onOpenChannelSettings(channel);
              }}
              className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-white p-0.5 rounded transition-opacity ml-1"
              aria-label="Configurações do Canal"
            >
              <Settings className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Connected Voice Members */}
        {(() => {
          if (isText) return null;

          let voiceSessions = channel.voice_sessions || [];

          // Optimistic inclusion: If current user is connected to this voice channel,
          // ensure they are displayed even if the socket/backend update was delayed
          if (user && isConnected && currentChannelId === channel.id) {
            const userAlreadyPresent = voiceSessions.some((s) => s.user_id === user.id);
            if (!userAlreadyPresent) {
              const currentGuildMember = activeGuild?.members?.find((m) => m.id === user.id);
              const selfSession: VoiceSession = {
                id: `self-${user.id}-${channel.id}`,
                channel_id: channel.id,
                user_id: user.id,
                is_muted: useVoiceStore.getState().isMuted,
                is_deafened: useVoiceStore.getState().isDeafened,
                is_screensharing: useVoiceStore.getState().isScreensharing,
                joined_at: new Date().toISOString(),
                user: {
                  ...user,
                  display_name: currentGuildMember?.display_name || user.display_name,
                  avatar_url: currentGuildMember?.avatar_url || user.avatar_url,
                  roles: currentGuildMember?.roles || user.roles || [],
                },
              };
              voiceSessions = [...voiceSessions, selfSession];
            }
          }

          if (voiceSessions.length === 0) return null;

          return (
            <div className="pl-7 pr-1.5 py-1 space-y-0.5">
              {voiceSessions.map((vs) => {
                const effectiveMuted = vs.is_muted || Boolean(vs.server_muted);
                const effectiveDeafened = vs.is_deafened || Boolean(vs.server_deafened);
                const isSpeaking = speakingUserIds.includes(vs.user_id) && !effectiveMuted && !effectiveDeafened;
                const guildMember = activeGuild?.members?.find((m) => m.id === vs.user_id);
                const targetUser: User = {
                  id: vs.user_id,
                  username: guildMember?.username || vs.user?.username || 'Usuário',
                  display_name: guildMember?.display_name || vs.user?.display_name || '',
                  avatar_url: guildMember?.avatar_url || vs.user?.avatar_url || '',
                  status: guildMember?.status || vs.user?.status || 'online',
                  roles: guildMember?.roles || vs.user?.roles || [],
                };

                return (
                  <div
                    key={vs.id || vs.user_id}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectUser?.(targetUser, { x: e.clientX, y: e.clientY });
                    }}
                    onContextMenu={(e) => handleVoiceMemberContextMenu(e, channel, vs, targetUser)}
                    className="flex items-center justify-between py-1 px-2 rounded-lg hover:bg-white/[0.04] text-[13.5px] text-gray-400 cursor-pointer transition-colors group/voice-member"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <div
                        style={
                          isSpeaking
                            ? { boxShadow: '0 0 0 2px #23a55a' }
                            : undefined
                        }
                        className="w-6 h-6 rounded-full bg-brand-500 flex items-center justify-center text-[10px] font-bold text-white transition-all flex-shrink-0 overflow-hidden"
                      >
                        {targetUser.avatar_url ? (
                          <img
                            src={formatAssetUrl(targetUser.avatar_url)}
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
                      <span className={`truncate font-medium ${isSpeaking ? 'text-white font-semibold' : 'text-gray-400 group-hover/voice-member:text-gray-200'}`}>
                        {getFormattedUsername(targetUser.display_name || targetUser.username || 'Usuário')}
                      </span>
                    </div>

                    {/* Voice state indicators */}
                    <div className="flex items-center gap-1.5 flex-shrink-0 opacity-70 group-hover/voice-member:opacity-100">
                      {vs.is_screensharing && (
                        <span
                          className="bg-[#f23f43] text-white text-[9px] font-black px-1.5 py-0.5 rounded flex items-center leading-none tracking-wider uppercase shadow-sm"
                        >
                          LIVE
                        </span>
                      )}
                      {(vs.is_muted || vs.server_muted) && (
                        <span>
                          <MicOff className="w-3 h-3 text-dnd" />
                        </span>
                      )}
                      {(vs.is_deafened || vs.server_deafened) && (
                        <span>
                          <HeadphonesOff className="w-3 h-3 text-dnd" />
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>
    );
  };

  return (
    <>
      <div
        onContextMenu={handleSidebarContextMenu}
        style={{
          width: typeof window !== 'undefined' && window.innerWidth < 768 ? 'calc(100vw - 72px)' : `${channelListWidth}px`,
        }}
        className="bg-background-darker flex flex-col h-full border-r border-black/20 select-none flex-1 md:flex-none relative"
      >
        {/* Server Header or Home Header */}
        {isHomeActive ? (
          <div className="h-14 md:h-12 px-4 border-b border-black/20 flex items-center justify-between font-bold text-gray-100 shadow-sm flex-shrink-0">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 md:w-4 md:h-4 text-brand-500" />
              <span className="truncate text-[17px] md:text-base">Painel de Amigos</span>
            </div>
            {onCloseMobileDrawer && (
              <button
                onClick={onCloseMobileDrawer}
                className="md:hidden text-gray-400 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            )}
          </div>
        ) : (
          <div className="relative z-30 flex-shrink-0">
            {/* Server Name Header */}
            <div
              style={
                activeGuild?.banner_url
                  ? {
                      backgroundImage: `url(${formatAssetUrl(activeGuild.banner_url)})`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                    }
                  : undefined
              }
              className={`w-full px-3 md:px-3.5 border-b border-black/20 flex justify-between font-bold text-gray-100 shadow-sm relative overflow-hidden ${
                activeGuild?.banner_url
                  ? 'h-36 pt-3 items-start'
                  : 'h-14 md:h-12 items-center'
              }`}
            >
              {/* Gradient overlay for banner readability */}
              {activeGuild?.banner_url && (
                <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/35 to-transparent pointer-events-none" />
              )}

              {/* Clickable Server Name + Dropdown Trigger */}
              <Dropdown
                variant="action"
                open={isDropdownOpen}
                onOpenChange={setIsDropdownOpen}
                className="min-w-0 max-w-[calc(100%-36px)] relative z-10"
              >
                <DropdownTrigger
                  className="h-auto w-auto max-w-full border-0 bg-transparent px-2 py-1.5 shadow-none hover:bg-white/5 text-white min-w-0 data-[state=open]:bg-white/10 data-[state=open]:ring-0 focus-visible:ring-1"
                  aria-label="Opções do Servidor"
                >
                  <span className="truncate text-[17px] md:text-base font-bold text-white">
                    {activeGuild?.name || 'Servidor'}
                  </span>
                </DropdownTrigger>

                <DropdownContent align="start" side="bottom" sideOffset={6} className="w-56 z-50">
                  <DropdownItem
                    onClick={onOpenInviteModal}
                    className="text-brand-400 font-semibold"
                  >
                    <span className="flex w-full items-center justify-between gap-2">
                      <span>Convidar Pessoas</span>
                      <UserPlus className="w-4 h-4 flex-shrink-0" />
                    </span>
                  </DropdownItem>

                  {canManageChannels && (
                    <>
                      <DropdownItem onClick={() => onOpenCreateChannel('text')}>
                        <span className="flex w-full items-center justify-between gap-2">
                          <span>Criar Canal</span>
                          <Plus className="w-4 h-4 flex-shrink-0" />
                        </span>
                      </DropdownItem>

                      <DropdownItem onClick={onOpenCreateCategory}>
                        <span className="flex w-full items-center justify-between gap-2">
                          <span>Criar Categoria</span>
                          <FolderPlus className="w-4 h-4 flex-shrink-0" />
                        </span>
                      </DropdownItem>
                    </>
                  )}

                  {canManageServer && onOpenServerSettings && (
                    <DropdownItem onClick={onOpenServerSettings}>
                      <span className="flex w-full items-center justify-between gap-2">
                        <span>Configurações do Servidor</span>
                        <Settings className="w-4 h-4 flex-shrink-0" />
                      </span>
                    </DropdownItem>
                  )}

                  {onOpenMemberList && (
                    <DropdownItem
                      onClick={onOpenMemberList}
                      className="md:hidden"
                    >
                      <span className="flex w-full items-center justify-between gap-2">
                        <span>Membros ({activeGuild?.members?.length || 0})</span>
                        <Users className="w-4 h-4 flex-shrink-0" />
                      </span>
                    </DropdownItem>
                  )}
                </DropdownContent>
              </Dropdown>

              {/* Invite People Button */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenInviteModal();
                }}
                className="p-1.5 rounded-lg text-gray-300 hover:text-white hover:bg-white/10 transition-all cursor-pointer flex-shrink-0 relative z-10"
                aria-label="Convidar Pessoas"
              >
                <UserPlus className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Channels List Body */}
        <div className="flex-1 overflow-y-auto px-2 py-3 space-y-4 chat-scrollbar">
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
                const canManageThisCat = canUserManageChannel(category, activeGuild, user);
                const isDragOverCategoryHeaderTop = dragOverTarget?.id === category.id && dragOverTarget.position === 'top';
                const isDragOverCategory = dragOverTarget?.id === category.id && dragOverTarget.isCategory && !isDragOverCategoryHeaderTop;

                return (
                  <div key={category.id} className="space-y-0.5 rounded-lg relative">
                    {/* Category Header */}
                    <div
                      onDragOver={(e) => {
                        if (!canManageChannels || !draggedChannelId) return;
                        e.preventDefault();
                        e.stopPropagation();
                        e.dataTransfer.dropEffect = 'move';

                        const rect = e.currentTarget.getBoundingClientRect();
                        const isTop = e.clientY < rect.top + rect.height * 0.45;
                        if (isTop) {
                          if (dragOverTarget?.id !== category.id || dragOverTarget.position !== 'top') {
                            setDragOverTarget({ id: category.id, position: 'top', isRoot: true });
                          }
                        } else {
                          if (dragOverTarget?.id !== category.id || !dragOverTarget.isCategory || dragOverTarget.position) {
                            setDragOverTarget({ id: category.id, isCategory: true });
                          }
                        }
                      }}
                      onDragLeave={(e) => {
                        const related = e.relatedTarget as Node | null;
                        if (related && e.currentTarget.contains(related)) return;
                        if (dragOverTarget?.id === category.id) {
                          setDragOverTarget(null);
                        }
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (!canManageChannels || !draggedChannelId) return;
                        if (dragOverTarget?.position === 'top') {
                          handleDropOnRoot('top');
                        } else {
                          handleDropOnCategory(category);
                        }
                      }}
                      onContextMenu={(e) => handleCategoryContextMenu(e, category)}
                      className={`relative flex items-center justify-between px-2 py-1 group text-[13px] font-semibold cursor-pointer rounded-md transition-colors ${
                        isDragOverCategory
                          ? 'bg-brand-500/20 text-brand-300 ring-1 ring-brand-500/50'
                          : 'text-gray-400 hover:text-gray-200'
                      }`}
                      onClick={() => toggleCategoryCollapse(category.id)}
                    >
                      {/* Top drop indicator bar for dropping into root above this category */}
                      {isDragOverCategoryHeaderTop && (
                        <div className="absolute -top-[2px] left-0 right-0 h-[2px] bg-brand-500 rounded-full z-30 pointer-events-none shadow-[0_0_8px_rgba(99,102,241,1)]">
                          <div className="absolute -left-1 -top-[3px] w-2 h-2 rounded-full bg-brand-500 shadow-sm" />
                        </div>
                      )}

                      <div className="flex items-center gap-1 truncate min-w-0 pointer-events-none">
                        <span className="truncate">{category.name}</span>
                        {isCollapsed ? (
                          <ChevronRight className="w-3.5 h-3.5 text-gray-500 flex-shrink-0 transition-transform" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5 text-gray-500 flex-shrink-0 transition-transform" />
                        )}
                      </div>

                      {canManageThisCat && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenCreateChannel('text', category.id);
                          }}
                          className="p-1 text-gray-400 opacity-70 group-hover:opacity-100 hover:text-white transition-opacity"
                          aria-label="Criar Canal na Categoria"
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
                          <div
                            onDragOver={(e) => {
                              if (!canManageChannels || !draggedChannelId) return;
                              e.preventDefault();
                              e.stopPropagation();
                              e.dataTransfer.dropEffect = 'move';
                              if (dragOverTarget?.id !== category.id || !dragOverTarget.isCategory) {
                                setDragOverTarget({ id: category.id, isCategory: true });
                              }
                            }}
                            onDragLeave={(e) => {
                              const related = e.relatedTarget as Node | null;
                              if (related && e.currentTarget.contains(related)) return;
                              if (dragOverTarget?.id === category.id && dragOverTarget.isCategory) {
                                setDragOverTarget(null);
                              }
                            }}
                            onDrop={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (!canManageChannels) return;
                              handleDropOnCategory(category);
                            }}
                            className={`px-2 py-1.5 text-[11px] italic rounded border border-dashed transition-colors ${
                              isDragOverCategory
                                ? 'border-brand-500 bg-brand-500/10 text-brand-300'
                                : 'border-transparent text-gray-500'
                            }`}
                          >
                            Nenhum canal nesta categoria (solte aqui)
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Bottom drop target for dropping into root below all categories */}
              {canManageChannels && draggedChannelId && (
                <div
                  onDragOver={(e) => {
                    if (!canManageChannels || !draggedChannelId) return;
                    e.preventDefault();
                    e.stopPropagation();
                    e.dataTransfer.dropEffect = 'move';
                    if (dragOverTarget?.id !== 'root-bottom') {
                      setDragOverTarget({ id: 'root-bottom', isRoot: true, position: 'bottom' });
                    }
                  }}
                  onDragLeave={(e) => {
                    const related = e.relatedTarget as Node | null;
                    if (related && e.currentTarget.contains(related)) return;
                    if (dragOverTarget?.id === 'root-bottom') {
                      setDragOverTarget(null);
                    }
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!canManageChannels) return;
                    handleDropOnRoot('bottom');
                  }}
                  className="relative min-h-[48px] flex-1 cursor-default py-2"
                >
                  {dragOverTarget?.id === 'root-bottom' && (
                    <div className="absolute top-2 left-1 right-1 h-[2px] bg-brand-500 rounded-full z-30 pointer-events-none shadow-[0_0_8px_rgba(99,102,241,1)]">
                      <div className="absolute -left-1 -top-[3px] w-2 h-2 rounded-full bg-brand-500 shadow-sm" />
                    </div>
                  )}
                </div>
              )}

              {/* Empty State when server has no channels */}
              {channels.length === 0 && (
                <div className="text-center py-6 px-3">
                  <p className="text-xs text-gray-400 mb-2">Nenhum canal criado ainda.</p>
                  {canManageChannels && (
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

        {/* Resizer Handle */}
        <SidebarResizer />
      </div>

      {/* Context Menu Component */}
      <ContextMenu menu={menu} onClose={closeContextMenu} />
      <ContextMenu menu={userMenu} onClose={closeUserContextMenu} />

      {/* Floating Modal for Channel/Category Deletion Confirmation */}
      <DeleteChannelModal
        isOpen={Boolean(channelToDelete)}
        onClose={() => setChannelToDelete(null)}
        onConfirm={handleConfirmDeleteChannel}
        channel={channelToDelete}
        isDeleting={isDeletingChannel}
      />
    </>
  );
};
