import React, { useState } from 'react';
import {
  Eye,
  Type,
  Volume2,
  Play,
  ZapOff,
  Contrast,
} from 'lucide-react';
import { useSettingsStore } from '../../stores/settingsStore';

export const AccessibilitySettingsView: React.FC = () => {
  const {
    reducedMotion,
    chatFontSize,
    highContrast,
    textToSpeechEnabled,
    setReducedMotion,
    setChatFontSize,
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
      {/* Header */}
      <div>
        <h3 className="text-base font-bold text-white">
          Central de Acessibilidade
        </h3>
        <p className="text-xs text-gray-400 mt-1">
          Personalize a legibilidade, escala de texto, animações e leitor por voz para a melhor experiência.
        </p>
      </div>

      {/* Group 1: Tipografia & Escala de Texto */}
      <div className="space-y-3">
        <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block">
          Tamanho da Fonte das Mensagens
        </span>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-white">Escala Tipográfica do Chat</span>
            <span className="text-xs font-bold text-brand-400 bg-brand-500/10 px-2.5 py-1 rounded-xl border border-brand-500/20">
              {chatFontSize}px
            </span>
          </div>

          <div className="space-y-2">
            <input
              type="range"
              min="12"
              max="22"
              step="1"
              value={chatFontSize}
              onChange={(e) => setChatFontSize(Number(e.target.value))}
              className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-brand-500"
            />
            <div className="flex justify-between text-[10px] text-gray-500 font-medium px-1">
              <span>12px (Compacto)</span>
              <span>14px (Padrão)</span>
              <span>18px (Grande)</span>
              <span>22px (Extra Grande)</span>
            </div>
          </div>

          {/* Live Chat Message Preview */}
          <div className="pt-2">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-2">
              Pré-visualização
            </span>
            <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-brand-500 flex items-center justify-center font-bold text-white text-xs shrink-0 shadow-md">
                Z
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-white">ZeroVC</span>
                  <span className="text-[10px] text-gray-500">Hoje às 14:30</span>
                </div>
                <div
                  style={{ fontSize: `${chatFontSize}px` }}
                  className="text-gray-200 leading-relaxed transition-all duration-150"
                >
                  Esta é uma mensagem de exemplo com a escala tipográfica selecionada ({chatFontSize}px). As mensagens do chat seguirão exatamente este tamanho!
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-white/5" />

      {/* Group 2: Movimento & Contraste */}
      <div className="space-y-3">
        <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block">
          Visão & Movimento
        </span>

        <div className="divide-y divide-white/5">
          {/* Reduced Motion Toggle */}
          <div className="py-3 flex items-center justify-between gap-4">
            <div className="space-y-0.5 min-w-0">
              <div className="text-xs font-semibold text-white">
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
              <div className="text-xs font-semibold text-white">
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
        <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block">
          Leitor de Mensagens por Voz (Text-to-Speech)
        </span>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-0.5 min-w-0">
              <div className="text-xs font-semibold text-white">Leitura Automática de Novas Mensagens</div>
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
