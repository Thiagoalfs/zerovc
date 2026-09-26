import React, { useState, useEffect } from 'react';
import {
  ScrollText,
  Shield,
  UserMinus,
  Ban,
  VolumeX,
  PlusCircle,
  Edit3,
  Trash2,
  UserCheck,
  MessageSquare,
  Clock,
  Filter,
  RefreshCw,
  Hash,
  AlertCircle
} from 'lucide-react';
import { api, formatAssetUrl } from '../../lib/api';
import { AuditLog, User } from '../../types';

interface ServerAuditLogViewProps {
  guildId: string;
  onOpenUserProfile?: (user: User, position?: { x: number; y: number }) => void;
}

const ACTION_FILTERS = [
  { label: 'Todas as Ações', value: 'ALL' },
  { label: 'Membros Expulsos', value: 'MEMBER_KICK' },
  { label: 'Membros Banidos', value: 'MEMBER_BAN' },
  { label: 'Membros Desbanidos', value: 'MEMBER_UNBAN' },
  { label: 'Membros Silenciados', value: 'MEMBER_MUTE' },
  { label: 'Cargos Criados', value: 'ROLE_CREATE' },
  { label: 'Cargos Editados', value: 'ROLE_UPDATE' },
  { label: 'Cargos Deletados', value: 'ROLE_DELETE' },
  { label: 'Cargos Atribuídos', value: 'ROLE_ASSIGN' },
  { label: 'Cargos Removidos', value: 'ROLE_REMOVE' },
  { label: 'Canais Criados', value: 'CHANNEL_CREATE' },
  { label: 'Canais Editados', value: 'CHANNEL_UPDATE' },
  { label: 'Canais Deletados', value: 'CHANNEL_DELETE' },
  { label: 'Mensagens Deletadas (Moderação)', value: 'MESSAGE_DELETE_MODERATION' },
];

