import React, { useState, useRef, useEffect } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Users,
  SendHorizontal,
  PlusCircle,
  X,
  Menu,
  Phone,
  PhoneOff,
  LogOut,
  Loader2,
  UploadCloud,
  FileText,
  Smile,
  AlertCircle,
  RotateCcw,
  Copy,
} from 'lucide-react';
import { useDMGroupStore } from '../../stores/dmGroupStore';
import { useAuthStore } from '../../stores/authStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { api, formatAssetUrl } from '../../lib/api';
import { livekit } from '../../lib/livekit';
import { LimitAlertModal } from '../Modals/LimitAlertModal';
import { EmojiAndGifPicker } from '../Chat/EmojiAndGifPicker';
import { FormattedMessage } from '../Chat/FormattedMessage';
import { User, DMGroupMessage } from '../../types';

interface DMGroupChatAreaProps {
  onOpenMobileDrawer?: () => void;
  onOpenUserProfile?: (user: User, position?: { x: number; y: number }) => void;
  onPreviewImage?: (url: string) => void;
}

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
  const chatDensity = useSettingsStore((s) => s.chatDensity);
  const isDensityCompact = chatDensity === 'compact';

  const [content, setContent] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedImagePreview, setSelectedImagePreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [showMemberList, setShowMemberList] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('zerovc_server_members_open');
      if (saved !== null) {
        return saved === 'true';
      }
    } catch {}
    return typeof window !== 'undefined' ? window.innerWidth >= 768 : true;
  });
  const [isInGroupVoice, setIsInGroupVoice] = useState(false);
  const [limitAlert, setLimitAlert] = useState<{ title: string; message: string; detail?: string } | null>(null);

  const dragCounterRef = useRef<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const prevScrollHeightRef = useRef<number | null>(null);

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
      processFile(files[0]);
    }
  };

  const isInitialLoadRef = useRef<boolean>(true);
  const prevGroupIdRef = useRef<string | null>(null);

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

  // Reset initial load flag on group change
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
    if (!container || !activeGroup) return;

    if (container.scrollTop < 60 && !isLoadingMoreMessages && hasMoreByGroup[activeGroup.id] !== false) {
      prevScrollHeightRef.current = container.scrollHeight;
      loadMoreMessages(activeGroup.id);
    }
  };

  const processFile = (file: File) => {
    if (file.size > MAX_FILE_BYTES) {
      setLimitAlert({
        title: 'Arquivo muito grande',
        message: 'O limite de arquivos é de 20 MB.',
        detail: `Tamanho: ${(file.size / (1024 * 1024)).toFixed(1)} MB.`,
      });
      return;
    }

    setSelectedFile(file);
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = () => setSelectedImagePreview(reader.result as string);
      reader.readAsDataURL(file);
    } else {
      setSelectedImagePreview(null);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
    e.target.value = '';
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (items) {
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile();
          if (file) {
            processFile(file);
            e.preventDefault();
            return;
          }
        }
      }
    }
  };

  const handleSelectEmoji = (emoji: string) => {
    setContent((prev) => prev + emoji);
    setShowEmojiPicker(false);
    textareaRef.current?.focus();
  };

  const handleSelectGif = async (gifUrl: string) => {
    setShowEmojiPicker(false);
    try {
      await sendMessage(gifUrl);
    } catch (err: any) {
      console.error('Failed to send GIF:', err);
    }
  };

  const handleSend = async () => {
    if (!content.trim() && !selectedFile) return;

    if (content.length > MAX_CHARS) {
      setLimitAlert({
        title: 'Mensagem muito longa',
        message: `O limite de caracteres por mensagem é de ${MAX_CHARS.toLocaleString('pt-BR')}.`,
        detail: `Sua mensagem atual possui ${content.length.toLocaleString('pt-BR')} caracteres.`,
      });
      return;
    }

    const textToSend = content.trim();

    setContent('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    if (selectedFile) {
      setIsUploading(true);
      try {
        const uploadRes = await api.upload.attachment(selectedFile);
        setSelectedFile(null);
        setSelectedImagePreview(null);
        setIsUploading(false);

        const attachmentPayload = [
          {
            url: uploadRes.url,
            filename: uploadRes.filename,
            size: uploadRes.size,
          },
        ];

        await sendMessage(textToSend, attachmentPayload);
      } catch (err: any) {
        setIsUploading(false);
        alert(err.message || 'Falha ao enviar arquivo');
      }
    } else {
      await sendMessage(textToSend);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`;
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

  const groupName =
    activeGroup.name ||
    activeGroup.members?.map((m) => m.display_name || m.username).join(', ') ||
    'Grupo';

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="flex-1 bg-background-dark flex flex-col h-full overflow-hidden relative select-none"
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

      {/* Group Header */}
      <div className="h-12 border-b border-black/20 px-3 md:px-4 flex items-center justify-between shadow-sm z-20 flex-shrink-0 bg-background-dark/95 backdrop-blur-sm sticky top-0">
        <div className="flex items-center gap-2.5 truncate">
          {onOpenMobileDrawer && (
            <button
              onClick={onOpenMobileDrawer}
              className="md:hidden text-gray-400 hover:text-white p-1 -ml-1 rounded hover:bg-white/10 transition-colors cursor-pointer"
              title="Menu Lateral"
            >
              <Menu className="w-5 h-5" />
            </button>
          )}

          <div className="w-7 h-7 rounded-full bg-brand-600 flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
            <Users className="w-4 h-4" />
          </div>

          <div className="flex items-baseline gap-2 truncate">
            <span className="font-bold text-gray-100 text-sm md:text-base truncate">{groupName}</span>
            <span className="text-xs text-gray-400 truncate hidden sm:inline">
              {activeGroup.members?.length || 0} membros
            </span>
          </div>
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center gap-1 md:gap-2">
          <button
            onClick={handleJoinVoice}
            className={`p-1.5 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-semibold ${
              isInGroupVoice
                ? 'bg-dnd text-white hover:bg-rose-700'
                : 'text-gray-400 hover:text-online hover:bg-white/5'
            }`}
            title={isInGroupVoice ? 'Sair da Chamada' : 'Entrar na Chamada em Grupo'}
          >
            {isInGroupVoice ? <PhoneOff className="w-4 h-4" /> : <Phone className="w-4 h-4" />}
            <span className="hidden sm:inline">{isInGroupVoice ? 'Desconectar' : 'Ligar'}</span>
          </button>

          <button
            onClick={() => {
              const next = !showMemberList;
              setShowMemberList(next);
              try {
                localStorage.setItem('zerovc_server_members_open', String(next));
              } catch {}
            }}
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
              showMemberList ? 'text-brand-400 bg-white/10' : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
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
            className="flex-1 overflow-y-auto px-2 md:px-4 py-2 no-scrollbar"
          >
            {isLoadingMoreMessages && (
              <div className="flex justify-center items-center gap-2 py-3 text-xs text-gray-400">
                <div className="w-3.5 h-3.5 border-2 border-brand-400 border-t-transparent rounded-full animate-spin" />
                <span>Carregando mensagens anteriores...</span>
              </div>
            )}

            {/* Group Welcome Hero */}
            {hasMoreByGroup[activeGroup.id] === false && (
              <div className="px-2 md:px-4 py-6 md:py-8 mb-4 border-b border-white/5 select-none">
                <div className="w-16 h-16 md:w-20 md:h-20 rounded-2xl bg-brand-600 flex items-center justify-center text-white shadow-xl mb-3">
                  <Users className="w-8 h-8 md:w-10 md:h-10" />
                </div>
                <h2 className="text-xl md:text-2xl font-bold text-white mb-1">{groupName}</h2>
                <p className="text-xs md:text-sm text-gray-400">
                  Este é o início do grupo <strong className="text-gray-200">{groupName}</strong>.
                </p>
              </div>
            )}

            {isLoadingMessages ? (
              <div className="flex justify-center items-center gap-2 py-10 text-sm text-gray-500">
                <div className="w-4 h-4 border-2 border-brand-400 border-t-transparent rounded-full animate-spin" />
                <span>Carregando mensagens...</span>
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-500 gap-2 select-none">
                <span>Nenhuma mensagem ainda no grupo. Diga oi!</span>
              </div>
            ) : (
              messages.map((msg, index) => {
                const prevMsg = messages[index - 1];
                const isCompact = (() => {
                  if (!prevMsg) return false;
                  if (prevMsg.author_id !== msg.author_id) return false;
                  const prevTime = new Date(prevMsg.created_at).getTime();
                  const currTime = new Date(msg.created_at).getTime();
                  if (isNaN(prevTime) || isNaN(currTime)) return false;
                  const diffMs = currTime - prevTime;
                  return diffMs >= 0 && diffMs <= 5 * 60 * 1000;
                })();

                const formattedTime = (() => {
                  try {
                    return format(new Date(msg.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR });
                  } catch {
                    return '';
                  }
                })();

                const shortTime = (() => {
                  try {
                    return format(new Date(msg.created_at), 'HH:mm', { locale: ptBR });
                  } catch {
                    return '';
                  }
                })();

                const isSending = msg.status === 'sending';
                const isFailed = msg.status === 'failed';

                return (
                  <div
                    key={msg.id}
                    id={`msg-${msg.id}`}
                    className={`relative flex flex-col px-3 md:px-4 group rounded transition-all duration-200 ${
                      isFailed
                        ? 'bg-red-500/10 hover:bg-red-500/15 border-l-2 border-red-500 text-red-200'
                        : isSending
                        ? 'opacity-65 select-none'
                        : 'hover:bg-background-dark/40'
                    } ${isCompact ? 'py-[1.5px] mt-0' : isDensityCompact ? 'pt-1 pb-[1px] mt-1' : 'pt-2.5 pb-[1.5px] mt-3.5'}`}
                  >
                    <div className="flex gap-3 md:gap-4 relative">
                      {!isSending && !isFailed && (
                        <div className="absolute -top-3 right-4 hidden group-hover:flex items-center gap-1 bg-background-darkest border border-white/10 rounded-lg p-1 shadow-lg z-10 animate-in fade-in zoom-in-95">
                          <button
                            onClick={() => navigator.clipboard.writeText(msg.content)}
                            className="p-1 rounded text-gray-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                            title="Copiar Texto"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}

                      {isCompact ? (
                        <div className="w-9 md:w-10 flex-shrink-0 text-right select-none text-[10px] text-gray-500 font-mono opacity-0 group-hover:opacity-100 transition-opacity leading-[1.375rem] pr-1">
                          {shortTime}
                        </div>
                      ) : (
                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                            msg.author && onOpenUserProfile?.(msg.author, { x: e.clientX, y: e.clientY });
                          }}
                          className="w-9 h-9 md:w-10 md:h-10 rounded-full bg-brand-500 flex items-center justify-center font-bold text-white flex-shrink-0 mt-0.5 shadow-sm text-sm overflow-hidden cursor-pointer hover:opacity-85 transition-opacity"
                          title="Ver perfil"
                        >
                          {msg.author?.avatar_url ? (
                            <img
                              src={formatAssetUrl(msg.author.avatar_url)}
                              alt={msg.author.username}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <span>
                              {msg.author?.display_name?.[0]?.toUpperCase() ||
                                msg.author?.username?.[0]?.toUpperCase() ||
                                'U'}
                            </span>
                          )}
                        </div>
                      )}

                      <div className="flex-1 min-w-0">
                        {!isCompact && (
                          <div className="flex items-baseline gap-2 mb-0.5 select-none">
                            <span
                              onClick={(e) => {
                                e.stopPropagation();
                                msg.author && onOpenUserProfile?.(msg.author, { x: e.clientX, y: e.clientY });
                              }}
                              className="font-semibold text-sm text-gray-100 hover:underline cursor-pointer hover:text-brand-400 transition-colors"
                              title="Ver perfil"
                            >
                              {msg.author?.display_name || msg.author?.username || 'Usuário'}
                            </span>
                            <span className="text-[10px] md:text-[11px] text-gray-400 font-normal">{formattedTime}</span>
                          </div>
                        )}

                        <div className={`text-[0.9375rem] break-words leading-[1.375rem] font-normal select-text ${
                          isFailed ? 'text-red-300' : isSending ? 'text-gray-400' : 'text-gray-200'
                        }`}>
                          <FormattedMessage
                            content={msg.content}
                            onPreviewImage={onPreviewImage}
                            onImageLoad={handleMediaLoad}
                            onOpenUserProfile={onOpenUserProfile}
                          />
                        </div>

                        {isFailed && (
                          <div className="mt-1.5 flex items-center gap-2 text-xs text-red-400 bg-red-500/10 px-2 py-1 rounded-lg border border-red-500/20">
                            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                            <span className="flex-1 truncate">{msg.error || 'Falha ao enviar mensagem.'}</span>
                            <button
                              type="button"
                              onClick={async () => {
                                useDMGroupStore.setState((s) => ({
                                  messages: s.messages.filter((m) => m.id !== msg.id),
                                  messagesByGroup: {
                                    ...s.messagesByGroup,
                                    [activeGroup.id]: (s.messagesByGroup[activeGroup.id] || []).filter((m) => m.id !== msg.id),
                                  },
                                }));
                                await sendMessage(msg.content, msg.attachments, msg.reply_to_id);
                              }}
                              className="flex items-center gap-1 text-red-300 hover:text-white underline font-semibold cursor-pointer"
                            >
                              <RotateCcw className="w-3 h-3" />
                              <span>Tentar novamente</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Selected Image / File Preview */}
          {selectedFile && (
            <div className="mx-4 mb-2 p-2 bg-background-darkest rounded-2xl border border-white/10 flex items-center justify-between w-max max-w-xs animate-in fade-in select-none">
              <div className="flex items-center gap-2.5">
                {selectedImagePreview ? (
                  <img src={selectedImagePreview} alt="Preview" className="w-12 h-12 object-cover rounded-xl border border-white/10 flex-shrink-0" />
                ) : (
                  <div className="w-10 h-10 rounded-xl bg-background-light flex items-center justify-center text-brand-400 border border-white/10 flex-shrink-0">
                    <FileText className="w-5 h-5" />
                  </div>
                )}
                <div className="min-w-0">
                  <span className="text-xs text-gray-200 font-medium block truncate max-w-[140px]">
                    {selectedFile.name}
                  </span>
                  <span className="text-[10px] text-gray-400 font-mono">
                    {(selectedFile.size / 1024).toFixed(0)} KB
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedFile(null);
                  setSelectedImagePreview(null);
                }}
                className="p-1 hover:bg-white/10 rounded-full text-gray-400 hover:text-white ml-3 cursor-pointer flex-shrink-0"
                title="Remover anexo"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          <EmojiAndGifPicker
            isOpen={showEmojiPicker}
            onClose={() => setShowEmojiPicker(false)}
            onSelectEmoji={handleSelectEmoji}
            onSelectGif={handleSelectGif}
            positionClass="bottom-20 right-4"
          />

          <input
            ref={fileInputRef}
            type="file"
            accept="*/*"
            onChange={handleFileChange}
            className="hidden"
          />

          {/* Input Bar */}
          <div className="p-3 md:p-4 pt-0 select-none">
            <div className="bg-background-light/40 hover:bg-background-light/60 focus-within:bg-background-light/60 focus-within:ring-1 focus-within:ring-brand-500/50 rounded-xl px-3 py-2.5 flex items-center gap-2 transition-all border border-white/5">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="text-gray-400 hover:text-white p-1 rounded-full hover:bg-white/5 transition-colors flex-shrink-0 cursor-pointer disabled:opacity-50"
                title="Anexar arquivo ou imagem (até 20 MB)"
              >
                <PlusCircle className="w-5 h-5" />
              </button>

              <textarea
                ref={textareaRef}
                value={content}
                onChange={handleInput}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                placeholder={`Conversar em ${groupName}...`}
                rows={1}
                disabled={isUploading}
                className="flex-1 bg-transparent text-gray-100 placeholder-gray-500 text-sm focus:outline-none resize-none py-0.5 max-h-36 leading-relaxed font-normal no-scrollbar"
              />

              <button
                type="button"
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className={`p-1 rounded-full hover:bg-white/5 transition-colors cursor-pointer ${
                  showEmojiPicker ? 'text-brand-400' : 'text-gray-400 hover:text-white'
                }`}
                title="Inserir Emoji ou GIF"
              >
                <Smile className="w-5 h-5" />
              </button>

              <button
                type="button"
                onClick={handleSend}
                disabled={(!content.trim() && !selectedFile) || isUploading}
                className="bg-brand-500 hover:bg-brand-600 disabled:opacity-40 disabled:hover:bg-brand-500 text-white p-1.5 rounded-lg transition-all shadow-md shadow-brand-500/20 active:scale-95 flex-shrink-0 cursor-pointer"
                title="Enviar Mensagem"
              >
                {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <SendHorizontal className="w-4 h-4" />}
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
