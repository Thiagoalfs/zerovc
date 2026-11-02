import React from 'react';
import { Volume2, VolumeX, Play } from 'lucide-react';
import { useSettingsStore } from '../../stores/settingsStore';
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
import {
  MODAL_SECTION_HEADER_CLASS,
  MODAL_TOGGLE_HEADER_CLASS,
  MODAL_DESCRIPTION_CLASS,
  MODAL_DIVIDER_CLASS,
} from '../../constants/modalTypography';

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
    <div className="space-y-6 animate-in fade-in">
      {/* Desktop Notifications */}
      <div>
        <h4 className={MODAL_SECTION_HEADER_CLASS}>
          Notificações de Área de Trabalho
        </h4>
        <div className="flex items-center justify-between">
          <div className="space-y-0.5 pr-4">
            <span className={`${MODAL_TOGGLE_HEADER_CLASS} block`}>
              Exibir Notificações no Computador
            </span>
            <p className={`${MODAL_DESCRIPTION_CLASS} max-w-lg`}>
              Receba avisos instantâneos na área de trabalho quando alguém enviar mensagens diretas ou mencionar você.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={notificationsDesktop}
            onClick={() => setNotificationsDesktop(!notificationsDesktop)}
            className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors cursor-pointer flex-shrink-0 ${
              notificationsDesktop ? 'bg-brand-500' : 'bg-white/10'
            }`}
          >
            <div
              className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                notificationsDesktop ? 'translate-x-6' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>

      <div className={MODAL_DIVIDER_CLASS} />

      {/* Sound Volume Slider */}
      <div>
        <h4 className={MODAL_SECTION_HEADER_CLASS}>
          Volume dos Efeitos Sonoros
        </h4>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {soundVolume === 0 ? (
                <VolumeX className="w-4 h-4 text-gray-500" />
              ) : (
                <Volume2 className="w-4 h-4 text-brand-400" />
              )}
              <span className={MODAL_TOGGLE_HEADER_CLASS}>Volume dos Sons</span>
            </div>
            <span className="text-xs font-bold font-mono text-brand-400">{soundVolume}%</span>
          </div>

          <input
            type="range"
            min={0}
            max={100}
            value={soundVolume}
            onChange={(e) => setSoundVolume(Number(e.target.value))}
            className="w-full accent-brand-500 cursor-pointer h-2 bg-background-dark rounded-lg"
          />
        </div>
      </div>

      <div className={MODAL_DIVIDER_CLASS} />

      {/* Individual Sound Toggles with Test Buttons */}
      <div>
        <h4 className={MODAL_SECTION_HEADER_CLASS}>
          Efeitos Sonoros do Aplicativo
        </h4>
        <div className="space-y-4">
          {/* Voice Channel Join / Leave (Local User) */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5 pr-4">
              <span className={`${MODAL_TOGGLE_HEADER_CLASS} block`}>Sua Entrada e Saída de Chamadas</span>
              <p className={MODAL_DESCRIPTION_CLASS}>Toca o chime ao você entrar ou desconectar de um canal de voz.</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  playJoinVoiceSound();
                  setTimeout(playLeaveVoiceSound, 350);
                }}
                className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer border border-white/5"
              >
                <Play className="w-3 h-3 text-brand-400" />
                <span>Ouvir</span>
              </button>
              <button
                type="button"
                role="switch"
                aria-checked={soundChannelEvents}
                onClick={() => setSoundChannelEvents(!soundChannelEvents)}
                className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors duration-200 cursor-pointer flex-shrink-0 ${
                  soundChannelEvents ? 'bg-brand-500' : 'bg-white/10'
                }`}
              >
                <div
                  className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
                    soundChannelEvents ? 'translate-x-6' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Member Join / Leave Call (Other Users) */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5 pr-4">
              <span className={`${MODAL_TOGGLE_HEADER_CLASS} block`}>Entrada e Saída de Outros Usuários</span>
              <p className={MODAL_DESCRIPTION_CLASS}>Aviso sonoro suave quando alguém entra ou sai da chamada que você está participando.</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  playUserJoinCallSound();
                  setTimeout(playUserLeaveCallSound, 350);
                }}
                className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer border border-white/5"
              >
                <Play className="w-3 h-3 text-brand-400" />
                <span>Ouvir</span>
              </button>
              <button
                type="button"
                role="switch"
                aria-checked={soundUserJoinLeave}
                onClick={() => setSoundUserJoinLeave(!soundUserJoinLeave)}
                className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors duration-200 cursor-pointer flex-shrink-0 ${
                  soundUserJoinLeave ? 'bg-brand-500' : 'bg-white/10'
                }`}
              >
                <div
                  className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
                    soundUserJoinLeave ? 'translate-x-6' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Screen Share / Live Stream Start & Stop */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5 pr-4">
              <span className={`${MODAL_TOGGLE_HEADER_CLASS} block`}>Transmissão de Tela (Ao Vivo)</span>
              <p className={MODAL_DESCRIPTION_CLASS}>Alerta sonoro ao iniciar, entrar ou encerrar uma transmissão de tela na call.</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  playStartStreamSound();
                  setTimeout(playStopStreamSound, 350);
                }}
                className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer border border-white/5"
              >
                <Play className="w-3 h-3 text-brand-400" />
                <span>Ouvir</span>
              </button>
              <button
                type="button"
                role="switch"
                aria-checked={soundStreamEvents}
                onClick={() => setSoundStreamEvents(!soundStreamEvents)}
                className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors duration-200 cursor-pointer flex-shrink-0 ${
                  soundStreamEvents ? 'bg-brand-500' : 'bg-white/10'
                }`}
              >
                <div
                  className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
                    soundStreamEvents ? 'translate-x-6' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Mute / Unmute */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5 pr-4">
              <span className={`${MODAL_TOGGLE_HEADER_CLASS} block`}>Mutar e Desmutar Microfone</span>
              <p className={MODAL_DESCRIPTION_CLASS}>Feedback sonoro imediato ao alternar seu microfone.</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  playMuteSound();
                  setTimeout(playUnmuteSound, 250);
                }}
                className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer border border-white/5"
              >
                <Play className="w-3 h-3 text-brand-400" />
                <span>Ouvir</span>
              </button>
              <button
                type="button"
                role="switch"
                aria-checked={soundMuteEvents}
                onClick={() => setSoundMuteEvents(!soundMuteEvents)}
                className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors duration-200 cursor-pointer flex-shrink-0 ${
                  soundMuteEvents ? 'bg-brand-500' : 'bg-white/10'
                }`}
              >
                <div
                  className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
                    soundMuteEvents ? 'translate-x-6' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Messages and Mentions */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5 pr-4">
              <span className={`${MODAL_TOGGLE_HEADER_CLASS} block`}>Novas Mensagens e Menções</span>
              <p className={MODAL_DESCRIPTION_CLASS}>Alerta sonoro sutil ao receber mensagens no chat.</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => playMessageSound(false)}
                className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer border border-white/5"
              >
                <Play className="w-3 h-3 text-brand-400" />
                <span>Ouvir</span>
              </button>
              <button
                type="button"
                role="switch"
                aria-checked={soundMessageEvents}
                onClick={() => setSoundMessageEvents(!soundMessageEvents)}
                className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors duration-200 cursor-pointer flex-shrink-0 ${
                  soundMessageEvents ? 'bg-brand-500' : 'bg-white/10'
                }`}
              >
                <div
                  className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
                    soundMessageEvents ? 'translate-x-6' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Haptic Feedback (Mobile Vibration) */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5 pr-4">
              <span className={`${MODAL_TOGGLE_HEADER_CLASS} block`}>Resposta Tátil (Vibração no Celular)</span>
              <p className={MODAL_DESCRIPTION_CLASS}>Vibrações sutis ao segurar mensagens, reagir com emojis, mutar microfone e navegar.</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => hapticMedium()}
                className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer border border-white/5"
                title="Testar vibração"
              >
                <span>Testar</span>
              </button>
              <button
                type="button"
                role="switch"
                aria-checked={hapticFeedback}
                onClick={() => setHapticFeedback(!hapticFeedback)}
                className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors duration-200 cursor-pointer flex-shrink-0 ${
                  hapticFeedback ? 'bg-brand-500' : 'bg-white/10'
                }`}
              >
                <div
                  className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
                    hapticFeedback ? 'translate-x-6' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
