import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Shield,
  ArrowLeft,
  KeyRound,
  MailCheck,
  CheckCircle2,
  RefreshCw,
  Lock,
  AlertTriangle,
  Eye,
  EyeOff,
  Loader2,
} from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { api, formatAssetUrl } from '../../lib/api';
import { TurnstileWidget, TurnstileWidgetRef } from '../Common/TurnstileWidget';
import { OtpInput } from '../ui/otp-input';
import { isTauri } from '../../lib/platform';

const AUTH_DRAFT_KEY = 'zerovc_tauri_auth_draft';

type AuthMode = 'login' | 'register' | 'verify_email' | 'forgot_password' | 'reset_password';

interface AuthScreenProps {
  initialMode?: AuthMode;
  onNavigate?: (path: string) => void;
}

const inputClass =
  'flex h-10 w-full rounded-md border border-white/10 bg-background-darker/90 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 focus-visible:border-brand-500 disabled:cursor-not-allowed disabled:opacity-50 transition-colors';

const primaryBtnClass =
  'inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-white shadow-md shadow-brand-500/20 transition-all hover:bg-brand-600 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 disabled:pointer-events-none disabled:opacity-50 cursor-pointer';

const labelClass = 'block text-sm font-medium leading-none text-gray-200';

const AuthErrorBanner: React.FC<{ message?: string | null }> = ({ message }) => {
  if (!message) return null;
  return (
    <div className="mb-6 rounded-lg border border-dnd/30 bg-dnd/10 p-3.5 text-sm text-dnd flex items-start gap-2.5">
      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
      <span>{message}</span>
    </div>
  );
};

