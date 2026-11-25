import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Pin, Search } from 'lucide-react';
import { User } from '../../types';
import { useAuthStore } from '../../stores/authStore';
import { MessageItem } from './MessageItem';
import { MessageInput } from './MessageInput';
import { SearchResultsPanel } from './SearchResultsPanel';
import { TypingIndicator } from './TypingIndicator';
import { PinnedMessagesBanner } from './PinnedMessagesBanner';
import { useFileDropOverlay } from '../../hooks/useFileDropOverlay';
import { filterMessages, parseSearchQuery } from '../../utils/searchFilters';
import { smoothScrollToBottomExponential } from '../../utils/scrollUtils';
import {
  saveChatScrollPosition,
  restoreChatScrollPosition,
} from '../../utils/chatScrollMemory';

export interface ConversationViewProps {
  conversationKey: string;
  contextType: 'guild' | 'dm' | 'dm_group';
  messages: any[];
  pinnedMessages: any[];
  firstUnreadId?: string | null;
  unreadCount?: number;
  hasMore: boolean;
  isLoadingMessages: boolean;
  isLoadingMoreMessages: boolean;
  isLoadingPinned: boolean;
  showPinnedOnly: boolean;
  onClearPinnedOnly: () => void;
  pinnedContextSuffix?: string;
  searchQuery: string;
  appliedSearchQuery: string;
  onClearSearch: () => void;
  searchContextName: string;
  searchContextCategory?: string;
  typingUserIds: string[];
  typingMembers: User[];
  emptyText?: string;
  inputChannel: any;
  inputPlaceholder?: string;
  customMentions?: any[];
  wrapInputInContainer?: boolean;
  onSendMessage: (
    content: string,
    replyToId?: string,
    isTTS?: boolean,
    file?: File | File[]
  ) => Promise<void> | void;
  onTyping?: () => void;
  onLoadMore: () => void;
  onMarkAsRead: () => void;
  onClearUnreadDivider?: () => void;
  onOpenUserProfile?: (user: User, position?: { x: number; y: number }) => void;
  onOpenDM?: (userId: string) => void;
  onPreviewImage?: (url: string) => void;
  onEditMessage?: (messageId: string, newContent: string) => Promise<void>;
  onDeleteMessage?: (messageId: string) => Promise<void>;
  onToggleReaction?: (messageId: string, emoji: string) => Promise<void>;
  onTogglePin?: (messageId: string) => Promise<void>;
  onRetryMessage?: (message: any) => Promise<void>;
  onRemoveFailedMessage?: (messageId: string) => void;
  header: React.ReactNode;
  topOverlay?: React.ReactNode;
  welcomeBanner?: React.ReactNode;
  rightSidebar?: React.ReactNode;
  extraOverlays?: React.ReactNode;
  className?: string;
}

