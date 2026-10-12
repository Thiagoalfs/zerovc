import React from 'react';
import { useStreamerModeStore } from '../../../stores/streamerModeStore';
import {
  MODAL_TOGGLE_HEADER_CLASS,
  MODAL_SECTION_HEADER_CLASS,
  MODAL_DIVIDER_CLASS,
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
            <span className={MODAL_TOGGLE_HEADER_CLASS}>
              Ativar Modo Streamer
            </span>
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                enabled
                  ? 'bg-brand-500/20 text-brand-300 border border-brand-500/40'
                  : 'bg-white/10 text-gray-400'
              }`}
            >
              {enabled ? 'Ativo' : 'Desativado'}
            </span>
          </div>
          <p className="text-xs text-gray-400 leading-relaxed">
            Proteja suas informações sensíveis, nomes de usuários e alertas sonoros contra vazamento na transmissão ou compartilhamento de tela.
          </p>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={() => {
            if (enabled) {
              dismissForSession();
            } else {
              setEnabled(true);
            }
          }}
          className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors duration-200 cursor-pointer flex-shrink-0 ${
            enabled ? 'bg-brand-500' : 'bg-white/10'
          }`}
        >
          <div
            className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
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
            <span className={`${MODAL_TOGGLE_HEADER_CLASS} block`}>
              Ativar automaticamente ao detectar softwares de streaming
            </span>
            <p className="text-xs text-gray-400 leading-relaxed">
              O ZeroVC detecta a abertura do OBS Studio, Streamlabs, XSplit, Twitch Studio ou vMix e liga o modo
              streamer sozinho. Ao fechar os programas, ele se desliga automaticamente.
            </p>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={autoDetect}
            onClick={() => setAutoDetect(!autoDetect)}
            className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors duration-200 cursor-pointer flex-shrink-0 ${
              autoDetect ? 'bg-brand-500' : 'bg-white/10'
            }`}
          >
            <div
              className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
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
            <span className={`${MODAL_TOGGLE_HEADER_CLASS} block`}>
              Censurar nomes de usuários (primeiras 3 letras)
            </span>
            <p className="text-xs text-gray-400 leading-relaxed">
              Exibe apenas as 3 primeiras letras de todos os usuários seguidas de reticências no chat, listas de
              membros e canais de voz.
            </p>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={censorUsernames}
            onClick={() => setCensorUsernames(!censorUsernames)}
            className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors duration-200 cursor-pointer flex-shrink-0 ${
              censorUsernames ? 'bg-brand-500' : 'bg-white/10'
            }`}
          >
            <div
              className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
                censorUsernames ? 'translate-x-6' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Ocultar Informações Pessoais */}
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-1 pr-4">
            <span className={`${MODAL_TOGGLE_HEADER_CLASS} block`}>
              Ocultar informações pessoais
            </span>
            <p className="text-xs text-gray-400 leading-relaxed">
              Mascara seu endereço de e-mail, IDs de conta e detalhes de rede nas abas de configurações.
            </p>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={hidePersonalData}
            onClick={() => setHidePersonalData(!hidePersonalData)}
            className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors duration-200 cursor-pointer flex-shrink-0 ${
              hidePersonalData ? 'bg-brand-500' : 'bg-white/10'
            }`}
          >
            <div
              className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
                hidePersonalData ? 'translate-x-6' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Ocultar Links de Convite */}
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-1 pr-4">
            <span className={`${MODAL_TOGGLE_HEADER_CLASS} block`}>
              Ocultar links de convite de servidores
            </span>
            <p className="text-xs text-gray-400 leading-relaxed">
              Converte URLs e códigos de convites em bolinhas na tela (zerovc.safiroko.xyz/••••••••) para evitar invasões na sua live.
              O botão de copiar continua funcionando normalmente.
            </p>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={hideInviteLinks}
            onClick={() => setHideInviteLinks(!hideInviteLinks)}
            className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors duration-200 cursor-pointer flex-shrink-0 ${
              hideInviteLinks ? 'bg-brand-500' : 'bg-white/10'
            }`}
          >
            <div
              className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
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
            <span className={`${MODAL_TOGGLE_HEADER_CLASS} block`}>
              Desativar notificações na área de trabalho
            </span>
            <p className="text-xs text-gray-400 leading-relaxed">
              Bloqueia alertas e popups nativos do Windows/desktop para evitar que prévias de conversas privadas apareçam na sua transmissão.
            </p>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={disableNotifications}
            onClick={() => setDisableNotifications(!disableNotifications)}
            className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors duration-200 cursor-pointer flex-shrink-0 ${
              disableNotifications ? 'bg-brand-500' : 'bg-white/10'
            }`}
          >
            <div
              className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
                disableNotifications ? 'translate-x-6' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Silenciar Efeitos Sonoros */}
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-1 pr-4">
            <span className={`${MODAL_TOGGLE_HEADER_CLASS} block`}>
              Silenciar efeitos sonoros do ZeroVC
            </span>
            <p className="text-xs text-gray-400 leading-relaxed">
              Muta sons de novas mensagens, alertas de entrada e saída de pessoas nos canais de voz e pings.
            </p>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={disableSounds}
            onClick={() => setDisableSounds(!disableSounds)}
            className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors duration-200 cursor-pointer flex-shrink-0 ${
              disableSounds ? 'bg-brand-500' : 'bg-white/10'
            }`}
          >
            <div
              className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
                disableSounds ? 'translate-x-6' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>
    </div>
  );
};
