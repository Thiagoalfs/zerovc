import React, { useState, useEffect } from 'react';
import { X, Monitor, AppWindow, Sparkles, Volume2, Check } from 'lucide-react';
import { useVoiceStore } from '../../stores/voiceStore';

interface ScreenShareModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface SourceItem {
  id: string;
  name: string;
  thumbnail: string;
  appIcon?: string | null;
}

export type ScreenResolution = '480p' | '720p' | '1080p';
export type ScreenFPS = 15 | 30 | 60;

export const ScreenShareModal: React.FC<ScreenShareModalProps> = ({ isOpen, onClose }) => {
  const [sources, setSources] = useState<SourceItem[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'screens' | 'windows'>('all');
  const [resolution, setResolution] = useState<ScreenResolution>('720p');
  const [fps, setFps] = useState<ScreenFPS>(30);
  const [includeAudio, setIncludeAudio] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const { startScreenShare } = useVoiceStore();

  const isElectron = !!(window as any).electronAPI?.getScreenSources;

  useEffect(() => {
    if (!isOpen) return;

    const fetchSources = async () => {
      setIsLoading(true);
      if (isElectron) {
        try {
          const res = await (window as any).electronAPI.getScreenSources();
          setSources(res);
          if (res.length > 0) setSelectedSourceId(res[0].id);
        } catch (err) {
          console.error('Failed to get sources:', err);
        }
      } else {
        // Web Browser Direct source
        setSources([
          { id: 'screen:0:0', name: 'Tela inteira, Janela ou Guia do Navegador', thumbnail: '' },
        ]);
        setSelectedSourceId('screen:0:0');
      }
      setIsLoading(false);
    };

    fetchSources();
  }, [isOpen, isElectron]);

  if (!isOpen) return null;

  const handleShare = async () => {
    if (!selectedSourceId) return;
    await startScreenShare(selectedSourceId, { resolution, fps, includeAudio: isElectron && includeAudio });
    onClose();
  };

  const filteredSources = sources.filter((s) => {
    if (activeTab === 'screens') return s.id.startsWith('screen:');
    if (activeTab === 'windows') return s.id.startsWith('window:');
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md select-none p-4 animate-in fade-in duration-200">
      <div className="bg-[#18191c] w-full max-w-xl rounded-2xl overflow-hidden shadow-2xl border border-white/10 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between border-b border-white/5">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-gray-100 lowercase tracking-wide">
              selecionar janela ou tela
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-white/5 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Source Selection Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {isElectron && sources.length > 0 && (
            <div className="flex items-center gap-2 pb-1">
              <button
                type="button"
                onClick={() => setActiveTab('all')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'all'
                    ? 'bg-brand-500 text-white shadow-sm'
                    : 'bg-white/5 text-gray-400 hover:text-gray-200 hover:bg-white/10'
                }`}
              >
                Todas
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('screens')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'screens'
                    ? 'bg-brand-500 text-white shadow-sm'
                    : 'bg-white/5 text-gray-400 hover:text-gray-200 hover:bg-white/10'
                }`}
              >
                Telas
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('windows')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'windows'
                    ? 'bg-brand-500 text-white shadow-sm'
                    : 'bg-white/5 text-gray-400 hover:text-gray-200 hover:bg-white/10'
                }`}
              >
                Janelas
              </button>
            </div>
          )}

          {/* Sources Grid */}
          {isLoading ? (
            <div className="h-44 flex flex-col items-center justify-center gap-2 text-sm text-gray-400">
              <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
              <span>Carregando janelas...</span>
            </div>
          ) : !isElectron ? (
            <div
              onClick={() => setSelectedSourceId('screen:0:0')}
              className={`p-6 rounded-2xl border-2 transition-all cursor-pointer flex flex-col items-center justify-center text-center gap-3 ${
                selectedSourceId === 'screen:0:0'
                  ? 'border-brand-500 bg-brand-500/10'
                  : 'border-white/10 bg-white/5 hover:border-white/20'
              }`}
            >
              <Monitor className="w-12 h-12 text-brand-400" />
              <div>
                <p className="text-sm font-bold text-white">Compartilhar Tela via Navegador</p>
                <p className="text-xs text-gray-400 mt-1 max-w-sm">
                  O navegador abrirá uma janela nativa permitindo escolher a tela inteira, uma janela ou uma guia específica.
                </p>
              </div>
            </div>
          ) : filteredSources.length === 0 ? (
            <div className="h-44 flex items-center justify-center text-sm text-gray-400">
              Nenhuma fonte encontrada nesta categoria.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 max-h-52 overflow-y-auto pr-1 custom-scrollbar">
              {filteredSources.map((source) => {
                const isSelected = selectedSourceId === source.id;
                return (
                  <div
                    key={source.id}
                    onClick={() => setSelectedSourceId(source.id)}
                    className={`group relative rounded-xl overflow-hidden border-2 cursor-pointer transition-all bg-[#1e1f22] ${
                      isSelected
                        ? 'border-brand-500 ring-2 ring-brand-500/30'
                        : 'border-white/5 hover:border-white/20'
                    }`}
                  >
                    <div className="w-full aspect-video bg-black/40 flex items-center justify-center overflow-hidden relative">
                      {source.thumbnail ? (
                        <img
                          src={source.thumbnail}
                          alt={source.name}
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <Monitor className="w-10 h-10 text-gray-600" />
                      )}
                      {isSelected && (
                        <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-brand-500 text-white flex items-center justify-center shadow">
                          <Check className="w-3 h-3 stroke-[3]" />
                        </div>
                      )}
                    </div>
                    <div className="p-2 flex items-center gap-2 bg-[#2b2d31]">
                      {source.appIcon ? (
                        <img src={source.appIcon} alt="" className="w-3.5 h-3.5 rounded flex-shrink-0" />
                      ) : (
                        <AppWindow className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                      )}
                      <span className="text-xs font-semibold text-gray-200 truncate">{source.name}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Controls Row: Resolution (Left) & FPS (Right) */}
          <div className="flex items-center justify-between gap-4 pt-1">
            {/* Resolution Buttons */}
            <div className="flex items-center gap-1.5 bg-[#1e1f22] p-1 rounded-xl border border-white/5">
              {(['480p', '720p', '1080p'] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setResolution(r)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    resolution === r
                      ? 'bg-brand-500 text-white shadow-sm'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>

            {/* FPS Buttons */}
            <div className="flex items-center gap-1.5 bg-[#1e1f22] p-1 rounded-xl border border-white/5">
              {([15, 30, 60] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFps(f)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    fps === f
                      ? 'bg-brand-500 text-white shadow-sm'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                  }`}
                >
                  {f}fps
                </button>
              ))}
            </div>
          </div>

          {/* System Audio Toggle Row */}
          <button
            type="button"
            onClick={() => setIncludeAudio((prev) => !prev)}
            className={`w-full flex items-center justify-between py-3 px-4 rounded-xl border transition-all ${
              includeAudio
                ? 'bg-[#1e1f22] border-brand-500/50 text-white'
                : 'bg-[#1e1f22] border-white/5 text-gray-400 hover:border-white/10'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Volume2 className={`w-4 h-4 ${includeAudio ? 'text-brand-400' : 'text-gray-500'}`} />
              <span className="text-sm font-medium lowercase tracking-wide">
                compartilhar som do sistema
              </span>
            </div>

            {/* Toggle Switch */}
            <div
              className={`w-11 h-6 rounded-full flex items-center px-0.5 transition-colors duration-200 ease-in-out ${
                includeAudio ? 'bg-brand-500 justify-end' : 'bg-white/15 justify-start'
              }`}
            >
              <div className="w-5 h-5 rounded-full bg-white shadow-md transform transition-transform duration-200" />
            </div>
          </button>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-[#111214] border-t border-white/5 flex justify-end items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="text-xs md:text-sm font-semibold text-gray-400 hover:text-white px-4 py-2 rounded-xl hover:bg-white/5 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleShare}
            disabled={!selectedSourceId}
            className="bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-semibold px-5 py-2 rounded-xl text-xs md:text-sm transition-all flex items-center gap-2 shadow-lg shadow-brand-500/25"
          >
            <Sparkles className="w-4 h-4" />
            <span>Iniciar Transmissão</span>
          </button>
        </div>
      </div>
    </div>
  );
};