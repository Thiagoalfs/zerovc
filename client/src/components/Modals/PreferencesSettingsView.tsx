import React, { useState } from 'react';
import { useSettingsStore } from '../../stores/settingsStore';
import { SquishSwitch } from '../ui/squish-switch';
import { ModalButton } from '@/components/ui/modal-button';
import { SettingsGroup, SettingsRow } from '@/components/ui/settings-group';
import { InlineAlert } from '@/components/ui/inline-alert';

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
      <SettingsGroup title="Comportamento do Aplicativo (Desktop)">
        <SettingsRow
          label="Manter na bandeja do sistema ao fechar"
          labelId="pref-minimize-tray-label"
          badge={
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-brand-500/15 text-brand-400 border border-brand-500/20">
              Ativo por padrão
            </span>
          }
          description="Ao clicar no botão de fechar (✕), o ZeroVC permanece aberto na gaveta / bandeja do sistema (próximo ao relógio) para você continuar em chamadas de voz e receber notificações sem interrupções."
          control={
            <SquishSwitch
              checked={minimizeToTray}
              onCheckedChange={setMinimizeToTray}
              aria-labelledby="pref-minimize-tray-label"
            />
          }
        />

        <SettingsRow
          label="Inicializar com o Sistema Operacional"
          labelId="pref-auto-start-label"
          description="Abre o ZeroVC automaticamente ao ligar o computador (em segundo plano na bandeja), pronto para uso imediato."
          control={
            <SquishSwitch
              checked={autoStart}
              onCheckedChange={setAutoStart}
              aria-labelledby="pref-auto-start-label"
            />
          }
        />

        <SettingsRow
          label="Aceleração Gráfica por Hardware (GPU)"
          labelId="pref-hw-accel-label"
          description="Utiliza a placa de vídeo para renderização com alto desempenho e codificação nativa (NVENC/AMF/QSV) nas transmissões."
          control={
            <SquishSwitch
              checked={hardwareAcceleration}
              onCheckedChange={setHardwareAcceleration}
              aria-labelledby="pref-hw-accel-label"
            />
          }
        >
          {hasHwAccelChanged && typeof window !== 'undefined' && window.electronAPI?.relaunchApp && (
            <InlineAlert variant="info" className="items-center animate-in fade-in">
              <div className="flex items-center justify-between gap-3">
                <span>A alteração da aceleração de hardware no Electron requer reiniciar o app.</span>
                <ModalButton
                  type="primary"
                  size="small"
                  onClick={() => window.electronAPI?.relaunchApp?.()}
                  className="shrink-0"
                >
                  Reiniciar Agora
                </ModalButton>
              </div>
            </InlineAlert>
          )}
        </SettingsRow>
      </SettingsGroup>
    </div>
  );
};
