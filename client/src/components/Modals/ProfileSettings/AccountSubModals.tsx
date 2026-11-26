import React, { useEffect, useRef, useState } from 'react';
import { X, AlertTriangle, Copy, Download } from 'lucide-react';
import { useAuthStore } from '../../../stores/authStore';
import { api } from '../../../lib/api';
import { copyToClipboard } from '../../../utils/clipboard';
import { OtpInput } from '../../ui/otp-input';
import { AppInput } from '@/components/ui/app-input';
import { ModalButton } from '@/components/ui/modal-button';
import { AppModal, AppModalBody } from '@/components/ui/app-modal';
import {
  MODAL_CARD_PADDING_CLASS,
  MODAL_DIALOG_TITLE_CLASS,
  MODAL_FIELD_LABEL_CLASS,
} from '../../../constants/modalTypography';

const AccountModalShell: React.FC<{
  titleId: string;
  onClose: () => void;
  onSubmit?: (e: React.FormEvent) => void;
  maxWidth?: 'sm' | 'md';
  className?: string;
  children: React.ReactNode;
}> = ({ titleId, onClose, onSubmit, maxWidth = 'sm', className = '', children }) => (
  <AppModal
    isOpen={true}
    onClose={onClose}
    titleId={titleId}
    size={maxWidth}
    className={`bg-background-darkest max-h-[92dvh] my-auto animate-in zoom-in-95 ${className}`}
  >
    <AppModalBody
      onSubmit={onSubmit}
      className={`${MODAL_CARD_PADDING_CLASS} space-y-4 overflow-y-auto chat-scrollbar`}
    >
      {children}
    </AppModalBody>
  </AppModal>
);

export type AccountSubModalType =
  | 'displayName'
  | 'username'
  | 'email'
  | 'phone'
  | 'password'
  | '2fa'
  | 'backupCodes'
  | 'deleteAccount'
  | null;

interface AccountSubModalsProps {
  activeModal: AccountSubModalType;
  onOpenModal: (modal: AccountSubModalType) => void;
  onClose: () => void;
  onDisplayNameUpdated?: (displayName: string) => void;
}

