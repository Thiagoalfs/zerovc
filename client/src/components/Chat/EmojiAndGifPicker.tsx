import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Smile,
  Film,
  Search,
  Star,
  Sparkles,
  TrendingUp,
  X,
  Key,
  Check,
  Loader2,
} from 'lucide-react';
import { useFavoriteGifStore } from '../../stores/favoriteGifStore';

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

export const EmojiAndGifPicker: React.FC<EmojiAndGifPickerProps> = ({
  isOpen,
  onClose,
  onSelectEmoji,
  onSelectGif,
  positionClass = 'bottom-16 right-4',
}) => {
  const [activeTab, setActiveTab] = useState<'emoji' | 'gif'>('emoji');
  const [activeCategory, setActiveCategory] = useState<string>('Todos');
  const [gifSearch, setGifSearch] = useState('');
  const [klipyGifs, setKlipyGifs] = useState<Array<{ url: string; preview: string; title: string }>>([]);
  const [isLoadingGifs, setIsLoadingGifs] = useState(false);
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');

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
            url: item.images?.original?.url || item.media_formats?.gif?.url || item.url,
            preview: item.images?.fixed_height?.url || item.media_formats?.tinygif?.url || item.preview_url || item.url,
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

  const handleSaveApiKey = () => {
    if (apiKeyInput.trim()) {
      localStorage.setItem('klipy_api_key', apiKeyInput.trim());
      setShowKeyModal(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />

      <div
        className={`absolute ${positionClass} z-50 bg-background-darkest w-80 md:w-96 rounded-3xl shadow-2xl border border-white/10 overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150 select-none`}
        style={{ height: '420px' }}
      >
        {/* Top Header Tabs */}
        <div className="p-2 bg-background-darker/80 border-b border-white/5 flex items-center justify-between">
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
            <div className="grid grid-cols-6 gap-2">
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
                <div className="grid grid-cols-2 gap-2">
                  {displayedGifs.map((gif, idx) => {
                    const favorited = isFavorited(gif.url);
                    return (
                      <div
                        key={`${gif.url}-${idx}`}
                        className="relative rounded-2xl overflow-hidden group bg-background-dark border border-white/5 aspect-video cursor-pointer"
                        onClick={() => {
                          onSelectGif(gif.url);
                          onClose();
                        }}
                      >
                        <img
                          src={gif.preview || gif.url}
                          alt={gif.title}
                          loading="lazy"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                        />

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
                  })}
                </div>
              )}
            </div>

            {/* Klipy Footer Info & API Key Setup */}
            <div className="p-2 bg-background-darker/70 border-t border-white/5 flex items-center justify-between text-[10px] text-gray-400 px-3">
              <span className="flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-purple-400" />
                <span>Powered by Klipy GIF API</span>
              </span>

              <button
                type="button"
                onClick={() => setShowKeyModal(true)}
                className="text-gray-400 hover:text-brand-300 transition-colors flex items-center gap-1 cursor-pointer"
                title="Configurar chave personalizada da API Klipy"
              >
                <Key className="w-3 h-3" />
                <span>Chave API</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Mini Modal to Configure Custom Klipy API Key */}
      {showKeyModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-background-darkest w-full max-w-sm rounded-3xl p-5 border border-white/10 shadow-2xl space-y-4 animate-in zoom-in-95">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
                <Key className="w-4 h-4 text-purple-400" />
                <span>Chave de API do Klipy</span>
              </h4>
              <button onClick={() => setShowKeyModal(false)} className="text-gray-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-gray-400 leading-relaxed">
              Insira sua chave de API gerada no painel de parceiros da <strong>Klipy</strong> para habilitar busca ilimitada de GIFs e vídeos.
            </p>

            <input
              type="text"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              placeholder="Cole sua API Key do Klipy..."
              className="w-full bg-background-darker border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-brand-500 font-mono"
            />

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowKeyModal(false)}
                className="px-3 py-1.5 text-xs text-gray-400 hover:text-white font-medium"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveApiKey}
                className="bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold px-4 py-1.5 rounded-xl shadow-md transition-colors"
              >
                Salvar Chave
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