export const ServerAuditLogView: React.FC<ServerAuditLogViewProps> = ({ guildId }) => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [selectedFilter, setSelectedFilter] = useState('ALL');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLogs = async (filter = selectedFilter) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.guilds.getAuditLogs(guildId, {
        action: filter !== 'ALL' ? filter : undefined,
      });
      setLogs(data || []);
    } catch (err: any) {
      setError(err?.message || 'Falha ao carregar registros de auditoria');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs(selectedFilter);
  }, [guildId, selectedFilter]);

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'MEMBER_BAN':
        return { label: 'Baniu Membro', icon: <Ban className="w-3.5 h-3.5" />, color: 'bg-dnd/20 text-red-400 border-red-500/30' };
      case 'MEMBER_UNBAN':
        return { label: 'Desbaniu Membro', icon: <UserCheck className="w-3.5 h-3.5" />, color: 'bg-online/20 text-emerald-400 border-emerald-500/30' };
      case 'MEMBER_KICK':
        return { label: 'Expulsou Membro', icon: <UserMinus className="w-3.5 h-3.5" />, color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' };
      case 'MEMBER_MUTE':
        return { label: 'Silenciou Membro', icon: <VolumeX className="w-3.5 h-3.5" />, color: 'bg-orange-500/20 text-orange-400 border-orange-500/30' };
      case 'ROLE_CREATE':
        return { label: 'Criou Cargo', icon: <PlusCircle className="w-3.5 h-3.5" />, color: 'bg-brand-500/20 text-brand-400 border-brand-500/30' };
      case 'ROLE_UPDATE':
        return { label: 'Editou Cargo', icon: <Edit3 className="w-3.5 h-3.5" />, color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' };
      case 'ROLE_DELETE':
        return { label: 'Excluiu Cargo', icon: <Trash2 className="w-3.5 h-3.5" />, color: 'bg-red-500/20 text-red-400 border-red-500/30' };
      case 'ROLE_ASSIGN':
        return { label: 'Atribuiu Cargo', icon: <Shield className="w-3.5 h-3.5" />, color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' };
      case 'ROLE_REMOVE':
        return { label: 'Removeu Cargo', icon: <Shield className="w-3.5 h-3.5" />, color: 'bg-gray-500/20 text-gray-300 border-gray-500/30' };
      case 'CHANNEL_CREATE':
        return { label: 'Criou Canal', icon: <Hash className="w-3.5 h-3.5" />, color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' };
      case 'CHANNEL_UPDATE':
        return { label: 'Editou Canal', icon: <Edit3 className="w-3.5 h-3.5" />, color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' };
      case 'CHANNEL_DELETE':
        return { label: 'Excluiu Canal', icon: <Trash2 className="w-3.5 h-3.5" />, color: 'bg-red-500/20 text-red-400 border-red-500/30' };
      case 'MESSAGE_DELETE_MODERATION':
        return { label: 'Deletou Mensagem de Terceiro', icon: <MessageSquare className="w-3.5 h-3.5" />, color: 'bg-rose-500/20 text-rose-400 border-rose-500/30' };
      default:
        return { label: action, icon: <ScrollText className="w-3.5 h-3.5" />, color: 'bg-gray-700/50 text-gray-300 border-gray-600' };
    }
  };

  const formatDate = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header & Filter Controls */}
      <div className="p-4 border-b border-white/5 flex items-center justify-between gap-4 flex-shrink-0 bg-background-darker/40">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <ScrollText className="w-5 h-5 text-brand-400" />
            Registro de Auditoria
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Histórico das ações administrativas e de moderação realizadas no servidor.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative flex items-center">
            <Filter className="w-3.5 h-3.5 absolute left-3 text-gray-400 pointer-events-none" />
            <select
              value={selectedFilter}
              onChange={(e) => setSelectedFilter(e.target.value)}
              className="bg-background-darker border border-white/10 text-xs text-gray-200 pl-8 pr-8 py-1.5 rounded-lg appearance-none cursor-pointer hover:border-white/20 focus:outline-none focus:border-brand-500 transition-colors"
            >
              {ACTION_FILTERS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => fetchLogs(selectedFilter)}
            disabled={isLoading}
            className="p-1.5 bg-background-darker border border-white/10 hover:border-white/20 rounded-lg text-gray-400 hover:text-white transition-colors cursor-pointer disabled:opacity-50"
            title="Recarregar"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-brand-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* Logs List Container */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2.5 no-scrollbar">
        {isLoading && logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-500">
            <RefreshCw className="w-8 h-8 animate-spin text-brand-500 mb-2" />
            <span className="text-xs">Carregando histórico de auditoria...</span>
          </div>
        ) : error ? (
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-500">
            <ScrollText className="w-12 h-12 stroke-1 mb-2 text-gray-600" />
            <span className="text-sm font-medium">Nenhum registro encontrado</span>
            <span className="text-xs text-gray-500 mt-1">Ações de moderação serão registradas aqui automaticamente.</span>
          </div>
        ) : (
          logs.map((log) => {
            const badge = getActionBadge(log.action_type);
            const actor = log.actor;
            const targetUser = log.target_user;

            return (
              <div
                key={log.id}
                className="bg-background-darker/60 hover:bg-background-darker p-3.5 rounded-xl border border-white/5 hover:border-white/10 transition-all flex flex-col gap-2 shadow-sm"
              >
                <div className="flex items-center justify-between gap-3">
                  {/* Actor Info */}
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-full bg-brand-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                      {actor?.avatar_url ? (
                        <img src={formatAssetUrl(actor.avatar_url)} alt="" className="w-full h-full rounded-full object-cover" />
                      ) : (
                        <span>{actor?.display_name?.[0]?.toUpperCase() || actor?.username?.[0]?.toUpperCase() || '?'}</span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 truncate text-xs">
                      <span className="font-bold text-white hover:underline cursor-pointer truncate">
                        {actor?.display_name || actor?.username || 'Usuário Desconhecido'}
                      </span>
                      <span className="text-[11px] text-gray-400">@{actor?.username}</span>
                    </div>
                  </div>

                  {/* Action Badge & Timestamp */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${badge.color}`}>
                      {badge.icon}
                      <span>{badge.label}</span>
                    </div>
                    <span className="text-[10px] text-gray-500 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatDate(log.created_at)}
                    </span>
                  </div>
                </div>

                {/* Target & Details Content */}
                <div className="pl-9.5 text-xs text-gray-300 space-y-1">
                  {targetUser && (
                    <div className="flex items-center gap-1 text-gray-400">
                      <span>Alvo:</span>
                      <span className="font-semibold text-gray-200">
                        {targetUser.display_name || targetUser.username} (@{targetUser.username})
                      </span>
                    </div>
                  )}

                  {log.details && Object.keys(log.details).length > 0 && (
                    <div className="bg-black/25 p-2 rounded-lg text-[11px] font-mono text-gray-400 space-y-0.5 border border-white/5">
                      {Object.entries(log.details).map(([k, v]) => (
                        <div key={k} className="flex gap-1.5 truncate">
                          <span className="text-gray-500">{k}:</span>
                          <span className="text-gray-300 font-semibold">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
