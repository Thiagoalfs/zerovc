import React from 'react';
import {
  Users,
  Hash,
  Volume2,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  Upload,
  Image as ImageIcon,
  Crown,
  Trash2,
} from 'lucide-react';
import { Guild, Channel, User } from '../../../types';
import { formatAssetUrl } from '../../../lib/api';

interface OverviewTabProps {
  activeGuild: Guild;
  isOwner: boolean;
  members: User[];
  onlineMembersCount: number;
  textChannels: Channel[];
  voiceChannels: Channel[];
  overviewMsg: { text: string; type: 'success' | 'error' } | null;
  guildName: string;
  setGuildName: (val: string) => void;
  systemChannelId: string;
  setSystemChannelId: (val: string) => void;
  isSavingOverview: boolean;
  handleSaveOverview: (e: React.FormEvent) => Promise<void>;
  iconInputRef: React.RefObject<HTMLInputElement>;
  bannerInputRef: React.RefObject<HTMLInputElement>;
  handleIconChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleBannerChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleRemoveIcon: () => Promise<void>;
  handleRemoveBanner: () => Promise<void>;
  isUploadingIcon: boolean;
  isUploadingBanner: boolean;
  onOpenTransferModal: () => void;
  onOpenDeleteModal: () => void;
}

export const OverviewTab: React.FC<OverviewTabProps> = ({
  activeGuild,
  isOwner,
  members,
  onlineMembersCount,
  textChannels,
  voiceChannels,
  overviewMsg,
  guildName,
  setGuildName,
  systemChannelId,
  setSystemChannelId,
  isSavingOverview,
  handleSaveOverview,
  iconInputRef,
  bannerInputRef,
  handleIconChange,
  handleBannerChange,
  handleRemoveIcon,
  handleRemoveBanner,
  isUploadingIcon,
  isUploadingBanner,
  onOpenTransferModal,
  onOpenDeleteModal,
}) => {
  const initials = activeGuild.name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="max-w-3xl space-y-8 animate-fade-in">
      {/* Quick Stats Grid */}
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3 font-mono">
          Métricas do Servidor
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-4 rounded-xl bg-[#1e1f22] border border-white/10 flex flex-col">
            <div className="flex items-center justify-between text-gray-400 text-xs mb-1">
              <span>Total Membros</span>
              <Users className="w-4 h-4 text-brand-400" />
            </div>
            <span className="text-2xl font-bold text-white">{members.length}</span>
            <span className="text-[11px] text-emerald-400 mt-1 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {onlineMembersCount} online
            </span>
          </div>

          <div className="p-4 rounded-xl bg-[#1e1f22] border border-white/10 flex flex-col">
            <div className="flex items-center justify-between text-gray-400 text-xs mb-1">
              <span>Canais Texto</span>
              <Hash className="w-4 h-4 text-sky-400" />
            </div>
            <span className="text-2xl font-bold text-white">{textChannels.length}</span>
            <span className="text-[11px] text-gray-500 mt-1">salas de bate-papo</span>
          </div>

          <div className="p-4 rounded-xl bg-[#1e1f22] border border-white/10 flex flex-col">
            <div className="flex items-center justify-between text-gray-400 text-xs mb-1">
              <span>Canais Voz</span>
              <Volume2 className="w-4 h-4 text-emerald-400" />
            </div>
            <span className="text-2xl font-bold text-white">{voiceChannels.length}</span>
            <span className="text-[11px] text-gray-500 mt-1">com áudio & vídeo</span>
          </div>

          <div className="p-4 rounded-xl bg-[#1e1f22] border border-white/10 flex flex-col">
            <div className="flex items-center justify-between text-gray-400 text-xs mb-1">
              <span>Criação</span>
              <Calendar className="w-4 h-4 text-purple-400" />
            </div>
            <span className="text-sm font-semibold text-white mt-1">
              {activeGuild.created_at ? new Date(activeGuild.created_at).toLocaleDateString('pt-BR') : 'Hoje'}
            </span>
            <span className="text-[11px] text-gray-500 mt-auto">data de fundação</span>
          </div>
        </div>
      </div>

      {overviewMsg && (
        <div
          className={`p-3.5 rounded-xl text-sm flex items-center gap-2.5 ${
            overviewMsg.type === 'success'
              ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
              : 'bg-red-500/15 text-red-300 border border-red-500/30'
          }`}
        >
          {overviewMsg.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 shrink-0" />
          )}
          <span>{overviewMsg.text}</span>
        </div>
      )}

      {/* Visual Identity (Icon & Banner) */}
      <div id="overview-identity" className="space-y-4 scroll-mt-6">
        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 font-mono">
          Identidade Visual
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-[#1e1f22] p-5 rounded-2xl border border-white/10">
          {/* Icon */}
          <div className="flex flex-col gap-3">
            <label className="text-xs font-medium text-gray-300">Ícone do Servidor</label>
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 rounded-2xl bg-[#2b2d31] border-2 border-white/15 flex items-center justify-center overflow-hidden shrink-0 shadow-lg">
                {activeGuild.icon_url ? (
                  <img
                    src={formatAssetUrl(activeGuild.icon_url)}
                    alt={activeGuild.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-xl font-bold text-white">{initials}</span>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <input
                  type="file"
                  ref={iconInputRef}
                  onChange={handleIconChange}
                  accept="image/*"
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => iconInputRef.current?.click()}
                  disabled={!isOwner || isUploadingIcon}
                  className="px-3.5 py-1.5 bg-white/10 hover:bg-white/15 text-white rounded-lg text-xs font-medium transition-colors flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>{isUploadingIcon ? 'Enviando...' : 'Trocar Ícone'}</span>
                </button>
                {activeGuild.icon_url && isOwner && (
                  <button
                    type="button"
                    onClick={handleRemoveIcon}
                    disabled={isUploadingIcon}
                    className="text-xs text-red-400 hover:text-red-300 text-left transition-colors cursor-pointer"
                  >
                    Remover Ícone
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Banner */}
          <div className="flex flex-col gap-3">
            <label className="text-xs font-medium text-gray-300">Banner do Servidor</label>
            <div className="flex flex-col gap-2">
              <div className="w-full h-20 rounded-xl bg-[#2b2d31] border border-white/15 overflow-hidden relative group">
                {activeGuild.banner_url ? (
                  <img
                    src={formatAssetUrl(activeGuild.banner_url)}
                    alt="Banner"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-500 text-xs gap-1.5">
                    <ImageIcon className="w-4 h-4" />
                    <span>Sem banner definido</span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="file"
                  ref={bannerInputRef}
                  onChange={handleBannerChange}
                  accept="image/*"
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => bannerInputRef.current?.click()}
                  disabled={!isOwner || isUploadingBanner}
                  className="px-3.5 py-1.5 bg-white/10 hover:bg-white/15 text-white rounded-lg text-xs font-medium transition-colors flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>{isUploadingBanner ? 'Enviando...' : 'Trocar Banner'}</span>
                </button>
                {activeGuild.banner_url && isOwner && (
                  <button
                    type="button"
                    onClick={handleRemoveBanner}
                    disabled={isUploadingBanner}
                    className="text-xs text-red-400 hover:text-red-300 transition-colors cursor-pointer"
                  >
                    Remover Banner
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* General Form */}
      <form onSubmit={handleSaveOverview} className="space-y-6">
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-wider text-gray-400 font-mono">
            Nome do Servidor
          </label>
          <input
            type="text"
            value={guildName}
            onChange={(e) => setGuildName(e.target.value)}
            disabled={!isOwner}
            placeholder="Nome do servidor"
            className="w-full px-4 py-2.5 bg-[#111214] border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-brand-500 transition-colors disabled:opacity-60"
          />
        </div>

        {/* System Welcome Channel Selector */}
        <div id="overview-system" className="space-y-2 scroll-mt-6">
          <label className="text-xs font-bold uppercase tracking-wider text-gray-400 font-mono">
            Canal de Mensagens do Sistema (Boas-Vindas)
          </label>
          <p className="text-xs text-gray-400">
            O canal onde o servidor pode receber novos membros e avisos importantes.
          </p>
          <select
            value={systemChannelId}
            onChange={(e) => setSystemChannelId(e.target.value)}
            disabled={!isOwner}
            className="w-full px-4 py-2.5 bg-[#111214] border border-white/10 rounded-xl text-white focus:outline-none focus:border-brand-500 transition-colors disabled:opacity-60"
          >
            <option value="">Nenhum (Desativado)</option>
            {textChannels.map((ch) => (
              <option key={ch.id} value={ch.id}>
                # {ch.name}
              </option>
            ))}
          </select>
        </div>

        {isOwner && (
          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={isSavingOverview || !guildName.trim()}
              className="px-6 py-2.5 bg-brand-500 hover:bg-brand-600 text-white rounded-xl text-sm font-semibold shadow-lg shadow-brand-500/20 transition-all disabled:opacity-50 cursor-pointer"
            >
              {isSavingOverview ? 'Salvando...' : 'Salvar Alterações'}
            </button>
          </div>
        )}
      </form>

      {/* Danger Zone / Owner Actions */}
      {isOwner && (
        <div id="overview-danger" className="pt-6 border-t border-white/10 space-y-4 scroll-mt-6">
          <h3 className="text-xs font-bold uppercase tracking-wider text-red-400 font-mono">
            Zona de Perigo & Ações do Dono
          </h3>
          
          <div className="space-y-3">
            {/* Transfer Ownership */}
            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <Crown className="w-4 h-4 text-amber-400" />
                  Transferir Posse do Servidor
                </h4>
                <p className="text-xs text-gray-400 mt-0.5">
                  Passe a posse total deste servidor para outro membro. Você perderá os privilégios exclusivos de proprietário.
                </p>
              </div>
              <button
                type="button"
                onClick={onOpenTransferModal}
                className="bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 font-semibold px-4 py-2 rounded-xl text-xs transition-colors shrink-0 flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <Crown className="w-3.5 h-3.5" />
                <span>Transferir Posse</span>
              </button>
            </div>

            {/* Delete Server */}
            <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <Trash2 className="w-4 h-4 text-red-400" />
                  Excluir Servidor
                </h4>
                <p className="text-xs text-gray-400 mt-0.5">
                  Esta ação é permanente e irreversível. Todos os canais, mensagens, cargos e dados serão excluídos imediatamente.
                </p>
              </div>
              <button
                type="button"
                onClick={onOpenDeleteModal}
                className="bg-red-500 hover:bg-red-600 active:bg-red-700 text-white font-semibold px-4 py-2 rounded-xl text-xs transition-colors shrink-0 flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Excluir Servidor</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
