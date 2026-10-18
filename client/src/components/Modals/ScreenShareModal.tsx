import React, { useState, useEffect, useMemo } from 'react';
import { X, Monitor, AppWindow, Sparkles, Volume2, Check } from 'lucide-react';
import { useVoiceStore } from '../../stores/voiceStore';
import { useCallStore } from '../../stores/callStore';
import { matchWindowToGameFamily } from '../../utils/gameFamilyManager';
import {
  MODAL_TOGGLE_HEADER_CLASS,
  MODAL_TITLE_CLASS,
  MODAL_HEADER_PADDING_CLASS,
  MODAL_FOOTER_PADDING_CLASS,
  MODAL_CANCEL_BUTTON_CLASS,
  MODAL_PRIMARY_BUTTON_CLASS,
  MODAL_SWITCH_CONTAINER_CLASS,
  MODAL_SWITCH_KNOB_CLASS,
  MODAL_BACKDROP_CLASS,
} from '../../constants/modalTypography';

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
  const { startScreenShare: startVoiceScreenShare } = useVoiceStore();
  const { callState, startScreenShare: startCallScreenShare } = useCallStore();

  const isElectron = !!(window as any).electronAPI?.getScreenSources;

  useEffect(() => {
    if (!isOpen) return;

    const fetchSources = async () => {
      setIsLoading(true);
      if (isElectron) {
        try {
          const res = await (window as any).electronAPI.getScreenSources();
          const validSources = Array.isArray(res) ? res.filter((s: any) => s && s.id) : [];
          setSources(validSources);
          if (validSources.length > 0) {
            // Prioritize active game window (match > launcher) if available
            const gameMatch =
              validSources.find((s: any) => s.id?.startsWith('window:') && matchWindowToGameFamily(s.name, validSources, s.id)?.stage === 'game') ||
              validSources.find((s: any) => s.id?.startsWith('window:') && matchWindowToGameFamily(s.name, validSources, s.id)) ||
              validSources[0];
            if (gameMatch?.id) {
              setSelectedSourceId(gameMatch.id);
            }
          }
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

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleShare = async () => {
    if (!selectedSourceId) return;
    const selectedSource = sources.find((s) => s.id === selectedSourceId);
    let matchedFamily;
    try {
      matchedFamily = selectedSource
        ? matchWindowToGameFamily(selectedSource.name, sources, selectedSource.id)?.family
        : undefined;
    } catch {}

    if (callState === 'connected' || callState === 'calling') {
      await startCallScreenShare(selectedSourceId, { resolution, fps, includeAudio }, matchedFamily);
    } else {
      await startVoiceScreenShare(selectedSourceId, { resolution, fps, includeAudio }, matchedFamily);
    }
    onClose();
  };

  const filteredSources = useMemo(() => {
    let list = (sources || []).filter((s) => {
      if (!s || !s.id) return false;
      if (activeTab === 'screens') return s.id.startsWith('screen:');
      if (activeTab === 'windows') return s.id.startsWith('window:');
      return true;
    });

    if (activeTab === 'windows') {
      // Sort game windows to the top (in-game match first, then launcher)
      list = [...list].sort((a, b) => {
        try {
          const matchA = matchWindowToGameFamily(a?.name, sources, a?.id);
          const matchB = matchWindowToGameFamily(b?.name, sources, b?.id);
          const rankA = matchA ? (matchA.stage === 'game' ? 2 : 1) : 0;
          const rankB = matchB ? (matchB.stage === 'game' ? 2 : 1) : 0;
          return rankB - rankA;
        } catch {
          return 0;
        }
      });
    }

    return list;
  }, [sources, activeTab]);

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className={MODAL_BACKDROP_CLASS}
    >
      <div className="bg-background-dark w-full max-w-xl max-h-[92dvh] my-auto rounded-xl overflow-hidden shadow-2xl border border-white/10 flex flex-col">
        {/* Header */}
        <div className={`${MODAL_HEADER_PADDING_CLASS} flex items-center justify-between border-b border-white/5 flex-shrink-0`}>
          <div className="flex items-center gap-2">
            <h2 className={MODAL_TITLE_CLASS}>
              Selecione janela ou tela
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Source Selection Area */}
        <div className="flex-1 overflow-y-auto no-scrollbar p-4 sm:p-6 space-y-4 sm:space-y-5">
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
                    className={`group relative rounded-xl overflow-hidden border-2 cursor-pointer transition-all bg-background-darker ${
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
                    <div className="p-2 flex items-center justify-between gap-2 bg-background-darkest min-w-0">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        {source.appIcon ? (
                          <img src={source.appIcon} alt="" className="w-3.5 h-3.5 rounded flex-shrink-0" />
                        ) : (
                          <AppWindow className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                        )}
                        <span className="text-xs font-semibold text-gray-200 truncate">{source.name}</span>
                      </div>
                      {(() => {
                        try {
                          const match = matchWindowToGameFamily(source.name, sources, source.id);
                          if (!match) return null;
                          return (
                            <span
                              className={`text-[9.5px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider flex-shrink-0 ${
                                match.stage === 'game'
                                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                  : 'bg-brand-500/20 text-brand-300 border border-brand-500/30'
                              }`}
                            >
                              {match.label}
                            </span>
                          );
                        } catch {
                          return null;
                        }
                      })()}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Controls Row: Resolution (Left) & FPS (Right) */}
          <div className="flex items-center justify-between gap-4 pt-1">
            {/* Resolution Buttons */}
            <div className="flex items-center gap-1.5 bg-background-darker p-1 rounded-xl border border-white/5">
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
            <div className="flex items-center gap-1.5 bg-background-darker p-1 rounded-xl border border-white/5">
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

          {/* Audio Toggle Row */}
          <div
            onClick={() => setIncludeAudio((prev) => !prev)}
            className="w-full flex items-center justify-center gap-3 py-1 cursor-pointer select-none group"
          >
            <div className="flex items-center gap-2">
              <Volume2 className={`w-4 h-4 transition-colors ${includeAudio ? 'text-brand-400' : 'text-gray-400 group-hover:text-gray-300'}`} />
              <span className={`${MODAL_TOGGLE_HEADER_CLASS} transition-colors ${includeAudio ? 'text-white' : 'text-gray-400 group-hover:text-gray-300'}`}>
                Compartilhar áudio
              </span>
            </div>

            {/* Toggle Switch */}
            <button
              type="button"
              role="switch"
              aria-checked={includeAudio}
              onClick={(e) => {
                e.stopPropagation();
                setIncludeAudio(!includeAudio);
              }}
              className={`${MODAL_SWITCH_CONTAINER_CLASS} ${
                includeAudio ? 'bg-brand-500' : 'bg-white/10'
              }`}
            >
              <div
                className={`${MODAL_SWITCH_KNOB_CLASS} ${
                  includeAudio ? 'translate-x-6' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className={`${MODAL_FOOTER_PADDING_CLASS} bg-background-darkest border-t border-white/5 flex justify-end items-center gap-3`}>
          <button
            type="button"
            onClick={onClose}
            className={MODAL_CANCEL_BUTTON_CLASS}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleShare}
            disabled={!selectedSourceId}
            className={MODAL_PRIMARY_BUTTON_CLASS}
          >
            <Sparkles className="w-4 h-4" />
            <span>Iniciar Transmissão</span>
          </button>
        </div>
      </div>
    </div>
  );
};