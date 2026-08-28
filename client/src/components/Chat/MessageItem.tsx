import React, { useState, useRef, useEffect } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Pencil, Trash2, Check, X, Smile, Reply, Pin, CornerDownRight } from 'lucide-react';
import { Message, User } from '../../types';
import { useAuthStore } from '../../stores/authStore';
import { useGuildStore } from '../../stores/guildStore';

interface MessageItemProps {
  message: Message;
  isCompact?: boolean;
  onOpenUserProfile?: (user: User, position?: { x: number; y: number }) => void;
  onPreviewImage?: (url: string) => void;
  onReply?: (message: Message) => void;
}

const QUICK_EMOJIS = ['👍', '❤️', '🔥', '😂', '🎉', '👀', '✨', '💀'];

export const MessageItem: React.FC<MessageItemProps> = ({
  message,
  isCompact = false,
  onOpenUserProfile,
  onPreviewImage,
  onReply,
}) => {
  const { user } = useAuthStore();
  const { activeGuild, editMessage, deleteMessage, toggleReaction, togglePin } = useGuildStore();

  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const editInputRef = useRef<HTMLTextAreaElement>(null);

  const isAuthor = user?.id === message.author_id;
  const isOwner = activeGuild?.owner_id === user?.id;
  const canDelete = isAuthor || isOwner;

  const isMentioned = user && (
    message.content.includes(`@${user.username}`) ||
    (user.display_name && message.content.includes(`@${user.display_name}`)) ||
    message.content.includes('@everyone') ||
    message.content.includes('@here')
  );

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

  // Separate image URLs or data URLs from plain text
  const lines = message.content.split('\n');
  const textLines: string[] = [];
  const imageUrls: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (
      trimmed.startsWith('data:image/') ||
      (trimmed.startsWith('http') &&
        (trimmed.endsWith('.png') ||
          trimmed.endsWith('.jpg') ||
          trimmed.endsWith('.jpeg') ||
          trimmed.endsWith('.gif') ||
          trimmed.endsWith('.webp')))
    ) {
      imageUrls.push(trimmed);
    } else {
      textLines.push(line);
    }
  }

  const renderFormattedText = (text: string) => {
    const mentionRegex = /(@[a-zA-Z0-9_]+|@everyone|@here)/g;
    const urlRegex = /(https?:\/\/[^\s]+)/g;

    const parts = text.split(/((?:https?:\/\/[^\s]+)|(?:@[a-zA-Z0-9_]+|@everyone|@here))/g);

    return parts.map((part, i) => {
      if (part.match(urlRegex)) {
        return (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-400 hover:underline break-all"
          >
            {part}
          </a>
        );
      }
      if (part.match(mentionRegex)) {
        const isGlobal = part === '@everyone' || part === '@here';
        const targetName = part.slice(1).toLowerCase();

        // Check if mentioned user actually belongs to this server
        const memberExists =
          isGlobal ||
          activeGuild?.members?.some(
            (m) =>
              m.username.toLowerCase() === targetName ||
              (m.display_name && m.display_name.toLowerCase() === targetName)
          );

        // If not in server, render as plain unhighlighted text
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
    });
  };

  return (
    <div
      className={`relative flex flex-col px-3 md:px-4 group rounded-lg transition-colors select-none ${
        isMentioned
          ? 'bg-amber-500/10 hover:bg-amber-500/15 border-l-2 border-amber-500'
          : 'hover:bg-background-dark/40'
      } ${isCompact ? 'py-0 mt-0' : 'pt-3 pb-0.5 mt-2.5'}`}
    >
      {/* Reply Reference Header if message is replying to another */}
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
                className="p-1 rounded text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
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
                        className="w-7 h-7 flex items-center justify-center hover:bg-white/10 rounded-lg text-base transition-transform active:scale-125"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Reply Button */}
            {onReply && (
              <button
                onClick={() => onReply(message)}
                className="p-1 rounded text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                title="Responder"
              >
                <Reply className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Pin Button */}
            <button
              onClick={() => togglePin(message.id)}
              className={`p-1 rounded transition-colors ${
                message.is_pinned
                  ? 'text-amber-400 hover:bg-amber-400/20'
                  : 'text-gray-400 hover:text-white hover:bg-white/10'
              }`}
              title={message.is_pinned ? 'Desafixar Mensagem' : 'Fixar Mensagem'}
            >
              <Pin className="w-3.5 h-3.5" />
            </button>

            {isAuthor && (
              <button
                onClick={() => setIsEditing(true)}
                className="p-1 rounded text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                title="Editar Mensagem"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            )}

            {canDelete && (
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="p-1 rounded text-gray-400 hover:text-dnd hover:bg-dnd/20 transition-colors"
                title="Excluir Mensagem"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}

        {/* Left Avatar OR Hover Timestamp for compact messages */}
        {isCompact ? (
          <div className="w-9 md:w-10 flex-shrink-0 text-right select-none text-[10px] text-gray-500 font-mono opacity-0 group-hover:opacity-100 transition-opacity pt-0.5 leading-none pr-1">
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
                  Esc para <button onClick={handleCancelEdit} className="text-brand-500 hover:underline">cancelar</button> • Enter para{' '}
                  <button onClick={handleSaveEdit} className="text-brand-500 hover:underline font-semibold">salvar</button>
                </span>
              </div>
            </div>
          ) : (
            <div className="text-sm text-gray-200 leading-snug break-words font-normal select-text space-y-1">
              {textLines.length > 0 && (
                <p className="whitespace-pre-wrap">{renderFormattedText(textLines.join('\n'))}</p>
              )}

              {/* Render Images if any */}
              {imageUrls.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {imageUrls.map((imgSrc, idx) => (
                    <div
                      key={idx}
                      className="relative rounded-2xl overflow-hidden max-w-sm max-h-72 border border-white/10 shadow-lg bg-black/40 group/img cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onPreviewImage) onPreviewImage(imgSrc);
                      }}
                    >
                      <img
                        src={imgSrc}
                        alt="Imagem enviada"
                        className="w-full h-full object-cover transition-transform duration-200 group-hover/img:scale-105"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Reactions Badges */}
          {message.reactions && message.reactions.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2 select-none">
              {message.reactions.map((rx) => {
                const hasReacted = user && rx.user_ids.includes(user.id);
                return (
                  <button
                    key={rx.emoji}
                    onClick={() => toggleReaction(message.id, rx.emoji)}
                    className={`flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-xs font-semibold border transition-all active:scale-95 ${
                      hasReacted
                        ? 'bg-brand-500/20 border-brand-500/50 text-brand-300'
                        : 'bg-background-darkest/70 border-white/10 text-gray-300 hover:bg-white/5'
                    }`}
                  >
                    <span>{rx.emoji}</span>
                    <span className="text-[11px]">{rx.count}</span>
                  </button>
                );
              })}

              <button
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className="flex items-center justify-center px-1.5 py-0.5 rounded-lg text-xs font-semibold bg-background-darkest/50 border border-white/5 text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                title="Adicionar Reação"
              >
                <Smile className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
