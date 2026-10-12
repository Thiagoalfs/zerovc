import React, { useState } from 'react';
import {
  Play,
} from 'lucide-react';
import { useSettingsStore } from '../../stores/settingsStore';
import { MODAL_TOGGLE_HEADER_CLASS, MODAL_SECTION_HEADER_CLASS } from '../../constants/modalTypography';

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
    <div className="space-y-6">
      {/* Group 1: Movimento & Contraste */}
      <div className="space-y-3">
        <h4 className={MODAL_SECTION_HEADER_CLASS}>
          Visão & Movimento
        </h4>

        <div className="divide-y divide-white/5">
          {/* Reduced Motion Toggle */}
          <div className="py-3 flex items-center justify-between gap-4">
            <div className="space-y-0.5 min-w-0">
              <div className={MODAL_TOGGLE_HEADER_CLASS}>
                Reduzir Movimento
              </div>
              <p className="text-[11px] text-gray-400 leading-relaxed">
                Desativa transições, animações rápidas e efeitos de movimento intenso para maior conforto visual.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={reducedMotion}
                onChange={(e) => setReducedMotion(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-10 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-500"></div>
            </label>
          </div>

          {/* High Contrast Toggle */}
          <div className="py-3 flex items-center justify-between gap-4">
            <div className="space-y-0.5 min-w-0">
              <div className={MODAL_TOGGLE_HEADER_CLASS}>
                Modo de Alto Contraste
              </div>
              <p className="text-[11px] text-gray-400 leading-relaxed">
                Realça bordas de botões, divisórias e textos para facilitar a distinção de elementos da interface.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={highContrast}
                onChange={(e) => setHighContrast(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-10 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-500"></div>
            </label>
          </div>
        </div>
      </div>

      <div className="border-t border-white/5" />

      {/* Group 3: Leitor de Mensagens (TTS) */}
      <div className="space-y-3">
        <h4 className={MODAL_SECTION_HEADER_CLASS}>
          Leitor de Mensagens por Voz (Text-to-Speech)
        </h4>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-0.5 min-w-0">
              <div className={MODAL_TOGGLE_HEADER_CLASS}>Leitura Automática de Novas Mensagens</div>
              <p className="text-[11px] text-gray-400 leading-relaxed">
                Quando ativado, novas mensagens recebidas no canal ativo são narradas automaticamente.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={textToSpeechEnabled}
                onChange={(e) => setTextToSpeechEnabled(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-10 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-500"></div>
            </label>
          </div>

          <div className="pt-2 flex items-center justify-between">
            <span className="text-[11px] text-gray-400">Verifique a saída do sintetizador no seu dispositivo</span>
            <button
              type="button"
              onClick={handleTestTTS}
              disabled={isSpeaking}
              className="px-3.5 py-1.5 rounded-xl bg-brand-500/20 hover:bg-brand-500/30 text-brand-300 font-semibold text-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Play className={`w-3.5 h-3.5 ${isSpeaking ? 'animate-pulse text-brand-400' : ''}`} />
              <span>{isSpeaking ? 'Reproduzindo...' : 'Testar Leitor de Voz'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