export const AuthScreen: React.FC<AuthScreenProps> = ({ initialMode = 'login', onNavigate }) => {
  const [draft] = useState<{ mode?: AuthMode; email?: string; username?: string } | null>(() => {
    if (!isTauri()) return null;
    try {
      const raw = localStorage.getItem(AUTH_DRAFT_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [mode, setMode] = useState<AuthMode>(draft?.mode || initialMode);
  const [username, setUsername] = useState(draft?.username || '');
  const [email, setEmail] = useState(draft?.email || '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (!isTauri()) return;
    try {
      localStorage.setItem(AUTH_DRAFT_KEY, JSON.stringify({ mode, email, username }));
    } catch {}
  }, [mode, email, username]);

  // Turnstile state (lê via API /api/auth/turnstile-config com fallback para VITE_TURNSTILE_SITE_KEY)
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileWidgetRef>(null);
  const [turnstileConfig, setTurnstileConfig] = useState<{ enabled: boolean; site_key?: string } | null>(null);

  useEffect(() => {
    api.auth.getTurnstileConfig?.()
      .then((cfg) => {
        if (cfg) setTurnstileConfig(cfg);
      })
      .catch(() => {});
  }, []);

  const activeSiteKey =
    turnstileConfig?.site_key ||
    ((import.meta as any).env?.VITE_TURNSTILE_SITE_KEY as string | undefined);

  const hasTurnstileSiteKey = Boolean(
    activeSiteKey && (turnstileConfig !== null ? turnstileConfig.enabled : true)
  );

  const handleTurnstileSuccess = useCallback((token: string) => {
    setTurnstileToken(token);
  }, []);

  const handleTurnstileExpire = useCallback(() => {
    setTurnstileToken(null);
  }, []);

  const handleTurnstileError = useCallback(() => {
    setTurnstileToken(null);
  }, []);

  // 2FA in Login and Reset
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [requires2FA, setRequires2FA] = useState(false);

  // Email Verification State
  const [verificationCode, setVerificationCode] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendStatus, setResendStatus] = useState('');

  // Forgot / Reset Password State
  const [forgotSubmitted, setForgotSubmitted] = useState(false);
  const [resetToken, setResetToken] = useState('');
  const [resetTokenValid, setResetTokenValid] = useState<boolean | null>(null);
  const [resetUsername, setResetUsername] = useState('');
  const [resetRequires2FA, setResetRequires2FA] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);

  // Local UI status & feedback
  const [localError, setLocalError] = useState('');
  const [localLoading, setLocalLoading] = useState(false);
  const [invitePreview, setInvitePreview] = useState<{ guild_name: string; icon_url?: string; member_count: number } | null>(null);

  const { login, register, verifyEmail, isLoading, error, clearError } = useAuthStore();

  useEffect(() => {
    const fullSearch = window.location.href;
    let tokenParam = '';
    const matchToken = fullSearch.match(/[?&]token=([^&#]+)/);
    if (matchToken && matchToken[1]) {
      tokenParam = decodeURIComponent(matchToken[1]);
    }

    if (fullSearch.includes('reset-password') || tokenParam) {
      setMode('reset_password');
      if (tokenParam) {
        setResetToken(tokenParam);
        validateResetToken(tokenParam);
      }
    } else if (fullSearch.includes('forgot-password')) {
      setMode('forgot_password');
    } else if (fullSearch.includes('verify-email')) {
      setMode('verify_email');
    } else {
      setMode(initialMode);
    }
  }, [initialMode]);

  useEffect(() => {
    setTurnstileToken(null);
    turnstileRef.current?.reset();
    setShowPassword(false);
  }, [mode, requires2FA]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  useEffect(() => {
    const path =
      window.location.protocol === 'file:' && window.location.hash
        ? window.location.hash.replace(/^#/, '')
        : window.location.pathname;
    let code = '';
    if (path.startsWith('/invite/')) {
      code = path.split('/invite/')[1]?.split('/')[0] || '';
    } else if (path.startsWith('/invites/')) {
      code = path.split('/invites/')[1]?.split('/')[0] || '';
    }
    if (!code) {
      code = sessionStorage.getItem('pending_invite_code') || '';
    }
    if (code) {
      sessionStorage.setItem('pending_invite_code', code);
      api.invites
        .get(code)
        .then((res) => {
          if (res?.invite?.guild) {
            setInvitePreview({
              guild_name: res.invite.guild.name,
              icon_url: res.invite.guild.icon_url,
              member_count: res.member_count,
            });
          }
        })
        .catch(() => {});
    }
  }, []);

  const validateResetToken = async (tok: string) => {
    setLocalLoading(true);
    setLocalError('');
    try {
      const res = await api.auth.verifyResetToken({ token: tok });
      if (res.valid) {
        setResetTokenValid(true);
        setResetUsername(res.username);
        setResetRequires2FA(res.requires_2fa);
      } else {
        setResetTokenValid(false);
      }
    } catch (err: any) {
      setResetTokenValid(false);
      setLocalError(err.message || 'Link de redefinição de senha inválido ou expirado.');
    } finally {
      setLocalLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (resendCooldown > 0 || !email) return;
    setResendStatus('');
    setLocalError('');
    try {
      await api.auth.resendVerification({ email: email.trim().toLowerCase() });
      setResendStatus('Código reenviado! Verifique sua caixa de entrada.');
      setResendCooldown(60);
    } catch (err: any) {
      setLocalError(err.message || 'Falha ao reenviar código de verificação.');
    }
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError('');
    setLocalLoading(true);
    try {
      await api.auth.forgotPassword({ email: email.trim().toLowerCase() });
      setForgotSubmitted(true);
    } catch (err: any) {
      setLocalError(err.message || 'Falha ao solicitar redefinição.');
    } finally {
      setLocalLoading(false);
    }
  };

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError('');
    if (password.length < 6) {
      setLocalError('A senha deve ter no mínimo 6 caracteres.');
      return;
    }
    if (password !== confirmPassword) {
      setLocalError('As senhas não coincidem.');
      return;
    }
    if (resetRequires2FA && !twoFactorCode.trim()) {
      setLocalError('Informe o código do seu aplicativo autenticador (2FA).');
      return;
    }

    setLocalLoading(true);
    try {
      await api.auth.resetPassword({
        token: resetToken,
        new_password: password,
        code: twoFactorCode.trim() || undefined,
      });
      try {
        useAuthStore.getState().logout();
      } catch {}
      setResetSuccess(true);
    } catch (err: any) {
      setLocalError(err.message || 'Falha ao redefinir senha.');
    } finally {
      setLocalLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError('');
    clearError();

    if (mode === 'verify_email') {
      if (verificationCode.trim().length !== 6) {
        setLocalError('Digite o código de 6 dígitos enviado para o seu e-mail.');
        return;
      }
      try {
        await verifyEmail(email.trim().toLowerCase(), verificationCode.trim());
      } catch (err: any) {
        setLocalError(err.message || 'Código inválido ou expirado.');
      }
      return;
    }

    if (mode === 'login') {
      try {
        const codeToSend = twoFactorCode.trim() || undefined;
        const res = await login(email.trim().toLowerCase(), password, codeToSend, turnstileToken || undefined);
        if (res?.requires_2fa) {
          setRequires2FA(true);
        } else if (res?.requires_verification) {
          if (res.email) setEmail(res.email);
          setMode('verify_email');
        } else {
          try { localStorage.removeItem(AUTH_DRAFT_KEY); } catch {}
        }
      } catch {
        turnstileRef.current?.reset();
        setTurnstileToken(null);
      }
      return;
    }

    if (mode === 'register') {
      const cleanUsername = username.trim().toLowerCase();
      if (!/^[a-z0-9_]+$/.test(cleanUsername)) {
        setLocalError('O nome de usuário (@) deve conter apenas letras minúsculas, números e sublinhado (_).');
        return;
      }
      if (cleanUsername.length < 2 || cleanUsername.length > 32) {
        setLocalError('O nome de usuário (@) deve ter entre 2 e 32 caracteres.');
        return;
      }
      if (password.length < 6) {
        setLocalError('A senha deve ter no mínimo 6 caracteres.');
        return;
      }

      try {
        const res = await register(cleanUsername, email.trim().toLowerCase(), password, turnstileToken || undefined);
        if (res?.requires_verification) {
          if (res.email) setEmail(res.email);
          setMode('verify_email');
        } else {
          try { localStorage.removeItem(AUTH_DRAFT_KEY); } catch {}
        }
      } catch {
        turnstileRef.current?.reset();
        setTurnstileToken(null);
      }
    }
  };

  const activeError = localError || error;
  const viewKey = requires2FA
    ? 'two-factor'
    : mode === 'forgot_password' && forgotSubmitted
    ? 'forgot-success'
    : mode;

  return (
    <div className="w-screen h-full min-h-[100dvh] flex items-center justify-center bg-background-darkest select-none p-4 relative overflow-y-auto">
      <div className="mx-auto w-full max-w-md">
        <div className="relative overflow-hidden rounded-xl border border-white/10 bg-background-dark/85 shadow-2xl backdrop-blur-md">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-brand-500/10 via-transparent to-brand-700/5" />
          <div className="relative z-10">
            <AnimatePresence mode="wait">
              {viewKey === 'reset_password' && (
                <motion.div
                  key="reset_password"
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -18 }}
                  transition={{ duration: 0.25, ease: 'easeInOut' }}
                  className="p-8"
                >
                  <div className="mb-8 text-center">
                    <div className="mb-4 mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-500/15 border border-brand-500/25">
                      <Lock className="h-7 w-7 text-brand-400" />
                    </div>
                    <h1 className="text-3xl font-semibold text-white tracking-tight">Redefinir senha</h1>
                    <p className="mt-2 text-sm text-gray-400">
                      {resetUsername ? `Escolha uma nova senha para @${resetUsername}` : 'Crie uma nova senha para sua conta'}
                    </p>
                  </div>

                  {resetSuccess ? (
                    <div className="text-center space-y-5">
                      <div className="p-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-sm flex items-center gap-3 text-left">
                        <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                        <span>Sua senha foi redefinida com sucesso!</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setMode('login');
                          onNavigate?.('/signin');
                        }}
                        className={primaryBtnClass}
                      >
                        Ir para o login
                      </button>
                    </div>
                  ) : resetTokenValid === false ? (
                    <div className="text-center space-y-5">
                      <AuthErrorBanner
                        message={localError || 'Este link de redefinição de senha é inválido ou já expirou.'}
                      />
                      <button
                        type="button"
                        onClick={() => setMode('forgot_password')}
                        className={primaryBtnClass}
                      >
                        Solicitar novo link
                      </button>
                    </div>
                  ) : (
                    <form onSubmit={handleResetSubmit} className="space-y-5">
                      <AuthErrorBanner message={activeError} />

                      <div className="space-y-2">
                        <label className={labelClass}>Nova senha</label>
                        <div className="relative">
                          <input
                            type={showPassword ? 'text' : 'password'}
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Mínimo 6 caracteres"
                            disabled={localLoading}
                            className={`${inputClass} pr-10`}
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword((p) => !p)}
                            disabled={localLoading}
                            className="absolute right-0 top-0 h-full px-3 text-gray-400 hover:text-gray-200 cursor-pointer"
                          >
                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className={labelClass}>Confirmar nova senha</label>
                        <input
                          type={showPassword ? 'text' : 'password'}
                          required
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="Digite a mesma senha"
                          disabled={localLoading}
                          className={inputClass}
                        />
                      </div>

                      {resetRequires2FA && (
                        <div className="p-4 rounded-lg border border-brand-500/30 bg-background-darker/70 space-y-3">
                          <div className="flex items-center gap-2 text-xs font-medium text-brand-300">
                            <Shield className="w-4 h-4 text-brand-400" />
                            <span>Autenticação em 2 Etapas (2FA)</span>
                          </div>
                          {useBackupCode ? (
                            <input
                              type="text"
                              required
                              value={twoFactorCode}
                              onChange={(e) => setTwoFactorCode(e.target.value.trim())}
                              placeholder="xxxx-xxxx"
                              className={`${inputClass} text-center font-mono tracking-widest`}
                            />
                          ) : (
                            <div className="flex justify-center">
                              <OtpInput
                                length={6}
                                value={twoFactorCode}
                                onChange={setTwoFactorCode}
                                size="sm"
                                status={localError ? 'error' : 'idle'}
                                slotClassName="bg-background-darkest border border-white/10"
                              />
                            </div>
                          )}
                        </div>
                      )}

                      <button type="submit" disabled={localLoading} className={primaryBtnClass}>
                        {localLoading ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Redefinindo...
                          </>
                        ) : (
                          'Salvar nova senha'
                        )}
                      </button>
                    </form>
                  )}
                </motion.div>
              )}

              {viewKey === 'forgot_password' && (
                <motion.div
                  key="forgot_password"
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -18 }}
                  transition={{ duration: 0.25, ease: 'easeInOut' }}
                  className="p-8"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setLocalError('');
                      setMode('login');
                      onNavigate?.('/signin');
                    }}
                    disabled={localLoading}
                    className="absolute left-4 top-4 h-9 w-9 inline-flex items-center justify-center rounded-md text-gray-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    <span className="sr-only">Voltar</span>
                  </button>

                  <div className="mb-8 text-center">
                    <h1 className="text-3xl font-semibold text-white tracking-tight">Redefinir senha</h1>
                    <p className="mt-2 text-sm text-gray-400">
                      Informe seu e-mail para receber o link de redefinição
                    </p>
                  </div>

                  <AuthErrorBanner message={activeError} />

                  <form onSubmit={handleForgotSubmit} className="space-y-6">
                    <div className="space-y-2">
                      <label htmlFor="forgot-email" className={labelClass}>
                        E-mail
                      </label>
                      <input
                        id="forgot-email"
                        type="email"
                        required
                        autoFocus
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="nome@exemplo.com"
                        disabled={localLoading}
                        className={inputClass}
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={localLoading || !email.trim()}
                      className={primaryBtnClass}
                    >
                      {localLoading ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Enviando...
                        </>
                      ) : (
                        'Enviar link de redefinição'
                      )}
                    </button>
                  </form>

                  <p className="mt-8 text-center text-sm text-gray-400">
                    Lembrou sua senha?{' '}
                    <button
                      type="button"
                      onClick={() => {
                        setLocalError('');
                        setMode('login');
                        onNavigate?.('/signin');
                      }}
                      disabled={localLoading}
                      className="text-brand-400 hover:underline font-medium cursor-pointer"
                    >
                      Entrar
                    </button>
                  </p>
                </motion.div>
              )}

              {viewKey === 'forgot-success' && (
                <motion.div
                  key="forgot-success"
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -18 }}
                  transition={{ duration: 0.25, ease: 'easeInOut' }}
                  className="flex flex-col items-center p-8 text-center"
                >
                  <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-brand-500/15 border border-brand-500/25">
                    <MailCheck className="h-8 w-8 text-brand-400" />
                  </div>

                  <h1 className="text-2xl font-semibold text-white">Verifique seu e-mail</h1>
                  <p className="mt-2 text-sm text-gray-400">
                    Enviamos um link de redefinição de senha para{' '}
                    <span className="text-gray-200 font-medium">{email}</span>.
                  </p>

                  <button
                    type="button"
                    onClick={() => {
                      setForgotSubmitted(false);
                      setMode('login');
                      onNavigate?.('/signin');
                    }}
                    className="mt-6 inline-flex h-10 w-full max-w-xs items-center justify-center rounded-md border border-white/10 bg-background-darker px-4 text-sm font-medium text-gray-100 hover:bg-white/5 transition-colors cursor-pointer"
                  >
                    Voltar para o login
                  </button>
                </motion.div>
              )}

              {viewKey === 'verify_email' && (
                <motion.div
                  key="verify_email"
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -18 }}
                  transition={{ duration: 0.25, ease: 'easeInOut' }}
                  className="p-8"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setLocalError('');
                      clearError();
                      setMode('login');
                      onNavigate?.('/signin');
                    }}
                    disabled={isLoading}
                    className="absolute left-4 top-4 h-9 w-9 inline-flex items-center justify-center rounded-md text-gray-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    <span className="sr-only">Voltar</span>
                  </button>

                  <div className="mb-7 text-center">
                    <div className="mb-4 mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-500/15 border border-brand-500/25">
                      <MailCheck className="h-7 w-7 text-brand-400" />
                    </div>
                    <h1 className="text-2xl font-semibold text-white tracking-tight">Verifique seu e-mail</h1>
                    <p className="mt-2 text-sm text-gray-400">
                      Enviamos um código de 6 dígitos para{' '}
                      <span className="text-gray-200 font-medium">{email || 'seu e-mail'}</span>
                    </p>
                  </div>

                  <AuthErrorBanner message={activeError} />

                  {resendStatus && (
                    <div className="mb-5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300 text-center">
                      {resendStatus}
                    </div>
                  )}

                  <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="flex justify-center">
                      <OtpInput
                        length={6}
                        value={verificationCode}
                        onChange={setVerificationCode}
                        autoFocus
                        size="md"
                        status={error ? 'error' : 'idle'}
                        slotClassName="bg-background-darker border border-white/10"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={isLoading || verificationCode.length !== 6}
                      className={primaryBtnClass}
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Verificando...
                        </>
                      ) : (
                        'Confirmar e entrar'
                      )}
                    </button>
                  </form>

                  <div className="mt-6 text-center">
                    <button
                      type="button"
                      onClick={handleResendCode}
                      disabled={resendCooldown > 0}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-400 hover:underline disabled:text-gray-500 disabled:no-underline disabled:cursor-not-allowed cursor-pointer"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${resendCooldown > 0 ? 'animate-spin opacity-50' : ''}`} />
                      <span>
                        {resendCooldown > 0
                          ? `Reenviar código em ${resendCooldown}s`
                          : 'Não recebeu? Reenviar código'}
                      </span>
                    </button>
                  </div>
                </motion.div>
              )}

              {viewKey === 'two-factor' && (
                <motion.div
                  key="two-factor"
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -18 }}
                  transition={{ duration: 0.25, ease: 'easeInOut' }}
                  className="p-8"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setRequires2FA(false);
                      setTwoFactorCode('');
                      setUseBackupCode(false);
                      setLocalError('');
                      clearError();
                    }}
                    disabled={isLoading}
                    className="absolute left-4 top-4 h-9 w-9 inline-flex items-center justify-center rounded-md text-gray-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    <span className="sr-only">Voltar</span>
                  </button>

                  <div className="mb-7 text-center">
                    <div className="mb-4 mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-500/15 border border-brand-500/25">
                      <Shield className="h-7 w-7 text-brand-400" />
                    </div>
                    <h1 className="text-2xl font-semibold text-white tracking-tight">
                      Autenticação em 2 etapas
                    </h1>
                    <p className="mt-2 text-sm text-gray-400">
                      {useBackupCode
                        ? 'Digite um dos seus códigos de backup de uso único'
                        : 'Digite o código de 6 dígitos do seu aplicativo autenticador'}
                    </p>
                  </div>

                  <AuthErrorBanner message={activeError} />

                  <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="space-y-3">
                      {useBackupCode ? (
                        <div className="space-y-2">
                          <label htmlFor="backup-code" className={`${labelClass} text-center`}>
                            Código de backup
                          </label>
                          <input
                            id="backup-code"
                            type="text"
                            required
                            autoFocus
                            maxLength={12}
                            value={twoFactorCode}
                            onChange={(e) => setTwoFactorCode(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                            placeholder="xxxx-xxxx"
                            disabled={isLoading}
                            className={`${inputClass} h-11 text-center text-base font-mono tracking-widest`}
                          />
                        </div>
                      ) : (
                        <div className="flex justify-center">
                          <OtpInput
                            length={6}
                            value={twoFactorCode}
                            onChange={setTwoFactorCode}
                            autoFocus
                            size="md"
                            status={error ? 'error' : 'idle'}
                            slotClassName="bg-background-darker border border-white/10"
                          />
                        </div>
                      )}

                      <div className="text-center">
                        <button
                          type="button"
                          onClick={() => {
                            setUseBackupCode(!useBackupCode);
                            setTwoFactorCode('');
                          }}
                          disabled={isLoading}
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-400 hover:underline cursor-pointer"
                        >
                          <KeyRound className="h-3.5 w-3.5" />
                          <span>
                            {useBackupCode ? 'Usar código do autenticador' : 'Usar código de backup'}
                          </span>
                        </button>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={
                        isLoading ||
                        (useBackupCode ? twoFactorCode.length < 8 : twoFactorCode.length !== 6)
                      }
                      className={primaryBtnClass}
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Verificando...
                        </>
                      ) : (
                        'Verificar código'
                      )}
                    </button>
                  </form>
                </motion.div>
              )}

              {(viewKey === 'login' || viewKey === 'register') && (
                <motion.div
                  key={viewKey}
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -18 }}
                  transition={{ duration: 0.25, ease: 'easeInOut' }}
                  className="p-8"
                >
                  <div className="mb-8 text-center">
                    <h1 className="text-3xl font-semibold text-white tracking-tight">
                      {mode === 'login' ? 'Boas-vindas de volta' : 'Criar conta'}
                    </h1>
                    <p className="mt-2 text-sm text-gray-400">
                      {invitePreview
                        ? `Junte-se ao servidor ${invitePreview.guild_name}`
                        : mode === 'login'
                        ? 'Entre na sua conta do ZeroVC'
                        : 'Comece agora com sua conta ZeroVC'}
                    </p>
                  </div>

                  {invitePreview && (
                    <div className="mb-6 p-3.5 bg-brand-500/10 border border-brand-500/25 rounded-lg flex items-center gap-3">
                      {invitePreview.icon_url ? (
                        <img
                          src={formatAssetUrl(invitePreview.icon_url)}
                          alt=""
                          className="w-10 h-10 rounded-full object-cover shadow"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-brand-500 flex items-center justify-center font-semibold text-white shadow">
                          {invitePreview.guild_name[0]?.toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <span className="text-[11px] text-brand-300 font-semibold block uppercase tracking-wider">
                          Convite para servidor
                        </span>
                        <h3 className="font-semibold text-white text-sm truncate">
                          {invitePreview.guild_name}
                        </h3>
                        <span className="text-xs text-gray-400">{invitePreview.member_count} membros</span>
                      </div>
                    </div>
                  )}

                  <AuthErrorBanner message={activeError} />

                  <form onSubmit={handleSubmit} className="space-y-5">
                    {mode === 'register' && (
                      <div className="space-y-2">
                        <label htmlFor="auth-username" className={labelClass}>
                          Nome de usuário
                        </label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-400 font-medium text-sm select-none">
                            @
                          </span>
                          <input
                            id="auth-username"
                            type="text"
                            required
                            maxLength={32}
                            value={username}
                            onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                            placeholder="usuario"
                            disabled={isLoading}
                            className={`${inputClass} pl-7 font-mono lowercase`}
                          />
                        </div>
                      </div>
                    )}

                    <div className="space-y-2">
                      <label htmlFor="auth-email" className={labelClass}>
                        {mode === 'login' ? 'E-mail ou usuário' : 'E-mail'}
                      </label>
                      <input
                        id="auth-email"
                        type={mode === 'login' ? 'text' : 'email'}
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder={mode === 'login' ? 'nome@exemplo.com ou @usuario' : 'nome@exemplo.com'}
                        disabled={isLoading}
                        className={inputClass}
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label htmlFor="auth-password" className={labelClass}>
                          Senha
                        </label>
                        {mode === 'login' && (
                          <button
                            type="button"
                            onClick={() => {
                              setLocalError('');
                              clearError();
                              setMode('forgot_password');
                              onNavigate?.('/forgot-password');
                            }}
                            disabled={isLoading}
                            className="text-xs text-brand-400 hover:underline cursor-pointer"
                          >
                            Esqueceu a senha?
                          </button>
                        )}
                      </div>
                      <div className="relative">
                        <input
                          id="auth-password"
                          type={showPassword ? 'text' : 'password'}
                          required
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="••••••••"
                          disabled={isLoading}
                          className={`${inputClass} pr-10`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((p) => !p)}
                          disabled={isLoading}
                          className="absolute right-0 top-0 h-full px-3 text-gray-400 hover:text-gray-200 transition-colors cursor-pointer"
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>

                    {hasTurnstileSiteKey && (
                      <TurnstileWidget
                        ref={turnstileRef}
                        siteKey={activeSiteKey}
                        action={mode}
                        onSuccess={handleTurnstileSuccess}
                        onExpire={handleTurnstileExpire}
                        onError={handleTurnstileError}
                      />
                    )}

                    <button
                      type="submit"
                      disabled={isLoading || (hasTurnstileSiteKey && !turnstileToken)}
                      className={primaryBtnClass}
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          {mode === 'login' ? 'Entrando...' : 'Criando conta...'}
                        </>
                      ) : invitePreview ? (
                        mode === 'login' ? (
                          'Entrar e participar'
                        ) : (
                          'Criar conta e participar'
                        )
                      ) : mode === 'login' ? (
                        'Entrar'
                      ) : (
                        'Criar conta'
                      )}
                    </button>
                  </form>

                  <p className="mt-8 text-center text-sm text-gray-400">
                    {mode === 'login' ? 'Não tem uma conta? ' : 'Já tem uma conta? '}
                    <button
                      type="button"
                      onClick={() => {
                        setLocalError('');
                        clearError();
                        const next = mode === 'login' ? 'register' : 'login';
                        setMode(next);
                        onNavigate?.(next === 'register' ? '/signup' : '/signin');
                      }}
                      disabled={isLoading}
                      className="text-brand-400 hover:underline font-medium cursor-pointer"
                    >
                      {mode === 'login' ? 'Criar uma' : 'Entrar'}
                    </button>
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
};