export const ConversationView: React.FC<ConversationViewProps> = ({
  conversationKey,
  contextType,
  messages,
  pinnedMessages,
  firstUnreadId,
  unreadCount,
  hasMore,
  isLoadingMessages,
  isLoadingMoreMessages,
  isLoadingPinned,
  showPinnedOnly,
  onClearPinnedOnly,
  pinnedContextSuffix,
  appliedSearchQuery,
  onClearSearch,
  searchContextName,
  searchContextCategory,
  typingUserIds,
  typingMembers,
  emptyText = 'Nenhuma mensagem encontrada.',
  inputChannel,
  inputPlaceholder,
  customMentions,
  wrapInputInContainer = false,
  onSendMessage,
  onTyping,
  onLoadMore,
  onMarkAsRead,
  onClearUnreadDivider,
  onOpenUserProfile,
  onOpenDM,
  onPreviewImage,
  onEditMessage,
  onDeleteMessage,
  onToggleReaction,
  onTogglePin,
  onRetryMessage,
  onRemoveFailedMessage,
  header,
  topOverlay,
  welcomeBanner,
  rightSidebar,
  extraOverlays,
  className = 'flex-1 w-full min-w-0 bg-background-dark flex flex-col h-full overflow-hidden relative min-h-0',
}) => {
  const { user } = useAuthStore();
  const [replyingTo, setReplyingTo] = useState<any | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const { isDraggingFile, droppedFiles, clearDroppedFiles, dragHandlers } = useFileDropOverlay();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const prevScrollHeightRef = useRef<number | null>(null);
  const isInitialLoadRef = useRef<boolean>(true);
  const prevKeyRef = useRef<string | null>(null);
  const isAutoScrollingRef = useRef<boolean>(false);

  const scrollToBottom = (smooth = false) => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    if (smooth && distanceFromBottom >= 120) {
      smoothScrollToBottomExponential(container);
    } else {
      container.scrollTop = container.scrollHeight;
    }
  };

  useEffect(() => {
    setReplyingTo(null);
    setEditingMessageId(null);
    onClearPinnedOnly();
    onClearSearch();
    const container = scrollContainerRef.current;
    return () => {
      if (container && conversationKey && !isInitialLoadRef.current) {
        saveChatScrollPosition(conversationKey, container);
      }
    };
  }, [conversationKey]);

  useEffect(() => {
    if (conversationKey !== prevKeyRef.current) {
      prevKeyRef.current = conversationKey;
      isInitialLoadRef.current = true;
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
      }
    }
  }, [conversationKey]);

  const firstUnreadIdRef = useRef(firstUnreadId);
  const onMarkAsReadRef = useRef(onMarkAsRead);
  firstUnreadIdRef.current = firstUnreadId;
  onMarkAsReadRef.current = onMarkAsRead;

  useEffect(() => {
    const mountedAt = Date.now();
    return () => {
      // Ignore React StrictMode's immediate synthetic mount/unmount cycle (<150ms)
      if (Date.now() - mountedAt > 150 && firstUnreadIdRef.current) {
        onMarkAsReadRef.current();
      }
    };
  }, [conversationKey]);

  useLayoutEffect(() => {
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
        restoreChatScrollPosition(conversationKey, container);
      }
      return;
    }

    const lastMessage = messages[messages.length - 1];
    const isMyMessage = Boolean(lastMessage && user && lastMessage.author_id === user.id);
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 350;

    if (isMyMessage) {
      onMarkAsRead();
    }

    if ((isNearBottom || isMyMessage) && !isAutoScrollingRef.current) {
      scrollToBottom(true);
    }
  }, [conversationKey, messages, user?.id, firstUnreadId]);

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
    if (!container) return;

    if (!isInitialLoadRef.current) {
      saveChatScrollPosition(conversationKey, container);
    }

    if (container.scrollTop < 60 && !isLoadingMoreMessages && hasMore) {
      prevScrollHeightRef.current = container.scrollHeight;
      onLoadMore();
    }
  };

  const parsedSearch = useMemo(() => parseSearchQuery(appliedSearchQuery), [appliedSearchQuery]);

  const displayedMessages = useMemo(() => {
    if (showPinnedOnly) {
      return pinnedMessages || [];
    }
    return messages || [];
  }, [messages, showPinnedOnly, pinnedMessages]);

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

  const messageInputNode = (
    <MessageInput
      channel={inputChannel}
      placeholder={inputPlaceholder}
      replyingTo={replyingTo}
      onCancelReply={() => setReplyingTo(null)}
      onSendMessage={async (content, replyToId, isTTS, file) => {
        onClearUnreadDivider?.();
        scrollToBottom(true);
        await onSendMessage(content, replyToId, isTTS, file);
        setReplyingTo(null);
        requestAnimationFrame(() => scrollToBottom(false));
      }}
      onTyping={onTyping}
      onEditLastMessage={handleEditLastMessage}
      droppedFiles={droppedFiles}
      onClearDroppedFiles={clearDroppedFiles}
      isDraggingFile={isDraggingFile}
      contextType={contextType === 'guild' ? 'channel' : contextType}
      customMentions={customMentions}
    />
  );

  return (
    <div {...dragHandlers} className={className}>
      {header}

      {showPinnedOnly && (
        <PinnedMessagesBanner
          count={displayedMessages.length}
          contextSuffix={pinnedContextSuffix}
          onClear={onClearPinnedOnly}
        />
      )}

      {topOverlay}

      <div className="flex-1 flex flex-row h-full overflow-hidden min-h-0 w-full relative">
        <div className="flex-1 flex flex-col h-full overflow-hidden min-h-0">
          <div
            ref={scrollContainerRef}
            onScroll={handleScroll}
            style={{ overflowAnchor: 'none' }}
            className="flex-1 overflow-y-auto px-2 md:px-4 py-3 chat-scrollbar"
          >
            {isLoadingMoreMessages && (
              <div className="flex justify-center items-center gap-2 py-3 text-xs text-gray-400">
                <div className="w-3.5 h-3.5 border-2 border-brand-400 border-t-transparent rounded-full animate-spin" />
                <span>Carregando mensagens anteriores...</span>
              </div>
            )}

            {!showPinnedOnly && !appliedSearchQuery && !hasMore && welcomeBanner}

            {isLoadingMessages || (showPinnedOnly && isLoadingPinned) ? (
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
                    <span className="text-xs text-gray-500">
                      Fixe mensagens importantes para consultá-las com facilidade.
                    </span>
                  </>
                ) : appliedSearchQuery ? (
                  <>
                    <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-gray-400">
                      <Search className="w-6 h-6" />
                    </div>
                    <span className="text-sm font-semibold text-gray-300">Nenhum resultado encontrado</span>
                    <span className="text-xs text-gray-500">
                      Tente buscar por termos diferentes ou verifique a ortografia.
                    </span>
                  </>
                ) : (
                  <span>{emptyText}</span>
                )}
              </div>
            ) : (
              displayedMessages.map((msg, index) => {
                const isFirstUnread = Boolean(firstUnreadId && firstUnreadId === msg.id);
                const prevMsg = index > 0 ? displayedMessages[index - 1] : null;
                const isCompact =
                  !isFirstUnread &&
                  prevMsg !== null &&
                  prevMsg.author_id === msg.author_id &&
                  !msg.reply_to &&
                  (() => {
                    const prevTime = new Date(prevMsg.created_at).getTime();
                    const currTime = new Date(msg.created_at).getTime();
                    if (isNaN(prevTime) || isNaN(currTime)) return false;
                    const diffMs = currTime - prevTime;
                    return diffMs >= 0 && diffMs < 5 * 60 * 1000;
                  })();

                return (
                  <React.Fragment key={msg.id}>
                    {isFirstUnread && (() => {
                      const resolvedUnreadCount = Math.max(unreadCount || 0, displayedMessages.length - index);
                      const unreadLabel =
                        resolvedUnreadCount > 99
                          ? '99+ mensagens novas não lidas'
                          : resolvedUnreadCount === 1
                          ? '1 mensagem nova não lida'
                          : `${resolvedUnreadCount} mensagens novas não lidas`;
                      return (
                        <div id="unread-divider" className="flex items-center gap-3 my-4 mx-2 select-none">
                          <div className="flex-1 h-[1px] bg-red-500/80 shadow-[0_0_8px_rgba(239,68,68,0.4)]" />
                          <span className="px-2.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wider text-white bg-red-500 rounded-full shadow-md shadow-red-500/30 flex items-center gap-1.5 tabular-nums">
                            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                            {unreadLabel}
                          </span>
                          <div className="flex-1 h-[1px] bg-red-500/80 shadow-[0_0_8px_rgba(239,68,68,0.4)]" />
                        </div>
                      );
                    })()}
                    <MessageItem
                      message={msg}
                      isCompact={isCompact}
                      isEditing={editingMessageId === msg.id}
                      onStartEdit={() => setEditingMessageId(msg.id)}
                      onStopEdit={() => setEditingMessageId(null)}
                      onOpenUserProfile={onOpenUserProfile}
                      onOpenDM={onOpenDM}
                      onPreviewImage={onPreviewImage}
                      onReply={(m) => setReplyingTo(m)}
                      onImageLoad={handleMediaLoad}
                      onEditMessage={onEditMessage}
                      onDeleteMessage={onDeleteMessage}
                      onToggleReaction={onToggleReaction}
                      onTogglePin={onTogglePin}
                      onRetryMessage={onRetryMessage}
                      onRemoveFailedMessage={onRemoveFailedMessage}
                      contextType={contextType === 'guild' ? 'channel' : contextType}
                    />
                  </React.Fragment>
                );
              })
            )}

            <div ref={messagesEndRef} />
          </div>

          <TypingIndicator typingUserIds={typingUserIds} members={typingMembers} />

          {wrapInputInContainer ? (
            <div className="p-3 md:p-4 pt-1 bg-background-dark">{messageInputNode}</div>
          ) : (
            messageInputNode
          )}
        </div>

        {appliedSearchQuery ? (
          <SearchResultsPanel
            isOpen={Boolean(appliedSearchQuery)}
            onClose={onClearSearch}
            rawQuery={appliedSearchQuery}
            parsedQuery={parsedSearch}
            messages={searchResults}
            contextName={searchContextName}
            contextCategory={searchContextCategory}
            contextType={contextType}
            onJumpToMessage={handleJumpToMessage}
          />
        ) : (
          rightSidebar
        )}
      </div>

      {extraOverlays}
    </div>
  );
};
