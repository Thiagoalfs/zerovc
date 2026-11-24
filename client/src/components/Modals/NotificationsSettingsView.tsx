import React from 'react';
import { Volume2, VolumeX, Play } from 'lucide-react';
import { useSettingsStore } from '../../stores/settingsStore';
import { SquishSwitch } from '../ui/squish-switch';
import { ModalButton } from '@/components/ui/modal-button';
import { Slider } from '@/components/ui/slider';
import { SettingsGroup, SettingsRow } from '@/components/ui/settings-group';
import {
  playJoinVoiceSound,
  playLeaveVoiceSound,
  playUserJoinCallSound,
  playUserLeaveCallSound,
  playStartStreamSound,
  playStopStreamSound,
  playMuteSound,
  playUnmuteSound,
  playMessageSound,
} from '../../utils/audio';
import { hapticMedium } from '../../lib/haptics';
import { MODAL_TOGGLE_HEADER_CLASS } from '../../constants/modalTypography';

export const NotificationsSettingsView: React.FC = () => {
  const {
    notificationsDesktop,
    setNotificationsDesktop,
    soundVolume,
    setSoundVolume,
    soundChannelEvents,
    setSoundChannelEvents,
    soundUserJoinLeave,
    setSoundUserJoinLeave,
    soundStreamEvents,
    setSoundStreamEvents,
    soundMuteEvents,
    setSoundMuteEvents,
    soundMessageEvents,
    setSoundMessageEvents,
    hapticFeedback,
    setHapticFeedback,
  } = useSettingsStore();

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Desktop Notifications */}
      <SettingsGroup title="Notificações de Área de Trabalho">
        <SettingsRow
          label="Exibir Notificações no Computador"
          labelId="notif-desktop-label"
          description="Receba avisos instantâneos na área de trabalho quando alguém enviar mensagens diretas ou mencionar você."
          control={
            <SquishSwitch
              checked={notificationsDesktop}
              onCheckedChange={setNotificationsDesktop}
              aria-labelledby="notif-desktop-label"
            />
          }
        />
      </SettingsGroup>

      {/* Sound Volume Slider */}
      <SettingsGroup title="Volume dos Efeitos Sonoros">
        <div className="space-y-3 py-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {soundVolume === 0 ? (
                <VolumeX className="w-4 h-4 text-gray-500" />
              ) : (
                <Volume2 className="w-4 h-4 text-brand-400" />
              )}
              <span id="notif-sound-volume-label" className={MODAL_TOGGLE_HEADER_CLASS}>Volume dos Sons</span>
            </div>
            <span className="text-xs font-bold font-mono text-brand-400">{soundVolume}%</span>
          </div>

          <Slider
            min={0}
            max={100}
            step={1}
            value={[soundVolume]}
            aria-labelledby="notif-sound-volume-label"
            onValueChange={([val]) => setSoundVolume(val)}
          />
        </div>
      </SettingsGroup>

      {/* Individual Sound Toggles with Test Buttons */}
      <SettingsGroup title="Efeitos Sonoros do Aplicativo">
        <SettingsRow
          label="Sua Entrada e Saída de Chamadas"
          labelId="notif-sound-channel-label"
          description="Toca o chime ao você entrar ou desconectar de um canal de voz."
          control={
            <div className="flex items-center gap-3">
              <ModalButton
                type="secondary"
                size="tiny"
                onClick={() => {
                  playJoinVoiceSound();
                  setTimeout(playLeaveVoiceSound, 350);
                }}
                prefix={<Play className="w-3 h-3 text-brand-400" />}
              >
                Ouvir
              </ModalButton>
              <SquishSwitch
                checked={soundChannelEvents}
                onCheckedChange={setSoundChannelEvents}
                aria-labelledby="notif-sound-channel-label"
              />
            </div>
          }
        />

        <SettingsRow
          label="Entrada e Saída de Outros Usuários"
          labelId="notif-sound-user-label"
          description="Aviso sonoro suave quando alguém entra ou sai da chamada que você está participando."
          control={
            <div className="flex items-center gap-3">
              <ModalButton
                type="secondary"
                size="tiny"
                onClick={() => {
                  playUserJoinCallSound();
                  setTimeout(playUserLeaveCallSound, 350);
                }}
                prefix={<Play className="w-3 h-3 text-brand-400" />}
              >
                Ouvir
              </ModalButton>
              <SquishSwitch
                checked={soundUserJoinLeave}
                onCheckedChange={setSoundUserJoinLeave}
                aria-labelledby="notif-sound-user-label"
              />
            </div>
          }
        />

        <SettingsRow
          label="Transmissão de Tela (Ao Vivo)"
          labelId="notif-sound-stream-label"
          description="Alerta sonoro ao iniciar, entrar ou encerrar uma transmissão de tela na call."
          control={
            <div className="flex items-center gap-3">
              <ModalButton
                type="secondary"
                size="tiny"
                onClick={() => {
                  playStartStreamSound();
                  setTimeout(playStopStreamSound, 350);
                }}
                prefix={<Play className="w-3 h-3 text-brand-400" />}
              >
                Ouvir
              </ModalButton>
              <SquishSwitch
                checked={soundStreamEvents}
                onCheckedChange={setSoundStreamEvents}
                aria-labelledby="notif-sound-stream-label"
              />
            </div>
          }
        />

        <SettingsRow
          label="Mutar e Desmutar Microfone"
          labelId="notif-sound-mute-label"
          description="Feedback sonoro imediato ao alternar seu microfone."
          control={
            <div className="flex items-center gap-3">
              <ModalButton
                type="secondary"
                size="tiny"
                onClick={() => {
                  playMuteSound();
                  setTimeout(playUnmuteSound, 250);
                }}
                prefix={<Play className="w-3 h-3 text-brand-400" />}
              >
                Ouvir
              </ModalButton>
              <SquishSwitch
                checked={soundMuteEvents}
                onCheckedChange={setSoundMuteEvents}
                aria-labelledby="notif-sound-mute-label"
              />
            </div>
          }
        />

        <SettingsRow
          label="Novas Mensagens e Menções"
          labelId="notif-sound-message-label"
          description="Alerta sonoro sutil ao receber mensagens no chat."
          control={
            <div className="flex items-center gap-3">
              <ModalButton
                type="secondary"
                size="tiny"
                onClick={() => playMessageSound(false)}
                prefix={<Play className="w-3 h-3 text-brand-400" />}
              >
                Ouvir
              </ModalButton>
              <SquishSwitch
                checked={soundMessageEvents}
                onCheckedChange={setSoundMessageEvents}
                aria-labelledby="notif-sound-message-label"
              />
            </div>
          }
        />

        <SettingsRow
          label="Resposta Tátil (Vibração no Celular)"
          labelId="notif-haptic-label"
          description="Vibrações sutis ao segurar mensagens, reagir com emojis, mutar microfone e navegar."
          control={
            <div className="flex items-center gap-3">
              <ModalButton
                type="secondary"
                size="tiny"
                onClick={() => hapticMedium()}
                title="Testar vibração"
              >
                Testar
              </ModalButton>
              <SquishSwitch
                checked={hapticFeedback}
                onCheckedChange={setHapticFeedback}
                aria-labelledby="notif-haptic-label"
              />
            </div>
          }
        />
      </SettingsGroup>
    </div>
  );
};
