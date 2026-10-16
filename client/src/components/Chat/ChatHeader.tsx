import React, { useRef, useState } from 'react';
import { Menu, Search, X, Pin, Users } from 'lucide-react';
import { SearchAutocompletePopout } from './SearchAutocompletePopout';
import { User } from '../../types';

export interface ChatHeaderProps {
  // Mobile drawer
  onOpenMobileDrawer?: () => void;

  // Identity / Title section
  icon?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;

  // Custom action buttons (e.g. Call button, Group voice button)
  actions?: React.ReactNode;

  // Pinned messages toggle
  showPinnedOnly?: boolean;
  onTogglePinned?: () => void;

  // Members list toggle
  showMembers?: boolean;
  onToggleMembers?: () => void;

  // Search state & handlers
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onSearchSubmit: (query: string) => void;
  onClearSearch: () => void;
  hasAppliedSearch?: boolean;

  // Search Autocomplete metadata
  searchMembers?: User[];
  searchChannels?: any[];
  searchContextType?: 'guild' | 'dm' | 'dm_group';
  searchPlaceholder?: string;

  // Optional container click for mobile memberlist toggle
  onHeaderClick?: () => void;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  onOpenMobileDrawer,
  icon,
  title,
  subtitle,
  actions,
  showPinnedOnly,
  onTogglePinned,
  showMembers,
  onToggleMembers,
  searchQuery,
  onSearchChange,
  onSearchSubmit,
  onClearSearch,
  hasAppliedSearch = false,
  searchMembers = [],
  searchChannels = [],
  searchContextType = 'guild',
  searchPlaceholder = 'Buscar...',
  onHeaderClick,
}) => {
  const [isSearchAutocompleteOpen, setIsSearchAutocompleteOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  return (
    <div
      onClick={() => {
        onHeaderClick?.();
      }}
      className="h-14 md:h-12 border-b border-black/20 md:border-white/5 px-3 md:px-4 flex items-center justify-between shadow-sm select-none z-20 flex-shrink-0 bg-background-dark/95 backdrop-blur-sm sticky top-0 w-full cursor-default"
    >
      {/* Left side: Mobile drawer toggle & identity */}
      <div className="flex items-center gap-2.5 md:gap-2 truncate flex-1 min-w-0 mr-2">
        {onOpenMobileDrawer && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenMobileDrawer();
            }}
            className="md:hidden text-gray-400 hover:text-white p-1.5 -ml-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer flex-shrink-0"
            title="Abrir Menu"
          >
            <Menu className="w-5 h-5 md:w-6 md:h-6" />
          </button>
        )}

        {icon && <div className="flex-shrink-0 flex items-center">{icon}</div>}

        <div className="flex items-center gap-2 truncate min-w-0">
          <div className="flex items-baseline gap-1.5 truncate min-w-0">{title}</div>
          {subtitle && (
            <>
              <div className="hidden md:block w-[1px] h-3.5 bg-white/10 mx-1 flex-shrink-0" />
              <div className="hidden md:flex items-center text-xs text-gray-400 truncate max-w-sm">
                {subtitle}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Right side: Actions, Pins, Members, Search */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex items-center gap-1.5 md:gap-2 flex-shrink-0 relative"
      >
        {actions}

        {/* Pinned Messages Toggle */}
        {onTogglePinned && (
          <button
            type="button"
            onClick={onTogglePinned}
            className={`p-2 md:p-1.5 rounded-lg transition-colors cursor-pointer ${
              showPinnedOnly
                ? 'text-amber-400 bg-amber-400/15'
                : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
            }`}
            title={showPinnedOnly ? 'Mostrar todas as mensagens' : 'Mensagens Fixadas'}
          >
            <Pin className="w-4 h-4 md:w-5 md:h-5" />
          </button>
        )}

        {/* Member List Toggle */}
        {onToggleMembers && (
          <button
            type="button"
            onClick={onToggleMembers}
            className={`p-2 md:p-1.5 rounded-lg transition-colors cursor-pointer ${
              showMembers
                ? 'text-brand-400 bg-white/10'
                : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
            }`}
            title="Lista de Membros"
          >
            <Users className="w-4 h-4 md:w-5 md:h-5" />
          </button>
        )}

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
              onSearchChange(e.target.value);
              if (!isSearchAutocompleteOpen) setIsSearchAutocompleteOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                onSearchSubmit(searchQuery.trim());
                setIsSearchAutocompleteOpen(false);
              }
            }}
            onFocus={() => setIsSearchAutocompleteOpen(true)}
            placeholder={searchPlaceholder}
            className="bg-transparent text-gray-100 placeholder-gray-500 focus:outline-none w-full min-w-0 text-xs"
          />
          {(searchQuery || hasAppliedSearch) && (
            <button
              type="button"
              onClick={() => {
                onClearSearch();
                setIsSearchAutocompleteOpen(false);
              }}
              className="p-0.5 text-gray-400 hover:text-white flex-shrink-0 cursor-pointer"
              title="Limpar busca"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Floating Search Autocomplete Popout */}
        <SearchAutocompletePopout
          isOpen={isSearchAutocompleteOpen}
          onClose={() => setIsSearchAutocompleteOpen(false)}
          query={searchQuery}
          onSelectFilter={(newQ) => {
            onSearchChange(newQ);
            searchInputRef.current?.focus();
          }}
          onSearchSubmit={(q) => {
            onSearchSubmit(q.trim());
          }}
          anchorRef={searchContainerRef}
          members={searchMembers}
          channels={searchChannels}
          contextType={searchContextType}
        />
      </div>
    </div>
  );
};
