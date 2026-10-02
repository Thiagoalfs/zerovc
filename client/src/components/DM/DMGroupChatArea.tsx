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
  Mic,
  MicOff,
  Headphones,
  Video,
  VideoOff,
  Monitor,
  Volume2,
} from 'lucide-react';
import { useDMGroupStore } from '../../stores/dmGroupStore';
import { useAuthStore } from '../../stores/authStore';
import { useVoiceStore } from '../../stores/voiceStore';
import { api, formatAssetUrl } from '../../lib/api';
import { MessageItem } from '../Chat/MessageItem';
import { MessageInput } from '../Chat/MessageInput';
import { SearchAutocompletePopout } from '../Chat/SearchAutocompletePopout';
import { SearchResultsPanel } from '../Chat/SearchResultsPanel';
import { ParticipantCard } from '../Voice/ParticipantCard';
import { ContextMenu, useContextMenu, ContextMenuItem } from '../ContextMenu';
import { useUserContextMenu } from '../../hooks/useUserContextMenu';
import { socket } from '../../lib/socket';
import { useGuildStore } from '../../stores/guildStore';
import { TypingIndicator } from '../Chat/TypingIndicator';
import { parseSearchQuery, filterMessages } from '../../utils/searchFilters';
import { smoothScrollToBottomExponential } from '../../utils/scrollUtils';
import { useKeepAwake } from '../../hooks/useKeepAwake';
import { hapticMedium, hapticWarning } from '../../lib/haptics';
import { User, DMGroupMessage } from '../../types';

interface DMGroupChatAreaProps {
  onOpenMobileDrawer?: () => void;
  onOpenUserProfile?: (user: User, position?: { x: number; y: number }) => void;
  onPreviewImage?: (url: string) => void;
  onOpenScreenShare?: () => void;
  onOpenDM?: (userId: string) => void;
}

