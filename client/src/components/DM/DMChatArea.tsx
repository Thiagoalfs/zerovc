import React, { useState, useEffect, useMemo } from 'react';
import { MessageSquare, Phone } from 'lucide-react';
import { useDMStore } from '../../stores/dmStore';
import { showAlert } from '../../stores/confirmModalStore';
import { useAuthStore } from '../../stores/authStore';
import { useCallStore } from '../../stores/callStore';
import { useVoiceStore } from '../../stores/voiceStore';
import { useFriendStore } from '../../stores/friendStore';
import { formatAssetUrl } from '../../lib/api';
import { ActiveCallOverlay } from './ActiveCallOverlay';
import { ChatHeader } from '../Chat/ChatHeader';
import { ConversationView } from '../Chat/ConversationView';
import { UserAvatar } from '../Common/UserAvatar';
import { socket } from '../../lib/socket';
import { useGuildStore } from '../../stores/guildStore';
import { setActiveChat, getActiveChat } from '../../utils/activeChat';
import { User } from '../../types';

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
    firstUnreadMessageIdByRoom,
    clearUnreadDivider,
    markRoomAsRead,
  } = useDMStore();
  const { friends } = useFriendStore();
  const { startCall, callState, roomId } = useCallStore();
  const { voiceType, dmRoomId, isConnected: isVoiceConnected } = useVoiceStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [appliedSearchQuery, setAppliedSearchQuery] = useState('');
  const [showPinnedOnly, setShowPinnedOnly] = useState(false);

  const recipient = activeRoom?.recipient;
  const typingUsers = useGuildStore((s) => s.typingUsers);

  const typingUserIds = useMemo(() => {
    if (!activeRoom) return [];
    return Array.from(typingUsers.get(activeRoom.id) || []).filter((id) => id !== user?.id);
  }, [typingUsers, activeRoom, user?.id]);

  useEffect(() => {
    if (activeRoom?.id) {
      setActiveChat('dm', activeRoom.id);
    }
    return () => {
      if (getActiveChat().id === activeRoom?.id) {
        setActiveChat('none', null);
      }
    };
  }, [activeRoom?.id]);

  useEffect(() => {
    if (showPinnedOnly && activeRoom) {
      fetchPinnedMessages(activeRoom.id);
    }
  }, [showPinnedOnly, activeRoom?.id]);

  const handleStartCall = async () => {
    if (!activeRoom || !activeRoom.recipient) return;
    try {
      await startCall(activeRoom.id, activeRoom.recipient);
    } catch (err: any) {
      showAlert({
        title: 'Erro na chamada',
        message: err.message || 'Falha ao iniciar chamada',
        variant: 'danger',
      });
    }
  };

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

  const isCallActiveInThisRoom =
    (callState !== 'idle' && callState !== 'ended' && roomId === activeRoom.id) ||
    (voiceType === 'dm' && dmRoomId === activeRoom.id && isVoiceConnected);

  return (
    <ConversationView
      conversationKey={`dm:${activeRoom.id}`}
      contextType="dm"
      className="flex-1 flex flex-col bg-background-dark overflow-hidden relative"
      messages={messages || []}
      pinnedMessages={pinnedMessagesByRoom?.[activeRoom.id] || []}
      firstUnreadId={firstUnreadMessageIdByRoom[activeRoom.id]}
      hasMore={hasMoreByRoom[activeRoom.id] !== false}
      isLoadingMessages={isLoadingMessages}
      isLoadingMoreMessages={isLoadingMoreMessages}
      isLoadingPinned={Boolean(isLoadingPinned?.[activeRoom.id])}
      showPinnedOnly={showPinnedOnly}
      onClearPinnedOnly={() => setShowPinnedOnly(false)}
      searchQuery={searchQuery}
      appliedSearchQuery={appliedSearchQuery}
      onClearSearch={() => {
        setSearchQuery('');
        setAppliedSearchQuery('');
      }}
      searchContextName={`@${recipient.display_name || recipient.username}`}
      searchContextCategory="Mensagem Direta"
      typingUserIds={typingUserIds}
      typingMembers={recipient ? [recipient] : []}
      emptyText='Nenhuma mensagem ainda. Envie um "Olá"!'
      inputChannel={{ id: activeRoom.id, name: recipient.display_name || recipient.username }}
      inputPlaceholder={`Conversar com @${recipient.display_name || recipient.username}`}
      customMentions={mentionSuggestions}
      onSendMessage={async (content, replyToId, isTTS, file) => {
        clearUnreadDivider(activeRoom.id);
        await sendMessage(content, undefined, replyToId, isTTS, file);
      }}
      onTyping={() => {
        socket.send('TYPING_START', {
          channel_id: activeRoom.id,
          recipient_id: recipient.id,
        });
      }}
      onLoadMore={() => loadMoreMessages(activeRoom.id)}
      onMarkAsRead={() => markRoomAsRead(activeRoom.id)}
      onClearUnreadDivider={() => clearUnreadDivider(activeRoom.id)}
      onOpenUserProfile={onOpenUserProfile}
      onPreviewImage={onPreviewImage}
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
      header={
        <ChatHeader
          onOpenMobileDrawer={onOpenMobileDrawer}
          icon={
            <UserAvatar
              user={recipient}
              size="sm"
              showStatus
              statusBorderColor="border-background-darker"
              onClick={(e) => onOpenUserProfile?.(recipient, { x: e.clientX, y: e.clientY })}
              title="Ver perfil"
            />
          }
          title={
            <span
              onClick={(e) => onOpenUserProfile?.(recipient, { x: e.clientX, y: e.clientY })}
              className="font-bold text-sm text-gray-100 group-hover:underline cursor-pointer truncate"
            >
              {recipient.display_name || recipient.username}
            </span>
          }
          subtitle={`@${recipient.username}`}
          actions={
            !isCallActiveInThisRoom ? (
              <button
                onClick={handleStartCall}
                className="p-2 md:p-1.5 rounded-lg text-gray-400 hover:text-online hover:bg-white/5 transition-colors cursor-pointer"
                aria-label="Iniciar Chamada de Voz"
              >
                <Phone className="w-4 h-4 md:w-5 md:h-5" />
              </button>
            ) : undefined
          }
          showPinnedOnly={showPinnedOnly}
          onTogglePinned={() => setShowPinnedOnly(!showPinnedOnly)}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onSearchSubmit={(q) => setAppliedSearchQuery(q)}
          onClearSearch={() => {
            setSearchQuery('');
            setAppliedSearchQuery('');
          }}
          hasAppliedSearch={Boolean(appliedSearchQuery)}
          searchMembers={[recipient]}
          searchContextType="dm"
        />
      }
      topOverlay={
        isCallActiveInThisRoom ? (
          <ActiveCallOverlay
            onOpenScreenShare={onOpenScreenShare}
            onOpenUserProfile={onOpenUserProfile}
          />
        ) : undefined
      }
      welcomeBanner={
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
          <p className="text-xs md:text-sm text-gray-400 font-mono">@{recipient.username}</p>
          <p className="text-xs text-gray-500 mt-2">
            Este é o início da sua história de mensagens diretas com @{recipient.username}.
          </p>
        </div>
      }
    />
  );
};
