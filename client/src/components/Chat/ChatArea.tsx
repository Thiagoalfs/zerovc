import React, { useEffect, useRef, useState } from 'react';
import { Hash, Users, Menu, Pin, Search, X, UploadCloud } from 'lucide-react';
import { useGuildStore } from '../../stores/guildStore';
import { MessageItem } from './MessageItem';
import { MessageInput } from './MessageInput';
import { MemberList } from '../Sidebar/MemberList';
import { User, Message } from '../../types';

interface ChatAreaProps {
  onOpenMobileDrawer?: () => void;
  onOpenUserProfile?: (user: User, position?: { x: number; y: number }) => void;
  onOpenDM?: (userId: string) => void;
  onPreviewImage?: (url: string) => void;
  isMemberListOpen?: boolean;
  onToggleMemberList?: (open: boolean) => void;
}

export const ChatArea: React.FC<ChatAreaProps> = ({
  onOpenMobileDrawer,
  onOpenUserProfile,
  onOpenDM,
  onPreviewImage,
  isMemberListOpen,
  onToggleMemberList,
}) => {
  const {
    activeChannel,
    messages,
    isLoadingMessages,
    isLoadingMoreMessages,
    hasMoreByChannel,
    loadMoreMessages,
    sendMessage,
    typingUsers,
  } = useGuildStore();
  const [localShowMemberList, setLocalShowMemberList] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [showPinnedOnly, setShowPinnedOnly] = useState(false);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [droppedFile, setDroppedFile] = useState<File | null>(null);
  const dragCounterRef = useRef<number>(0);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const prevScrollHeightRef = useRef<number | null>(null);
  const isAutoScrollingRef = useRef<boolean>(false);

  const isInitialLoadRef = useRef<boolean>(true);
  const prevChannelIdRef = useRef<string | null>(null);

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current += 1;
    if (e.dataTransfer?.types?.includes('Files')) {
      setIsDraggingFile(true);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setIsDraggingFile(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDraggingFile(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      setDroppedFile(files[0]);
    }
  };

  const showMembers = isMemberListOpen !== undefined ? isMemberListOpen : localShowMemberList;
  const toggleMembers = () => {
    if (onToggleMemberList) {
      onToggleMemberList(!showMembers);
    } else {
      setLocalShowMemberList(!showMembers);
    }
  };

  const scrollToBottom = (smooth = false) => {
    if (!showPinnedOnly && !searchQuery) {
      if (scrollContainerRef.current) {
        if (smooth) {
          scrollContainerRef.current.scrollTo({
            top: scrollContainerRef.current.scrollHeight,
            behavior: 'smooth',
          });
        } else {
          scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
        }
      }
    }
  };

  // Reset initial load flag on channel change
  useEffect(() => {
    if (activeChannel?.id !== prevChannelIdRef.current) {
      prevChannelIdRef.current = activeChannel?.id || null;
      isInitialLoadRef.current = true;
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
      }
    }
  }, [activeChannel?.id]);

  // Keep scroll position when loading older messages OR scroll instantly to bottom on initial load
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    if (prevScrollHeightRef.current !== null) {
      const heightDiff = container.scrollHeight - prevScrollHeightRef.current;
      if (heightDiff > 0) {
        container.scrollTop = heightDiff;
      }
      prevScrollHeightRef.current = null;
      return;
    }

    if (isInitialLoadRef.current) {
      container.scrollTop = container.scrollHeight;
      if (messages.length > 0) {
        isInitialLoadRef.current = false;
      }
      return;
    }

    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 200;
    if (isNearBottom && !isAutoScrollingRef.current) {
      scrollToBottom(true);
    }
  }, [messages]);

  const handleScroll = () => {
    const container = scrollContainerRef.current;
    if (!container || !activeChannel) return;

    // Detect near top scroll for pagination
    if (container.scrollTop < 60 && !isLoadingMoreMessages && hasMoreByChannel[activeChannel.id] !== false) {
      prevScrollHeightRef.current = container.scrollHeight;
      loadMoreMessages(activeChannel.id);
    }
  };

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

  // Filter messages based on search & pinned filter
  const displayedMessages = messages.filter((msg) => {
    if (showPinnedOnly && !msg.is_pinned) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchContent = msg.content.toLowerCase().includes(q);
      const matchAuthor = (msg.author?.display_name || msg.author?.username || '').toLowerCase().includes(q);
      if (!matchContent && !matchAuthor) return false;
    }
    return true;
  });

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="flex-1 bg-background-dark flex flex-row h-full overflow-hidden relative"
    >
      {/* Drag & Drop Files Overlay */}
      {isDraggingFile && (
        <div className="absolute inset-3 z-50 bg-background-darkest/90 backdrop-blur-md border-2 border-dashed border-brand-500 rounded-3xl flex flex-col items-center justify-center gap-3 p-6 animate-in fade-in zoom-in-95 pointer-events-none shadow-2xl">
          <div className="w-16 h-16 rounded-2xl bg-brand-500/20 text-brand-400 flex items-center justify-center shadow-inner animate-bounce">
            <UploadCloud className="w-8 h-8" />
          </div>
          <div className="text-center">
            <h3 className="text-lg font-bold text-white mb-0.5">Solte seus arquivos aqui</h3>
            <p className="text-xs text-gray-400">Imagens, vídeos ou documentos (até 20 MB)</p>
          </div>
        </div>
      )}

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
            <Hash className="w-5 h-5 md:w-6 md:h-6 text-gray-400 flex-shrink-0" />
            <span className="font-bold text-gray-100 truncate text-sm md:text-base">{activeChannel.name}</span>
          </div>

          {/* Right Header Actions */}
          <div className="flex items-center gap-1 md:gap-2">
            {/* Search Input / Toggle */}
            {isSearchOpen ? (
              <div className="flex items-center gap-1 bg-background-darkest px-2 py-1 rounded-xl border border-white/10 text-xs">
                <Search className="w-3.5 h-3.5 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar mensagens..."
                  autoFocus
                  className="bg-transparent text-gray-100 placeholder-gray-500 focus:outline-none w-32 md:w-48"
                />
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setIsSearchOpen(false);
                  }}
                  className="p-0.5 text-gray-400 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setIsSearchOpen(true)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-white/5 transition-colors"
                title="Buscar no canal"
              >
                <Search className="w-5 h-5" />
              </button>
            )}

            {/* Pinned Messages Filter Toggle */}
            <button
              onClick={() => setShowPinnedOnly(!showPinnedOnly)}
              className={`p-1.5 rounded-lg transition-colors ${
                showPinnedOnly
                  ? 'text-amber-400 bg-amber-400/15'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
              }`}
              title={showPinnedOnly ? 'Mostrar todas as mensagens' : 'Mensagens Fixadas'}
            >
              <Pin className="w-5 h-5" />
            </button>

            {/* Member List Toggle */}
            <button
              onClick={toggleMembers}
              className={`p-1.5 rounded-lg transition-colors ${
                showMembers
                  ? 'text-brand-400 bg-white/10'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
              }`}
              title="Lista de Membros"
            >
              <Users className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Pinned or Search Active Notice Banner */}
        {(showPinnedOnly || searchQuery) && (
          <div className="bg-background-darkest/90 border-b border-white/5 px-4 py-2 flex items-center justify-between text-xs text-gray-300">
            <span>
              {showPinnedOnly
                ? `Exibindo apenas mensagens fixadas (${displayedMessages.length})`
                : `Resultados da busca para "${searchQuery}" (${displayedMessages.length})`}
            </span>
            <button
              onClick={() => {
                setShowPinnedOnly(false);
                setSearchQuery('');
              }}
              className="text-brand-400 hover:underline font-semibold"
            >
              Limpar filtro
            </button>
          </div>
        )}

        {/* Messages Scroll Area */}
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-2 md:px-4 py-2 no-scrollbar"
        >
          {/* Loading older messages indicator */}
          {isLoadingMoreMessages && (
            <div className="flex justify-center items-center gap-2 py-3 text-xs text-gray-400">
              <div className="w-3.5 h-3.5 border-2 border-brand-400 border-t-transparent rounded-full animate-spin" />
              <span>Carregando mensagens anteriores...</span>
            </div>
          )}

          {/* Welcome Header (show only when reached the absolute top / no more older messages) */}
          {!showPinnedOnly && !searchQuery && hasMoreByChannel[activeChannel.id] === false && (
            <div className="px-2 md:px-4 py-6 md:py-8 mb-4 border-b border-white/5 select-none">
              <div className="w-12 h-12 md:w-16 md:h-16 rounded-full bg-background-light flex items-center justify-center mb-3">
                <Hash className="w-6 h-6 md:w-10 md:h-10 text-white" />
              </div>
              <h2 className="text-xl md:text-2xl font-bold text-white mb-1">Bem-vindo a #{activeChannel.name}!</h2>
              <p className="text-xs md:text-sm text-gray-400">Este é o início do canal #{activeChannel.name}.</p>
            </div>
          )}

          {isLoadingMessages ? (
            <div className="flex justify-center py-6 text-sm text-gray-500">Carregando mensagens...</div>
          ) : displayedMessages.length === 0 ? (
            <div className="flex justify-center py-10 text-sm text-gray-500">Nenhuma mensagem encontrada.</div>
          ) : (
            displayedMessages.map((message, index) => {
              const prevMessage = index > 0 ? displayedMessages[index - 1] : null;
              const isCompact = (() => {
                if (!prevMessage) return false;
                if (prevMessage.author_id !== message.author_id) return false;
                if (message.reply_to) return false;
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
                  onOpenUserProfile={onOpenUserProfile}
                  onOpenDM={onOpenDM}
                  onPreviewImage={onPreviewImage}
                  onReply={(msg) => setReplyingTo(msg)}
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
        <MessageInput
          channel={activeChannel}
          replyingTo={replyingTo}
          onCancelReply={() => setReplyingTo(null)}
          onSendMessage={sendMessage}
          droppedFile={droppedFile}
          onClearDroppedFile={() => setDroppedFile(null)}
        />
      </div>

      {/* Right-side Member List Sidebar */}
      <MemberList
        isOpen={showMembers}
        onClose={() => {
          if (onToggleMemberList) onToggleMemberList(false);
          else setLocalShowMemberList(false);
        }}
        onSelectUser={onOpenUserProfile}
        onOpenDM={onOpenDM}
      />
    </div>
  );
};
