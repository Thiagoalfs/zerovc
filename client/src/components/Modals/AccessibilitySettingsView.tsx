import React, { useState } from 'react';
import { Play } from 'lucide-react';
import { useSettingsStore } from '../../stores/settingsStore';
import { SquishSwitch } from '../ui/squish-switch';
import { ModalButton } from '@/components/ui/modal-button';
import { SettingsGroup, SettingsRow } from '@/components/ui/settings-group';

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
      <SettingsGroup title="Visão & Movimento">
        <SettingsRow
          label="Reduzir Movimento"
          labelId="a11y-reduced-motion-label"
          description="Desativa transições, animações rápidas e efeitos de movimento intenso para maior conforto visual."
          control={
            <SquishSwitch
              checked={reducedMotion}
              onCheckedChange={setReducedMotion}
              aria-labelledby="a11y-reduced-motion-label"
            />
          }
        />

        <SettingsRow
          label="Modo de Alto Contraste"
          labelId="a11y-high-contrast-label"
          description="Realça bordas de botões, divisórias e textos para facilitar a distinção de elementos da interface."
          control={
            <SquishSwitch
              checked={highContrast}
              onCheckedChange={setHighContrast}
              aria-labelledby="a11y-high-contrast-label"
            />
          }
        />
      </SettingsGroup>

      <SettingsGroup title="Leitor de Mensagens por Voz (Text-to-Speech)">
        <SettingsRow
          label="Leitura Automática de Novas Mensagens"
          labelId="a11y-tts-label"
          description="Quando ativado, novas mensagens recebidas no canal ativo são narradas automaticamente."
          control={
            <SquishSwitch
              checked={textToSpeechEnabled}
              onCheckedChange={setTextToSpeechEnabled}
              aria-labelledby="a11y-tts-label"
            />
          }
        />

        <SettingsRow
          label="Testar Sintetizador de Voz"
          description="Reproduz uma frase de demonstração para verificar a saída de áudio do leitor no seu dispositivo."
          control={
            <ModalButton
              type="secondary"
              size="small"
              onClick={handleTestTTS}
              disabled={isSpeaking}
              prefix={<Play className={`w-3.5 h-3.5 text-brand-400 ${isSpeaking ? 'animate-pulse' : ''}`} />}
              title="Testar áudio do leitor de voz"
            >
              {isSpeaking ? 'Reproduzindo...' : 'Testar Voz'}
            </ModalButton>
          }
        />
      </SettingsGroup>
    </div>
  );
};
