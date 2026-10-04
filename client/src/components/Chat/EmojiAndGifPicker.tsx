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
  Server,
  ArrowLeft,
} from 'lucide-react';
import { useFavoriteGifStore } from '../../stores/favoriteGifStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useGuildStore } from '../../stores/guildStore';
import { formatAssetUrl } from '../../lib/api';
import { EMOJI_DATABASE } from '../../utils/emojis';

interface EmojiAndGifPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectEmoji: (emoji: string) => void;
  onSelectGif: (gifUrl: string) => void;
  positionClass?: string;
  initialTab?: 'emoji' | 'gif';
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
    category: 'Olá',
  },
  {
    url: 'https://media.giphy.com/media/ICOgUNjpvO0PC/giphy.gif',
    preview: 'https://media.giphy.com/media/ICOgUNjpvO0PC/200w.gif',
    title: 'Gato Curioso',
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
    category: 'Dança',
  },
  {
    url: 'https://media.giphy.com/media/3oKIPnAiaMCws8nOsE/giphy.gif',
    preview: 'https://media.giphy.com/media/3oKIPnAiaMCws8nOsE/200w.gif',
    title: 'Anime Wow',
    category: 'Anime',
  },
  {
    url: 'https://media.giphy.com/media/d2lcHJTG5Tscg/giphy.gif',
    preview: 'https://media.giphy.com/media/d2lcHJTG5Tscg/200w.gif',
    title: 'Crying Sad',
    category: 'Triste',
  },
];

interface GifCategoryDef {
  id: string;
  name: string;
  preview: string;
  icon?: 'star' | 'trending';
}

