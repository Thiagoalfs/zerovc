import React from 'react';
import { useStreamerModeStore } from '../../../stores/streamerModeStore';
import {
  MODAL_TOGGLE_HEADER_CLASS,
  MODAL_SECTION_HEADER_CLASS,
  MODAL_DIVIDER_CLASS,
  MODAL_DESCRIPTION_CLASS,
  MODAL_SWITCH_CONTAINER_CLASS,
  MODAL_SWITCH_KNOB_CLASS,
} from '../../../constants/modalTypography';

export const StreamerModeTab: React.FC = () => {
  const {
    enabled,
    autoDetect,
    censorUsernames,
    hidePersonalData,
    hideInviteLinks,
    disableSounds,
    disableNotifications,
    setEnabled,
    setAutoDetect,
    setCensorUsernames,
    setHidePersonalData,
    setHideInviteLinks,
    setDisableSounds,
    setDisableNotifications,
    dismissForSession,
  } = useStreamerModeStore();

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* -------------------------------------------------------------
          1. TOGGLE PRINCIPAL: ATIVAR MODO STREAMER
      ------------------------------------------------------------- */}
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-1 pr-4">
          <div className="flex items-center gap-2">
            <span id="streamer-mode-enabled-label" className={MODAL_TOGGLE_HEADER_CLASS}>
              Ativar Modo Streamer
            </span>
            <span
              className={`text-[10px] font-bold uppercase tracking-wider ${
                enabled
                  ? 'text-brand-400'
                  : 'text-gray-400'
              }`}
            >
              {enabled ? 'Ativo' : 'Desativado'}
            </span>
          </div>
          <p className={MODAL_DESCRIPTION_CLASS}>
            Proteja suas informações sensíveis, nomes de usuários e alertas sonoros contra vazamento na transmissão ou compartilhamento de tela.
          </p>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-labelledby="streamer-mode-enabled-label"
          onClick={() => {
            if (enabled) {
              dismissForSession();
            } else {
              setEnabled(true);
            }
          }}
          className={`${MODAL_SWITCH_CONTAINER_CLASS} ${
            enabled ? 'bg-brand-500' : 'bg-white/10'
          }`}
        >
          <div
            className={`${MODAL_SWITCH_KNOB_CLASS} ${
              enabled ? 'translate-x-6' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      <div className={MODAL_DIVIDER_CLASS} />

      {/* -------------------------------------------------------------
          2. GENERAL & AUTOMATION CONTROLS
      ------------------------------------------------------------- */}
      <div className="space-y-4">
        <h4 className={MODAL_SECTION_HEADER_CLASS}>
          Automação & Detecção
        </h4>

        {/* Toggle: Auto-detect */}
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-1 pr-4">
            <span id="streamer-mode-autodetect-label" className={`${MODAL_TOGGLE_HEADER_CLASS} block`}>
              Ativar automaticamente ao detectar softwares de streaming
            </span>
            <p className={MODAL_DESCRIPTION_CLASS}>
              O ZeroVC detecta a abertura do OBS Studio, Streamlabs, XSplit, Twitch Studio ou vMix e liga o modo
              streamer sozinho. Ao fechar os programas, ele se desliga automaticamente.
            </p>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={autoDetect}
            aria-labelledby="streamer-mode-autodetect-label"
            onClick={() => setAutoDetect(!autoDetect)}
            className={`${MODAL_SWITCH_CONTAINER_CLASS} ${
              autoDetect ? 'bg-brand-500' : 'bg-white/10'
            }`}
          >
            <div
              className={`${MODAL_SWITCH_KNOB_CLASS} ${
                autoDetect ? 'translate-x-6' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>

      <div className={MODAL_DIVIDER_CLASS} />

      {/* -------------------------------------------------------------
          3. PRIVACY PROTECTIONS (GRANULAR)
      ------------------------------------------------------------- */}
      <div className="space-y-4">
        <h4 className={MODAL_SECTION_HEADER_CLASS}>
          Proteções de Privacidade
        </h4>

        {/* Censurar Nomes de Usuários */}
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-1 pr-4">
            <span id="streamer-mode-censor-label" className={`${MODAL_TOGGLE_HEADER_CLASS} block`}>
              Censurar nomes de usuários (primeiras 3 letras)
            </span>
            <p className={MODAL_DESCRIPTION_CLASS}>
              Exibe apenas as 3 primeiras letras de todos os usuários seguidas de reticências no chat, listas de
              membros e canais de voz.
            </p>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={censorUsernames}
            aria-labelledby="streamer-mode-censor-label"
            onClick={() => setCensorUsernames(!censorUsernames)}
            className={`${MODAL_SWITCH_CONTAINER_CLASS} ${
              censorUsernames ? 'bg-brand-500' : 'bg-white/10'
            }`}
          >
            <div
              className={`${MODAL_SWITCH_KNOB_CLASS} ${
                censorUsernames ? 'translate-x-6' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Ocultar Informações Pessoais */}
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-1 pr-4">
            <span id="streamer-mode-personal-label" className={`${MODAL_TOGGLE_HEADER_CLASS} block`}>
              Ocultar informações pessoais
            </span>
            <p className={MODAL_DESCRIPTION_CLASS}>
              Mascara seu endereço de e-mail, IDs de conta e detalhes de rede nas abas de configurações.
            </p>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={hidePersonalData}
            aria-labelledby="streamer-mode-personal-label"
            onClick={() => setHidePersonalData(!hidePersonalData)}
            className={`${MODAL_SWITCH_CONTAINER_CLASS} ${
              hidePersonalData ? 'bg-brand-500' : 'bg-white/10'
            }`}
          >
            <div
              className={`${MODAL_SWITCH_KNOB_CLASS} ${
                hidePersonalData ? 'translate-x-6' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Ocultar Links de Convite */}
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-1 pr-4">
            <span id="streamer-mode-invites-label" className={`${MODAL_TOGGLE_HEADER_CLASS} block`}>
              Ocultar links de convite de servidores
            </span>
            <p className={MODAL_DESCRIPTION_CLASS}>
              Converte URLs e códigos de convites em bolinhas na tela (zerovc.safiroko.xyz/••••••••) para evitar invasões na sua live.
              O botão de copiar continua funcionando normalmente.
            </p>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={hideInviteLinks}
            aria-labelledby="streamer-mode-invites-label"
            onClick={() => setHideInviteLinks(!hideInviteLinks)}
            className={`${MODAL_SWITCH_CONTAINER_CLASS} ${
              hideInviteLinks ? 'bg-brand-500' : 'bg-white/10'
            }`}
          >
            <div
              className={`${MODAL_SWITCH_KNOB_CLASS} ${
                hideInviteLinks ? 'translate-x-6' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>

      <div className={MODAL_DIVIDER_CLASS} />

      {/* -------------------------------------------------------------
          5. SOUNDS & NOTIFICATIONS
      ------------------------------------------------------------- */}
      <div className="space-y-4">
        <h4 className={MODAL_SECTION_HEADER_CLASS}>
          Sons e Notificações
        </h4>

        {/* Desativar Notificações na Área de Trabalho */}
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-1 pr-4">
            <span id="streamer-mode-notifications-label" className={`${MODAL_TOGGLE_HEADER_CLASS} block`}>
              Desativar notificações na área de trabalho
            </span>
            <p className={MODAL_DESCRIPTION_CLASS}>
              Bloqueia alertas e popups nativos do Windows/desktop para evitar que prévias de conversas privadas apareçam na sua transmissão.
            </p>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={disableNotifications}
            aria-labelledby="streamer-mode-notifications-label"
            onClick={() => setDisableNotifications(!disableNotifications)}
            className={`${MODAL_SWITCH_CONTAINER_CLASS} ${
              disableNotifications ? 'bg-brand-500' : 'bg-white/10'
            }`}
          >
            <div
              className={`${MODAL_SWITCH_KNOB_CLASS} ${
                disableNotifications ? 'translate-x-6' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Silenciar Efeitos Sonoros */}
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-1 pr-4">
            <span id="streamer-mode-sounds-label" className={`${MODAL_TOGGLE_HEADER_CLASS} block`}>
              Silenciar efeitos sonoros do ZeroVC
            </span>
            <p className={MODAL_DESCRIPTION_CLASS}>
              Muta sons de novas mensagens, alertas de entrada e saída de pessoas nos canais de voz e pings.
            </p>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={disableSounds}
            aria-labelledby="streamer-mode-sounds-label"
            onClick={() => setDisableSounds(!disableSounds)}
            className={`${MODAL_SWITCH_CONTAINER_CLASS} ${
              disableSounds ? 'bg-brand-500' : 'bg-white/10'
            }`}
          >
            <div
              className={`${MODAL_SWITCH_KNOB_CLASS} ${
                disableSounds ? 'translate-x-6' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>
    </div>
  );
};
