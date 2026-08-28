import React, { useState, useRef, useEffect } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Pencil, Trash2, Check, X } from 'lucide-react';
import { Message, User } from '../../types';
import { useAuthStore } from '../../stores/authStore';
import { useGuildStore } from '../../stores/guildStore';

interface MessageItemProps {
  message: Message;
  isCompact?: boolean;
  onOpenUserProfile?: (user: User) => void;
}

export const MessageItem: React.FC<MessageItemProps> = ({
  message,
  isCompact = false,
  onOpenUserProfile,
}) => {
  const { user } = useAuthStore();
  const { activeGuild, editMessage, deleteMessage } = useGuildStore();

  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [isDeleting, setIsDeleting] = useState(false);
  const editInputRef = useRef<HTMLTextAreaElement>(null);

  const isAuthor = user?.id === message.author_id;
  const isOwner = activeGuild?.owner_id === user?.id;
  const canDelete = isAuthor || isOwner;

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
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = text.split(urlRegex);

    return parts.map((part, i) => {
      if (part.match(urlRegex)) {
        return (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-500 hover:underline break-all"
          >
            {part}
          </a>
        );
      }
      return part;
    });
  };

  return (
    <div
      className={`relative flex gap-3 md:gap-4 px-3 md:px-4 hover:bg-background-dark/50 group rounded-xl transition-colors select-none ${
        isCompact ? 'py-0.5' : 'pt-2.5 pb-1 mt-1'
      }`}
    >
      {/* Quick Action Floating Bar on Hover */}
      {!isEditing && (
        <div className="absolute -top-3 right-4 hidden group-hover:flex items-center gap-1 bg-background-darkest border border-white/10 rounded-lg p-1 shadow-lg z-10 animate-in fade-in zoom-in-95">
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
        <div className="w-9 md:w-10 flex-shrink-0 text-right select-none text-[10px] text-gray-500 font-mono opacity-0 group-hover:opacity-100 transition-opacity self-center leading-none">
          {shortTime}
        </div>
      ) : (
        <div
          onClick={() => message.author && onOpenUserProfile?.(message.author)}
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
              onClick={() => message.author && onOpenUserProfile?.(message.author)}
              className="font-semibold text-sm text-gray-100 hover:underline cursor-pointer hover:text-brand-400 transition-colors"
              title="Ver perfil"
            >
              {message.author?.display_name || message.author?.username || 'Usuário'}
            </span>
            <span className="text-[10px] md:text-[11px] text-gray-400 font-normal">{formattedTime}</span>
            {message.is_edited && (
              <span className="text-[10px] text-gray-500 font-normal select-none">(editado)</span>
            )}
          </div>
        )}

        {/* Inline Editing Mode */}
        {isEditing ? (
          <div className="mt-1 space-y-1.5">
            <textarea
              ref={editInputRef}
              rows={2}
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full bg-background-darker border border-brand-500 rounded-lg p-2 text-sm text-gray-100 focus:outline-none resize-none leading-relaxed"
            />
            <div className="flex items-center justify-between text-[11px] text-gray-400">
              <span>
                escape para <button onClick={handleCancelEdit} className="text-brand-400 hover:underline">cancelar</button> • enter para <button onClick={handleSaveEdit} className="text-brand-400 hover:underline">salvar</button>
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={handleCancelEdit}
                  className="px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-gray-300"
                >
                  <X className="w-3 h-3 inline mr-1" /> Cancelar
                </button>
                <button
                  onClick={handleSaveEdit}
                  className="px-2 py-0.5 rounded bg-brand-500 hover:bg-brand-600 text-white"
                >
                  <Check className="w-3 h-3 inline mr-1" /> Salvar
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Normal Message View */
          <>
            {textLines.length > 0 && (
              <div className="text-sm text-gray-200 leading-relaxed break-words whitespace-pre-wrap select-text">
                {renderFormattedText(textLines.join('\n'))}
                {isCompact && message.is_edited && (
                  <span className="text-[10px] text-gray-500 font-normal select-none ml-1.5">(editado)</span>
                )}
              </div>
            )}

            {/* Attached Images */}
            {imageUrls.map((url, idx) => (
              <div
                key={idx}
                className="mt-1.5 max-w-md overflow-hidden rounded-xl border border-white/10 shadow-md"
              >
                <img src={url} alt="Imagem enviada" className="max-h-80 w-auto object-contain bg-black/40" />
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
};
