import React, { useState, useEffect, useCallback } from 'react';
import {
  Smartphone,
  Globe,
  ShieldCheck,
  Trash2,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  RefreshCw,
  Clock,
  MapPin,
  Laptop,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';
import { UserSession } from '../../types';
import { fetchLocationFromIP } from '../../utils/location';
import {
  MODAL_TOGGLE_HEADER_CLASS,
  MODAL_SECTION_HEADER_CLASS,
  MODAL_DIALOG_TITLE_CLASS,
  MODAL_CARD_PADDING_CLASS,
  MODAL_ITEM_ROW_PADDING_CLASS,
  MODAL_DIVIDER_CLASS,
  MODAL_DESCRIPTION_CLASS,
  MODAL_SECONDARY_BUTTON_CLASS,
  MODAL_DANGER_BUTTON_CLASS,
} from '../../constants/modalTypography';

interface DeviceItem {
  id: string;
  user_id: string;
  curve25519_key: string;
  ed25519_key: string;
  revoked_at?: string | null;
  created_at: string;
}

const SessionLocationItem: React.FC<{ ip?: string; isSmall?: boolean }> = ({ ip, isSmall }) => {
  const [location, setLocation] = useState<string>('Calculando localização...');
  const [isLocLoading, setIsLocLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    if (!ip) {
      setLocation('Localização indisponível');
      setIsLocLoading(false);
      return;
    }
    setIsLocLoading(true);
    fetchLocationFromIP(ip).then((loc) => {
      if (isMounted) {
        setLocation(loc);
        setIsLocLoading(false);
      }
    });
    return () => {
      isMounted = false;
    };
  }, [ip]);

  return (
    <span className="flex items-center gap-1">
      <MapPin className={`${isSmall ? 'w-3 h-3' : 'w-3.5 h-3.5'} text-gray-500 shrink-0`} />
      <span className={isLocLoading ? 'text-gray-500 italic' : ''}>{location}</span>
    </span>
  );
};

