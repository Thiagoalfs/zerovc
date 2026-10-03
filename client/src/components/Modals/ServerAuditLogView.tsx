import React, { useState, useEffect } from 'react';
import {
  ScrollText,
  Clock,
  Filter,
  RefreshCw,
  Hash,
  Volume2,
  AlertCircle,
} from 'lucide-react';
import { api, formatAssetUrl } from '../../lib/api';
import { AuditLog, User } from '../../types';
import { DropdownSelect } from '../Common/DropdownSelect';

export interface ServerAuditLogViewProps {
  guildId: string;
  selectedFilter?: string;
  setSelectedFilter?: (val: string) => void;
  refreshTrigger?: number;
  onLoadingChange?: (loading: boolean) => void;
  onOpenUserProfile?: (user: User, position?: { x: number; y: number }) => void;
}

export const ACTION_FILTERS = [
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
  { label: 'Emojis Criados', value: 'EMOJI_CREATE' },
  { label: 'Emojis Editados', value: 'EMOJI_UPDATE' },
  { label: 'Emojis Deletados', value: 'EMOJI_DELETE' },
  { label: 'Posse Transferida', value: 'GUILD_OWNERSHIP_TRANSFER' },
];

export const ServerAuditLogView: React.FC<ServerAuditLogViewProps> = ({
  guildId,
  selectedFilter: propFilter,
  setSelectedFilter: propSetSelectedFilter,
  refreshTrigger = 0,
  onLoadingChange,
}) => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [internalFilter, setInternalFilter] = useState('ALL');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const activeFilter = propFilter !== undefined ? propFilter : internalFilter;
  const handleFilterChange = (val: string) => {
    if (propSetSelectedFilter) {
      propSetSelectedFilter(val);
    } else {
      setInternalFilter(val);
    }
  };

  const fetchLogs = async (filter = activeFilter) => {
    setIsLoading(true);
    onLoadingChange?.(true);
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
      onLoadingChange?.(false);
    }
  };

  useEffect(() => {
    fetchLogs(activeFilter);
  }, [guildId, activeFilter, refreshTrigger]);

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

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds} segundos`;
    if (seconds < 3600) return `${Math.round(seconds / 60)} minutos`;
    if (seconds < 86400) return `${Math.round(seconds / 3600)} horas`;
    return `${Math.round(seconds / 86400)} dias`;
  };

  const renderNarrative = (log: AuditLog) => {
    const actorName = log.actor?.display_name || log.actor?.username || 'Usuário Desconhecido';
    const targetUser = log.target_user;
    const targetName = targetUser?.display_name || targetUser?.username || 'membro';
    const details = log.details || {};

    switch (log.action_type) {
      case 'MESSAGE_DELETE_MODERATION': {
        const channelName = details.channel_name || 'canal';
        return (
          <span className="text-sm text-gray-200 leading-relaxed">
            <strong className="text-white font-semibold">{actorName}</strong> apagou uma mensagem de{' '}
            <strong className="text-white font-semibold">{targetName}</strong> no canal{' '}
            <span className="inline-flex items-center gap-0.5 font-semibold text-brand-400">
              <Hash className="w-3.5 h-3.5 inline" />
              {channelName}
            </span>
          </span>
        );
      }
      case 'MEMBER_BAN': {
        const reason = details.reason ? ` (Motivo: ${details.reason})` : '';
        return (
          <span className="text-sm text-gray-200 leading-relaxed">
            <strong className="text-white font-semibold">{actorName}</strong> baniu{' '}
            <strong className="text-red-400 font-semibold">{targetName}</strong> do servidor
            {reason && <span className="text-xs text-gray-400 italic">{reason}</span>}
          </span>
        );
      }
      case 'MEMBER_UNBAN': {
        return (
          <span className="text-sm text-gray-200 leading-relaxed">
            <strong className="text-white font-semibold">{actorName}</strong> removeu o banimento de{' '}
            <strong className="text-emerald-400 font-semibold">{targetName}</strong>
          </span>
        );
      }
      case 'MEMBER_KICK': {
        const reason = details.reason ? ` (Motivo: ${details.reason})` : '';
        return (
          <span className="text-sm text-gray-200 leading-relaxed">
            <strong className="text-white font-semibold">{actorName}</strong> expulsou{' '}
            <strong className="text-amber-400 font-semibold">{targetName}</strong> do servidor
            {reason && <span className="text-xs text-gray-400 italic">{reason}</span>}
          </span>
        );
      }
      case 'MEMBER_MUTE': {
        const duration = details.duration_seconds
          ? formatDuration(Number(details.duration_seconds))
          : '';
        return (
          <span className="text-sm text-gray-200 leading-relaxed">
            <strong className="text-white font-semibold">{actorName}</strong> silenciou{' '}
            <strong className="text-orange-400 font-semibold">{targetName}</strong>
            {duration ? ` por ${duration}` : ''}
          </span>
        );
      }
      case 'ROLE_CREATE': {
        const roleName = details.role_name || details.name || 'cargo';
        const roleColor = details.role_color || details.color;
        return (
          <span className="text-sm text-gray-200 leading-relaxed inline-flex items-center flex-wrap gap-1.5">
            <strong className="text-white font-semibold">{actorName}</strong> criou o cargo{' '}
            <span className="inline-flex items-center gap-1.5 font-semibold text-white">
              {roleColor && <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: roleColor }} />}
              {roleName}
            </span>
          </span>
        );
      }
      case 'ROLE_UPDATE': {
        const roleName = details.role_name || details.name || 'cargo';
        const roleColor = details.role_color || details.color;
        return (
          <span className="text-sm text-gray-200 leading-relaxed inline-flex items-center flex-wrap gap-1.5">
            <strong className="text-white font-semibold">{actorName}</strong> alterou as configurações do cargo{' '}
            <span className="inline-flex items-center gap-1.5 font-semibold text-white">
              {roleColor && <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: roleColor }} />}
              {roleName}
            </span>
          </span>
        );
      }
      case 'ROLE_DELETE': {
        const roleName = details.role_name || details.name || 'cargo';
        return (
          <span className="text-sm text-gray-200 leading-relaxed">
            <strong className="text-white font-semibold">{actorName}</strong> excluiu o cargo{' '}
            <strong className="text-white font-semibold">{roleName}</strong>
          </span>
        );
      }
      case 'ROLE_ASSIGN': {
        const roleName = details.role_name || details.name || 'cargo';
        const roleColor = details.role_color || details.color;
        return (
          <span className="text-sm text-gray-200 leading-relaxed inline-flex items-center flex-wrap gap-1.5">
            <strong className="text-white font-semibold">{actorName}</strong> atribuiu o cargo{' '}
            <span className="inline-flex items-center gap-1.5 font-semibold text-white">
              {roleColor && <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: roleColor }} />}
              {roleName}
            </span>{' '}
            para <strong className="text-white font-semibold">{targetName}</strong>
          </span>
        );
      }
      case 'ROLE_REMOVE': {
        const roleName = details.role_name || details.name || 'cargo';
        const roleColor = details.role_color || details.color;
        return (
          <span className="text-sm text-gray-200 leading-relaxed inline-flex items-center flex-wrap gap-1.5">
            <strong className="text-white font-semibold">{actorName}</strong> removeu o cargo{' '}
            <span className="inline-flex items-center gap-1.5 font-semibold text-white">
              {roleColor && <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: roleColor }} />}
              {roleName}
            </span>{' '}
            de <strong className="text-white font-semibold">{targetName}</strong>
          </span>
        );
      }
      case 'CHANNEL_CREATE': {
        const channelName = details.name || 'canal';
        const isVoice = details.type === 'voice';
        return (
          <span className="text-sm text-gray-200 leading-relaxed inline-flex items-center flex-wrap gap-1.5">
            <strong className="text-white font-semibold">{actorName}</strong> criou o canal{' '}
            <span className="inline-flex items-center gap-1 font-semibold text-brand-400">
              {isVoice ? <Volume2 className="w-3.5 h-3.5" /> : <Hash className="w-3.5 h-3.5" />}
              {channelName}
            </span>
          </span>
        );
      }
      case 'CHANNEL_UPDATE': {
        const channelName = details.name || 'canal';
        const isVoice = details.type === 'voice';
        return (
          <span className="text-sm text-gray-200 leading-relaxed inline-flex items-center flex-wrap gap-1.5">
            <strong className="text-white font-semibold">{actorName}</strong> editou o canal{' '}
            <span className="inline-flex items-center gap-1 font-semibold text-brand-400">
              {isVoice ? <Volume2 className="w-3.5 h-3.5" /> : <Hash className="w-3.5 h-3.5" />}
              {channelName}
            </span>
          </span>
        );
      }
      case 'CHANNEL_DELETE': {
        const channelName = details.name || 'canal';
        return (
          <span className="text-sm text-gray-200 leading-relaxed">
            <strong className="text-white font-semibold">{actorName}</strong> excluiu o canal{' '}
            <strong className="text-white font-semibold">#{channelName}</strong>
          </span>
        );
      }
      case 'EMOJI_CREATE': {
        const emojiName = details.name || 'emoji';
        return (
          <span className="text-sm text-gray-200 leading-relaxed">
            <strong className="text-white font-semibold">{actorName}</strong> adicionou o emoji{' '}
            <code className="text-brand-400 font-semibold bg-white/5 px-1.5 py-0.5 rounded">:{emojiName}:</code>
          </span>
        );
      }
      case 'EMOJI_UPDATE': {
        const emojiName = details.name || 'emoji';
        return (
          <span className="text-sm text-gray-200 leading-relaxed">
            <strong className="text-white font-semibold">{actorName}</strong> renomeou o emoji{' '}
            <code className="text-brand-400 font-semibold bg-white/5 px-1.5 py-0.5 rounded">:{emojiName}:</code>
          </span>
        );
      }
      case 'EMOJI_DELETE': {
        const emojiName = details.name || 'emoji';
        return (
          <span className="text-sm text-gray-200 leading-relaxed">
            <strong className="text-white font-semibold">{actorName}</strong> removeu o emoji{' '}
            <code className="text-brand-400 font-semibold bg-white/5 px-1.5 py-0.5 rounded">:{emojiName}:</code>
          </span>
        );
      }
      case 'GUILD_OWNERSHIP_TRANSFER': {
        return (
          <span className="text-sm text-gray-200 leading-relaxed">
            <strong className="text-white font-semibold">{actorName}</strong> transferiu a posse do servidor para{' '}
            <strong className="text-amber-400 font-semibold">{targetName}</strong>
          </span>
        );
      }
      default: {
        return (
          <span className="text-sm text-gray-200 leading-relaxed">
            <strong className="text-white font-semibold">{actorName}</strong> realizou a ação{' '}
            <strong className="text-brand-400 font-semibold">{log.action_type}</strong>
            {targetName !== 'membro' ? ` em ${targetName}` : ''}
          </span>
        );
      }
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden py-4 sm:py-6">
      {/* Mobile filter controls */}
      <div className="md:hidden pb-3 flex items-center gap-2">
        <DropdownSelect
          className="flex-1"
          prefixIcon={<Filter className="w-3.5 h-3.5" />}
          value={activeFilter}
          onChange={(val) => handleFilterChange(String(val))}
          options={ACTION_FILTERS.map((f) => ({
            value: f.value,
            label: f.label,
          }))}
          placeholder="Filtrar ações..."
        />
        <button
          onClick={() => fetchLogs(activeFilter)}
          disabled={isLoading}
          className="p-2 bg-background-darkest border border-white/10 hover:border-white/20 rounded-xl text-gray-400 hover:text-white transition-colors cursor-pointer disabled:opacity-50"
          title="Recarregar"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-brand-400' : ''}`} />
        </button>
      </div>

      {/* Logs List Container */}
      <div className="flex-1 overflow-y-auto space-y-2 no-scrollbar">
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
            const actor = log.actor;

            return (
              <div
                key={log.id}
                className="bg-background-darker/50 hover:bg-background-darker/80 p-3 sm:p-3.5 rounded-xl border border-white/5 hover:border-white/10 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {/* Actor Avatar */}
                  <div className="w-8 h-8 rounded-full bg-brand-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0 overflow-hidden shadow-sm">
                    {actor?.avatar_url ? (
                      <img
                        src={formatAssetUrl(actor.avatar_url)}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span>{actor?.display_name?.[0]?.toUpperCase() || actor?.username?.[0]?.toUpperCase() || '?'}</span>
                    )}
                  </div>

                  {/* Narrative Sentence */}
                  <div className="min-w-0 flex-1">
                    {renderNarrative(log)}
                  </div>
                </div>

                {/* Timestamp */}
                <div className="flex items-center gap-1.5 text-[11px] text-gray-500 flex-shrink-0 sm:self-center pl-11 sm:pl-0 whitespace-nowrap">
                  <Clock className="w-3.5 h-3.5" />
                  <span>{formatDate(log.created_at)}</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
