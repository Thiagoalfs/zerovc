import React, { useState, useEffect, useCallback } from 'react';
import {
  Smartphone,
  Globe,
  Trash2,
  AlertTriangle,
  Loader2,
  RefreshCw,
  Clock,
  MapPin,
  Laptop,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';
import { UserSession } from '../../types';
import { identityManager } from '../../crypto/identity';
import { fetchLocationFromIP } from '../../utils/location';
import { ModalButton } from '@/components/ui/modal-button';
import { SettingsGroup, SettingsRow } from '@/components/ui/settings-group';
import { InlineAlert } from '@/components/ui/inline-alert';
import {
  MODAL_TOGGLE_HEADER_CLASS,
  MODAL_DIALOG_TITLE_CLASS,
  MODAL_CARD_PADDING_CLASS,
  MODAL_ITEM_ROW_PADDING_CLASS,
  MODAL_DESCRIPTION_CLASS,
} from '../../constants/modalTypography';

interface DeviceItem {
  id: string;
  user_id: string;
  curve25519_key: string;
  ed25519_key: string;
  revoked_at?: string | null;
  created_at: string;
}

const SESSIONS_CACHE_TTL_MS = 60_000;
let cachedSessionsState: {
  userId: string;
  sessions: UserSession[];
  devices: DeviceItem[];
  currentDeviceId: string | null;
  fetchedAt: number;
} | null = null;
const cachedIpLocations = new Map<string, string>();

const SessionLocationItem: React.FC<{ ip?: string; isSmall?: boolean }> = ({ ip, isSmall }) => {
  const cachedLoc = ip ? cachedIpLocations.get(ip) : undefined;
  const [location, setLocation] = useState<string>(cachedLoc || (ip ? 'Calculando localização...' : 'Localização indisponível'));
  const [isLocLoading, setIsLocLoading] = useState(Boolean(ip && !cachedLoc));

  useEffect(() => {
    let isMounted = true;
    if (!ip) {
      setLocation('Localização indisponível');
      setIsLocLoading(false);
      return;
    }
    const existing = cachedIpLocations.get(ip);
    if (existing) {
      setLocation(existing);
      setIsLocLoading(false);
      return;
    }
    setIsLocLoading(true);
    fetchLocationFromIP(ip).then((loc) => {
      cachedIpLocations.set(ip, loc);
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
  const validCache = cachedSessionsState && cachedSessionsState.userId === user?.id ? cachedSessionsState : null;
  const [sessions, setSessions] = useState<UserSession[]>(validCache?.sessions ?? []);
  const [devices, setDevices] = useState<DeviceItem[]>(validCache?.devices ?? []);
  const [currentDeviceId, setCurrentDeviceId] = useState<string | null>(
    validCache?.currentDeviceId ?? (typeof localStorage !== 'undefined' ? localStorage.getItem('zerovc_device_id') : null)
  );

  const [isLoading, setIsLoading] = useState(!validCache);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Revocation modals state
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [isRevokingOthers, setIsRevokingOthers] = useState(false);
  const [confirmRevokeOtherOpen, setConfirmRevokeOtherOpen] = useState(false);
  const [confirmRevokeSingle, setConfirmRevokeSingle] = useState<UserSession | null>(null);

  const loadData = useCallback(async (force = false) => {
    if (!user?.id) return;
    const currentCache = cachedSessionsState?.userId === user.id ? cachedSessionsState : null;
    if (!force && currentCache && Date.now() - currentCache.fetchedAt < SESSIONS_CACHE_TTL_MS) {
      setSessions(currentCache.sessions);
      setDevices(currentCache.devices);
      setCurrentDeviceId(currentCache.currentDeviceId);
      setIsLoading(false);
      return;
    }

    if (!currentCache) setIsLoading(true);
    setError(null);

    const cachedDevId = typeof localStorage !== 'undefined' ? localStorage.getItem('zerovc_device_id') : null;
    setCurrentDeviceId(cachedDevId);

    try {
      const [sessionsData, devicesData] = await Promise.all([
        api.auth.getSessions().catch(() => []),
        api.e2ee.getUserDevices(user.id).catch(() => []),
      ]);

      const nextSessions = sessionsData || [];
      const nextDevices = devicesData || [];
      setSessions(nextSessions);
      setDevices(nextDevices);

      cachedSessionsState = {
        userId: user.id,
        sessions: nextSessions,
        devices: nextDevices,
        currentDeviceId: cachedDevId,
        fetchedAt: Date.now(),
      };
    } catch (err: any) {
      setError(err?.message || 'Não foi possível carregar os dispositivos e sessões ativas.');
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleRevokeSingle = async (session: UserSession) => {
    setRevokingId(session.id);
    setError(null);
    setSuccessMessage(null);
    try {
      await api.auth.revokeSession(session.id);
      setSessions((prev) => {
        const next = prev.filter((s) => s.id !== session.id);
        if (cachedSessionsState && cachedSessionsState.userId === user?.id) {
          cachedSessionsState = { ...cachedSessionsState, sessions: next, fetchedAt: Date.now() };
        }
        return next;
      });
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
      setDevices((prev) => {
        const next = prev.filter((d) => d.id !== deviceId);
        if (cachedSessionsState && cachedSessionsState.userId === user?.id) {
          cachedSessionsState = { ...cachedSessionsState, devices: next, fetchedAt: Date.now() };
        }
        return next;
      });
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
      setSessions((prev) => {
        const next = prev.filter((s) => s.is_current);
        if (cachedSessionsState && cachedSessionsState.userId === user?.id) {
          cachedSessionsState = { ...cachedSessionsState, sessions: next, fetchedAt: Date.now() };
        }
        return next;
      });

      // Also revoke remote E2EE devices if any
      if (currentDeviceId) {
        const others = devices.filter((d) => d.id !== currentDeviceId);
        for (const dev of others) {
          try {
            await api.e2ee.revokeDevice(dev.id);
          } catch {}
        }
        setDevices((prev) => {
          const next = prev.filter((d) => d.id === currentDeviceId);
          if (cachedSessionsState && cachedSessionsState.userId === user?.id) {
            cachedSessionsState = { ...cachedSessionsState, devices: next, fetchedAt: Date.now() };
          }
          return next;
        });
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
  const currentDevice = devices.find((d) => d.id === currentDeviceId);
  const currentEd25519Key = currentDevice?.ed25519_key || identityManager.getIdentityKeys()?.ed25519 || '';
  const otherSessions = sessions.filter((s) => !s.is_current);
  const otherDevices = devices.filter((d) => d.id !== currentDeviceId);

  return (
    <div className="space-y-6">
      {/* Success Banner */}
      {successMessage && (
        <InlineAlert variant="success" className="animate-in fade-in">
          {successMessage}
        </InlineAlert>
      )}

      {/* Error Banner */}
      {error && (
        <InlineAlert variant="error" className="animate-in fade-in">
          {error}
        </InlineAlert>
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
            <SettingsGroup
              title="Este Dispositivo"
              action={
                <ModalButton
                  type="tertiary"
                  svgOnly
                  size="small"
                  aria-label="Atualizar lista de sessões ativas"
                  onClick={() => loadData(true)}
                  loading={isLoading}
                  title="Atualizar lista de sessões"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </ModalButton>
              }
            >
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 py-1">
                <div className="flex items-start gap-3.5 min-w-0">
                  <div className="p-2.5 rounded-xl bg-white/5 text-brand-300 shrink-0 mt-0.5">
                    {getDeviceIcon(currentSession.device_type, currentSession.os)}
                  </div>
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className={`${MODAL_TOGGLE_HEADER_CLASS} truncate`}>
                        {currentSession.os || 'Dispositivo'} • {currentSession.browser || 'Navegador'}
                      </span>
                      {currentEd25519Key && (
                        <span className="text-xs text-gray-400">
                          Chave pública Ed25519:{' '}
                          <span className="font-mono text-gray-300 select-all">
                            {currentEd25519Key.slice(0, 10)}...{currentEd25519Key.slice(-10)}
                          </span>
                        </span>
                      )}
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
            </SettingsGroup>
          )}

          {/* Other Devices List */}
          <SettingsGroup
            title={`Outros Dispositivos Conectados (${otherSessions.length})`}
            action={
              otherSessions.length > 0 && (
                <ModalButton
                  type="error"
                  size="tiny"
                  onClick={() => setConfirmRevokeOtherOpen(true)}
                  disabled={isRevokingOthers}
                >
                  Encerrar todas as outras sessões
                </ModalButton>
              )
            }
          >
            {otherSessions.length === 0 ? (
              <div className="py-4 text-xs text-gray-500">
                Nenhum outro computador ou celular conectado no momento.
              </div>
            ) : (
              otherSessions.map((session) => (
                <div
                  key={session.id}
                  className={`${MODAL_ITEM_ROW_PADDING_CLASS} flex items-center justify-between gap-3 hover:bg-white/[0.02] transition-colors`}
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="p-2 rounded-xl bg-white/5 text-gray-400 shrink-0 mt-0.5">
                      {getDeviceIcon(session.device_type, session.os)}
                    </div>
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className={`${MODAL_TOGGLE_HEADER_CLASS} truncate`}>
                          {session.os || 'Dispositivo Remoto'} • {session.browser || 'Navegador'}
                        </span>
                        {(() => {
                          const key =
                            (session as any).ed25519_key ||
                            devices.find((d) => d.id === (session as any).device_id)?.ed25519_key;
                          if (!key) return null;
                          return (
                            <span className="text-xs text-gray-400">
                              Chave pública Ed25519:{' '}
                              <span className="font-mono text-gray-300 select-all">
                                {key.slice(0, 10)}...{key.slice(-10)}
                              </span>
                            </span>
                          );
                        })()}
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

                  <ModalButton
                    type="tertiary"
                    svgOnly
                    size="small"
                    aria-label={`Desconectar sessão em ${session.os || 'dispositivo'} ${session.browser || ''}`}
                    onClick={() => setConfirmRevokeSingle(session)}
                    loading={revokingId === session.id}
                    className="shrink-0 hover:text-red-400 hover:bg-red-500/10"
                    title="Desconectar este dispositivo"
                  >
                    <Trash2 className="w-4 h-4" />
                  </ModalButton>
                </div>
              ))
            )}
          </SettingsGroup>

          {/* Additional Devices without active web session (e.g. background clients) */}
          {otherDevices.length > otherSessions.length && (
            <SettingsGroup title="Aparelhos Adicionais">
              {otherDevices.slice(otherSessions.length).map((dev) => (
                <SettingsRow
                  key={dev.id}
                  label={`Aparelho ${dev.id.slice(0, 8)}...`}
                  description="Dispositivo secundário registrado"
                  control={
                    <ModalButton
                      type="tertiary"
                      svgOnly
                      size="small"
                      onClick={() => handleRevokeDeviceOnly(dev.id)}
                      loading={revokingId === dev.id}
                      className="hover:text-red-400 hover:bg-red-500/10"
                      title="Desconectar este aparelho"
                      aria-label="Desconectar este aparelho"
                    >
                      <Trash2 className="w-4 h-4" />
                    </ModalButton>
                  }
                />
              ))}
            </SettingsGroup>
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
              <ModalButton
                type="secondary"
                size="small"
                onClick={() => setConfirmRevokeSingle(null)}
                disabled={Boolean(revokingId)}
              >
                Cancelar
              </ModalButton>
              <ModalButton
                type="error"
                size="small"
                onClick={() => handleRevokeSingle(confirmRevokeSingle)}
                loading={Boolean(revokingId)}
                prefix={<Trash2 className="w-3.5 h-3.5" />}
              >
                Desconectar
              </ModalButton>
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
              <ModalButton
                type="secondary"
                size="small"
                onClick={() => setConfirmRevokeOtherOpen(false)}
                disabled={isRevokingOthers}
              >
                Cancelar
              </ModalButton>
              <ModalButton
                type="error"
                size="small"
                onClick={handleRevokeOthers}
                loading={isRevokingOthers}
                prefix={<Trash2 className="w-3.5 h-3.5" />}
              >
                Desconectar Todos
              </ModalButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
