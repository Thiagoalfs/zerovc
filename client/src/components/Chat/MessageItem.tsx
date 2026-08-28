import React from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Message } from '../../types';

interface MessageItemProps {
  message: Message;
}

export const MessageItem: React.FC<MessageItemProps> = ({ message }) => {
  const formattedTime = (() => {
    try {
      return format(new Date(message.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR });
    } catch {
      return '';
    }
  })();

  // Separate image URLs or data URLs from plain text
  const lines = message.content.split('\n');
  const textLines: string[] = [];
  const imageUrls: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('data:image/') || (trimmed.startsWith('http') && (trimmed.endsWith('.png') || trimmed.endsWith('.jpg') || trimmed.endsWith('.jpeg') || trimmed.endsWith('.gif') || trimmed.endsWith('.webp')))) {
      imageUrls.push(trimmed);
    } else {
      textLines.push(line);
    }
  }

  const renderFormattedText = (text: string) => {
    // Basic URL linkify
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
    <div className="flex gap-3 md:gap-4 px-3 md:px-4 py-2 hover:bg-background-dark/50 group rounded-xl transition-colors">
      {/* Avatar */}
      <div className="w-9 h-9 md:w-10 md:h-10 rounded-full bg-brand-500 flex items-center justify-center font-bold text-white flex-shrink-0 mt-0.5 shadow-sm text-sm">
        {message.author?.avatar_url ? (
          <img
            src={message.author.avatar_url}
            alt={message.author.username}
            className="w-full h-full rounded-full object-cover"
          />
        ) : (
          <span>{message.author?.username?.[0]?.toUpperCase() || 'U'}</span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="font-semibold text-sm text-gray-100 hover:underline cursor-pointer">
            {message.author?.username || 'Usuário'}
          </span>
          <span className="text-[10px] md:text-[11px] text-gray-400 font-normal">{formattedTime}</span>
        </div>

        {textLines.length > 0 && (
          <div className="text-sm text-gray-200 mt-0.5 leading-relaxed break-words whitespace-pre-wrap select-text">
            {renderFormattedText(textLines.join('\n'))}
          </div>
        )}

        {/* Render Attached Images */}
        {imageUrls.map((url, idx) => (
          <div key={idx} className="mt-2 max-w-md overflow-hidden rounded-xl border border-white/10 shadow-md">
            <img src={url} alt="Imagem enviada" className="max-h-80 w-auto object-contain bg-black/40" />
          </div>
        ))}
      </div>
    </div>
  );
};
