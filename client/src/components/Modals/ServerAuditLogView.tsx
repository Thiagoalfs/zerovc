import React, { useState, useEffect, useMemo } from 'react';
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
  AlertCircle,
  User as UserIcon,
  ChevronLeft,
  ChevronRight,
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

export const ServerAuditLogView: React.FC<ServerAuditLogViewProps> = ({ guildId, onOpenUserProfile }) => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [selectedFilter, setSelectedFilter] = useState('ALL');
  const [selectedActorFilter, setSelectedActorFilter] = useState('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 25;
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
    setCurrentPage(1);
  }, [guildId, selectedFilter]);

  const uniqueActors = useMemo(() => {
    const map = new Map<string, User>();
    logs.forEach((l) => {
      if (l.actor && l.actor.id) {
        map.set(l.actor.id, l.actor);
      }
    });
    return Array.from(map.values());
  }, [logs]);

  const filteredLogs = useMemo(() => {
    let list = logs;
    if (selectedActorFilter !== 'ALL') {
      list = list.filter((l) => l.actor?.id === selectedActorFilter);
    }
    return list;
  }, [logs, selectedActorFilter]);

  const totalPages = Math.ceil(filteredLogs.length / itemsPerPage) || 1;
  const paginatedLogs = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredLogs.slice(start, start + itemsPerPage);
  }, [filteredLogs, currentPage]);

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'MEMBER_BAN':
        return { label: 'Baniu Membro', icon: <Ban className="w-3.5 h-3.5" />, color: 'bg-dnd/15 text-red-400 border-red-500/25' };
      case 'MEMBER_UNBAN':
        return { label: 'Desbaniu Membro', icon: <UserCheck className="w-3.5 h-3.5" />, color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25' };
      case 'MEMBER_KICK':
        return { label: 'Expulsou Membro', icon: <UserMinus className="w-3.5 h-3.5" />, color: 'bg-amber-500/15 text-amber-400 border-amber-500/25' };
      case 'MEMBER_MUTE':
        return { label: 'Silenciou Membro', icon: <VolumeX className="w-3.5 h-3.5" />, color: 'bg-orange-500/15 text-orange-400 border-orange-500/25' };
      case 'ROLE_CREATE':
        return { label: 'Criou Cargo', icon: <PlusCircle className="w-3.5 h-3.5" />, color: 'bg-brand-500/15 text-brand-400 border-brand-500/25' };
      case 'ROLE_UPDATE':
        return { label: 'Editou Cargo', icon: <Edit3 className="w-3.5 h-3.5" />, color: 'bg-blue-500/15 text-blue-400 border-blue-500/25' };
      case 'ROLE_DELETE':
        return { label: 'Excluiu Cargo', icon: <Trash2 className="w-3.5 h-3.5" />, color: 'bg-red-500/15 text-red-400 border-red-500/25' };
      case 'ROLE_ASSIGN':
        return { label: 'Atribuiu Cargo', icon: <Shield className="w-3.5 h-3.5" />, color: 'bg-purple-500/15 text-purple-400 border-purple-500/25' };
      case 'ROLE_REMOVE':
        return { label: 'Removeu Cargo', icon: <Shield className="w-3.5 h-3.5" />, color: 'bg-gray-500/15 text-gray-300 border-gray-500/25' };
      case 'CHANNEL_CREATE':
        return { label: 'Criou Canal', icon: <Hash className="w-3.5 h-3.5" />, color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25' };
      case 'CHANNEL_UPDATE':
        return { label: 'Editou Canal', icon: <Edit3 className="w-3.5 h-3.5" />, color: 'bg-blue-500/15 text-blue-400 border-blue-500/25' };
      case 'CHANNEL_DELETE':
        return { label: 'Excluiu Canal', icon: <Trash2 className="w-3.5 h-3.5" />, color: 'bg-red-500/15 text-red-400 border-red-500/25' };
      case 'MESSAGE_DELETE_MODERATION':
        return { label: 'Deletou Mensagem', icon: <MessageSquare className="w-3.5 h-3.5" />, color: 'bg-rose-500/15 text-rose-400 border-rose-500/25' };
      default:
        return { label: action, icon: <ScrollText className="w-3.5 h-3.5" />, color: 'bg-white/10 text-gray-300 border-white/10' };
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
    <div id="audit-actions" className="flex flex-col h-full overflow-hidden scroll-mt-6 space-y-4 animate-fade-in">
      {/* Header & Filter Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/10">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <ScrollText className="w-5 h-5 text-brand-400" />
            Registro de Auditoria
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Histórico das ações administrativas e de moderação realizadas no servidor.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Action Filter */}
          <div className="relative flex items-center">
            <Filter className="w-3.5 h-3.5 absolute left-3 text-gray-400 pointer-events-none" />
            <select
              value={selectedFilter}
              onChange={(e) => setSelectedFilter(e.target.value)}
              className="bg-background-darkest border border-white/10 text-xs text-gray-200 pl-8 pr-7 py-2 rounded-xl appearance-none cursor-pointer hover:border-white/20 focus:outline-none focus:border-brand-500 transition-colors"
            >
              {ACTION_FILTERS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>

          {/* User / Actor Filter */}
          <div className="relative flex items-center">
            <UserIcon className="w-3.5 h-3.5 absolute left-3 text-gray-400 pointer-events-none" />
            <select
              value={selectedActorFilter}
              onChange={(e) => {
                setSelectedActorFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="bg-background-darkest border border-white/10 text-xs text-gray-200 pl-8 pr-7 py-2 rounded-xl appearance-none cursor-pointer hover:border-white/20 focus:outline-none focus:border-brand-500 transition-colors"
            >
              <option value="ALL">Todos os Usuários</option>
              {uniqueActors.map((act) => (
                <option key={act.id} value={act.id}>
                  {act.display_name || act.username} (@{act.username})
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => fetchLogs(selectedFilter)}
            disabled={isLoading}
            className="p-2 bg-background-darkest border border-white/10 hover:border-white/20 rounded-xl text-gray-400 hover:text-white transition-colors cursor-pointer disabled:opacity-50"
            title="Recarregar"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-brand-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* Logs List Container */}
      <div className="flex-1 overflow-y-auto no-scrollbar pr-1 min-h-0 divide-y divide-white/5">
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
        ) : filteredLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-500">
            <ScrollText className="w-12 h-12 stroke-1 mb-2 text-gray-600" />
            <span className="text-sm font-medium">Nenhum registro encontrado</span>
            <span className="text-xs text-gray-500 mt-1">Ações de moderação serão registradas aqui automaticamente.</span>
          </div>
        ) : (
          paginatedLogs.map((log) => {
            const badge = getActionBadge(log.action_type);
            const actor = log.actor;
            const targetUser = log.target_user;

            return (
              <div
                key={log.id}
                className="py-3 px-2 hover:bg-white/[0.02] rounded-xl transition-colors flex flex-col gap-2"
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
                      <span
                        onClick={(e) => actor && onOpenUserProfile?.(actor, { x: e.clientX, y: e.clientY })}
                        className="font-bold text-white hover:underline cursor-pointer truncate"
                      >
                        {actor?.display_name || actor?.username || 'Usuário Desconhecido'}
                      </span>
                      <span className="text-[11px] text-gray-400">@{actor?.username}</span>
                    </div>
                  </div>

                  {/* Action Badge & Timestamp */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <div className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${badge.color}`}>
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
                      <span
                        onClick={(e) => onOpenUserProfile?.(targetUser, { x: e.clientX, y: e.clientY })}
                        className="font-semibold text-gray-200 hover:underline cursor-pointer"
                      >
                        {targetUser.display_name || targetUser.username} (@{targetUser.username})
                      </span>
                    </div>
                  )}

                  {log.details && Object.keys(log.details).length > 0 && (
                    <div className="bg-background-darkest/80 p-2.5 rounded-xl text-[11px] font-mono text-gray-400 space-y-0.5 border border-white/5">
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

      {/* Pagination Footer */}
      {filteredLogs.length > itemsPerPage && (
        <div className="pt-3 border-t border-white/10 flex items-center justify-between text-xs text-gray-400 flex-shrink-0">
          <span>
            Mostrando {((currentPage - 1) * itemsPerPage) + 1} - {Math.min(currentPage * itemsPerPage, filteredLogs.length)} de {filteredLogs.length} registros
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1.5 rounded-lg bg-background-darkest border border-white/10 hover:border-white/20 disabled:opacity-40 disabled:pointer-events-none text-white transition-colors cursor-pointer"
              title="Página Anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <span className="font-semibold text-white px-2">
              {currentPage} / {totalPages}
            </span>

            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-1.5 rounded-lg bg-background-darkest border border-white/10 hover:border-white/20 disabled:opacity-40 disabled:pointer-events-none text-white transition-colors cursor-pointer"
              title="Próxima Página"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
