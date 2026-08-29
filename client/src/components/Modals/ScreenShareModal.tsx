import React, { useState, useEffect } from 'react';
import { X, Monitor, AppWindow, Sliders, Zap, Sparkles } from 'lucide-react';
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
  const [resolution, setResolution] = useState<ScreenResolution>('720p');
  const [fps, setFps] = useState<ScreenFPS>(30);
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
          { id: 'screen:0:0', name: 'Tela, Janela ou Guia do Navegador', thumbnail: '' },
        ]);
        setSelectedSourceId('screen:0:0');
      }
      setIsLoading(false);
    };

    fetchSources();
  }, [isOpen]);

  if (!isOpen) return null;

  const handleShare = async () => {
    if (!selectedSourceId) return;
    await startScreenShare(selectedSourceId, { resolution, fps });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm select-none p-4">
      <div className="bg-background-dark w-full max-w-2xl rounded-2xl overflow-hidden shadow-2xl border border-white/10 animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 pb-3 flex items-center justify-between border-b border-white/5">
          <div>
            <h2 className="text-lg md:text-xl font-bold text-white flex items-center gap-2">
              <Monitor className="w-5 h-5 text-brand-500" />
              <span>Transmitir Sua Tela</span>
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Escolha a qualidade, fluidez e a fonte para compartilhamento de tela
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-200 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Quality & FPS Controls */}
          <div className="bg-background-darkest/70 rounded-2xl p-4 border border-white/5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-gray-300 uppercase tracking-wider">
                <Sliders className="w-4 h-4 text-brand-500" />
                <span>Configurações de Transmissão</span>
              </div>
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-medium">
                <Zap className="w-3 h-3" />
                <span>Hardware Acceleration (WGC)</span>
              </div>
            </div>

            {/* Resolution Selector */}
            <div>
              <label className="text-xs font-semibold text-gray-400 block mb-2">
                RESOLUÇÃO DE VÍDEO
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { id: '480p', label: '480p', desc: 'Econômico' },
                    { id: '720p', label: '720p', desc: 'Recomendado' },
                    { id: '1080p', label: '1080p', desc: 'Alta Definição' },
                  ] as const
                ).map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setResolution(r.id)}
                    className={`flex flex-col items-center justify-center py-2.5 px-2 rounded-xl border transition-all ${
                      resolution === r.id
                        ? 'bg-brand-500/20 border-brand-500 text-white shadow-md shadow-brand-500/20'
                        : 'bg-background-darker border-white/5 text-gray-400 hover:text-gray-200 hover:border-white/20'
                    }`}
                  >
                    <span className="font-bold text-sm">{r.label}</span>
                    <span className="text-[10px] text-gray-400 mt-0.5">{r.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* FPS Selector */}
            <div>
              <label className="text-xs font-semibold text-gray-400 block mb-2">
                TAXA DE QUADROS (FPS)
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { id: 15, label: '15 FPS', desc: 'Código & Docs', icon: null },
                    { id: 30, label: '30 FPS', desc: 'Padrão', icon: null },
                    { id: 60, label: '60 FPS', desc: 'Fluidez / Jogos', icon: Zap },
                  ] as const
                ).map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFps(f.id)}
                    className={`flex flex-col items-center justify-center py-2.5 px-2 rounded-xl border transition-all ${
                      fps === f.id
                        ? 'bg-brand-500/20 border-brand-500 text-white shadow-md shadow-brand-500/20'
                        : 'bg-background-darker border-white/5 text-gray-400 hover:text-gray-200 hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center gap-1 font-bold text-sm">
                      {f.icon && <f.icon className="w-3.5 h-3.5 text-yellow-400" />}
                      <span>{f.label}</span>
                    </div>
                    <span className="text-[10px] text-gray-400 mt-0.5">{f.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Sources Section (if Electron with multiple windows) */}
          {isElectron && (
            <div>
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-2">
                SELECIONAR JANELA OU TELA
              </label>
              {isLoading ? (
                <div className="py-8 flex justify-center text-sm text-gray-400">
                  Carregando janelas disponíveis...
                </div>
              ) : sources.length === 0 ? (
                <div className="py-8 flex justify-center text-sm text-gray-400">
                  Nenhuma janela encontrada.
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 max-h-48 overflow-y-auto">
                  {sources.map((source) => {
                    const isSelected = selectedSourceId === source.id;
                    return (
                      <div
                        key={source.id}
                        onClick={() => setSelectedSourceId(source.id)}
                        className={`group relative rounded-xl overflow-hidden border-2 cursor-pointer transition-all bg-background-darkest ${
                          isSelected
                            ? 'border-brand-500 shadow-lg shadow-brand-500/20'
                            : 'border-white/5 hover:border-white/20'
                        }`}
                      >
                        <div className="w-full aspect-video bg-black/40 flex items-center justify-center overflow-hidden">
                          {source.thumbnail ? (
                            <img src={source.thumbnail} alt={source.name} className="w-full h-full object-contain" />
                          ) : (
                            <Monitor className="w-10 h-10 text-gray-600" />
                          )}
                        </div>
                        <div className="p-2 flex items-center gap-2 bg-background-darker">
                          {source.appIcon ? (
                            <img src={source.appIcon} alt="" className="w-3.5 h-3.5 rounded" />
                          ) : (
                            <AppWindow className="w-3.5 h-3.5 text-gray-400" />
                          )}
                          <span className="text-xs font-semibold text-gray-200 truncate">{source.name}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-background-darker/80 border-t border-white/5 flex justify-between items-center">
          <button type="button" onClick={onClose} className="text-xs md:text-sm text-gray-400 hover:text-white">
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleShare}
            disabled={!selectedSourceId}
            className="bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-semibold px-6 py-2 rounded-xl text-xs md:text-sm transition-all flex items-center gap-2 shadow-lg shadow-brand-500/30"
          >
            <Sparkles className="w-4 h-4" />
            <span>Iniciar Transmissão</span>
          </button>
        </div>
      </div>
    </div>
  );
};
