import React, { useEffect, useRef, useState } from 'react';
import { Hash, Users, Menu } from 'lucide-react';
import { useGuildStore } from '../../stores/guildStore';
import { MessageItem } from './MessageItem';
import { MessageInput } from './MessageInput';
import { MemberList } from '../Sidebar/MemberList';

interface ChatAreaProps {
  onOpenMobileDrawer?: () => void;
}

export const ChatArea: React.FC<ChatAreaProps> = ({ onOpenMobileDrawer }) => {
  const { activeChannel, messages, isLoadingMessages, sendMessage, typingUsers } = useGuildStore();
  const [showMemberList, setShowMemberList] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  if (!activeChannel) {
    return (
      <div className="flex-1 bg-background-dark flex flex-col items-center justify-center text-gray-500 font-medium p-4">
        {onOpenMobileDrawer && (
          <button
            onClick={onOpenMobileDrawer}
            className="md:hidden mb-4 bg-brand-500 text-white px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2"
          >
            <Menu className="w-4 h-4" />
            <span>Abrir Servidores e Canais</span>
          </button>
        )}
        <span>Selecione um canal para começar a conversar</span>
      </div>
    );
  }

  const typingForThisChannel = activeChannel ? typingUsers.get(activeChannel.id) : null;
  const isSomeoneTyping = typingForThisChannel && typingForThisChannel.size > 0;

  return (
    <div className="flex-1 bg-background-dark flex flex-row h-full overflow-hidden relative">
      {/* Center Chat View */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Channel Header */}
        <div className="h-12 border-b border-black/20 px-3 md:px-4 flex items-center justify-between shadow-sm select-none z-10">
          <div className="flex items-center gap-2 truncate">
            {/* Mobile Hamburger Drawer Toggle */}
            {onOpenMobileDrawer && (
              <button
                onClick={onOpenMobileDrawer}
                className="md:hidden text-gray-400 hover:text-white p-1 -ml-1 rounded hover:bg-white/10 transition-colors"
                title="Menu de Canais"
              >
                <Menu className="w-5 h-5" />
              </button>
            )}

            <Hash className="w-5 h-5 text-gray-400 flex-shrink-0" />
            <span className="font-bold text-gray-100 truncate text-sm md:text-base">{activeChannel.name}</span>
            {activeChannel.topic && (
              <>
                <div className="hidden sm:block w-[1px] h-4 bg-white/10 mx-1.5" />
                <span className="hidden sm:inline-block text-xs text-gray-400 truncate max-w-xs md:max-w-md">
                  {activeChannel.topic}
                </span>
              </>
            )}
          </div>

          <div className="flex items-center gap-2 text-gray-400">
            <button
              onClick={() => setShowMemberList(!showMemberList)}
              className={`p-1.5 rounded-lg transition-colors ${
                showMemberList ? 'text-gray-100 bg-white/15' : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
              }`}
              title="Lista de Membros"
            >
              <Users className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Messages Scroll Area */}
        <div className="flex-1 overflow-y-auto px-2 md:px-4 py-4 space-y-1">
          {/* Welcome Header */}
          <div className="px-2 md:px-4 py-6 md:py-8 mb-4 border-b border-white/5 select-none">
            <div className="w-12 h-12 md:w-16 md:h-16 rounded-full bg-background-light flex items-center justify-center mb-3">
              <Hash className="w-6 h-6 md:w-10 md:h-10 text-white" />
            </div>
            <h2 className="text-xl md:text-2xl font-bold text-white mb-1">Bem-vindo a #{activeChannel.name}!</h2>
            <p className="text-xs md:text-sm text-gray-400">Este é o início do canal #{activeChannel.name}.</p>
          </div>

          {isLoadingMessages ? (
            <div className="flex justify-center py-6 text-sm text-gray-500">Carregando mensagens...</div>
          ) : (
            messages.map((message, index) => {
              const prevMessage = index > 0 ? messages[index - 1] : null;
              const isCompact = (() => {
                if (!prevMessage) return false;
                if (prevMessage.author_id !== message.author_id) return false;
                const prevTime = new Date(prevMessage.created_at).getTime();
                const currTime = new Date(message.created_at).getTime();
                if (isNaN(prevTime) || isNaN(currTime)) return false;
                const diffMs = currTime - prevTime;
                return diffMs >= 0 && diffMs <= 5 * 60 * 1000;
              })();

              return (
                <MessageItem
                  key={message.id}
                  message={message}
                  isCompact={isCompact}
                />
              );
            })
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Typing Indicator */}
        <div className="h-5 px-3 md:px-4 text-xs text-gray-400 flex items-center">
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

      {/* Right Sidebar: Member List */}
      <MemberList isOpen={showMemberList} onClose={() => setShowMemberList(false)} />
    </div>
  );
};
