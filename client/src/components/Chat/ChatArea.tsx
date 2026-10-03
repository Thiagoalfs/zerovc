import React, { useEffect, useRef, useState, useMemo } from 'react';
import { Hash, Users, Menu, Pin, Search, X, UploadCloud } from 'lucide-react';
import { useGuildStore } from '../../stores/guildStore';
import { useAuthStore } from '../../stores/authStore';
import { MessageItem } from './MessageItem';
import { MessageInput } from './MessageInput';
import { MemberList } from '../Sidebar/MemberList';
import { ChatHeader } from './ChatHeader';
import { SearchResultsPanel } from './SearchResultsPanel';
import { TypingIndicator } from './TypingIndicator';
import { parseSearchQuery, filterMessages } from '../../utils/searchFilters';
import { smoothScrollToBottomExponential } from '../../utils/scrollUtils';
import { setActiveChat, getActiveChat } from '../../utils/activeChat';
import { User, Message, UserProfilePosition } from '../../types';

interface ChatAreaProps {
  onOpenMobileDrawer?: () => void;
  onOpenUserProfile?: (user: User, position?: UserProfilePosition) => void;
  onOpenDM?: (userId: string) => void;
  onPreviewImage?: (url: string) => void;
  isMemberListOpen?: boolean;
  onToggleMemberList?: (open: boolean) => void;
  isDraggingMemberList?: boolean;
  memberListDragOffset?: number | null;
  memberListDragProgress?: number | null;
}

