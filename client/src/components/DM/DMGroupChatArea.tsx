import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Users,
  Menu,
  Phone,
  PhoneOff,
  LogOut,
  UploadCloud,
  Search,
  X,
} from 'lucide-react';
import { useDMGroupStore } from '../../stores/dmGroupStore';
import { useAuthStore } from '../../stores/authStore';
import { api, formatAssetUrl } from '../../lib/api';
import { livekit } from '../../lib/livekit';
import { MessageItem } from '../Chat/MessageItem';
import { MessageInput } from '../Chat/MessageInput';
import { SearchAutocompletePopout } from '../Chat/SearchAutocompletePopout';
import { parseSearchQuery, filterMessages } from '../../utils/searchFilters';
import { User, DMGroupMessage } from '../../types';

interface DMGroupChatAreaProps {
  onOpenMobileDrawer?: () => void;
  onOpenUserProfile?: (user: User, position?: { x: number; y: number }) => void;
  onPreviewImage?: (url: string) => void;
}

export const DMGroupChatArea: React.FC<DMGroupChatAreaProps> = ({
  onOpenMobileDrawer,
  onOpenUserProfile,
  onPreviewImage,
}) => {
  const { user } = useAuthStore();
  const {
    activeGroup,
    messages,
    sendMessage,
    editMessage,
    deleteMessage,
    removeMember,
    removeMessageFromStore,
    isLoadingMessages,
    isLoadingMoreMessages,
    hasMoreByGroup,
    loadMoreMessages,
  } = useDMGroupStore();

  const [replyingTo, setReplyingTo] = useState<DMGroupMessage | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [showMemberList, setShowMemberList] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('zerovc_group_members_open');
      if (saved !== null) {
        return saved === 'true';
      }
    } catch {}
    return typeof window !== 'undefined' ? window.innerWidth >= 768 : true;
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchAutocompleteOpen, setIsSearchAutocompleteOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const [isInGroupVoice, setIsInGroupVoice] = useState(false);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [droppedFile, setDroppedFile] = useState<File | null>(null);
  const dragCounterRef = useRef<number>(0);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const prevScrollHeightRef = useRef<number | null>(null);
  const isInitialLoadRef = useRef<boolean>(true);
  const prevGroupIdRef = useRef<string | null>(null);

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

  const scrollToBottom = (smooth = false) => {
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
  };

  useEffect(() => {
    if (activeGroup?.id !== prevGroupIdRef.current) {
      prevGroupIdRef.current = activeGroup?.id || null;
      isInitialLoadRef.current = true;
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
      }
    }
  }, [activeGroup?.id]);

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
    if (!container || !activeGroup) return;

    if (container.scrollTop < 60 && !isLoadingMoreMessages && hasMoreByGroup[activeGroup.id] !== false) {
      prevScrollHeightRef.current = container.scrollHeight;
      loadMoreMessages(activeGroup.id);
    }
  };

  const parsedSearch = useMemo(() => parseSearchQuery(searchQuery), [searchQuery]);

  const displayedMessages = useMemo(() => {
    return filterMessages(messages, parsedSearch);
  }, [messages, parsedSearch]);

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

  const handleJoinVoice = async () => {
    if (!activeGroup) return;
    if (isInGroupVoice) {
      await livekit.disconnect();
      setIsInGroupVoice(false);
    } else {
      try {
        const res = await api.dmGroups.getVoiceToken(activeGroup.id);
        await livekit.connect(res.livekit_url, res.token, {});
        setIsInGroupVoice(true);
      } catch (err: any) {
        alert(err.message || 'Falha ao conectar na chamada em grupo');
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

  // Group members mention suggestions
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

      {/* Group Header */}
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

          <div className="w-7 h-7 rounded-full bg-brand-500/20 text-brand-400 flex items-center justify-center font-bold text-xs flex-shrink-0 border border-brand-500/30">
            {activeGroup.icon_url ? (
              <img src={formatAssetUrl(activeGroup.icon_url)} alt="" className="w-full h-full rounded-full object-cover" />
            ) : (
              <Users className="w-4 h-4" />
            )}
          </div>

          <div className="flex items-baseline gap-2 min-w-0">
            <span className="font-bold text-sm text-gray-100 truncate">
              {groupName}
            </span>
            <span className="text-[11px] text-gray-500 hidden sm:inline flex-shrink-0">
              {activeGroup.members?.length || 0} membros
            </span>
          </div>
        </div>

        {/* Right Header Actions */}
        <div className="flex items-center gap-1.5 md:gap-2 flex-shrink-0">
          {/* Voice Channel in Group Toggle */}
          <button
            onClick={handleJoinVoice}
            className={`p-2 md:p-1.5 rounded-lg transition-colors cursor-pointer ${
              isInGroupVoice
                ? 'bg-dnd text-white hover:bg-dnd/80'
                : 'text-gray-400 hover:text-online hover:bg-white/5'
            }`}
            title={isInGroupVoice ? 'Sair da Chamada de Voz' : 'Entrar na Chamada de Voz'}
          >
            {isInGroupVoice ? <PhoneOff className="w-4 h-4" /> : <Phone className="w-4 h-4" />}
          </button>

          {/* Member List Toggle */}
          <button
            onClick={() => {
              const next = !showMemberList;
              setShowMemberList(next);
              try {
                localStorage.setItem('zerovc_group_members_open', String(next));
              } catch {}
            }}
            className={`p-2 md:p-1.5 rounded-lg transition-colors cursor-pointer ${
              showMemberList ? 'text-brand-400 bg-white/10' : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
            }`}
            title="Lista de Membros"
          >
            <Users className="w-4 h-4" />
          </button>

          {/* Discord-style Search Input Box (Last element on the right) */}
          <div
            ref={searchContainerRef}
            className="flex items-center gap-1.5 bg-background-darkest/90 hover:bg-background-darkest px-2.5 py-1 md:py-1.5 rounded-lg border border-white/5 focus-within:border-brand-500/50 text-xs transition-all duration-200 w-32 sm:w-44 md:w-56 focus-within:w-44 sm:focus-within:w-56 md:focus-within:w-64 relative"
          >
            <Search className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                if (!isSearchAutocompleteOpen) setIsSearchAutocompleteOpen(true);
              }}
              onFocus={() => setIsSearchAutocompleteOpen(true)}
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

          {/* Floating Search Autocomplete Popout Modal */}
          <SearchAutocompletePopout
            isOpen={isSearchAutocompleteOpen}
            onClose={() => setIsSearchAutocompleteOpen(false)}
            query={searchQuery}
            onSelectFilter={(newQ) => {
              setSearchQuery(newQ);
              searchInputRef.current?.focus();
            }}
            anchorRef={searchContainerRef}
            members={activeGroup?.members || []}
            contextType="dm_group"
          />
        </div>
      </div>

      {/* Main Area (Messages + optional Member List) */}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Messages Scroll Area */}
          <div
            ref={scrollContainerRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto px-2 md:px-4 py-2 no-scrollbar"
          >
            {isLoadingMoreMessages && (
              <div className="flex justify-center items-center gap-2 py-3 text-xs text-gray-400">
                <div className="w-3.5 h-3.5 border-2 border-brand-400 border-t-transparent rounded-full animate-spin" />
                <span>Carregando mensagens anteriores...</span>
              </div>
            )}

            {/* Welcome header for Group at top */}
            {hasMoreByGroup[activeGroup.id] === false && (
              <div className="px-2 md:px-4 py-6 md:py-8 mb-4 border-b border-white/5 select-none">
                <div className="w-14 h-14 md:w-16 md:h-16 rounded-3xl bg-brand-500/20 border border-brand-500/30 text-brand-400 flex items-center justify-center mb-3 shadow-lg">
                  <Users className="w-8 h-8" />
                </div>
                <h2 className="text-xl md:text-2xl font-bold text-white mb-1">
                  Bem-vindo a {groupName}!
                </h2>
                <p className="text-xs text-gray-500">
                  Este é o início do grupo {groupName}.
                </p>
              </div>
            )}

            {isLoadingMessages ? (
              <div className="flex justify-center items-center gap-2 py-10 text-sm text-gray-500">
                <div className="w-4 h-4 border-2 border-brand-400 border-t-transparent rounded-full animate-spin" />
                <span>Carregando mensagens...</span>
              </div>
            ) : displayedMessages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-500 gap-2 select-none">
                <span>{searchQuery ? 'Nenhuma mensagem encontrada para essa busca.' : 'Nenhuma mensagem ainda no grupo. Diga olá!'}</span>
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
                    onRetryMessage={async (msg) => {
                      removeMessageFromStore(msg.id, activeGroup.id);
                      await sendMessage(msg.content, undefined, msg.reply_to_id);
                    }}
                    onRemoveFailedMessage={(id) => {
                      removeMessageFromStore(id, activeGroup.id);
                    }}
                    contextType="dm_group"
                  />
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Universal Message Input */}
          <MessageInput
            placeholder={`Conversar em ${groupName}`}
            replyingTo={replyingTo}
            onCancelReply={() => setReplyingTo(null)}
            onSendMessage={async (content, replyToId) => {
              await sendMessage(content, undefined, replyToId);
              setReplyingTo(null);
            }}
            onEditLastMessage={handleEditLastMessage}
            droppedFile={droppedFile}
            onClearDroppedFile={() => setDroppedFile(null)}
            contextType="dm_group"
            customMentions={groupMemberMentions}
          />
        </div>

        {/* Right Member Sidebar (if toggled) */}
        {showMemberList && (
          <div className="w-56 bg-background-darker border-l border-white/5 p-3 flex flex-col select-none overflow-y-auto no-scrollbar">
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2 block">
              Membros — {activeGroup.members?.length || 0}
            </span>

            <div className="space-y-1 flex-1">
              {(activeGroup.members || []).map((m) => (
                <div
                  key={m.id}
                  onClick={(e) => onOpenUserProfile?.(m, { x: e.clientX, y: e.clientY })}
                  className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-white/5 cursor-pointer text-xs transition-colors"
                >
                  <div className="w-7 h-7 rounded-full bg-brand-500 flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
                    {m.avatar_url ? (
                      <img src={formatAssetUrl(m.avatar_url)} alt="" className="w-full h-full rounded-full object-cover" />
                    ) : (
                      <span>{m.display_name?.[0]?.toUpperCase() || m.username?.[0]?.toUpperCase()}</span>
                    )}
                  </div>
                  <div className="truncate">
                    <span className="text-gray-200 font-medium block truncate">
                      {m.display_name || m.username}
                    </span>
                    {m.id === activeGroup.owner_id && (
                      <span className="text-[9px] text-brand-400 block">Dono</span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Leave Group Button */}
            <button
              onClick={async () => {
                if (confirm('Tem certeza que deseja sair deste grupo?')) {
                  if (user) {
                    await removeMember(activeGroup.id, user.id);
                  }
                }
              }}
              className="mt-4 flex items-center gap-1.5 p-2 rounded-lg text-xs font-semibold text-dnd hover:bg-dnd/10 transition-colors cursor-pointer border border-dnd/20"
            >
              <LogOut className="w-4 h-4" />
              <span>Sair do Grupo</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
