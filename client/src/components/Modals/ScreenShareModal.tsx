import React, { useState, useEffect } from 'react';
import { X, Monitor, AppWindow } from 'lucide-react';
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

export const ScreenShareModal: React.FC<ScreenShareModalProps> = ({ isOpen, onClose }) => {
  const [sources, setSources] = useState<SourceItem[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { startScreenShare } = useVoiceStore();

  useEffect(() => {
    if (!isOpen) return;

    const fetchSources = async () => {
      setIsLoading(true);
      if (window.electronAPI?.getScreenSources) {
        try {
          const res = await window.electronAPI.getScreenSources();
          setSources(res);
          if (res.length > 0) setSelectedSourceId(res[0].id);
        } catch (err) {
          console.error('Failed to get sources:', err);
        }
      } else {
        // Web fallback placeholder
        setSources([
          { id: 'screen:0:0', name: 'Tela Inteira (Navegador)', thumbnail: '' },
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
    await startScreenShare(selectedSourceId);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm select-none p-4">
      <div className="bg-background-dark w-full max-w-2xl rounded-2xl overflow-hidden shadow-2xl border border-white/10 animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="p-6 pb-2 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white">Compartilhar Tela</h2>
            <p className="text-xs text-gray-400 mt-0.5">Selecione uma janela ou tela inteira para transmitir</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content / Thumbnails */}
        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-2 gap-4">
          {isLoading ? (
            <div className="col-span-2 py-12 flex justify-center text-sm text-gray-400">
              Carregando janelas disponíveis...
            </div>
          ) : sources.length === 0 ? (
            <div className="col-span-2 py-12 flex justify-center text-sm text-gray-400">
              Nenhuma tela ou janela encontrada.
            </div>
          ) : (
            sources.map((source) => {
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
                  {/* Thumbnail */}
                  <div className="w-full aspect-video bg-black/40 flex items-center justify-center overflow-hidden">
                    {source.thumbnail ? (
                      <img src={source.thumbnail} alt={source.name} className="w-full h-full object-contain" />
                    ) : (
                      <Monitor className="w-12 h-12 text-gray-600" />
                    )}
                  </div>

                  {/* Title Bar */}
                  <div className="p-2.5 flex items-center gap-2 bg-background-darker">
                    {source.appIcon ? (
                      <img src={source.appIcon} alt="" className="w-4 h-4 rounded" />
                    ) : (
                      <AppWindow className="w-4 h-4 text-gray-400" />
                    )}
                    <span className="text-xs font-semibold text-gray-200 truncate">{source.name}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-background-darker/70 border-t border-black/20 flex justify-between items-center">
          <button type="button" onClick={onClose} className="text-sm text-gray-300 hover:underline">
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleShare}
            disabled={!selectedSourceId}
            className="bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-medium px-6 py-2 rounded-lg text-sm transition-colors"
          >
            Iniciar Transmissão
          </button>
        </div>
      </div>
    </div>
  );
};
