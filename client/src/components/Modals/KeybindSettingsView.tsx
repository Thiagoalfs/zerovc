import React, { useState, useEffect } from 'react';
import { Keyboard, Mic, Headphones, Monitor, Radio, RotateCcw, Check, Sparkles, X } from 'lucide-react';
import { isElectron } from '../../lib/platform';
import { ModalButton } from '@/components/ui/modal-button';
import { SettingsGroup } from '@/components/ui/settings-group';
import {
  MODAL_TOGGLE_HEADER_CLASS,
  MODAL_DESCRIPTION_CLASS,
  MODAL_ITEM_ROW_PADDING_CLASS,
} from '../../constants/modalTypography';

export interface ShortcutConfig {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  defaultKey: string;
  storageKey: string;
  electronAction: string;
}

export const SHORTCUTS: ShortcutConfig[] = [
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

export const registeredGlobalActions = new Set<string>();

export const normalizeEventKey = (e: KeyboardEvent): string => {
  let keyName = e.code || e.key;
  if (keyName.startsWith('Key')) keyName = keyName.slice(3);
  else if (keyName.startsWith('Digit')) keyName = keyName.slice(5);
  else if (keyName === 'Space' || keyName === ' ') keyName = 'Space';
  return keyName;
};

export const eventToKeyCombo = (e: KeyboardEvent): string => {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('Control');
  if (e.shiftKey) parts.push('Shift');
  if (e.altKey) parts.push('Alt');
  parts.push(normalizeEventKey(e));
  return parts.join('+');
};

export const syncElectronShortcuts = async (bindingsOverride?: Record<string, string>) => {
  registeredGlobalActions.clear();
  if (!isElectron() || !window.electronAPI?.registerGlobalShortcut) return;
  try {
    await window.electronAPI.unregisterAllShortcuts?.();
  } catch {}
  for (const sc of SHORTCUTS) {
    if (sc.id === 'ptt_key') continue; // PTT is handled in renderer
    const key = bindingsOverride?.[sc.id] ?? localStorage.getItem(sc.storageKey) ?? sc.defaultKey;
    if (key) {
      const accelerator = key.replace(/Control/g, 'CommandOrControl');
      try {
        const ok = await window.electronAPI.registerGlobalShortcut(accelerator, sc.electronAction);
        if (ok) registeredGlobalActions.add(sc.electronAction);
      } catch {}
    }
  }
};

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
    void syncElectronShortcuts(newBindings);
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

      const keyCombination = eventToKeyCombo(e);

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
      {savedSuccess && (
        <div className="flex items-center justify-end">
          <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full text-xs font-semibold animate-in fade-in">
            <Check className="w-3.5 h-3.5" />
            <span>Salvo!</span>
          </div>
        </div>
      )}

      <SettingsGroup>
        {SHORTCUTS.map((sc) => {
          const isRecording = recordingId === sc.id;
          const currentKey = bindings[sc.id] || sc.defaultKey;

          return (
            <div
              key={sc.id}
              className={`${MODAL_ITEM_ROW_PADDING_CLASS} transition-all ${
                isRecording
                  ? 'bg-brand-500/10 px-3 rounded-xl'
                  : ''
              }`}
            >
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-white/5 rounded-xl flex-shrink-0 mt-0.5">
                    {sc.icon}
                  </div>
                  <div>
                    <h4 className={MODAL_TOGGLE_HEADER_CLASS}>{sc.name}</h4>
                    <p className={`${MODAL_DESCRIPTION_CLASS} mt-0.5`}>
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
                      <ModalButton
                        type="tertiary"
                        svgOnly
                        size="small"
                        onClick={() => setRecordingId(null)}
                        title="Cancelar (Esc)"
                        aria-label="Cancelar gravação de atalho"
                      >
                        <X className="w-3.5 h-3.5" />
                      </ModalButton>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setRecordingId(sc.id)}
                        className="px-3 py-1.5 bg-background-darkest hover:bg-black/40 border border-white/10 hover:border-brand-500/50 rounded-xl text-xs text-gray-200 transition-all cursor-pointer flex items-center gap-1.5 shadow-sm active:scale-95"
                        aria-label="Clique para gravar um novo atalho"
                      >
                        {formatKeyDisplay(currentKey)}
                      </button>

                      {currentKey !== sc.defaultKey && (
                        <ModalButton
                          type="tertiary"
                          svgOnly
                          size="small"
                          onClick={() => handleResetDefault(sc)}
                          title="Restaurar atalho padrão"
                          aria-label="Restaurar atalho padrão"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </ModalButton>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </SettingsGroup>
    </div>
  );
};
