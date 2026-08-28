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
} from 'lucide-react';
import { Message, User, Permissions } from '../../types';
import { useAuthStore } from '../../stores/authStore';
import { useGuildStore } from '../../stores/guildStore';
import { useDMStore } from '../../stores/dmStore';
import { api, getApiBaseUrl } from '../../lib/api';
import { ContextMenu, useContextMenu, ContextMenuItem } from '../ContextMenu';

interface MessageItemProps {
  message: Message;
  isCompact?: boolean;
  onOpenUserProfile?: (user: User, position?: { x: number; y: number }) => void;
  onOpenDM?: (userId: string) => void;
  onPreviewImage?: (url: string) => void;
  onReply?: (message: Message) => void;
}

const QUICK_EMOJIS = ['👍', '❤️', '🔥', '😂', '🎉', '👀', '✨', '💀'];

export const MessageItem: React.FC<MessageItemProps> = ({
  message,
  isCompact = false,
  onOpenUserProfile,
  onOpenDM,
  onPreviewImage,
  onReply,
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
  } = useGuildStore();
  const { openDMWithUser } = useDMStore();
  const { menu, openContextMenu, closeContextMenu } = useContextMenu();

  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const editInputRef = useRef<HTMLTextAreaElement>(null);

  const isAuthor = user?.id === message.author_id;
  const isOwner = activeGuild?.owner_id === user?.id;
  const canDelete = isAuthor || isOwner;

  const isMentioned =
    user &&
    (message.content.includes(`@${user.username}`) ||
      (user.display_name && message.content.includes(`@${user.display_name}`)) ||
      message.content.includes('@everyone') ||
      message.content.includes('@here'));

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
    }

    items.push({
      label: 'Copiar ID do Usuário',
      icon: <Copy className="w-4 h-4" />,
      onClick: () => navigator.clipboard.writeText(author.id),
    });

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
        onClick: handleDelete,
      });
    }

    // Server Member Moderation Actions (Roles & Mute allowed for self if permitted)
    if (activeGuild && targetMember && (isCurrentOwner || isMe || (!isTargetOwner && isHierarchyAllowed))) {
      // Change Roles Submenu
      if (canManageRoles && guildRoles.length > 0) {
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

    openContextMenu(e, items, `@${author.username}`);
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

              const fullSrc = part.startsWith('/assets/') ? `${getApiBaseUrl()}${part}` : part;

              if (isImage) {
                return (
                  <div key={i} className="mt-2 mb-1 max-w-sm rounded-lg overflow-hidden border border-white/10">
                    <img
                      src={fullSrc}
                      alt="Uploaded content"
                      onClick={() => onPreviewImage?.(fullSrc)}
                      className="max-h-64 object-cover rounded-lg cursor-pointer hover:opacity-95 transition-opacity"
                    />
                  </div>
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

              const memberExists =
                isGlobal ||
                activeGuild?.members?.some(
                  (m) =>
                    m.username.toLowerCase() === targetName ||
                    (m.display_name && m.display_name.toLowerCase() === targetName)
                );

              if (!memberExists) {
                return part;
              }

              const isSelfMention =
                user &&
                (part === `@${user.username}` ||
                  (user.display_name && part === `@${user.display_name}`) ||
                  part === '@everyone');

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

  return (
    <>
      <div
        onContextMenu={handleContextMenu}
        className={`relative flex flex-col px-3 md:px-4 group rounded transition-colors select-none ${
          isMentioned
            ? 'bg-amber-500/10 hover:bg-amber-500/15 border-l-2 border-amber-500'
            : 'hover:bg-background-dark/40'
        } ${isCompact ? 'py-[1.5px] mt-0' : 'pt-2.5 pb-[1.5px] mt-3.5'}`}
      >
        {/* Reply Reference Header */}
        {message.reply_to && (
          <div className="flex items-center gap-1.5 text-[11px] text-gray-400 mb-1 ml-9 md:ml-10 select-none opacity-80 hover:opacity-100 transition-opacity">
            <CornerDownRight className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
            <span className="font-semibold text-brand-400">
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
          {!isEditing && (
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
                  onClick={handleDelete}
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
                  src={message.author.avatar_url}
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
              <div className="flex items-baseline gap-2 mb-0.5">
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
                  <span className="text-[10px] text-gray-500 font-normal select-none">(editado)</span>
                )}
                {message.is_pinned && (
                  <span className="text-[10px] text-amber-400 bg-amber-400/10 px-1.5 py-0.2 rounded font-semibold flex items-center gap-1 select-none">
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
              <div className="text-[0.9375rem] text-gray-200 break-words leading-[1.375rem] whitespace-pre-wrap font-normal">
                {renderFormattedContent(message.content)}
              </div>
            )}

            {/* Reactions Bar */}
            {message.reactions && message.reactions.length > 0 && (
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
    </>
  );
};
