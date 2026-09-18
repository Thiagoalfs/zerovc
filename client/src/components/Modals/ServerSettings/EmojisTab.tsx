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
  return (
    <div className="max-w-4xl space-y-6 animate-fade-in">
      <div className="flex items-center justify-between p-5 rounded-2xl bg-[#1e1f22] border border-white/10">
        <div>
          <h3 className="text-sm font-bold text-white">Slots de Emojis do Servidor</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            {emojisList.length} de 50 slots utilizados • Clique no nome para renomear
          </p>
        </div>
        <div>
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
            disabled={(!isOwner && !hasAdmin && !canManageGuild) || isUploadingEmoji}
            className="px-4 py-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-lg shadow-brand-500/20 transition-all flex items-center gap-2 cursor-pointer"
          >
            {isUploadingEmoji ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white/20 border-t-white" />
                <span>Carregando...</span>
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
        <div className="text-center py-16 px-4 rounded-2xl bg-[#1e1f22]/60 border border-white/10">
          <Smile className="w-12 h-12 stroke-1 text-gray-500 mx-auto mb-3" />
          <h4 className="text-base font-semibold text-white">Nenhum emoji personalizado ainda</h4>
          <p className="text-xs text-gray-400 max-w-sm mx-auto mt-1">
            Carregue imagens quadradas (PNG, GIF, WebP) para que todos os membros possam usar no chat com :nome:!
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {isUploadingEmoji && (
            <div className="p-3.5 rounded-2xl bg-[#1e1f22]/60 border border-brand-500/40 animate-pulse flex flex-col items-center justify-center min-h-[165px]">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-brand-500/20 border-t-brand-500 mb-2" />
              <span className="text-xs text-brand-400 font-medium">Enviando emoji...</span>
            </div>
          )}

          {emojisList.map((em) => {
            const isSaving = savingEmojiId === em.id;
            const isCopied = copiedEmojiId === em.id;
            return (
              <div
                key={em.id}
                className="p-3.5 rounded-2xl bg-[#1e1f22] border border-white/10 hover:border-white/15 transition-all flex flex-col group relative"
              >
                <div className="w-full h-24 rounded-xl bg-[#111214] flex items-center justify-center p-2 mb-2.5 overflow-hidden">
                  <img
                    src={formatAssetUrl(em.image_url)}
                    alt={em.name}
                    className="max-h-full max-w-full object-contain select-none"
                  />
                </div>

                {/* Inline Rename Box */}
                <div className="space-y-1.5 flex-1 flex flex-col justify-between">
                  <div className="flex items-center bg-[#111214] border border-white/10 focus-within:border-brand-500 rounded-lg px-2 py-1 transition-all">
                    <span className="text-gray-500 font-mono text-xs select-none">:</span>
                    <input
                      type="text"
                      defaultValue={em.name}
                      key={`${em.id}-${em.name}`}
                      disabled={(!isOwner && !hasAdmin && !canManageGuild) || isSaving}
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

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[10px] text-gray-500 truncate max-w-[80px]" title={em.creator ? `@${em.creator.username}` : ''}>
                      {em.creator ? `@${em.creator.username}` : ''}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(`:${em.name}:`);
                          setCopiedEmojiId(em.id);
                          setTimeout(() => setCopiedEmojiId(null), 2000);
                        }}
                        className="p-1 text-gray-400 hover:text-white rounded transition-colors cursor-pointer"
                        title="Copiar código :nome:"
                      >
                        {isCopied ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                      {(isOwner || hasAdmin || canManageGuild) && (
                        <button
                          type="button"
                          onClick={() => handleDeleteEmoji(em.id, em.name)}
                          className="p-1 text-red-400 hover:text-red-300 rounded transition-colors cursor-pointer"
                          title="Excluir Emoji"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
