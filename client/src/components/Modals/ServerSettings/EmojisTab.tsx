import React from 'react';
import {
  Upload,
  Smile,
  Copy,
  Check,
  Trash2,
  X,
} from 'lucide-react';
import { GuildEmoji } from '../../../types';
import { formatAssetUrl } from '../../../lib/api';

interface EmojisTabProps {
  emojisList: GuildEmoji[];
  isLoadingEmojis: boolean;
  isUploadingEmoji: boolean;
  emojiError: string;
  setEmojiError: (val: string) => void;
  emojiInputRef: React.RefObject<HTMLInputElement>;
  handleSelectEmojiFile: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  savingEmojiId: string | null;
  copiedEmojiId: string | null;
  setCopiedEmojiId: (id: string | null) => void;
  handleInlineRename: (id: string, newName: string, originalName: string) => Promise<void>;
  handleDeleteEmoji: (id: string, name: string) => Promise<void>;
  isOwner: boolean;
  hasAdmin: boolean;
  canManageGuild: boolean;
}

export const EmojisTab: React.FC<EmojisTabProps> = ({
  emojisList,
  isLoadingEmojis,
  isUploadingEmoji,
  emojiError,
  setEmojiError,
  emojiInputRef,
  handleSelectEmojiFile,
  savingEmojiId,
  copiedEmojiId,
  setCopiedEmojiId,
  handleInlineRename,
  handleDeleteEmoji,
  isOwner,
  hasAdmin,
  canManageGuild,
}) => {
  const maxSlots = 50;
  const availableSlots = Math.max(0, maxSlots - emojisList.length);
  const canManage = isOwner || hasAdmin || canManageGuild;

  return (
    <div id="emojis-custom" className="max-w-4xl space-y-6 animate-fade-in scroll-mt-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
        <div>
          <h2 className="text-base font-bold text-white">Emoji</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Adicione até {maxSlots} emojis personalizados que qualquer pessoa pode usar neste servidor.{' '}
            <span className="text-gray-300 font-medium">({availableSlots} slots disponíveis)</span>
          </p>
        </div>

        <div className="shrink-0">
          <input
            type="file"
            ref={emojiInputRef}
            onChange={handleSelectEmojiFile}
            accept="image/png,image/jpeg,image/gif,image/webp"
            className="hidden"
          />
          <button
            type="button"
            onClick={() => emojiInputRef.current?.click()}
            disabled={!canManage || isUploadingEmoji || availableSlots <= 0}
            className="px-4 py-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-lg shadow-brand-500/20 transition-all flex items-center gap-2 cursor-pointer"
          >
            {isUploadingEmoji ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white/20 border-t-white" />
                <span>Enviando...</span>
              </>
            ) : (
              <>
                <Upload className="w-4 h-4" />
                <span>Carregar Emoji</span>
              </>
            )}
          </button>
        </div>
      </div>

      {emojiError && (
        <div className="p-3.5 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 text-xs flex items-center justify-between animate-fade-in">
          <span>{emojiError}</span>
          <button
            type="button"
            onClick={() => setEmojiError('')}
            className="p-1 hover:text-white rounded transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {isLoadingEmojis ? (
        <div className="flex items-center justify-center py-16 text-gray-400">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500" />
        </div>
      ) : emojisList.length === 0 && !isUploadingEmoji ? (
        <div className="text-center py-16 px-4 rounded-2xl border border-white/10 bg-[#111214]/30">
          <Smile className="w-12 h-12 stroke-1 text-gray-500 mx-auto mb-3" />
          <h4 className="text-base font-semibold text-white">Nenhum emoji personalizado ainda</h4>
          <p className="text-xs text-gray-400 max-w-sm mx-auto mt-1">
            Carregue imagens quadradas (PNG, GIF, WebP) para que todos os membros possam usar no chat com :nome:!
          </p>
        </div>
      ) : (
        <div className="border border-white/10 rounded-2xl bg-[#111214]/50 overflow-hidden">
          {/* Table Column Headers */}
          <div className="grid grid-cols-12 gap-3 px-4 py-2.5 bg-[#111214] border-b border-white/10 text-[11px] font-bold uppercase tracking-wider text-gray-400 font-mono">
            <div className="col-span-2 sm:col-span-2">IMAGEM</div>
            <div className="col-span-5 sm:col-span-4">NOME</div>
            <div className="col-span-3 sm:col-span-4">ENVIADO POR</div>
            <div className="col-span-2 sm:col-span-2 text-right">AÇÕES</div>
          </div>

          {/* Table Rows */}
          <div className="divide-y divide-white/5">
            {isUploadingEmoji && (
              <div className="grid grid-cols-12 gap-3 px-4 py-3.5 items-center bg-brand-500/5 animate-pulse">
                <div className="col-span-2 flex items-center">
                  <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center">
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-brand-500/20 border-t-brand-500" />
                  </div>
                </div>
                <div className="col-span-10 text-xs text-brand-400 font-medium">
                  Enviando novo emoji...
                </div>
              </div>
            )}

            {emojisList.map((em) => {
              const isSaving = savingEmojiId === em.id;
              const isCopied = copiedEmojiId === em.id;

              return (
                <div
                  key={em.id}
                  className="grid grid-cols-12 gap-3 px-4 py-3 items-center hover:bg-white/[0.02] transition-colors group"
                >
                  {/* Image Column */}
                  <div className="col-span-2 sm:col-span-2 flex items-center">
                    <div className="w-10 h-10 rounded-xl bg-[#111214] border border-white/10 flex items-center justify-center p-1.5 shrink-0 overflow-hidden shadow-sm">
                      <img
                        src={formatAssetUrl(em.image_url)}
                        alt={em.name}
                        className="max-h-full max-w-full object-contain select-none"
                      />
                    </div>
                  </div>

                  {/* Name Column (Editable) */}
                  <div className="col-span-5 sm:col-span-4 min-w-0 pr-2">
                    <div className="flex items-center bg-[#111214] border border-white/10 focus-within:border-brand-500 rounded-xl px-2.5 py-1.5 transition-all w-full max-w-xs">
                      <span className="text-gray-500 font-mono text-xs select-none">:</span>
                      <input
                        type="text"
                        defaultValue={em.name}
                        key={`${em.id}-${em.name}`}
                        disabled={!canManage || isSaving}
                        onBlur={(e) => handleInlineRename(em.id, e.target.value, em.name)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            (e.target as HTMLInputElement).blur();
                          }
                        }}
                        maxLength={32}
                        className="bg-transparent text-xs text-white font-mono w-full px-1 focus:outline-none disabled:opacity-75"
                        placeholder="nome_do_emoji"
                      />
                      <span className="text-gray-500 font-mono text-xs select-none">:</span>
                      {isSaving && (
                        <div className="animate-spin rounded-full h-3 w-3 border border-brand-400 border-t-transparent ml-1 shrink-0" />
                      )}
                    </div>
                  </div>

                  {/* Uploaded By Column */}
                  <div className="col-span-3 sm:col-span-4 flex items-center gap-2 min-w-0">
                    <div className="w-6 h-6 rounded-full bg-white/10 overflow-hidden shrink-0">
                      {em.creator?.avatar_url ? (
                        <img
                          src={formatAssetUrl(em.creator.avatar_url)}
                          alt={em.creator.username}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[10px] font-bold text-white bg-brand-600">
                          {em.creator?.username?.[0]?.toUpperCase() || '?'}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs text-white font-medium truncate">
                        {em.creator?.display_name || em.creator?.username || 'Membro'}
                      </div>
                      <div className="text-[10px] text-gray-500 truncate hidden sm:block">
                        @{em.creator?.username || 'desconhecido'}
                      </div>
                    </div>
                  </div>

                  {/* Actions Column */}
                  <div className="col-span-2 sm:col-span-2 flex items-center justify-end gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(`:${em.name}:`);
                        setCopiedEmojiId(em.id);
                        setTimeout(() => setCopiedEmojiId(null), 2000);
                      }}
                      className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
                      title="Copiar código :nome:"
                    >
                      {isCopied ? (
                        <Check className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                    {canManage && (
                      <button
                        type="button"
                        onClick={() => handleDeleteEmoji(em.id, em.name)}
                        className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer"
                        title="Excluir Emoji"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
