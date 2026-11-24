import React from 'react';
import {
  Hash,
  AlertTriangle,
} from 'lucide-react';
import { Guild, Channel, User } from '../../../types';
import { formatAssetUrl } from '../../../lib/api';
import { DropdownSelect } from '../../Common/DropdownSelect';
import { EditPencilOverlay } from '../../Common/EditPencilOverlay';
import {
  MODAL_FIELD_LABEL_CLASS,
  MODAL_DESCRIPTION_CLASS,
} from '../../../constants/modalTypography';
import { ModalButton } from '@/components/ui/modal-button';

interface ServerProfileProps {
  activeGuild: Guild;
  isOwner: boolean;
  canManageGuild?: boolean;
  hasAdmin?: boolean;
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
  handleRemoveIcon: () => Promise<void> | void;
  handleRemoveBanner: () => Promise<void> | void;
  isUploadingIcon: boolean;
  isUploadingBanner: boolean;
  previewIconUrl?: string | null;
  previewBannerUrl?: string | null;
}

export const ServerProfile: React.FC<ServerProfileProps> = ({
  activeGuild,
  isOwner,
  canManageGuild,
  hasAdmin,
  members,
  onlineMembersCount,
  textChannels,
  overviewMsg,
  guildName,
  setGuildName,
  systemChannelId,
  setSystemChannelId,
  handleSaveOverview,
  iconInputRef,
  bannerInputRef,
  handleIconChange,
  handleBannerChange,
  handleRemoveIcon,
  handleRemoveBanner,
  isUploadingIcon,
  isUploadingBanner,
  previewIconUrl,
  previewBannerUrl,
}) => {
  const effectiveIconSrc =
    previewIconUrl !== undefined
      ? previewIconUrl || ''
      : activeGuild.icon_url
      ? formatAssetUrl(activeGuild.icon_url)
      : '';
  const effectiveBannerSrc =
    previewBannerUrl !== undefined
      ? previewBannerUrl || ''
      : activeGuild.banner_url
      ? formatAssetUrl(activeGuild.banner_url)
      : '';
  const initials = activeGuild.name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const canEdit = isOwner || Boolean(hasAdmin) || Boolean(canManageGuild);
  const createdLabel = activeGuild.created_at
    ? new Date(activeGuild.created_at).toLocaleDateString('pt-BR', {
        month: 'short',
        year: 'numeric',
      })
    : 'Hoje';

  return (
    <div className="max-w-5xl space-y-6 animate-fade-in py-6">
      {overviewMsg?.type === 'error' && (
        <div className="p-3.5 rounded-xl text-sm flex items-center gap-2.5 bg-red-500/15 text-red-300 border border-red-500/30">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{overviewMsg.text}</span>
        </div>
      )}

      {/* 2-Column Layout: Left (Name & Welcome Channel) | Right (Identidade Visual) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
        {/* Left Column: General Form */}
        <form onSubmit={handleSaveOverview} className="space-y-6">
          <div className="space-y-2">
            <label className={MODAL_FIELD_LABEL_CLASS}>
              Nome do servidor
            </label>
            <input
              type="text"
              value={guildName}
              onChange={(e) => setGuildName(e.target.value)}
              disabled={!canEdit}
              placeholder="Nome do servidor"
              className="w-full px-4 py-2.5 bg-background-darkest border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-brand-500 transition-colors disabled:opacity-60"
            />
          </div>

          <div className="space-y-2">
            <label className={MODAL_FIELD_LABEL_CLASS}>
              Ícone
            </label>
            <p className={MODAL_DESCRIPTION_CLASS}>
              Recomendamos utilizar uma imagem de, pelo menos, 512x512
            </p>
            <div className="flex flex-wrap items-center gap-2.5">
              <ModalButton
                type="primary"
                size="small"
                onClick={() => iconInputRef.current?.click()}
                disabled={!canEdit}
                loading={isUploadingIcon}
              >
                Mudar ícone do servidor
              </ModalButton>
              {effectiveIconSrc && canEdit && (
                <ModalButton
                  type="error"
                  size="small"
                  onClick={handleRemoveIcon}
                  disabled={isUploadingIcon}
                >
                  Remover ícone
                </ModalButton>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <label className={MODAL_FIELD_LABEL_CLASS}>
              Canal de boas-vindas
            </label>
            <p className={MODAL_DESCRIPTION_CLASS}>
              O canal onde o servidor recebe novos membros e avisos importantes.
            </p>
            <DropdownSelect
              value={systemChannelId}
              onChange={(val) => setSystemChannelId(String(val))}
              disabled={!canEdit}
              options={[
                { value: '', label: 'Nenhum (Desativado)' },
                ...textChannels.map((ch) => ({
                  value: ch.id,
                  label: ch.name,
                  icon: <Hash className="w-4 h-4 text-gray-400" />,
                })),
              ]}
              placeholder="Nenhum (Desativado)"
            />
          </div>
        </form>

        {/* Right Column: Identidade Visual */}
        <div className="space-y-2">
          <label className={MODAL_FIELD_LABEL_CLASS}>
            Identidade visual
          </label>

          <input
            type="file"
            ref={iconInputRef}
            onChange={handleIconChange}
            accept="image/*"
            className="hidden"
          />
          <input
            type="file"
            ref={bannerInputRef}
            onChange={handleBannerChange}
            accept="image/*"
            className="hidden"
          />

          <div className="rounded-3xl overflow-hidden bg-background-darker border border-white/5 shadow-lg relative">
            {/* Banner (Interactive / Click to Upload) */}
            <div
              role={canEdit ? 'button' : undefined}
              tabIndex={canEdit ? 0 : undefined}
              aria-label={canEdit ? 'Alterar banner do servidor' : undefined}
              onKeyDown={(e) => {
                if (canEdit && (e.key === 'Enter' || e.key === ' ')) bannerInputRef.current?.click();
              }}
              className={`w-full h-28 sm:h-32 bg-gradient-to-r from-brand-600 via-purple-600 to-indigo-600 relative bg-cover bg-center flex-shrink-0 ${
                canEdit ? 'group cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400' : ''
              }`}
              style={{ backgroundImage: effectiveBannerSrc ? `url(${effectiveBannerSrc})` : undefined }}
              onClick={() => canEdit && bannerInputRef.current?.click()}
            >
              {canEdit && <EditPencilOverlay variant="top-right" />}
            </div>

            {/* Server Icon + Info (Discord-style stacked card) */}
            <div className="px-5 pb-5 pt-0 bg-background-darker space-y-3">
              <div className="flex items-end justify-between gap-3 -mt-12">
                {/* Server Icon (Interactive / Click to Upload) */}
                <div
                  role={canEdit ? 'button' : undefined}
                  tabIndex={canEdit ? 0 : undefined}
                  aria-label={canEdit ? 'Alterar ícone do servidor' : undefined}
                  onKeyDown={(e) => {
                    if (canEdit && (e.key === 'Enter' || e.key === ' ')) iconInputRef.current?.click();
                  }}
                  className={`w-20 h-20 sm:w-24 sm:h-24 rounded-3xl border-4 border-background-darker bg-brand-500 overflow-hidden shadow-2xl flex-shrink-0 flex items-center justify-center text-white font-bold text-3xl relative ${
                    canEdit ? 'group cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400' : ''
                  }`}
                  onClick={() => canEdit && iconInputRef.current?.click()}
                >
                  {effectiveIconSrc ? (
                    <img
                      src={effectiveIconSrc}
                      alt={activeGuild.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span>{initials}</span>
                  )}

                  {canEdit && <EditPencilOverlay variant="center" />}
                </div>

                {canEdit && effectiveBannerSrc && (
                  <div className="flex items-center gap-2 pb-1">
                    <ModalButton
                      type="error"
                      size="tiny"
                      onClick={handleRemoveBanner}
                      disabled={isUploadingBanner}
                    >
                      Remover Banner
                    </ModalButton>
                  </div>
                )}
              </div>

              {/* Server Name, Online/Total KPI & Creation Date */}
              <div className="space-y-1">
                <h4 className="text-lg font-bold text-white leading-tight tracking-tight truncate">
                  {guildName || activeGuild.name}
                </h4>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-300">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span>{onlineMembersCount} Online</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-gray-400" />
                    <span>
                      {members.length} {members.length === 1 ? 'Membro' : 'Membros'}
                    </span>
                  </span>
                </div>
                <p className="text-xs text-gray-400">
                  Criado em {createdLabel}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
