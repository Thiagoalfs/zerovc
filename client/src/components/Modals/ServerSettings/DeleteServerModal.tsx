import React from 'react';
import { X, Lock, Trash2, Loader2 } from 'lucide-react';
import { Guild, User } from '../../../types';
import { formatAssetUrl } from '../../../lib/api';

interface DeleteServerModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeGuild: Guild;
  user: User | null;
  deleteConfirmText: string;
  setDeleteConfirmText: (val: string) => void;
  isDeleteAcknowledged: boolean;
  setIsDeleteAcknowledged: (val: boolean) => void;
  twoFactorCode: string;
  setTwoFactorCode: (val: string) => void;
  deleteError: string;
  setDeleteError: (val: string) => void;
  isDeleting: boolean;
  onConfirmDelete: () => Promise<void>;
  membersCount: number;
}

export const DeleteServerModal: React.FC<DeleteServerModalProps> = ({
  isOpen,
  onClose,
  activeGuild,
  user,
  deleteConfirmText,
  setDeleteConfirmText,
  isDeleteAcknowledged,
  setIsDeleteAcknowledged,
  twoFactorCode,
  setTwoFactorCode,
  deleteError,
  setDeleteError,
  isDeleting,
  onConfirmDelete,
  membersCount,
}) => {
  if (!isOpen) return null;

  const initials = activeGuild.name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div
      className="fixed inset-0 z-[999999] flex items-center justify-center bg-black/75 backdrop-blur-sm select-none p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-150"
      style={{ zIndex: 999999 }}
      onClick={onClose}
    >
      <div
        className="bg-background-dark w-full max-w-md max-h-[92dvh] my-auto rounded-2xl overflow-hidden shadow-2xl border border-white/10 animate-in fade-in zoom-in-95 duration-150 flex flex-col text-gray-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 pb-3 flex-shrink-0">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
              <span>Excluir servidor</span>
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <p className="text-xs text-gray-300 leading-relaxed">
            Tem certeza de que deseja excluir o servidor <span className="font-semibold text-white">"{activeGuild.name}"</span>? Esta ação não pode ser desfeita.
          </p>
        </div>

        {/* Server Preview Box */}
        <div className="px-4 sm:px-5 py-2 overflow-y-auto no-scrollbar flex-1">
          <div className="bg-background-darkest/90 rounded-2xl p-3 border border-white/5 shadow-inner flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-brand-500 flex items-center justify-center font-bold text-white text-sm flex-shrink-0 overflow-hidden shadow-md">
              {activeGuild.icon_url ? (
                <img
                  src={formatAssetUrl(activeGuild.icon_url)}
                  alt={activeGuild.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span>{initials}</span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-xs text-white truncate">
                {activeGuild.name}
              </div>
              <div className="text-[10px] text-gray-400 font-mono mt-0.5">
                {membersCount} membro(s) • {(activeGuild.channels || []).length} canal(is)
              </div>
            </div>
          </div>

          {deleteError && (
            <div className="mt-3 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs">
              {deleteError}
            </div>
          )}

          <div className="mt-4 space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold uppercase tracking-wider text-gray-400 font-mono">
                DIGITE O NOME DO SERVIDOR
              </label>
              <button
                type="button"
                onClick={() => {
                  setDeleteConfirmText(activeGuild.name);
                  if (deleteError) setDeleteError('');
                }}
                className="text-[11px] text-brand-400 hover:text-brand-300 hover:underline cursor-pointer"
              >
                Preencher
              </button>
            </div>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => {
                setDeleteConfirmText(e.target.value);
                if (deleteError) setDeleteError('');
              }}
              placeholder={activeGuild.name}
              autoFocus
              className="w-full px-3 py-2 bg-background-darkest/90 border border-white/10 rounded-xl text-white text-xs focus:outline-none focus:border-red-500 transition-colors"
            />
          </div>

          {Boolean(user?.two_factor_enabled) && (
            <div className="mt-4 space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold uppercase tracking-wider text-gray-400 font-mono flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-brand-400" />
                  <span>CÓDIGO DE AUTENTICAÇÃO (2FA)</span>
                </label>
              </div>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={10}
                value={twoFactorCode}
                onChange={(e) => {
                  setTwoFactorCode(e.target.value);
                  if (deleteError) setDeleteError('');
                }}
                placeholder="Código de 6 dígitos ou backup"
                className="w-full px-3 py-2 bg-background-darkest/90 border border-white/10 rounded-xl text-white text-xs font-mono tracking-wider focus:outline-none focus:border-brand-500 transition-colors placeholder:font-sans placeholder:tracking-normal"
              />
              <p className="text-[10px] text-gray-400">
                Insira o código do seu aplicativo autenticador (Google Authenticator, Authy, etc.) ou um código de backup.
              </p>
            </div>
          )}

          <div className="mt-3 flex items-center gap-2.5 p-2.5 rounded-xl bg-white/5 border border-white/5">
            <input
              type="checkbox"
              id="delete-server-ack"
              checked={isDeleteAcknowledged}
              onChange={(e) => {
                setIsDeleteAcknowledged(e.target.checked);
                if (deleteError) setDeleteError('');
              }}
              className="w-4 h-4 rounded border-gray-600 bg-background-darkest text-red-600 focus:ring-red-500 cursor-pointer shrink-0"
            />
            <label
              htmlFor="delete-server-ack"
              className="text-xs text-gray-300 cursor-pointer select-none leading-tight"
            >
              Estou ciente de que todos os canais e mensagens serão excluídos permanentemente.
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="p-5 pt-3 bg-background-darkest/60 border-t border-white/5 flex items-center justify-end gap-3 mt-2 flex-shrink-0">
          <button
            type="button"
            disabled={isDeleting}
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-gray-300 hover:text-white hover:underline transition-all cursor-pointer disabled:opacity-50"
          >
            Cancelar
          </button>

          <button
            type="button"
            disabled={isDeleting || (Boolean(user?.two_factor_enabled) && !twoFactorCode.trim())}
            onClick={onConfirmDelete}
            className="bg-dnd hover:bg-red-600 active:scale-95 disabled:opacity-50 text-white font-semibold px-5 py-2 rounded-xl text-xs transition-all shadow-lg shadow-red-500/20 flex items-center gap-2 cursor-pointer"
          >
            {isDeleting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Excluindo...</span>
              </>
            ) : (
              <>
                <Trash2 className="w-3.5 h-3.5" />
                <span>Excluir Servidor</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
