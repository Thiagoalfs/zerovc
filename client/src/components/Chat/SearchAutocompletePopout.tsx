import React, { useEffect, useLayoutEffect, useState, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  User as UserIcon,
  Hash,
  Paperclip,
  AtSign,
  Pin,
  Calendar,
  Image,
  Video,
  Music,
  Link2,
  Smile,
} from 'lucide-react';
import { User, Channel } from '../../types';
import { UserAvatar } from '../Common/UserAvatar';

export interface SearchAutocompletePopoutProps {
  isOpen: boolean;
  onClose: () => void;
  query: string;
  onSelectFilter: (newQuery: string) => void;
  onSearchSubmit?: (query: string) => void;
  anchorRef?: React.RefObject<HTMLElement> | null;
  members?: User[];
  channels?: Channel[];
  contextType?: 'guild' | 'dm' | 'dm_group';
}

interface TagOption {
  tag: string;
  title: string;
  hint: string;
  icon: React.ReactNode;
}

const BASE_TAG_OPTIONS: TagOption[] = [
  {
    tag: 'de:',
    title: 'De um usuário específico',
    hint: 'usuário',
    icon: <UserIcon className="w-4 h-4 text-gray-400" />,
  },
  {
    tag: 'tem:',
    title: 'Inclui um tipo específico de dado',
    hint: 'imagem, vídeo, link ou arquivo',
    icon: <Paperclip className="w-4 h-4 text-gray-400" />,
  },
  {
    tag: 'menciona:',
    title: 'Menciona um usuário específico',
    hint: 'usuário',
    icon: <AtSign className="w-4 h-4 text-gray-400" />,
  },
  {
    tag: 'fixado:',
    title: 'Mensagens fixadas',
    hint: 'sim ou não',
    icon: <Pin className="w-4 h-4 text-gray-400" />,
  },
  {
    tag: 'antes:',
    title: 'Antes de uma data',
    hint: 'AAAA-MM-DD',
    icon: <Calendar className="w-4 h-4 text-gray-400" />,
  },
  {
    tag: 'depois:',
    title: 'Depois de uma data',
    hint: 'AAAA-MM-DD',
    icon: <Calendar className="w-4 h-4 text-gray-400" />,
  },
];

const HAS_OPTIONS = [
  { value: 'imagem', label: 'imagem', desc: 'Fotos, GIFs e imagens', icon: <Image className="w-4 h-4 text-gray-400" /> },
  { value: 'vídeo', label: 'vídeo', desc: 'Vídeos MP4, WebM e links de vídeo', icon: <Video className="w-4 h-4 text-gray-400" /> },
  { value: 'áudio', label: 'áudio', desc: 'Mensagens de voz e áudios', icon: <Music className="w-4 h-4 text-gray-400" /> },
  { value: 'arquivo', label: 'arquivo', desc: 'Documentos e anexos em geral', icon: <Paperclip className="w-4 h-4 text-gray-400" /> },
  { value: 'link', label: 'link', desc: 'Mensagens contendo links externos', icon: <Link2 className="w-4 h-4 text-gray-400" /> },
  { value: 'reação', label: 'reação', desc: 'Mensagens com reações de emoji', icon: <Smile className="w-4 h-4 text-gray-400" /> },
];

const PINNED_OPTIONS = [
  { value: 'sim', label: 'sim', desc: 'Somente mensagens fixadas', icon: <Pin className="w-4 h-4 text-gray-400" /> },
  { value: 'não', label: 'não', desc: 'Somente mensagens não fixadas', icon: <Pin className="w-4 h-4 text-gray-500" /> },
];

