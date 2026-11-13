import React from 'react';
import { useAuthStore } from '../../stores/authStore';
import {
  MODAL_TOGGLE_HEADER_CLASS,
  MODAL_SECTION_HEADER_CLASS,
  MODAL_ITEM_ROW_PADDING_CLASS,
  MODAL_DESCRIPTION_CLASS,
  MODAL_SWITCH_CONTAINER_CLASS,
  MODAL_SWITCH_KNOB_CLASS,
} from '../../constants/modalTypography';

export const ActivityPrivacySettingsView: React.FC = () => {
  const { user, updateProfile, setUser } = useAuthStore();

  if (!user) return null;

  return (
    <div className="space-y-6 animate-in fade-in">
      <div>
        <h4 className={MODAL_SECTION_HEADER_CLASS}>
          Status de Atividade & Jogos
        </h4>

        <div className="rounded-2xl bg-background-darker/60 border border-white/5 px-4 py-3.5 divide-y divide-white/5">
          {/* Show Activity Status */}
          <div className={`${MODAL_ITEM_ROW_PADDING_CLASS} flex items-center justify-between gap-4`}>
            <div className="space-y-0.5 pr-4">
              <span
                id="activity-status-toggle-label"
                className={`${MODAL_TOGGLE_HEADER_CLASS} block`}
              >
                Exibir atividade atual como mensagem de status
              </span>
              <p className={`${MODAL_DESCRIPTION_CLASS} max-w-md`}>
                Permite que outros usuários vejam qual jogo ou aplicativo você está executando em seu perfil e na lista de membros.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-labelledby="activity-status-toggle-label"
              aria-checked={user.show_activity_status !== false}
              onClick={async () => {
                const currentVal = user.show_activity_status !== false;
                try {
                  const updated = await updateProfile({ show_activity_status: !currentVal });
                  setUser(updated);
                } catch (err) {
                  console.error('Failed to toggle show_activity_status:', err);
                }
              }}
              className={`${MODAL_SWITCH_CONTAINER_CLASS} ${
                user.show_activity_status !== false ? 'bg-brand-500' : 'bg-white/10'
              }`}
            >
              <div
                className={`${MODAL_SWITCH_KNOB_CLASS} ${
                  user.show_activity_status !== false ? 'translate-x-6' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Auto-detect activity in Electron */}
          <div className={`${MODAL_ITEM_ROW_PADDING_CLASS} flex items-center justify-between gap-4`}>
            <div className="space-y-0.5 pr-4">
              <span
                id="auto-detect-activity-toggle-label"
                className={`${MODAL_TOGGLE_HEADER_CLASS} block`}
              >
                Detectar automaticamente jogos em execução
              </span>
              <p className={`${MODAL_DESCRIPTION_CLASS} max-w-md`}>
                Escaneia processos em segundo plano no desktop e sincroniza seu status de jogo em tempo real.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-labelledby="auto-detect-activity-toggle-label"
              aria-checked={user.auto_detect_activity !== false}
              onClick={async () => {
                const currentVal = user.auto_detect_activity !== false;
                try {
                  const updated = await updateProfile({ auto_detect_activity: !currentVal });
                  setUser(updated);
                } catch (err) {
                  console.error('Failed to toggle auto_detect_activity:', err);
                }
              }}
              className={`${MODAL_SWITCH_CONTAINER_CLASS} ${
                user.auto_detect_activity !== false ? 'bg-brand-500' : 'bg-white/10'
              }`}
            >
              <div
                className={`${MODAL_SWITCH_KNOB_CLASS} ${
                  user.auto_detect_activity !== false ? 'translate-x-6' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
