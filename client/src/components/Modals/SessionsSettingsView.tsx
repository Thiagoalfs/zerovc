import React, { useState, useEffect } from 'react';
import {
  Smartphone,
  Globe,
  Shield,
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
import { UserSession } from '../../types';

export const SessionsSettingsView: React.FC = () => {
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [isRevokingOthers, setIsRevokingOthers] = useState(false);
  const [confirmRevokeOtherOpen, setConfirmRevokeOtherOpen] = useState(false);
  const [confirmRevokeSingle, setConfirmRevokeSingle] = useState<UserSession | null>(null);

  const fetchSessions = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.auth.getSessions();
      setSessions(data);
    } catch (err: any) {
      setError(err?.message || 'Não foi possível carregar as sessões ativas.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  const handleRevokeSingle = async (session: UserSession) => {
    setRevokingId(session.id);
    setError(null);
    setSuccessMessage(null);
    try {
      await api.auth.revokeSession(session.id);
      setSessions((prev) => prev.filter((s) => s.id !== session.id));
      setSuccessMessage('Sessão remota encerrada com sucesso.');
      setConfirmRevokeSingle(null);
    } catch (err: any) {
      setError(err?.message || 'Falha ao encerrar a sessão.');
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
      setSuccessMessage('Todas as outras sessões foram encerradas com sucesso.');
      setConfirmRevokeOtherOpen(false);
    } catch (err: any) {
      setError(err?.message || 'Falha ao encerrar as outras sessões.');
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
    if (deviceType === 'desktop' || os.toLowerCase().includes('windows') || os.toLowerCase().includes('mac') || os.toLowerCase().includes('linux')) {
      return <Laptop className="w-5 h-5 text-brand-400" />;
    }
    if (deviceType === 'mobile' || os.toLowerCase().includes('android') || os.toLowerCase().includes('ios')) {
      return <Smartphone className="w-5 h-5 text-emerald-400" />;
    }
    return <Globe className="w-5 h-5 text-cyan-400" />;
  };

  const currentSession = sessions.find((s) => s.is_current);
  const otherSessions = sessions.filter((s) => !s.is_current);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-white">
              Sessões Ativas e Dispositivos
            </h3>
            <p className="text-xs text-gray-400 mt-1">
              Gerencie todos os computadores, celulares e navegadores com acesso à sua conta.
            </p>
          </div>
          <button
            type="button"
            onClick={fetchSessions}
            disabled={isLoading}
            className="p-2 rounded-xl hover:bg-white/10 text-gray-400 hover:text-white transition-colors cursor-pointer disabled:opacity-50"
            title="Atualizar lista de sessões"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

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
          <span className="text-xs font-medium">Buscando dispositivos conectados...</span>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Current Device */}
          {currentSession && (
            <div className="space-y-2">
              <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block">
                Este Dispositivo
              </span>
              <div className="py-2.5 flex items-start justify-between gap-3">
                <div className="flex items-start gap-3.5 min-w-0">
                  <div className="p-2 rounded-xl bg-white/5 text-brand-300 shrink-0 mt-0.5">
                    {getDeviceIcon(currentSession.device_type, currentSession.os)}
                  </div>
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-white truncate">
                        {currentSession.os || 'Dispositivo'} • {currentSession.browser || 'Navegador'}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        Sessão Atual
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-400 flex-wrap">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-gray-500" />
                        {formatLastActive(currentSession.last_active_at)}
                      </span>
                      {currentSession.ip_address && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-gray-500" />
                          IP: {currentSession.ip_address}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Divider */}
          <div className="border-t border-white/5" />

          {/* Other Devices List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block">
                Outros Dispositivos ({otherSessions.length})
              </span>
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
                Nenhum outro dispositivo conectado no momento.
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {otherSessions.map((session) => (
                  <div
                    key={session.id}
                    className="py-3 flex items-center justify-between gap-3 hover:bg-white/[0.02] transition-colors"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="p-2 rounded-xl bg-white/5 text-gray-400 shrink-0 mt-0.5">
                        {getDeviceIcon(session.device_type, session.os)}
                      </div>
                      <div className="min-w-0 space-y-0.5">
                        <div className="text-xs font-semibold text-white truncate">
                          {session.os || 'Dispositivo Remoto'} • {session.browser || 'Navegador'}
                        </div>
                        <div className="flex items-center gap-3 text-[11px] text-gray-400 flex-wrap">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3 text-gray-500" />
                            {formatLastActive(session.last_active_at)}
                          </span>
                          {session.ip_address && (
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3 h-3 text-gray-500" />
                              IP: {session.ip_address}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setConfirmRevokeSingle(session)}
                      disabled={revokingId === session.id}
                      className="p-2 rounded-xl text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer shrink-0 disabled:opacity-50"
                      title="Encerrar esta sessão"
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
        </div>
      )}

      {/* Modal: Confirm Revoke Single Session */}
      {confirmRevokeSingle && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-background-darker border border-white/10 rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center gap-3 text-red-400">
              <div className="p-2.5 rounded-xl bg-red-500/10">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <h4 className="text-sm font-bold text-white">Encerrar Sessão?</h4>
            </div>
            <p className="text-xs text-gray-300 leading-relaxed">
              O dispositivo <strong className="text-white">{confirmRevokeSingle.os} ({confirmRevokeSingle.browser})</strong> será desconectado imediatamente do ZeroVC.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmRevokeSingle(null)}
                disabled={Boolean(revokingId)}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => handleRevokeSingle(confirmRevokeSingle)}
                disabled={Boolean(revokingId)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-red-500 hover:bg-red-600 text-white transition-colors flex items-center gap-1.5 shadow-md shadow-red-500/20"
              >
                {revokingId ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                <span>Encerrar</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Confirm Revoke All Other Sessions */}
      {confirmRevokeOtherOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-background-darker border border-white/10 rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center gap-3 text-red-400">
              <div className="p-2.5 rounded-xl bg-red-500/10">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <h4 className="text-sm font-bold text-white">Encerrar Todas as Outras Sessões?</h4>
            </div>
            <p className="text-xs text-gray-300 leading-relaxed">
              Todos os outros computadores, celulares e navegadores onde sua conta está conectada serão deslogados imediatamente. Apenas este dispositivo permanecerá conectado.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmRevokeOtherOpen(false)}
                disabled={isRevokingOthers}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleRevokeOthers}
                disabled={isRevokingOthers}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-red-500 hover:bg-red-600 text-white transition-colors flex items-center gap-1.5 shadow-md shadow-red-500/20"
              >
                {isRevokingOthers ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                <span>Encerrar Todas</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
