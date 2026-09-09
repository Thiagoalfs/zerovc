import React, { useState, useRef, useEffect, useMemo } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  MessageSquare,
  PlusCircle,
  SendHorizontal,
  Smile,
  X,
  Menu,
  Reply,
  CornerDownRight,
  Search,
  Phone,
  Loader2,
  UploadCloud,
  FileText,
  Pin,
  AlertCircle,
  RotateCcw,
  Copy,
  Pencil,
  Trash2,
  User as UserIcon,
  Check,
} from 'lucide-react';
import { useDMStore } from '../../stores/dmStore';
import { useAuthStore } from '../../stores/authStore';
import { useCallStore } from '../../stores/callStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useGuildStore } from '../../stores/guildStore';
import { useFriendStore } from '../../stores/friendStore';
import { api, formatAssetUrl } from '../../lib/api';
import { ActiveCallOverlay } from './ActiveCallOverlay';
import { LimitAlertModal } from '../Modals/LimitAlertModal';
import { DeleteMessageModal } from '../Modals/DeleteMessageModal';
import { EmojiAndGifPicker } from '../Chat/EmojiAndGifPicker';
import { FormattedMessage } from '../Chat/FormattedMessage';
import { ContextMenu, useContextMenu, ContextMenuItem } from '../ContextMenu';
import { searchEmojiSuggestions, replaceEmojiShortcodes, EmojiSuggestion } from '../../utils/emojis';
import { User, DMMessage } from '../../types';

interface DMChatAreaProps {
  onOpenMobileDrawer?: () => void;
  onOpenUserProfile?: (user: User, position?: { x: number; y: number }) => void;
  onPreviewImage?: (url: string) => void;
}

const QUICK_EMOJIS = ['👍', '❤️', '🔥', '😂', '🎉', '👀', '✨', '💀'];
const MAX_CHARS = 2000;
const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB

