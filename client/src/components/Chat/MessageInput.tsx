import React, { useState, useRef, useEffect } from 'react';
import { PlusCircle, SendHorizontal, Smile, X, Image as ImageIcon } from 'lucide-react';
import { Channel } from '../../types';
import { socket } from '../../lib/socket';

interface MessageInputProps {
  channel: Channel;
  onSendMessage: (content: string) => Promise<void>;
}

const COMMON_EMOJIS = ['😀', '😂', '🔥', '👍', '❤️', '🎉', '😎', '🚀', '👀', '✨', '💀', '💯'];

export const MessageInput: React.FC<MessageInputProps> = ({ channel, onSendMessage }) => {
  const [content, setContent] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastTypingTime = useRef<number>(0);

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

    await onSendMessage(finalContent);
  };

  const handleKeyDown = async (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      await handleSend();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);

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

    // Convert to base64 data URL
    const reader = new FileReader();
    reader.onload = (loadEvt) => {
      const base64 = loadEvt.target?.result as string;
      if (base64) {
        setSelectedImage(base64);
      }
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

  return (
    <div className="p-3 md:p-4 pt-0 relative">
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

      <div className="bg-background-light/70 rounded-2xl px-3 md:px-4 py-2 flex items-center gap-2 md:gap-3 border border-white/5 focus-within:border-brand-500/50 transition-colors shadow-inner">
        {/* Hidden File Input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleImageUpload}
        />

        {/* Upload attachment button */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="text-gray-400 hover:text-brand-500 transition-colors p-1"
          title="Adicionar imagem/anexo"
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