export const DMGroupChatArea: React.FC<DMGroupChatAreaProps> = ({
  onOpenMobileDrawer,
  onOpenUserProfile,
  onPreviewImage,
  onOpenScreenShare,
  onOpenDM,
}) => {
  const { user } = useAuthStore();
  const {
    activeGroup,
    messages,
    sendMessage,
    editMessage,
    deleteMessage,
    leaveGroup,
    removeMessageFromStore,
    isLoadingMessages,
    isLoadingMoreMessages,
    hasMoreByGroup,
    loadMoreMessages,
    firstUnreadMessageIdByGroup,
    clearUnreadDivider,
  } = useDMGroupStore();
  const { menu, closeContextMenu, handleUserContextMenu } = useUserContextMenu();
  const {
    menu: screenShareMenu,
    openContextMenu: openScreenShareMenu,
    closeContextMenu: closeScreenShareMenu,
  } = useContextMenu();

  const {
    voiceType,
    dmGroupId,
    isConnected: isVoiceConnected,
    isConnecting: isVoiceConnecting,
    isMuted,
    isDeafened,
    isCameraOn,
    isScreensharing,
    participants,
    joinGroupVoice,
    leaveVoice,
    toggleMute,
    toggleDeafen,
    toggleCamera,
    stopScreenShare,
  } = useVoiceStore();

  const isGroupVoiceActive =
    voiceType === 'group' && dmGroupId === activeGroup?.id && isVoiceConnected;
  const isGroupVoiceConnecting =
    voiceType === 'group' && dmGroupId === activeGroup?.id && isVoiceConnecting;

  useKeepAwake(isGroupVoiceActive);

  const [replyingTo, setReplyingTo] = useState<DMGroupMessage | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);

  const typingUsers = useGuildStore((s) => s.typingUsers);
  const typingUserIds = useMemo(() => {
    if (!activeGroup) return [];
    return Array.from(typingUsers.get(activeGroup.id) || []).filter((id) => id !== user?.id);
  }, [typingUsers, activeGroup, user?.id]);

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
  const [appliedSearchQuery, setAppliedSearchQuery] = useState('');
  const [isSearchAutocompleteOpen, setIsSearchAutocompleteOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [droppedFile, setDroppedFile] = useState<File | null>(null);
  const dragCounterRef = useRef<number>(0);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const prevScrollHeightRef = useRef<number | null>(null);
  const isInitialLoadRef = useRef<boolean>(true);
  const prevGroupIdRef = useRef<string | null>(null);

  // Group Voice Grid Resize Observer
  const stageRef = useRef<HTMLDivElement>(null);
  const [stageDimensions, setStageDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;

    const updateDim = () => {
      const rect = el.getBoundingClientRect();
      setStageDimensions({ width: rect.width, height: rect.height });
    };

    updateDim();
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setStageDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, [isGroupVoiceActive]);

  // Exact 16:9 adaptive grid layout for group voice
  const stageLayout = useMemo(() => {
    const count = participants.length;
    if (count === 0 || stageDimensions.width === 0 || stageDimensions.height === 0) {
      return { cardWidth: 0, cardHeight: 0, rows: [] };
    }

    const W = stageDimensions.width;
    const H = stageDimensions.height;
    const gap = count > 1 ? (W < 640 ? 8 : 12) : 0;
    const paddingX = W < 640 ? 8 : 12;
    const paddingY = W < 640 ? 8 : 12;

    const availableW = Math.max(60, W - paddingX * 2);
    const availableH = Math.max(60, H - paddingY * 2);
    const targetAspect = 16 / 9;

    let bestCols = 1;
    let bestCardW = 0;
    let bestCardH = 0;
    let maxArea = 0;

    const maxColsToTry = Math.min(count, 6);
    for (let c = 1; c <= maxColsToTry; c++) {
      const r = Math.ceil(count / c);
      const slotW = (availableW - (c - 1) * gap) / c;
      const slotH = (availableH - (r - 1) * gap) / r;

      if (slotW <= 0 || slotH <= 0) continue;

      let w = slotW;
      let h = w / targetAspect;

      if (h > slotH) {
        h = slotH;
        w = h * targetAspect;
      }

      if (count === 1) {
        const maxW = Math.min(460, availableW);
        const maxH = Math.min(260, availableH);
        if (w > maxW) {
          w = maxW;
          h = w / targetAspect;
        }
        if (h > maxH) {
          h = maxH;
          w = h * targetAspect;
        }
      }

      const area = w * h;
      if (area > maxArea) {
        maxArea = area;
        bestCols = c;
        bestCardW = Math.floor(w);
        bestCardH = Math.floor(h);
      }
    }

    const rows: (typeof participants)[] = [];
    for (let i = 0; i < count; i += bestCols) {
      rows.push(participants.slice(i, i + bestCols));
    }

    return {
      cardWidth: bestCardW,
      cardHeight: bestCardH,
      rows,
    };
  }, [participants, stageDimensions]);

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
        smoothScrollToBottomExponential(scrollContainerRef.current);
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

  const firstUnreadId = activeGroup ? firstUnreadMessageIdByGroup[activeGroup.id] : null;

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
    const isNearBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight < 350;

    if (isMyMessage && activeGroup) {
      clearUnreadDivider(activeGroup.id);
    }

    if (isNearBottom || isMyMessage) {
      scrollToBottom(true);
      setTimeout(() => scrollToBottom(true), 100);
      setTimeout(() => scrollToBottom(true), 300);
    }
  }, [messages, user?.id, firstUnreadId]);

  const handleScroll = () => {
    const container = scrollContainerRef.current;
    if (!container || !activeGroup) return;

    if (
      container.scrollTop < 60 &&
      !isLoadingMoreMessages &&
      hasMoreByGroup[activeGroup.id] !== false
    ) {
      prevScrollHeightRef.current = container.scrollHeight;
      loadMoreMessages(activeGroup.id);
    }

    const isNearBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight < 35;
    if (isNearBottom && firstUnreadId) {
      clearUnreadDivider(activeGroup.id);
    }
  };

  const parsedSearch = useMemo(() => parseSearchQuery(appliedSearchQuery), [appliedSearchQuery]);
  const displayedMessages = messages;

  const searchResults = useMemo(() => {
    if (!appliedSearchQuery) return [];
    return filterMessages(messages, parsedSearch);
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
        alert(err.message || 'Falha ao conectar na chamada em grupo');
      }
    }
  };

  const handleScreenShareClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isScreensharing) {
      const rect = e.currentTarget.getBoundingClientRect();
      const items: ContextMenuItem[] = [
        {
          id: 'switch-screen',
          label: 'Trocar tela',
          icon: <Monitor className="w-4 h-4" />,
          onClick: () => {
            if (onOpenScreenShare) {
              onOpenScreenShare();
            }
          },
        },
        {
          id: 'stop-screen',
          label: 'Parar compartilhamento',
          variant: 'danger',
          onClick: () => {
            stopScreenShare();
          },
        },
      ];
      openScreenShareMenu(
        { clientX: rect.left + rect.width / 2, clientY: rect.bottom + 10 },
        items,
        'Transmissão de Tela'
      );
    } else {
      if (onOpenScreenShare) {
        onOpenScreenShare();
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
              <img
                src={formatAssetUrl(activeGroup.icon_url)}
                alt=""
                className="w-full h-full rounded-full object-cover"
              />
            ) : (
              <Users className="w-4 h-4" />
            )}
          </div>

          <div className="flex items-baseline gap-2 min-w-0">
            <span className="font-bold text-sm text-gray-100 truncate">{groupName}</span>
            <span className="text-[11px] text-gray-500 hidden sm:inline flex-shrink-0">
              {activeGroup.members?.length || 0} membros
            </span>
          </div>
        </div>

        {/* Right Header Actions */}
        <div className="flex items-center gap-1.5 md:gap-2 flex-shrink-0">
          {/* Voice Channel in Group Toggle */}
          <button
            onClick={handleToggleVoice}
            className={`p-2 md:p-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 text-xs font-semibold ${
              isGroupVoiceActive
                ? 'bg-dnd text-white hover:bg-rose-700 shadow-sm'
                : isGroupVoiceConnecting
                ? 'bg-brand-500/50 text-white animate-pulse'
                : 'text-gray-400 hover:text-online hover:bg-white/5'
            }`}
            title={
              isGroupVoiceActive
                ? 'Desconectar da Voz'
                : isGroupVoiceConnecting
                ? 'Conectando à Voz...'
                : 'Entrar na Chamada de Voz'
            }
          >
            {isGroupVoiceActive ? (
              <>
                <PhoneOff className="w-4 h-4" />
                <span className="hidden sm:inline">Desconectar ({participants.length})</span>
              </>
            ) : (
              <>
                <Phone className="w-4 h-4" />
                <span className="hidden sm:inline">Voz</span>
              </>
            )}
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
              showMemberList
                ? 'text-brand-400 bg-white/10'
                : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
            }`}
            title="Lista de Membros"
          >
            <Users className="w-4 h-4" />
          </button>

          {/* Search Input Box */}
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
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  setAppliedSearchQuery(searchQuery.trim());
                  setIsSearchAutocompleteOpen(false);
                }
              }}
              onFocus={() => setIsSearchAutocompleteOpen(true)}
              placeholder="Buscar..."
              className="bg-transparent text-gray-100 placeholder-gray-500 focus:outline-none w-full min-w-0 text-xs"
            />
            {(searchQuery || appliedSearchQuery) && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setAppliedSearchQuery('');
                  setIsSearchAutocompleteOpen(false);
                }}
                className="p-0.5 text-gray-400 hover:text-white flex-shrink-0 cursor-pointer"
                title="Limpar busca"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <SearchAutocompletePopout
            isOpen={isSearchAutocompleteOpen}
            onClose={() => setIsSearchAutocompleteOpen(false)}
            query={searchQuery}
            onSelectFilter={(newQ) => {
              setSearchQuery(newQ);
              searchInputRef.current?.focus();
            }}
            onSearchSubmit={(q) => {
              setAppliedSearchQuery(q.trim());
            }}
            anchorRef={searchContainerRef}
            members={activeGroup?.members || []}
            contextType="dm_group"
          />
        </div>
      </div>

      {/* Active Group Voice Call Stage */}
      {(isGroupVoiceActive || isGroupVoiceConnecting) && (
        <div className="w-full bg-background-darkest border-b border-white/10 p-3 md:p-4 flex flex-col items-center justify-between transition-all select-none animate-in fade-in shadow-xl">
          <div className="w-full max-w-5xl mx-auto flex flex-col items-center gap-3">
            {/* Dynamic Grid of Participant Cards */}
            <div
              ref={stageRef}
              className="w-full min-h-[200px] max-h-[380px] h-[45vh] bg-background-darker/60 rounded-2xl border border-white/5 p-2 flex items-center justify-center overflow-hidden relative shadow-inner"
            >
              {isGroupVoiceConnecting ? (
                <div className="flex flex-col items-center gap-2 text-gray-400">
                  <div className="w-7 h-7 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                  <span className="text-xs font-medium">Conectando à chamada do grupo...</span>
                </div>
              ) : participants.length === 0 ? (
                <div className="flex flex-col items-center gap-2 text-gray-400">
                  <Volume2 className="w-8 h-8 text-gray-500 animate-pulse" />
                  <span className="text-xs">Aguardando participantes...</span>
                </div>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center gap-2 overflow-hidden">
                  {stageLayout.rows.map((row, rIdx) => (
                    <div
                      key={rIdx}
                      className="flex items-center justify-center gap-2 flex-shrink-0"
                      style={{
                        height: stageLayout.cardHeight > 0 ? `${stageLayout.cardHeight}px` : 'auto',
                      }}
                    >
                      {row.map((p) => (
                        <div
                          key={p.sid || p.identity}
                          className="flex items-center justify-center flex-shrink-0"
                          style={{
                            width: stageLayout.cardWidth > 0 ? `${stageLayout.cardWidth}px` : 'auto',
                            height: stageLayout.cardHeight > 0 ? `${stageLayout.cardHeight}px` : 'auto',
                          }}
                        >
                          <ParticipantCard
                            participant={p}
                            onOpenUserProfile={onOpenUserProfile}
                            onOpenDM={onOpenDM}
                          />
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Voice Controls Bar */}
            <div className="flex items-center justify-center gap-2.5 sm:gap-3.5 pt-1 select-none">
              <button
                onClick={() => {
                  hapticMedium();
                  toggleMute();
                }}
                className={`p-2.5 sm:p-3 rounded-full transition-all cursor-pointer shadow-md active:scale-95 ${
                  isMuted
                    ? 'bg-dnd text-white hover:bg-rose-700'
                    : 'bg-background-light hover:bg-white/15 text-white'
                }`}
                title={isMuted ? 'Desmutar Microfone' : 'Mutar Microfone'}
              >
                {isMuted ? <MicOff className="w-4 h-4 sm:w-5 sm:h-5" /> : <Mic className="w-4 h-4 sm:w-5 sm:h-5" />}
              </button>

              <button
                onClick={() => {
                  hapticMedium();
                  toggleDeafen();
                }}
                className={`p-2.5 sm:p-3 rounded-full transition-all cursor-pointer shadow-md active:scale-95 ${
                  isDeafened
                    ? 'bg-dnd text-white hover:bg-rose-700'
                    : 'bg-background-light hover:bg-white/15 text-white'
                }`}
                title={isDeafened ? 'Desensurdecer' : 'Ensurdecer'}
              >
                <Headphones className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>

              <button
                onClick={() => {
                  hapticMedium();
                  toggleCamera();
                }}
                className={`p-2.5 sm:p-3 rounded-full transition-all cursor-pointer shadow-md active:scale-95 ${
                  isCameraOn
                    ? 'bg-online text-white hover:bg-emerald-600'
                    : 'bg-background-light hover:bg-white/15 text-white'
                }`}
                title={isCameraOn ? 'Desligar Câmera' : 'Ligar Câmera'}
              >
                {isCameraOn ? <Video className="w-4 h-4 sm:w-5 sm:h-5" /> : <VideoOff className="w-4 h-4 sm:w-5 sm:h-5" />}
              </button>

              <button
                onClick={handleScreenShareClick}
                className={`p-2.5 sm:p-3 rounded-full transition-all cursor-pointer shadow-md active:scale-95 ${
                  isScreensharing
                    ? 'bg-online text-white hover:bg-emerald-600'
                    : 'bg-background-light hover:bg-white/15 text-white'
                }`}
                title={isScreensharing ? 'Opções de Compartilhamento' : 'Compartilhar Tela'}
              >
                <Monitor className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>

              <button
                onClick={() => {
                  hapticWarning();
                  leaveVoice();
                }}
                className="bg-dnd hover:bg-rose-700 text-white p-2.5 sm:p-3 rounded-full transition-all shadow-lg cursor-pointer ml-1 active:scale-95"
                title="Desconectar da Voz"
              >
                <PhoneOff className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Area (Messages + SearchResultsPanel OR Member List) */}
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
            {!appliedSearchQuery && hasMoreByGroup[activeGroup.id] === false && (
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
                <h2 className="text-xl font-bold text-white mb-1">
                  Bem-vindo ao {groupName}!
                </h2>
                <p className="text-xs text-gray-400 max-w-sm">
                  Este é o início do grupo. Converse, compartilhe arquivos e divirta-se com seus amigos.
                </p>
              </div>
            )}

            {/* Messages List */}
            {displayedMessages.map((message, index) => {
              const prevMessage = index > 0 ? displayedMessages[index - 1] : null;
              const isFirstUnread = Boolean(firstUnreadId && firstUnreadId === message.id);
              const isCompact = !isFirstUnread && (() => {
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
                <React.Fragment key={message.id}>
                  {isFirstUnread && (
                    <div id="unread-divider" className="flex items-center gap-3 my-4 mx-2 select-none">
                      <div className="flex-1 h-[1px] bg-red-500/80 shadow-[0_0_8px_rgba(239,68,68,0.4)]" />
                      <span className="px-2.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wider text-white bg-red-500 rounded-full shadow-md shadow-red-500/30 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                        Novas Mensagens
                      </span>
                      <div className="flex-1 h-[1px] bg-red-500/80 shadow-[0_0_8px_rgba(239,68,68,0.4)]" />
                    </div>
                  )}
                  <MessageItem
                    message={message}
                    isCompact={isCompact}
                    isEditing={editingMessageId === message.id}
                    onStartEdit={() => setEditingMessageId(message.id)}
                    onStopEdit={() => setEditingMessageId(null)}
                    onOpenUserProfile={onOpenUserProfile}
                    onPreviewImage={onPreviewImage}
                    onReply={(msg) => setReplyingTo(msg as DMGroupMessage)}
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
                </React.Fragment>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Typing Indicator */}
          {typingUserIds.length > 0 && (
            <div className="px-4 py-1 text-xs text-gray-400 flex items-center gap-1.5 select-none">
              <TypingIndicator
                typingUserIds={typingUserIds}
                members={activeGroup.members || []}
              />
            </div>
          )}

          {/* Message Input */}
          <div className="p-3 md:p-4 pt-1 bg-background-dark">
            <MessageInput
              placeholder={`Conversar em ${groupName}...`}
              replyingTo={replyingTo}
              onCancelReply={() => setReplyingTo(null)}
              onSendMessage={async (content, replyToId) => {
                if (activeGroup) {
                  clearUnreadDivider(activeGroup.id);
                }
                scrollToBottom(true);
                await sendMessage(content, undefined, replyToId);
                setReplyingTo(null);
                setTimeout(() => scrollToBottom(true), 60);
                setTimeout(() => scrollToBottom(true), 200);
              }}
              onTyping={() => {
                if (activeGroup) {
                  socket.send('TYPING_START', {
                    channel_id: activeGroup.id,
                  });
                }
              }}
              onEditLastMessage={handleEditLastMessage}
              droppedFile={droppedFile}
              onClearDroppedFile={() => setDroppedFile(null)}
              contextType="dm_group"
              customMentions={groupMemberMentions}
            />
          </div>
        </div>

        {/* Right Search Results Panel */}
        {appliedSearchQuery && (
          <SearchResultsPanel
            isOpen={Boolean(appliedSearchQuery)}
            onClose={() => {
              setAppliedSearchQuery('');
              setSearchQuery('');
            }}
            rawQuery={appliedSearchQuery}
            parsedQuery={parsedSearch}
            messages={searchResults}
            contextName={groupName}
            contextCategory="Grupo de DM"
            contextType="dm_group"
            onJumpToMessage={handleJumpToMessage}
          />
        )}

        {/* Group Member List Sidebar */}
        {showMemberList && !appliedSearchQuery && (
          <div className="w-60 bg-background-darker/60 border-l border-white/5 flex flex-col overflow-hidden select-none">
            <div className="h-10 px-4 flex items-center justify-between border-b border-white/5">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-400">
                Membros — {activeGroup.members?.length || 0}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {(activeGroup.members || []).map((member) => (
                <div
                  key={member.id}
                  onContextMenu={(e) =>
                    handleUserContextMenu(e, member, {
                      groupId: activeGroup.id,
                      contextType: 'dm_group',
                    })
                  }
                  onClick={(e) => {
                    if (onOpenUserProfile) {
                      const rect = e.currentTarget.getBoundingClientRect();
                      onOpenUserProfile(member, { x: rect.right + 10, y: rect.top });
                    }
                  }}
                  className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-white/5 text-gray-300 hover:text-white cursor-pointer group transition-colors"
                >
                  <div className="relative flex-shrink-0">
                    <div className="w-8 h-8 rounded-full bg-brand-500 flex items-center justify-center font-semibold text-xs text-white">
                      {member.avatar_url ? (
                        <img
                          src={formatAssetUrl(member.avatar_url)}
                          alt=""
                          className="w-full h-full rounded-full object-cover"
                        />
                      ) : (
                        <span>
                          {member.display_name?.[0]?.toUpperCase() ||
                            member.username?.[0]?.toUpperCase() ||
                            'U'}
                        </span>
                      )}
                    </div>
                    {/* Online status indicator */}
                    <div
                      className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-background-darker ${
                        member.status === 'online'
                          ? 'bg-online'
                          : member.status === 'idle'
                          ? 'bg-idle'
                          : member.status === 'dnd'
                          ? 'bg-dnd'
                          : 'bg-offline'
                      }`}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <span className="text-xs font-medium truncate">
                        {member.display_name || member.username}
                      </span>
                      {activeGroup.owner_id === member.id && (
                        <span className="text-[10px] text-amber-400 font-bold" title="Dono do Grupo">
                          👑
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-gray-500 truncate block">
                      @{member.username}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Leave Group Button in Sidebar Footer */}
            <div className="p-2 border-t border-white/5">
              <button
                onClick={() => {
                  if (activeGroup.owner_id === user?.id && (activeGroup.members?.length || 0) > 1) {
                    alert(
                      'Você é o dono deste grupo. Transfira a posse do grupo para outro membro antes de sair (clique com botão direito em um membro).'
                    );
                    return;
                  }
                  if (confirm('Tem certeza que deseja sair deste grupo?')) {
                    leaveGroup(activeGroup.id);
                  }
                }}
                className="w-full flex items-center justify-center gap-2 text-xs font-semibold text-dnd hover:text-white bg-dnd/10 hover:bg-dnd p-2 rounded-lg transition-colors cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sair do Grupo</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Context Menus */}
      <ContextMenu menu={menu} onClose={closeContextMenu} />
      <ContextMenu menu={screenShareMenu} onClose={closeScreenShareMenu} />
    </div>
  );
};
