import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { PlusCircle, SendHorizontal, Smile, X, Loader2, FileText, UploadCloud, Hash, Volume2, Lock, Mic, Terminal, Bot, Sparkles, CornerDownLeft, AlertCircle, AlertTriangle } from 'lucide-react';
import { Channel, Message } from '../../types';
import { socket } from '../../lib/socket';
import { api, formatAssetUrl } from '../../lib/api';
import { LimitAlertModal } from '../Modals/LimitAlertModal';
import { EmojiAndGifPicker } from './EmojiAndGifPicker';
import { VoiceRecorder } from './VoiceRecorder';
import { useGuildStore } from '../../stores/guildStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useGuildPermissions } from '../../hooks/useGuildPermissions';
import { searchEmojiSuggestions, replaceEmojiShortcodes, EmojiSuggestion } from '../../utils/emojis';
import { optimizeImageForUpload } from '../../lib/imageOptimizer';
import { SLASH_COMMANDS, parseSlashCommand, SlashOption, SlashCommand, validateSlashOption } from '../../lib/slashCommands';
import { executeYtdlpCommand } from '../../lib/ytdlpRunner';

interface MentionSuggestionItem {
  id: string;
  name: string;
  username: string;
  avatar_url?: string;
  isSpecial?: boolean;
  isRole?: boolean;
  roleColor?: string;
}

interface SlashSuggestionItem {
  command: string;
  subcommand?: string;
  name: string;
  description: string;
  syntax: string;
  options?: SlashOption[];
}

interface ActiveSlashState {
  command: SlashCommand;
  subcommand?: SlashOption;
  args: Record<string, string>;
  activeOptionName: string | null;
}

interface MessageInputProps {
  channel?: { id?: string; name?: string; type?: string } | null;
  placeholder?: string;
  replyingTo?: { id: string; author?: { username?: string; display_name?: string }; content: string } | null;
  onCancelReply?: () => void;
  onSendMessage: (content: string, replyToId?: string) => Promise<void>;
  onEditLastMessage?: () => void;
  droppedFile?: File | null;
  onClearDroppedFile?: () => void;
  contextType?: 'channel' | 'dm' | 'dm_group';
  customMentions?: MentionSuggestionItem[];
  onTyping?: () => void;
}

const MAX_CHARS = 2000;
const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB

function getSlashParamsBadge(options?: SlashOption[]): string | null {
  if (!options || options.length === 0) return null;
  const requiredCount = options.filter((o) => o.required).length;
  const optionalCount = options.filter((o) => !o.required).length;

  const parts: string[] = [];
  if (requiredCount > 0) {
    parts.push(`+${requiredCount} ${requiredCount === 1 ? 'Obrigatório' : 'Obrigatórios'}`);
  }
  if (optionalCount > 0) {
    parts.push(`+${optionalCount} ${optionalCount === 1 ? 'Opcional' : 'Opcionais'}`);
  }

  if (parts.length === 0) return null;
  return parts.join(' / ');
}