export const SessionsSettingsView: React.FC = () => {
  const { user } = useAuthStore();
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [devices, setDevices] = useState<DeviceItem[]>([]);
  const [currentDeviceId, setCurrentDeviceId] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Revocation modals state
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [isRevokingOthers, setIsRevokingOthers] = useState(false);
  const [confirmRevokeOtherOpen, setConfirmRevokeOtherOpen] = useState(false);
  const [confirmRevokeSingle, setConfirmRevokeSingle] = useState<UserSession | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const cachedDevId = typeof localStorage !== 'undefined' ? localStorage.getItem('zerovc_device_id') : null;
    setCurrentDeviceId(cachedDevId);

    try {
      const [sessionsData, devicesData] = await Promise.all([
        api.auth.getSessions().catch(() => []),
        user?.id ? api.e2ee.getUserDevices(user.id).catch(() => []) : Promise.resolve([]),
      ]);

      setSessions(sessionsData || []);
      setDevices(devicesData || []);
    } catch (err: any) {
      setError(err?.message || 'Não foi possível carregar os dispositivos e sessões ativas.');
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRevokeSingle = async (session: UserSession) => {
    setRevokingId(session.id);
    setError(null);
    setSuccessMessage(null);
    try {
      await api.auth.revokeSession(session.id);
      setSessions((prev) => prev.filter((s) => s.id !== session.id));
      setSuccessMessage('Sessão remota desconectada com sucesso.');
      setConfirmRevokeSingle(null);
    } catch (err: any) {
      setError(err?.message || 'Falha ao desconectar a sessão.');
    } finally {
      setRevokingId(null);
    }
  };

  const handleRevokeDeviceOnly = async (deviceId: string) => {
    setRevokingId(deviceId);
    setError(null);
    setSuccessMessage(null);
    try {
      await api.e2ee.revokeDevice(deviceId);
      setDevices((prev) => prev.filter((d) => d.id !== deviceId));
      setSuccessMessage('Aparelho desconectado com sucesso.');
    } catch (err: any) {
      setError(err?.message || 'Falha ao revogar o aparelho.');
    } finally {
      setRevokingId(null);
    }
  };

  const handleRevokeOthers = async () => {
    setIsRevokingOthers(true);
    setError(null);
    setSuccessMessage(null);
    try {
      await api.auth.revokeOtherSessions();
      setSessions((prev) => prev.filter((s) => s.is_current));

      // Also revoke remote E2EE devices if any
      if (currentDeviceId) {
        const others = devices.filter((d) => d.id !== currentDeviceId);
        for (const dev of others) {
          try {
            await api.e2ee.revokeDevice(dev.id);
          } catch {}
        }
        setDevices((prev) => prev.filter((d) => d.id === currentDeviceId));
      }

      setSuccessMessage('Todas as outras sessões foram desconectadas com sucesso.');
      setConfirmRevokeOtherOpen(false);
    } catch (err: any) {
      setError(err?.message || 'Falha ao desconectar as outras sessões.');
    } finally {
      setIsRevokingOthers(false);
    }
  };

  const formatLastActive = (dateString: string) => {
    if (!dateString) return 'Ativo recentemente';
    try {
      const date = new Date(dateString);
      const diffMs = Date.now() - date.getTime();
      const diffMinutes = Math.floor(diffMs / (1000 * 60));
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffMinutes < 2) return 'Ativo agora';
      if (diffMinutes < 60) return `Ativo há ${diffMinutes} min`;
      if (diffHours < 24) return `Ativo há ${diffHours}h`;
      if (diffDays === 1) return 'Ativo ontem';
      return `Ativo em ${date.toLocaleDateString('pt-BR')} às ${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    } catch {
      return dateString;
    }
  };

  const getDeviceIcon = (deviceType: string, os: string) => {
    const osLower = (os || '').toLowerCase();
    if (deviceType === 'desktop' || osLower.includes('windows') || osLower.includes('mac') || osLower.includes('linux')) {
      return <Laptop className="w-5 h-5 text-brand-400" />;
    }
    if (deviceType === 'mobile' || osLower.includes('android') || osLower.includes('ios')) {
      return <Smartphone className="w-5 h-5 text-emerald-400" />;
    }
    return <Globe className="w-5 h-5 text-cyan-400" />;
  };

  const currentSession = sessions.find((s) => s.is_current);
  const otherSessions = sessions.filter((s) => !s.is_current);
  const otherDevices = devices.filter((d) => d.id !== currentDeviceId);

  return (
    <div className="space-y-6">
      {/* Success Banner */}
      {successMessage && (
        <div className="flex items-center gap-2.5 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="flex items-center gap-2.5 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs animate-in fade-in">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {isLoading && sessions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-gray-400 space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-brand-400" />
          <span className="text-xs font-medium">Buscando dispositivos e sessões ativas...</span>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Current Device */}
          {currentSession && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className={MODAL_SECTION_HEADER_CLASS}>
                  Este Dispositivo
                </h4>
                <button
                  type="button"
                  aria-label="Atualizar lista de sessões ativas"
                  onClick={loadData}
                  disabled={isLoading}
                  className="p-1.5 -mt-2 rounded-xl hover:bg-white/10 text-gray-400 hover:text-white transition-colors cursor-pointer disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                  title="Atualizar lista de sessões"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-brand-400' : ''}`} />
                </button>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 py-1">
                <div className="flex items-start gap-3.5 min-w-0">
                  <div className="p-2.5 rounded-xl bg-white/5 text-brand-300 shrink-0 mt-0.5">
                    {getDeviceIcon(currentSession.device_type, currentSession.os)}
                  </div>
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`${MODAL_TOGGLE_HEADER_CLASS} truncate`}>
                        {currentSession.os || 'Dispositivo'} • {currentSession.browser || 'Navegador'}
                      </span>
                      <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        Sessão Atual
                      </span>
                      <span className="text-xs font-semibold text-brand-400 flex items-center gap-1">
                        <ShieldCheck className="w-3.5 h-3.5 text-brand-400" />
                        Criptografia de Ponta a Ponta Ativa
                      </span>
                    </div>

                    <div className={`flex items-center gap-3 ${MODAL_DESCRIPTION_CLASS} flex-wrap`}>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-gray-500" />
                        {formatLastActive(currentSession.last_active_at)}
                      </span>
                      <SessionLocationItem ip={currentSession.ip_address} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Divider */}
          <div className={MODAL_DIVIDER_CLASS} />

          {/* Other Devices List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className={MODAL_SECTION_HEADER_CLASS}>
                Outros Dispositivos Conectados ({otherSessions.length})
              </h4>
              {otherSessions.length > 0 && (
                <button
                  type="button"
                  onClick={() => setConfirmRevokeOtherOpen(true)}
                  disabled={isRevokingOthers}
                  className="text-xs font-semibold text-red-400 hover:text-red-300 transition-colors cursor-pointer hover:underline disabled:opacity-50"
                >
                  Encerrar todas as outras sessões
                </button>
              )}
            </div>

            {otherSessions.length === 0 ? (
              <div className="py-4 text-xs text-gray-500">
                Nenhum outro computador ou celular conectado no momento.
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {otherSessions.map((session) => (
                  <div
                    key={session.id}
                    className={`${MODAL_ITEM_ROW_PADDING_CLASS} flex items-center justify-between gap-3 hover:bg-white/[0.02] transition-colors`}
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="p-2 rounded-xl bg-white/5 text-gray-400 shrink-0 mt-0.5">
                        {getDeviceIcon(session.device_type, session.os)}
                      </div>
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`${MODAL_TOGGLE_HEADER_CLASS} truncate`}>
                            {session.os || 'Dispositivo Remoto'} • {session.browser || 'Navegador'}
                          </span>
                        </div>

                        <div className={`flex items-center gap-3 ${MODAL_DESCRIPTION_CLASS} flex-wrap`}>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3 text-gray-500" />
                            {formatLastActive(session.last_active_at)}
                          </span>
                          <SessionLocationItem ip={session.ip_address} isSmall />
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      aria-label={`Desconectar sessão em ${session.os || 'dispositivo'} ${session.browser || ''}`}
                      onClick={() => setConfirmRevokeSingle(session)}
                      disabled={revokingId === session.id}
                      className="p-2 rounded-xl text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer shrink-0 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                      title="Desconectar este dispositivo"
                    >
                      {revokingId === session.id ? (
                        <Loader2 className="w-4 h-4 animate-spin text-red-400" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Additional Devices without active web session (e.g. background clients) */}
          {otherDevices.length > otherSessions.length && (
            <div className="space-y-3 pt-2">
              <div className={MODAL_DIVIDER_CLASS} />
              <h4 className={MODAL_SECTION_HEADER_CLASS}>
                Aparelhos Adicionais
              </h4>
              <div className="divide-y divide-white/5">
                {otherDevices.slice(otherSessions.length).map((dev) => (
                  <div key={dev.id} className={`${MODAL_ITEM_ROW_PADDING_CLASS} flex items-center justify-between gap-3`}>
                    <div className="space-y-0.5">
                      <span className={`${MODAL_TOGGLE_HEADER_CLASS} block`}>
                        Aparelho {dev.id.slice(0, 8)}...
                      </span>
                      <p className={MODAL_DESCRIPTION_CLASS}>
                        Dispositivo secundário registrado
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRevokeDeviceOnly(dev.id)}
                      disabled={revokingId === dev.id}
                      className="p-2 rounded-xl text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                      title="Desconectar este aparelho"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal: Confirm Revoke Single Session */}
      {confirmRevokeSingle && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className={`bg-background-darker border border-white/10 rounded-xl max-w-sm w-full ${MODAL_CARD_PADDING_CLASS} space-y-4 shadow-2xl animate-in zoom-in-95`}>
            <div className="flex items-center gap-3 text-red-400">
              <div className="p-2.5 rounded-xl bg-red-500/10">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <h4 className={MODAL_DIALOG_TITLE_CLASS}>Desconectar Dispositivo?</h4>
            </div>
            <p className={`${MODAL_DESCRIPTION_CLASS} text-gray-300`}>
              O dispositivo <strong className="text-white">{confirmRevokeSingle.os} ({confirmRevokeSingle.browser})</strong> será desconectado imediatamente da sua conta.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmRevokeSingle(null)}
                disabled={Boolean(revokingId)}
                className={MODAL_SECONDARY_BUTTON_CLASS}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => handleRevokeSingle(confirmRevokeSingle)}
                disabled={Boolean(revokingId)}
                className={MODAL_DANGER_BUTTON_CLASS}
              >
                {revokingId ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                <span>Desconectar</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Confirm Revoke All Other Sessions */}
      {confirmRevokeOtherOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className={`bg-background-darker border border-white/10 rounded-xl max-w-sm w-full ${MODAL_CARD_PADDING_CLASS} space-y-4 shadow-2xl animate-in zoom-in-95`}>
            <div className="flex items-center gap-3 text-red-400">
              <div className="p-2.5 rounded-xl bg-red-500/10">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <h4 className={MODAL_DIALOG_TITLE_CLASS}>Desconectar Todas as Outras Sessões?</h4>
            </div>
            <p className={`${MODAL_DESCRIPTION_CLASS} text-gray-300`}>
              Todos os outros computadores, celulares e navegadores onde sua conta está conectada serão deslogados imediatamente. Apenas este dispositivo permanecerá conectado.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmRevokeOtherOpen(false)}
                disabled={isRevokingOthers}
                className={MODAL_SECONDARY_BUTTON_CLASS}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleRevokeOthers}
                disabled={isRevokingOthers}
                className={MODAL_DANGER_BUTTON_CLASS}
              >
                {isRevokingOthers ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                <span>Desconectar Todos</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
