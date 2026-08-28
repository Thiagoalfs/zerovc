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

  return (
    <div className="flex gap-4 px-4 py-1.5 hover:bg-background-dark/50 group rounded-md transition-colors">
      {/* Avatar */}
      <div className="w-10 h-10 rounded-full bg-brand-500 flex items-center justify-center font-bold text-white flex-shrink-0 mt-0.5 shadow-sm">
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
          <span className="text-[11px] text-gray-400 font-normal">{formattedTime}</span>
        </div>

        <div className="text-sm text-gray-200 mt-0.5 leading-relaxed break-words whitespace-pre-wrap select-text">
          {message.content}
        </div>
      </div>
    </div>
  );
};