const GIF_CATEGORY_CARDS: GifCategoryDef[] = [
  {
    id: 'Favoritos',
    name: 'Favoritos',
    preview: '',
    icon: 'star',
  },
  {
    id: 'Em Alta',
    name: 'Em Alta',
    preview: 'https://media.giphy.com/media/3o7TKSjRrfIPjeiVyM/200w.gif',
    icon: 'trending',
  },
  {
    id: 'Olá',
    name: 'Olá',
    preview: 'https://media.giphy.com/media/ICOgUNjpvO0PC/200w.gif',
  },
  {
    id: 'Humor',
    name: 'Humor',
    preview: 'https://media.giphy.com/media/11ISwbgCxEzMyY/200w.gif',
  },
  {
    id: 'Amor',
    name: 'Amor',
    preview: 'https://media.giphy.com/media/xT9IgG50Fb7Mi0prBC/200w.gif',
  },
  {
    id: 'Festa',
    name: 'Festa',
    preview: 'https://media.giphy.com/media/l41lI4bYmcsPJX9Go/200w.gif',
  },
  {
    id: 'Gatos',
    name: 'Gatos',
    preview: 'https://media.giphy.com/media/ICOgUNjpvO0PC/giphy.gif',
  },
  {
    id: 'Jogos',
    name: 'Jogos',
    preview: 'https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/200w.gif',
  },
  {
    id: 'Reação',
    name: 'Reação',
    preview: 'https://media.giphy.com/media/26ufdipQqU2lhNA4g/200w.gif',
  },
  {
    id: 'Dança',
    name: 'Dança',
    preview: 'https://media.giphy.com/media/artj92V8o75VPL7AeQ/200w.gif',
  },
  {
    id: 'Anime',
    name: 'Anime',
    preview: 'https://media.giphy.com/media/3oKIPnAiaMCws8nOsE/200w.gif',
  },
  {
    id: 'Triste',
    name: 'Triste',
    preview: 'https://media.giphy.com/media/d2lcHJTG5Tscg/200w.gif',
  },
];

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
      className="relative rounded-2xl overflow-hidden group bg-background-dark border border-white/5 cursor-pointer w-full"
      onClick={() => onSelect(gif.url)}
    >
      <img
        src={activeSrc}
        alt={gif.title}
        loading="lazy"
        className="w-full h-auto block object-cover group-hover:scale-105 transition-transform duration-200"
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
  initialTab = 'emoji',
}) => {
  const { activeGuild, guilds } = useGuildStore();
  const autoplayGifs = useSettingsStore((s) => s.autoplayGifs);
  const [activeTab, setActiveTab] = useState<'emoji' | 'gif'>(initialTab);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [emojiSearch, setEmojiSearch] = useState('');
  const [gifSearch, setGifSearch] = useState('');
  const [klipyGifs, setKlipyGifs] = useState<Array<{ url: string; preview: string; title: string }>>([]);
  const [isLoadingGifs, setIsLoadingGifs] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  // Reset category and search when closed
  useEffect(() => {
    if (!isOpen) {
      setSelectedCategory(null);
      setGifSearch('');
    }
  }, [isOpen]);

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
    if (selectedCategory === 'Favoritos') return;
    if (!selectedCategory && !gifSearch.trim()) {
      setKlipyGifs([]);
      return;
    }

    const apiKey = (import.meta as any).env?.VITE_KLIPY_API_KEY || localStorage.getItem('klipy_api_key') || '';
    if (!apiKey) {
      // Use curated library if no Klipy key set
      return;
    }

    const query = gifSearch.trim() || (selectedCategory && selectedCategory !== 'Em Alta' ? selectedCategory : '');
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
  }, [activeTab, selectedCategory, gifSearch]);

  const allServerEmojis = useMemo(() => {
    const list: any[] = [];
    const seen = new Set<string>();
    if (activeGuild?.emojis) {
      for (const e of activeGuild.emojis) {
        if (!seen.has(e.id)) {
          seen.add(e.id);
          list.push(e);
        }
      }
    }
    for (const g of guilds) {
      if (g.emojis) {
        for (const e of g.emojis) {
          if (!seen.has(e.id)) {
            seen.add(e.id);
            list.push(e);
          }
        }
      }
    }
    return list;
  }, [activeGuild?.emojis, guilds]);

  // Filtered Emojis
  const filteredServerEmojis = useMemo(() => {
    if (!emojiSearch.trim()) return allServerEmojis;
    const q = emojiSearch.trim().toLowerCase().replace(/^:|:$/g, '');
    return allServerEmojis.filter((e) => e.name.toLowerCase().includes(q));
  }, [allServerEmojis, emojiSearch]);

  const filteredStandardEmojis = useMemo(() => {
    if (!emojiSearch.trim()) {
      return EMOJI_DATABASE;
    }
    const q = emojiSearch.trim().toLowerCase().replace(/^:|:$/g, '');
    return EMOJI_DATABASE.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.shortcodes.some((s) => s.toLowerCase().includes(q)) ||
        e.keywords?.some((k) => k.toLowerCase().includes(q))
    );
  }, [emojiSearch]);

  const visibleStandardEmojis = useMemo(() => {
    if (emojiSearch.trim()) {
      return filteredStandardEmojis.slice(0, 200);
    }
    return filteredStandardEmojis.slice(0, 140);
  }, [filteredStandardEmojis, emojiSearch]);

  const displayedGifs = useMemo(() => {
    if (selectedCategory === 'Favoritos') {
      let list = favoriteGifs.map((f) => ({
        url: f.gif_url,
        preview: f.preview_url || f.gif_url,
        title: f.title || 'GIF Favorito',
      }));
      if (gifSearch.trim()) {
        const q = gifSearch.toLowerCase();
        list = list.filter((g) => g.title.toLowerCase().includes(q));
      }
      return list;
    }

    if (klipyGifs.length > 0) {
      return klipyGifs;
    }

    let list = CURATED_GIFS;
    if (selectedCategory && selectedCategory !== 'Em Alta') {
      list = list.filter((g) => g.category.toLowerCase() === selectedCategory.toLowerCase());
    }
    if (gifSearch.trim()) {
      const q = gifSearch.toLowerCase();
      list = list.filter((g) => g.title.toLowerCase().includes(q) || g.category.toLowerCase().includes(q));
    }
    return list;
  }, [selectedCategory, favoriteGifs, klipyGifs, gifSearch]);

  const categoryCols = pickerWidth >= 540 ? 'grid-cols-3' : 'grid-cols-2';

  const gifColumns = useMemo(() => {
    let colCount = 2;
    if (pickerWidth >= 660) {
      colCount = 4;
    } else if (pickerWidth >= 480) {
      colCount = 3;
    }

    const cols: Array<Array<{ gif: typeof displayedGifs[0]; originalIndex: number }>> = Array.from(
      { length: colCount },
      () => []
    );

    displayedGifs.forEach((gif, index) => {
      cols[index % colCount].push({ gif, originalIndex: index });
    });

    return cols;
  }, [displayedGifs, pickerWidth]);

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
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Emoji Search Bar */}
            <div className="p-3 pb-2">
              <div className="relative">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={emojiSearch}
                  onChange={(e) => setEmojiSearch(e.target.value)}
                  placeholder="Pesquisar emojis (:exemplo:)..."
                  className="w-full bg-background-darker text-white text-xs pl-9 pr-8 py-2 rounded-xl border border-white/10 focus:outline-none focus:border-brand-500 placeholder-gray-500"
                />
                {emojiSearch && (
                  <button
                    type="button"
                    onClick={() => setEmojiSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white p-0.5 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Emojis Scroll Area */}
            <div className="flex-1 p-3 pt-1 overflow-y-auto no-scrollbar space-y-4">
              {/* Server Custom Emojis Section */}
              {filteredServerEmojis.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-brand-400 uppercase tracking-wider mb-2 px-1">
                    <Server className="w-3.5 h-3.5" />
                    <span>{activeGuild?.name ? `Emojis de ${activeGuild.name}` : 'Emojis do Servidor'}</span>
                    <span className="text-gray-500 font-normal">({filteredServerEmojis.length})</span>
                  </div>
                  <div className={`grid gap-2 ${pickerWidth >= 640 ? 'grid-cols-10' : pickerWidth >= 500 ? 'grid-cols-8' : 'grid-cols-6'}`}>
                    {filteredServerEmojis.map((emoji) => {
                      const imgUrl = emoji.image_url;
                      return (
                        <button
                          key={emoji.id}
                          type="button"
                          title={`:${emoji.name}:`}
                          onClick={() => {
                            onSelectEmoji(`:${emoji.name}: `);
                            onClose();
                          }}
                          className="w-10 h-10 flex items-center justify-center p-1.5 hover:bg-white/10 rounded-2xl transition-all active:scale-125 cursor-pointer hover:scale-110 group/emj"
                        >
                          <img
                            src={formatAssetUrl(imgUrl)}
                            alt={emoji.name}
                            className="w-full h-full object-contain"
                            loading="lazy"
                          />
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Standard Unicode Emojis */}
              <div>
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 px-1 flex items-center justify-between">
                  <span>Emojis Padrão</span>
                  {emojiSearch && (
                    <span className="text-gray-500 font-normal">({filteredStandardEmojis.length} encontrados)</span>
                  )}
                </div>
                {filteredStandardEmojis.length === 0 && filteredServerEmojis.length === 0 ? (
                  <div className="py-8 text-center text-xs text-gray-400">
                    Nenhum emoji encontrado para "{emojiSearch}".
                  </div>
                ) : (
                  <div className={`grid gap-1.5 ${pickerWidth >= 640 ? 'grid-cols-10' : pickerWidth >= 500 ? 'grid-cols-8' : 'grid-cols-6'}`}>
                    {visibleStandardEmojis.map((emoji, idx) => (
                      <button
                        key={`${emoji.unicode}-${idx}`}
                        type="button"
                        title={`:${emoji.shortcodes[0] || emoji.name}:`}
                        onClick={() => {
                          onSelectEmoji(emoji.unicode);
                        }}
                        className="w-10 h-10 flex items-center justify-center text-2xl hover:bg-white/10 rounded-2xl transition-all active:scale-125 cursor-pointer hover:scale-110"
                      >
                        {emoji.unicode}
                      </button>
                    ))}
                  </div>
                )}
              </div>
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
                  placeholder={selectedCategory === 'Favoritos' ? 'Busque nos favoritos...' : 'Pesquisar GIFs no Klipy...'}
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

            {/* Initial Category Cards Grid (when not searching and no category selected) */}
            {!gifSearch.trim() && !selectedCategory ? (
              <div className="flex-1 p-3 pt-0 overflow-y-auto no-scrollbar">
                <div className={`grid ${categoryCols} gap-2.5`}>
                  {GIF_CATEGORY_CARDS.map((cat) => {
                    if (cat.id === 'Favoritos') {
                      const hasFavs = favoriteGifs.length > 0;
                      const favPreview = hasFavs ? (favoriteGifs[0].preview_url || favoriteGifs[0].gif_url) : null;
                      return (
                        <div
                          key={cat.id}
                          onClick={() => setSelectedCategory(cat.id)}
                          className="relative h-20 sm:h-22 rounded-2xl overflow-hidden cursor-pointer border border-brand-400/40 hover:border-brand-300 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] shadow-md group flex items-center justify-center bg-brand-500"
                        >
                          {favPreview && (
                            <img
                              src={favPreview}
                              alt="Favoritos"
                              loading="lazy"
                              className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                            />
                          )}
                          <div
                            className={`absolute inset-0 transition-all ${
                              favPreview
                                ? 'bg-gradient-to-t from-brand-600/90 via-brand-500/85 to-brand-500/75 group-hover:opacity-90'
                                : 'bg-gradient-to-br from-brand-500 to-brand-700 group-hover:brightness-110'
                            }`}
                          />
                          <div className="relative z-10 flex items-center justify-center gap-1.5 px-2 text-white">
                            <Star className="w-4 h-4 fill-current drop-shadow" />
                            <span className="font-bold text-xs sm:text-sm drop-shadow tracking-wide">Favoritos</span>
                            {hasFavs && (
                              <span className="text-[10px] bg-black/35 backdrop-blur-sm px-1.5 py-0.5 rounded-full font-medium border border-white/10">
                                {favoriteGifs.length}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={cat.id}
                        onClick={() => setSelectedCategory(cat.id)}
                        className="relative h-20 sm:h-22 rounded-2xl overflow-hidden cursor-pointer border border-white/5 hover:border-white/20 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] shadow-md group flex items-center justify-center bg-background-dark"
                      >
                        {cat.preview && (
                          <img
                            src={cat.preview}
                            alt={cat.name}
                            loading="lazy"
                            className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                          />
                        )}
                        <div className="absolute inset-0 bg-black/55 group-hover:bg-black/40 transition-colors" />
                        <div className="relative z-10 flex items-center justify-center gap-1.5 px-2 text-white">
                          {cat.icon === 'trending' && <TrendingUp className="w-4 h-4 drop-shadow" />}
                          <span className="font-bold text-xs sm:text-sm drop-shadow tracking-wide">{cat.name}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              /* Selected Category or Search Results */
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* Header: Back Button or Search Info */}
                <div className="px-3 pb-2 flex items-center justify-between flex-shrink-0">
                  {selectedCategory === 'Favoritos' ? (
                    <div className="flex items-center justify-between w-full">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedCategory(null);
                            setGifSearch('');
                          }}
                          className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-semibold text-gray-300 hover:text-white bg-background-darker hover:bg-white/10 border border-white/10 transition-colors cursor-pointer"
                        >
                          <ArrowLeft className="w-3.5 h-3.5" />
                          <span>Voltar</span>
                        </button>
                        <div className="flex items-center gap-1.5 text-xs font-bold text-white">
                          <Star className="w-3.5 h-3.5 text-amber-400 fill-current" />
                          <span>Favoritos</span>
                          {favoriteGifs.length > 0 && (
                            <span className="text-[10px] text-gray-400 font-normal">
                              ({displayedGifs.length}{gifSearch.trim() && displayedGifs.length !== favoriteGifs.length ? ` de ${favoriteGifs.length}` : ''})
                            </span>
                          )}
                        </div>
                      </div>
                      {gifSearch.trim() && (
                        <button
                          type="button"
                          onClick={() => setGifSearch('')}
                          className="text-xs text-brand-400 hover:text-brand-300 font-medium cursor-pointer"
                        >
                          Limpar busca
                        </button>
                      )}
                    </div>
                  ) : gifSearch.trim() ? (
                    <div className="flex items-center justify-between w-full text-xs text-gray-400">
                      <span>Resultados para "{gifSearch}"</span>
                      <button
                        type="button"
                        onClick={() => setGifSearch('')}
                        className="text-xs text-brand-400 hover:text-brand-300 font-medium cursor-pointer"
                      >
                        Limpar busca
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedCategory(null);
                          setGifSearch('');
                        }}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-semibold text-gray-300 hover:text-white bg-background-darker hover:bg-white/10 border border-white/10 transition-colors cursor-pointer"
                      >
                        <ArrowLeft className="w-3.5 h-3.5" />
                        <span>Voltar</span>
                      </button>
                      <div className="flex items-center gap-1.5 text-xs font-bold text-white">
                        {selectedCategory === 'Em Alta' && <TrendingUp className="w-3.5 h-3.5 text-brand-400" />}
                        <span>{selectedCategory}</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* GIFs Masonry Grid */}
                <div className="flex-1 p-3 pt-0 overflow-y-auto no-scrollbar">
                  {isLoadingGifs ? (
                    <div className="h-full flex flex-col items-center justify-center text-gray-400 gap-2">
                      <Loader2 className="w-6 h-6 animate-spin text-brand-400" />
                      <span className="text-xs">Carregando GIFs do Klipy...</span>
                    </div>
                  ) : selectedCategory === 'Favoritos' && displayedGifs.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center p-4 text-gray-400 space-y-2">
                      <Star className="w-8 h-8 text-amber-400/40 stroke-1" />
                      {gifSearch.trim() ? (
                        <>
                          <span className="text-xs font-semibold text-gray-300">
                            Nenhum GIF favorito encontrado para "{gifSearch}"
                          </span>
                          <button
                            type="button"
                            onClick={() => setGifSearch('')}
                            className="text-xs text-brand-400 hover:text-brand-300 cursor-pointer pt-1"
                          >
                            Limpar busca
                          </button>
                        </>
                      ) : (
                        <>
                          <span className="text-xs font-semibold text-gray-300">Nenhum GIF favorito ainda</span>
                          <p className="text-[11px] text-gray-500 leading-relaxed max-w-xs">
                            Passe o mouse sobre qualquer GIF enviado no chat e clique na <strong>estrelinha ⭐</strong> no canto superior direito para salvá-lo aqui.
                          </p>
                        </>
                      )}
                    </div>
                  ) : displayedGifs.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center p-4 text-gray-400">
                      <span className="text-xs">
                        {gifSearch.trim()
                          ? `Nenhum GIF encontrado para "${gifSearch}".`
                          : 'Nenhum GIF encontrado nesta categoria.'}
                      </span>
                    </div>
                  ) : (
                    <div className="flex gap-2 items-start w-full">
                      {gifColumns.map((col, colIdx) => (
                        <div key={colIdx} className="flex-1 min-w-0 flex flex-col gap-2">
                          {col.map(({ gif, originalIndex }) => (
                            <GifPickerItem
                              key={`${gif.url}-${originalIndex}`}
                              gif={gif}
                              autoplayGifs={autoplayGifs}
                              onSelect={(url) => {
                                onSelectGif(url);
                                onClose();
                              }}
                            />
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

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