export const SearchAutocompletePopout: React.FC<SearchAutocompletePopoutProps> = ({
  isOpen,
  onClose,
  query,
  onSelectFilter,
  onSearchSubmit,
  anchorRef,
  members = [],
  channels = [],
  contextType = 'guild',
}) => {
  const [position, setPosition] = useState<{ top: number; right: number; width: number }>({
    top: 52,
    right: 16,
    width: 300,
  });
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const popoutRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Auto-scroll selected item into view
  useEffect(() => {
    if (selectedIndex >= 0 && listRef.current) {
      const el = listRef.current.children[selectedIndex] as HTMLElement;
      el?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  // Calculate fixed-width position below search input (never grows on scroll/focus transition)
  useLayoutEffect(() => {
    if (!isOpen) return;

    const updatePosition = () => {
      const fixedWidth = Math.min(300, window.innerWidth - 24);
      if (anchorRef?.current) {
        const rect = anchorRef.current.getBoundingClientRect();
        const top = rect.bottom + 6;
        const right = Math.max(12, window.innerWidth - rect.right);
        setPosition({ top, right, width: fixedWidth });
      } else {
        setPosition({ top: 52, right: 16, width: fixedWidth });
      }
    };

    updatePosition();
    const handleScroll = (e: Event) => {
      if (popoutRef.current && e.target instanceof Node && popoutRef.current.contains(e.target)) {
        return;
      }
      updatePosition();
    };

    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [isOpen, anchorRef]);

  // Determine active context mode from query trailing tokens
  const activeMode = useMemo(() => {
    const trimmed = query.trimEnd();
    const lastToken = trimmed.split(/\s+/).pop() || '';
    const lower = lastToken.toLowerCase();

    if (lower.startsWith('de:') || lower.startsWith('from:')) {
      const val = lastToken.slice(lastToken.indexOf(':') + 1).replace(/^@/, '').toLowerCase();
      return { type: 'author' as const, filterValue: val, prefix: lastToken.slice(0, lastToken.indexOf(':') + 1) };
    }
    if (lower.startsWith('em:') || lower.startsWith('in:')) {
      const val = lastToken.slice(lastToken.indexOf(':') + 1).replace(/^#/, '').toLowerCase();
      return { type: 'channel' as const, filterValue: val, prefix: lastToken.slice(0, lastToken.indexOf(':') + 1) };
    }
    if (lower.startsWith('tem:') || lower.startsWith('has:')) {
      const val = lastToken.slice(lastToken.indexOf(':') + 1).toLowerCase();
      return { type: 'has' as const, filterValue: val, prefix: lastToken.slice(0, lastToken.indexOf(':') + 1) };
    }
    if (lower.startsWith('menciona:') || lower.startsWith('mentions:')) {
      const val = lastToken.slice(lastToken.indexOf(':') + 1).replace(/^@/, '').toLowerCase();
      return { type: 'mention' as const, filterValue: val, prefix: lastToken.slice(0, lastToken.indexOf(':') + 1) };
    }
    if (lower.startsWith('fixado:') || lower.startsWith('pinned:')) {
      const val = lastToken.slice(lastToken.indexOf(':') + 1).toLowerCase();
      return { type: 'pinned' as const, filterValue: val, prefix: lastToken.slice(0, lastToken.indexOf(':') + 1) };
    }

    return { type: 'root' as const, filterValue: '', prefix: '' };
  }, [query]);

  // Filter tag suggestions based on active context
  const tagOptions = useMemo(() => {
    let list = BASE_TAG_OPTIONS;
    if (contextType === 'guild') {
      const channelOption: TagOption = {
        tag: 'em:',
        title: 'Enviada em um canal específico',
        hint: 'canal',
        icon: <Hash className="w-4 h-4 text-gray-400" />,
      };
      list = [BASE_TAG_OPTIONS[0], channelOption, ...BASE_TAG_OPTIONS.slice(1)];
    }
    return list;
  }, [contextType]);

  // Filter member suggestions
  const filteredMembers = useMemo(() => {
    if (activeMode.type !== 'author' && activeMode.type !== 'mention') return [];
    const list = Array.isArray(members) ? members.filter(Boolean) : [];
    const val = activeMode.filterValue;
    if (!val) return list.slice(0, 10);
    return list
      .filter((m) => {
        if (!m) return false;
        const u = (m.username || '').toLowerCase();
        const d = (m.display_name || '').toLowerCase();
        return u.includes(val) || d.includes(val);
      })
      .slice(0, 10);
  }, [activeMode, members]);

  // Filter channel suggestions
  const filteredChannels = useMemo(() => {
    if (activeMode.type !== 'channel') return [];
    const list = Array.isArray(channels) ? channels.filter(Boolean) : [];
    const textChannels = list.filter((c) => c && c.type === 'text');
    const val = activeMode.filterValue;
    if (!val) return textChannels.slice(0, 10);
    return textChannels.filter((c) => c && c.name && c.name.toLowerCase().includes(val)).slice(0, 10);
  }, [activeMode, channels]);

  // Filter has suggestions
  const filteredHasOptions = useMemo(() => {
    if (activeMode.type !== 'has') return [];
    const val = activeMode.filterValue;
    if (!val) return HAS_OPTIONS;
    return HAS_OPTIONS.filter((o) => o.value.includes(val) || o.label.includes(val));
  }, [activeMode]);

  // Filter pinned suggestions
  const filteredPinnedOptions = useMemo(() => {
    if (activeMode.type !== 'pinned') return [];
    const val = activeMode.filterValue;
    if (!val) return PINNED_OPTIONS;
    return PINNED_OPTIONS.filter((o) => o.value.includes(val) || o.label.includes(val));
  }, [activeMode]);

  // Total items currently selectable
  const currentItemCount = useMemo(() => {
    if (activeMode.type === 'author' || activeMode.type === 'mention') return filteredMembers.length;
    if (activeMode.type === 'channel') return filteredChannels.length;
    if (activeMode.type === 'has') return filteredHasOptions.length;
    if (activeMode.type === 'pinned') return filteredPinnedOptions.length;
    return tagOptions.length;
  }, [activeMode, filteredMembers, filteredChannels, filteredHasOptions, filteredPinnedOptions, tagOptions]);

  // Reset selectedIndex when mode changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [activeMode.type]);

  // Keyboard navigation inside popout
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (currentItemCount > 0 ? (prev + 1) % currentItemCount : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (currentItemCount > 0 ? (prev - 1 + currentItemCount) % currentItemCount : 0));
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'Tab') {
        // Tab autocompletes selected item
        if (currentItemCount > 0) {
          e.preventDefault();
          selectCurrentIndex();
        }
      } else if (e.key === 'Enter') {
        if (activeMode.type !== 'root' && currentItemCount > 0) {
          // When picking a specific user, channel, or modifier, Enter autocompletes the token
          e.preventDefault();
          selectCurrentIndex();
        } else {
          // In root mode or general typing, pressing Enter closes popout and triggers search execution
          onClose();
          if (onSearchSubmit) {
            onSearchSubmit(query);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, currentItemCount, selectedIndex, activeMode, query, onSearchSubmit, onClose]);

  const selectCurrentIndex = () => {
    if (activeMode.type === 'author' || activeMode.type === 'mention') {
      const member = filteredMembers[selectedIndex];
      if (member) insertTagValue(member.username);
    } else if (activeMode.type === 'channel') {
      const channel = filteredChannels[selectedIndex];
      if (channel) insertTagValue(channel.name);
    } else if (activeMode.type === 'has') {
      const opt = filteredHasOptions[selectedIndex];
      if (opt) insertTagValue(opt.value);
    } else if (activeMode.type === 'pinned') {
      const opt = filteredPinnedOptions[selectedIndex];
      if (opt) insertTagValue(opt.value);
    } else {
      const tagOpt = tagOptions[selectedIndex];
      if (tagOpt) appendTag(tagOpt.tag);
    }
  };

  const appendTag = (tag: string) => {
    const trimmed = query.trimEnd();
    const newQuery = trimmed ? `${trimmed} ${tag}` : `${tag}`;
    onSelectFilter(newQuery);
  };

  const insertTagValue = (value: string) => {
    const trimmed = query.trimEnd();
    const tokens = trimmed.split(/\s+/);
    const lastToken = tokens.pop() || '';
    const prefix = lastToken.slice(0, lastToken.indexOf(':') + 1);

    const safeValue = value.includes(' ') ? `"${value}"` : value;
    const completedToken = `${prefix}${safeValue}`;
    const newQuery = [...tokens, completedToken].join(' ') + ' ';
    onSelectFilter(newQuery);
  };

  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <>
      {/* Invisible overlay for outside click */}
      <div
        className="fixed inset-0 z-[99990] bg-transparent"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      />

      {/* Popout Container */}
      <div
        ref={popoutRef}
        style={{
          position: 'fixed',
          top: `${position.top}px`,
          right: `${position.right}px`,
          width: `${position.width}px`,
          boxShadow: '0 12px 32px rgba(0, 0, 0, 0.65), 0 0 0 1px rgba(255, 255, 255, 0.08)',
        }}
        className="z-[99999] bg-[#111214] text-gray-200 border border-[#232428] rounded-xl overflow-hidden flex flex-col font-sans select-none animate-in fade-in zoom-in-95 duration-100 max-h-[380px] p-1.5"
      >
        {/* Minimal Context Label */}
        <div className="px-2.5 py-1.5 text-xs font-semibold text-gray-400">
          {activeMode.type === 'author'
            ? 'De usuário'
            : activeMode.type === 'channel'
            ? 'No canal'
            : activeMode.type === 'has'
            ? 'Tipo de mídia'
            : activeMode.type === 'mention'
            ? 'Menciona'
            : activeMode.type === 'pinned'
            ? 'Mensagens fixadas'
            : 'Filtros'}
        </div>

        {/* Suggestion List Scroll Area */}
        <div ref={listRef} className="overflow-y-auto no-scrollbar space-y-0.5 max-h-[330px]">
          {/* 1. Author / Mentions Suggestions */}
          {(activeMode.type === 'author' || activeMode.type === 'mention') && (
            <>
              {filteredMembers.length === 0 ? (
                <div className="p-4 text-center text-xs text-gray-500">Nenhum membro encontrado.</div>
              ) : (
                filteredMembers.map((member, idx) => {
                  const isSelected = selectedIndex === idx;
                  return (
                    <div
                      key={member.id}
                      onClick={() => insertTagValue(member.username)}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors ${
                        isSelected ? 'bg-white/10 text-white' : 'hover:bg-white/5 text-gray-200'
                      }`}
                    >
                      <UserAvatar user={member} size="sm" showStatus={true} />
                      <div className="flex items-baseline gap-2 min-w-0 flex-1">
                        <span className="text-xs font-medium text-white truncate">
                          {member.display_name || member.username}
                        </span>
                        <span className="text-xs text-gray-400 truncate">
                          @{member.username}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </>
          )}

          {/* 2. Channel Suggestions */}
          {activeMode.type === 'channel' && (
            <>
              {filteredChannels.length === 0 ? (
                <div className="p-4 text-center text-xs text-gray-500">Nenhum canal de texto encontrado.</div>
              ) : (
                filteredChannels.map((channel, idx) => {
                  const isSelected = selectedIndex === idx;
                  return (
                    <div
                      key={channel.id}
                      onClick={() => insertTagValue(channel.name)}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      className={`flex items-center gap-3 px-2.5 py-2 rounded-lg cursor-pointer transition-colors ${
                        isSelected ? 'bg-white/10 text-white' : 'hover:bg-white/5 text-gray-200'
                      }`}
                    >
                      <Hash className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <div className="flex flex-col min-w-0 flex-1">
                        <span className="text-xs font-medium text-white truncate">{channel.name}</span>
                        {channel.topic && (
                          <span className="text-xs text-gray-400 truncate">{channel.topic}</span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </>
          )}

          {/* 3. Has Media Suggestions */}
          {activeMode.type === 'has' && (
            <>
              {filteredHasOptions.map((opt, idx) => {
                const isSelected = selectedIndex === idx;
                return (
                  <div
                    key={opt.value}
                    onClick={() => insertTagValue(opt.value)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={`flex items-center gap-3 px-2.5 py-2 rounded-lg cursor-pointer transition-colors ${
                      isSelected ? 'bg-white/10 text-white' : 'hover:bg-white/5 text-gray-200'
                    }`}
                  >
                    <span className="flex-shrink-0">{opt.icon}</span>
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="text-xs font-medium text-white leading-tight">{opt.label}</span>
                      <span className="text-xs text-gray-400 leading-tight mt-0.5">{opt.desc}</span>
                    </div>
                  </div>
                );
              })}
            </>
          )}

          {/* 4. Pinned Suggestions */}
          {activeMode.type === 'pinned' && (
            <>
              {filteredPinnedOptions.map((opt, idx) => {
                const isSelected = selectedIndex === idx;
                return (
                  <div
                    key={opt.value}
                    onClick={() => insertTagValue(opt.value)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={`flex items-center gap-3 px-2.5 py-2 rounded-lg cursor-pointer transition-colors ${
                      isSelected ? 'bg-white/10 text-white' : 'hover:bg-white/5 text-gray-200'
                    }`}
                  >
                    <span className="flex-shrink-0">{opt.icon}</span>
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="text-xs font-medium text-white leading-tight">{opt.label}</span>
                      <span className="text-xs text-gray-400 leading-tight mt-0.5">{opt.desc}</span>
                    </div>
                  </div>
                );
              })}
            </>
          )}

          {/* 5. Root Mode: Minimal Filter List */}
          {activeMode.type === 'root' && (
            <>
              {tagOptions.map((opt, idx) => {
                const isSelected = selectedIndex === idx;
                return (
                  <div
                    key={opt.tag}
                    onClick={() => appendTag(opt.tag)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={`flex items-center gap-3 px-2.5 py-2 rounded-lg cursor-pointer transition-colors ${
                      isSelected ? 'bg-white/10 text-white' : 'hover:bg-white/5 text-gray-200'
                    }`}
                  >
                    <span className="flex-shrink-0">{opt.icon}</span>
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="text-xs font-medium text-white truncate leading-tight">
                        {opt.title}
                      </span>
                      <span className="text-xs text-gray-400 truncate leading-tight mt-0.5">
                        <span className="font-medium text-gray-300">{opt.tag}</span> {opt.hint}
                      </span>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>
    </>,
    document.body
  );
};
