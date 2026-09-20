import React from 'react';
import { Activity, ShieldCheck, Eye, Sparkles } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';

export const ActivityPrivacySettingsView: React.FC = () => {
  const { user, updateProfile, setUser } = useAuthStore();

  if (!user) return null;

  return (
    <div className="space-y-6 animate-in fade-in">
      <div>
        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">
          Status de Atividade & Jogos
        </h4>

        <div className="divide-y divide-white/5 space-y-4">
          {/* Show Activity Status */}
          <div className="flex items-center justify-between pt-2 first:pt-0">
            <div className="space-y-0.5 pr-4">
              <span className="text-xs font-bold text-white block">
                Exibir atividade atual como mensagem de status
              </span>
              <p className="text-[11px] text-gray-400 leading-relaxed max-w-md">
                Permite que outros usuários vejam qual jogo ou aplicativo você está executando em seu perfil e na lista de membros.
              </p>
            </div>
            <button
              type="button"
              role="switch"
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
              className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors duration-200 cursor-pointer flex-shrink-0 ${
                user.show_activity_status !== false ? 'bg-brand-500' : 'bg-white/10'
              }`}
            >
              <div
                className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
                  user.show_activity_status !== false ? 'translate-x-6' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Auto-detect activity in Electron */}
          <div className="flex items-center justify-between pt-3.5">
            <div className="space-y-0.5 pr-4">
              <span className="text-xs font-bold text-white block">
                Detectar automaticamente jogos em execução
              </span>
              <p className="text-[11px] text-gray-400 leading-relaxed max-w-md">
                Escaneia processos em segundo plano no desktop e sincroniza seu status de jogo em tempo real.
              </p>
            </div>
            <button
              type="button"
              role="switch"
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
              className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors duration-200 cursor-pointer flex-shrink-0 ${
                user.auto_detect_activity !== false ? 'bg-brand-500' : 'bg-white/10'
              }`}
            >
              <div
                className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
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
