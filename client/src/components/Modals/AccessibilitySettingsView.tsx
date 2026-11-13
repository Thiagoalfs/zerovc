import React, { useState } from 'react';
import {
  Play,
} from 'lucide-react';
import { useSettingsStore } from '../../stores/settingsStore';
import {
  MODAL_TOGGLE_HEADER_CLASS,
  MODAL_SECTION_HEADER_CLASS,
  MODAL_DIVIDER_CLASS,
  MODAL_DESCRIPTION_CLASS,
  MODAL_SECONDARY_BUTTON_CLASS,
  MODAL_SWITCH_CONTAINER_CLASS,
  MODAL_SWITCH_KNOB_CLASS,
} from '../../constants/modalTypography';

export const AccessibilitySettingsView: React.FC = () => {
  const {
    reducedMotion,
    highContrast,
    textToSpeechEnabled,
    setReducedMotion,
    setHighContrast,
    setTextToSpeechEnabled,
  } = useSettingsStore();

  const [isSpeaking, setIsSpeaking] = useState(false);

  const handleTestTTS = () => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance('Olá! Este é o teste de áudio do leitor de mensagens do ZeroVC.');
    utterance.lang = 'pt-BR';
    utterance.rate = 1.0;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Group 1: Visão & Movimento */}
      <div>
        <h4 className={MODAL_SECTION_HEADER_CLASS}>
          Visão & Movimento
        </h4>

        <div className="space-y-4">
          {/* Reduced Motion Toggle */}
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-0.5 pr-4">
              <span id="a11y-reduced-motion-label" className={`${MODAL_TOGGLE_HEADER_CLASS} block`}>
                Reduzir Movimento
              </span>
              <p className={MODAL_DESCRIPTION_CLASS}>
                Desativa transições, animações rápidas e efeitos de movimento intenso para maior conforto visual.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={reducedMotion}
              aria-labelledby="a11y-reduced-motion-label"
              onClick={() => setReducedMotion(!reducedMotion)}
              className={`${MODAL_SWITCH_CONTAINER_CLASS} ${
                reducedMotion ? 'bg-brand-500' : 'bg-white/10'
              }`}
            >
              <div
                className={`${MODAL_SWITCH_KNOB_CLASS} ${
                  reducedMotion ? 'translate-x-6' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* High Contrast Toggle */}
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-0.5 pr-4">
              <span id="a11y-high-contrast-label" className={`${MODAL_TOGGLE_HEADER_CLASS} block`}>
                Modo de Alto Contraste
              </span>
              <p className={MODAL_DESCRIPTION_CLASS}>
                Realça bordas de botões, divisórias e textos para facilitar a distinção de elementos da interface.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={highContrast}
              aria-labelledby="a11y-high-contrast-label"
              onClick={() => setHighContrast(!highContrast)}
              className={`${MODAL_SWITCH_CONTAINER_CLASS} ${
                highContrast ? 'bg-brand-500' : 'bg-white/10'
              }`}
            >
              <div
                className={`${MODAL_SWITCH_KNOB_CLASS} ${
                  highContrast ? 'translate-x-6' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      <div className={MODAL_DIVIDER_CLASS} />

      {/* Group 2: Leitor de Mensagens (TTS) */}
      <div>
        <h4 className={MODAL_SECTION_HEADER_CLASS}>
          Leitor de Mensagens por Voz (Text-to-Speech)
        </h4>

        <div className="space-y-4">
          {/* Automatic Reading Toggle */}
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-0.5 pr-4">
              <span id="a11y-tts-label" className={`${MODAL_TOGGLE_HEADER_CLASS} block`}>
                Leitura Automática de Novas Mensagens
              </span>
              <p className={MODAL_DESCRIPTION_CLASS}>
                Quando ativado, novas mensagens recebidas no canal ativo são narradas automaticamente.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={textToSpeechEnabled}
              aria-labelledby="a11y-tts-label"
              onClick={() => setTextToSpeechEnabled(!textToSpeechEnabled)}
              className={`${MODAL_SWITCH_CONTAINER_CLASS} ${
                textToSpeechEnabled ? 'bg-brand-500' : 'bg-white/10'
              }`}
            >
              <div
                className={`${MODAL_SWITCH_KNOB_CLASS} ${
                  textToSpeechEnabled ? 'translate-x-6' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Test TTS Action Row */}
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-0.5 pr-4">
              <span className={`${MODAL_TOGGLE_HEADER_CLASS} block`}>
                Testar Sintetizador de Voz
              </span>
              <p className={MODAL_DESCRIPTION_CLASS}>
                Reproduz uma frase de demonstração para verificar a saída de áudio do leitor no seu dispositivo.
              </p>
            </div>
            <button
              type="button"
              onClick={handleTestTTS}
              disabled={isSpeaking}
              className={`${MODAL_SECONDARY_BUTTON_CLASS} flex items-center gap-2 shrink-0`}
              title="Testar áudio do leitor de voz"
            >
              <Play className={`w-3.5 h-3.5 text-brand-400 ${isSpeaking ? 'animate-pulse' : ''}`} />
              <span>{isSpeaking ? 'Reproduzindo...' : 'Testar Voz'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
