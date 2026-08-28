import React, { useState, useRef, useEffect } from 'react';
import { PlusCircle, SendHorizontal, Smile, X } from 'lucide-react';
import { Channel } from '../../types';
import { socket } from '../../lib/socket';
import { LimitAlertModal } from '../Modals/LimitAlertModal';

interface MessageInputProps {
  channel: Channel;
  onSendMessage: (content: string) => Promise<void>;
}

const COMMON_EMOJIS = ['😀', '😂', '🔥', '👍', '❤️', '🎉', '😎', '🚀', '👀', '✨', '💀', '💯'];
const MAX_CHARS = 2000;
const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB

export const MessageInput: React.FC<MessageInputProps> = ({ channel, onSendMessage }) => {
  const [content, setContent] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [limitAlert, setLimitAlert] = useState<{ title: string; message: string; detail?: string } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastTypingTime = useRef<number>(0);

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

    setContent('');
    setSelectedImage(null);
    setShowEmojiPicker(false);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    await onSendMessage(finalContent);
  };

  const handleKeyDown = async (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      await handleSend();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setContent(val);

    const now = Date.now();
    if (now - lastTypingTime.current > 3000) {
      lastTypingTime.current = now;
      socket.send('TYPING_START', {
        channel_id: channel.id,
        guild_id: channel.guild_id,
      });
    }

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check 20MB file limit
    if (file.size > MAX_FILE_BYTES) {
      setLimitAlert({
        title: 'Arquivo Muito Grande',
        message: 'O limite de tamanho de imagens, vídeos e arquivos é de 20 MB.',
        detail: `Tamanho: ${(file.size / (1024 * 1024)).toFixed(1)} MB / Limite: 20 MB`,
      });
      e.target.value = '';
      return;
    }

    // Convert and compress with Canvas
    const reader = new FileReader();
    reader.onload = (loadEvt) => {
      const src = loadEvt.target?.result as string;
      if (!src) return;

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

  const handleInsertEmoji = (emoji: string) => {
    setContent((prev) => prev + emoji);
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [channel.id]);

  const charsLeft = MAX_CHARS - content.length;
  const isNearOrExceededLimit = content.length > 1800;

  return (
    <div className="p-3 md:p-4 pt-0 relative">
      {/* Limit Alert Modal */}
      {limitAlert && (
        <LimitAlertModal
          isOpen={!!limitAlert}
          title={limitAlert.title}
          message={limitAlert.message}
          detail={limitAlert.detail}
          onClose={() => setLimitAlert(null)}
        />
      )}

      {/* Emoji Picker Popover */}
      {showEmojiPicker && (
        <div className="absolute bottom-16 right-4 z-30 bg-background-darkest p-3 rounded-2xl shadow-2xl border border-white/10 flex flex-wrap gap-2 max-w-[240px] animate-in fade-in zoom-in-95">
          {COMMON_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => handleInsertEmoji(emoji)}
              className="text-xl hover:scale-125 transition-transform p-1 rounded hover:bg-white/10"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      {/* Selected Image Preview */}
      {selectedImage && (
        <div className="mb-2 p-2 bg-background-darkest rounded-xl border border-white/10 flex items-center gap-3 w-fit">
          <img src={selectedImage} alt="Anexo" className="h-16 w-16 object-cover rounded-lg" />
          <button
            type="button"
            onClick={() => setSelectedImage(null)}
            className="text-gray-400 hover:text-white p-1 rounded-full bg-white/10"
            title="Remover anexo"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Warning indicator when typing near 2000 chars */}
      {isNearOrExceededLimit && (
        <div className="mb-1 flex justify-end">
          <span
            className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
              charsLeft < 0
                ? 'bg-dnd/20 text-dnd animate-pulse'
                : 'bg-yellow-500/20 text-yellow-400'
            }`}
          >
            {charsLeft < 0 ? `Excedido por ${Math.abs(charsLeft)}` : `${charsLeft} restantes`}
          </span>
        </div>
      )}

      <div
        className={`bg-background-light/70 rounded-2xl px-3 md:px-4 py-2 flex items-center gap-2 md:gap-3 border transition-colors shadow-inner ${
          charsLeft < 0 ? 'border-dnd/60' : 'border-white/5 focus-within:border-brand-500/50'
        }`}
      >
        {/* Hidden File Input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*,.pdf,.doc,.docx,.zip,.txt"
          className="hidden"
          onChange={handleImageUpload}
        />

        {/* Upload attachment button */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="text-gray-400 hover:text-brand-500 transition-colors p-1"
          title="Adicionar imagem/anexo (Máx. 20MB)"
        >
          <PlusCircle className="w-5 h-5" />
        </button>

        {/* Text Input */}
        <textarea
          ref={textareaRef}
          rows={1}
          value={content}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={`Conversar em #${channel.name}`}
          className="flex-1 bg-transparent text-gray-100 placeholder-gray-500 text-sm focus:outline-none resize-none max-h-40 py-1 leading-normal"
        />

        {/* Action icons */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            className={`p-1 rounded-lg transition-colors ${
              showEmojiPicker ? 'text-brand-500 bg-white/10' : 'text-gray-400 hover:text-gray-200'
            }`}
            title="Emoji"
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
  );
};
