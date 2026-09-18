import React, { useEffect, useState, useRef, useMemo } from 'react';
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
  Sparkles,
  ChevronRight,
} from 'lucide-react';
import { User, Channel } from '../../types';
import { UserAvatar } from '../Common/UserAvatar';

export interface SearchAutocompletePopoutProps {
  isOpen: boolean;
  onClose: () => void;
  query: string;
  onSelectFilter: (newQuery: string) => void;
  anchorRef?: React.RefObject<HTMLElement> | null;
  members?: User[];
  channels?: Channel[];
  contextType?: 'guild' | 'dm' | 'dm_group';
}

interface TagOption {
  tag: string;
  label: string;
  description: string;
  example: string;
  icon: React.ReactNode;
  badgeColor: string;
}

const BASE_TAG_OPTIONS: TagOption[] = [
  {
    tag: 'de:',
    label: 'de: usuário',
    description: 'Buscar mensagens de um usuário específico',
    example: 'de:@usuário',
    icon: <UserIcon className="w-4 h-4 text-indigo-400" />,
    badgeColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
  },
  {
    tag: 'tem:',
    label: 'tem: tipo',
    description: 'Buscar mensagens contendo mídias ou anexos',
    example: 'tem:imagem, vídeo, link, arquivo, áudio',
    icon: <Paperclip className="w-4 h-4 text-emerald-400" />,
    badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  },
  {
    tag: 'menciona:',
    label: 'menciona: usuário',
    description: 'Buscar mensagens que mencionam alguém',
    example: 'menciona:@usuário',
    icon: <AtSign className="w-4 h-4 text-purple-400" />,
    badgeColor: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  },
  {
    tag: 'fixado:',
    label: 'fixado: sim/não',
    description: 'Buscar mensagens fixadas no chat',
    example: 'fixado:sim',
    icon: <Pin className="w-4 h-4 text-amber-400" />,
    badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  },
  {
    tag: 'antes:',
    label: 'antes: AAAA-MM-DD',
    description: 'Mensagens anteriores a uma data',
    example: 'antes:2026-09-18',
    icon: <Calendar className="w-4 h-4 text-rose-400" />,
    badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
  },
  {
    tag: 'depois:',
    label: 'depois: AAAA-MM-DD',
    description: 'Mensagens posteriores a uma data',
    example: 'depois:2026-09-01',
    icon: <Calendar className="w-4 h-4 text-sky-400" />,
    badgeColor: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
  },
];

const HAS_OPTIONS = [
  { value: 'imagem', label: 'imagem', desc: 'Fotos, GIFs e imagens', icon: <Image className="w-4 h-4 text-blue-400" /> },
  { value: 'vídeo', label: 'vídeo', desc: 'Vídeos MP4, WebM e links de vídeo', icon: <Video className="w-4 h-4 text-red-400" /> },
  { value: 'áudio', label: 'áudio', desc: 'Mensagens de voz e áudios', icon: <Music className="w-4 h-4 text-amber-400" /> },
  { value: 'arquivo', label: 'arquivo', desc: 'Documentos e anexos em geral', icon: <Paperclip className="w-4 h-4 text-emerald-400" /> },
  { value: 'link', label: 'link', desc: 'Mensagens contendo links externos', icon: <Link2 className="w-4 h-4 text-cyan-400" /> },
  { value: 'reação', label: 'reação', desc: 'Mensagens com reações de emoji', icon: <Smile className="w-4 h-4 text-yellow-400" /> },
];

const PINNED_OPTIONS = [
  { value: 'sim', label: 'sim', desc: 'Somente mensagens fixadas', icon: <Pin className="w-4 h-4 text-amber-400" /> },
  { value: 'não', label: 'não', desc: 'Somente mensagens não fixadas', icon: <Pin className="w-4 h-4 text-gray-400 opacity-50" /> },
];

