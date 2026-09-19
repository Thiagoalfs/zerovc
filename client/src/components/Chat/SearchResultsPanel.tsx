import React, { useState, useMemo, useEffect } from 'react';
import {
  X,
  ArrowUpDown,
  Filter,
  ChevronLeft,
  ChevronRight,
  Hash,
  MessageSquare,
  Pin,
  FileText,
  CornerDownRight,
  Sparkles,
  ExternalLink,
} from 'lucide-react';
import { BaseMessage, User, Channel } from '../../types';
import { UserAvatar } from '../Common/UserAvatar';
import {
  ParsedSearchQuery,
  SearchSortOption,
  sortFilteredMessages,
} from '../../utils/searchFilters';
import { formatAssetUrl } from '../../lib/api';

const PAGE_SIZE = 25;

export interface SearchResultsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  rawQuery: string;
  parsedQuery: ParsedSearchQuery;
  messages: BaseMessage[];
  contextName?: string;
  contextCategory?: string;
  contextType?: 'guild' | 'dm' | 'dm_group';
  onJumpToMessage?: (messageId: string) => void;
  isLoading?: boolean;
}

export const SearchResultsPanel: React.FC<SearchResultsPanelProps> = ({
  isOpen,
  onClose,
  rawQuery,
  parsedQuery,
  messages,
  contextName = 'chat',
  contextCategory,
  contextType = 'guild',
  onJumpToMessage,
  isLoading = false,
}) => {
  const [sortOption, setSortOption] = useState<SearchSortOption>('newest');
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  // Reset to page 1 whenever query changes
  useEffect(() => {
    setCurrentPage(1);
  }, [rawQuery]);

  // Sort messages
  const sortedMessages = useMemo(() => {
    return sortFilteredMessages(messages, sortOption, parsedQuery);
  }, [messages, sortOption, parsedQuery]);

  const totalResults = sortedMessages.length;
  const totalPages = Math.max(1, Math.ceil(totalResults / PAGE_SIZE));

  // Current page slice
  const paginatedMessages = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return sortedMessages.slice(start, start + PAGE_SIZE);
  }, [sortedMessages, currentPage]);

  // Count active filter tags
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (parsedQuery.fromAuthors.length > 0) count += parsedQuery.fromAuthors.length;
    if (parsedQuery.inChannels.length > 0) count += parsedQuery.inChannels.length;
    if (parsedQuery.hasTypes.length > 0) count += parsedQuery.hasTypes.length;
    if (parsedQuery.mentionsUsers.length > 0) count += parsedQuery.mentionsUsers.length;
    if (parsedQuery.isPinned !== null) count += 1;
    if (parsedQuery.beforeDate !== null) count += 1;
    if (parsedQuery.afterDate !== null) count += 1;
    if (parsedQuery.duringDate !== null) count += 1;
    return count;
  }, [parsedQuery]);

  // Format date helper (Discord style)
  const formatResultDate = (dateStr: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';

    const now = new Date();
    const isToday =
      d.getDate() === now.getDate() &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear();

    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday =
      d.getDate() === yesterday.getDate() &&
      d.getMonth() === yesterday.getMonth() &&
      d.getFullYear() === yesterday.getFullYear();

    const timeStr = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    if (isToday) return `Hoje às ${timeStr}`;
    if (isYesterday) return `Ontem às ${timeStr}`;
    return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })} às ${timeStr}`;
  };

  // Highlight search freeText inside message content
  const renderHighlightedContent = (content: string) => {
    if (!content) return null;
    const term = parsedQuery.freeText.trim();
    if (!term) return <span>{content}</span>;

    const regex = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = content.split(regex);

    return (
      <span>
        {parts.map((part, i) =>
          regex.test(part) ? (
            <mark key={i} className="bg-brand-500/30 text-brand-200 px-0.5 rounded font-medium">
              {part}
            </mark>
          ) : (
            <span key={i}>{part}</span>
          )
        )}
      </span>
    );
  };

  // Generate pagination page numbers
  const paginationItems = useMemo(() => {
    const items: (number | string)[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) items.push(i);
    } else {
      items.push(1);
      if (currentPage > 3) items.push('...');

      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);

      for (let i = start; i <= end; i++) {
        if (!items.includes(i)) items.push(i);
      }

      if (currentPage < totalPages - 2) items.push('...');
      if (!items.includes(totalPages)) items.push(totalPages);
    }
    return items;
  }, [currentPage, totalPages]);

  if (!isOpen) return null;

  const sortLabels: Record<SearchSortOption, string> = {
    newest: 'Mais recentes',
    oldest: 'Mais antigas',
    relevant: 'Mais relevantes',
  };

  return (
    <aside
      className="w-full sm:w-80 md:w-96 lg:w-[420px] bg-background-darkest/95 border-l border-white/5 flex flex-col h-full select-none z-30 flex-shrink-0 animate-in fade-in duration-150"
      aria-label="Resultados da Busca"
    >
      {/* 1. Header Bar */}
      <div className="p-3.5 border-b border-white/5 flex items-center justify-between gap-2 bg-background-darkest/90">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-sm font-bold text-white tracking-wide truncate">
            {totalResults.toLocaleString('pt-BR')} Resultados
          </span>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* Active Filters Pill */}
          {activeFiltersCount > 0 && (
            <div
              className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-brand-500/15 border border-brand-500/30 text-brand-300 text-xs font-semibold"
              title="Filtros ativos"
            >
              <Filter className="w-3 h-3" />
              <span>Filtros ({activeFiltersCount})</span>
            </div>
          )}

          {/* Sort Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsSortMenuOpen((prev) => !prev)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white text-xs font-medium border border-white/5 transition cursor-pointer"
              title="Mudar ordenação"
            >
              <ArrowUpDown className="w-3 h-3 text-gray-400" />
              <span>{sortLabels[sortOption]}</span>
            </button>

            {isSortMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setIsSortMenuOpen(false)}
                />
                <div className="absolute right-0 top-full mt-1.5 w-40 bg-background-dark border border-white/10 rounded-lg shadow-2xl py-1 z-50 text-xs">
                  {(['newest', 'oldest', 'relevant'] as SearchSortOption[]).map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => {
                        setSortOption(opt);
                        setIsSortMenuOpen(false);
                      }}
                      className={`w-full text-left px-3 py-1.5 flex items-center justify-between transition cursor-pointer ${
                        sortOption === opt
                          ? 'bg-brand-500/20 text-brand-300 font-semibold'
                          : 'text-gray-300 hover:bg-white/5 hover:text-white'
                      }`}
                    >
                      <span>{sortLabels[opt]}</span>
                      {sortOption === opt && <div className="w-1.5 h-1.5 rounded-full bg-brand-400" />}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Close Panel Button */}
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-gray-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
            title="Fechar resultados de busca"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 2. Context Indicator Header */}
      <div className="px-4 py-2 bg-black/20 border-b border-white/5 flex items-center justify-between text-xs text-gray-400">
        <div className="flex items-center gap-1.5 truncate">
          {contextType === 'guild' ? (
            <Hash className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
          ) : (
            <MessageSquare className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
          )}
          <span className="font-semibold text-gray-200 truncate">{contextName}</span>
        </div>
        {contextCategory && (
          <span className="text-[11px] text-gray-500 truncate">{contextCategory}</span>
        )}
      </div>

      {/* 3. Messages List Area */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5 no-scrollbar">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-2">
            <div className="w-5 h-5 border-2 border-brand-400 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs">Buscando mensagens...</span>
          </div>
        ) : paginatedMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center px-4 text-gray-400 gap-3 select-none">
            <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-gray-400">
              <Sparkles className="w-6 h-6 opacity-40" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-300">Nenhum resultado encontrado</p>
              <p className="text-xs text-gray-500 mt-1 max-w-[240px]">
                Tente buscar com outros termos ou remover alguns filtros para expandir os resultados.
              </p>
            </div>
          </div>
        ) : (
          paginatedMessages.map((msg) => {
            const author = msg.author;
            const authorName = author?.display_name || author?.username || 'Usuário';

            return (
              <div
                key={msg.id}
                onClick={() => onJumpToMessage?.(msg.id)}
                className="group relative bg-[#18191c]/90 hover:bg-[#1e1f22] border border-white/5 hover:border-brand-500/40 rounded-xl p-3.5 transition duration-150 cursor-pointer shadow-sm"
              >
                {/* Reply Indicator if replying */}
                {msg.reply_to && (
                  <div className="flex items-center gap-1.5 text-[11px] text-gray-400 mb-1.5 pl-1">
                    <CornerDownRight className="w-3 h-3 text-gray-500 flex-shrink-0" />
                    <span className="italic truncate">
                      {msg.reply_to.author?.display_name || msg.reply_to.author?.username
                        ? `Respondendo a @${msg.reply_to.author.display_name || msg.reply_to.author.username}`
                        : 'Mensagem citada'}
                    </span>
                  </div>
                )}

                {/* Author row */}
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <UserAvatar user={author} size="sm" />
                    <span className="text-xs font-semibold text-white group-hover:text-brand-300 transition truncate">
                      {authorName}
                    </span>
                    {msg.is_pinned && (
                      <span title="Mensagem fixada">
                        <Pin className="w-3 h-3 text-amber-400 flex-shrink-0" />
                      </span>
                    )}
                  </div>

                  <span className="text-[10px] text-gray-500 flex-shrink-0">
                    {formatResultDate(msg.created_at)}
                  </span>
                </div>

                {/* Message Content */}
                <div className="text-xs text-gray-200 leading-relaxed break-words pl-8">
                  {renderHighlightedContent(msg.content)}
                </div>

                {/* Attachments preview */}
                {msg.attachments && msg.attachments.length > 0 && (
                  <div className="pl-8 mt-2 flex flex-wrap gap-1.5">
                    {msg.attachments.map((att, idx) => {
                      const isImg =
                        att.type?.startsWith('image/') ||
                        /\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i.test(att.url || att.filename || '');

                      if (isImg && att.url) {
                        return (
                          <div
                            key={idx}
                            className="w-16 h-16 rounded-lg overflow-hidden border border-white/10 bg-black/40 flex-shrink-0"
                          >
                            <img
                              src={formatAssetUrl(att.url)}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          </div>
                        );
                      }

                      return (
                        <div
                          key={idx}
                          className="flex items-center gap-1.5 px-2 py-1 rounded bg-black/30 border border-white/5 text-[10px] text-gray-300 truncate max-w-full"
                        >
                          <FileText className="w-3 h-3 text-gray-400 flex-shrink-0" />
                          <span className="truncate">{att.filename || 'Anexo'}</span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Jump to message hover indicator */}
                <div className="absolute right-3 bottom-3 opacity-0 group-hover:opacity-100 transition duration-150 flex items-center gap-1 text-[11px] text-brand-400 font-medium bg-background-dark/95 px-2 py-0.5 rounded border border-brand-500/30">
                  <span>Pular</span>
                  <ExternalLink className="w-3 h-3" />
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 4. Pagination Footer Bar */}
      {totalPages > 1 && (
        <div className="p-3 border-t border-white/5 bg-background-darkest/95 flex items-center justify-between gap-1 text-xs">
          <button
            type="button"
            disabled={currentPage <= 1}
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-gray-300 hover:text-white hover:bg-white/5 disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed transition cursor-pointer"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Anterior</span>
          </button>

          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
            {paginationItems.map((item, idx) => {
              if (item === '...') {
                return (
                  <span key={`dots-${idx}`} className="px-1 text-gray-500 text-xs select-none">
                    ...
                  </span>
                );
              }

              const pageNum = Number(item);
              const isActive = pageNum === currentPage;

              return (
                <button
                  key={pageNum}
                  type="button"
                  onClick={() => setCurrentPage(pageNum)}
                  className={`w-7 h-7 rounded-full text-xs font-semibold flex items-center justify-center transition cursor-pointer ${
                    isActive
                      ? 'bg-brand-500 text-white shadow-md'
                      : 'text-gray-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            disabled={currentPage >= totalPages}
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-gray-300 hover:text-white hover:bg-white/5 disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed transition cursor-pointer"
          >
            <span className="hidden sm:inline">Próximo</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </aside>
  );
};
