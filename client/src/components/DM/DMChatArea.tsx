import React, { useState, useRef, useEffect } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { MessageSquare, PlusCircle, SendHorizontal, Smile, X, Menu } from 'lucide-react';
import { useDMStore } from '../../stores/dmStore';
import { useAuthStore } from '../../stores/authStore';

interface DMChatAreaProps {
  onOpenMobileDrawer?: () => void;
}

const COMMON_EMOJIS = ['😀', '😂', '🔥', '👍', '❤️', '🎉', '😎', '🚀', '👀', '✨', '💀', '💯'];

export const DMChatArea: React.FC<DMChatAreaProps> = ({ onOpenMobileDrawer }) => {
  const { user } = useAuthStore();
  const { activeRoom, messages, sendMessage, isLoadingMessages } = useDMStore();

  const [content, setContent] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (!activeRoom) {
    return (
      <div className="flex-1 bg-background-dark flex flex-col items-center justify-center text-gray-400 p-4">
        {onOpenMobileDrawer && (
          <button
            onClick={onOpenMobileDrawer}
            className="md:hidden absolute top-4 left-4 text-gray-400 hover:text-white p-2 rounded-lg bg-white/5"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}
        <MessageSquare className="w-16 h-16 text-gray-600 mb-3 stroke-1" />
        <h3 className="text-lg font-bold text-gray-200">Suas Mensagens Diretas</h3>
        <p className="text-xs text-gray-500 mt-1 max-w-sm text-center">
          Selecione um amigo na lista de amigos ou abra uma conversa para começar a bater papo privado.
        </p>
      </div>
    );
  }

  const recipient = activeRoom.recipient;

  const handleSend = async () => {
    let finalContent = content.trim();
    if (selectedImage) {
      finalContent = finalContent ? `${finalContent}\n${selectedImage}` : selectedImage;
    }
    if (!finalContent) return;

    setContent('');
    setSelectedImage(null);
    setShowEmojiPicker(false);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    await sendMessage(finalContent);
  };

  const handleKeyDown = async (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      await handleSend();
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (loadEvt) => {
      const src = loadEvt.target?.result as string;
      if (!src) return;

      // Compress and resize with Canvas for optimal performance
      const img = new Image();
      img.onload = () => {
        const maxWidth = 1280;
        const maxHeight = 1280;
        let width = img.width;
        let height = img.height;

        if (width > maxWidth || height > maxHeight) {
          if (width > height) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          } else {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressed = canvas.toDataURL('image/jpeg', 0.85);
          setSelectedImage(compressed);
        } else {
          setSelectedImage(src);
        }
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const getStatusColor = (s?: string) => {
    switch (s) {
      case 'online': return 'bg-online';
      case 'idle': return 'bg-idle';
      case 'dnd': return 'bg-dnd';
      default: return 'bg-offline';
    }
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
            className="text-brand-400 hover:underline break-all"
          >
            {part}
          </a>
        );
      }
      return part;
    });
  };

  return (
    <div className="flex-1 bg-background-dark flex flex-col h-full overflow-hidden select-none">
      {/* DM Header */}
      <div className="h-12 border-b border-black/20 px-3 md:px-4 flex items-center justify-between shadow-sm z-10">
        <div className="flex items-center gap-3 truncate">
          {onOpenMobileDrawer && (
            <button
              onClick={onOpenMobileDrawer}
              className="md:hidden text-gray-400 hover:text-white p-1 -ml-1 rounded hover:bg-white/10 transition-colors"
            >
              <Menu className="w-5 h-5" />
            </button>
          )}

          {/* Recipient Avatar */}
          <div className="relative w-7 h-7 rounded-full bg-brand-500 flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
            {recipient?.avatar_url ? (
              <img src={recipient.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
            ) : (
              <span>{recipient?.display_name?.[0]?.toUpperCase() || recipient?.username[0]?.toUpperCase() || 'U'}</span>
            )}
            <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border border-background-dark ${getStatusColor(recipient?.status)}`} />
          </div>

          <div className="flex flex-col truncate">
            <span className="font-bold text-gray-100 text-sm truncate">
              {recipient?.display_name || recipient?.username}
            </span>
            <span className="text-[10px] text-gray-400 truncate">@{recipient?.username}</span>
          </div>
        </div>
      </div>

      {/* DM Messages Feed */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {/* Recipient Intro Hero Card */}
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

        {isLoadingMessages ? (
          <div className="flex justify-center py-6 text-xs text-gray-500">Carregando mensagens...</div>
        ) : (
          messages.map((msg, index) => {
            const isMe = msg.author_id === user?.id;
            const prevMsg = index > 0 ? messages[index - 1] : null;
            const isCompact = (() => {
              if (!prevMsg) return false;
              if (prevMsg.author_id !== msg.author_id) return false;
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

            // Separate text lines from images (base64 data:image or URL links)
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
                className={`flex gap-3 px-3 rounded-xl hover:bg-background-darkest/40 transition-colors ${
                  isCompact ? 'py-0.5' : 'py-1.5 mt-1'
                } ${isMe ? 'flex-row-reverse' : ''}`}
              >
                {/* Avatar */}
                {!isCompact ? (
                  <div className="w-8 h-8 rounded-full bg-brand-500 flex items-center justify-center text-white font-bold text-xs flex-shrink-0 mt-0.5">
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
                  {!isCompact && (
                    <div className="flex items-baseline gap-2 mb-1">
                      <span className="text-xs font-semibold text-gray-200">
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
                        onClick={() => window.open(url, '_blank')}
                      />
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* DM Message Input */}
      <div className="p-3 md:p-4 pt-0 relative">
        {showEmojiPicker && (
          <div className="absolute bottom-16 right-4 z-30 bg-background-darkest p-3 rounded-2xl shadow-2xl border border-white/10 flex flex-wrap gap-2 max-w-[240px] animate-in fade-in zoom-in-95">
            {COMMON_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => setContent((prev) => prev + emoji)}
                className="text-xl hover:scale-125 transition-transform p-1 rounded hover:bg-white/10"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}

        {selectedImage && (
          <div className="mb-2 p-2 bg-background-darkest rounded-xl border border-white/10 flex items-center gap-3 w-fit">
            <img src={selectedImage} alt="Anexo" className="h-16 w-16 object-cover rounded-lg" />
            <button
              type="button"
              onClick={() => setSelectedImage(null)}
              className="text-gray-400 hover:text-white p-1 rounded-full bg-white/10"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="bg-background-light/70 rounded-2xl px-3 md:px-4 py-2 flex items-center gap-2 md:gap-3 border border-white/5 focus-within:border-brand-500/50 transition-colors shadow-inner">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImageUpload}
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="text-gray-400 hover:text-brand-500 transition-colors p-1"
          >
            <PlusCircle className="w-5 h-5" />
          </button>

          <textarea
            ref={textareaRef}
            rows={1}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Conversar com @${recipient?.display_name || recipient?.username}`}
            className="flex-1 bg-transparent text-gray-100 placeholder-gray-500 text-sm focus:outline-none resize-none max-h-40 py-1 leading-normal"
          />

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              className={`p-1 rounded-lg transition-colors ${
                showEmojiPicker ? 'text-brand-500 bg-white/10' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <Smile className="w-5 h-5" />
            </button>

            {(content.trim() || selectedImage) && (
              <button
                onClick={handleSend}
                className="bg-brand-500 hover:bg-brand-600 text-white transition-colors p-1.5 rounded-xl shadow-md"
              >
                <SendHorizontal className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