export const SearchAutocompletePopout: React.FC<SearchAutocompletePopoutProps> = ({
  isOpen,
  onClose,
  query,
  onSelectFilter,
  anchorRef,
  members = [],
  channels = [],
  contextType = 'guild',
}) => {
  const [position, setPosition] = useState<{ top: number; right: number; width: number }>({
    top: 52,
    right: 16,
    width: 340,
  });
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const popoutRef = useRef<HTMLDivElement>(null);

  // Calculate dynamic position below search input
  useEffect(() => {
    if (!isOpen) return;

    const updatePosition = () => {
      if (anchorRef?.current) {
        const rect = anchorRef.current.getBoundingClientRect();
        const popoutWidth = Math.max(340, Math.min(420, rect.width + 120));
        const top = rect.bottom + 6;
        const right = Math.max(12, window.innerWidth - rect.right);
        setPosition({ top, right, width: popoutWidth });
      } else {
        setPosition({ top: 52, right: 16, width: 340 });
      }
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
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
        label: 'em: canal',
        description: 'Buscar em um canal de texto específico',
        example: 'em:#geral',
        icon: <Hash className="w-4 h-4 text-cyan-400" />,
        badgeColor: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
      };
      list = [BASE_TAG_OPTIONS[0], channelOption, ...BASE_TAG_OPTIONS.slice(1)];
    }
    return list;
  }, [contextType]);

  // Filter member suggestions
  const filteredMembers = useMemo(() => {
    if (activeMode.type !== 'author' && activeMode.type !== 'mention') return [];
    const val = activeMode.filterValue;
    if (!val) return members.slice(0, 10);
    return members
      .filter((m) => {
        const u = (m.username || '').toLowerCase();
        const d = (m.display_name || '').toLowerCase();
        return u.includes(val) || d.includes(val);
      })
      .slice(0, 10);
  }, [activeMode, members]);

  // Filter channel suggestions
  const filteredChannels = useMemo(() => {
    if (activeMode.type !== 'channel') return [];
    const textChannels = channels.filter((c) => c.type === 'text');
    const val = activeMode.filterValue;
    if (!val) return textChannels.slice(0, 10);
    return textChannels.filter((c) => c.name.toLowerCase().includes(val)).slice(0, 10);
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
      } else if (e.key === 'Tab' || e.key === 'Enter') {
        // Autocomplete selected item
        if (currentItemCount > 0) {
          e.preventDefault();
          selectCurrentIndex();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, currentItemCount, selectedIndex, activeMode]);

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
          boxShadow: '0 16px 48px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.08)',
        }}
        className="z-[99999] bg-[#111214] text-gray-200 border border-[#232428] rounded-xl overflow-hidden flex flex-col font-sans select-none animate-in fade-in zoom-in-95 duration-100 max-h-[380px]"
      >
        {/* Active Context Header */}
        <div className="bg-[#0b0c0d] px-3.5 py-2.5 border-b border-[#1f2023] flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-bold text-gray-300 uppercase tracking-wider font-mono">
            <Sparkles className="w-3.5 h-3.5 text-brand-400" />
            <span>
              {activeMode.type === 'author'
                ? 'Filtrar por Autor'
                : activeMode.type === 'channel'
                ? 'Filtrar por Canal'
                : activeMode.type === 'has'
                ? 'Filtrar por Tipo de Mídia'
                : activeMode.type === 'mention'
                ? 'Filtrar por Menção'
                : activeMode.type === 'pinned'
                ? 'Filtrar por Mensagens Fixadas'
                : 'Opções de Busca'}
            </span>
          </div>
          <span className="text-[10px] text-gray-500 font-mono">TAB / ENTER para aplicar</span>
        </div>

        {/* Suggestion List Scroll Area */}
        <div className="p-2 overflow-y-auto no-scrollbar space-y-1 max-h-[320px]">
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
                        isSelected ? 'bg-brand-500 text-white' : 'hover:bg-white/5 text-gray-200'
                      }`}
                    >
                      <UserAvatar user={member} size="sm" showStatus={true} />
                      <div className="flex flex-col min-w-0 flex-1">
                        <span className="text-xs font-bold truncate leading-tight">
                          {member.display_name || member.username}
                        </span>
                        <span className={`text-[10px] truncate leading-tight ${isSelected ? 'text-white/80' : 'text-gray-400'}`}>
                          @{member.username}
                        </span>
                      </div>
                      <ChevronRight className={`w-3.5 h-3.5 opacity-60 ${isSelected ? 'text-white' : 'text-gray-500'}`} />
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
                      className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer transition-colors ${
                        isSelected ? 'bg-brand-500 text-white' : 'hover:bg-white/5 text-gray-200'
                      }`}
                    >
                      <div className="w-6 h-6 rounded-md bg-white/5 flex items-center justify-center flex-shrink-0">
                        <Hash className="w-3.5 h-3.5 text-cyan-400" />
                      </div>
                      <div className="flex flex-col min-w-0 flex-1">
                        <span className="text-xs font-bold truncate leading-tight">#{channel.name}</span>
                        {channel.topic && (
                          <span className={`text-[10px] truncate leading-tight mt-0.5 ${isSelected ? 'text-white/80' : 'text-gray-400'}`}>
                            {channel.topic}
                          </span>
                        )}
                      </div>
                      <ChevronRight className={`w-3.5 h-3.5 opacity-60 ${isSelected ? 'text-white' : 'text-gray-500'}`} />
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
                    className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer transition-colors ${
                      isSelected ? 'bg-brand-500 text-white' : 'hover:bg-white/5 text-gray-200'
                    }`}
                  >
                    <div className="w-6 h-6 rounded-md bg-white/5 flex items-center justify-center flex-shrink-0">
                      {opt.icon}
                    </div>
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="text-xs font-bold leading-tight font-mono">{opt.label}</span>
                      <span className={`text-[10px] leading-tight mt-0.5 ${isSelected ? 'text-white/80' : 'text-gray-400'}`}>
                        {opt.desc}
                      </span>
                    </div>
                    <ChevronRight className={`w-3.5 h-3.5 opacity-60 ${isSelected ? 'text-white' : 'text-gray-500'}`} />
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
                    className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer transition-colors ${
                      isSelected ? 'bg-brand-500 text-white' : 'hover:bg-white/5 text-gray-200'
                    }`}
                  >
                    <div className="w-6 h-6 rounded-md bg-white/5 flex items-center justify-center flex-shrink-0">
                      {opt.icon}
                    </div>
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="text-xs font-bold leading-tight font-mono">{opt.label}</span>
                      <span className={`text-[10px] leading-tight mt-0.5 ${isSelected ? 'text-white/80' : 'text-gray-400'}`}>
                        {opt.desc}
                      </span>
                    </div>
                    <ChevronRight className={`w-3.5 h-3.5 opacity-60 ${isSelected ? 'text-white' : 'text-gray-500'}`} />
                  </div>
                );
              })}
            </>
          )}

          {/* 5. Root Mode: Available Tag Badges */}
          {activeMode.type === 'root' && (
            <>
              <div className="px-2 py-1 text-[11px] font-semibold text-gray-400">
                Filtre sua busca digitando ou clicando em uma das tags:
              </div>
              {tagOptions.map((opt, idx) => {
                const isSelected = selectedIndex === idx;
                return (
                  <div
                    key={opt.tag}
                    onClick={() => appendTag(opt.tag)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer transition-colors group ${
                      isSelected ? 'bg-brand-500 text-white' : 'hover:bg-white/5 text-gray-200'
                    }`}
                  >
                    <div className="w-6 h-6 rounded-md bg-white/5 flex items-center justify-center flex-shrink-0">
                      {opt.icon}
                    </div>

                    <div className="flex flex-col min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[11px] font-bold font-mono px-1.5 py-0.5 rounded border ${
                            isSelected ? 'bg-white/20 text-white border-white/40' : opt.badgeColor
                          }`}
                        >
                          {opt.tag}
                        </span>
                        <span className="text-xs font-bold truncate leading-tight">{opt.label}</span>
                      </div>
                      <span className={`text-[10px] truncate leading-tight mt-0.5 ${isSelected ? 'text-white/80' : 'text-gray-400'}`}>
                        {opt.description}
                      </span>
                    </div>

                    <ChevronRight className={`w-3.5 h-3.5 opacity-60 ${isSelected ? 'text-white' : 'text-gray-500'}`} />
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
