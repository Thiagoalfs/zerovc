import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Users, Menu, Phone, LogOut, Edit3, Camera } from 'lucide-react';
import { useDMGroupStore } from '../../stores/dmGroupStore';
import { CallStage, CompactCallStageWrapper } from '../Voice/CallStage';
import { useStageFullscreen } from '../Voice/VoiceControlBar';
import { showAlert, showConfirm } from '../../stores/confirmModalStore';
import { useAuthStore } from '../../stores/authStore';
import { useVoiceStore } from '../../stores/voiceStore';
import { api, formatAssetUrl } from '../../lib/api';
import { AddDMGroupMembersModal } from '../Modals/AddDMGroupMembersModal';
import { EditDMGroupNameModal } from '../Modals/EditDMGroupNameModal';
import { ImageCropModal } from '../Modals/ImageCropModal';
import { ChatHeader } from '../Chat/ChatHeader';
import { ConversationView } from '../Chat/ConversationView';
import { MemberList } from '../Sidebar/MemberList';
import { socket } from '../../lib/socket';
import { useGuildStore } from '../../stores/guildStore';
import { useKeepAwake } from '../../hooks/useKeepAwake';
import { hapticMedium, hapticWarning } from '../../lib/haptics';
import { setActiveChat, getActiveChat } from '../../utils/activeChat';
import { User, UserProfilePosition } from '../../types';

interface DMGroupChatAreaProps {
  onOpenMobileDrawer?: () => void;
  onOpenUserProfile?: (user: User, position?: { x: number; y: number }) => void;
  onPreviewImage?: (url: string) => void;
  onOpenScreenShare?: () => void;
  onOpenDM?: (userId: string) => void;
  onSelectFriends?: () => void;
}

