import React, { useRef, useState } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { SquishSwitch } from '../ui/squish-switch';
import { SettingsGroup, SettingsRow } from '@/components/ui/settings-group';
import { InlineAlert } from '@/components/ui/inline-alert';

export const ActivityPrivacySettingsView: React.FC = () => {
  const { user, updateProfile, setUser } = useAuthStore();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const inFlightRef = useRef({ show_activity_status: false, auto_detect_activity: false });
  const desiredRef = useRef<{ show_activity_status?: boolean; auto_detect_activity?: boolean }>({});

  if (!user) return null;

  const toggleField = async (field: 'show_activity_status' | 'auto_detect_activity', next: boolean) => {
    const prev = user[field] !== false;
    desiredRef.current[field] = next;
    setErrorMsg(null);
    setUser({ [field]: next });

    if (inFlightRef.current[field]) return;
    inFlightRef.current[field] = true;
    let lastConfirmed = prev;
    try {
      while (desiredRef.current[field] !== lastConfirmed) {
        const target = desiredRef.current[field]!;
        try {
          await updateProfile({ [field]: target });
          lastConfirmed = target;
        } catch (err: any) {
          desiredRef.current[field] = lastConfirmed;
          setUser({ [field]: lastConfirmed });
          setErrorMsg(err?.message || 'Erro ao salvar configuração. Aguarde um instante.');
          break;
        }
      }
    } finally {
      inFlightRef.current[field] = false;
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      <div>
        <SettingsGroup title="Status de Atividade & Jogos">
          <SettingsRow
            label="Exibir atividade atual como mensagem de status"
            labelId="activity-status-toggle-label"
            description="Permite que outros usuários vejam qual jogo ou aplicativo você está executando em seu perfil e na lista de membros."
            control={
              <SquishSwitch
                aria-labelledby="activity-status-toggle-label"
                checked={user.show_activity_status !== false}
                onCheckedChange={(next) => toggleField('show_activity_status', next)}
              />
            }
          />

          <SettingsRow
            label="Detectar automaticamente jogos em execução"
            labelId="auto-detect-activity-toggle-label"
            description="Escaneia processos em segundo plano no desktop e sincroniza seu status de jogo em tempo real."
            control={
              <SquishSwitch
                aria-labelledby="auto-detect-activity-toggle-label"
                checked={user.auto_detect_activity !== false}
                onCheckedChange={(next) => toggleField('auto_detect_activity', next)}
              />
            }
          />
        </SettingsGroup>
        {errorMsg && (
          <InlineAlert variant="error" className="mt-3">
            {errorMsg}
          </InlineAlert>
        )}
      </div>
    </div>
  );
};
