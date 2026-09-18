import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  MessageSquare,
  Menu,
  Phone,
  Search,
  X,
  Pin,
  UploadCloud,
} from 'lucide-react';
import { useDMStore } from '../../stores/dmStore';
import { useAuthStore } from '../../stores/authStore';
import { useCallStore } from '../../stores/callStore';
import { useFriendStore } from '../../stores/friendStore';
import { formatAssetUrl } from '../../lib/api';
import { ActiveCallOverlay } from './ActiveCallOverlay';
import { MessageItem } from '../Chat/MessageItem';
import { MessageInput } from '../Chat/MessageInput';
import { User, DMMessage } from '../../types';

interface DMChatAreaProps {
  onOpenMobileDrawer?: () => void;
  onOpenUserProfile?: (user: User, position?: { x: number; y: number }) => void;
  onPreviewImage?: (url: string) => void;
  onOpenScreenShare?: () => void;
}

export const DMChatArea: React.FC<DMChatAreaProps> = ({
  onOpenMobileDrawer,
  onOpenUserProfile,
  onPreviewImage,
  onOpenScreenShare,
}) => {
  const { user } = useAuthStore();
  const {
    activeRoom,
    messages,
    pinnedMessagesByRoom,
    isLoadingPinned,
    fetchPinnedMessages,
    sendMessage,
    editMessage,
    deleteMessage,
    removeMessageFromStore,
    toggleReaction,
    togglePin,
    isLoadingMessages,
    isLoadingMoreMessages,
    hasMoreByRoom,
    loadMoreMessages,
  } = useDMStore();
  const { friends } = useFriendStore();
  const { startCall, callState, roomId } = useCallStore();

  const [replyingTo, setReplyingTo] = useState<DMMessage | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [showPinnedOnly, setShowPinnedOnly] = useState(false);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [droppedFile, setDroppedFile] = useState<File | null>(null);
  const dragCounterRef = useRef<number>(0);

  const recipient = activeRoom?.recipient;

  useEffect(() => {
    if (showPinnedOnly && activeRoom) {
      fetchPinnedMessages(activeRoom.id);
    }
  }, [showPinnedOnly, activeRoom?.id]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const prevScrollHeightRef = useRef<number | null>(null);
  const isInitialLoadRef = useRef<boolean>(true);
  const prevRoomIdRef = useRef<string | null>(null);

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

  const handleStartCall = async () => {
    if (!activeRoom || !activeRoom.recipient) return;
    try {
      await startCall(activeRoom.id, activeRoom.recipient);
    } catch (err: any) {
      alert(err.message || 'Falha ao iniciar chamada');
    }
  };

  const scrollToBottom = (smooth = false) => {
    if (!searchQuery && scrollContainerRef.current) {
      if (smooth) {
        scrollContainerRef.current.scrollTo({
          top: scrollContainerRef.current.scrollHeight,
          behavior: 'smooth',
        });
      } else {
        scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
      }
    }
  };

  useEffect(() => {
    if (activeRoom?.id !== prevRoomIdRef.current) {
      prevRoomIdRef.current = activeRoom?.id || null;
      isInitialLoadRef.current = true;
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
      }
    }
  }, [activeRoom?.id]);

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

    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 350;
    if (isNearBottom) {
      scrollToBottom(true);
      setTimeout(() => scrollToBottom(true), 100);
      setTimeout(() => scrollToBottom(true), 300);
    }
  }, [messages]);

  const handleScroll = () => {
    const container = scrollContainerRef.current;
    if (!container || !activeRoom) return;

    if (container.scrollTop < 60 && !isLoadingMoreMessages && hasMoreByRoom[activeRoom.id] !== false) {
      prevScrollHeightRef.current = container.scrollHeight;
      loadMoreMessages(activeRoom.id);
    }
  };

  const displayedMessages = useMemo(() => {
    let list = messages;
    if (showPinnedOnly && activeRoom) {
      list = pinnedMessagesByRoom[activeRoom.id] || [];
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((m) => m.content.toLowerCase().includes(q));
    }
    return list;
  }, [messages, showPinnedOnly, activeRoom, pinnedMessagesByRoom, searchQuery]);

  const handleEditLastMessage = () => {
    if (!user || !displayedMessages || displayedMessages.length === 0) return;
    for (let i = displayedMessages.length - 1; i >= 0; i--) {
      const msg = displayedMessages[i];
      if (msg.author_id === user.id) {
        setEditingMessageId(msg.id);
        break;
      }
    }
  };

  // Custom mentions suggestions for DM
  const mentionSuggestions = useMemo(() => {
    const list: Array<{
      id: string;
      name: string;
      username: string;
      avatar_url?: string;
    }> = [];

    if (recipient) {
      list.push({
        id: recipient.id,
        name: recipient.display_name || recipient.username,
        username: recipient.username,
        avatar_url: recipient.avatar_url,
      });
    }

    for (const f of friends) {
      const u = f.friend;
      if (!u || u.id === recipient?.id) continue;
      list.push({
        id: u.id,
        name: u.display_name || u.username,
        username: u.username,
        avatar_url: u.avatar_url,
      });
    }

    return list;
  }, [recipient, friends]);

  if (!activeRoom || !recipient) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-background-dark p-4 text-center select-none">
        <div className="w-16 h-16 rounded-full bg-background-light flex items-center justify-center mb-4 text-gray-400">
          <MessageSquare className="w-8 h-8" />
        </div>
        <h3 className="text-xl font-bold text-gray-200 mb-2">Mensagens Diretas</h3>
        <p className="text-gray-400 max-w-sm text-sm">
          Selecione um amigo na barra lateral para iniciar ou continuar uma conversa privada.
        </p>
      </div>
    );
  }

  const isCallActiveInThisRoom = callState !== 'idle' && callState !== 'ended' && roomId === activeRoom.id;

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="flex-1 flex flex-col bg-background-dark overflow-hidden relative"
    >
      {/* Drag & Drop Visual Overlay */}
      {isDraggingFile && (
        <div className="absolute inset-0 z-50 bg-brand-500/20 backdrop-blur-sm border-2 border-dashed border-brand-400 flex flex-col items-center justify-center gap-3 pointer-events-none animate-in fade-in duration-150">
          <div className="w-16 h-16 rounded-3xl bg-brand-500 flex items-center justify-center text-white shadow-2xl shadow-brand-500/50 scale-110">
            <UploadCloud className="w-8 h-8 animate-bounce" />
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-white">Solte o arquivo para anexar</p>
            <p className="text-xs text-brand-200">Imagens, vídeos e documentos até 20 MB</p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="h-12 border-b border-white/5 px-4 flex items-center justify-between bg-background-darker/50 flex-shrink-0 select-none">
        <div className="flex items-center gap-2 min-w-0">
          {onOpenMobileDrawer && (
            <button
              onClick={onOpenMobileDrawer}
              className="p-1.5 -ml-1 text-gray-400 hover:text-white rounded-lg hover:bg-white/5 md:hidden"
              title="Abrir Menu"
            >
              <Menu className="w-5 h-5" />
            </button>
          )}

          <div
            onClick={(e) => onOpenUserProfile?.(recipient, { x: e.clientX, y: e.clientY })}
            className="flex items-center gap-2.5 cursor-pointer group min-w-0"
            title="Ver perfil"
          >
            <div className="relative flex-shrink-0">
              <div className="w-7 h-7 rounded-full bg-brand-500 flex items-center justify-center font-bold text-white text-xs overflow-hidden">
                {recipient.avatar_url ? (
                  <img src={formatAssetUrl(recipient.avatar_url)} alt="" className="w-full h-full object-cover" />
                ) : (
                  recipient.username[0].toUpperCase()
                )}
              </div>
              <div
                className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-background-darker ${
                  recipient.status === 'online'
                    ? 'bg-online'
                    : recipient.status === 'idle'
                    ? 'bg-idle'
                    : recipient.status === 'dnd'
                    ? 'bg-dnd'
                    : 'bg-offline'
                }`}
              />
            </div>
            <div className="flex items-baseline gap-1.5 min-w-0">
              <span className="font-bold text-sm text-gray-100 group-hover:underline truncate">
                {recipient.display_name || recipient.username}
              </span>
              <span className="text-xs text-gray-400 hidden sm:inline truncate font-mono">
                @{recipient.username}
              </span>
            </div>
          </div>
        </div>

        {/* Right Header Actions */}
        <div className="flex items-center gap-1.5 md:gap-2 flex-shrink-0">
          {/* Discord-style Search Input Box */}
          <div className="flex items-center gap-1.5 bg-background-darkest/90 hover:bg-background-darkest px-2.5 py-1 md:py-1.5 rounded-lg border border-white/5 focus-within:border-brand-500/50 text-xs transition-all duration-200 w-32 sm:w-44 md:w-56 focus-within:w-44 sm:focus-within:w-56 md:focus-within:w-64">
            <Search className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar..."
              className="bg-transparent text-gray-100 placeholder-gray-500 focus:outline-none w-full min-w-0 text-xs"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="p-0.5 text-gray-400 hover:text-white flex-shrink-0 cursor-pointer"
                title="Limpar busca"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Voice Call Button */}
          {!isCallActiveInThisRoom && (
            <button
              onClick={handleStartCall}
              className="p-2 md:p-1.5 rounded-lg text-gray-400 hover:text-online hover:bg-white/5 transition-colors cursor-pointer"
              title="Iniciar Chamada de Voz"
            >
              <Phone className="w-4 h-4" />
            </button>
          )}

          {/* Pinned Messages Filter Toggle */}
          <button
            onClick={() => setShowPinnedOnly(!showPinnedOnly)}
            className={`p-2 md:p-1.5 rounded-lg transition-colors cursor-pointer ${
              showPinnedOnly
                ? 'text-amber-400 bg-amber-400/15'
                : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
            }`}
            title={showPinnedOnly ? 'Mostrar todas as mensagens' : 'Mensagens Fixadas'}
          >
            <Pin className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Active Call UI Overlay */}
      {isCallActiveInThisRoom && (
        <ActiveCallOverlay onOpenScreenShare={onOpenScreenShare} />
      )}

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
            className="text-brand-400 hover:underline font-semibold cursor-pointer"
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

        {/* Welcome Header at the absolute top of the DM */}
        {!showPinnedOnly && !searchQuery && hasMoreByRoom[activeRoom.id] === false && (
          <div className="px-2 md:px-4 py-6 md:py-8 mb-4 border-b border-white/5 select-none">
            <div className="w-14 h-14 md:w-16 md:h-16 rounded-full bg-brand-500 flex items-center justify-center mb-3 text-white text-xl font-bold shadow-lg overflow-hidden">
              {recipient.avatar_url ? (
                <img src={formatAssetUrl(recipient.avatar_url)} alt="" className="w-full h-full object-cover" />
              ) : (
                recipient.username[0].toUpperCase()
              )}
            </div>
            <h2 className="text-xl md:text-2xl font-bold text-white mb-1">
              {recipient.display_name || recipient.username}
            </h2>
            <p className="text-xs md:text-sm text-gray-400 font-mono">
              @{recipient.username}
            </p>
            <p className="text-xs text-gray-500 mt-2">
              Este é o início da sua história de mensagens diretas com @{recipient.username}.
            </p>
          </div>
        )}

        {isLoadingMessages || (showPinnedOnly && isLoadingPinned[activeRoom.id]) ? (
          <div className="flex justify-center items-center gap-2 py-10 text-sm text-gray-500">
            <div className="w-4 h-4 border-2 border-brand-400 border-t-transparent rounded-full animate-spin" />
            <span>{showPinnedOnly ? 'Carregando mensagens fixadas...' : 'Carregando mensagens...'}</span>
          </div>
        ) : displayedMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-500 gap-2 select-none">
            {showPinnedOnly ? (
              <>
                <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-amber-400">
                  <Pin className="w-6 h-6" />
                </div>
                <span className="text-sm font-semibold text-gray-300">Nenhuma mensagem fixada</span>
                <span className="text-xs text-gray-500">Fixe mensagens importantes para consultá-las com facilidade.</span>
              </>
            ) : searchQuery ? (
              <>
                <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-gray-400">
                  <Search className="w-6 h-6" />
                </div>
                <span className="text-sm font-semibold text-gray-300">Nenhum resultado encontrado</span>
                <span className="text-xs text-gray-500">Tente buscar por outros termos.</span>
              </>
            ) : (
              <span>Nenhuma mensagem ainda. Envie um "Olá"!</span>
            )}
          </div>
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
                isEditing={editingMessageId === message.id}
                onStartEdit={() => setEditingMessageId(message.id)}
                onStopEdit={() => setEditingMessageId(null)}
                onOpenUserProfile={onOpenUserProfile}
                onPreviewImage={onPreviewImage}
                onReply={(msg) => setReplyingTo(msg)}
                onEditMessage={async (id, newContent) => {
                  await editMessage(id, newContent);
                }}
                onDeleteMessage={async (id) => {
                  await deleteMessage(id);
                }}
                onToggleReaction={async (id, emoji) => {
                  await toggleReaction(id, emoji);
                }}
                onTogglePin={async (id) => {
                  await togglePin(id);
                }}
                onRetryMessage={async (msg) => {
                  removeMessageFromStore(msg.id, activeRoom.id);
                  await sendMessage(msg.content, undefined, msg.reply_to_id);
                }}
                onRemoveFailedMessage={(id) => {
                  removeMessageFromStore(id, activeRoom.id);
                }}
                contextType="dm"
              />
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Universal Message Input */}
      <MessageInput
        placeholder={`Conversar com @${recipient.display_name || recipient.username}`}
        replyingTo={replyingTo}
        onCancelReply={() => setReplyingTo(null)}
        onSendMessage={async (content, replyToId) => {
          await sendMessage(content, undefined, replyToId);
          setReplyingTo(null);
        }}
        onEditLastMessage={handleEditLastMessage}
        droppedFile={droppedFile}
        onClearDroppedFile={() => setDroppedFile(null)}
        contextType="dm"
        customMentions={mentionSuggestions}
      />
    </div>
  );
};