export const DMChatArea: React.FC<DMChatAreaProps> = ({
  onOpenMobileDrawer,
  onOpenUserProfile,
  onPreviewImage,
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
    toggleReaction,
    togglePin,
    isLoadingMessages,
    isLoadingMoreMessages,
    hasMoreByRoom,
    loadMoreMessages,
  } = useDMStore();
  const { guilds, activeGuild } = useGuildStore();
  const { friends } = useFriendStore();
  const { menu, openContextMenu, closeContextMenu } = useContextMenu();
  const { startCall, callState } = useCallStore();
  const chatDensity = useSettingsStore((s) => s.chatDensity);
  const isDensityCompact = chatDensity === 'compact';

  const [content, setContent] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedImagePreview, setSelectedImagePreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [replyingTo, setReplyingTo] = useState<DMMessage | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [showPinnedOnly, setShowPinnedOnly] = useState(false);
  const [activeReactionMsgId, setActiveReactionMsgId] = useState<string | null>(null);
  const [limitAlert, setLimitAlert] = useState<{ title: string; message: string; detail?: string } | null>(null);
  
  // Inline editing state
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState<string>('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const editInputRef = useRef<HTMLTextAreaElement>(null);

  // Delete message modal state
  const [messageToDelete, setMessageToDelete] = useState<DMMessage | null>(null);
  const [isDeletingMessage, setIsDeletingMessage] = useState(false);

  // Mentions (@) Autocomplete State
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionCursorPos, setMentionCursorPos] = useState<number>(0);
  const [selectedMentionIndex, setSelectedMentionIndex] = useState<number>(0);

  // Emoji (:) Autocomplete State
  const [emojiQuery, setEmojiQuery] = useState<string | null>(null);
  const [emojiCursorPos, setEmojiCursorPos] = useState<number>(0);
  const [selectedEmojiIndex, setSelectedEmojiIndex] = useState<number>(0);

  const dragCounterRef = useRef<number>(0);

  useEffect(() => {
    if (showPinnedOnly && activeRoom) {
      fetchPinnedMessages(activeRoom.id);
    }
  }, [showPinnedOnly, activeRoom?.id]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const prevScrollHeightRef = useRef<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleStartCall = async () => {
    if (!activeRoom || !activeRoom.recipient) return;
    try {
      await startCall(activeRoom.id, activeRoom.recipient);
    } catch (err: any) {
      alert(err.message || 'Falha ao iniciar chamada');
    }
  };

  const isInitialLoadRef = useRef<boolean>(true);
  const prevRoomIdRef = useRef<string | null>(null);

  const scrollToBottom = (smooth = false) => {
    if (!searchQuery && scrollContainerRef.current) {
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
    if (activeRoom?.id !== prevRoomIdRef.current) {
      prevRoomIdRef.current = activeRoom?.id || null;
      isInitialLoadRef.current = true;
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
      }
    }
  }, [activeRoom?.id]);

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
    if (!container || !activeRoom) return;

    if (container.scrollTop < 60 && !isLoadingMoreMessages && hasMoreByRoom[activeRoom.id] !== false) {
      prevScrollHeightRef.current = container.scrollHeight;
      loadMoreMessages(activeRoom.id);
    }
  };

  const processFile = (file: File) => {
    if (file.size > MAX_FILE_BYTES) {
      setLimitAlert({
        title: 'Arquivo muito grande',
        message: 'O tamanho máximo permitido para envio de arquivos é de 20 MB.',
        detail: `Seu arquivo possui ${(file.size / (1024 * 1024)).toFixed(1)} MB.`,
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

  const allAvailableEmojis = useMemo(() => {
    const list: any[] = [];
    const seen = new Set<string>();
    if (activeGuild?.emojis) {
      for (const e of activeGuild.emojis) {
        if (!seen.has(e.name.toLowerCase())) {
          seen.add(e.name.toLowerCase());
          list.push(e);
        }
      }
    }
    for (const g of guilds) {
      if (g.emojis) {
        for (const e of g.emojis) {
          if (!seen.has(e.name.toLowerCase())) {
            seen.add(e.name.toLowerCase());
            list.push(e);
          }
        }
      }
    }
    return list;
  }, [activeGuild?.emojis, guilds]);

  const recipient = activeRoom?.recipient;

  // Compute filtered mention suggestions
  const mentionSuggestions = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    const list: Array<{
      id: string;
      name: string;
      username: string;
      avatar_url?: string;
    }> = [];

    if (recipient) {
      const uName = recipient.username.toLowerCase();
      const dName = (recipient.display_name || '').toLowerCase();
      if (uName.includes(q) || dName.includes(q)) {
        list.push({
          id: recipient.id,
          name: recipient.display_name || recipient.username,
          username: recipient.username,
          avatar_url: recipient.avatar_url,
        });
      }
    }

    for (const f of friends) {
      const u = f.friend;
      if (!u || u.id === recipient?.id) continue;
      const uName = u.username.toLowerCase();
      const dName = (u.display_name || '').toLowerCase();
      if (uName.includes(q) || dName.includes(q)) {
        list.push({
          id: u.id,
          name: u.display_name || u.username,
          username: u.username,
          avatar_url: u.avatar_url,
        });
      }
    }

    return list.slice(0, 8);
  }, [mentionQuery, recipient, friends]);

  // Compute filtered emoji suggestions
  const emojiSuggestions = useMemo(() => {
    if (emojiQuery === null) return [];
    return searchEmojiSuggestions(emojiQuery, allAvailableEmojis, 'DM', 8);
  }, [emojiQuery, allAvailableEmojis]);

  const insertMention = (item: { username: string }) => {
    if (!textareaRef.current) return;
    const text = content;
    const textBefore = text.slice(0, mentionCursorPos);
    const textAfter = text.slice(mentionCursorPos);

    const newTextBefore = textBefore.replace(/@([a-zA-Z0-9_.-]*)$/, `@${item.username} `);
    const newContent = newTextBefore + textAfter;
    setContent(newContent);
    setMentionQuery(null);

    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        const newCursorPos = newTextBefore.length;
        textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 10);
  };

  const insertEmoji = (item: EmojiSuggestion) => {
    if (!textareaRef.current) return;
    const text = content;
    const textBefore = text.slice(0, emojiCursorPos);
    const textAfter = text.slice(emojiCursorPos);

    const replacement = item.isCustom ? `:${item.name}: ` : `${item.unicode} `;
    const newTextBefore = textBefore.replace(/:([a-zA-Z0-9_+-]*)$/, replacement);
    const newContent = newTextBefore + textAfter;
    setContent(newContent);
    setEmojiQuery(null);

    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        const newCursorPos = newTextBefore.length;
        textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 10);
  };

  const handleSelectEmoji = (emoji: string) => {
    setContent((prev) => prev + emoji);
    setShowEmojiPicker(false);
    textareaRef.current?.focus();
  };

  const handleSelectGif = async (gifUrl: string) => {
    setShowEmojiPicker(false);
    try {
      await sendMessage(gifUrl, undefined, replyingTo?.id);
      setReplyingTo(null);
    } catch (err: any) {
      console.error('Failed to send GIF:', err);
    }
  };

  const handleSaveEdit = async (msgId: string) => {
    if (!editContent.trim()) return;
    const msg = messages.find((m) => m.id === msgId);
    if (msg && editContent.trim() === msg.content) {
      setEditingMessageId(null);
      return;
    }

    try {
      setIsSavingEdit(true);
      await editMessage(msgId, editContent.trim());
      setEditingMessageId(null);
    } catch (err: any) {
      console.error('Failed to save message edit:', err);
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!messageToDelete) return;
    try {
      setIsDeletingMessage(true);
      await deleteMessage(messageToDelete.id);
      setMessageToDelete(null);
    } catch (err: any) {
      console.error('Failed to delete message:', err);
    } finally {
      setIsDeletingMessage(false);
    }
  };

  const handleMessageContextMenu = (e: React.MouseEvent, msg: DMMessage) => {
    e.preventDefault();
    e.stopPropagation();

    const isAuthor = user?.id === msg.author_id;
    const items: ContextMenuItem[] = [];

    if (msg.author) {
      items.push({
        label: 'Ver Perfil',
        icon: <UserIcon className="w-4 h-4" />,
        onClick: () => onOpenUserProfile?.(msg.author, { x: e.clientX, y: e.clientY }),
      });
      items.push({ label: '', separator: true });
    }

    items.push({
      label: 'Responder',
      icon: <Reply className="w-4 h-4" />,
      onClick: () => setReplyingTo(msg),
    });

    items.push({
      label: msg.is_pinned ? 'Desafixar Mensagem' : 'Fixar Mensagem',
      icon: <Pin className="w-4 h-4" />,
      onClick: () => togglePin(msg.id),
    });

    items.push({
      label: 'Copiar Texto',
      icon: <Copy className="w-4 h-4" />,
      onClick: () => navigator.clipboard.writeText(msg.content),
    });

    if (isAuthor) {
      items.push({
        label: 'Editar Mensagem',
        icon: <Pencil className="w-4 h-4" />,
        onClick: () => {
          setEditingMessageId(msg.id);
          setEditContent(msg.content);
        },
      });

      items.push({
        label: 'Excluir Mensagem',
        icon: <Trash2 className="w-4 h-4" />,
        variant: 'danger',
        onClick: () => setMessageToDelete(msg),
      });
    }

    items.push({ label: '', separator: true });
    items.push({
      label: 'Copiar ID da Mensagem',
      icon: <Copy className="w-4 h-4" />,
      onClick: () => navigator.clipboard.writeText(msg.id),
    });

    openContextMenu(e, items, 'Mensagem');
  };

  const handleSend = async () => {
    if (!content.trim() && !selectedFile) return;

    let textToSend = replaceEmojiShortcodes(content.trim(), allAvailableEmojis);

    if (textToSend.length > MAX_CHARS) {
      setLimitAlert({
        title: 'Mensagem muito longa',
        message: `O limite de caracteres por mensagem é de ${MAX_CHARS.toLocaleString('pt-BR')}.`,
        detail: `Sua mensagem atual possui ${textToSend.length.toLocaleString('pt-BR')} caracteres (${(textToSend.length - MAX_CHARS).toLocaleString('pt-BR')} acima do limite).`,
      });
      return;
    }

    const replyIdToSend = replyingTo?.id;

    setContent('');
    setReplyingTo(null);
    setMentionQuery(null);
    setEmojiQuery(null);

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

        await sendMessage(textToSend, attachmentPayload, replyIdToSend);
      } catch (err: any) {
        setIsUploading(false);
        alert(err.message || 'Falha ao enviar arquivo');
      }
    } else {
      await sendMessage(textToSend, undefined, replyIdToSend);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // 1. Emoji Suggestions Navigation
    if (emojiSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedEmojiIndex((prev) => (prev + 1) % emojiSuggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedEmojiIndex((prev) => (prev - 1 + emojiSuggestions.length) % emojiSuggestions.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertEmoji(emojiSuggestions[selectedEmojiIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setEmojiQuery(null);
        return;
      }
    }

    // 2. Mention Suggestions Navigation
    if (mentionSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedMentionIndex((prev) => (prev + 1) % mentionSuggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedMentionIndex((prev) => (prev - 1 + mentionSuggestions.length) % mentionSuggestions.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertMention(mentionSuggestions[selectedMentionIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMentionQuery(null);
        return;
      }
    }

    // 3. ArrowUp Shortcut to edit user's last message
    if (e.key === 'ArrowUp' && !content.trim() && !selectedFile && !replyingTo) {
      e.preventDefault();
      const myLastMsg = [...messages].reverse().find((m) => m.author_id === user?.id && m.status !== 'sending' && m.status !== 'failed');
      if (myLastMsg) {
        setEditingMessageId(myLastMsg.id);
        setEditContent(myLastMsg.content);
      }
      return;
    }

    // 4. Enter to send
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    } else if (e.key === 'Escape' && replyingTo) {
      e.preventDefault();
      setReplyingTo(null);
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setContent(val);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`;

    const cursor = e.target.selectionStart || val.length;
    const textBefore = val.slice(0, cursor);

    // Detect @ mention
    const mentionMatch = textBefore.match(/(?:^|\s)@([a-zA-Z0-9_.-]*)$/);
    if (mentionMatch) {
      setMentionQuery(mentionMatch[1]);
      setMentionCursorPos(cursor);
      setSelectedMentionIndex(0);
      setEmojiQuery(null);
    } else {
      setMentionQuery(null);

      // Detect : emoji
      const emojiMatch = textBefore.match(/(?:^|\s):([a-zA-Z0-9_+-]*)$/);
      if (emojiMatch) {
        setEmojiQuery(emojiMatch[1]);
        setEmojiCursorPos(cursor);
        setSelectedEmojiIndex(0);
      } else {
        setEmojiQuery(null);
      }
    }
  };

  if (!activeRoom) {
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
        <MessageSquare className="w-12 h-12 text-gray-600 mb-2" />
        <span className="text-gray-400">Selecione uma conversa para começar</span>
      </div>
    );
  }

  const baseMessages = showPinnedOnly
    ? pinnedMessagesByRoom[activeRoom.id] || []
    : messages;

  const displayedMessages = baseMessages.filter((msg) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchContent = msg.content.toLowerCase().includes(q);
      const matchAuthor = (msg.author?.display_name || msg.author?.username || '').toLowerCase().includes(q);
      if (!matchContent && !matchAuthor) return false;
    }
    return true;
  });

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'online':
        return 'bg-online';
      case 'idle':
        return 'bg-idle';
      case 'dnd':
        return 'bg-dnd';
      default:
        return 'bg-offline';
    }
  };

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="flex-1 bg-background-dark flex flex-col h-full overflow-hidden relative select-none min-h-0"
    >
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

      <ActiveCallOverlay />

      <div className="h-14 md:h-12 border-b border-black/20 px-3 md:px-4 flex items-center justify-between shadow-sm z-20 flex-shrink-0 bg-background-dark/95 backdrop-blur-sm sticky top-0">
        <div className="flex items-center gap-2.5 truncate">
          {onOpenMobileDrawer && (
            <button
              onClick={onOpenMobileDrawer}
              className="md:hidden text-gray-400 hover:text-white p-1.5 -ml-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
              title="Menu Lateral"
            >
              <Menu className="w-6 h-6" />
            </button>
          )}

          <div
            onClick={() => recipient && onOpenUserProfile?.(recipient)}
            className="relative w-8 h-8 md:w-7 md:h-7 rounded-full bg-brand-500 flex items-center justify-center text-white font-bold text-xs flex-shrink-0 cursor-pointer hover:opacity-85 transition-opacity"
            title="Ver perfil"
          >
            {recipient?.avatar_url ? (
              <img src={formatAssetUrl(recipient.avatar_url)} alt="" className="w-full h-full rounded-full object-cover" />
            ) : (
              <span>{recipient?.display_name?.[0]?.toUpperCase() || recipient?.username[0]?.toUpperCase() || 'U'}</span>
            )}
            <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 md:w-2.5 md:h-2.5 rounded-full border border-background-dark ${getStatusColor(recipient?.status)}`} />
          </div>

          <div
            onClick={() => recipient && onOpenUserProfile?.(recipient)}
            className="flex items-baseline gap-1.5 truncate cursor-pointer group"
            title="Ver perfil"
          >
            <span className="font-bold text-gray-100 text-[17px] md:text-base truncate group-hover:text-brand-400 transition-colors">
              {recipient?.display_name || recipient?.username}
            </span>
            <span className="text-xs text-gray-400 truncate">@{recipient?.username}</span>
          </div>
        </div>

        <div className="flex items-center gap-1 md:gap-2">
          <button
            onClick={handleStartCall}
            disabled={callState !== 'idle'}
            className="p-2 md:p-1.5 rounded-lg text-gray-400 hover:text-online hover:bg-white/5 transition-colors cursor-pointer disabled:opacity-40"
            title="Iniciar Chamada de Voz/Vídeo"
          >
            <Phone className="w-5 h-5" />
          </button>

          <button
            onClick={() => setShowPinnedOnly(!showPinnedOnly)}
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
              showPinnedOnly
                ? 'text-amber-400 bg-amber-400/15'
                : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
            }`}
            title={showPinnedOnly ? 'Mostrar todas as mensagens' : 'Mensagens Fixadas'}
          >
            <Pin className="w-5 h-5" />
          </button>

          {isSearchOpen ? (
            <div className="flex items-center gap-1 bg-background-darkest px-2 py-1 rounded-xl border border-white/10 text-xs">
              <Search className="w-3.5 h-3.5 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar na DM..."
                autoFocus
                className="bg-transparent text-gray-100 placeholder-gray-500 focus:outline-none w-28 md:w-44"
              />
              <button
                onClick={() => {
                  setSearchQuery('');
                  setIsSearchOpen(false);
                }}
                className="p-0.5 text-gray-400 hover:text-white cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setIsSearchOpen(true)}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-white/5 transition-colors cursor-pointer"
              title="Buscar na conversa"
            >
              <Search className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {(showPinnedOnly || searchQuery) && (
        <div className="bg-background-darkest/90 border-b border-white/5 px-4 py-2 flex items-center justify-between text-xs text-gray-300">
          <span>
            {showPinnedOnly
              ? `Exibindo apenas mensagens fixadas (${displayedMessages.length})`
              : `Resultados da busca para "${searchQuery}" (${displayedMessages.length})`}
          </span>
          <button
            onClick={() => {
              setShowPinnedOnly(false);
              setSearchQuery('');
            }}
            className="text-brand-400 hover:underline font-semibold cursor-pointer"
          >
            Limpar filtro
          </button>
        </div>
      )}

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

        {!showPinnedOnly && !searchQuery && hasMoreByRoom[activeRoom.id] === false && (
          <div className="px-2 md:px-4 py-6 md:py-8 mb-4 border-b border-white/5 select-none">
            <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-brand-500 flex items-center justify-center text-3xl font-bold text-white shadow-xl mb-3 overflow-hidden">
              {recipient?.avatar_url ? (
                <img src={formatAssetUrl(recipient.avatar_url)} alt="" className="w-full h-full object-cover" />
              ) : (
                <span>{recipient?.display_name?.[0]?.toUpperCase() || recipient?.username[0]?.toUpperCase() || 'U'}</span>
              )}
            </div>
            <h2 className="text-xl md:text-2xl font-bold text-white mb-1">{recipient?.display_name || recipient?.username}</h2>
            <p className="text-xs md:text-sm text-gray-400 mb-2">@{recipient?.username}</p>
            {recipient?.bio && (
              <p className="text-xs md:text-sm text-gray-300 max-w-lg mb-2 italic">"{recipient.bio}"</p>
            )}
            <p className="text-xs md:text-sm text-gray-400">
              Este é o início da sua história de mensagens diretas com <strong className="text-gray-200">@{recipient?.username}</strong>.
            </p>
          </div>
        )}

        {isLoadingMessages || (showPinnedOnly && isLoadingPinned[activeRoom.id]) ? (
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
                <span className="text-xs text-gray-500">Fixe mensagens importantes para consultá-las facilmente.</span>
              </>
            ) : searchQuery ? (
              <>
                <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-gray-400">
                  <Search className="w-6 h-6" />
                </div>
                <span className="text-sm font-semibold text-gray-300">Nenhum resultado encontrado</span>
                <span className="text-xs text-gray-500">Tente buscar por termos diferentes ou verifique a ortografia.</span>
              </>
            ) : (
              <span>Nenhuma mensagem ainda. Diga oi!</span>
            )}
          </div>
        ) : (
          displayedMessages.map((msg, index) => {
            const prevMsg = index > 0 ? displayedMessages[index - 1] : null;
            const isCompact = (() => {
              if (!prevMsg) return false;
              if (prevMsg.author_id !== msg.author_id) return false;
              if (msg.reply_to) return false;
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
            const isAuthor = user?.id === msg.author_id;
            const isEditing = editingMessageId === msg.id;

            return (
              <div
                key={msg.id}
                id={`msg-${msg.id}`}
                onContextMenu={(e) => handleMessageContextMenu(e, msg)}
                className={`relative flex flex-col px-3 md:px-4 group rounded transition-all duration-200 ${
                  isFailed
                    ? 'bg-red-500/10 hover:bg-red-500/15 border-l-2 border-red-500 text-red-200'
                    : isSending
                    ? 'opacity-65 select-none'
                    : 'hover:bg-background-dark/40'
                } ${isCompact ? 'py-[1.5px] mt-0' : isDensityCompact ? 'pt-1 pb-[1px] mt-1' : 'pt-2.5 pb-[1.5px] mt-3.5'}`}
              >
                {msg.reply_to && (
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      const targetEl = document.getElementById(`msg-${msg.reply_to?.id}`);
                      if (targetEl) {
                        targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        targetEl.classList.add('bg-brand-500/25', 'ring-2', 'ring-brand-500/50');
                        setTimeout(() => {
                          targetEl.classList.remove('bg-brand-500/25', 'ring-2', 'ring-brand-500/50');
                        }, 1500);
                      }
                    }}
                    className="flex items-center gap-1.5 text-[11px] text-gray-400 mb-1 ml-9 md:ml-10 select-none opacity-80 hover:opacity-100 hover:text-gray-200 transition-all cursor-pointer group/reply"
                    title="Clique para ir até a mensagem respondida"
                  >
                    <CornerDownRight className="w-3.5 h-3.5 text-gray-500 flex-shrink-0 group-hover/reply:text-brand-400 transition-colors" />
                    <span className="font-semibold text-brand-400 group-hover/reply:underline">
                      @{msg.reply_to.author.display_name || msg.reply_to.author.username}
                    </span>
                    <span className="truncate text-gray-400 max-w-sm italic">
                      "{msg.reply_to.content}"
                    </span>
                  </div>
                )}

                <div className="flex gap-3 md:gap-4 relative">
                  {!isSending && !isFailed && !isEditing && (
                    <div className="absolute -top-3 right-4 hidden group-hover:flex items-center gap-1 bg-background-darkest border border-white/10 rounded-lg p-1 shadow-lg z-10 animate-in fade-in zoom-in-95">
                      <div className="relative">
                        <button
                          onClick={() => setActiveReactionMsgId(activeReactionMsgId === msg.id ? null : msg.id)}
                          className="p-1 rounded text-gray-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                          title="Reagir"
                        >
                          <Smile className="w-3.5 h-3.5" />
                        </button>

                        {activeReactionMsgId === msg.id && (
                          <>
                            <div className="fixed inset-0 z-40" onClick={() => setActiveReactionMsgId(null)} />
                            <div className="absolute bottom-full mb-2 right-0 z-50 bg-background-darker rounded-xl p-1.5 shadow-2xl border border-white/10 flex items-center gap-1 animate-in fade-in zoom-in-95">
                              {QUICK_EMOJIS.map((emoji) => (
                                <button
                                  key={emoji}
                                  onClick={() => {
                                    toggleReaction(msg.id, emoji);
                                    setActiveReactionMsgId(null);
                                  }}
                                  className="w-7 h-7 flex items-center justify-center hover:bg-white/10 rounded-lg text-base transition-transform active:scale-125 cursor-pointer"
                                >
                                  {emoji}
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                      </div>

                      <button
                        onClick={() => setReplyingTo(msg)}
                        className="p-1 rounded text-gray-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                        title="Responder"
                      >
                        <Reply className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => togglePin(msg.id)}
                        className={`p-1 rounded transition-colors cursor-pointer ${
                          msg.is_pinned
                            ? 'text-amber-400 hover:bg-amber-400/20'
                            : 'text-gray-400 hover:text-white hover:bg-white/10'
                        }`}
                        title={msg.is_pinned ? 'Desafixar mensagem' : 'Fixar mensagem'}
                      >
                        <Pin className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => navigator.clipboard.writeText(msg.content)}
                        className="p-1 rounded text-gray-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                        title="Copiar Texto"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>

                      {isAuthor && (
                        <>
                          <button
                            onClick={() => {
                              setEditingMessageId(msg.id);
                              setEditContent(msg.content);
                            }}
                            className="p-1 rounded text-gray-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                            title="Editar Mensagem"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setMessageToDelete(msg)}
                            className="p-1 rounded text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors cursor-pointer"
                            title="Excluir Mensagem"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
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
                        {msg.is_pinned && (
                          <span className="text-[10px] text-amber-400 bg-amber-400/10 px-1.5 py-0.2 rounded font-semibold flex items-center gap-1">
                            <Pin className="w-2.5 h-2.5" /> Fixada
                          </span>
                        )}
                      </div>
                    )}

                    {isEditing ? (
                      <div className="mt-1 w-full animate-in fade-in">
                        <div className="bg-background-darkest/90 rounded-xl p-2 border border-brand-500/50 focus-within:ring-1 focus-within:ring-brand-500 shadow-lg">
                          <textarea
                            ref={editInputRef}
                            value={editContent}
                            onChange={(e) => setEditContent(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSaveEdit(msg.id);
                              } else if (e.key === 'Escape') {
                                e.preventDefault();
                                setEditingMessageId(null);
                              }
                            }}
                            autoFocus
                            rows={2}
                            className="w-full bg-transparent text-sm text-gray-100 placeholder-gray-500 focus:outline-none resize-none no-scrollbar"
                          />
                          <div className="flex items-center justify-between text-[11px] text-gray-400 pt-1 border-t border-white/5">
                            <span>
                              escape para <button type="button" onClick={() => setEditingMessageId(null)} className="text-brand-400 hover:underline cursor-pointer">cancelar</button> • enter para <button type="button" onClick={() => handleSaveEdit(msg.id)} className="text-brand-400 hover:underline cursor-pointer font-semibold">salvar</button>
                            </span>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => setEditingMessageId(null)}
                                className="px-2 py-0.5 rounded text-gray-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
                              >
                                Cancelar
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSaveEdit(msg.id)}
                                disabled={isSavingEdit || !editContent.trim()}
                                className="px-2.5 py-0.5 rounded bg-brand-500 hover:bg-brand-600 text-white font-medium transition-colors cursor-pointer disabled:opacity-50"
                              >
                                {isSavingEdit ? 'Salvando...' : 'Salvar'}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className={`text-[0.9375rem] break-words leading-[1.375rem] font-normal select-text ${
                        isFailed ? 'text-red-300' : isSending ? 'text-gray-400' : 'text-gray-200'
                      }`}>
                        <FormattedMessage
                          content={msg.content}
                          onPreviewImage={onPreviewImage}
                          onImageLoad={handleMediaLoad}
                          onOpenUserProfile={onOpenUserProfile}
                        />
                        {msg.is_edited && (
                          <span className="text-[10px] text-gray-400 select-none ml-1.5 opacity-80" title="Mensagem editada">
                            (editado)
                          </span>
                        )}
                      </div>
                    )}

                    {isFailed && (
                      <div className="mt-1.5 flex items-center gap-2 text-xs text-red-400 bg-red-500/10 px-2 py-1 rounded-lg border border-red-500/20">
                        <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                        <span className="flex-1 truncate">{msg.error || 'Falha ao enviar mensagem.'}</span>
                        <button
                          type="button"
                          onClick={async () => {
                            useDMStore.setState((s) => ({
                              messages: s.messages.filter((m) => m.id !== msg.id),
                              messagesByRoom: {
                                ...s.messagesByRoom,
                                [activeRoom.id]: (s.messagesByRoom[activeRoom.id] || []).filter((m) => m.id !== msg.id),
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

                    {!isSending && !isFailed && msg.reactions && msg.reactions.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5 select-none">
                        {msg.reactions.map((rx) => {
                          const hasReacted = user && rx.user_ids.includes(user.id);
                          return (
                            <button
                              key={rx.emoji}
                              onClick={() => toggleReaction(msg.id, rx.emoji)}
                              className={`flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-xs font-semibold border transition-all active:scale-95 cursor-pointer ${
                                hasReacted
                                  ? 'bg-brand-500/20 border-brand-500/50 text-brand-300'
                                  : 'bg-background-darkest/60 border-white/5 text-gray-400 hover:bg-white/5 hover:text-gray-200'
                              }`}
                            >
                              <span>{rx.emoji}</span>
                              <span className="text-[11px] font-bold">{rx.count}</span>
                            </button>
                          );
                        })}
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

      {replyingTo && (
        <div className="px-4 py-1.5 bg-background-darkest border-t border-white/5 flex items-center justify-between text-xs text-gray-300 animate-in fade-in slide-in-from-bottom-1 select-none">
          <div className="flex items-center gap-2 truncate">
            <Reply className="w-3.5 h-3.5 text-brand-400 flex-shrink-0" />
            <span className="text-gray-400">Respondendo a</span>
            <span className="font-bold text-brand-400">
              @{replyingTo.author.display_name || replyingTo.author.username}
            </span>
            <span className="text-gray-500 truncate max-w-xs italic hidden md:inline">
              "{replyingTo.content}"
            </span>
          </div>
          <button
            onClick={() => setReplyingTo(null)}
            className="p-1 text-gray-400 hover:text-white rounded-full hover:bg-white/10 transition-colors cursor-pointer"
            title="Cancelar resposta"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Emoji Autocomplete Suggestions Popup */}
      {emojiSuggestions.length > 0 && (
        <div className="mx-3 md:mx-4 mb-2 bg-background-darkest/95 backdrop-blur-md rounded-2xl border border-white/10 shadow-2xl p-1.5 max-h-60 overflow-y-auto no-scrollbar animate-in fade-in slide-in-from-bottom-2 select-none z-30">
          <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-400 border-b border-white/5 mb-1 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Smile className="w-3.5 h-3.5 text-brand-400" />
              <span>Emojis correspondentes ({emojiSuggestions.length})</span>
            </span>
            <span className="text-[9px] font-normal text-gray-500">↑↓ para navegar • Enter / Tab para selecionar</span>
          </div>
          <div className="space-y-0.5">
            {emojiSuggestions.map((item, idx) => (
              <button
                key={item.id}
                type="button"
                onClick={() => insertEmoji(item)}
                onMouseEnter={() => setSelectedEmojiIndex(idx)}
                className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl text-left transition-colors cursor-pointer ${
                  selectedEmojiIndex === idx ? 'bg-brand-500/25 text-white' : 'text-gray-300 hover:bg-white/5'
                }`}
              >
                {item.isCustom ? (
                  <div className="w-7 h-7 rounded-lg bg-background-darker flex items-center justify-center p-0.5 flex-shrink-0 border border-white/10">
                    <img
                      src={formatAssetUrl(item.imageUrl || '')}
                      alt={item.name}
                      className="w-full h-full object-contain"
                    />
                  </div>
                ) : (
                  <div className="w-7 h-7 flex items-center justify-center text-xl flex-shrink-0 select-none">
                    {item.unicode}
                  </div>
                )}
                <div className="flex items-center justify-between min-w-0 flex-1">
                  <span className="font-semibold text-xs text-gray-200 truncate">
                    {item.shortcode}
                  </span>
                  {item.isCustom ? (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-brand-500/20 text-brand-300 border border-brand-500/30 flex-shrink-0">
                      {item.guildName}
                    </span>
                  ) : (
                    <span className="text-[10px] text-gray-500 truncate">
                      {item.name}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Mention Autocomplete Suggestions Popup */}
      {mentionSuggestions.length > 0 && (
        <div className="mx-3 md:mx-4 mb-2 bg-background-darkest/95 backdrop-blur-md rounded-2xl border border-white/10 shadow-2xl p-1.5 max-h-60 overflow-y-auto no-scrollbar animate-in fade-in slide-in-from-bottom-2 select-none z-30">
          <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-400 border-b border-white/5 mb-1 flex items-center justify-between">
            <span>Membros sugeridos ({mentionSuggestions.length})</span>
            <span className="text-[9px] font-normal text-gray-500">↑↓ para navegar • Enter / Tab para selecionar</span>
          </div>
          <div className="space-y-0.5">
            {mentionSuggestions.map((item, idx) => (
              <button
                key={item.id}
                type="button"
                onClick={() => insertMention(item)}
                onMouseEnter={() => setSelectedMentionIndex(idx)}
                className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl text-left transition-colors cursor-pointer ${
                  selectedMentionIndex === idx ? 'bg-brand-500/25 text-white' : 'text-gray-300 hover:bg-white/5'
                }`}
              >
                <div className="w-6 h-6 rounded-full bg-brand-500 flex items-center justify-center text-xs font-bold text-white overflow-hidden flex-shrink-0">
                  {item.avatar_url ? (
                    <img src={formatAssetUrl(item.avatar_url)} alt="" className="w-full h-full object-cover" />
                  ) : (
                    item.name[0]?.toUpperCase()
                  )}
                </div>
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                  <span className="font-semibold text-xs truncate text-gray-200">
                    {item.name}
                  </span>
                  <span className="text-[10px] text-gray-500 truncate">@{item.username}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

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
            placeholder={
              replyingTo
                ? `Respondendo a @${replyingTo.author.username}...`
                : `Conversar com @${recipient?.display_name || recipient?.username || 'amigo'}`
            }
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

      <ContextMenu menu={menu} onClose={closeContextMenu} />

      <DeleteMessageModal
        isOpen={!!messageToDelete}
        onClose={() => setMessageToDelete(null)}
        onConfirm={handleConfirmDelete}
        message={messageToDelete}
        isDeleting={isDeletingMessage}
      />

      {limitAlert && (
        <LimitAlertModal
          isOpen={true}
          title={limitAlert.title}
          message={limitAlert.message}
          detail={limitAlert.detail}
          onClose={() => setLimitAlert(null)}
        />
      )}
    </div>
  );
};