export const DMGroupChatArea: React.FC<DMGroupChatAreaProps> = ({
  onOpenMobileDrawer,
  onOpenUserProfile,
  onPreviewImage,
  onOpenScreenShare,
  onOpenDM,
  onSelectFriends,
}) => {
  const { user } = useAuthStore();
  const {
    activeGroup,
    messages,
    pinnedMessagesByGroup,
    isLoadingPinned,
    fetchPinnedMessages,
    sendMessage,
    editMessage,
    deleteMessage,
    togglePin,
    leaveGroup,
    updateGroup,
    removeMessageFromStore,
    isLoadingMessages,
    isLoadingMoreMessages,
    hasMoreByGroup,
    loadMoreMessages,
    firstUnreadMessageIdByGroup,
    clearUnreadDivider,
    markGroupAsRead,
  } = useDMGroupStore();

  const [showPinnedOnly, setShowPinnedOnly] = useState(false);
  const [isAddMembersOpen, setIsAddMembersOpen] = useState(false);
  const [isEditNameOpen, setIsEditNameOpen] = useState(false);
  const [isCropOpen, setIsCropOpen] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const groupIconInputRef = useRef<HTMLInputElement>(null);

  const handleIconFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setCropFile(e.target.files[0]);
      setIsCropOpen(true);
    }
    if (groupIconInputRef.current) {
      groupIconInputRef.current.value = '';
    }
  };

  const handleCropConfirm = async (croppedFile: File) => {
    setIsCropOpen(false);
    setCropFile(null);
    if (!activeGroup) return;
    try {
      const res = await api.upload.groupIcon(croppedFile);
      await updateGroup(activeGroup.id, { icon_url: res.url });
    } catch (err: any) {
      showAlert({
        title: 'Erro',
        message: err?.message || 'Falha ao atualizar foto do grupo',
        variant: 'danger',
      });
    }
  };

  const {
    voiceType,
    dmGroupId,
    isConnected: isVoiceConnected,
    isConnecting: isVoiceConnecting,
    participants,
    joinGroupVoice,
    leaveVoice,
  } = useVoiceStore();

  const isGroupVoiceActive =
    voiceType === 'group' && dmGroupId === activeGroup?.id && isVoiceConnected;
  const isGroupVoiceConnecting =
    voiceType === 'group' && dmGroupId === activeGroup?.id && isVoiceConnecting;

  useKeepAwake(isGroupVoiceActive);

  useEffect(() => {
    if (activeGroup?.id) {
      setActiveChat('group', activeGroup.id);
    }
    return () => {
      if (getActiveChat().id === activeGroup?.id) {
        setActiveChat('none', null);
      }
    };
  }, [activeGroup?.id]);

  useEffect(() => {
    if (showPinnedOnly && activeGroup) {
      fetchPinnedMessages(activeGroup.id);
    }
  }, [showPinnedOnly, activeGroup?.id]);

  const typingUsers = useGuildStore((s) => s.typingUsers);
  const typingUserIds = useMemo(() => {
    if (!activeGroup) return [];
    return Array.from(typingUsers.get(activeGroup.id) || []).filter((id) => id !== user?.id);
  }, [typingUsers, activeGroup, user?.id]);

  const [showMemberList, setShowMemberList] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('zerovc_group_members_open');
      if (saved !== null) return saved === 'true';
    } catch {}
    return typeof window !== 'undefined' ? window.innerWidth >= 768 : true;
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [appliedSearchQuery, setAppliedSearchQuery] = useState('');
  const { isFullscreen: isStageFullscreen, toggleFullscreen: toggleStageFullscreen } =
    useStageFullscreen();

  const handleToggleVoice = async () => {
    if (!activeGroup) return;
    if (isGroupVoiceActive || isGroupVoiceConnecting) {
      hapticWarning();
      await leaveVoice();
    } else {
      hapticMedium();
      try {
        await joinGroupVoice(activeGroup.id, activeGroup);
      } catch (err: any) {
        showAlert({
          title: 'Falha na conexão',
          message: err.message || 'Falha ao conectar na chamada em grupo',
          variant: 'danger',
        });
      }
    }
  };

  const groupName = useMemo(() => {
    if (!activeGroup) return '';
    if (activeGroup.name) return activeGroup.name;
    const names = (activeGroup.members || [])
      .filter((m) => m.id !== user?.id)
      .map((m) => m.display_name || m.username);
    return names.length > 0 ? names.join(', ') : 'Grupo';
  }, [activeGroup, user?.id]);

  const groupMemberMentions = useMemo(() => {
    if (!activeGroup?.members) return [];
    return activeGroup.members.map((m) => ({
      id: m.id,
      name: m.display_name || m.username,
      username: m.username,
      avatar_url: m.avatar_url,
    }));
  }, [activeGroup?.members]);

  if (!activeGroup) {
    return (
      <div className="flex-1 bg-background-dark flex flex-col items-center justify-center text-gray-500 font-medium p-4 select-none">
        {onOpenMobileDrawer && (
          <button
            onClick={onOpenMobileDrawer}
            className="md:hidden mb-4 bg-brand-500 text-white px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 cursor-pointer shadow-md"
          >
            <Menu className="w-4 h-4" />
            <span>Abrir Conversas</span>
          </button>
        )}
        <Users className="w-12 h-12 text-gray-600 mb-2" />
        <span className="text-gray-400">Selecione um grupo para começar</span>
      </div>
    );
  }

  return (
    <ConversationView
      conversationKey={`dm_group:${activeGroup.id}`}
      contextType="dm_group"
      className="flex-1 flex flex-col bg-background-dark overflow-hidden relative"
      messages={messages || []}
      pinnedMessages={pinnedMessagesByGroup?.[activeGroup.id] || []}
      firstUnreadId={firstUnreadMessageIdByGroup[activeGroup.id]}
      hasMore={hasMoreByGroup[activeGroup.id] !== false}
      isLoadingMessages={isLoadingMessages}
      isLoadingMoreMessages={isLoadingMoreMessages}
      isLoadingPinned={Boolean(isLoadingPinned?.[activeGroup.id])}
      showPinnedOnly={showPinnedOnly}
      onClearPinnedOnly={() => setShowPinnedOnly(false)}
      searchQuery={searchQuery}
      appliedSearchQuery={appliedSearchQuery}
      onClearSearch={() => {
        setSearchQuery('');
        setAppliedSearchQuery('');
      }}
      searchContextName={groupName}
      searchContextCategory="Grupo de DM"
      typingUserIds={typingUserIds}
      typingMembers={activeGroup.members || []}
      emptyText="Nenhuma mensagem ainda. Envie um Olá!"
      inputChannel={{ id: activeGroup.id, name: groupName }}
      inputPlaceholder={`Conversar em ${groupName}...`}
      customMentions={groupMemberMentions}
      wrapInputInContainer
      onSendMessage={async (content, replyToId, isTTS, file) => {
        clearUnreadDivider(activeGroup.id);
        await sendMessage(content, undefined, replyToId, isTTS, file);
      }}
      onTyping={() => {
        socket.send('TYPING_START', {
          channel_id: activeGroup.id,
          user_ids: activeGroup.members?.map((m) => m.id),
        });
      }}
      onLoadMore={() => loadMoreMessages(activeGroup.id)}
      onMarkAsRead={() => markGroupAsRead(activeGroup.id)}
      onClearUnreadDivider={() => clearUnreadDivider(activeGroup.id)}
      onOpenUserProfile={onOpenUserProfile}
      onPreviewImage={onPreviewImage}
      onEditMessage={async (id, newContent) => {
        await editMessage(id, newContent);
      }}
      onDeleteMessage={async (id) => {
        await deleteMessage(id);
      }}
      onTogglePin={async (id) => {
        await togglePin(id);
      }}
      onRetryMessage={async (msg) => {
        removeMessageFromStore(msg.id, activeGroup.id);
        await sendMessage(msg.content, undefined, msg.reply_to_id);
      }}
      onRemoveFailedMessage={(id) => {
        removeMessageFromStore(id, activeGroup.id);
      }}
      header={
        <ChatHeader
          onOpenMobileDrawer={onOpenMobileDrawer}
          icon={
            <div
              onClick={() => groupIconInputRef.current?.click()}
              className="w-7 h-7 rounded-full bg-brand-500/20 text-brand-400 flex items-center justify-center font-bold text-xs flex-shrink-0 border border-brand-500/30 cursor-pointer relative group overflow-hidden"
              title="Alterar foto do grupo"
            >
              {activeGroup.icon_url ? (
                <img
                  src={formatAssetUrl(activeGroup.icon_url)}
                  alt=""
                  className="w-full h-full rounded-full object-cover"
                />
              ) : (
                <Users className="w-4 h-4" />
              )}
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity rounded-full">
                <Camera className="w-3.5 h-3.5 text-white" />
              </div>
            </div>
          }
          title={
            <div className="flex items-center gap-1.5 min-w-0">
              <span
                onClick={() => setIsEditNameOpen(true)}
                className="font-bold text-sm text-gray-100 truncate cursor-pointer hover:underline"
                title="Clique para mudar o nome do grupo"
              >
                {groupName}
              </span>
              <button
                type="button"
                onClick={() => setIsEditNameOpen(true)}
                className="p-1 text-gray-400 hover:text-white rounded hover:bg-white/5 transition-colors cursor-pointer"
                title="Mudar nome do grupo"
              >
                <Edit3 className="w-3.5 h-3.5" />
              </button>
            </div>
          }
          subtitle={`${activeGroup.members?.length || 0} membros`}
          actions={
            !isGroupVoiceActive ? (
              <button
                onClick={handleToggleVoice}
                className={`p-2 md:p-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 text-xs font-semibold ${
                  isGroupVoiceConnecting
                    ? 'bg-brand-500/50 text-white animate-pulse'
                    : 'text-gray-400 hover:text-online hover:bg-white/5'
                }`}
                title={isGroupVoiceConnecting ? 'Conectando à Voz...' : 'Entrar na Chamada de Voz'}
              >
                <Phone className="w-4 h-4" />
              </button>
            ) : null
          }
          showPinnedOnly={showPinnedOnly}
          onTogglePinned={() => setShowPinnedOnly(!showPinnedOnly)}
          showMembers={showMemberList}
          onToggleMembers={() => {
            const next = !showMemberList;
            setShowMemberList(next);
            try {
              localStorage.setItem('zerovc_group_members_open', String(next));
            } catch {}
          }}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onSearchSubmit={(q) => setAppliedSearchQuery(q)}
          onClearSearch={() => {
            setSearchQuery('');
            setAppliedSearchQuery('');
          }}
          hasAppliedSearch={Boolean(appliedSearchQuery)}
          searchMembers={activeGroup.members || []}
          searchContextType="dm_group"
        />
      }
      topOverlay={
        isGroupVoiceActive || isGroupVoiceConnecting ? (
          <CompactCallStageWrapper isFullscreen={isStageFullscreen}>
            <CallStage
              variant="compact"
              controlsMode="always"
              participants={participants}
              isConnected={isGroupVoiceActive}
              isConnecting={isGroupVoiceConnecting}
              connectingLabel="Conectando à chamada do grupo..."
              emptyTitle="Aguardando participantes..."
              isFullscreen={isStageFullscreen}
              onToggleFullscreen={toggleStageFullscreen}
              onOpenScreenShare={onOpenScreenShare}
              onOpenUserProfile={onOpenUserProfile}
              onOpenDM={onOpenDM}
            />
          </CompactCallStageWrapper>
        ) : undefined
      }
      welcomeBanner={
        <div className="flex flex-col items-center justify-center text-center py-8 px-4 border-b border-white/5 mb-4 select-none">
          <div className="w-16 h-16 rounded-full bg-brand-500/20 text-brand-400 flex items-center justify-center font-bold text-2xl mb-3 border border-brand-500/30 shadow-lg">
            {activeGroup.icon_url ? (
              <img
                src={formatAssetUrl(activeGroup.icon_url)}
                alt=""
                className="w-full h-full rounded-full object-cover"
              />
            ) : (
              <Users className="w-8 h-8" />
            )}
          </div>
          <h2 className="text-xl font-bold text-white mb-1">Bem-vindo ao {groupName}!</h2>
          <p className="text-xs text-gray-400 max-w-sm">
            Este é o início do grupo. Converse, compartilhe arquivos e divirta-se com seus amigos.
          </p>
        </div>
      }
      rightSidebar={
        <MemberList
          variant="group"
          group={activeGroup}
          isOpen={showMemberList}
          onClose={() => setShowMemberList(false)}
          onAddGroupMembers={() => setIsAddMembersOpen(true)}
          onSelectUser={onOpenUserProfile}
          onOpenDM={onOpenDM}
          footer={
            <div className="pt-2 border-t border-white/5">
              <button
                onClick={async () => {
                  if (activeGroup.owner_id === user?.id && (activeGroup.members?.length || 0) > 1) {
                    showAlert({
                      title: 'Transferência necessária',
                      message:
                        'Você é o dono deste grupo. Transfira a posse do grupo para outro membro antes de sair (clique com botão direito em um membro).',
                      variant: 'warning',
                    });
                    return;
                  }
                  const ok = await showConfirm({
                    title: 'Sair do grupo',
                    message: 'Tem certeza que deseja sair deste grupo?',
                    confirmText: 'Sair do grupo',
                    variant: 'danger',
                  });
                  if (ok) {
                    onSelectFriends?.();
                    leaveGroup(activeGroup.id);
                  }
                }}
                className="w-full flex items-center justify-center gap-2 text-xs font-semibold text-dnd hover:text-white bg-dnd/10 hover:bg-dnd p-2 rounded-lg transition-colors cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sair do Grupo</span>
              </button>
            </div>
          }
        />
      }
      extraOverlays={
        <>
          <input
            ref={groupIconInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={handleIconFileChange}
          />
          {isCropOpen && cropFile && (
            <ImageCropModal
              isOpen={isCropOpen}
              file={cropFile}
              cropType="groupIcon"
              onConfirm={handleCropConfirm}
              onCancel={() => {
                setIsCropOpen(false);
                setCropFile(null);
              }}
            />
          )}
          {isAddMembersOpen && (
            <AddDMGroupMembersModal
              isOpen={isAddMembersOpen}
              onClose={() => setIsAddMembersOpen(false)}
              group={activeGroup}
            />
          )}
          {isEditNameOpen && (
            <EditDMGroupNameModal
              isOpen={isEditNameOpen}
              onClose={() => setIsEditNameOpen(false)}
              group={activeGroup}
            />
          )}
        </>
      }
    />
  );
};
