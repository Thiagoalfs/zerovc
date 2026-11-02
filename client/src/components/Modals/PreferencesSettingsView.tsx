import React, { useState } from 'react';
import { useSettingsStore } from '../../stores/settingsStore';
import {
  MODAL_SECTION_HEADER_CLASS,
  MODAL_TOGGLE_HEADER_CLASS,
  MODAL_DESCRIPTION_CLASS,
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
    <div className="space-y-6 animate-in fade-in">
      {/* Desktop and Window Behavior */}
      <div>
        <h4 className={MODAL_SECTION_HEADER_CLASS}>
          Comportamento do Aplicativo (Desktop)
        </h4>

        <div className="space-y-4">
          {/* Item: Manter na Gaveta / Bandeja */}
          <div className="flex items-center justify-between">
            <div className="space-y-1 pr-4">
              <div className="flex items-center gap-2">
                <span className={MODAL_TOGGLE_HEADER_CLASS}>
                  Manter na bandeja do sistema ao fechar
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-brand-400">
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
              onClick={() => setMinimizeToTray(!minimizeToTray)}
              className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors duration-200 cursor-pointer flex-shrink-0 ${
                minimizeToTray ? 'bg-brand-500' : 'bg-white/10'
              }`}
            >
              <div
                className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
                  minimizeToTray ? 'translate-x-6' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Item: Iniciar com o Windows / Sistema */}
          <div className="flex items-center justify-between">
            <div className="space-y-1 pr-4">
              <span className={`${MODAL_TOGGLE_HEADER_CLASS} block`}>
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
              onClick={() => setAutoStart(!autoStart)}
              className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors duration-200 cursor-pointer flex-shrink-0 ${
                autoStart ? 'bg-brand-500' : 'bg-white/10'
              }`}
            >
              <div
                className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
                  autoStart ? 'translate-x-6' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Item: Aceleração por Hardware */}
          <div className="pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="space-y-1 pr-4">
                <span className={`${MODAL_TOGGLE_HEADER_CLASS} block`}>
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
                onClick={() => setHardwareAcceleration(!hardwareAcceleration)}
                className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors duration-200 cursor-pointer flex-shrink-0 ${
                  hardwareAcceleration ? 'bg-brand-500' : 'bg-white/10'
                }`}
              >
                <div
                  className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
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