export const AccountSubModals: React.FC<AccountSubModalsProps> = ({
  activeModal,
  onOpenModal,
  onClose,
  onDisplayNameUpdated,
}) => {
  const { user, setUser, updateProfile, logout } = useAuthStore();

  // Display Name
  const [newDisplayName, setNewDisplayName] = useState(user?.display_name || '');
  const [isSavingDisplayName, setIsSavingDisplayName] = useState(false);

  // Username
  const [newUsername, setNewUsername] = useState(user?.username || '');
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [isSavingUsername, setIsSavingUsername] = useState(false);

  // Email
  const [newEmail, setNewEmail] = useState(user?.email || '');
  const [emailCurrentPassword, setEmailCurrentPassword] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [isSavingEmail, setIsSavingEmail] = useState(false);

  // Phone
  const [newPhone, setNewPhone] = useState(user?.phone_number || '');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [isSavingPhone, setIsSavingPhone] = useState(false);

  // Password
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  // 2FA & Backup Codes
  const [qrCodeData, setQrCodeData] = useState<string | null>(null);
  const [secretKey, setSecretKey] = useState<string | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [twoFactorPassword, setTwoFactorPassword] = useState('');
  const [twoFactorError, setTwoFactorError] = useState<string | null>(null);
  const [is2FALoading, setIs2FALoading] = useState(false);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [copiedBackupCodes, setCopiedBackupCodes] = useState(false);

  // Delete Account
  const [deleteAccountPassword, setDeleteAccountPassword] = useState('');
  const [deleteAccountError, setDeleteAccountError] = useState<string | null>(null);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  // 2FA confirmation for sensitive account actions
  const [twoFactorActionCode, setTwoFactorActionCode] = useState('');

  // Sync/reset fields when opening a sub-modal
  useEffect(() => {
    if (!activeModal || !user) return;
    setTwoFactorActionCode('');

    if (activeModal === 'displayName') {
      setNewDisplayName(user.display_name || '');
    } else if (activeModal === 'username') {
      setNewUsername(user.username || '');
      setUsernameError(null);
    } else if (activeModal === 'email') {
      setNewEmail(user.email || '');
      setEmailCurrentPassword('');
      setEmailError(null);
    } else if (activeModal === 'phone') {
      setNewPhone(user.phone_number || '');
      setPhoneError(null);
    } else if (activeModal === 'password') {
      setPasswordError(null);
      setPasswordSuccess(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } else if (activeModal === '2fa') {
      setTwoFactorError(null);
      setTwoFactorPassword('');
      setTotpCode('');
      if (!user.two_factor_enabled) {
        let cancelled = false;
        setIs2FALoading(true);
        api.auth
          .generate2FA()
          .then((res) => {
            if (cancelled) return;
            setQrCodeData(
              `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
                res.otpauth_uri
              )}`
            );
            setSecretKey(res.secret);
          })
          .catch((err: any) => {
            if (cancelled) return;
            setTwoFactorError(err.message || 'Erro ao gerar QR Code.');
          })
          .finally(() => {
            if (!cancelled) setIs2FALoading(false);
          });
        return () => {
          cancelled = true;
        };
      }
    } else if (activeModal === 'deleteAccount') {
      setDeleteAccountPassword('');
      setDeleteAccountError(null);
    }
  }, [activeModal, user]);

  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (activeModal) {
      if (!previousFocusRef.current && document.activeElement instanceof HTMLElement) {
        previousFocusRef.current = document.activeElement;
      }
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.stopImmediatePropagation();
          onClose();
        }
      };
      window.addEventListener('keydown', handleKeyDown, true);
      return () => window.removeEventListener('keydown', handleKeyDown, true);
    }

    if (previousFocusRef.current) {
      const el = previousFocusRef.current;
      previousFocusRef.current = null;
      el.focus();
    }
  }, [activeModal, onClose]);

  if (!user || !activeModal) return null;

  const handleSaveDisplayName = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingDisplayName(true);
    try {
      const updated = await updateProfile({ display_name: newDisplayName.trim() });
      setUser(updated);
      onDisplayNameUpdated?.(updated.display_name || '');
      onClose();
    } catch (err: any) {
      console.error('Failed to update display name:', err);
    } finally {
      setIsSavingDisplayName(false);
    }
  };

  const handleSaveUsername = async (e: React.FormEvent) => {
    e.preventDefault();
    setUsernameError(null);
    const trimmed = newUsername.trim().toLowerCase();
    if (!/^[a-z0-9_]{2,32}$/.test(trimmed)) {
      setUsernameError(
        'O @ deve conter apenas letras minúsculas, números e sublinhado (_) (2 a 32 caracteres), sem espaços, acentos, maiúsculas ou símbolos.'
      );
      return;
    }

    if (user.two_factor_enabled && trimmed !== user.username?.toLowerCase() && !twoFactorActionCode.trim()) {
      setUsernameError('Digite o código 2FA (ou código de backup) para confirmar.');
      return;
    }

    setIsSavingUsername(true);
    try {
      const updated = await updateProfile({
        username: trimmed,
        ...(user.two_factor_enabled ? { code: twoFactorActionCode.trim() } : {}),
      });
      setUser(updated);
      onClose();
    } catch (err: any) {
      setUsernameError(err.message || 'Este nome de usuário (@) já está em uso.');
    } finally {
      setIsSavingUsername(false);
    }
  };

  const handleSaveEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError(null);
    if (!newEmail.trim() || !newEmail.includes('@')) {
      setEmailError('Insira um e-mail válido.');
      return;
    }
    if (!emailCurrentPassword) {
      setEmailError('Insira sua senha atual para confirmar.');
      return;
    }
    if (user.two_factor_enabled && !twoFactorActionCode.trim()) {
      setEmailError('Digite o código 2FA (ou código de backup) para confirmar.');
      return;
    }

    setIsSavingEmail(true);
    try {
      const res = await api.auth.changeEmail({
        password: emailCurrentPassword,
        new_email: newEmail.trim(),
        ...(user.two_factor_enabled ? { code: twoFactorActionCode.trim() } : {}),
      });
      setUser({ email: res.email });
      onClose();
      setEmailCurrentPassword('');
    } catch (err: any) {
      setEmailError(err.message || 'Falha ao atualizar e-mail. Verifique sua senha.');
    } finally {
      setIsSavingEmail(false);
    }
  };

  const handleSavePhone = async (e: React.FormEvent) => {
    e.preventDefault();
    setPhoneError(null);
    const trimmed = newPhone.trim();

    setIsSavingPhone(true);
    try {
      const updated = await updateProfile({ phone_number: trimmed });
      setUser(updated);
      onClose();
    } catch (err: any) {
      setPhoneError(err.message || 'Falha ao atualizar número.');
    } finally {
      setIsSavingPhone(false);
    }
  };

  const handleSavePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(false);

    if (newPassword.length < 6) {
      setPasswordError('A nova senha deve ter no mínimo 6 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('A confirmação da nova senha não confere.');
      return;
    }
    if (user.two_factor_enabled && !twoFactorActionCode.trim()) {
      setPasswordError('Digite o código 2FA (ou código de backup) para confirmar.');
      return;
    }

    setIsSavingPassword(true);
    try {
      await api.auth.changePassword({
        current_password: currentPassword,
        new_password: newPassword,
        ...(user.two_factor_enabled ? { code: twoFactorActionCode.trim() } : {}),
      });
      setPasswordSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => {
        onClose();
        setPasswordSuccess(false);
      }, 1500);
    } catch (err: any) {
      setPasswordError(err.message || 'Senha atual incorreta.');
    } finally {
      setIsSavingPassword(false);
    }
  };

  const handleToggle2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    setTwoFactorError(null);
    if (!totpCode.trim()) {
      setTwoFactorError('Digite o código de 6 dígitos.');
      return;
    }

    setIs2FALoading(true);
    try {
      if (user.two_factor_enabled) {
        await api.auth.disable2FA({ code: totpCode.trim() });
        setUser({ ...user, two_factor_enabled: false });
        onClose();
      } else {
        if (!twoFactorPassword.trim()) {
          setTwoFactorError('Digite sua senha atual para ativar o 2FA.');
          setIs2FALoading(false);
          return;
        }
        const res = await api.auth.enable2FA({
          secret: secretKey || '',
          code: totpCode.trim(),
          password: twoFactorPassword,
        });
        setUser({ ...user, two_factor_enabled: true });
        if (res.backup_codes && res.backup_codes.length > 0) {
          setBackupCodes(res.backup_codes);
          setCopiedBackupCodes(false);
          onOpenModal('backupCodes');
        } else {
          onClose();
        }
      }
    } catch (err: any) {
      setTwoFactorError(err.message || 'Código inválido.');
    } finally {
      setIs2FALoading(false);
    }
  };

  const handleDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setDeleteAccountError(null);
    if (!deleteAccountPassword.trim()) {
      setDeleteAccountError('Digite sua senha para confirmar a exclusão.');
      return;
    }
    if (user.two_factor_enabled && !twoFactorActionCode.trim()) {
      setDeleteAccountError('Digite o código 2FA (ou código de backup) para confirmar.');
      return;
    }

    setIsDeletingAccount(true);
    try {
      await api.auth.deleteAccount({
        password: deleteAccountPassword,
        ...(user.two_factor_enabled ? { code: twoFactorActionCode.trim() } : {}),
      });
      onClose();
      logout();
      window.location.href = '/';
    } catch (err: any) {
      setDeleteAccountError(err.message || 'Senha incorreta ao tentar excluir conta.');
    } finally {
      setIsDeletingAccount(false);
    }
  };

  return (
    <>
      {/* 0. Edit Display Name Modal */}
      {activeModal === 'displayName' && (
        <AccountModalShell
          titleId="account-submodal-title-display-name"
          onClose={onClose}
          onSubmit={handleSaveDisplayName}
        >
            <div className="flex items-center justify-between">
              <h4 id="account-submodal-title-display-name" className={MODAL_DIALOG_TITLE_CLASS}>
                Alterar nome de exibição
              </h4>
              <ModalButton
                type="tertiary"
                shape="circle"
                size="small"
                svgOnly
                aria-label="Fechar"
                onClick={onClose}
              >
                <X className="w-4 h-4" />
              </ModalButton>
            </div>

            <div>
              <label className={MODAL_FIELD_LABEL_CLASS}>Nome de exibição</label>
              <input
                type="text"
                value={newDisplayName}
                onChange={(e) => setNewDisplayName(e.target.value)}
                maxLength={64}
                className="w-full bg-background-darker border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-brand-500"
                placeholder={user.username}
                autoFocus
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <ModalButton type="secondary" onClick={onClose}>
                Cancelar
              </ModalButton>
              <ModalButton type="primary" htmlType="submit" loading={isSavingDisplayName}>
                {isSavingDisplayName ? 'Salvando...' : 'Salvar nome'}
              </ModalButton>
            </div>
        </AccountModalShell>
      )}

      {/* 1. Edit Username Modal */}
      {activeModal === 'username' && (
        <AccountModalShell
          titleId="account-submodal-title-username"
          onClose={onClose}
          onSubmit={handleSaveUsername}
        >
            <div className="flex items-center justify-between">
              <h4 id="account-submodal-title-username" className={MODAL_DIALOG_TITLE_CLASS}>
                Alterar nome de usuário
              </h4>
              <ModalButton
                type="tertiary"
                shape="circle"
                size="small"
                svgOnly
                aria-label="Fechar"
                onClick={onClose}
              >
                <X className="w-4 h-4" />
              </ModalButton>
            </div>

            <p className="text-xs text-gray-400">
              Apenas letras minúsculas, números e sublinhado (_), sem espaços, acentos, maiúsculas ou símbolos.
            </p>

            <div>
              <label className={MODAL_FIELD_LABEL_CLASS}>Novo @</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-bold">
                  @
                </span>
                <input
                  type="text"
                  value={newUsername}
                  onChange={(e) => {
                    setNewUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''));
                    setUsernameError(null);
                  }}
                  maxLength={32}
                  className="w-full bg-background-darker border border-white/10 rounded-xl pl-8 pr-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-brand-500 font-mono lowercase"
                  placeholder="novo_usuario"
                  autoFocus
                />
              </div>
              {user.two_factor_enabled && (
                <AppInput
                  label="Código 2FA (6 dígitos ou backup)"
                  value={twoFactorActionCode}
                  onChange={(e) => {
                    setTwoFactorActionCode(e.target.value);
                    setUsernameError(null);
                  }}
                  maxLength={16}
                  placeholder="000000"
                  className="font-mono tracking-wider mt-1"
                  containerClassName="mt-3"
                />
              )}
              {usernameError && (
                <span className="text-[11px] text-dnd block mt-1">{usernameError}</span>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <ModalButton type="secondary" onClick={onClose}>
                Cancelar
              </ModalButton>
              <ModalButton type="primary" htmlType="submit" loading={isSavingUsername}>
                {isSavingUsername ? 'Salvando...' : 'Salvar @'}
              </ModalButton>
            </div>
        </AccountModalShell>
      )}

      {/* 2. Edit Email Modal */}
      {activeModal === 'email' && (
        <AccountModalShell
          titleId="account-submodal-title-email"
          onClose={onClose}
          onSubmit={handleSaveEmail}
        >
            <div className="flex items-center justify-between">
              <h4 id="account-submodal-title-email" className={MODAL_DIALOG_TITLE_CLASS}>
                Alterar E-mail
              </h4>
              <ModalButton
                type="tertiary"
                shape="circle"
                size="small"
                svgOnly
                aria-label="Fechar"
                onClick={onClose}
              >
                <X className="w-4 h-4" />
              </ModalButton>
            </div>

            <div className="space-y-3">
              <div>
                <label className={MODAL_FIELD_LABEL_CLASS}>Novo e-mail</label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="w-full bg-background-darker border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-brand-500 font-mono"
                  placeholder="seu_novo_email@dominio.com"
                  autoFocus
                />
              </div>

              <div>
                <label className={MODAL_FIELD_LABEL_CLASS}>Senha atual (confirmação)</label>
                <input
                  type="password"
                  value={emailCurrentPassword}
                  onChange={(e) => setEmailCurrentPassword(e.target.value)}
                  className="w-full bg-background-darker border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-brand-500"
                />
              </div>

              {user.two_factor_enabled && (
                <AppInput
                  label="Código 2FA (6 dígitos ou backup)"
                  value={twoFactorActionCode}
                  onChange={(e) => {
                    setTwoFactorActionCode(e.target.value);
                    setEmailError(null);
                  }}
                  maxLength={16}
                  placeholder="000000"
                  className="font-mono tracking-wider"
                />
              )}

              {emailError && <span className="text-[11px] text-dnd block">{emailError}</span>}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <ModalButton type="secondary" onClick={onClose}>
                Cancelar
              </ModalButton>
              <ModalButton type="primary" htmlType="submit" loading={isSavingEmail}>
                {isSavingEmail ? 'Salvando...' : 'Salvar E-mail'}
              </ModalButton>
            </div>
        </AccountModalShell>
      )}

      {/* 3. Edit Phone Modal */}
      {activeModal === 'phone' && (
        <AccountModalShell
          titleId="account-submodal-title-phone"
          onClose={onClose}
          onSubmit={handleSavePhone}
        >
            <div className="flex items-center justify-between">
              <h4 id="account-submodal-title-phone" className={MODAL_DIALOG_TITLE_CLASS}>
                {user.phone_number ? 'Editar Número de Telefone' : 'Adicionar Número de Telefone'}
              </h4>
              <ModalButton
                type="tertiary"
                shape="circle"
                size="small"
                svgOnly
                aria-label="Fechar"
                onClick={onClose}
              >
                <X className="w-4 h-4" />
              </ModalButton>
            </div>

            <p className="text-xs text-gray-400">
              Vincule seu número para recuperação de conta e notificações.
            </p>

            <div>
              <label className={MODAL_FIELD_LABEL_CLASS}>Número de Celular</label>
              <input
                type="tel"
                value={newPhone}
                onChange={(e) => {
                  setNewPhone(e.target.value);
                  setPhoneError(null);
                }}
                className="w-full bg-background-darker border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-brand-500 font-mono"
                placeholder="(11) 98765-4321"
                autoFocus
              />
              {phoneError && <span className="text-[11px] text-dnd block mt-1">{phoneError}</span>}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <ModalButton type="secondary" onClick={onClose}>
                Cancelar
              </ModalButton>
              <ModalButton type="primary" htmlType="submit" loading={isSavingPhone}>
                {isSavingPhone ? 'Salvando...' : 'Salvar Telefone'}
              </ModalButton>
            </div>
        </AccountModalShell>
      )}

      {/* 4. Change Password Modal */}
      {activeModal === 'password' && (
        <AccountModalShell
          titleId="account-submodal-title-password"
          onClose={onClose}
          onSubmit={handleSavePassword}
        >
            <div className="flex items-center justify-between">
              <h4 id="account-submodal-title-password" className={MODAL_DIALOG_TITLE_CLASS}>
                Mudar Senha
              </h4>
              <ModalButton
                type="tertiary"
                shape="circle"
                size="small"
                svgOnly
                aria-label="Fechar"
                onClick={onClose}
              >
                <X className="w-4 h-4" />
              </ModalButton>
            </div>

            <div className="space-y-3">
              <div>
                <label className={MODAL_FIELD_LABEL_CLASS}>Senha atual</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full bg-background-darker border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-brand-500"
                  autoFocus
                />
              </div>

              <div>
                <label className={MODAL_FIELD_LABEL_CLASS}>Nova senha</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full bg-background-darker border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-brand-500"
                  placeholder="Mínimo 6 caracteres"
                />
              </div>

              <div>
                <label className={MODAL_FIELD_LABEL_CLASS}>Confirmar nova senha</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full bg-background-darker border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-brand-500"
                />
              </div>

              {user.two_factor_enabled && (
                <AppInput
                  label="Código 2FA (6 dígitos ou backup)"
                  value={twoFactorActionCode}
                  onChange={(e) => {
                    setTwoFactorActionCode(e.target.value);
                    setPasswordError(null);
                  }}
                  maxLength={16}
                  placeholder="000000"
                  className="font-mono tracking-wider"
                />
              )}

              {passwordError && <span className="text-[11px] text-dnd block">{passwordError}</span>}
              {passwordSuccess && (
                <span className="text-[11px] text-emerald-400 block font-semibold">
                  Senha alterada com sucesso.
                </span>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <ModalButton type="secondary" onClick={onClose}>
                Cancelar
              </ModalButton>
              <ModalButton
                type="primary"
                htmlType="submit"
                loading={isSavingPassword}
                disabled={passwordSuccess}
              >
                {isSavingPassword ? 'Salvando...' : 'Salvar Nova Senha'}
              </ModalButton>
            </div>
        </AccountModalShell>
      )}

      {/* 5. 2FA Modal */}
      {activeModal === '2fa' && (
        <AccountModalShell
          titleId="account-submodal-title-2fa"
          onClose={onClose}
          onSubmit={handleToggle2FA}
          maxWidth="md"
        >
            <div className="flex items-center justify-between">
              <h4 id="account-submodal-title-2fa" className={MODAL_DIALOG_TITLE_CLASS}>
                {user.two_factor_enabled
                  ? 'Desativar Autenticação 2FA'
                  : 'Configurar Autenticação 2FA (TOTP)'}
              </h4>
              <ModalButton
                type="tertiary"
                shape="circle"
                size="small"
                svgOnly
                aria-label="Fechar"
                onClick={onClose}
              >
                <X className="w-4 h-4" />
              </ModalButton>
            </div>

            {!user.two_factor_enabled && qrCodeData && (
              <div className="flex flex-col items-center p-3 bg-white rounded-2xl">
                <img
                  src={qrCodeData}
                  alt="2FA QR Code"
                  className="w-36 h-36 sm:w-44 sm:h-44 object-contain"
                />
                {secretKey && (
                  <span className="text-[10px] text-gray-800 font-mono select-all mt-1">
                    Chave manual: {secretKey}
                  </span>
                )}
              </div>
            )}

            {!user.two_factor_enabled && (
              <AppInput
                label="Senha atual"
                type="password"
                value={twoFactorPassword}
                onChange={(e) => setTwoFactorPassword(e.target.value)}
                placeholder="Digite sua senha atual"
                autoComplete="current-password"
                disabled={is2FALoading}
              />
            )}

            <div>
              <label className={MODAL_FIELD_LABEL_CLASS}>Código de 6 dígitos</label>
              <div className="flex justify-center pt-1.5">
                <OtpInput
                  length={6}
                  value={totpCode}
                  onChange={setTotpCode}
                  autoFocus
                  size="sm"
                  status={twoFactorError ? 'error' : 'idle'}
                  disabled={is2FALoading}
                  slotClassName="bg-background-darker border border-white/10"
                />
              </div>
              {twoFactorError && (
                <span className="text-[11px] text-dnd block mt-1.5 text-center">{twoFactorError}</span>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <ModalButton type="secondary" onClick={onClose}>
                Cancelar
              </ModalButton>
              <ModalButton
                type={user.two_factor_enabled ? 'error' : 'primary'}
                htmlType="submit"
                loading={is2FALoading}
                disabled={totpCode.length < 6 || (!user.two_factor_enabled && !twoFactorPassword.trim())}
              >
                {is2FALoading
                  ? 'Validando...'
                  : user.two_factor_enabled
                    ? 'Desativar 2FA'
                    : 'Ativar 2FA'}
              </ModalButton>
            </div>
        </AccountModalShell>
      )}

      {/* 6. 2FA Backup Codes Presentation Modal */}
      {activeModal === 'backupCodes' && (
        <AccountModalShell
          titleId="account-submodal-title-backup-codes"
          onClose={onClose}
          maxWidth="md"
        >
            <div className="flex items-center justify-between">
              <h4 id="account-submodal-title-backup-codes" className={MODAL_DIALOG_TITLE_CLASS}>
                Códigos de Backup de 2FA
              </h4>
              <ModalButton
                type="tertiary"
                shape="circle"
                size="small"
                svgOnly
                aria-label="Fechar"
                onClick={onClose}
              >
                <X className="w-4 h-4" />
              </ModalButton>
            </div>

            <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-2xl flex items-start gap-2.5">
              <AlertTriangle className="w-5 h-5 text-yellow-400 shrink-0 mt-0.5" />
              <p className="text-xs text-yellow-200/90 leading-relaxed">
                Salve estes códigos em um local seguro. Cada código só pode ser usado{' '}
                <strong>uma única vez</strong> para acessar sua conta caso você perca seu
                aplicativo autenticador.
              </p>
            </div>

            {/* Grid of backup codes */}
            <div className="grid grid-cols-2 gap-2 p-3 sm:p-4 bg-background-darker rounded-2xl border border-white/5 font-mono text-center text-xs sm:text-sm font-bold text-emerald-400 tracking-wider">
              {backupCodes.map((code, idx) => (
                <div
                  key={idx}
                  className="p-2 bg-background-darkest/60 rounded-xl border border-white/5 select-all"
                >
                  {code}
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between pt-2">
              <div className="flex gap-2">
                <ModalButton
                  type="secondary"
                  size="small"
                  prefix={<Copy className="w-3.5 h-3.5" />}
                  onClick={() => {
                    copyToClipboard(backupCodes.join('\n'));
                    setCopiedBackupCodes(true);
                    setTimeout(() => setCopiedBackupCodes(false), 2000);
                  }}
                >
                  {copiedBackupCodes ? 'Copiado' : 'Copiar'}
                </ModalButton>

                <ModalButton
                  type="secondary"
                  size="small"
                  prefix={<Download className="w-3.5 h-3.5" />}
                  onClick={() => {
                    const blob = new Blob([backupCodes.join('\n')], { type: 'text/plain' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `zerovc-2fa-backup-codes-${user?.username || 'user'}.txt`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                  }}
                >
                  Baixar .txt
                </ModalButton>
              </div>

              <ModalButton type="primary" size="small" onClick={onClose}>
                Concluído
              </ModalButton>
            </div>
        </AccountModalShell>
      )}

      {/* 7. Delete Account Confirmation Modal */}
      {activeModal === 'deleteAccount' && (
        <AccountModalShell
          titleId="account-submodal-title-delete-account"
          onClose={onClose}
          onSubmit={handleDeleteAccount}
          maxWidth="md"
          className="border-dnd/30"
        >
            <div className="flex items-center justify-between">
              <h4
                id="account-submodal-title-delete-account"
                className={`${MODAL_DIALOG_TITLE_CLASS} text-dnd`}
              >
                Excluir Conta Permanentemente
              </h4>
              <ModalButton
                type="tertiary"
                shape="circle"
                size="small"
                svgOnly
                aria-label="Fechar"
                onClick={onClose}
              >
                <X className="w-4 h-4" />
              </ModalButton>
            </div>

            <p className="text-xs text-gray-300 leading-relaxed">
              Você está prestes a excluir sua conta no ZeroVC. Esta ação{' '}
              <strong>não pode ser desfeita</strong>.
            </p>

            <div>
              <label className={MODAL_FIELD_LABEL_CLASS}>Sua senha atual</label>
              <input
                type="password"
                value={deleteAccountPassword}
                onChange={(e) => setDeleteAccountPassword(e.target.value)}
                className="w-full bg-background-darker border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-dnd"
                autoFocus
              />
              {user.two_factor_enabled && (
                <AppInput
                  label="Código 2FA (6 dígitos ou backup)"
                  value={twoFactorActionCode}
                  onChange={(e) => {
                    setTwoFactorActionCode(e.target.value);
                    setDeleteAccountError(null);
                  }}
                  maxLength={16}
                  placeholder="000000"
                  className="font-mono tracking-wider"
                  containerClassName="mt-3"
                />
              )}
              {deleteAccountError && (
                <span className="text-[11px] text-dnd block mt-1">{deleteAccountError}</span>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <ModalButton type="secondary" onClick={onClose}>
                Cancelar
              </ModalButton>
              <ModalButton
                type="error"
                htmlType="submit"
                loading={isDeletingAccount}
                disabled={!deleteAccountPassword.trim()}
              >
                {isDeletingAccount ? 'Excluindo...' : 'Confirmar Exclusão'}
              </ModalButton>
            </div>
        </AccountModalShell>
      )}
    </>
  );
};
