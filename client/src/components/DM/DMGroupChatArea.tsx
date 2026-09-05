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
  Star,
} from 'lucide-react';
import { useDMGroupStore } from '../../stores/dmGroupStore';
import { useAuthStore } from '../../stores/authStore';
import { useFavoriteGifStore } from '../../stores/favoriteGifStore';
import { api, formatAssetUrl } from '../../lib/api';
import { livekit } from '../../lib/livekit';
import { LimitAlertModal } from '../Modals/LimitAlertModal';
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
  const { isFavorited, toggleFavorite } = useFavoriteGifStore();

  const [content, setContent] = useState('');
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
      setTimeout(() => scrollToBottom(true), 600);
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
    if (isUploading) return;
    let finalContent = content.trim();

    if (finalContent.length > MAX_CHARS) {
      setLimitAlert({
        title: 'Limite de Caracteres Excedido',
        message: 'O limite de tamanho de mensagem é 2.000 caracteres',
        detail: `${finalContent.length.toLocaleString('pt-BR')} / 2.000 caracteres`,
      });
      return;
    }

    if (!finalContent && !selectedFile) return;

    const fileToUpload = selectedFile;
    setContent('');
    setSelectedFile(null);
    setSelectedImagePreview(null);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    try {
      if (fileToUpload) {
        setIsUploading(true);
        const uploaded = await api.upload.attachment(fileToUpload);
        finalContent = finalContent ? `${finalContent}\n${uploaded.url}` : uploaded.url;
      }

      await sendMessage(finalContent);
    } catch (err: any) {
      console.error('Failed to send group message/file:', err);
      setLimitAlert({
        title: 'Erro ao Enviar Mensagem',
        message: err.message || 'Não foi possível enviar a mensagem/imagem.',
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const processFile = (file: File) => {
    if (file.size > MAX_FILE_BYTES) {
      setLimitAlert({
        title: 'Arquivo Muito Grande',
        message: 'O limite de imagens/vídeos/arquivos é de 20 MB',
        detail: `Tamanho do arquivo: ${(file.size / (1024 * 1024)).toFixed(2)} MB (Máximo permitido: 20 MB)`,
      });
      return;
    }

    setSelectedFile(file);

    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setSelectedImagePreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      setSelectedImagePreview(null);
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === 'file') {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          processFile(file);
          break;
        }
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processFile(file);
    e.target.value = '';
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
      alert(err.message || 'Falha ao conectar no canal de voz');
    }
  };

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
            onClick={() => {
              const next = !showMemberList;
              setShowMemberList(next);
              try {
                localStorage.setItem('zerovc_server_members_open', String(next));
              } catch {}
            }}
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
                const prevMsg = messages[index - 1];
                const isCompact = prevMsg && prevMsg.author_id === msg.author_id;

                const lines = msg.content.split('\n');
                const textLines: string[] = [];
                const imageUrls: string[] = [];

                for (const line of lines) {
                  const trimmed = line.trim();
                  if (
                    trimmed.startsWith('data:image/') ||
                    trimmed.startsWith('/assets/user/') ||
                    trimmed.startsWith('/assets/guild/') ||
                    (trimmed.startsWith('http') &&
                      (trimmed.endsWith('.png') ||
                        trimmed.endsWith('.jpg') ||
                        trimmed.endsWith('.jpeg') ||
                        trimmed.endsWith('.gif') ||
                        trimmed.endsWith('.webp') ||
                        trimmed.includes('/assets/user/') ||
                        trimmed.includes('/assets/guild/')))
                  ) {
                    imageUrls.push(trimmed);
                  } else {
                    textLines.push(line);
                  }
                }

                return (
                  <div
                    key={msg.id}
                    id={`msg-${msg.id}`}
                    className={`relative group flex gap-3 px-3 rounded-xl hover:bg-background-darkest/40 transition-all duration-300 ${
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
                          <img src={formatAssetUrl(msg.author.avatar_url)} alt="" className="w-full h-full rounded-full object-cover" />
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
                          <span
                            onClick={(e) => {
                              e.stopPropagation();
                              msg.author && onOpenUserProfile?.(msg.author, { x: e.clientX, y: e.clientY });
                            }}
                            className="text-sm font-semibold text-white hover:underline cursor-pointer"
                          >
                            {msg.author?.display_name || msg.author?.username}
                          </span>
                          <span className="text-[10px] text-gray-500">
                            {format(new Date(msg.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                          </span>
                        </div>
                      )}

                      {textLines.length > 0 && (
                        <div className="text-sm text-gray-200 select-text">
                          <FormattedMessage content={textLines.join('\n')} />
                        </div>
                      )}

                      {imageUrls.map((url, idx) => {
                        const isGif =
                          url.includes('.gif') ||
                          url.includes('.webp') ||
                          url.includes('klipy') ||
                          url.includes('giphy') ||
                          url.includes('tenor');
                        const favorited = isFavorited(url);

                        return (
                          <div
                            key={idx}
                            className="mt-1.5 w-fit max-w-sm sm:max-w-md md:max-w-lg overflow-hidden rounded-2xl border border-white/10 shadow-md relative group/media"
                          >
                            <img
                              src={formatAssetUrl(url)}
                              alt="Anexo"
                              onLoad={handleMediaLoad}
                              onClick={() => onPreviewImage?.(formatAssetUrl(url))}
                              className="max-h-[350px] max-w-full w-auto h-auto object-contain cursor-pointer hover:opacity-95 transition-opacity block"
                            />

                            {isGif && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleFavorite(url);
                                }}
                                className={`absolute top-2 right-2 p-1.5 rounded-xl backdrop-blur-md transition-all shadow-md cursor-pointer ${
                                  favorited
                                    ? 'bg-amber-500 text-white opacity-100'
                                    : 'bg-black/60 text-white/70 hover:text-white hover:bg-black/90 opacity-0 group-hover/media:opacity-100'
                                }`}
                                title={favorited ? 'Remover dos favoritos' : 'Favoritar GIF'}
                              >
                                <Star className={`w-4 h-4 ${favorited ? 'fill-current' : ''}`} />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Selected Image / File Preview */}
          {selectedFile && (
            <div className="mx-4 mb-2 p-2 bg-background-darkest rounded-2xl border border-white/10 flex items-center justify-between w-max max-w-xs animate-in fade-in">
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

          <input
            ref={fileInputRef}
            type="file"
            accept="*/*"
            onChange={handleFileChange}
            className="hidden"
          />

          {/* Input Bar */}
          <div className="p-3 md:p-4 bg-background-dark">
            <div className="bg-background-darkest rounded-2xl p-2 border border-white/10 flex items-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors cursor-pointer disabled:opacity-50"
                title="Anexar arquivo ou imagem (até 20 MB)"
              >
                <PlusCircle className="w-5 h-5" />
              </button>

              <textarea
                ref={textareaRef}
                rows={1}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                disabled={isUploading}
                placeholder={`Conversar em ${groupName}...`}
                className="flex-1 bg-transparent text-white px-2 py-1 focus:outline-none resize-none text-sm no-scrollbar max-h-32"
              />

              <button
                type="button"
                onClick={handleSend}
                disabled={(!content.trim() && !selectedFile) || isUploading}
                className="p-2 rounded-xl bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-white transition-all cursor-pointer flex-shrink-0"
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
