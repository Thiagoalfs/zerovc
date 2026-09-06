import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Smile,
  Film,
  Search,
  Star,
  Sparkles,
  TrendingUp,
  X,
  Check,
  Loader2,
} from 'lucide-react';
import { useFavoriteGifStore } from '../../stores/favoriteGifStore';
import { useSettingsStore } from '../../stores/settingsStore';

interface EmojiAndGifPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectEmoji: (emoji: string) => void;
  onSelectGif: (gifUrl: string) => void;
  positionClass?: string;
}

const COMMON_EMOJIS = [
  '😀', '😂', '🤣', '😍', '🔥', '👍', '❤️', '🎉', '😎', '🚀',
  '👀', '✨', '💀', '💯', '🤔', '🙌', '🥺', '😭', '🥳', '👏',
  '💖', '🌟', '🤯', '😴', '😴', '💪', '🤝', '🍕', '🍻', '🎮',
  '🍿', '🎧', '⚡', '🌈', '💎', '👑', '👋', '🙏', '🫡', '💜'
];

const CURATED_GIFS: Array<{ url: string; preview: string; title: string; category: string }> = [
  {
    url: 'https://media.giphy.com/media/ICOgUNjpvO0PC/giphy.gif',
    preview: 'https://media.giphy.com/media/ICOgUNjpvO0PC/200w.gif',
    title: 'Cat Hello',
    category: 'Gatos',
  },
  {
    url: 'https://media.giphy.com/media/3o7TKSjRrfIPjeiVyM/giphy.gif',
    preview: 'https://media.giphy.com/media/3o7TKSjRrfIPjeiVyM/200w.gif',
    title: 'Party Dance',
    category: 'Festa',
  },
  {
    url: 'https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif',
    preview: 'https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/200w.gif',
    title: 'Gaming Win',
    category: 'Jogos',
  },
  {
    url: 'https://media.giphy.com/media/26ufdipQqU2lhNA4g/giphy.gif',
    preview: 'https://media.giphy.com/media/26ufdipQqU2lhNA4g/200w.gif',
    title: 'Mind Blown',
    category: 'Reação',
  },
  {
    url: 'https://media.giphy.com/media/11ISwbgCxEzMyY/giphy.gif',
    preview: 'https://media.giphy.com/media/11ISwbgCxEzMyY/200w.gif',
    title: 'Popcorn Chill',
    category: 'Humor',
  },
  {
    url: 'https://media.giphy.com/media/l41lI4bYmcsPJX9Go/giphy.gif',
    preview: 'https://media.giphy.com/media/l41lI4bYmcsPJX9Go/200w.gif',
    title: 'Excited Yay',
    category: 'Festa',
  },
  {
    url: 'https://media.giphy.com/media/xT9IgG50Fb7Mi0prBC/giphy.gif',
    preview: 'https://media.giphy.com/media/xT9IgG50Fb7Mi0prBC/200w.gif',
    title: 'Love Heart',
    category: 'Amor',
  },
  {
    url: 'https://media.giphy.com/media/artj92V8o75VPL7AeQ/giphy.gif',
    preview: 'https://media.giphy.com/media/artj92V8o75VPL7AeQ/200w.gif',
    title: 'Dancing Dog',
    category: 'Humor',
  },
];

const GIF_CATEGORIES = ['Todos', 'Favoritos', 'Em Alta', 'Humor', 'Jogos', 'Amor', 'Reação', 'Festa'];

const MIN_PICKER_WIDTH = 384; // Standard w-96
const MAX_PICKER_WIDTH = 768; // 2x standard size

