import React, { useState, useRef, useEffect } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Pencil,
  Trash2,
  Smile,
  Reply,
  Pin,
  CornerDownRight,
  User as UserIcon,
  MessageSquare,
  Copy,
  Shield,
  VolumeX,
  UserMinus,
  Ban,
  Check,
  UserX,
  Star,
} from 'lucide-react';
import { Message, User, Permissions } from '../../types';
import { useAuthStore } from '../../stores/authStore';
import { useGuildStore } from '../../stores/guildStore';
import { useDMStore } from '../../stores/dmStore';
import { useFavoriteGifStore } from '../../stores/favoriteGifStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { api, getApiBaseUrl, formatAssetUrl } from '../../lib/api';
import { ContextMenu, useContextMenu, ContextMenuItem } from '../ContextMenu';
import { UserVolumeSlider } from '../Voice/VolumeSliders';
import { FormattedMessage } from './FormattedMessage';
import { GifEmbed } from './GifEmbed';
import { DeleteMessageModal } from '../Modals/DeleteMessageModal';
import { AlertCircle, RotateCcw } from 'lucide-react';
import { hapticLight, hapticMedium, hapticSuccess } from '../../lib/haptics';

interface MessageItemProps {
  message: Message;
  isCompact?: boolean;
  isEditing?: boolean;
  onStartEdit?: () => void;
  onStopEdit?: () => void;
  onOpenUserProfile?: (user: User, position?: { x: number; y: number }) => void;
  onOpenDM?: (userId: string) => void;
  onPreviewImage?: (url: string) => void;
  onReply?: (message: Message) => void;
  onImageLoad?: () => void;
}

const QUICK_EMOJIS = ['👍', '❤️', '🔥', '😂', '🎉', '👀', '✨', '💀'];

