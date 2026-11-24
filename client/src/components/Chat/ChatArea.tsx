import React, { useEffect, useState, useMemo } from 'react';
import { Hash, Menu } from 'lucide-react';
import { useGuildStore } from '../../stores/guildStore';
import { useAuthStore } from '../../stores/authStore';
import { MemberList } from '../Sidebar/MemberList';
import { ChatHeader } from './ChatHeader';
import { ConversationView } from './ConversationView';
import { setActiveChat, getActiveChat } from '../../utils/activeChat';
import { User, UserProfilePosition } from '../../types';

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
    markChannelAsRead,
  } = useGuildStore();

  const [localShowMemberList, setLocalShowMemberList] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('zerovc_server_members_open');
      if (saved !== null) return saved === 'true';
    } catch {}
    return typeof window !== 'undefined' ? window.innerWidth >= 768 : true;
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [appliedSearchQuery, setAppliedSearchQuery] = useState('');
  const [showPinnedOnly, setShowPinnedOnly] = useState(false);

  useEffect(() => {
    if (showPinnedOnly && activeChannel) {
      fetchPinnedMessages(activeChannel.id);
    }
  }, [showPinnedOnly, activeChannel?.id]);

  useEffect(() => {
    if (activeChannel?.id) {
      setActiveChat('channel', activeChannel.id);
    }
    return () => {
      const cur = getActiveChat();
      if (cur && cur.type === 'channel' && cur.id === activeChannel?.id) {
        setActiveChat('none', null);
      }
    };
  }, [activeChannel?.id]);

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
    <ConversationView
      conversationKey={`channel:${activeChannel.id}`}
      contextType="guild"
      messages={messages || []}
      pinnedMessages={pinnedMessagesByChannel?.[activeChannel.id] || []}
      firstUnreadId={firstUnreadMessageIdByChannel[activeChannel.id]}
      hasMore={hasMoreByChannel[activeChannel.id] !== false}
      isLoadingMessages={isLoadingMessages}
      isLoadingMoreMessages={isLoadingMoreMessages}
      isLoadingPinned={Boolean(isLoadingPinned?.[activeChannel.id])}
      showPinnedOnly={showPinnedOnly}
      onClearPinnedOnly={() => setShowPinnedOnly(false)}
      pinnedContextSuffix="neste canal"
      searchQuery={searchQuery}
      appliedSearchQuery={appliedSearchQuery}
      onClearSearch={() => {
        setSearchQuery('');
        setAppliedSearchQuery('');
      }}
      searchContextName={`#${activeChannel.name}`}
      searchContextCategory={activeGuild?.name}
      typingUserIds={typingUserIds}
      typingMembers={activeGuild?.members || []}
      inputChannel={activeChannel}
      onSendMessage={async (content, replyToId, isTTS, file) => {
        markChannelAsRead(activeChannel.id);
        await sendMessage(content, replyToId, isTTS, file);
      }}
      onLoadMore={() => loadMoreMessages(activeChannel.id)}
      onMarkAsRead={() => markChannelAsRead(activeChannel.id)}
      onOpenUserProfile={onOpenUserProfile}
      onOpenDM={onOpenDM}
      onPreviewImage={onPreviewImage}
      header={
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
      }
      rightSidebar={
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
      }
    />
  );
};
