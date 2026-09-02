import React, { useState, useEffect } from 'react';
import { Keyboard, Mic, Headphones, Monitor, Radio, RotateCcw, Check, Sparkles, X } from 'lucide-react';
import { isElectron } from '../../lib/platform';

interface ShortcutConfig {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  defaultKey: string;
  storageKey: string;
  electronAction: string;
}

const SHORTCUTS: ShortcutConfig[] = [
  {
    id: 'toggle_mute',
    name: 'Mutar / Desmutar Microfone',
    description: 'Alterna rapidamente o estado do seu microfone em qualquer canal de voz.',
    icon: <Mic className="w-4 h-4 text-brand-400" />,
    defaultKey: 'Control+Shift+M',
    storageKey: 'zerovc_keybind_mute',
    electronAction: 'toggle-mute',
  },
  {
    id: 'toggle_deafen',
    name: 'Silenciar / Ouvir Áudio (Deafen)',
    description: 'Silencia simultaneamente todo o áudio recebido e o seu microfone.',
    icon: <Headphones className="w-4 h-4 text-brand-400" />,
    defaultKey: 'Control+Shift+D',
    storageKey: 'zerovc_keybind_deafen',
    electronAction: 'toggle-deafen',
  },
  {
    id: 'toggle_screenshare',
    name: 'Iniciar / Parar Transmissão de Tela',
    description: 'Abre o seletor de transmissão ou encerra a captura atual.',
    icon: <Monitor className="w-4 h-4 text-brand-400" />,
    defaultKey: 'Control+Shift+S',
    storageKey: 'zerovc_keybind_screenshare',
    electronAction: 'toggle-screenshare',
  },
  {
    id: 'ptt_key',
    name: 'Tecla Push-to-Talk (PTT)',
    description: 'Mantenha pressionada para falar no modo Push-to-Talk.',
    icon: <Radio className="w-4 h-4 text-brand-400" />,
    defaultKey: 'Space',
    storageKey: 'zerovc_ptt_key',
    electronAction: 'ptt',
  },
];