export const ChatArea: React.FC<ChatAreaProps> = ({
  onOpenMobileDrawer,
  onOpenUserProfile,
  onOpenDM,
  onPreviewImage,
  isMemberListOpen,
  onToggleMemberList,
  isDraggingMemberList,
  memberListDragOffset,
  memberListDragProgress,
}) => {
  const { user } = useAuthStore();
  const {
    activeGuild,
    activeChannel,
    messages,
    pinnedMessagesByChannel,
    isLoadingPinned,
    fetchPinnedMessages,
    isLoadingMessages,
    isLoadingMoreMessages,
    hasMoreByChannel,
    loadMoreMessages,
    sendMessage,
    typingUsers,
    firstUnreadMessageIdByChannel,
    clearUnreadDivider,
  } = useGuildStore();
  const [localShowMemberList, setLocalShowMemberList] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('zerovc_server_members_open');
      if (saved !== null) {
        return saved === 'true';
      }
    } catch {}
    return typeof window !== 'undefined' ? window.innerWidth >= 768 : true;
  });
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [appliedSearchQuery, setAppliedSearchQuery] = useState('');
  const [isSearchAutocompleteOpen, setIsSearchAutocompleteOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const [showPinnedOnly, setShowPinnedOnly] = useState(false);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [droppedFile, setDroppedFile] = useState<File | null>(null);
  const dragCounterRef = useRef<number>(0);

  // Fetch pinned messages from backend whenever showPinnedOnly is toggled or channel changes
  useEffect(() => {
    if (showPinnedOnly && activeChannel) {
      fetchPinnedMessages(activeChannel.id);
    }
  }, [showPinnedOnly, activeChannel?.id]);

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
    const nextVal = !showMembers;
    if (onToggleMemberList) {
      onToggleMemberList(nextVal);
    } else {
      setLocalShowMemberList(nextVal);
      try {
        localStorage.setItem('zerovc_server_members_open', String(nextVal));
      } catch {}
    }
  };

  const scrollToBottom = (smooth = false) => {
    if (!showPinnedOnly && scrollContainerRef.current) {
      if (smooth) {
        smoothScrollToBottomExponential(scrollContainerRef.current);
      } else {
        scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
      }
    }
  };

  const handleSendMessage = async (content: string, replyToId?: string, isTTS?: boolean) => {
    if (activeChannel) {
      clearUnreadDivider(activeChannel.id);
    }
    scrollToBottom(true);
    await sendMessage(content, replyToId, isTTS);
    setTimeout(() => scrollToBottom(true), 60);
    setTimeout(() => scrollToBottom(true), 200);
  };

  // Track active chat focus for selective TTS playback
  useEffect(() => {
    if (activeChannel?.id) {
      setActiveChat('channel', activeChannel.id);
    }
    return () => {
      if (getActiveChat().id === activeChannel?.id) {
        setActiveChat('none', null);
      }
    };
  }, [activeChannel?.id]);

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

  const firstUnreadId = activeChannel ? firstUnreadMessageIdByChannel[activeChannel.id] : null;

  // Keep scroll position when loading older messages OR scroll smoothly/instantly to bottom / unread on initial load
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
      if (messages.length > 0) {
        isInitialLoadRef.current = false;
        if (firstUnreadId && messages.some((m) => m.id === firstUnreadId)) {
          setTimeout(() => {
            const unreadEl = document.getElementById('unread-divider');
            if (unreadEl) {
              unreadEl.scrollIntoView({ behavior: 'auto', block: 'center' });
            } else {
              container.scrollTop = container.scrollHeight;
            }
          }, 60);
          return;
        }
        container.scrollTop = container.scrollHeight;
      }
      return;
    }

    const lastMessage = messages[messages.length - 1];
    const isMyMessage = Boolean(lastMessage && user && lastMessage.author_id === user.id);
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 350;

    if (isMyMessage && activeChannel) {
      clearUnreadDivider(activeChannel.id);
    }

    if ((isNearBottom || isMyMessage) && !isAutoScrollingRef.current) {
      scrollToBottom(true);
      setTimeout(() => scrollToBottom(true), 100);
      setTimeout(() => scrollToBottom(true), 300);
    }
  }, [messages, user?.id, firstUnreadId]);

  const handleMediaLoad = () => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 400;
    if (isNearBottom) {
      scrollToBottom(true);
    }
  };

  const handleScroll = () => {
    const container = scrollContainerRef.current;
    if (!container || !activeChannel) return;

    // Detect near top scroll for pagination
    if (container.scrollTop < 60 && !isLoadingMoreMessages && hasMoreByChannel[activeChannel.id] !== false) {
      prevScrollHeightRef.current = container.scrollHeight;
      loadMoreMessages(activeChannel.id);
    }

    // Clear unread divider line only when user scrolls down to the bottom
    const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 35;
    if (isAtBottom && firstUnreadId) {
      clearUnreadDivider(activeChannel.id);
    }
  };

  // Filter messages based on pinned filter
  const baseMessages = showPinnedOnly && activeChannel
    ? pinnedMessagesByChannel?.[activeChannel.id] || []
    : messages || [];

  const parsedSearch = useMemo(() => parseSearchQuery(appliedSearchQuery), [appliedSearchQuery]);

  // Main chat messages stay normal (or show pinned if toggled)
  const displayedMessages = useMemo(() => {
    if (showPinnedOnly && activeChannel) {
      return pinnedMessagesByChannel?.[activeChannel.id] || [];
    }
    return baseMessages;
  }, [baseMessages, showPinnedOnly, activeChannel, pinnedMessagesByChannel]);

  // Search Results for the right-side SearchResultsPanel
  const searchResults = useMemo(() => {
    if (!appliedSearchQuery) return [];
    return filterMessages(messages || [], parsedSearch);
  }, [messages, appliedSearchQuery, parsedSearch]);

  const handleJumpToMessage = (messageId: string) => {
    const el = document.getElementById(`msg-${messageId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('bg-brand-500/20', 'transition-colors', 'duration-500');
      setTimeout(() => {
        el.classList.remove('bg-brand-500/20');
      }, 2500);
    }
  };

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

  const typingUserIds = useMemo(() => {
    if (!activeChannel) return [];
    return Array.from(typingUsers.get(activeChannel.id) || []).filter((id) => id !== user?.id);
  }, [typingUsers, activeChannel, user?.id]);

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

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="flex-1 w-full min-w-0 bg-background-dark flex flex-col h-full overflow-hidden relative min-h-0"
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

      {/* 1. Full-Width Channel Header */}
      <ChatHeader
        onOpenMobileDrawer={onOpenMobileDrawer}
        icon={<Hash className="w-6 h-6 text-gray-400 flex-shrink-0" />}
        title={<span className="font-bold text-gray-100 truncate text-[17px] md:text-base">{activeChannel.name}</span>}
        subtitle={activeChannel.topic}
        showPinnedOnly={showPinnedOnly}
        onTogglePinned={() => setShowPinnedOnly(!showPinnedOnly)}
        showMembers={showMembers}
        onToggleMembers={toggleMembers}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onSearchSubmit={(q) => setAppliedSearchQuery(q)}
        onClearSearch={() => {
          setSearchQuery('');
          setAppliedSearchQuery('');
        }}
        hasAppliedSearch={Boolean(appliedSearchQuery)}
        searchMembers={activeGuild?.members || []}
        searchChannels={activeGuild?.channels || []}
        searchContextType="guild"
        onHeaderClick={() => {
          if (typeof window !== 'undefined' && window.innerWidth < 768) {
            toggleMembers();
          }
        }}
      />

      {/* Pinned Messages Active Notice Banner */}
      {showPinnedOnly && (
        <div className="bg-background-darkest/90 border-b border-white/5 px-4 py-2 flex items-center justify-between text-xs text-gray-300 flex-shrink-0">
          <span>
            Exibindo <strong className="text-white font-semibold">{displayedMessages.length}</strong> mensagens fixadas neste canal
          </span>
          <button
            type="button"
            onClick={() => setShowPinnedOnly(false)}
            className="text-brand-400 hover:underline font-semibold cursor-pointer ml-2 flex-shrink-0"
          >
            Limpar Filtros
          </button>
        </div>
      )}

      {/* 2. Main Body Row: (Messages Column + Right-side Member List) */}
      <div className="flex-1 flex flex-row h-full overflow-hidden min-h-0 w-full relative">
        {/* Messages Column */}
        <div className="flex-1 flex flex-col h-full overflow-hidden min-h-0">
          {/* Messages Scroll Area */}
          <div
            ref={scrollContainerRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto px-2 md:px-4 py-3 no-scrollbar"
          >
            {isLoadingMoreMessages && (
              <div className="flex justify-center items-center gap-2 py-3 text-xs text-gray-400">
                <div className="w-3.5 h-3.5 border-2 border-brand-400 border-t-transparent rounded-full animate-spin" />
                <span>Carregando mensagens anteriores...</span>
              </div>
            )}

            {/* Welcome banner when at the very beginning of the channel history */}
            {hasMoreByChannel[activeChannel.id] === false && (
              <div className="px-2 md:px-4 py-6 md:py-8 mb-4 border-b border-white/5 select-none">
                <div className="w-14 h-14 md:w-16 md:h-16 rounded-3xl bg-brand-500/20 border border-brand-500/30 text-brand-400 flex items-center justify-center mb-3 shadow-lg">
                  <Hash className="w-8 h-8" />
                </div>
                <h2 className="text-xl md:text-2xl font-bold text-white mb-1">
                  Bem-vindo a #{activeChannel.name}!
                </h2>
                <p className="text-xs md:text-sm text-gray-400 max-w-lg leading-relaxed">
                  {activeChannel.topic
                    ? activeChannel.topic
                    : `Este é o início do canal #${activeChannel.name}. Envie uma mensagem para começar a conversar.`}
                </p>
              </div>
            )}

            {isLoadingMessages || (showPinnedOnly && isLoadingPinned[activeChannel.id]) ? (
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
                    <span className="text-xs text-gray-500">Fixe mensagens importantes para que todos possam consultá-las facilmente.</span>
                  </>
                ) : appliedSearchQuery ? (
                  <>
                    <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-gray-400">
                      <Search className="w-6 h-6" />
                    </div>
                    <span className="text-sm font-semibold text-gray-300">Nenhum resultado encontrado</span>
                    <span className="text-xs text-gray-500">Tente buscar por termos diferentes ou verifique a ortografia.</span>
                  </>
                ) : (
                  <span>Nenhuma mensagem encontrada.</span>
                )}
              </div>
            ) : (
              displayedMessages.map((msg, index) => {
                const isFirstUnread = Boolean(firstUnreadId && firstUnreadId === msg.id);
                const prevMsg = index > 0 ? displayedMessages[index - 1] : null;
                const isCompact = !isFirstUnread &&
                  prevMsg !== null &&
                  prevMsg.author_id === msg.author_id &&
                  (new Date(msg.created_at).getTime() - new Date(prevMsg.created_at).getTime()) < 5 * 60 * 1000;

                return (
                  <React.Fragment key={msg.id}>
                    {isFirstUnread && (
                      <div id="unread-divider" className="flex items-center gap-3 my-4 mx-2 select-none">
                        <div className="flex-1 h-[1px] bg-red-500/80 shadow-[0_0_8px_rgba(239,68,68,0.4)]" />
                        <span className="px-2.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wider text-white bg-red-500 rounded-full shadow-md shadow-red-500/30 flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                          Mensagens não lidas
                        </span>
                        <div className="flex-1 h-[1px] bg-red-500/80 shadow-[0_0_8px_rgba(239,68,68,0.4)]" />
                      </div>
                    )}
                    <MessageItem
                      message={msg}
                      isCompact={isCompact}
                      isEditing={editingMessageId === msg.id}
                      onStartEdit={() => setEditingMessageId(msg.id)}
                      onStopEdit={() => setEditingMessageId(null)}
                      onOpenUserProfile={onOpenUserProfile}
                      onOpenDM={onOpenDM}
                      onPreviewImage={onPreviewImage}
                      onReply={(message) => setReplyingTo(message)}
                      onImageLoad={handleMediaLoad}
                    />
                  </React.Fragment>
                );
              })
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Typing Indicator */}
          <TypingIndicator
            typingUserIds={typingUserIds}
            members={activeGuild?.members || []}
          />

          {/* Message Input */}
          <MessageInput
            channel={activeChannel}
            replyingTo={replyingTo}
            onCancelReply={() => setReplyingTo(null)}
            onSendMessage={handleSendMessage}
            onEditLastMessage={handleEditLastMessage}
            droppedFile={droppedFile}
            onClearDroppedFile={() => setDroppedFile(null)}
          />
        </div>

        {/* Right-side: Search Results Panel (on top of member list when search is active) OR Member List Sidebar */}
        {appliedSearchQuery ? (
          <SearchResultsPanel
            isOpen={Boolean(appliedSearchQuery)}
            onClose={() => {
              setAppliedSearchQuery('');
              setSearchQuery('');
            }}
            rawQuery={appliedSearchQuery}
            parsedQuery={parsedSearch}
            messages={searchResults}
            contextName={`#${activeChannel.name}`}
            contextCategory={activeGuild?.name}
            contextType="guild"
            onJumpToMessage={handleJumpToMessage}
          />
        ) : (
          <MemberList
            isOpen={showMembers}
            onClose={() => {
              if (onToggleMemberList) onToggleMemberList(false);
              else setLocalShowMemberList(false);
            }}
            onSelectUser={onOpenUserProfile}
            onOpenDM={onOpenDM}
            onOpenSearch={() => {}}
            onOpenPins={() => {
              setShowPinnedOnly(true);
              if (onToggleMemberList) onToggleMemberList(false);
              else setLocalShowMemberList(false);
            }}
            isDragging={isDraggingMemberList}
            dragOffset={memberListDragOffset}
            dragProgress={memberListDragProgress}
          />
        )}
      </div>
    </div>
  );
};
