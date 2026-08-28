import React, { useState, useRef, useEffect } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Users,
  SendHorizontal,
  Smile,
  X,
  Menu,
  Reply,
  CornerDownRight,
  Search,
  Phone,
  UserPlus,
  LogOut,
  PhoneOff,
} from 'lucide-react';
import { useDMGroupStore } from '../../stores/dmGroupStore';
import { useAuthStore } from '../../stores/authStore';
import { useVoiceStore } from '../../stores/voiceStore';
import { api } from '../../lib/api';
import { livekit } from '../../lib/livekit';
import { LimitAlertModal } from '../Modals/LimitAlertModal';
import { User, DMGroupMessage } from '../../types';

interface DMGroupChatAreaProps {
  onOpenMobileDrawer?: () => void;
  onOpenUserProfile?: (user: User, position?: { x: number; y: number }) => void;
  onPreviewImage?: (url: string) => void;
}

const COMMON_EMOJIS = ['😀', '😂', '🔥', '👍', '❤️', '🎉', '😎', '🚀', '👀', '✨', '💀', '💯'];
const MAX_CHARS = 2000;
const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB

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
    removeMember,
    isLoadingMessages,
    isLoadingMoreMessages,
    hasMoreByGroup,
    loadMoreMessages,
  } = useDMGroupStore();

  const [content, setContent] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [replyingTo, setReplyingTo] = useState<DMGroupMessage | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [showMemberList, setShowMemberList] = useState(false);
  const [isInGroupVoice, setIsInGroupVoice] = useState(false);
  const [limitAlert, setLimitAlert] = useState<{ title: string; message: string; detail?: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const prevScrollHeightRef = useRef<number | null>(null);

  const scrollToBottom = (smooth = true) => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
    }
  };

  useEffect(() => {
    if (prevScrollHeightRef.current !== null && scrollContainerRef.current) {
      const heightDiff = scrollContainerRef.current.scrollHeight - prevScrollHeightRef.current;
      if (heightDiff > 0) {
        scrollContainerRef.current.scrollTop = heightDiff;
      }
      prevScrollHeightRef.current = null;
      return;
    }

    scrollToBottom();
  }, [messages]);

  const handleScroll = () => {
    const container = scrollContainerRef.current;
    if (!container || !activeGroup) return;

    if (container.scrollTop < 60 && !isLoadingMoreMessages && hasMoreByGroup[activeGroup.id] !== false) {
      prevScrollHeightRef.current = container.scrollHeight;
      loadMoreMessages(activeGroup.id);
    }
  };

  useEffect(() => {
    if (activeGroup?.id && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [activeGroup?.id]);

  if (!activeGroup) {
    return (
      <div className="flex-1 bg-background-dark flex flex-col items-center justify-center text-gray-500 font-medium p-4 select-none">
        <Users className="w-12 h-12 text-gray-600 mb-3" />
        <span className="text-sm">Selecione um grupo para conversar</span>
      </div>
    );
  }

  const groupName =
    activeGroup.name ||
    activeGroup.members
      ?.filter((m) => m.id !== user?.id)
      ?.map((m) => m.display_name || m.username)
      ?.join(', ') ||
    'Grupo';

  const handleSend = async () => {
    let finalContent = content.trim();

    if (finalContent.length > MAX_CHARS) {
      setLimitAlert({
        title: 'Limite de Caracteres Excedido',
        message: 'O limite de tamanho de mensagem é 2.000 caracteres',
        detail: `${finalContent.length.toLocaleString('pt-BR')} / 2.000 caracteres`,
      });
      return;
    }

    if (selectedImage) {
      finalContent = finalContent ? `${finalContent}\n${selectedImage}` : selectedImage;
    }

    if (!finalContent) return;

    const replyId = replyingTo?.id;
    setContent('');
    setSelectedImage(null);
    setShowEmojiPicker(false);
    setReplyingTo(null);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    await sendMessage(finalContent, undefined, replyId);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    } else if (e.key === 'Escape' && replyingTo) {
      e.preventDefault();
      setReplyingTo(null);
    }
  };

  const handleJoinVoice = async () => {
    if (isInGroupVoice) {
      await livekit.disconnect();
      setIsInGroupVoice(false);
      return;
    }

    try {
      const res = await api.dmGroups.getVoiceToken(activeGroup.id);
      await livekit.connect(res.livekit_url, res.token, {});
      setIsInGroupVoice(true);
    } catch (err: any) {
      alert(err.message || 'Falha ao conectar no chat de voz do grupo');
    }
  };

  return (
    <div className="flex-1 bg-background-dark flex flex-col h-full overflow-hidden relative select-none">
      {/* Group Header */}
      <div className="h-12 border-b border-black/20 px-3 md:px-4 flex items-center justify-between shadow-sm z-10">
        <div className="flex items-center gap-2.5 truncate">
          {onOpenMobileDrawer && (
            <button
              onClick={onOpenMobileDrawer}
              className="md:hidden text-gray-400 hover:text-white p-1 -ml-1 rounded hover:bg-white/10 transition-colors cursor-pointer"
            >
              <Menu className="w-5 h-5" />
            </button>
          )}

          <div className="w-8 h-8 rounded-full bg-brand-600 flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
            <Users className="w-4 h-4" />
          </div>

          <div className="flex flex-col truncate">
            <span className="font-bold text-gray-100 text-sm truncate">{groupName}</span>
            <span className="text-[10px] text-gray-400">
              {activeGroup.members?.length || 0} membros
            </span>
          </div>
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center gap-2">
          {/* Voice Call Button */}
          <button
            onClick={handleJoinVoice}
            className={`p-1.5 rounded-lg transition-colors cursor-pointer flex items-center gap-1 text-xs font-semibold ${
              isInGroupVoice
                ? 'bg-dnd text-white hover:bg-rose-700'
                : 'text-gray-300 hover:text-white hover:bg-white/10'
            }`}
            title={isInGroupVoice ? 'Sair da Chamada' : 'Entrar na Chamada em Grupo'}
          >
            {isInGroupVoice ? <PhoneOff className="w-4 h-4" /> : <Phone className="w-4 h-4 text-online" />}
            <span className="hidden sm:inline">{isInGroupVoice ? 'Desconectar' : 'Ligar'}</span>
          </button>

          {/* Members Toggle */}
          <button
            onClick={() => setShowMemberList(!showMemberList)}
            className={`p-1.5 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-white/5 transition-colors cursor-pointer ${
              showMemberList ? 'text-white bg-white/10' : ''
            }`}
            title="Membros do Grupo"
          >
            <Users className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Messages Feed */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div
            ref={scrollContainerRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto p-4 space-y-0.5 no-scrollbar"
          >
            {/* Loading older messages indicator */}
            {isLoadingMoreMessages && (
              <div className="flex justify-center items-center gap-2 py-3 text-xs text-gray-400">
                <div className="w-3.5 h-3.5 border-2 border-brand-400 border-t-transparent rounded-full animate-spin" />
                <span>Carregando mensagens anteriores...</span>
              </div>
            )}

            {isLoadingMessages ? (
              <div className="flex justify-center py-6 text-xs text-gray-500">Carregando mensagens...</div>
            ) : (
              messages.map((msg, index) => {
              const isMe = msg.author_id === user?.id;
              const prevMsg = messages[index - 1];
              const isCompact = prevMsg && prevMsg.author_id === msg.author_id;

              return (
                <div
                  key={msg.id}
                  className={`relative group flex gap-3 px-3 rounded-xl hover:bg-background-darkest/40 transition-colors ${
                    isCompact ? 'py-1 mt-1' : 'py-2 mt-3'
                  }`}
                >
                  {!isCompact ? (
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        msg.author && onOpenUserProfile?.(msg.author, { x: e.clientX, y: e.clientY });
                      }}
                      className="w-8 h-8 rounded-full bg-brand-500 flex items-center justify-center text-white font-bold text-xs flex-shrink-0 mt-0.5 cursor-pointer hover:opacity-85"
                    >
                      {msg.author?.avatar_url ? (
                        <img src={msg.author.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
                      ) : (
                        <span>{msg.author?.display_name?.[0]?.toUpperCase() || msg.author?.username?.[0]?.toUpperCase() || 'U'}</span>
                      )}
                    </div>
                  ) : (
                    <div className="w-8 flex-shrink-0" />
                  )}

                  <div className="flex-1 min-w-0">
                    {!isCompact && (
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-semibold text-white">
                          {msg.author?.display_name || msg.author?.username}
                        </span>
                        <span className="text-[10px] text-gray-500">
                          {format(new Date(msg.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                        </span>
                      </div>
                    )}

                    <div className="text-sm text-gray-200 break-words whitespace-pre-wrap">{msg.content}</div>
                  </div>
                </div>
              );
            })
          )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Bar */}
          <div className="p-3 md:p-4 bg-background-dark">
            <div className="bg-background-darkest rounded-2xl p-2 border border-white/10 flex items-center gap-2">
              <textarea
                ref={textareaRef}
                rows={1}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={`Conversar em ${groupName}...`}
                className="flex-1 bg-transparent text-white px-2 py-1 focus:outline-none resize-none text-sm no-scrollbar max-h-32"
              />

              <button
                onClick={handleSend}
                disabled={!content.trim()}
                className="p-2 rounded-xl bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-white transition-all cursor-pointer"
              >
                <SendHorizontal className="w-4 h-4" />
              </button>
            </div>
          </div>
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
                      <img src={m.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
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

      {limitAlert && (
        <LimitAlertModal
          isOpen={true}
          onClose={() => setLimitAlert(null)}
          title={limitAlert.title}
          message={limitAlert.message}
          detail={limitAlert.detail}
        />
      )}
    </div>
  );
};
