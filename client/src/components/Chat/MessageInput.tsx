import React, { useState, useRef, useEffect, useMemo } from 'react';
import { PlusCircle, SendHorizontal, Smile, X, Loader2 } from 'lucide-react';
import { Channel, Message } from '../../types';
import { socket } from '../../lib/socket';
import { api } from '../../lib/api';
import { LimitAlertModal } from '../Modals/LimitAlertModal';
import { useGuildStore } from '../../stores/guildStore';

interface MessageInputProps {
  channel: Channel;
  replyingTo?: Message | null;
  onCancelReply?: () => void;
  onSendMessage: (content: string, replyToId?: string) => Promise<void>;
}

const COMMON_EMOJIS = ['😀', '😂', '🔥', '👍', '❤️', '🎉', '😎', '🚀', '👀', '✨', '💀', '💯'];
const MAX_CHARS = 2000;
const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB

export const MessageInput: React.FC<MessageInputProps> = ({
  channel,
  replyingTo,
  onCancelReply,
  onSendMessage,
}) => {
  const { activeGuild } = useGuildStore();
  const [content, setContent] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedImagePreview, setSelectedImagePreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [limitAlert, setLimitAlert] = useState<{ title: string; message: string; detail?: string } | null>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionCursorPos, setMentionCursorPos] = useState<number>(0);
  const [selectedMentionIndex, setSelectedMentionIndex] = useState<number>(0);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastTypingTime = useRef<number>(0);

  // Compute filtered mention suggestions
  const mentionSuggestions = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    const list: Array<{
      id: string;
      name: string;
      username: string;
      avatar_url?: string;
      isSpecial?: boolean;
      roleColor?: string;
    }> = [];

    // Special global tags
    if ('everyone'.startsWith(q) || 'todos'.startsWith(q)) {
      list.push({ id: 'everyone', name: 'everyone', username: 'everyone', isSpecial: true });
    }
    if ('here'.startsWith(q) || 'aqui'.startsWith(q)) {
      list.push({ id: 'here', name: 'here', username: 'here', isSpecial: true });
    }

    if (activeGuild?.members) {
      for (const m of activeGuild.members) {
        const uName = m.username.toLowerCase();
        const dName = (m.display_name || '').toLowerCase();
        if (uName.includes(q) || dName.includes(q)) {
          const topRole = m.roles && m.roles.length > 0 ? m.roles[0] : null;
          list.push({
            id: m.id,
            name: m.display_name || m.username,
            username: m.username,
            avatar_url: m.avatar_url,
            roleColor: topRole?.color,
          });
        }
      }
    }

    return list.slice(0, 8);
  }, [mentionQuery, activeGuild?.members]);

  useEffect(() => {
    if (channel?.id && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [channel?.id]);

  useEffect(() => {
    if (replyingTo && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [replyingTo]);

  const insertMention = (item: { username: string }) => {
    if (!textareaRef.current) return;
    const text = content;
    const textBefore = text.slice(0, mentionCursorPos);
    const textAfter = text.slice(mentionCursorPos);

    // Replace the trailing @query with @username
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

  const handleSend = async () => {
    if (isUploading) return;
    let finalContent = content.trim();

    // Check 2,000 character limit on raw text
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
    const replyId = replyingTo?.id;

    setContent('');
    setSelectedFile(null);
    setSelectedImagePreview(null);
    setShowEmojiPicker(false);
    setMentionQuery(null);
    onCancelReply?.();
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    try {
      if (fileToUpload) {
        setIsUploading(true);
        const uploaded = await api.upload.attachment(fileToUpload);
        finalContent = finalContent ? `${finalContent}\n${uploaded.url}` : uploaded.url;
      }

      await onSendMessage(finalContent, replyId);
    } catch (err: any) {
      console.error('Failed to send message/file:', err);
      setLimitAlert({
        title: 'Erro ao Enviar Mensagem',
        message: err.message || 'Não foi possível enviar a mensagem. Verifique sua conexão.',
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleKeyDown = async (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
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

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      await handleSend();
    } else if (e.key === 'Escape' && replyingTo) {
      e.preventDefault();
      onCancelReply?.();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setContent(val);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;

    // Detect @ mention query at cursor
    const cursor = e.target.selectionStart || val.length;
    const textBefore = val.slice(0, cursor);
    const match = textBefore.match(/@([a-zA-Z0-9_.-]*)$/);

    if (match) {
      setMentionQuery(match[1]);
      setMentionCursorPos(cursor);
      setSelectedMentionIndex(0);
    } else {
      setMentionQuery(null);
    }

    const now = Date.now();
    if (now - lastTypingTime.current > 2000) {
      lastTypingTime.current = now;
      socket.send('TYPING_START', { channel_id: channel.id });
    }
  };

  const handleSelectEmoji = (emoji: string) => {
    setContent((prev) => prev + emoji);
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  const processImageFile = (file: File) => {
    if (file.size > MAX_FILE_BYTES) {
      setLimitAlert({
        title: 'Arquivo Muito Grande',
        message: 'O limite de imagens/vídeos/arquivos são 20mb',
        detail: `Tamanho do arquivo: ${(file.size / (1024 * 1024)).toFixed(2)} MB (Máximo permitido: 20 MB)`,
      });
      return;
    }

    setSelectedFile(file);

    // Generate local thumbnail preview
    const reader = new FileReader();
    reader.onload = (readEvent) => {
      setSelectedImagePreview(readEvent.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.indexOf('image') !== -1) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          processImageFile(file);
          break;
        }
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processImageFile(file);
    e.target.value = '';
  };

  return (
    <div className="p-3 md:p-4 bg-background-dark relative">
      {/* Mention Autocomplete Suggestions Popup */}
      {mentionSuggestions.length > 0 && (
        <div className="mb-2 bg-background-darkest/95 backdrop-blur-md rounded-2xl border border-white/10 shadow-2xl p-1.5 max-h-60 overflow-y-auto no-scrollbar animate-in fade-in slide-in-from-bottom-2">
          <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-400 border-b border-white/5 mb-1 flex items-center justify-between">
            <span>Membros ({mentionSuggestions.length})</span>
            <span className="text-[9px] font-normal text-gray-500">↑↓ para navegar • Enter para selecionar</span>
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
                {item.isSpecial ? (
                  <div className="w-6 h-6 rounded-full bg-brand-500/30 flex items-center justify-center text-xs font-bold text-brand-300">
                    @
                  </div>
                ) : (
                  <div className="w-6 h-6 rounded-full bg-brand-500 flex items-center justify-center text-xs font-bold text-white overflow-hidden flex-shrink-0">
                    {item.avatar_url ? (
                      <img src={item.avatar_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      item.name[0]?.toUpperCase()
                    )}
                  </div>
                )}
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                  <span
                    className="font-semibold text-xs truncate"
                    style={{ color: item.roleColor || undefined }}
                  >
                    {item.name}
                  </span>
                  {!item.isSpecial && (
                    <span className="text-[10px] text-gray-500 truncate">@{item.username}</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Replying banner */}
      {replyingTo && (
        <div className="bg-background-darkest/90 border border-b-0 border-white/5 px-4 py-2 rounded-t-2xl flex items-center justify-between text-xs text-gray-300 animate-in fade-in slide-in-from-bottom-1">
          <div className="flex items-center gap-2 truncate">
            <span className="text-gray-500">Respondendo a</span>
            <span className="font-bold text-brand-400">
              @{replyingTo.author?.display_name || replyingTo.author?.username}
            </span>
            <span className="truncate text-gray-400 max-w-xs italic font-normal">
              "{replyingTo.content}"
            </span>
          </div>
          <button
            type="button"
            onClick={onCancelReply}
            className="text-gray-400 hover:text-white p-1 hover:bg-white/5 rounded-full transition-colors cursor-pointer"
            title="Cancelar Resposta (Esc)"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Selected Image Preview */}
      {selectedImagePreview && (
        <div className="mb-2 p-2 bg-background-darkest rounded-2xl border border-white/10 flex items-center justify-between w-max max-w-xs animate-in fade-in">
          <div className="flex items-center gap-2">
            <img
              src={selectedImagePreview}
              alt="Preview"
              className="w-12 h-12 object-cover rounded-xl border border-white/10"
            />
            <div>
              <span className="text-xs text-gray-200 font-medium block truncate max-w-[140px]">
                {selectedFile?.name || 'Imagem anexada'}
              </span>
              <span className="text-[10px] text-gray-400">
                {selectedFile ? `${(selectedFile.size / 1024).toFixed(0)} KB` : ''}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setSelectedFile(null);
              setSelectedImagePreview(null);
            }}
            className="p-1 hover:bg-white/10 rounded-full text-gray-400 hover:text-white ml-3 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Emoji Picker Popover */}
      {showEmojiPicker && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setShowEmojiPicker(false)} />
          <div className="absolute bottom-20 right-4 z-30 bg-background-darkest p-3 rounded-2xl shadow-2xl border border-white/10 grid grid-cols-6 gap-2 animate-in fade-in zoom-in-95 duration-150">
            {COMMON_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => handleSelectEmoji(emoji)}
                className="w-9 h-9 flex items-center justify-center text-xl hover:bg-white/10 rounded-xl transition-all active:scale-125 cursor-pointer"
              >
                {emoji}
              </button>
            ))}
          </div>
        </>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />

      <div
        className={`bg-background-darkest flex items-center gap-2 px-3 md:px-4 py-2 border border-white/5 focus-within:border-brand-500/50 shadow-inner transition-colors ${
          replyingTo ? 'rounded-b-2xl rounded-t-none' : 'rounded-2xl'
        }`}
      >
        {/* Attachment Upload Button */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="text-gray-400 hover:text-white p-1 rounded-full hover:bg-white/5 transition-colors flex-shrink-0 cursor-pointer disabled:opacity-50"
          title="Anexar Imagem (até 20 MB)"
        >
          <PlusCircle className="w-5 h-5" />
        </button>

        {/* Text Input */}
        <textarea
          ref={textareaRef}
          value={content}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={replyingTo ? `Respondendo a @${replyingTo.author?.username}...` : `Conversar em #${channel.name}`}
          rows={1}
          disabled={isUploading}
          className="flex-1 bg-transparent text-gray-100 placeholder-gray-500 text-sm focus:outline-none resize-none py-1 max-h-40 leading-relaxed font-normal no-scrollbar"
        />

        {/* Emoji Button */}
        <button
          type="button"
          onClick={() => setShowEmojiPicker(!showEmojiPicker)}
          className={`p-1.5 rounded-full hover:bg-white/5 transition-colors flex-shrink-0 cursor-pointer ${
            showEmojiPicker ? 'text-brand-500' : 'text-gray-400 hover:text-white'
          }`}
          title="Inserir Emoji"
        >
          <Smile className="w-5 h-5" />
        </button>

        {/* Send Button */}
        <button
          type="button"
          onClick={handleSend}
          disabled={(!content.trim() && !selectedFile) || isUploading}
          className="bg-brand-500 hover:bg-brand-600 disabled:opacity-40 disabled:hover:bg-brand-500 text-white p-2 rounded-xl transition-all shadow-md shadow-brand-500/20 active:scale-95 flex-shrink-0 cursor-pointer"
          title="Enviar Mensagem"
        >
          {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <SendHorizontal className="w-4 h-4" />}
        </button>
      </div>

      {/* 2k Char / 20MB Limit Modal */}
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