const GifPickerItem: React.FC<{
  gif: { url: string; preview: string; title: string };
  autoplayGifs: boolean;
  onSelect: (url: string) => void;
}> = ({ gif, autoplayGifs, onSelect }) => {
  const { isFavorited, toggleFavorite } = useFavoriteGifStore();
  const favorited = isFavorited(gif.url);
  const [isHovered, setIsHovered] = useState(false);
  const [frozenSrc, setFrozenSrc] = useState<string | null>(null);

  const shouldPlay = autoplayGifs || isHovered;

  useEffect(() => {
    if (autoplayGifs) {
      setFrozenSrc(null);
      return;
    }

    let isMounted = true;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = gif.preview || gif.url;

    img.onload = () => {
      if (!isMounted) return;
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || 200;
        canvas.height = img.naturalHeight || 120;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          setFrozenSrc(canvas.toDataURL('image/png'));
        }
      } catch {}
    };

    return () => {
      isMounted = false;
    };
  }, [gif.preview, gif.url, autoplayGifs]);

  const activeSrc = shouldPlay ? (gif.preview || gif.url) : (frozenSrc || gif.preview || gif.url);

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="relative rounded-2xl overflow-hidden group bg-background-dark border border-white/5 aspect-video cursor-pointer"
      onClick={() => onSelect(gif.url)}
    >
      <img
        src={activeSrc}
        alt={gif.title}
        loading="lazy"
        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
      />

      {!autoplayGifs && !isHovered && (
        <div className="absolute bottom-1 left-1.5 bg-black/70 text-white/90 px-1.5 py-0.5 rounded-md text-[9px] font-bold tracking-wider uppercase border border-white/10">
          GIF
        </div>
      )}

      {/* Favorite Star Button */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          toggleFavorite(gif.url, gif.preview, gif.title);
        }}
        className={`absolute top-1.5 right-1.5 p-1 rounded-lg backdrop-blur-md transition-all shadow-md ${
          favorited
            ? 'bg-amber-500 text-white'
            : 'bg-black/60 text-white/70 hover:text-white opacity-0 group-hover:opacity-100 hover:bg-black/90'
        }`}
        title={favorited ? 'Remover dos favoritos' : 'Favoritar GIF'}
      >
        <Star className={`w-3.5 h-3.5 ${favorited ? 'fill-current' : ''}`} />
      </button>
    </div>
  );
};

