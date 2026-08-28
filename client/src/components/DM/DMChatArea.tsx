import React, { useState, useRef, useEffect } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { MessageSquare, PlusCircle, SendHorizontal, Smile, X, Menu, Reply, CornerDownRight, Search, Phone } from 'lucide-react';
import { useDMStore } from '../../stores/dmStore';
import { useAuthStore } from '../../stores/authStore';
import { useCallStore } from '../../stores/callStore';
import { ActiveCallOverlay } from './ActiveCallOverlay';
import { LimitAlertModal } from '../Modals/LimitAlertModal';
import { User, DMMessage } from '../../types';

interface DMChatAreaProps {
  onOpenMobileDrawer?: () => void;
  onOpenUserProfile?: (user: User, position?: { x: number; y: number }) => void;
  onPreviewImage?: (url: string) => void;
}

const COMMON_EMOJIS = ['😀', '😂', '🔥', '👍', '❤️', '🎉', '😎', '🚀', '👀', '✨', '💀', '💯'];
const QUICK_EMOJIS = ['👍', '❤️', '🔥', '😂', '🎉', '👀', '✨', '💀'];
const MAX_CHARS = 2000;
const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB

export const DMChatArea: React.FC<DMChatAreaProps> = ({
  onOpenMobileDrawer,
  onOpenUserProfile,
  onPreviewImage,
}) => {
  const { user } = useAuthStore();
  const { activeRoom, messages, sendMessage, toggleReaction, isLoadingMessages } = useDMStore();
  const { startCall, callState } = useCallStore();

  const [content, setContent] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<DMMessage | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [activeReactionMsgId, setActiveReactionMsgId] = useState<string | null>(null);
  const [limitAlert, setLimitAlert] = useState<{ title: string; message: string; detail?: string } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleStartCall = async () => {
    if (!activeRoom || !activeRoom.recipient) return;
    try {
      await startCall(activeRoom.id, activeRoom.recipient);
    } catch (err: any) {
      alert(err.message || 'Falha ao iniciar chamada');
    }
  };

  useEffect(() => {
    if (!searchQuery) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, searchQuery]);

  useEffect(() => {
    if (replyingTo && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [replyingTo]);

  if (!activeRoom) {
    return (
      <div className="flex-1 bg-background-dark flex flex-col items-center justify-center text-gray-500 font-medium p-4 select-none">
        {onOpenMobileDrawer && (
          <button
            onClick={onOpenMobileDrawer}
            className="md:hidden mb-4 bg-brand-500 text-white px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2"
          >
            <Menu className="w-4 h-4" />
            <span>Abrir Conversas e Servidores</span>
          </button>
        )}
        <MessageSquare className="w-12 h-12 text-gray-600 mb-3" />
        <span className="text-sm">Selecione uma conversa para começar</span>
      </div>
    );
  }

  const recipient = activeRoom.recipient;

  const getStatusColor = (s?: string) => {
    switch (s) {
      case 'online': return 'bg-online';
      case 'idle': return 'bg-idle';
      case 'dnd': return 'bg-dnd';
      default: return 'bg-offline';
    }
  };

  const handleSend = async () => {
    let finalContent = content.trim();

    // Check 2,000 character limit on raw text
    if (finalContent.length > MAX_CHARS) {
      setLimitAlert({
        title: 'Limite de Caracteres Excedido',
        message: 'O limite de tamanho de mensagem é 2.000 caracteres',
        detail: `${finalContent.length.toLocaleString('pt-BR')} / 2.000 caracteres`,
      });
      return;
    }

    if (selectedImage) {
      finalContent = finalContent ? `${finalContent}\n${selectedImage}` : selectedImage;
    }

    if (!finalContent) return;

    const replyId = replyingTo?.id;

    setContent('');
    setSelectedImage(null);
    setShowEmojiPicker(false);
    setReplyingTo(null);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    await sendMessage(finalContent, undefined, replyId);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    } else if (e.key === 'Escape' && replyingTo) {
      e.preventDefault();
      setReplyingTo(null);
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`;
  };

  const handleSelectEmoji = (emoji: string) => {
    setContent((prev) => prev + emoji);
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  const compressAndSetImage = (file: File) => {
    if (file.size > MAX_FILE_BYTES) {
      setLimitAlert({
        title: 'Arquivo Muito Grande',
        message: 'O limite de imagens/vídeos/arquivos são 20mb',
        detail: `Tamanho do arquivo: ${(file.size / (1024 * 1024)).toFixed(2)} MB (Máximo permitido: 20 MB)`,
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      if (!result) return;

      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 1280;
        const MAX_HEIGHT = 1280;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressed = canvas.toDataURL('image/jpeg', 0.85);
          setSelectedImage(compressed);
        } else {
          setSelectedImage(result);
        }
      };
      img.src = result;
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    compressAndSetImage(file);
    e.target.value = '';
  };

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
            className="text-brand-300 underline break-all font-medium"
          >
            {part}
          </a>
        );
      }
      return part;
    });
  };

  const displayedMessages = messages.filter((msg) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchContent = msg.content.toLowerCase().includes(q);
      const matchAuthor = (msg.author?.display_name || msg.author?.username || '').toLowerCase().includes(q);
      if (!matchContent && !matchAuthor) return false;
    }
    return true;
  });

  return (
    <div className="flex-1 bg-background-dark flex flex-col h-full overflow-hidden relative select-none">
      {/* Active Call Overlay if calling or connected */}
      <ActiveCallOverlay />

      {/* DM Chat Header */}
      <div className="h-12 border-b border-black/20 px-3 md:px-4 flex items-center justify-between shadow-sm z-10">
        <div className="flex items-center gap-2.5 truncate">
          {onOpenMobileDrawer && (
            <button
              onClick={onOpenMobileDrawer}
              className="md:hidden text-gray-400 hover:text-white p-1 -ml-1 rounded hover:bg-white/10 transition-colors cursor-pointer"
              title="Menu Lateral"
            >
              <Menu className="w-5 h-5" />
            </button>
          )}

          {/* Recipient Avatar */}
          <div
            onClick={() => recipient && onOpenUserProfile?.(recipient)}
            className="relative w-7 h-7 rounded-full bg-brand-500 flex items-center justify-center text-white font-bold text-xs flex-shrink-0 cursor-pointer hover:opacity-85 transition-opacity"
            title="Ver perfil"
          >
            {recipient?.avatar_url ? (
              <img src={recipient.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
            ) : (
              <span>{recipient?.display_name?.[0]?.toUpperCase() || recipient?.username[0]?.toUpperCase() || 'U'}</span>
            )}
            <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border border-background-dark ${getStatusColor(recipient?.status)}`} />
          </div>

          <div
            onClick={() => recipient && onOpenUserProfile?.(recipient)}
            className="flex flex-col truncate cursor-pointer group"
            title="Ver perfil"
          >
            <span className="font-bold text-gray-100 text-sm truncate group-hover:text-brand-400 transition-colors">
              {recipient?.display_name || recipient?.username}
            </span>
            <span className="text-[10px] text-gray-400 truncate">@{recipient?.username}</span>
          </div>
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleStartCall}
            disabled={callState !== 'idle'}
            className="p-1.5 rounded-lg text-gray-400 hover:text-online hover:bg-white/5 transition-colors cursor-pointer disabled:opacity-40"
            title="Iniciar Chamada de Voz/Vídeo"
          >
            <Phone className="w-5 h-5" />
          </button>

          {isSearchOpen ? (
            <div className="flex items-center gap-1 bg-background-darkest px-2 py-1 rounded-xl border border-white/10 text-xs">
              <Search className="w-3.5 h-3.5 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar na DM..."
                autoFocus
                className="bg-transparent text-gray-100 placeholder-gray-500 focus:outline-none w-28 md:w-44"
              />
              <button
                onClick={() => {
                  setSearchQuery('');
                  setIsSearchOpen(false);
                }}
                className="p-0.5 text-gray-400 hover:text-white cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setIsSearchOpen(true)}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-white/5 transition-colors cursor-pointer"
              title="Buscar na conversa"
            >
              <Search className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* DM Messages Feed */}
      <div className="flex-1 overflow-y-auto p-4 space-y-0.5">
        {/* Recipient Intro Hero Card */}
        {!searchQuery && (
          <div className="p-6 my-4 bg-background-darker/60 rounded-2xl border border-white/5 flex flex-col items-center text-center">
            <div className="w-20 h-20 rounded-full bg-brand-500 flex items-center justify-center text-2xl font-bold text-white shadow-xl mb-3 overflow-hidden">
              {recipient?.avatar_url ? (
                <img src={recipient.avatar_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <span>{recipient?.display_name?.[0]?.toUpperCase() || recipient?.username[0]?.toUpperCase() || 'U'}</span>
              )}
            </div>
            <h2 className="text-xl font-bold text-white">{recipient?.display_name || recipient?.username}</h2>
            <p className="text-xs text-gray-400 mt-0.5">@{recipient?.username}</p>
            {recipient?.bio && (
              <p className="text-xs text-gray-300 mt-2 max-w-md italic">"{recipient.bio}"</p>
            )}
            <span className="text-[11px] text-gray-500 mt-3">
              Este é o início da sua história de mensagens diretas com @{recipient?.username}.
            </span>
          </div>
        )}

        {isLoadingMessages ? (
          <div className="flex justify-center py-6 text-xs text-gray-500">Carregando mensagens...</div>
        ) : (
          displayedMessages.map((msg, index) => {
            const isMe = msg.author_id === user?.id;
            const prevMsg = index > 0 ? displayedMessages[index - 1] : null;
            const isCompact = (() => {
              if (!prevMsg) return false;
              if (prevMsg.author_id !== msg.author_id) return false;
              if (msg.reply_to) return false;
              const prevTime = new Date(prevMsg.created_at).getTime();
              const currTime = new Date(msg.created_at).getTime();
              if (isNaN(prevTime) || isNaN(currTime)) return false;
              const diffMs = currTime - prevTime;
              return diffMs >= 0 && diffMs <= 5 * 60 * 1000;
            })();

            const timeStr = (() => {
              try {
                return format(new Date(msg.created_at), 'dd/MM HH:mm', { locale: ptBR });
              } catch {
                return '';
              }
            })();

            const lines = msg.content.split('\n');
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

            return (
              <div
                key={msg.id}
                className={`relative group flex gap-3 px-3 rounded-xl hover:bg-background-darkest/40 transition-colors ${
                  isCompact ? 'py-1 mt-1' : 'py-2 mt-3'
                } ${isMe ? 'flex-row-reverse' : ''}`}
              >
                {/* Quick action bar */}
                <div
                  className={`absolute -top-2.5 ${
                    isMe ? 'left-4' : 'right-4'
                  } hidden group-hover:flex items-center gap-1 bg-background-darkest border border-white/10 rounded-lg p-0.5 shadow-lg z-10 animate-in fade-in zoom-in-95`}
                >
                  <div className="relative">
                    <button
                      onClick={() => setActiveReactionMsgId(activeReactionMsgId === msg.id ? null : msg.id)}
                      className="p-1 rounded text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                      title="Reagir"
                    >
                      <Smile className="w-3.5 h-3.5" />
                    </button>

                    {activeReactionMsgId === msg.id && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setActiveReactionMsgId(null)} />
                        <div className="absolute bottom-full mb-1 right-0 z-50 bg-background-darker rounded-xl p-1 shadow-2xl border border-white/10 flex items-center gap-1 animate-in fade-in zoom-in-95">
                          {QUICK_EMOJIS.map((emoji) => (
                            <button
                              key={emoji}
                              onClick={() => {
                                toggleReaction(msg.id, emoji);
                                setActiveReactionMsgId(null);
                              }}
                              className="w-6 h-6 flex items-center justify-center hover:bg-white/10 rounded-lg text-sm transition-transform active:scale-125"
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>

                  <button
                    onClick={() => setReplyingTo(msg)}
                    className="p-1 rounded text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                    title="Responder"
                  >
                    <Reply className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Avatar */}
                {!isCompact ? (
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      msg.author && onOpenUserProfile?.(msg.author, { x: e.clientX, y: e.clientY });
                    }}
                    className="w-8 h-8 rounded-full bg-brand-500 flex items-center justify-center text-white font-bold text-xs flex-shrink-0 mt-0.5 cursor-pointer hover:opacity-85 transition-opacity"
                    title="Ver perfil"
                  >
                    {msg.author?.avatar_url ? (
                      <img src={msg.author.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
                    ) : (
                      <span>{msg.author?.display_name?.[0]?.toUpperCase() || msg.author?.username?.[0]?.toUpperCase() || 'U'}</span>
                    )}
                  </div>
                ) : (
                  <div className="w-8 flex-shrink-0" />
                )}

                {/* Message Bubble & Images */}
                <div className={`max-w-[85%] md:max-w-[75%] flex flex-col ${isMe ? 'items-end text-right' : 'items-start text-left'}`}>
                  {/* Reply Reference Header */}
                  {msg.reply_to && (
                    <div className="flex items-center gap-1.5 text-[10px] text-gray-400 mb-0.5 select-none opacity-80">
                      <CornerDownRight className="w-3 h-3 text-gray-500 flex-shrink-0" />
                      <span className="font-semibold text-brand-400">
                        @{msg.reply_to.author.display_name || msg.reply_to.author.username}
                      </span>
                      <span className="truncate text-gray-400 max-w-xs italic">
                        "{msg.reply_to.content}"
                      </span>
                    </div>
                  )}

                  {!isCompact && (
                    <div className="flex items-baseline gap-2 mb-1">
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          msg.author && onOpenUserProfile?.(msg.author, { x: e.clientX, y: e.clientY });
                        }}
                        className="text-xs font-semibold text-gray-200 hover:underline cursor-pointer hover:text-brand-400 transition-colors"
                        title="Ver perfil"
                      >
                        {msg.author?.display_name || msg.author?.username}
                      </span>
                      <span className="text-[10px] text-gray-500">{timeStr}</span>
                    </div>
                  )}

                  {/* Text content */}
                  {textLines.length > 0 && (
                    <div className={`p-2.5 px-3.5 rounded-2xl text-xs leading-relaxed break-words whitespace-pre-wrap select-text shadow-sm ${
                      isMe ? 'bg-brand-500 text-white rounded-tr-none' : 'bg-background-light text-gray-100 rounded-tl-none'
                    }`}>
                      {renderFormattedText(textLines.join('\n'))}
                    </div>
                  )}

                  {/* Attached Images */}
                  {imageUrls.map((url, idx) => (
                    <div
                      key={idx}
                      className={`mt-1.5 max-w-sm sm:max-w-md overflow-hidden rounded-2xl border border-white/10 shadow-md ${
                        textLines.length === 0 && isMe ? 'rounded-tr-none' : textLines.length === 0 && !isMe ? 'rounded-tl-none' : ''
                      }`}
                    >
                      <img
                        src={url}
                        alt="Imagem enviada"
                        className="max-h-80 w-auto object-contain bg-black/40 cursor-pointer hover:opacity-95 transition-opacity"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onPreviewImage) onPreviewImage(url);
                        }}
                      />
                    </div>
                  ))}

                  {/* Reactions Badges */}
                  {msg.reactions && msg.reactions.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5 select-none">
                      {msg.reactions.map((rx) => {
                        const hasReacted = user && rx.user_ids.includes(user.id);
                        return (
                          <button
                            key={rx.emoji}
                            onClick={() => toggleReaction(msg.id, rx.emoji)}
                            className={`flex items-center gap-1 px-1.5 py-0.5 rounded-lg text-xs font-semibold border transition-all active:scale-95 ${
                              hasReacted
                                ? 'bg-brand-500/30 border-brand-500 text-white'
                                : 'bg-background-darkest border-white/10 text-gray-300 hover:bg-white/5'
                            }`}
                          >
                            <span>{rx.emoji}</span>
                            <span className="text-[10px]">{rx.count}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Replying Banner */}
      {replyingTo && (
        <div className="px-4 py-2 bg-background-darkest border-t border-white/10 flex items-center justify-between text-xs text-gray-300 animate-in fade-in slide-in-from-bottom-1">
          <div className="flex items-center gap-2 truncate">
            <Reply className="w-3.5 h-3.5 text-brand-400 flex-shrink-0" />
            <span className="text-gray-400">Respondendo a</span>
            <span className="font-bold text-brand-400">
              @{replyingTo.author.display_name || replyingTo.author.username}
            </span>
            <span className="text-gray-500 truncate max-w-xs italic hidden md:inline">
              "{replyingTo.content}"
            </span>
          </div>
          <button
            onClick={() => setReplyingTo(null)}
            className="p-1 text-gray-400 hover:text-white rounded-full hover:bg-white/10 transition-colors"
            title="Cancelar resposta"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Selected Image Preview */}
      {selectedImage && (
        <div className="mx-4 mb-2 p-2 bg-background-darkest rounded-2xl border border-white/10 flex items-center justify-between w-max max-w-xs animate-in fade-in">
          <div className="flex items-center gap-2">
            <img src={selectedImage} alt="Preview" className="w-12 h-12 object-cover rounded-xl border border-white/10" />
            <span className="text-xs text-gray-300 font-medium">Imagem anexada</span>
          </div>
          <button
            type="button"
            onClick={() => setSelectedImage(null)}
            className="p-1 hover:bg-white/10 rounded-full text-gray-400 hover:text-white ml-3"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Emoji Picker Popover */}
      {showEmojiPicker && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setShowEmojiPicker(false)} />
          <div className="absolute bottom-20 right-4 z-30 bg-background-darkest p-3 rounded-2xl shadow-2xl border border-white/10 grid grid-cols-6 gap-2 animate-in fade-in zoom-in-95 duration-150">
            {COMMON_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => handleSelectEmoji(emoji)}
                className="w-9 h-9 flex items-center justify-center text-xl hover:bg-white/10 rounded-xl transition-all active:scale-125"
              >
                {emoji}
              </button>
            ))}
          </div>
        </>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Message Input Box */}
      <div className="p-3 md:p-4 bg-background-darker border-t border-black/20 flex items-center gap-2">
        {/* Upload Button */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="text-gray-400 hover:text-white p-2 rounded-full hover:bg-white/5 transition-colors flex-shrink-0"
          title="Anexar imagem (até 20 MB)"
        >
          <PlusCircle className="w-5 h-5" />
        </button>

        {/* Text Input */}
        <div className="flex-1 bg-background-darkest rounded-2xl px-4 py-2 border border-white/5 focus-within:border-brand-500/50 flex items-center gap-2">
          <textarea
            ref={textareaRef}
            value={content}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder={replyingTo ? `Respondendo a @${replyingTo.author.username}...` : `Conversar com @${recipient?.username || 'amigo'}`}
            rows={1}
            className="flex-1 bg-transparent text-gray-100 placeholder-gray-500 text-sm focus:outline-none resize-none py-1 max-h-36 leading-relaxed font-normal no-scrollbar"
          />

          <button
            type="button"
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            className={`p-1 rounded-full hover:bg-white/5 transition-colors ${
              showEmojiPicker ? 'text-brand-500' : 'text-gray-400 hover:text-white'
            }`}
            title="Inserir Emoji"
          >
            <Smile className="w-5 h-5" />
          </button>
        </div>

        {/* Send Button */}
        <button
          type="button"
          onClick={handleSend}
          disabled={!content.trim() && !selectedImage}
          className="bg-brand-500 hover:bg-brand-600 disabled:opacity-40 disabled:hover:bg-brand-500 text-white p-2.5 rounded-2xl transition-all shadow-md shadow-brand-500/20 active:scale-95 flex-shrink-0"
          title="Enviar Mensagem"
        >
          <SendHorizontal className="w-5 h-5" />
        </button>
      </div>

      {/* 2k Char / 20MB Limit Modal */}
      {limitAlert && (
        <LimitAlertModal
          isOpen={true}
          title={limitAlert.title}
          message={limitAlert.message}
          detail={limitAlert.detail}
          onClose={() => setLimitAlert(null)}
        />
      )}
    </div>
  );
};