export const MessageItem: React.FC<MessageItemProps> = ({
  message,
  isCompact = false,
  isEditing: propIsEditing,
  onStartEdit,
  onStopEdit,
  onOpenUserProfile,
  onOpenDM,
  onPreviewImage,
  onReply,
  onImageLoad,
}) => {
  const { user } = useAuthStore();
  const {
    activeGuild,
    editMessage,
    deleteMessage,
    toggleReaction,
    togglePin,
    kickMember,
    banMember,
    muteMember,
    assignRole,
    removeRole,
    sendMessage,
    removeMessageFromStore,
  } = useGuildStore();
  const { openDMWithUser } = useDMStore();
  const { isFavorited, toggleFavorite } = useFavoriteGifStore();
  const { menu, openContextMenu, closeContextMenu } = useContextMenu();
  const chatDensity = useSettingsStore((s) => s.chatDensity);
  const isDensityCompact = chatDensity === 'compact';

  const [localIsEditing, setLocalIsEditing] = useState(false);
  const isEditing = propIsEditing !== undefined ? propIsEditing : localIsEditing;

  const setIsEditing = (val: boolean) => {
    setLocalIsEditing(val);
    if (val) {
      onStartEdit?.();
    } else {
      onStopEdit?.();
    }
  };

  const [editContent, setEditContent] = useState(message.content);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const editInputRef = useRef<HTMLTextAreaElement>(null);

  const handleRetrySend = async () => {
    removeMessageFromStore(message.id);
    await sendMessage(message.content, message.reply_to_id);
  };

  // Sync editContent with message.content whenever edit mode is opened
  useEffect(() => {
    if (isEditing) {
      setEditContent(message.content);
    }
  }, [isEditing, message.content]);

  const isAuthor = user?.id === message.author_id;
  const isOwner = activeGuild?.owner_id === user?.id;
  const canDelete = isAuthor || isOwner;

  const currentUserRoles = (activeGuild?.members?.find((m) => m.id === user?.id)?.roles || []);

  const isMentioned =
    user &&
    (message.content.includes(`@${user.username}`) ||
      (user.display_name && message.content.includes(`@${user.display_name}`)) ||
      message.content.includes('@everyone') ||
      message.content.includes('@here') ||
      currentUserRoles.some((r) => message.content.includes(`@${r.name}`)));

  const formattedTime = (() => {
    try {
      return format(new Date(message.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR });
    } catch {
      return '';
    }
  })();

  const shortTime = (() => {
    try {
      return format(new Date(message.created_at), 'HH:mm', { locale: ptBR });
    } catch {
      return '';
    }
  })();

  useEffect(() => {
    if (isEditing && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.setSelectionRange(editContent.length, editContent.length);
    }
  }, [isEditing]);

  const handleSaveEdit = async () => {
    if (!editContent.trim()) return;
    if (editContent.trim() === message.content) {
      setIsEditing(false);
      return;
    }

    try {
      await editMessage(message.id, editContent.trim());
      setIsEditing(false);
    } catch (err) {
      console.error('Failed to save message edit:', err);
    }
  };

  const handleCancelEdit = () => {
    setEditContent(message.content);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSaveEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancelEdit();
    }
  };

  const handleDelete = async () => {
    try {
      setIsDeleting(true);
      await deleteMessage(message.id);
    } catch (err) {
      console.error('Failed to delete message:', err);
      setIsDeleting(false);
    }
  };

  const handleUserContextMenu = (e: React.MouseEvent, targetUser: User) => {
    e.preventDefault();
    e.stopPropagation();

    const isMe = targetUser.id === user?.id;
    const isTargetOwner = activeGuild ? targetUser.id === activeGuild.owner_id : false;
    const isCurrentOwner = activeGuild ? activeGuild.owner_id === user?.id : false;
    const guildRoles = activeGuild?.roles || [];

    // Calculate current user's permissions and position
    const currentUserRoles = activeGuild?.members?.find((m) => m.id === user?.id)?.roles || [];
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

    // Calculate target member's highest position
    const targetMember = activeGuild?.members?.find((m) => m.id === targetUser.id);
    let targetHighestPos = 999999;
    (targetMember?.roles || []).forEach((r) => {
      if (r.position < targetHighestPos) {
        targetHighestPos = r.position;
      }
    });

    const isHierarchyAllowed = isCurrentOwner || currentUserHighestPos < targetHighestPos;

    const items: ContextMenuItem[] = [
      {
        label: 'Ver Perfil',
        icon: <UserIcon className="w-4 h-4" />,
        onClick: () => onOpenUserProfile?.(targetUser, { x: e.clientX, y: e.clientY }),
      },
    ];

    if (!isMe) {
      items.push({
        label: 'Enviar Mensagem',
        icon: <MessageSquare className="w-4 h-4" />,
        onClick: async () => {
          if (onOpenDM) {
            onOpenDM(targetUser.id);
          } else {
            await openDMWithUser(targetUser.id);
          }
        },
      });

      items.push({ label: '', separator: true });
      items.push({
        label: 'Volume de Usuário',
        customRender: <UserVolumeSlider userId={targetUser.id} />,
      });
    }

    // Server Member Moderation Actions
    if (activeGuild && targetMember && (isCurrentOwner || isMe || (!isTargetOwner && isHierarchyAllowed))) {
      // Change Roles Submenu
      if (canManageRoles && guildRoles.length > 0) {
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

      // Timeout / Mute Submenu
      if (canMute) {
        const isMuted = targetMember.muted_until && new Date(targetMember.muted_until) > new Date();
        const muteSubItems: ContextMenuItem[] = [
          {
            label: 'Por 60 segundos',
            onClick: () => muteMember(activeGuild.id, targetMember.id, 60),
          },
          {
            label: 'Por 5 minutos',
            onClick: () => muteMember(activeGuild.id, targetMember.id, 300),
          },
          {
            label: 'Por 1 hora',
            onClick: () => muteMember(activeGuild.id, targetMember.id, 3600),
          },
          {
            label: 'Por 1 dia',
            onClick: () => muteMember(activeGuild.id, targetMember.id, 86400),
          },
          { label: '', separator: true },
          {
            label: 'Remover Silenciamento',
            onClick: () => muteMember(activeGuild.id, targetMember.id, 0),
          },
        ];

        items.push({
          label: isMuted ? 'Membro Silenciado' : 'Silenciar Membro',
          icon: <VolumeX className="w-4 h-4 text-amber-400" />,
          subItems: muteSubItems,
        });
      }

      // Kick & Ban (only for other members)
      if (!isMe && !isTargetOwner && isHierarchyAllowed) {
        if (canKick) {
          items.push({
            label: `Expulsar ${targetMember.display_name || targetMember.username}`,
            icon: <UserMinus className="w-4 h-4 text-amber-400" />,
            variant: 'danger',
            onClick: () => {
              if (confirm(`Tem certeza que deseja expulsar ${targetMember.display_name || targetMember.username}?`)) {
                kickMember(activeGuild.id, targetMember.id);
              }
            },
          });
        }

        if (canBan) {
          items.push({
            label: `Banir ${targetMember.display_name || targetMember.username}`,
            icon: <Ban className="w-4 h-4 text-dnd" />,
            variant: 'danger',
            onClick: () => {
              if (confirm(`Tem certeza que deseja banir ${targetMember.display_name || targetMember.username} do servidor?`)) {
                banMember(activeGuild.id, targetMember.id);
              }
            },
          });
        }
      }
    }

    if (!isMe) {
      items.push({ label: '', separator: true });
      items.push({
        label: 'Bloquear Usuário',
        icon: <UserX className="w-4 h-4 text-dnd" />,
        variant: 'danger',
        onClick: async () => {
          if (confirm(`Deseja bloquear @${targetUser.username}? Você não receberá mais mensagens diretas deste usuário.`)) {
            await api.users.block(targetUser.id);
          }
        },
      });
    }

    items.push({ label: '', separator: true });
    items.push({
      label: 'Copiar ID do Usuário',
      icon: <Copy className="w-4 h-4" />,
      onClick: () => navigator.clipboard.writeText(targetUser.id),
    });

    openContextMenu(e, items, `@${targetUser.username}`);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const author = message.author;
    if (!author) return;

    const isMe = author.id === user?.id;
    const isTargetOwner = activeGuild ? author.id === activeGuild.owner_id : false;
    const isCurrentOwner = activeGuild ? activeGuild.owner_id === user?.id : false;
    const guildRoles = activeGuild?.roles || [];

    // Calculate current user's permissions and position
    const currentUserRoles = activeGuild?.members?.find((m) => m.id === user?.id)?.roles || [];
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

    // Calculate target member's highest position
    const targetMember = activeGuild?.members?.find((m) => m.id === author.id);
    let targetHighestPos = 999999;
    (targetMember?.roles || []).forEach((r) => {
      if (r.position < targetHighestPos) {
        targetHighestPos = r.position;
      }
    });

    const isHierarchyAllowed = isCurrentOwner || currentUserHighestPos < targetHighestPos;

    const items: ContextMenuItem[] = [
      {
        label: 'Ver Perfil',
        icon: <UserIcon className="w-4 h-4" />,
        onClick: () => onOpenUserProfile?.(author, { x: e.clientX, y: e.clientY }),
      },
    ];

    if (!isMe) {
      items.push({
        label: 'Enviar Mensagem',
        icon: <MessageSquare className="w-4 h-4" />,
        onClick: async () => {
          if (onOpenDM) {
            onOpenDM(author.id);
          } else {
            await openDMWithUser(author.id);
          }
        },
      });

      items.push({ label: '', separator: true });
      items.push({
        label: 'Volume de Usuário',
        customRender: <UserVolumeSlider userId={author.id} />,
      });
    }

    // Message Specific Actions
    items.push({ label: '', separator: true });

    items.push({
      label: 'Responder',
      icon: <Reply className="w-4 h-4" />,
      onClick: () => onReply?.(message),
    });

    items.push({
      label: message.is_pinned ? 'Desafixar Mensagem' : 'Fixar Mensagem',
      icon: <Pin className="w-4 h-4" />,
      onClick: () => togglePin(message.id),
    });

    items.push({
      label: 'Copiar Texto',
      icon: <Copy className="w-4 h-4" />,
      onClick: () => navigator.clipboard.writeText(message.content),
    });

    if (isAuthor) {
      items.push({
        label: 'Editar Mensagem',
        icon: <Pencil className="w-4 h-4" />,
        onClick: () => setIsEditing(true),
      });
    }

    if (canDelete) {
      items.push({
        label: 'Excluir Mensagem',
        icon: <Trash2 className="w-4 h-4" />,
        variant: 'danger',
        onClick: () => setIsDeleteModalOpen(true),
      });
    }

    // Server Member Moderation Actions (Roles & Mute allowed for self if permitted)
    if (activeGuild && targetMember && (isCurrentOwner || isMe || (!isTargetOwner && isHierarchyAllowed))) {
      // Change Roles Submenu
      if (canManageRoles && guildRoles.length > 0) {
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

      // Timeout / Mute Submenu
      if (canMute) {
        const isMuted = targetMember.muted_until && new Date(targetMember.muted_until) > new Date();
        const muteSubItems: ContextMenuItem[] = [
          {
            label: 'Por 60 segundos',
            onClick: () => muteMember(activeGuild.id, targetMember.id, 60),
          },
          {
            label: 'Por 5 minutos',
            onClick: () => muteMember(activeGuild.id, targetMember.id, 300),
          },
          {
            label: 'Por 1 hora',
            onClick: () => muteMember(activeGuild.id, targetMember.id, 3600),
          },
          {
            label: 'Por 1 dia',
            onClick: () => muteMember(activeGuild.id, targetMember.id, 86400),
          },
          { label: '', separator: true },
          {
            label: 'Remover Silenciamento',
            onClick: () => muteMember(activeGuild.id, targetMember.id, 0),
          },
        ];

        items.push({
          label: isMuted ? 'Membro Silenciado' : 'Silenciar Membro',
          icon: <VolumeX className="w-4 h-4 text-amber-400" />,
          subItems: muteSubItems,
        });
      }

      // Kick & Ban (only for other members)
      if (!isMe && !isTargetOwner && isHierarchyAllowed) {
        if (canKick) {
          items.push({
            label: `Expulsar ${targetMember.display_name || targetMember.username}`,
            icon: <UserMinus className="w-4 h-4 text-amber-400" />,
            variant: 'danger',
            onClick: () => {
              if (confirm(`Tem certeza que deseja expulsar ${targetMember.display_name || targetMember.username}?`)) {
                kickMember(activeGuild.id, targetMember.id);
              }
            },
          });
        }

        if (canBan) {
          items.push({
            label: `Banir ${targetMember.display_name || targetMember.username}`,
            icon: <Ban className="w-4 h-4 text-dnd" />,
            variant: 'danger',
            onClick: () => {
              if (confirm(`Tem certeza que deseja banir ${targetMember.display_name || targetMember.username} do servidor?`)) {
                banMember(activeGuild.id, targetMember.id);
              }
            },
          });
        }
      }
    }

    if (!isMe) {
      items.push({ label: '', separator: true });
      items.push({
        label: 'Bloquear Usuário',
        icon: <UserX className="w-4 h-4 text-dnd" />,
        variant: 'danger',
        onClick: async () => {
          if (confirm(`Deseja bloquear @${author.username}? Você não receberá mais mensagens diretas deste usuário.`)) {
            await api.users.block(author.id);
          }
        },
      });
    }

    // IDs at the very bottom
    items.push({ label: '', separator: true });
    items.push({
      label: 'Copiar ID da Mensagem',
      icon: <Copy className="w-4 h-4" />,
      onClick: () => navigator.clipboard.writeText(message.id),
    });
    items.push({
      label: 'Copiar ID do Usuário',
      icon: <Copy className="w-4 h-4" />,
      onClick: () => navigator.clipboard.writeText(author.id),
    });

    openContextMenu(e, items, `@${author.username}`);
  };

  // Mobile Swipe to Reply & Long-Press state
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const longPressTimerRef = useRef<any>(null);
  const hasTriggeredSwipeHapticRef = useRef(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1 || isEditing || message.status === 'sending' || message.status === 'failed') return;
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
    hasTriggeredSwipeHapticRef.current = false;

    // Start long press timer (420ms)
    longPressTimerRef.current = setTimeout(() => {
      hapticMedium();
      handleContextMenu({
        clientX: touch.clientX,
        clientY: touch.clientY,
        preventDefault: () => {},
        stopPropagation: () => {},
      } as any);
      touchStartRef.current = null;
    }, 420);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartRef.current || e.touches.length !== 1) return;
    const touch = e.touches[0];
    const deltaX = touch.clientX - touchStartRef.current.x;
    const deltaY = touch.clientY - touchStartRef.current.y;

    // If moved vertically or backward, cancel long-press
    if (Math.abs(deltaX) > 8 || Math.abs(deltaY) > 8) {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    }

    // Only allow swipe right if mostly horizontal
    if (deltaX > 8 && Math.abs(deltaX) > Math.abs(deltaY) * 1.4) {
      setIsSwiping(true);
      const clampedOffset = Math.min(56, deltaX * 0.45);
      setSwipeOffset(clampedOffset);

      if (clampedOffset >= 36 && !hasTriggeredSwipeHapticRef.current) {
        hasTriggeredSwipeHapticRef.current = true;
        hapticLight();
      } else if (clampedOffset < 36 && hasTriggeredSwipeHapticRef.current) {
        hasTriggeredSwipeHapticRef.current = false;
      }
    }
  };

  const handleTouchEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    if (swipeOffset >= 36) {
      hapticSuccess();
      onReply?.(message);
    }

    setIsSwiping(false);
    setSwipeOffset(0);
    touchStartRef.current = null;
  };

  const renderFormattedContent = (content: string) => {
    const lines = content.split('\n');
    return lines.map((line, lineIdx) => {
      const urlRegex = /(https?:\/\/[^\s]+|\/assets\/user\/[^\s]+|\/assets\/guild\/[^\s]+)/g;
      const mentionRegex = /(@[a-zA-Z0-9_.-]+|@everyone|@here)/g;
      const combinedRegex = /(https?:\/\/[^\s]+|\/assets\/user\/[^\s]+|\/assets\/guild\/[^\s]+|@[a-zA-Z0-9_.-]+|@everyone|@here)/g;

      const parts = line.split(combinedRegex);

      return (
        <React.Fragment key={lineIdx}>
          {parts.map((part, i) => {
            if (part.match(urlRegex)) {
              const isImage =
                part.match(/\.(jpeg|jpg|gif|png|webp)($|\?)/i) ||
                part.startsWith('/assets/user/') ||
                part.startsWith('/assets/guild/');

              const fullSrc = formatAssetUrl(part);

              if (isImage) {
                const isGifImage =
                  part.match(/\.(gif|webp)($|\?)/i) ||
                  fullSrc.includes('.gif') ||
                  fullSrc.includes('.webp') ||
                  fullSrc.includes('klipy') ||
                  fullSrc.includes('giphy') ||
                  fullSrc.includes('tenor');

                const favorited = isFavorited(fullSrc);

                return (
                  <GifEmbed
                    key={i}
                    src={fullSrc}
                    isGif={Boolean(isGifImage)}
                    onPreviewImage={onPreviewImage}
                    onImageLoad={onImageLoad}
                    className="mt-2 mb-1"
                  />
                );
              }
              return (
                <a
                  key={i}
                  href={fullSrc}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-400 hover:underline break-all inline-block"
                  onClick={(e) => e.stopPropagation()}
                >
                  {part}
                </a>
              );
            }

            if (part.match(mentionRegex)) {
              const isGlobal = part === '@everyone' || part === '@here';
              const targetName = part.slice(1).toLowerCase();

              // Check if mention is a role
              const matchedRole = activeGuild?.roles?.find((r) => r.name.toLowerCase() === targetName);

              const memberExists =
                isGlobal ||
                matchedRole !== undefined ||
                activeGuild?.members?.some(
                  (m) =>
                    m.username.toLowerCase() === targetName ||
                    (m.display_name && m.display_name.toLowerCase() === targetName)
                );

              if (!memberExists) {
                return part;
              }

              const isUserInRole = matchedRole && currentUserRoles.some((r) => r.id === matchedRole.id);
              const isSelfMention =
                isUserInRole ||
                (user &&
                  (part === `@${user.username}` ||
                    (user.display_name && part === `@${user.display_name}`) ||
                    part === '@everyone'));

              if (matchedRole) {
                return (
                  <span
                    key={i}
                    className="font-semibold px-1.5 py-0.5 rounded-md text-xs inline-flex items-center gap-1 mx-0.5 border"
                    style={{
                      backgroundColor: `${matchedRole.color}25`,
                      color: matchedRole.color,
                      borderColor: `${matchedRole.color}50`,
                    }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: matchedRole.color }} />
                    {part}
                  </span>
                );
              }

              return (
                <span
                  key={i}
                  className={`font-semibold px-1 py-0.5 rounded text-xs inline-block mx-0.5 ${
                    isSelfMention
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      : 'bg-brand-500/20 text-brand-300'
                  }`}
                >
                  {part}
                </span>
              );
            }
            return part;
          })}
          {lineIdx < lines.length - 1 && <br />}
        </React.Fragment>
      );
    });
  };

  const isSending = message.status === 'sending';
  const isFailed = message.status === 'failed';

  return (
    <>
      <div
        id={`msg-${message.id}`}
        onContextMenu={isSending || isFailed ? undefined : handleContextMenu}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        style={{
          transform: swipeOffset > 0 ? `translateX(${swipeOffset}px)` : undefined,
          transition: isSwiping ? 'none' : 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
        className={`relative flex flex-col px-3 md:px-4 group rounded transition-all duration-200 select-text ${
          isFailed
            ? 'bg-red-500/10 hover:bg-red-500/15 border-l-2 border-red-500 text-red-200'
            : isMentioned
            ? 'bg-amber-500/10 hover:bg-amber-500/15 border-l-2 border-amber-500'
            : isSending
            ? 'opacity-65 select-none'
            : 'hover:bg-background-dark/40'
        } ${isCompact ? 'py-[1.5px] mt-0' : isDensityCompact ? 'pt-1 pb-[1px] mt-1' : 'pt-2.5 pb-[1.5px] mt-3.5'}`}
      >
        {/* Swipe to Reply Indicator Icon (Mobile) */}
        {swipeOffset > 0 && (
          <div
            style={{
              opacity: Math.min(1, swipeOffset / 36),
              transform: `scale(${Math.min(1, Math.max(0.5, swipeOffset / 36))})`,
            }}
            className="absolute -left-7 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-brand-500 flex items-center justify-center text-white pointer-events-none shadow-md transition-opacity"
          >
            <Reply className="w-3.5 h-3.5" />
          </div>
        )}
        {/* Reply Reference Header (Clickable with smooth scroll) */}
        {message.reply_to && (
          <div
            onClick={(e) => {
              e.stopPropagation();
              const targetEl = document.getElementById(`msg-${message.reply_to?.id}`);
              if (targetEl) {
                targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                targetEl.classList.add('bg-brand-500/25', 'ring-2', 'ring-brand-500/50');
                setTimeout(() => {
                  targetEl.classList.remove('bg-brand-500/25', 'ring-2', 'ring-brand-500/50');
                }, 1500);
              }
            }}
            className="flex items-center gap-1.5 text-[11px] text-gray-400 mb-1 ml-9 md:ml-10 select-none opacity-80 hover:opacity-100 hover:text-gray-200 transition-all cursor-pointer group/reply"
            title="Clique para ir até a mensagem respondida"
          >
            <CornerDownRight className="w-3.5 h-3.5 text-gray-500 flex-shrink-0 group-hover/reply:text-brand-400 transition-colors" />
            <span className="font-semibold text-brand-400 group-hover/reply:underline">
              @{message.reply_to.author.display_name || message.reply_to.author.username}
            </span>
            <span className="truncate text-gray-400 max-w-sm italic">
              "{message.reply_to.content}"
            </span>
          </div>
        )}

        {/* Main Message Row */}
        <div className="flex gap-3 md:gap-4 relative">
          {/* Quick Action Floating Bar on Hover */}
          {!isEditing && !isSending && !isFailed && (
            <div className="absolute -top-3 right-4 hidden group-hover:flex items-center gap-1 bg-background-darkest border border-white/10 rounded-lg p-1 shadow-lg z-10 animate-in fade-in zoom-in-95">
              {/* Reaction Popover Toggle */}
              <div className="relative">
                <button
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  className="p-1 rounded text-gray-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                  title="Adicionar Reação"
                >
                  <Smile className="w-3.5 h-3.5" />
                </button>

                {showEmojiPicker && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowEmojiPicker(false)} />
                    <div className="absolute bottom-full mb-2 right-0 z-50 bg-background-darker rounded-xl p-1.5 shadow-2xl border border-white/10 flex items-center gap-1 animate-in fade-in zoom-in-95">
                      {QUICK_EMOJIS.map((emoji) => (
                        <button
                          key={emoji}
                          onClick={() => {
                            toggleReaction(message.id, emoji);
                            setShowEmojiPicker(false);
                          }}
                          className="w-7 h-7 flex items-center justify-center hover:bg-white/10 rounded-lg text-base transition-transform active:scale-125 cursor-pointer"
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>

              <button
                onClick={() => onReply?.(message)}
                className="p-1 rounded text-gray-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                title="Responder"
              >
                <Reply className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={() => togglePin(message.id)}
                className={`p-1 rounded transition-colors cursor-pointer ${
                  message.is_pinned
                    ? 'text-amber-400 hover:bg-amber-400/20'
                    : 'text-gray-400 hover:text-white hover:bg-white/10'
                }`}
                title={message.is_pinned ? 'Desafixar' : 'Fixar'}
              >
                <Pin className="w-3.5 h-3.5" />
              </button>

              {isAuthor && (
                <button
                  onClick={() => setIsEditing(true)}
                  className="p-1 rounded text-gray-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                  title="Editar Mensagem"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              )}

              {canDelete && (
                <button
                  onClick={() => setIsDeleteModalOpen(true)}
                  disabled={isDeleting}
                  className="p-1 rounded text-gray-400 hover:text-dnd hover:bg-dnd/20 transition-colors cursor-pointer"
                  title="Excluir Mensagem"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}

          {/* Left Avatar OR Hover Timestamp */}
          {isCompact ? (
            <div className="w-9 md:w-10 flex-shrink-0 text-right select-none text-[10px] text-gray-500 font-mono opacity-0 group-hover:opacity-100 transition-opacity leading-[1.375rem] pr-1">
              {shortTime}
            </div>
          ) : (
            <div
              onClick={(e) => {
                e.stopPropagation();
                message.author && onOpenUserProfile?.(message.author, { x: e.clientX, y: e.clientY });
              }}
              className="w-9 h-9 md:w-10 md:h-10 rounded-full bg-brand-500 flex items-center justify-center font-bold text-white flex-shrink-0 mt-0.5 shadow-sm text-sm overflow-hidden cursor-pointer hover:opacity-85 transition-opacity"
              title="Ver perfil"
            >
              {message.author?.avatar_url ? (
                <img
                  src={formatAssetUrl(message.author.avatar_url)}
                  alt={message.author.username}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span>
                  {message.author?.display_name?.[0]?.toUpperCase() ||
                    message.author?.username?.[0]?.toUpperCase() ||
                    'U'}
                </span>
              )}
            </div>
          )}

          {/* Content */}
          <div className="flex-1 min-w-0">
            {!isCompact && (
              <div className="flex items-baseline gap-2 mb-0.5 select-none">
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    message.author && onOpenUserProfile?.(message.author, { x: e.clientX, y: e.clientY });
                  }}
                  className="font-semibold text-sm text-gray-100 hover:underline cursor-pointer hover:text-brand-400 transition-colors"
                  title="Ver perfil"
                >
                  {message.author?.display_name || message.author?.username || 'Usuário'}
                </span>
                <span className="text-[10px] md:text-[11px] text-gray-400 font-normal">{formattedTime}</span>
                {message.is_edited && (
                  <span className="text-[10px] text-gray-500 font-normal">(editado)</span>
                )}
                {message.is_pinned && (
                  <span className="text-[10px] text-amber-400 bg-amber-400/10 px-1.5 py-0.2 rounded font-semibold flex items-center gap-1">
                    <Pin className="w-2.5 h-2.5" /> Fixada
                  </span>
                )}
              </div>
            )}

            {/* Inline Editing Mode */}
            {isEditing ? (
              <div className="mt-1 space-y-1.5">
                <textarea
                  ref={editInputRef}
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={2}
                  className="w-full bg-background-darkest text-gray-100 text-sm rounded-lg p-2.5 border border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none font-normal"
                />
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-gray-400">
                    Esc para{' '}
                    <button onClick={handleCancelEdit} className="text-brand-500 hover:underline cursor-pointer">
                      cancelar
                    </button>{' '}
                    • Enter para{' '}
                    <button
                      onClick={handleSaveEdit}
                      className="text-brand-500 hover:underline font-semibold cursor-pointer"
                    >
                      salvar
                    </button>
                  </span>
                </div>
              </div>
            ) : (
              <div className={`text-[0.9375rem] break-words leading-[1.375rem] font-normal select-text ${
                isFailed ? 'text-red-300' : isSending ? 'text-gray-400' : 'text-gray-200'
              }`}>
                <FormattedMessage
                  content={message.content}
                  onPreviewImage={onPreviewImage}
                  onImageLoad={onImageLoad}
                  onOpenUserProfile={onOpenUserProfile}
                  onOpenUserContextMenu={handleUserContextMenu}
                />
              </div>
            )}

            {/* Failed sending banner with Retry and Delete */}
            {isFailed && (
              <div className="mt-1.5 flex items-center gap-2 text-xs text-red-400 bg-red-500/10 px-2 py-1 rounded-lg border border-red-500/20">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="flex-1 truncate">{message.error || 'Falha ao enviar mensagem.'}</span>
                <button
                  type="button"
                  onClick={handleRetrySend}
                  className="flex items-center gap-1 text-red-300 hover:text-white font-semibold underline cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Tentar novamente</span>
                </button>
                <button
                  type="button"
                  onClick={() => removeMessageFromStore(message.id)}
                  className="p-0.5 hover:text-white text-red-400 cursor-pointer"
                  title="Excluir rascunho com falha"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Reactions Bar */}
            {!isSending && !isFailed && message.reactions && message.reactions.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {message.reactions.map((reaction) => {
                  const hasReacted = user && reaction.user_ids.includes(user.id);
                  return (
                    <button
                      key={reaction.emoji}
                      onClick={() => toggleReaction(message.id, reaction.emoji)}
                      className={`flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs border transition-colors cursor-pointer ${
                        hasReacted
                          ? 'bg-brand-500/20 border-brand-500/40 text-brand-300'
                          : 'bg-background-darkest/60 border-white/5 text-gray-400 hover:bg-background-darkest hover:text-gray-200'
                      }`}
                    >
                      <span>{reaction.emoji}</span>
                      <span className="font-semibold text-[11px]">{reaction.count}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Message & User Context Menu */}
      <ContextMenu menu={menu} onClose={closeContextMenu} />

      {/* Delete Message Confirmation Modal */}
      <DeleteMessageModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        message={message}
        isDeleting={isDeleting}
        onConfirm={async () => {
          try {
            setIsDeleting(true);
            await deleteMessage(message.id);
            setIsDeleteModalOpen(false);
          } catch (err) {
            console.error('Failed to delete message:', err);
          } finally {
            setIsDeleting(false);
          }
        }}
      />
    </>
  );
};