export const EmojiAndGifPicker: React.FC<EmojiAndGifPickerProps> = ({
  isOpen,
  onClose,
  onSelectEmoji,
  onSelectGif,
  positionClass = 'bottom-16 right-4',
}) => {
  const autoplayGifs = useSettingsStore((s) => s.autoplayGifs);
  const [activeTab, setActiveTab] = useState<'emoji' | 'gif'>('emoji');
  const [activeCategory, setActiveCategory] = useState<string>('Todos');
  const [gifSearch, setGifSearch] = useState('');
  const [klipyGifs, setKlipyGifs] = useState<Array<{ url: string; preview: string; title: string }>>([]);
  const [isLoadingGifs, setIsLoadingGifs] = useState(false);

  // Horizontal Resize State (Desktop only)
  const [pickerWidth, setPickerWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('emoji_picker_width');
      if (saved) {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed) && parsed >= MIN_PICKER_WIDTH && parsed <= MAX_PICKER_WIDTH) {
          return parsed;
        }
      }
    } catch {}
    return MIN_PICKER_WIDTH;
  });
  const [isResizing, setIsResizing] = useState(false);

  const handleResizeStart = (e: React.MouseEvent) => {
    if (window.innerWidth < 640) return; // Do not allow on mobile

    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);

    const startX = e.clientX;
    const startWidth = pickerWidth;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      // Anchored to the right: dragging left (lower X) increases width
      const deltaX = startX - moveEvent.clientX;
      const newWidth = Math.min(MAX_PICKER_WIDTH, Math.max(MIN_PICKER_WIDTH, startWidth + deltaX));
      setPickerWidth(newWidth);
      try {
        localStorage.setItem('emoji_picker_width', newWidth.toString());
      } catch {}
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const { favoriteGifs, isFavorited, toggleFavorite, fetchFavorites, hasLoaded } = useFavoriteGifStore();

  useEffect(() => {
    if (isOpen && !hasLoaded) {
      fetchFavorites();
    }
  }, [isOpen, hasLoaded, fetchFavorites]);

  // Klipy API fetch
  useEffect(() => {
    if (activeTab !== 'gif') return;
    if (activeCategory === 'Favoritos') return;

    const apiKey = (import.meta as any).env?.VITE_KLIPY_API_KEY || localStorage.getItem('klipy_api_key') || '';
    if (!apiKey) {
      // Use curated library if no Klipy key set
      return;
    }

    const query = gifSearch.trim() || (activeCategory !== 'Todos' && activeCategory !== 'Em Alta' ? activeCategory : '');
    const endpoint = query
      ? `https://api.klipy.com/v1/gifs/search?api_key=${encodeURIComponent(apiKey)}&q=${encodeURIComponent(query)}&limit=24`
      : `https://api.klipy.com/v1/gifs/trending?api_key=${encodeURIComponent(apiKey)}&limit=24`;

    const timer = setTimeout(async () => {
      setIsLoadingGifs(true);
      try {
        const res = await fetch(endpoint);
        if (res.ok) {
          const json = await res.json();
          const items = (json.data || json.results || []).map((item: any) => ({
            url: item.images?.original?.url || item.media_formats?.gif?.url || item.media_formats?.webp?.url || item.url,
            preview: item.images?.fixed_height?.url || item.media_formats?.tinygif?.url || item.media_formats?.tinywebp?.url || item.preview_url || item.url,
            title: item.title || 'GIF',
          }));
          if (items.length > 0) {
            setKlipyGifs(items);
          }
        }
      } catch (err) {
        console.error('Failed to fetch from Klipy API:', err);
      } finally {
        setIsLoadingGifs(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [activeTab, activeCategory, gifSearch]);

  const displayedGifs = useMemo(() => {
    if (activeCategory === 'Favoritos') {
      return favoriteGifs.map((f) => ({
        url: f.gif_url,
        preview: f.preview_url || f.gif_url,
        title: f.title || 'GIF Favorito',
      }));
    }

    if (klipyGifs.length > 0) {
      return klipyGifs;
    }

    let list = CURATED_GIFS;
    if (activeCategory !== 'Todos' && activeCategory !== 'Em Alta') {
      list = list.filter((g) => g.category.toLowerCase() === activeCategory.toLowerCase());
    }
    if (gifSearch.trim()) {
      const q = gifSearch.toLowerCase();
      list = list.filter((g) => g.title.toLowerCase().includes(q) || g.category.toLowerCase().includes(q));
    }
    return list;
  }, [activeCategory, favoriteGifs, klipyGifs, gifSearch]);

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />

      <div
        className={`absolute ${positionClass} z-50 bg-background-darkest rounded-3xl shadow-2xl border border-white/10 overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150 select-none ${
          isResizing ? 'transition-none pointer-events-auto' : 'transition-[width]'
        }`}
        style={{
          width: typeof window !== 'undefined' && window.innerWidth < 640 ? 'calc(100vw - 2rem)' : `${pickerWidth}px`,
          maxWidth: 'calc(100vw - 2rem)',
          height: '420px',
        }}
      >
        {/* Left Resize Handle (Desktop only) */}
        <div
          onMouseDown={handleResizeStart}
          className="absolute left-0 top-0 bottom-0 w-2.5 cursor-ew-resize hover:bg-brand-500/20 active:bg-brand-500/40 z-30 transition-colors hidden sm:flex items-center justify-center group/resizer"
          title="Arrastar para redimensionar (até o dobro do tamanho)"
        >
          <div className="w-1 h-8 bg-white/20 group-hover/resizer:bg-brand-400 group-hover/resizer:scale-y-125 rounded-full transition-all" />
        </div>

        {/* Top Header Tabs */}
        <div className="p-2 bg-background-darker/80 border-b border-white/5 flex items-center justify-between pl-3.5">
          <div className="flex items-center gap-1 bg-background-darkest p-1 rounded-2xl border border-white/5">
            <button
              type="button"
              onClick={() => setActiveTab('emoji')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'emoji'
                  ? 'bg-brand-500 text-white shadow-sm'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <Smile className="w-4 h-4" />
              <span>Emojis</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('gif')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'gif'
                  ? 'bg-brand-500 text-white shadow-sm'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <Film className="w-4 h-4" />
              <span>GIFs</span>
              <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-purple-500/30 text-purple-200 border border-purple-500/40">
                Klipy
              </span>
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1.5 hover:bg-white/5 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab 1: Emojis */}
        {activeTab === 'emoji' && (
          <div className="flex-1 p-3 overflow-y-auto no-scrollbar">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-2 px-1">
              Todos os Emojis
            </span>
            <div className={`grid gap-2 ${pickerWidth >= 640 ? 'grid-cols-10' : pickerWidth >= 500 ? 'grid-cols-8' : 'grid-cols-6'}`}>
              {COMMON_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => {
                    onSelectEmoji(emoji);
                  }}
                  className="w-11 h-11 flex items-center justify-center text-2xl hover:bg-white/10 rounded-2xl transition-all active:scale-125 cursor-pointer hover:scale-110"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Tab 2: GIFs (Klipy + Favorites) */}
        {activeTab === 'gif' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* GIF Search Bar */}
            <div className="p-3 pb-2">
              <div className="relative">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={gifSearch}
                  onChange={(e) => setGifSearch(e.target.value)}
                  placeholder="Pesquisar GIFs no Klipy..."
                  className="w-full bg-background-darker text-white text-xs pl-9 pr-8 py-2 rounded-xl border border-white/10 focus:outline-none focus:border-brand-500 placeholder-gray-500"
                />
                {gifSearch && (
                  <button
                    type="button"
                    onClick={() => setGifSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white p-0.5"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Category Filter Pills */}
            <div className="px-3 pb-2 flex gap-1.5 overflow-x-auto no-scrollbar flex-shrink-0">
              {GIF_CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setActiveCategory(cat)}
                  className={`px-2.5 py-1 rounded-xl text-[11px] font-semibold whitespace-nowrap transition-all flex items-center gap-1 cursor-pointer ${
                    activeCategory === cat
                      ? 'bg-brand-500 text-white shadow-sm'
                      : 'bg-background-darker/60 text-gray-400 hover:text-gray-200 border border-white/5'
                  }`}
                >
                  {cat === 'Favoritos' && <Star className={`w-3 h-3 ${activeCategory === cat ? 'fill-current' : ''}`} />}
                  {cat === 'Em Alta' && <TrendingUp className="w-3 h-3" />}
                  <span>{cat}</span>
                  {cat === 'Favoritos' && favoriteGifs.length > 0 && (
                    <span className="text-[9px] bg-white/20 px-1 rounded-full">
                      {favoriteGifs.length}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* GIFs Grid */}
            <div className="flex-1 p-3 pt-0 overflow-y-auto no-scrollbar">
              {isLoadingGifs ? (
                <div className="h-full flex flex-col items-center justify-center text-gray-400 gap-2">
                  <Loader2 className="w-6 h-6 animate-spin text-brand-400" />
                  <span className="text-xs">Carregando GIFs do Klipy...</span>
                </div>
              ) : activeCategory === 'Favoritos' && displayedGifs.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-4 text-gray-400 space-y-2">
                  <Star className="w-8 h-8 text-amber-400/40 stroke-1" />
                  <span className="text-xs font-semibold text-gray-300">Nenhum GIF favorito ainda</span>
                  <p className="text-[11px] text-gray-500 leading-relaxed max-w-xs">
                    Passe o mouse sobre qualquer GIF enviado no chat e clique na <strong>estrelinha ⭐</strong> no canto superior direito para salvá-lo aqui.
                  </p>
                </div>
              ) : displayedGifs.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-4 text-gray-400">
                  <span className="text-xs">Nenhum GIF encontrado para "{gifSearch}".</span>
                </div>
              ) : (
                <div className={`grid gap-2 ${pickerWidth >= 560 ? 'grid-cols-3' : 'grid-cols-2'}`}>
                  {displayedGifs.map((gif, idx) => (
                    <GifPickerItem
                      key={`${gif.url}-${idx}`}
                      gif={gif}
                      autoplayGifs={autoplayGifs}
                      onSelect={(url) => {
                        onSelectGif(url);
                        onClose();
                      }}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Klipy Footer Info */}
            <div className="p-2 bg-background-darker/70 border-t border-white/5 flex items-center justify-center text-[10px] text-gray-400 px-3">
              <span className="flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-purple-400" />
                <span>Powered by Klipy GIF API</span>
              </span>
            </div>
          </div>
        )}
      </div>
    </>
  );
};