export const KeybindSettingsView: React.FC = () => {
  const [bindings, setBindings] = useState<Record<string, string>>({});
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    const loaded: Record<string, string> = {};
    for (const sc of SHORTCUTS) {
      const val = localStorage.getItem(sc.storageKey) || sc.defaultKey;
      loaded[sc.id] = val;
    }
    setBindings(loaded);
  }, []);

  const registerElectronShortcuts = (newBindings: Record<string, string>) => {
    if (isElectron() && window.electronAPI?.registerGlobalShortcut) {
      for (const sc of SHORTCUTS) {
        if (sc.id === 'ptt_key') continue; // PTT is handled in renderer
        const key = newBindings[sc.id];
        if (key) {
          const accelerator = key.replace(/Control/g, 'CommandOrControl');
          window.electronAPI.registerGlobalShortcut(accelerator, sc.electronAction).catch(() => {});
        }
      }
    }
  };

  // Global window key listener when recording
  useEffect(() => {
    if (!recordingId) return;

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // Ignore modifier keys by themselves
      if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) {
        return;
      }

      // Escape cancels recording
      if (e.key === 'Escape') {
        setRecordingId(null);
        return;
      }

      const parts: string[] = [];
      if (e.ctrlKey || e.metaKey) parts.push('Control');
      if (e.shiftKey) parts.push('Shift');
      if (e.altKey) parts.push('Alt');

      let keyName = e.code || e.key;
      if (keyName.startsWith('Key')) keyName = keyName.slice(3);
      else if (keyName.startsWith('Digit')) keyName = keyName.slice(5);
      else if (keyName === 'Space' || keyName === ' ') keyName = 'Space';

      parts.push(keyName);
      const keyCombination = parts.join('+');

      const targetShortcut = SHORTCUTS.find((s) => s.id === recordingId);
      if (targetShortcut) {
        const updated = { ...bindings, [recordingId]: keyCombination };
        setBindings(updated);
        localStorage.setItem(targetShortcut.storageKey, keyCombination);
        setRecordingId(null);
        setSavedSuccess(true);
        setTimeout(() => setSavedSuccess(false), 2000);
        registerElectronShortcuts(updated);
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown, true);
    };
  }, [recordingId, bindings]);

  const handleResetDefault = (shortcut: ShortcutConfig) => {
    const updated = { ...bindings, [shortcut.id]: shortcut.defaultKey };
    setBindings(updated);
    localStorage.setItem(shortcut.storageKey, shortcut.defaultKey);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
    registerElectronShortcuts(updated);
  };

  const formatKeyDisplay = (keyCombo: string) => {
    if (!keyCombo) return 'Nenhum';
    return keyCombo
      .replace(/Control/g, 'Ctrl')
      .replace(/Shift/g, 'Shift')
      .replace(/Alt/g, 'Alt')
      .split('+')
      .map((part) => (
        <kbd
          key={part}
          className="px-2 py-1 bg-black/40 border border-white/15 rounded-md text-xs font-mono font-semibold text-white shadow-inner mx-0.5"
        >
          {part}
        </kbd>
      ));
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div className="flex items-center justify-between pb-2 border-b border-white/5">
        <div>
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Keyboard className="w-4 h-4 text-brand-400" />
            Atalhos do Teclado
          </h3>
          <p className="text-xs text-gray-400 mt-0.5">
            Configure combinações de teclas rápidas para controle de voz e transmissões no app.
          </p>
        </div>

        {savedSuccess && (
          <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full text-xs font-semibold animate-in fade-in">
            <Check className="w-3.5 h-3.5" />
            <span>Salvo!</span>
          </div>
        )}
      </div>

      <div className="space-y-3">
        {SHORTCUTS.map((sc) => {
          const isRecording = recordingId === sc.id;
          const currentKey = bindings[sc.id] || sc.defaultKey;

          return (
            <div
              key={sc.id}
              className={`p-4 rounded-2xl border transition-all ${
                isRecording
                  ? 'bg-brand-500/15 border-brand-500 shadow-lg shadow-brand-500/10 ring-2 ring-brand-500/30'
                  : 'bg-background-darker/60 border-white/5 hover:border-white/10'
              }`}
            >
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="p-2.5 bg-black/20 border border-white/5 rounded-xl flex-shrink-0 mt-0.5">
                    {sc.icon}
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white">{sc.name}</h4>
                    <p className="text-[11px] text-gray-400 mt-0.5 leading-relaxed">
                      {sc.description}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {isRecording ? (
                    <div className="flex items-center gap-1.5">
                      <div className="px-3.5 py-1.5 bg-brand-500 text-white text-xs font-bold rounded-xl animate-pulse shadow-md shadow-brand-500/30">
                        Pressione as teclas...
                      </div>
                      <button
                        type="button"
                        onClick={() => setRecordingId(null)}
                        className="p-1.5 text-gray-400 hover:text-white bg-black/40 hover:bg-white/10 rounded-xl border border-white/10 transition-colors cursor-pointer"
                        title="Cancelar (Esc)"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setRecordingId(sc.id)}
                        className="px-3 py-1.5 bg-background-darkest hover:bg-black/40 border border-white/10 hover:border-brand-500/50 rounded-xl text-xs text-gray-200 transition-all cursor-pointer flex items-center gap-1.5 shadow-sm active:scale-95"
                        title="Clique para gravar um novo atalho"
                      >
                        {formatKeyDisplay(currentKey)}
                      </button>

                      {currentKey !== sc.defaultKey && (
                        <button
                          type="button"
                          onClick={() => handleResetDefault(sc)}
                          className="p-1.5 text-gray-400 hover:text-white bg-background-darkest hover:bg-white/5 rounded-xl border border-white/5 transition-colors cursor-pointer"
                          title="Restaurar atalho padrão"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="p-3.5 bg-brand-500/10 border border-brand-500/20 rounded-2xl flex items-start gap-3 text-xs text-brand-300">
        <Sparkles className="w-4 h-4 flex-shrink-0 mt-0.5 text-brand-400" />
        <div>
          <span className="font-semibold block text-brand-200">Dica de Produtividade</span>
          No aplicativo desktop (Electron), estes atalhos funcionam globalmente enquanto você joga ou utiliza outros programas em segundo plano.
        </div>
      </div>
    </div>
  );
};
