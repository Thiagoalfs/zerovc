import React, { useState } from 'react';
import { useSettingsStore } from '../../stores/settingsStore';
import {
  MODAL_SECTION_HEADER_CLASS,
  MODAL_TOGGLE_HEADER_CLASS,
  MODAL_DESCRIPTION_CLASS,
  MODAL_ITEM_ROW_PADDING_CLASS,
  MODAL_SWITCH_CONTAINER_CLASS,
  MODAL_SWITCH_KNOB_CLASS,
} from '../../constants/modalTypography';

export const PreferencesSettingsView: React.FC = () => {
  const {
    minimizeToTray,
    autoStart,
    hardwareAcceleration,
    setMinimizeToTray,
    setAutoStart,
    setHardwareAcceleration,
  } = useSettingsStore();

  const [initialHwAccel] = useState(hardwareAcceleration);
  const hasHwAccelChanged = initialHwAccel !== hardwareAcceleration;

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Desktop and Window Behavior */}
      <div>
        <h4 className={MODAL_SECTION_HEADER_CLASS}>
          Comportamento do Aplicativo (Desktop)
        </h4>

        <div className="rounded-2xl bg-background-darker/60 border border-white/5 px-4 py-3.5 divide-y divide-white/5">
          {/* Item: Manter na Gaveta / Bandeja */}
          <div className={`${MODAL_ITEM_ROW_PADDING_CLASS} flex items-center justify-between gap-4`}>
            <div className="space-y-1 pr-4">
              <div className="flex flex-wrap items-center gap-2">
                <span id="pref-minimize-tray-label" className={MODAL_TOGGLE_HEADER_CLASS}>
                  Manter na bandeja do sistema ao fechar
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-brand-500/15 text-brand-400 border border-brand-500/20">
                  Ativo por padrão
                </span>
              </div>
              <p className={`${MODAL_DESCRIPTION_CLASS} max-w-xl`}>
                Ao clicar no botão de fechar (✕), o ZeroVC permanece aberto na gaveta / bandeja do sistema (próximo ao relógio) para você continuar em chamadas de voz e receber notificações sem interrupções.
              </p>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={minimizeToTray}
              aria-labelledby="pref-minimize-tray-label"
              onClick={() => setMinimizeToTray(!minimizeToTray)}
              className={`${MODAL_SWITCH_CONTAINER_CLASS} ${
                minimizeToTray ? 'bg-brand-500' : 'bg-white/10'
              }`}
            >
              <div
                className={`${MODAL_SWITCH_KNOB_CLASS} ${
                  minimizeToTray ? 'translate-x-6' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Item: Iniciar com o Windows / Sistema */}
          <div className={`${MODAL_ITEM_ROW_PADDING_CLASS} flex items-center justify-between gap-4`}>
            <div className="space-y-1 pr-4">
              <span id="pref-auto-start-label" className={`${MODAL_TOGGLE_HEADER_CLASS} block`}>
                Inicializar com o Sistema Operacional
              </span>
              <p className={`${MODAL_DESCRIPTION_CLASS} max-w-xl`}>
                Abre o ZeroVC automaticamente ao ligar o computador (em segundo plano na bandeja), pronto para uso imediato.
              </p>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={autoStart}
              aria-labelledby="pref-auto-start-label"
              onClick={() => setAutoStart(!autoStart)}
              className={`${MODAL_SWITCH_CONTAINER_CLASS} ${
                autoStart ? 'bg-brand-500' : 'bg-white/10'
              }`}
            >
              <div
                className={`${MODAL_SWITCH_KNOB_CLASS} ${
                  autoStart ? 'translate-x-6' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Item: Aceleração por Hardware */}
          <div className={`${MODAL_ITEM_ROW_PADDING_CLASS} space-y-3`}>
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-1 pr-4">
                <span id="pref-hw-accel-label" className={`${MODAL_TOGGLE_HEADER_CLASS} block`}>
                  Aceleração Gráfica por Hardware (GPU)
                </span>
                <p className={`${MODAL_DESCRIPTION_CLASS} max-w-xl`}>
                  Utiliza a placa de vídeo para renderização com alto desempenho e codificação nativa (NVENC/AMF/QSV) nas transmissões.
                </p>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={hardwareAcceleration}
                aria-labelledby="pref-hw-accel-label"
                onClick={() => setHardwareAcceleration(!hardwareAcceleration)}
                className={`${MODAL_SWITCH_CONTAINER_CLASS} ${
                  hardwareAcceleration ? 'bg-brand-500' : 'bg-white/10'
                }`}
              >
                <div
                  className={`${MODAL_SWITCH_KNOB_CLASS} ${
                    hardwareAcceleration ? 'translate-x-6' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {hasHwAccelChanged && typeof window !== 'undefined' && window.electronAPI?.relaunchApp && (
              <div className="p-3 bg-brand-500/10 border border-brand-500/20 rounded-xl flex items-center justify-between gap-3 text-xs text-brand-300 animate-in fade-in">
                <span>A alteração da aceleração de hardware no Electron requer reiniciar o app.</span>
                <button
                  type="button"
                  onClick={() => window.electronAPI?.relaunchApp?.()}
                  className="bg-brand-500 hover:bg-brand-600 text-white font-semibold px-3 py-1.5 rounded-lg transition-colors cursor-pointer flex-shrink-0 shadow"
                >
                  Reiniciar Agora
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
