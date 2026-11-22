import React from 'react';
import { useStreamerModeStore } from '../../../stores/streamerModeStore';
import { SquishSwitch } from '../../ui/squish-switch';
import { SettingsGroup, SettingsRow } from '../../ui/settings-group';

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
      <SettingsGroup>
        <SettingsRow
          label="Ativar Modo Streamer"
          badge={
            <span
              className={`text-[10px] font-bold uppercase tracking-wider ${
                enabled ? 'text-brand-400' : 'text-gray-400'
              }`}
            >
              {enabled ? 'Ativo' : 'Desativado'}
            </span>
          }
          description="Proteja suas informações sensíveis, nomes de usuários e alertas sonoros contra vazamento na transmissão ou compartilhamento de tela."
          control={
            <SquishSwitch
              aria-label="Ativar Modo Streamer"
              checked={enabled}
              onCheckedChange={(next) => (next ? setEnabled(true) : dismissForSession())}
            />
          }
        />
      </SettingsGroup>

      <SettingsGroup title="Automação & Detecção">
        <SettingsRow
          label="Ativar automaticamente ao detectar softwares de streaming"
          description="O ZeroVC detecta a abertura do OBS Studio, Streamlabs, XSplit, Twitch Studio ou vMix e liga o modo streamer sozinho. Ao fechar os programas, ele se desliga automaticamente."
          control={
            <SquishSwitch
              aria-label="Ativar automaticamente ao detectar softwares de streaming"
              checked={autoDetect}
              onCheckedChange={setAutoDetect}
            />
          }
        />
      </SettingsGroup>

      <SettingsGroup title="Proteções de Privacidade">
        <SettingsRow
          label="Censurar nomes de usuários (primeiras 3 letras)"
          description="Exibe apenas as 3 primeiras letras de todos os usuários seguidas de reticências no chat, listas de membros e canais de voz."
          control={
            <SquishSwitch
              aria-label="Censurar nomes de usuários (primeiras 3 letras)"
              checked={censorUsernames}
              onCheckedChange={setCensorUsernames}
            />
          }
        />

        <SettingsRow
          label="Ocultar informações pessoais"
          description="Mascara seu endereço de e-mail, IDs de conta e detalhes de rede nas abas de configurações."
          control={
            <SquishSwitch
              aria-label="Ocultar informações pessoais"
              checked={hidePersonalData}
              onCheckedChange={setHidePersonalData}
            />
          }
        />

        <SettingsRow
          label="Ocultar links de convite de servidores"
          description="Converte URLs e códigos de convites em bolinhas na tela (zerovc.safiroko.xyz/••••••••) para evitar invasões na sua live. O botão de copiar continua funcionando normalmente."
          control={
            <SquishSwitch
              aria-label="Ocultar links de convite de servidores"
              checked={hideInviteLinks}
              onCheckedChange={setHideInviteLinks}
            />
          }
        />
      </SettingsGroup>

      <SettingsGroup title="Sons e Notificações">
        <SettingsRow
          label="Desativar notificações na área de trabalho"
          description="Bloqueia alertas e popups nativos do Windows/desktop para evitar que prévias de conversas privadas apareçam na sua transmissão."
          control={
            <SquishSwitch
              aria-label="Desativar notificações na área de trabalho"
              checked={disableNotifications}
              onCheckedChange={setDisableNotifications}
            />
          }
        />

        <SettingsRow
          label="Silenciar efeitos sonoros do ZeroVC"
          description="Muta sons de novas mensagens, alertas de entrada e saída de pessoas nos canais de voz e pings."
          control={
            <SquishSwitch
              aria-label="Silenciar efeitos sonoros do ZeroVC"
              checked={disableSounds}
              onCheckedChange={setDisableSounds}
            />
          }
        />
      </SettingsGroup>
    </div>
  );
};