export const MessageInput: React.FC<MessageInputProps> = ({
  channel,
  placeholder,
  replyingTo,
  onCancelReply,
  onSendMessage,
  onEditLastMessage,
  droppedFile,
  onClearDroppedFile,
  contextType = 'channel',
  customMentions,
  onTyping,
}) => {
  const { activeGuild, guilds } = useGuildStore();
  const { canManageMessages, canKick, canBan } = useGuildPermissions(activeGuild);
  const [content, setContent] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedImagePreview, setSelectedImagePreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [limitAlert, setLimitAlert] = useState<{ title: string; message: string; detail?: string } | null>(null);

  // Command Error Feedback Banner & Screen Shake State
  const [commandError, setCommandError] = useState<{
    title: string;
    message: string;
    field?: string;
  } | null>(null);

  const triggerErrorShake = useCallback(() => {
    const isReduced =
      useSettingsStore.getState().reducedMotion ||
      (typeof window !== 'undefined' &&
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
    if (isReduced) return;

    const target = document.getElementById('root') || document.body;
    if (target) {
      target.classList.remove('animate-screen-shake');
      void target.offsetWidth;
      target.classList.add('animate-screen-shake');
      setTimeout(() => {
        target.classList.remove('animate-screen-shake');
      }, 400);
    }
  }, []);

  // Active Discord-Style Slash Command Pill Mode State
  const [activeSlash, setActiveSlash] = useState<ActiveSlashState | null>(null);
  const [selectedOptionIndex, setSelectedOptionIndex] = useState<number>(-1);
  const optionInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const commandContainerRef = useRef<HTMLDivElement | null>(null);

  // Slash Commands Initial (/) Suggestions
  const [selectedSlashIndex, setSelectedSlashIndex] = useState<number>(0);

  // Channel (#) Autocomplete State
  const [channelQuery, setChannelQuery] = useState<string | null>(null);
  const [channelCursorPos, setChannelCursorPos] = useState<number>(0);
  const [selectedChannelIndex, setSelectedChannelIndex] = useState<number>(0);

  // Mentions (@) Autocomplete State in text mode
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionCursorPos, setMentionCursorPos] = useState<number>(0);
  const [selectedMentionIndex, setSelectedMentionIndex] = useState<number>(0);

  // Emoji (:) Autocomplete State
  const [emojiQuery, setEmojiQuery] = useState<string | null>(null);
  const [emojiCursorPos, setEmojiCursorPos] = useState<number>(0);
  const [selectedEmojiIndex, setSelectedEmojiIndex] = useState<number>(0);

  // Slash Command Option Choices / User Dropdowns State
  const [slashChoiceIndex, setSlashChoiceIndex] = useState<number>(0);
  const [slashUserIndex, setSlashUserIndex] = useState<number>(0);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mainSlashInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastTypingTime = useRef<number>(0);

  // List refs for auto-scrolling with keyboard navigation
  const slashListRef = useRef<HTMLDivElement>(null);
  const slashChoiceListRef = useRef<HTMLDivElement>(null);
  const slashUserListRef = useRef<HTMLDivElement>(null);
  const slashOptionsListRef = useRef<HTMLDivElement>(null);
  const channelListRef = useRef<HTMLDivElement>(null);
  const emojiListRef = useRef<HTMLDivElement>(null);
  const mentionListRef = useRef<HTMLDivElement>(null);

  // All available options for the active slash command
  const activeSlashOptions = useMemo<SlashOption[]>(() => {
    if (!activeSlash) return [];
    return activeSlash.subcommand?.options || activeSlash.command.options || [];
  }, [activeSlash]);

  // Current active option definition
  const currentActiveOption = useMemo<SlashOption | null>(() => {
    if (!activeSlash || !activeSlash.activeOptionName) return null;
    return activeSlashOptions.find((o) => o.name === activeSlash.activeOptionName) || null;
  }, [activeSlash, activeSlashOptions]);

  // Filtered choices when active option is type === 'choice'
  const filteredSlashChoices = useMemo(() => {
    if (!activeSlash || !currentActiveOption || currentActiveOption.type !== 'choice') return [];
    const val = (activeSlash.args[currentActiveOption.name] || '').toLowerCase().trim();
    const choices = currentActiveOption.choices || [];
    if (!val) return choices;
    return choices.filter(
      (c) => c.name.toLowerCase().includes(val) || c.value.toLowerCase().includes(val)
    );
  }, [activeSlash, currentActiveOption]);

  // Filtered user suggestions when active option is type === 'user'
  const filteredSlashUsers = useMemo(() => {
    if (!activeSlash || !currentActiveOption || currentActiveOption.type !== 'user') return [];
    const q = (activeSlash.args[currentActiveOption.name] || '').replace(/^@/, '').toLowerCase().trim();
    const list: MentionSuggestionItem[] = [];

    if (customMentions && customMentions.length > 0) {
      for (const m of customMentions) {
        const u = (m.username || '').toLowerCase();
        const n = (m.name || '').toLowerCase();
        if (!q || u.includes(q) || n.includes(q)) {
          list.push(m);
        }
      }
      return list.slice(0, 30);
    }

    if (activeGuild?.members) {
      for (const m of activeGuild.members) {
        const u = m.username.toLowerCase();
        const d = (m.display_name || '').toLowerCase();
        if (!q || u.includes(q) || d.includes(q)) {
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
    return list.slice(0, 30);
  }, [activeSlash, currentActiveOption, customMentions, activeGuild?.members]);

  // Focus active option input or main slash input on selection change
  useEffect(() => {
    if (activeSlash) {
      if (activeSlash.activeOptionName) {
        const optName = activeSlash.activeOptionName;
        setTimeout(() => {
          optionInputRefs.current[optName]?.focus();
        }, 30);
      } else {
        setTimeout(() => {
          mainSlashInputRef.current?.focus();
        }, 30);
      }
    }
  }, [activeSlash?.activeOptionName, activeSlash]);

  // Auto-scroll selected autocomplete items into view as user navigates with Arrow keys
  useEffect(() => {
    if (selectedSlashIndex >= 0 && slashListRef.current) {
      const el = slashListRef.current.children[selectedSlashIndex] as HTMLElement;
      el?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedSlashIndex]);

  useEffect(() => {
    if (slashChoiceIndex >= 0 && slashChoiceListRef.current) {
      const el = slashChoiceListRef.current.children[slashChoiceIndex] as HTMLElement;
      el?.scrollIntoView({ block: 'nearest' });
    }
  }, [slashChoiceIndex]);

  useEffect(() => {
    if (slashUserIndex >= 0 && slashUserListRef.current) {
      const el = slashUserListRef.current.children[slashUserIndex] as HTMLElement;
      el?.scrollIntoView({ block: 'nearest' });
    }
  }, [slashUserIndex]);

  useEffect(() => {
    if (selectedOptionIndex >= 0 && slashOptionsListRef.current) {
      const el = slashOptionsListRef.current.children[selectedOptionIndex] as HTMLElement;
      el?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedOptionIndex]);

  useEffect(() => {
    if (selectedChannelIndex >= 0 && channelListRef.current) {
      const el = channelListRef.current.children[selectedChannelIndex] as HTMLElement;
      el?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedChannelIndex]);

  useEffect(() => {
    if (selectedEmojiIndex >= 0 && emojiListRef.current) {
      const el = emojiListRef.current.children[selectedEmojiIndex] as HTMLElement;
      el?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedEmojiIndex]);

  useEffect(() => {
    if (selectedMentionIndex >= 0 && mentionListRef.current) {
      const el = mentionListRef.current.children[selectedMentionIndex] as HTMLElement;
      el?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedMentionIndex]);

  // Compute filtered slash commands suggestions (when typing / in standard input)
  const slashSuggestions = useMemo(() => {
    if (activeSlash || !content.startsWith('/')) return [];
    if (mentionQuery !== null || emojiQuery !== null || channelQuery !== null) return [];

    const trimmed = content.trim();
    const parts = trimmed.slice(1).split(/\s+/);

    if (parts.length > 2 || (parts.length === 2 && content.includes(' ') && !content.endsWith(parts[1]))) {
      return [];
    }
    if (parts.length === 1 && content.includes(' ') && (parts[0] === 'yt-dlp' || parts[0] === 'ytdlp')) {
      return [];
    }

    const searchWord = parts[0]?.toLowerCase() || '';
    const subSearch = parts[1]?.toLowerCase() || '';

    const list: SlashSuggestionItem[] = [];

    for (const cmd of SLASH_COMMANDS) {
      if (cmd.guildOnly && contextType !== 'channel') continue;
      if (cmd.requiredPermission === 'manage_messages' && !canManageMessages) continue;
      if (cmd.requiredPermission === 'kick_members' && !canKick) continue;
      if (cmd.requiredPermission === 'ban_members' && !canBan) continue;

      if (cmd.subcommands && cmd.subcommands.length > 0) {
        for (const sub of cmd.subcommands) {
          const fullCmdName = `${cmd.name} ${sub.name}`;
          const isMatching =
            parts.length <= 1
              ? (cmd.name.toLowerCase().startsWith(searchWord) || fullCmdName.toLowerCase().includes(searchWord))
              : (cmd.name.toLowerCase() === searchWord && (sub.name.toLowerCase().startsWith(subSearch) || subSearch === ''));

          if (isMatching) {
            let syntax = `/${cmd.name} ${sub.name}`;
            if (sub.options) {
              for (const opt of sub.options) {
                syntax += opt.required ? ` [${opt.name}]` : ` (${opt.name})`;
              }
            }
            list.push({
              command: cmd.name,
              subcommand: sub.name,
              name: `/${cmd.name} ${sub.name}`,
              description: sub.description,
              syntax,
              options: sub.options,
            });
          }
        }
      } else {
        const isMatching = cmd.name.toLowerCase().startsWith(searchWord);
        if (isMatching) {
          let syntax = `/${cmd.name}`;
          if (cmd.options) {
            for (const opt of cmd.options) {
              syntax += opt.required ? ` [${opt.name}]` : ` (${opt.name})`;
            }
          }
          list.push({
            command: cmd.name,
            name: `/${cmd.name}`,
            description: cmd.description,
            syntax,
            options: cmd.options,
          });
        }
      }
    }

    return list.slice(0, 50);
  }, [activeSlash, content, contextType, mentionQuery, emojiQuery, channelQuery, canManageMessages, canKick, canBan]);

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

  // Compute filtered channel suggestions (only in server channel context)
  const channelSuggestions = useMemo(() => {
    if (contextType !== 'channel' || channelQuery === null) return [];
    const q = channelQuery.toLowerCase();
    const channels = activeGuild?.channels || [];
    const list = channels.filter(
      (c) => c.type !== 'category' && c.name.toLowerCase().includes(q)
    );
    return list.slice(0, 30);
  }, [contextType, channelQuery, activeGuild?.channels]);

  // Compute filtered mention suggestions in regular text mode
  const mentionSuggestions = useMemo(() => {
    if (activeSlash || mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    const list: MentionSuggestionItem[] = [];

    if (customMentions && customMentions.length > 0) {
      for (const m of customMentions) {
        const uName = (m.username || '').toLowerCase();
        const dName = (m.name || '').toLowerCase();
        if (uName.includes(q) || dName.includes(q)) {
          list.push(m);
        }
      }
      return list.slice(0, 30);
    }

    if (contextType !== 'channel') return [];

    if ('everyone'.startsWith(q) || 'todos'.startsWith(q)) {
      list.push({ id: 'everyone', name: 'everyone', username: 'everyone', isSpecial: true });
    }
    if ('here'.startsWith(q) || 'aqui'.startsWith(q)) {
      list.push({ id: 'here', name: 'here', username: 'here', isSpecial: true });
    }

    if (activeGuild?.roles) {
      for (const r of activeGuild.roles) {
        const rName = r.name.toLowerCase();
        if (rName.includes(q)) {
          list.push({
            id: r.id,
            name: r.name,
            username: r.name,
            isRole: true,
            roleColor: r.color,
          });
        }
      }
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

    return list.slice(0, 30);
  }, [activeSlash, mentionQuery, customMentions, contextType, activeGuild?.members, activeGuild?.roles]);

  // Compute filtered emoji suggestions
  const emojiSuggestions = useMemo(() => {
    if (emojiQuery === null) return [];
    return searchEmojiSuggestions(emojiQuery, allAvailableEmojis, activeGuild?.name || 'ZeroVC', 20);
  }, [emojiQuery, allAvailableEmojis, activeGuild?.name]);

  useEffect(() => {
    if (droppedFile) {
      processFile(droppedFile);
      onClearDroppedFile?.();
    }
  }, [droppedFile]);

  useEffect(() => {
    if (channel?.id && !activeSlash && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [channel?.id, activeSlash]);

  useEffect(() => {
    if (replyingTo && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [replyingTo]);

  const insertChannel = (item: Channel) => {
    if (!textareaRef.current) return;
    const text = content;
    const textBefore = text.slice(0, channelCursorPos);
    const textAfter = text.slice(channelCursorPos);

    const newTextBefore = textBefore.replace(/#([a-zA-Z0-9_\u00C0-\u00FF-]*)$/, `#${item.name} `);
    const newContent = newTextBefore + textAfter;
    setContent(newContent);
    setChannelQuery(null);

    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        const newCursorPos = newTextBefore.length;
        textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 10);
  };

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

    const replacement = item.isCustom
      ? `:${item.name}: `
      : `${item.unicode} `;

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

  // Convert selected slash command into Discord Argument Pills mode
  const startSlashCommand = (item: SlashSuggestionItem) => {
    const cmd = SLASH_COMMANDS.find((c) => c.name === item.command);
    if (!cmd) return;
    const sub = cmd.subcommands?.find((s) => s.name === item.subcommand);
    const options = sub?.options || cmd.options || [];

    // ONLY auto-focus/pull initial option if there is an explicitly REQUIRED option
    let initialOption: string | null = null;
    const firstReq = options.find((o) => o.required);
    if (firstReq) {
      initialOption = firstReq.name;
    }

    setCommandError(null);
    setActiveSlash({
      command: cmd,
      subcommand: sub,
      args: {},
      activeOptionName: initialOption,
    });

    setSelectedOptionIndex(firstReq ? 0 : -1);
    setContent('');
    setSelectedSlashIndex(0);
    setSlashChoiceIndex(0);
    setSlashUserIndex(0);
  };

  // Handle value change inside an argument pill
  const handleOptionValueChange = (optName: string, val: string) => {
    if (!activeSlash) return;
    const newArgs = {
      ...activeSlash.args,
      [optName]: val,
    };
    setActiveSlash({
      ...activeSlash,
      args: newArgs,
    });
    setSlashChoiceIndex(0);
    setSlashUserIndex(0);

    // Live real-time validation on typing/pasting
    const trimmed = val.trim();
    if (trimmed.length > 0) {
      const validation = validateSlashOption(activeSlash.command.name, optName, trimmed);
      if (!validation.isValid) {
        setCommandError({
          title: validation.errorTitle || 'Valor Inválido',
          message: validation.errorMessage || 'Parâmetro com formato ou valor inválido.',
          field: optName,
        });
        return;
      }
    }
    if (commandError?.field === optName) {
      setCommandError(null);
    }
  };

  // Select a choice option (e.g. BR or mp4)
  const handleSelectSlashChoice = (choiceVal: string) => {
    if (commandError) setCommandError(null);
    if (!activeSlash || !currentActiveOption) return;
    const optName = currentActiveOption.name;
    const newArgs = { ...activeSlash.args, [optName]: choiceVal };

    // Find next REQUIRED option without value, or if none, close active pill focus
    const remainingReq = activeSlashOptions.filter((o) => o.name !== optName && o.required && !newArgs[o.name]);
    setActiveSlash({
      ...activeSlash,
      args: newArgs,
      activeOptionName: remainingReq.length > 0 ? remainingReq[0].name : null,
    });
    setSelectedOptionIndex(-1);
    setSlashChoiceIndex(0);
  };

  // Select a user mention option
  const handleSelectSlashUser = (userItem: MentionSuggestionItem) => {
    if (commandError) setCommandError(null);
    if (!activeSlash || !currentActiveOption) return;
    const optName = currentActiveOption.name;
    const newArgs = { ...activeSlash.args, [optName]: `@${userItem.username}` };

    const remainingReq = activeSlashOptions.filter((o) => o.name !== optName && o.required && !newArgs[o.name]);
    setActiveSlash({
      ...activeSlash,
      args: newArgs,
      activeOptionName: remainingReq.length > 0 ? remainingReq[0].name : null,
    });
    setSelectedOptionIndex(-1);
    setSlashUserIndex(0);
  };

  // Select option to focus from OPTIONS popup or +option button
  const selectOptionToFocus = (optName: string) => {
    if (commandError && !optName) setCommandError(null);
    if (!activeSlash) return;
    setActiveSlash({
      ...activeSlash,
      activeOptionName: optName,
    });
    const idx = activeSlashOptions.findIndex((o) => o.name === optName);
    setSelectedOptionIndex(idx >= 0 ? idx : -1);
    setSlashChoiceIndex(0);
    setSlashUserIndex(0);
  };

  // Execute active slash command
  const handleSendActiveSlash = async () => {
    if (!activeSlash || isUploading) return;

    // Check guild-only & permissions
    if (activeSlash.command.guildOnly && contextType !== 'channel') {
      triggerErrorShake();
      setCommandError({
        title: 'Comando Indisponível',
        message: 'Este comando só pode ser utilizado dentro de canais de servidor.',
      });
      return;
    }

    if (activeSlash.command.requiredPermission === 'manage_messages' && !canManageMessages) {
      triggerErrorShake();
      setCommandError({
        title: 'Permissão Negada',
        message: 'Você precisa de um cargo com a permissão "Gerenciar Mensagens" para usar este comando.',
      });
      return;
    }
    if (activeSlash.command.requiredPermission === 'kick_members' && !canKick) {
      triggerErrorShake();
      setCommandError({
        title: 'Permissão Negada',
        message: 'Você precisa de um cargo com a permissão "Expulsar Membros" para usar este comando.',
      });
      return;
    }
    if (activeSlash.command.requiredPermission === 'ban_members' && !canBan) {
      triggerErrorShake();
      setCommandError({
        title: 'Permissão Negada',
        message: 'Você precisa de um cargo com a permissão "Banir Membros" para usar este comando.',
      });
      return;
    }

    // Check required options and validate all parameters
    for (const opt of activeSlashOptions) {
      const val = (activeSlash.args[opt.name] || '').trim();
      if (opt.required && !val) {
        triggerErrorShake();
        setCommandError({
          title: 'Opção Obrigatória Faltando',
          message: `Por favor preencha o campo obrigatório "${opt.name}": ${opt.description}`,
          field: opt.name,
        });
        selectOptionToFocus(opt.name);
        return;
      }

      if (val) {
        const validation = validateSlashOption(activeSlash.command.name, opt.name, val);
        if (!validation.isValid) {
          triggerErrorShake();
          setCommandError({
            title: validation.errorTitle || 'Valor Inválido',
            message: validation.errorMessage || `O valor informado para "${opt.name}" é inválido.`,
            field: opt.name,
          });
          selectOptionToFocus(opt.name);
          return;
        }
      }
    }

    // Special LoL rule: If riot_id is provided, region is required
    if (activeSlash.command.name === 'league' && activeSlash.args['riot_id']?.trim()) {
      if (!activeSlash.args['region']?.trim()) {
        activeSlash.args['region'] = 'BR';
      }
    }

    const commandName = activeSlash.command.name;
    const subcommandName = activeSlash.subcommand?.name;
    const args: Record<string, any> = {};

    for (const [k, v] of Object.entries(activeSlash.args)) {
      if (v && v.trim()) {
        args[k] = v.trim();
      }
    }

    if (commandName === 'yt-dlp' || commandName === 'ytdlp') {
      const link = args.link?.trim() || '';
      const linkValidation = validateSlashOption('yt-dlp', 'link', link);
      if (!linkValidation.isValid) {
        triggerErrorShake();
        setCommandError({
          title: linkValidation.errorTitle || 'Link Inválido',
          message: linkValidation.errorMessage || 'Link inválido para download.',
          field: 'link',
        });
        selectOptionToFocus('link');
        return;
      }

      // Validated successfully: Clear the command input immediately
      setActiveSlash(null);
      setSelectedOptionIndex(-1);
      setContent('');
      setCommandError(null);

      executeYtdlpCommand({
        format: args.format === 'mp3' ? 'mp3' : 'mp4',
        link,
        contextType,
        contextId: channel?.id || '',
        onError: (errMessage) => {
          triggerErrorShake();
          setCommandError({
            title: 'Erro no Download (yt-dlp)',
            message: errMessage,
          });
        },
      }).catch((err: any) => {
        console.error('Failed to execute yt-dlp command:', err);
        triggerErrorShake();
        setCommandError({
          title: 'Erro no Download (yt-dlp)',
          message: err?.message || 'Falha ao executar o comando.',
        });
      });
      return;
    }

    // Backend Slash Commands (/server, /user, /league)
    try {
      const payload = {
        command: commandName,
        subcommand: subcommandName,
        args,
      };
      setActiveSlash(null);
      setSelectedOptionIndex(-1);
      setContent('');
      setCommandError(null);

      if (contextType === 'channel' && channel?.id) {
        await api.commands.executeChannelCommand(channel.id, payload);
      } else if (contextType === 'dm' && channel?.id) {
        await api.commands.executeDMRoomCommand(channel.id, payload);
      } else if (contextType === 'dm_group' && channel?.id) {
        await api.commands.executeDMGroupCommand(channel.id, payload);
      }
    } catch (err: any) {
      console.error('Failed to execute slash command:', err);
      triggerErrorShake();
      setCommandError({
        title: 'Erro ao Executar Comando',
        message: err?.message || 'Falha ao executar comando no servidor.',
      });
    }
  };

  // Keyboard navigation inside an argument pill input
  const handleOptionKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, opt: SlashOption) => {
    // 1. Choices Navigation
    if (opt.type === 'choice' && filteredSlashChoices.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSlashChoiceIndex((prev) => (prev + 1) % filteredSlashChoices.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSlashChoiceIndex((prev) => (prev - 1 + filteredSlashChoices.length) % filteredSlashChoices.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const selected = filteredSlashChoices[slashChoiceIndex];
        if (selected) {
          handleSelectSlashChoice(selected.value);
        }
        return;
      }
    }

    // 2. User Mention Suggestions Navigation
    if (opt.type === 'user' && filteredSlashUsers.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSlashUserIndex((prev) => (prev + 1) % filteredSlashUsers.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSlashUserIndex((prev) => (prev - 1 + filteredSlashUsers.length) % filteredSlashUsers.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const selected = filteredSlashUsers[slashUserIndex];
        if (selected) {
          handleSelectSlashUser(selected);
        }
        return;
      }
    }

    // 3. Backspace on empty input removes this option pill
    if (e.key === 'Backspace' && !activeSlash?.args[opt.name]) {
      e.preventDefault();
      const newArgs = { ...activeSlash?.args };
      delete newArgs[opt.name];
      const currentIdx = activeSlashOptions.findIndex((o) => o.name === opt.name);
      if (currentIdx > 0) {
        setActiveSlash((prev) => (prev ? { ...prev, args: newArgs, activeOptionName: activeSlashOptions[currentIdx - 1].name } : null));
        setSelectedOptionIndex(currentIdx - 1);
      } else {
        const nextOpt = activeSlashOptions.find((o, idx) => idx > 0 && newArgs[o.name]);
        if (nextOpt) {
          setActiveSlash((prev) => (prev ? { ...prev, args: newArgs, activeOptionName: nextOpt.name } : null));
          const nIdx = activeSlashOptions.findIndex((o) => o.name === nextOpt.name);
          setSelectedOptionIndex(nIdx >= 0 ? nIdx : -1);
        } else {
          setActiveSlash((prev) => (prev ? { ...prev, args: newArgs, activeOptionName: null } : null));
          setSelectedOptionIndex(-1);
        }
      }
      return;
    }

    // 4. Tab to advance between options
    if (e.key === 'Tab') {
      e.preventDefault();
      // Special LoL rule: if editing riot_id, jump directly to region
      if (opt.name === 'riot_id' && activeSlash?.command.name === 'league') {
        setActiveSlash((prev) => (prev ? { ...prev, activeOptionName: 'region' } : null));
        const rIdx = activeSlashOptions.findIndex((o) => o.name === 'region');
        setSelectedOptionIndex(rIdx >= 0 ? rIdx : -1);
        return;
      }
      const otherOpts = activeSlashOptions.filter((o) => o.name !== opt.name);
      if (otherOpts.length > 0) {
        const next = otherOpts.find((o) => !activeSlash?.args[o.name]) || otherOpts[0];
        setActiveSlash((prev) => (prev ? { ...prev, activeOptionName: next.name } : null));
        const nIdx = activeSlashOptions.findIndex((o) => o.name === next.name);
        setSelectedOptionIndex(nIdx >= 0 ? nIdx : -1);
      } else {
        setActiveSlash((prev) => (prev ? { ...prev, activeOptionName: null } : null));
        setSelectedOptionIndex(-1);
      }
      return;
    }

    // 5. Enter exits parameter editing and returns focus to normal input field
    if (e.key === 'Enter') {
      e.preventDefault();
      setActiveSlash((prev) => (prev ? { ...prev, activeOptionName: null } : null));
      setSelectedOptionIndex(-1);
      return;
    }

    // 6. Escape to cancel
    if (e.key === 'Escape') {
      e.preventDefault();
      setActiveSlash(null);
      setSelectedOptionIndex(-1);
      setContent('');
      return;
    }
  };

  const handleSend = async () => {
    if (isUploading) return;
    if (activeSlash) {
      await handleSendActiveSlash();
      return;
    }

    let finalContent = replaceEmojiShortcodes(content.trim(), allAvailableEmojis);

    // Fallback: Check if user typed a Slash Command manually in text box
    if (finalContent.startsWith('/')) {
      const parsed = parseSlashCommand(finalContent);
      if (!parsed) {
        triggerErrorShake();
        setCommandError({
          title: 'Comando Não Reconhecido',
          message: 'O comando digitado não foi encontrado ou possui sintaxe inválida. Selecione um comando válido abaixo:',
        });
        return;
      }

      const cmdDef = SLASH_COMMANDS.find((c) => c.name === parsed.command);
      if (cmdDef?.guildOnly && contextType !== 'channel') {
        triggerErrorShake();
        setCommandError({
          title: 'Comando Indisponível',
          message: 'Este comando só pode ser utilizado dentro de canais de servidor.',
        });
        return;
      }

      if (cmdDef?.requiredPermission === 'manage_messages' && !canManageMessages) {
        triggerErrorShake();
        setCommandError({
          title: 'Permissão Negada',
          message: 'Você precisa de um cargo com a permissão "Gerenciar Mensagens" para usar este comando.',
        });
        return;
      }
      if (cmdDef?.requiredPermission === 'kick_members' && !canKick) {
        triggerErrorShake();
        setCommandError({
          title: 'Permissão Negada',
          message: 'Você precisa de um cargo com a permissão "Expulsar Membros" para usar este comando.',
        });
        return;
      }
      if (cmdDef?.requiredPermission === 'ban_members' && !canBan) {
        triggerErrorShake();
        setCommandError({
          title: 'Permissão Negada',
          message: 'Você precisa de um cargo com a permissão "Banir Membros" para usar este comando.',
        });
        return;
      }

      if (parsed.command === 'yt-dlp' || parsed.command === 'ytdlp') {
        const link = parsed.args.link?.trim() || '';
        if (!link) {
          triggerErrorShake();
          const cmdDef = SLASH_COMMANDS.find((c) => c.name === 'yt-dlp');
          if (cmdDef) {
            setActiveSlash({
              command: cmdDef,
              subcommand: undefined,
              args: parsed.args,
              activeOptionName: 'link',
            });
          }
          setCommandError({
            title: 'Opção Obrigatória Faltando',
            message: 'Informe o formato e o link do vídeo/música individual.\nExemplo: `/yt-dlp mp4 https://www.youtube.com/watch?v=...`',
            field: 'link',
          });
          return;
        }

        const linkValidation = validateSlashOption('yt-dlp', 'link', link);
        if (!linkValidation.isValid) {
          triggerErrorShake();
          const cmdDef = SLASH_COMMANDS.find((c) => c.name === 'yt-dlp');
          if (cmdDef) {
            setActiveSlash({
              command: cmdDef,
              subcommand: undefined,
              args: parsed.args,
              activeOptionName: 'link',
            });
          }
          setCommandError({
            title: linkValidation.errorTitle || 'Link Inválido',
            message: linkValidation.errorMessage || 'Link inválido para download.',
            field: 'link',
          });
          return;
        }

        setContent('');
        setSelectedFile(null);
        setSelectedImagePreview(null);
        setShowEmojiPicker(false);
        setChannelQuery(null);
        setMentionQuery(null);
        setEmojiQuery(null);
        onCancelReply?.();
        if (textareaRef.current) textareaRef.current.style.height = 'auto';
        setCommandError(null);

        executeYtdlpCommand({
          format: parsed.args.format === 'mp3' ? 'mp3' : 'mp4',
          link,
          contextType,
          contextId: channel?.id || '',
          onError: (errMessage) => {
            triggerErrorShake();
            setCommandError({
              title: 'Erro no Download (yt-dlp)',
              message: errMessage,
            });
          },
        }).catch((err: any) => {
          console.error('Failed to execute yt-dlp command:', err);
          triggerErrorShake();
          setCommandError({
            title: 'Erro no Download (yt-dlp)',
            message: err?.message || 'Falha ao executar o comando.',
          });
        });
        return;
      }

      // Backend Slash Commands
      try {
        const payload = {
          command: parsed.command,
          subcommand: parsed.subcommand,
          args: parsed.args,
        };
        if (contextType === 'channel' && channel?.id) {
          await api.commands.executeChannelCommand(channel.id, payload);
        } else if (contextType === 'dm' && channel?.id) {
          await api.commands.executeDMRoomCommand(channel.id, payload);
        } else if (contextType === 'dm_group' && channel?.id) {
          await api.commands.executeDMGroupCommand(channel.id, payload);
        }
        setContent('');
        setSelectedFile(null);
        setSelectedImagePreview(null);
        setShowEmojiPicker(false);
        setChannelQuery(null);
        setMentionQuery(null);
        setEmojiQuery(null);
        onCancelReply?.();
        if (textareaRef.current) textareaRef.current.style.height = 'auto';
        setCommandError(null);
      } catch (err: any) {
        console.error('Failed to execute slash command:', err);
        triggerErrorShake();
        const cmdDef = SLASH_COMMANDS.find((c) => c.name === parsed.command);
        if (cmdDef) {
          const subDef = cmdDef.subcommands?.find((s) => s.name === parsed.subcommand);
          setActiveSlash({
            command: cmdDef,
            subcommand: subDef,
            args: parsed.args,
            activeOptionName: null,
          });
        }
        setCommandError({
          title: 'Erro ao Executar Comando',
          message: err?.message || 'Falha ao executar comando no servidor.',
        });
      }
      return;
    }

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
    setChannelQuery(null);
    setMentionQuery(null);
    setEmojiQuery(null);
    lastTypingTime.current = 0;
    onCancelReply?.();
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    try {
      if (fileToUpload) {
        setIsUploading(true);
        const optimizedFile = await optimizeImageForUpload(fileToUpload, { maxWidth: 2048, maxHeight: 2048, quality: 0.85 });
        const uploaded = await api.upload.attachment(optimizedFile);
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

  const handleSendVoice = async (audioFile: File) => {
    setIsRecordingVoice(false);
    setIsUploading(true);
    try {
      const uploaded = await api.upload.attachment(audioFile);
      await onSendMessage(uploaded.url, replyingTo?.id);
      onCancelReply?.();
    } catch (err: any) {
      console.error('Failed to send voice note:', err);
      setLimitAlert({
        title: 'Erro ao Enviar Mensagem de Voz',
        message: err.message || 'Não foi possível enviar o áudio gravado.',
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleKeyDown = async (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // 0. Mention Suggestions Navigation (Top Priority when typing @...)
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

    // 1. Channel Suggestions Navigation (when typing #...)
    if (channelSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedChannelIndex((prev) => (prev + 1) % channelSuggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedChannelIndex((prev) => (prev - 1 + channelSuggestions.length) % channelSuggestions.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertChannel(channelSuggestions[selectedChannelIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setChannelQuery(null);
        return;
      }
    }

    // 2. Emoji Suggestions Navigation (when typing :...)
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

    // 3. Slash Commands Navigation (when typing /...)
    if (slashSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedSlashIndex((prev) => (prev + 1) % slashSuggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedSlashIndex((prev) => (prev - 1 + slashSuggestions.length) % slashSuggestions.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        startSlashCommand(slashSuggestions[selectedSlashIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setContent('');
        return;
      }
    }

    // 4. ArrowUp Shortcut to edit user's last message when input is empty
    if (e.key === 'ArrowUp' && !content.trim() && !selectedFile && !replyingTo) {
      e.preventDefault();
      onEditLastMessage?.();
      return;
    }

    // 5. Normal Enter to Send
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      await handleSend();
    } else if (e.key === 'Escape' && replyingTo) {
      e.preventDefault();
      onCancelReply?.();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (commandError) setCommandError(null);
    const val = e.target.value;
    setContent(val);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;

    const cursor = e.target.selectionStart || val.length;
    const textBefore = val.slice(0, cursor);

    // Detect # channel query at cursor
    const channelMatch = textBefore.match(/(?:^|\s)#([a-zA-Z0-9_\u00C0-\u00FF-]*)$/);
    if (channelMatch) {
      setChannelQuery(channelMatch[1]);
      setChannelCursorPos(cursor);
      setSelectedChannelIndex(0);
      setMentionQuery(null);
      setEmojiQuery(null);
    } else {
      setChannelQuery(null);

      // Detect @ mention query at cursor
      const mentionMatch = textBefore.match(/(?:^|\s)@([a-zA-Z0-9_.-]*)$/);
      if (mentionMatch) {
        setMentionQuery(mentionMatch[1]);
        setMentionCursorPos(cursor);
        setSelectedMentionIndex(0);
        setEmojiQuery(null);
      } else {
        setMentionQuery(null);

        // Detect : emoji query at cursor
        const emojiMatch = textBefore.match(/(?:^|\s):([a-zA-Z0-9_+-]*)$/);
        if (emojiMatch) {
          setEmojiQuery(emojiMatch[1]);
          setEmojiCursorPos(cursor);
          setSelectedEmojiIndex(0);
        } else {
          setEmojiQuery(null);
        }
      }
    }

    const now = Date.now();
    if (now - lastTypingTime.current > 1800) {
      lastTypingTime.current = now;
      if (onTyping) {
        onTyping();
      } else if (channel?.id) {
        socket.send('TYPING_START', {
          channel_id: channel.id,
          guild_id: activeGuild?.id,
        });
      }
    }
  };

  const handleSelectEmoji = (emoji: string) => {
    if (activeSlash && currentActiveOption) {
      handleOptionValueChange(currentActiveOption.name, (activeSlash.args[currentActiveOption.name] || '') + emoji);
      return;
    }
    setContent((prev) => prev + emoji);
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  const handleSelectGif = async (gifUrl: string) => {
    setShowEmojiPicker(false);
    if (activeSlash) {
      setActiveSlash(null);
    }
    await onSendMessage(gifUrl, replyingTo?.id);
    onCancelReply?.();
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
      reader.onload = (readEvent) => {
        setSelectedImagePreview(readEvent.target?.result as string);
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

  // Remaining options for active slash that have not been filled and are not currently active
  const remainingSlashOptions = useMemo(() => {
    if (!activeSlash) return [];
    return activeSlashOptions.filter(
      (opt) => opt.name !== activeSlash.activeOptionName && (!activeSlash.args[opt.name] || activeSlash.args[opt.name] === '')
    );
  }, [activeSlash, activeSlashOptions]);

  // Full syntax string formatted for active command
  const activeSlashSyntax = useMemo(() => {
    if (!activeSlash) return '';
    let s = `/${activeSlash.command.name}`;
    if (activeSlash.subcommand) {
      s += ` ${activeSlash.subcommand.name}`;
      if (activeSlash.subcommand.options) {
        for (const opt of activeSlash.subcommand.options) {
          s += opt.required ? ` [${opt.name}]` : ` (${opt.name})`;
        }
      }
    } else if (activeSlash.command.options) {
      for (const opt of activeSlash.command.options) {
        s += opt.required ? ` [${opt.name}]` : ` (${opt.name})`;
      }
    }
    return s;
  }, [activeSlash]);

  return (
    <div
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 0.75rem)' }}
      className="px-3 md:px-4 pt-0 bg-background-dark relative select-none"
    >
      {/* 1. Slash Commands (/) Initial Autocomplete Suggestions Popup */}
      {slashSuggestions.length > 0 && !activeSlash && (
        <div className="mb-2 bg-background-darkest/95 backdrop-blur-md rounded-2xl border border-brand-500/25 shadow-2xl p-1.5 max-h-64 overflow-y-auto no-scrollbar animate-in fade-in slide-in-from-bottom-2">
          {commandError && (
            <div className="mb-1.5 bg-rose-500/15 border border-rose-500/30 rounded-xl p-2.5 flex items-start gap-2 text-rose-200 animate-in fade-in duration-150">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-rose-300 uppercase tracking-wide">
                    {commandError.title}
                  </span>
                  <button
                    type="button"
                    onClick={() => setCommandError(null)}
                    className="text-rose-400 hover:text-rose-200 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <p className="text-xs text-rose-200/90 mt-0.5 leading-relaxed whitespace-pre-line">
                  {commandError.message}
                </p>
              </div>
            </div>
          )}
          <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-400 border-b border-white/5 mb-1 flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-brand-400 font-semibold">
              <Bot className="w-3.5 h-3.5" />
              <span>Comandos do Gork ({slashSuggestions.length})</span>
            </span>
            <span className="text-[9px] font-normal text-gray-500">↑↓ para navegar • Enter / Tab para selecionar</span>
          </div>
          <div ref={slashListRef} className="space-y-0.5">
            {slashSuggestions.map((item, idx) => (
              <button
                key={item.name}
                type="button"
                onClick={() => startSlashCommand(item)}
                onMouseEnter={() => setSelectedSlashIndex(idx)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-colors cursor-pointer ${
                  selectedSlashIndex === idx ? 'bg-brand-500/25 text-white' : 'text-gray-300 hover:bg-white/5'
                }`}
              >
                <div className="w-7 h-7 rounded-lg bg-brand-500/15 flex items-center justify-center text-brand-400 flex-shrink-0 border border-brand-500/20">
                  <Terminal className="w-3.5 h-3.5" />
                </div>
                <div className="flex flex-col min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs text-white">
                      {item.name}
                    </span>
                    {(() => {
                      const badge = getSlashParamsBadge(item.options);
                      if (!badge) return null;
                      return (
                        <span className="text-[11px] text-gray-400 font-medium whitespace-nowrap">
                          {badge}
                        </span>
                      );
                    })()}
                  </div>
                  <span className="text-[11px] text-gray-400 truncate mt-0.5">
                    {item.description}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 2. Active Slash Command Extended Autocomplete: Camada 1 (Feedback de Erros) + Camada 2 (Opções / Parâmetros) OR Standalone Command Error */}
      {(commandError || (activeSlash && (
        (currentActiveOption?.type === 'choice' && filteredSlashChoices.length > 0) ||
        (currentActiveOption?.type === 'user' && filteredSlashUsers.length > 0) ||
        (activeSlash.activeOptionName !== null)
      ))) && (
        <div className="mb-2 bg-background-darkest/95 backdrop-blur-md rounded-2xl border border-white/10 shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-2">
          {/* Camada 1: Feedback de Erros */}
          {commandError && (
            <div className="bg-rose-500/15 border-b border-rose-500/30 p-3 flex items-start gap-2.5 text-rose-200 animate-in fade-in duration-150">
              <div className="p-1 rounded-lg bg-rose-500/20 text-rose-400 shrink-0 mt-0.5 border border-rose-500/30">
                <AlertCircle className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-rose-300 uppercase tracking-wide">
                    {commandError.title}
                  </span>
                  <button
                    type="button"
                    onClick={() => setCommandError(null)}
                    className="text-rose-400/70 hover:text-rose-200 p-0.5 rounded transition-colors cursor-pointer"
                    title="Fechar aviso"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <p className="text-xs text-rose-200/90 mt-0.5 leading-relaxed whitespace-pre-line">
                  {commandError.message}
                </p>
              </div>
            </div>
          )}

          {/* Camada 2: Opções / Parâmetros */}
          {activeSlash && (
            <div className="p-2 max-h-64 overflow-y-auto no-scrollbar">

              {/* Sub-view: Choice Selector */}
              {currentActiveOption?.type === 'choice' && filteredSlashChoices.length > 0 ? (
                <div>
                  <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-400 flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-brand-400 font-semibold">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Opções para {currentActiveOption.name}</span>
                    </span>
                    <span className="text-[9px] font-normal text-gray-500">↑↓ navegar • Enter / Tab selecionar</span>
                  </div>
                  <div ref={slashChoiceListRef} className="space-y-0.5 mt-1">
                    {filteredSlashChoices.map((choice, idx) => (
                      <button
                        key={choice.value}
                        type="button"
                        onClick={() => {
                          handleSelectSlashChoice(choice.value);
                          setCommandError(null);
                        }}
                        onMouseEnter={() => setSlashChoiceIndex(idx)}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-left transition-colors cursor-pointer ${
                          slashChoiceIndex === idx ? 'bg-brand-500/25 text-white font-medium' : 'text-gray-300 hover:bg-white/5'
                        }`}
                      >
                        <span className="text-xs">{choice.name}</span>
                        <span className="text-[10px] font-mono text-brand-300 bg-brand-500/15 px-1.5 py-0.5 rounded border border-brand-500/20">
                          {choice.value}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : currentActiveOption?.type === 'user' && filteredSlashUsers.length > 0 ? (
                /* Sub-view: User Selector */
                <div>
                  <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-400 flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-brand-400 font-semibold">
                      <Bot className="w-3.5 h-3.5" />
                      <span>Selecionar Membro ({filteredSlashUsers.length})</span>
                    </span>
                    <span className="text-[9px] font-normal text-gray-500">↑↓ navegar • Enter / Tab selecionar</span>
                  </div>
                  <div ref={slashUserListRef} className="space-y-0.5 mt-1">
                    {filteredSlashUsers.map((m, idx) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          handleSelectSlashUser(m);
                          setCommandError(null);
                        }}
                        onMouseEnter={() => setSlashUserIndex(idx)}
                        className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl text-left transition-colors cursor-pointer ${
                          slashUserIndex === idx ? 'bg-brand-500/25 text-white' : 'text-gray-300 hover:bg-white/5'
                        }`}
                      >
                        <div className="w-6 h-6 rounded-full bg-brand-500 flex items-center justify-center text-xs font-bold text-white overflow-hidden flex-shrink-0">
                          {m.avatar_url ? (
                            <img src={formatAssetUrl(m.avatar_url)} alt="" className="w-full h-full object-cover" />
                          ) : (
                            m.name[0]?.toUpperCase()
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                          <span className="font-semibold text-xs truncate" style={{ color: m.roleColor || undefined }}>
                            {m.name}
                          </span>
                          <span className="text-[10px] text-gray-500 truncate">@{m.username}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                /* Sub-view: Options List */
                <div>
                  <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-400 flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-gray-300 font-semibold tracking-wide">
                      <span>PARÂMETROS / OPÇÕES</span>
                    </span>
                    <span className="text-[9px] font-normal text-gray-500">
                      ↑↓ navegar • Tab/Enter focar • Enter enviar
                    </span>
                  </div>
                  <div ref={slashOptionsListRef} className="space-y-0.5 mt-1">
                    {activeSlashOptions.map((opt, idx) => {
                      const isSelected = activeSlash.activeOptionName === opt.name || selectedOptionIndex === idx;
                      const rawVal = activeSlash.args[opt.name] ?? '';
                      const hasValue = rawVal.trim().length > 0;
                      const validation = hasValue
                        ? validateSlashOption(activeSlash.command.name, opt.name, rawVal)
                        : { isValid: false };
                      const isFieldErrored = commandError?.field === opt.name || (hasValue && !validation.isValid);

                      return (
                        <button
                          key={opt.name}
                          type="button"
                          onClick={() => {
                            selectOptionToFocus(opt.name);
                          }}
                          onMouseEnter={() => setSelectedOptionIndex(idx)}
                          className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-left transition-colors cursor-pointer ${
                            isFieldErrored
                              ? 'bg-rose-500/20 text-white ring-1 ring-rose-500/50'
                              : isSelected
                              ? 'bg-brand-500/25 text-white ring-1 ring-brand-500/40'
                              : 'text-gray-300 hover:bg-white/5'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`font-bold text-xs px-2 py-0.5 rounded border flex-shrink-0 ${
                              isFieldErrored
                                ? 'bg-rose-500/30 text-rose-200 border-rose-500/40'
                                : 'bg-background-darker text-white border-white/10'
                            }`}>
                              {opt.name}
                            </span>
                            <span className="text-[11px] text-gray-400 truncate">
                              {opt.description}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                            {hasValue ? (
                              validation.isValid ? (
                                <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 max-w-[160px] truncate">
                                  {rawVal}
                                </span>
                              ) : (
                                <span className="text-[10px] font-medium text-rose-300 bg-rose-500/20 px-2 py-0.5 rounded border border-rose-500/40 max-w-[160px] truncate flex items-center gap-1">
                                  <AlertTriangle className="w-3 h-3 text-rose-400 shrink-0" />
                                  <span>{validation.errorTitle || 'Inválido'}</span>
                                </span>
                              )
                            ) : opt.required ? (
                              <span className="text-[9px] text-rose-400 font-semibold uppercase px-1.5 py-0.5 rounded bg-rose-500/10 border border-rose-500/20">
                                Obrigatório
                              </span>
                            ) : (
                              <span className="text-[9px] text-gray-500 uppercase">Opcional</span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* If there is a command error without an activeSlash (e.g. invalid raw command typed) */}
          {!activeSlash && commandError && (
            <div className="p-2 border-t border-white/5">
              <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-400 flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-brand-400 font-semibold">
                  <Bot className="w-3.5 h-3.5" />
                  <span>Comandos Disponíveis</span>
                </span>
              </div>
              <div className="space-y-0.5 mt-1 max-h-48 overflow-y-auto no-scrollbar">
                {SLASH_COMMANDS.filter((cmd) => {
                  if (cmd.guildOnly && contextType !== 'channel') return false;
                  if (cmd.requiredPermission === 'manage_messages' && !canManageMessages) return false;
                  if (cmd.requiredPermission === 'kick_members' && !canKick) return false;
                  if (cmd.requiredPermission === 'ban_members' && !canBan) return false;
                  return true;
                }).map((cmd) => (
                  <button
                    key={cmd.name}
                    type="button"
                    onClick={() => {
                      startSlashCommand({
                        command: cmd.name,
                        name: cmd.name,
                        description: cmd.description,
                        syntax: `/${cmd.name}`,
                      });
                      setCommandError(null);
                    }}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-left transition-colors cursor-pointer text-gray-300 hover:bg-white/5 hover:text-white"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-white">/{cmd.name}</span>
                      <span className="text-[11px] text-gray-400">{cmd.description}</span>
                    </div>
                    {(() => {
                      const badge = getSlashParamsBadge(cmd.options);
                      if (!badge) return null;
                      return (
                        <span className="text-[10px] text-brand-300 font-medium bg-brand-500/15 px-2 py-0.5 rounded-md border border-brand-500/20 whitespace-nowrap">
                          {badge}
                        </span>
                      );
                    })()}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 5. Channel (#) Autocomplete Suggestions Popup */}
      {channelSuggestions.length > 0 && (
        <div className="mb-2 bg-background-darkest/95 backdrop-blur-md rounded-2xl border border-white/10 shadow-2xl p-1.5 max-h-60 overflow-y-auto no-scrollbar animate-in fade-in slide-in-from-bottom-2">
          <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-400 border-b border-white/5 mb-1 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Hash className="w-3.5 h-3.5 text-brand-400" />
              <span>Canais de Texto e Voz ({channelSuggestions.length})</span>
            </span>
            <span className="text-[9px] font-normal text-gray-500">↑↓ navegar • Enter / Tab selecionar</span>
          </div>
          <div ref={channelListRef} className="space-y-0.5">
            {channelSuggestions.map((ch, idx) => {
              const category = activeGuild?.channels?.find((c) => c.id === ch.category_id);
              const isVoice = ch.type === 'voice';
              return (
                <button
                  key={ch.id}
                  type="button"
                  onClick={() => insertChannel(ch)}
                  onMouseEnter={() => setSelectedChannelIndex(idx)}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl text-left transition-colors cursor-pointer ${
                    selectedChannelIndex === idx ? 'bg-brand-500/25 text-white' : 'text-gray-300 hover:bg-white/5'
                  }`}
                >
                  <div className="w-6 h-6 rounded-lg bg-background-darker flex items-center justify-center text-gray-400 flex-shrink-0 border border-white/5">
                    {isVoice ? <Volume2 className="w-3.5 h-3.5" /> : <Hash className="w-3.5 h-3.5" />}
                  </div>
                  <div className="flex items-center justify-between min-w-0 flex-1">
                    <span className="font-semibold text-xs text-gray-200 truncate flex items-center gap-1">
                      <span>{ch.name}</span>
                      {ch.is_private && <Lock className="w-3 h-3 text-gray-400" />}
                    </span>
                    {category && (
                      <span className="text-[10px] text-gray-500 truncate uppercase font-mono">
                        {category.name}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 6. Emoji Autocomplete Suggestions Popup */}
      {emojiSuggestions.length > 0 && (
        <div className="mb-2 bg-background-darkest/95 backdrop-blur-md rounded-2xl border border-white/10 shadow-2xl p-1.5 max-h-60 overflow-y-auto no-scrollbar animate-in fade-in slide-in-from-bottom-2">
          <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-400 border-b border-white/5 mb-1 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Smile className="w-3.5 h-3.5 text-brand-400" />
              <span>Emojis correspondentes ({emojiSuggestions.length})</span>
            </span>
            <span className="text-[9px] font-normal text-gray-500">↑↓ navegar • Enter / Tab selecionar</span>
          </div>
          <div ref={emojiListRef} className="space-y-0.5">
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

      {/* 7. Mention (@) Autocomplete Suggestions Popup in text mode */}
      {mentionSuggestions.length > 0 && (
        <div className="mb-2 bg-background-darkest/95 backdrop-blur-md rounded-2xl border border-white/10 shadow-2xl p-1.5 max-h-60 overflow-y-auto no-scrollbar animate-in fade-in slide-in-from-bottom-2">
          <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-400 border-b border-white/5 mb-1 flex items-center justify-between">
            <span>Membros ({mentionSuggestions.length})</span>
            <span className="text-[9px] font-normal text-gray-500">↑↓ navegar • Enter para selecionar</span>
          </div>
          <div ref={mentionListRef} className="space-y-0.5">
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
                  <div className="w-6 h-6 rounded-full bg-brand-500/30 flex items-center justify-center text-xs font-bold text-brand-300 flex-shrink-0">
                    @
                  </div>
                ) : item.isRole ? (
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 border"
                    style={{
                      backgroundColor: `${item.roleColor || '#5865F2'}22`,
                      color: item.roleColor || '#5865F2',
                      borderColor: `${item.roleColor || '#5865F2'}55`,
                    }}
                  >
                    @
                  </div>
                ) : (
                  <div className="w-6 h-6 rounded-full bg-brand-500 flex items-center justify-center text-xs font-bold text-white overflow-hidden flex-shrink-0">
                    {item.avatar_url ? (
                      <img src={formatAssetUrl(item.avatar_url)} alt="" className="w-full h-full object-cover" />
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
                  {!item.isSpecial && !item.isRole && (
                    <span className="text-[10px] text-gray-500 truncate">@{item.username}</span>
                  )}
                  {item.isRole && (
                    <span className="text-[9px] px-1 py-0.2 rounded bg-white/5 text-gray-400 border border-white/10 uppercase font-mono">
                      Cargo
                    </span>
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

      {/* Selected File / Image Preview */}
      {selectedFile && (
        <div className="mb-2 p-2 bg-background-darkest rounded-2xl border border-white/10 flex items-center justify-between w-max max-w-xs animate-in fade-in">
          <div className="flex items-center gap-2.5">
            {selectedImagePreview ? (
              <img
                src={selectedImagePreview}
                alt="Preview"
                className="w-12 h-12 object-cover rounded-xl border border-white/10 flex-shrink-0"
              />
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

      {/* Emoji & Klipy GIF Picker */}
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

      {isRecordingVoice ? (
        <VoiceRecorder
          onSendVoice={handleSendVoice}
          onCancel={() => setIsRecordingVoice(false)}
        />
      ) : (
        <div
          className={`bg-background-darkest flex items-center gap-2 px-3 md:px-4 py-2 md:py-2.5 min-h-[48px] md:min-h-[52px] border border-white/5 focus-within:border-brand-500/50 shadow-inner transition-colors ${
            replyingTo ? 'rounded-b-2xl rounded-t-none' : 'rounded-2xl'
          }`}
        >
          {/* Left: Attachment Upload Button or Bot Avatar */}
          {!activeSlash ? (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="text-gray-400 hover:text-white p-1 rounded-full hover:bg-white/5 transition-colors flex-shrink-0 cursor-pointer disabled:opacity-50"
              title="Anexar Arquivo ou Imagem (até 20 MB)"
            >
              <PlusCircle className="w-5 h-5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setActiveSlash(null)}
              className="text-gray-400 hover:text-rose-400 p-1 rounded-full hover:bg-white/5 transition-colors flex-shrink-0 cursor-pointer"
              title="Cancelar Comando (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          )}

          {/* Center: Slash Command Discord Pill Mode OR Standard Textarea */}
          {activeSlash ? (
            <div
              ref={commandContainerRef}
              className="flex-1 flex flex-wrap items-center gap-1.5 min-h-[30px] py-0.5"
            >
              {/* Invisible input when no specific pill is focused to capture Enter/Escape/Backspace/Arrows */}
              {activeSlash.activeOptionName === null && (
                <input
                  ref={mainSlashInputRef}
                  type="text"
                  className="w-0 h-0 opacity-0 pointer-events-none absolute"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowDown') {
                      if (activeSlashOptions.length > 0) {
                        e.preventDefault();
                        setSelectedOptionIndex((prev) => (prev + 1) % activeSlashOptions.length);
                      }
                      return;
                    }
                    if (e.key === 'ArrowUp') {
                      if (activeSlashOptions.length > 0) {
                        e.preventDefault();
                        setSelectedOptionIndex((prev) => (prev <= 0 ? activeSlashOptions.length - 1 : prev - 1));
                      }
                      return;
                    }
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (selectedOptionIndex >= 0 && selectedOptionIndex < activeSlashOptions.length) {
                        selectOptionToFocus(activeSlashOptions[selectedOptionIndex].name);
                      } else {
                        handleSendActiveSlash();
                      }
                      return;
                    }
                    if (e.key === 'Tab') {
                      e.preventDefault();
                      const targetIdx = selectedOptionIndex >= 0 ? selectedOptionIndex : 0;
                      if (activeSlashOptions.length > 0) {
                        selectOptionToFocus(activeSlashOptions[targetIdx].name);
                      }
                      return;
                    }
                    if (e.key === 'Backspace') {
                      e.preventDefault();
                      const cmdStr = `/${activeSlash.command.name}${activeSlash.subcommand ? ' ' + activeSlash.subcommand.name : ''}`;
                      setActiveSlash(null);
                      setContent(cmdStr);
                      return;
                    }
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      if (selectedOptionIndex >= 0) {
                        setSelectedOptionIndex(-1);
                      } else {
                        setActiveSlash(null);
                        setContent('');
                      }
                      return;
                    }
                  }}
                />
              )}

              {/* Bot Avatar + Command Name Prefix (Matching Screenshots 1 & 2) */}
              <div
                onClick={() => selectOptionToFocus('')}
                className="flex items-center gap-1.5 flex-shrink-0 select-none bg-brand-500/10 border border-brand-500/25 px-2 py-1 rounded-lg cursor-pointer hover:bg-brand-500/15 transition-colors"
              >
                <div className="w-4 h-4 rounded-full overflow-hidden bg-brand-500 flex items-center justify-center flex-shrink-0">
                  <img
                    src="/assets/gork.jpg"
                    alt="Gork"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                  <Bot className="w-3 h-3 text-white" />
                </div>
                <div className="flex items-center text-xs font-bold leading-none">
                  <span className="text-brand-400 mr-0.5">/</span>
                  <span className="text-white">{activeSlash.command.name}</span>
                  {activeSlash.subcommand && (
                    <span className="text-gray-200 ml-1 font-semibold">{activeSlash.subcommand.name}</span>
                  )}
                </div>
              </div>

              {/* Argument Pills: ONLY render pills for options that are REQUIRED, currently ACTIVE, or have a VALUE SET */}
              {activeSlashOptions.map((opt) => {
                const isSet = activeSlash.args[opt.name] !== undefined && activeSlash.args[opt.name] !== '';
                const isActive = activeSlash.activeOptionName === opt.name;
                const isRequired = !!opt.required;

                if (!isSet && !isActive && !isRequired) return null;

                const rawVal = activeSlash.args[opt.name] ?? '';
                const hasValue = rawVal.trim().length > 0;
                const validation = hasValue
                  ? validateSlashOption(activeSlash.command.name, opt.name, rawVal)
                  : { isValid: true };
                const hasError = hasValue && !validation.isValid;

                return (
                  <div
                    key={opt.name}
                    onClick={() => selectOptionToFocus(opt.name)}
                    className={`flex items-center rounded-lg text-xs overflow-hidden border transition-all ${
                      hasError
                        ? 'border-rose-500 bg-rose-500/10 shadow-sm shadow-rose-500/20 ring-1 ring-rose-500/40'
                        : isActive
                        ? 'border-brand-500 bg-[#2b2d31] shadow-sm shadow-brand-500/30 ring-1 ring-brand-500/40'
                        : 'border-white/10 bg-[#1e1f22] hover:border-white/20'
                    }`}
                  >
                    {/* Option Tag Badge */}
                    <span className={`font-semibold px-2 py-1 select-none border-r flex items-center gap-1 ${
                      hasError
                        ? 'bg-rose-950/70 text-rose-300 border-rose-500/30'
                        : 'bg-[#111214] text-gray-300 border-white/5'
                    }`}>
                      <span>{opt.name}</span>
                      {opt.required && (
                        <span className={hasError ? 'text-rose-300 text-[10px]' : 'text-rose-400 text-[10px]'}>*</span>
                      )}
                    </span>

                    {/* Editable Value Field */}
                    <input
                      ref={(el) => {
                        optionInputRefs.current[opt.name] = el;
                      }}
                      type="text"
                      value={activeSlash.args[opt.name] ?? ''}
                      onChange={(e) => handleOptionValueChange(opt.name, e.target.value)}
                      onFocus={() => selectOptionToFocus(opt.name)}
                      onKeyDown={(e) => handleOptionKeyDown(e, opt)}
                      placeholder={isActive ? opt.description : ''}
                      className="bg-transparent text-white px-2 py-1 outline-none min-w-[70px] max-w-[220px] text-xs"
                      autoFocus={isActive}
                    />
                  </div>
                );
              })}

              {/* Remaining Available Options Buttons / "+option" (Matching Screenshot 1) */}
              {remainingSlashOptions.length > 0 && (
                <div className="flex items-center gap-1">
                  {remainingSlashOptions.map((opt) => (
                    <button
                      key={opt.name}
                      type="button"
                      onClick={() => selectOptionToFocus(opt.name)}
                      className="text-[11px] text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 px-2 py-0.5 rounded-md transition-colors flex items-center gap-1 cursor-pointer"
                      title={opt.description}
                    >
                      <span className="font-semibold text-brand-300">+{opt.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <textarea
              ref={textareaRef}
              value={content}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder={
                replyingTo
                  ? (replyingTo.author?.display_name || replyingTo.author?.username
                      ? `Respondendo a @${replyingTo.author.display_name || replyingTo.author.username}...`
                      : 'Respondendo à mensagem...')
                  : (placeholder || (channel?.name ? `Conversar em #${channel.name}` : 'Conversar...'))
              }
              rows={1}
              disabled={isUploading}
              className="flex-1 bg-transparent text-gray-100 placeholder-gray-500 text-sm focus:outline-none resize-none py-1.5 min-h-[26px] max-h-40 leading-relaxed font-normal no-scrollbar"
            />
          )}

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

          {/* Voice Record Button or Send Button */}
          {!activeSlash && !content.trim() && !selectedFile ? (
            <button
              type="button"
              onClick={() => setIsRecordingVoice(true)}
              disabled={isUploading}
              className="text-gray-400 hover:text-red-400 hover:bg-red-500/10 p-2 rounded-xl transition-all active:scale-95 flex-shrink-0 cursor-pointer"
              title="Gravar Mensagem de Voz"
            >
              <Mic className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSend}
              disabled={isUploading}
              className="bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-white p-2 rounded-xl transition-all shadow-md shadow-brand-500/20 active:scale-95 flex-shrink-0 cursor-pointer"
              title={activeSlash ? 'Executar Comando (Enter)' : 'Enviar Mensagem'}
            >
              {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <SendHorizontal className="w-4 h-4" />}
            </button>
          )}
        </div>
      )}

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
