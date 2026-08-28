import React, { useEffect, useRef } from 'react';
import { Hash, Users, Bell, Pin } from 'lucide-react';
import { useGuildStore } from '../../stores/guildStore';
import { MessageItem } from './MessageItem';
import { MessageInput } from './MessageInput';

export const ChatArea: React.FC = () => {
  const { activeChannel, messages, isLoadingMessages, sendMessage, typingUsers } = useGuildStore();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  if (!activeChannel) {
    return (
      <div className="flex-1 bg-background-dark flex items-center justify-center text-gray-500 font-medium">
        Selecione um canal para começar a conversar
      </div>
    );
  }

  const typingForThisChannel = activeChannel ? typingUsers.get(activeChannel.id) : null;
  const isSomeoneTyping = typingForThisChannel && typingForThisChannel.size > 0;

  return (
    <div className="flex-1 bg-background-dark flex flex-col h-full overflow-hidden">
      {/* Channel Header */}
      <div className="h-12 border-b border-black/20 px-4 flex items-center justify-between shadow-sm select-none z-10">
        <div className="flex items-center gap-2">
          <Hash className="w-6 h-6 text-gray-400" />
          <span className="font-bold text-gray-100">{activeChannel.name}</span>
          {activeChannel.topic && (
            <>
              <div className="w-[1px] h-4 bg-white/10 mx-2" />
              <span className="text-xs text-gray-400 truncate max-w-md">{activeChannel.topic}</span>
            </>
          )}
        </div>

        <div className="flex items-center gap-4 text-gray-400">
          <button className="hover:text-gray-200 transition-colors" title="Mensagens Fixadas">
            <Pin className="w-5 h-5" />
          </button>
          <button className="hover:text-gray-200 transition-colors" title="Notificações">
            <Bell className="w-5 h-5" />
          </button>
          <button className="hover:text-gray-200 transition-colors" title="Lista de Membros">
            <Users className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto px-2 py-4 space-y-1">
        {/* Welcome Header */}
        <div className="px-4 py-8 mb-4 border-b border-white/5 select-none">
          <div className="w-16 h-16 rounded-full bg-background-light flex items-center justify-center mb-3">
            <Hash className="w-10 h-10 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-1">Bem-vindo a #{activeChannel.name}!</h2>
          <p className="text-sm text-gray-400">Este é o início do canal #{activeChannel.name}.</p>
        </div>

        {isLoadingMessages ? (
          <div className="flex justify-center py-6 text-sm text-gray-500">Carregando mensagens...</div>
        ) : (
          messages.map((message) => <MessageItem key={message.id} message={message} />)
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Typing Indicator */}
      <div className="h-5 px-4 text-xs text-gray-400 flex items-center">
        {isSomeoneTyping && (
          <div className="flex items-center gap-1.5 animate-pulse">
            <span className="font-semibold text-gray-300">Alguém</span>
            <span>está digitando...</span>
          </div>
        )}
      </div>

      {/* Message Input */}
      <MessageInput channel={activeChannel} onSendMessage={sendMessage} />
    </div>
  );
};
