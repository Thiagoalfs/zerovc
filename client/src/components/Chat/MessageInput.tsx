import React, { useState, useRef, useEffect } from 'react';
import { PlusCircle, SendHorizontal, Smile } from 'lucide-react';
import { Channel } from '../../types';
import { socket } from '../../lib/socket';

interface MessageInputProps {
  channel: Channel;
  onSendMessage: (content: string) => Promise<void>;
}

export const MessageInput: React.FC<MessageInputProps> = ({ channel, onSendMessage }) => {
  const [content, setContent] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastTypingTime = useRef<number>(0);

  const handleKeyDown = async (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!content.trim()) return;

      const toSend = content.trim();
      setContent('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }

      await onSendMessage(toSend);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);

    // Emit TYPING_START with 3s throttle
    const now = Date.now();
    if (now - lastTypingTime.current > 3000) {
      lastTypingTime.current = now;
      socket.send('TYPING_START', {
        channel_id: channel.id,
        guild_id: channel.guild_id,
      });
    }

    // Auto grow textarea
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  };

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [channel.id]);

  return (
    <div className="p-4 pt-0">
      <div className="bg-background-light/70 rounded-lg px-4 py-2.5 flex items-center gap-3 border border-white/5 focus-within:border-white/10 transition-colors">
        {/* Upload attachment button */}
        <button
          type="button"
          className="text-gray-400 hover:text-gray-200 transition-colors"
          title="Adicionar anexo"
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
          className="flex-1 bg-transparent text-gray-100 placeholder-gray-500 text-sm focus:outline-none resize-none max-h-48 py-1 leading-normal"
        />

        {/* Action icons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="text-gray-400 hover:text-gray-200 transition-colors"
            title="Emoji"
          >
            <Smile className="w-5 h-5" />
          </button>

          {content.trim() && (
            <button
              onClick={async () => {
                if (!content.trim()) return;
                const toSend = content.trim();
                setContent('');
                await onSendMessage(toSend);
              }}
              className="text-brand-500 hover:text-brand-600 transition-colors p-1"
            >
              <SendHorizontal className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
