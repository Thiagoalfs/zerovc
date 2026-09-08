import React, { useState, useEffect } from 'react';
import { MessageSquare, Shield, ArrowLeft, KeyRound, Mail, CheckCircle, RefreshCw, Lock, AlertTriangle } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { api, formatAssetUrl } from '../../lib/api';

type AuthMode = 'login' | 'register' | 'verify_email' | 'forgot_password' | 'reset_password';

interface AuthScreenProps {
  initialMode?: 'login' | 'register' | 'verify_email' | 'forgot_password' | 'reset_password';
  onNavigate?: (path: string) => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ initialMode = 'login', onNavigate }) => {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

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

  // Detect reset token or mode from URL/Hash on mount
  useEffect(() => {
    const hash = window.location.hash || '';
    const search = window.location.search || '';
    const fullSearch = window.location.href;

    // Check if there is a token in URL (e.g. ?token=XYZ or #/reset-password?token=XYZ)
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

  // Cooldown timer for email resend
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  // Check pending invites
  useEffect(() => {
    const path = (window.location.protocol === 'file:' && window.location.hash)
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

    // Mode: Verify Email
    if (mode === 'verify_email') {
      if (verificationCode.trim().length !== 6) {
        setLocalError('O código deve ter exatamente 6 dígitos.');
        return;
      }
      try {
        await verifyEmail(email.trim().toLowerCase(), verificationCode.trim());
      } catch (err: any) {
        setLocalError(err.message || 'Código inválido ou expirado.');
      }
      return;
    }

    // Mode: Login
    if (mode === 'login') {
      try {
        const codeToSend = twoFactorCode.trim() || undefined;
        const res = await login(email.trim().toLowerCase(), password, codeToSend);
        if (res?.requires_2fa) {
          setRequires2FA(true);
        } else if (res?.requires_verification) {
          if (res.email) setEmail(res.email);
          setMode('verify_email');
        }
      } catch {
        // Handled in authStore
      }
      return;
    }

    // Mode: Register
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
        const res = await register(cleanUsername, email.trim().toLowerCase(), password);
        if (res?.requires_verification) {
          if (res.email) setEmail(res.email);
          setMode('verify_email');
        }
      } catch {
        // Handled in authStore
      }
    }
  };

  const activeError = localError || error;

  return (
    <div className="w-screen h-screen flex items-center justify-center bg-background-darkest select-none p-4 relative overflow-hidden">
      {/* Home Navigation Button at top left (if in browser) */}
      {onNavigate && (
        <button
          onClick={() => onNavigate('/')}
          className="absolute top-4 left-4 z-20 flex items-center gap-1.5 bg-background-dark/80 hover:bg-background-dark text-gray-400 hover:text-gray-200 text-xs px-3.5 py-2 rounded-full border border-white/10 transition-colors shadow-md backdrop-blur-sm cursor-pointer"
          title="Voltar para a Página Inicial"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Início</span>
        </button>
      )}

      {/* Background ambient glow */}
      <div className="absolute w-[500px] h-[500px] bg-brand-500/10 rounded-full blur-3xl pointer-events-none -top-20 -left-20" />
      <div className="absolute w-[500px] h-[500px] bg-online/10 rounded-full blur-3xl pointer-events-none -bottom-20 -right-20" />

      {/* Main Card */}
      <div className="w-full max-w-md bg-background-dark rounded-3xl p-8 shadow-2xl border border-white/10 relative z-10 animate-in fade-in zoom-in-95 duration-200">
        
        {/* ========================================================================= */}
        {/* 1. RESET PASSWORD MODE */}
        {/* ========================================================================= */}
        {mode === 'reset_password' ? (
          <div>
            <div className="text-center mb-6">
              <div className="w-14 h-14 bg-brand-500 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-lg shadow-brand-500/30">
                <Lock className="w-8 h-8 text-white" />
              </div>
              <h1 className="text-2xl font-bold text-white tracking-tight">Redefinir Senha</h1>
              <p className="text-sm text-gray-400 mt-1">
                {resetUsername ? `Escolha uma nova senha para @${resetUsername}` : 'Crie uma nova senha para sua conta'}
              </p>
            </div>

            {resetSuccess ? (
              <div className="text-center space-y-4">
                <div className="p-4 bg-emerald-500/15 border border-emerald-500/30 rounded-2xl text-emerald-400 text-sm flex items-center gap-3">
                  <CheckCircle className="w-6 h-6 flex-shrink-0" />
                  <div className="text-left font-medium">
                    Sua senha foi redefinida com sucesso! Você já pode entrar com sua nova senha.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    onNavigate?.('/signin');
                  }}
                  className="w-full bg-brand-500 hover:bg-brand-600 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-brand-500/20 cursor-pointer"
                >
                  Ir para o Login
                </button>
              </div>
            ) : resetTokenValid === false ? (
              <div className="text-center space-y-4">
                <div className="p-4 bg-dnd/20 border border-dnd/30 rounded-2xl text-dnd text-sm flex items-center gap-3">
                  <AlertTriangle className="w-6 h-6 flex-shrink-0" />
                  <div className="text-left font-medium">
                    {localError || 'Este link de redefinição de senha é inválido ou já expirou (limite de 15 minutos).'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setMode('forgot_password')}
                  className="w-full bg-brand-500 hover:bg-brand-600 text-white font-bold py-3 rounded-xl transition-all cursor-pointer"
                >
                  Solicitar Novo Link
                </button>
              </div>
            ) : (
              <form onSubmit={handleResetSubmit} className="space-y-4">
                {activeError && (
                  <div className="p-3 bg-dnd/20 border border-dnd/30 rounded-xl text-dnd text-xs text-center font-medium">
                    {activeError}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-gray-300 uppercase mb-1.5">
                    Nova Senha
                  </label>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    className="w-full bg-background-darker border border-white/10 rounded-xl px-4 py-2.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-brand-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-300 uppercase mb-1.5">
                    Confirmar Nova Senha
                  </label>
                  <input
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Digite a mesma senha"
                    className="w-full bg-background-darker border border-white/10 rounded-xl px-4 py-2.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-brand-500"
                  />
                </div>

                {/* 2FA Protection Input if Account has 2FA */}
                {resetRequires2FA && (
                  <div className="p-4 bg-background-darker rounded-2xl border border-brand-500/30 space-y-2.5 animate-in fade-in">
                    <div className="flex items-center gap-2 text-xs font-bold text-brand-300 uppercase">
                      <Shield className="w-4 h-4 text-brand-400" />
                      <span>Autenticação em 2 Etapas (Obrigatório)</span>
                    </div>
                    <p className="text-[11px] text-gray-400 leading-relaxed">
                      Esta conta está protegida por 2FA. Digite o código de 6 dígitos do seu app autenticador ou código de backup:
                    </p>
                    <input
                      type="text"
                      required
                      value={twoFactorCode}
                      onChange={(e) => setTwoFactorCode(e.target.value.trim())}
                      placeholder={useBackupCode ? 'xxxx-xxxx' : '000000'}
                      className="w-full bg-background-darkest border border-white/10 rounded-xl px-4 py-2.5 text-center text-lg tracking-widest font-mono text-white placeholder-gray-600 focus:outline-none focus:border-brand-500"
                    />
                  </div>
                )}

                <button
                  type="submit"
                  disabled={localLoading}
                  className="w-full bg-brand-500 hover:bg-brand-600 active:scale-[0.98] text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-brand-500/20 disabled:opacity-50 mt-2 cursor-pointer"
                >
                  {localLoading ? 'Redefinindo...' : 'Salvar Nova Senha'}
                </button>
              </form>
            )}
          </div>
        ) : mode === 'forgot_password' ? (
          /* ========================================================================= */
          /* 2. FORGOT PASSWORD MODE */
          /* ========================================================================= */
          <div>
            <div className="text-center mb-6">
              <div className="w-14 h-14 bg-brand-500 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-lg shadow-brand-500/30">
                <Mail className="w-8 h-8 text-white" />
              </div>
              <h1 className="text-2xl font-bold text-white tracking-tight">Esqueceu sua senha?</h1>
              <p className="text-sm text-gray-400 mt-1">
                Informe o seu e-mail para receber as instruções de recuperação de senha.
              </p>
            </div>

            {forgotSubmitted ? (
              <div className="space-y-4 animate-in fade-in">
                <div className="p-4 bg-emerald-500/15 border border-emerald-500/30 rounded-2xl text-emerald-300 text-xs leading-relaxed flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-white block mb-0.5">E-mail de recuperação enviado!</span>
                    Se houver uma conta associada a <strong className="text-white">{email}</strong>, enviamos um link para redefinir a senha (válido por 15 minutos).
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setForgotSubmitted(false);
                    setMode('login');
                    onNavigate?.('/signin');
                  }}
                  className="w-full bg-brand-500 hover:bg-brand-600 text-white font-bold py-3 rounded-xl transition-all cursor-pointer shadow-lg shadow-brand-500/20"
                >
                  Voltar para o Login
                </button>
              </div>
            ) : (
              <form onSubmit={handleForgotSubmit} className="space-y-4">
                {activeError && (
                  <div className="p-3 bg-dnd/20 border border-dnd/30 rounded-xl text-dnd text-xs text-center font-medium">
                    {activeError}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-gray-300 uppercase mb-1.5">
                    Seu E-mail
                  </label>
                  <input
                    type="email"
                    required
                    autoFocus
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seuemail@exemplo.com"
                    className="w-full bg-background-darker border border-white/10 rounded-xl px-4 py-2.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-brand-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={localLoading || !email.trim()}
                  className="w-full bg-brand-500 hover:bg-brand-600 active:scale-[0.98] text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-brand-500/20 disabled:opacity-50 mt-2 cursor-pointer"
                >
                  {localLoading ? 'Enviando...' : 'Enviar Link de Redefinição'}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setLocalError('');
                    setMode('login');
                    onNavigate?.('/signin');
                  }}
                  className="w-full flex items-center justify-center gap-1.5 text-xs text-gray-400 hover:text-white pt-2 transition-colors cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Voltar ao login</span>
                </button>
              </form>
            )}
          </div>
        ) : mode === 'verify_email' ? (
          /* ========================================================================= */
          /* 3. EMAIL VERIFICATION MODE */
          /* ========================================================================= */
          <div>
            <div className="text-center mb-6">
              <div className="w-14 h-14 bg-brand-500 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-lg shadow-brand-500/30">
                <Mail className="w-8 h-8 text-white" />
              </div>
              <h1 className="text-2xl font-bold text-white tracking-tight">Verifique seu E-mail</h1>
              <p className="text-xs text-gray-400 mt-1.5 leading-relaxed">
                Enviamos um código de 6 dígitos para:<br />
                <strong className="text-white font-semibold">{email || 'seu e-mail'}</strong>
              </p>
            </div>

            {activeError && (
              <div className="mb-4 p-3 bg-dnd/20 border border-dnd/30 rounded-xl text-dnd text-xs text-center font-medium">
                {activeError}
              </div>
            )}

            {resendStatus && (
              <div className="mb-4 p-3 bg-emerald-500/20 border border-emerald-500/30 rounded-xl text-emerald-300 text-xs text-center font-medium">
                {resendStatus}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-300 uppercase mb-1.5 text-center">
                  Código de Verificação
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  maxLength={6}
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  className="w-full bg-background-darker border border-white/10 rounded-2xl px-4 py-3.5 text-center text-3xl tracking-[10px] font-mono text-white placeholder-gray-600 focus:outline-none focus:border-brand-500"
                />
              </div>

              <button
                type="submit"
                disabled={isLoading || verificationCode.length !== 6}
                className="w-full bg-brand-500 hover:bg-brand-600 active:scale-[0.98] text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-brand-500/20 disabled:opacity-50 mt-2 cursor-pointer"
              >
                {isLoading ? 'Verificando...' : 'Confirmar e Entrar'}
              </button>

              {/* Resend button */}
              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={handleResendCode}
                  disabled={resendCooldown > 0}
                  className="text-xs text-brand-400 hover:text-brand-300 disabled:text-gray-500 disabled:cursor-not-allowed font-medium inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${resendCooldown > 0 ? 'animate-spin opacity-50' : ''}`} />
                  <span>
                    {resendCooldown > 0
                      ? `Reenviar código em ${resendCooldown}s`
                      : 'Não recebeu? Reenviar código'}
                  </span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  setLocalError('');
                  clearError();
                  setMode('login');
                  onNavigate?.('/signin');
                }}
                className="w-full flex items-center justify-center gap-1.5 text-xs text-gray-400 hover:text-white pt-2 transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Entrar com outra conta</span>
              </button>
            </form>
          </div>
        ) : (
          /* ========================================================================= */
          /* 4. LOGIN & REGISTER MODES */
          /* ========================================================================= */
          <div>
            {/* Logo and Brand */}
            <div className="text-center mb-6">
              <div className="w-14 h-14 bg-brand-500 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-lg shadow-brand-500/30">
                {requires2FA ? <KeyRound className="w-8 h-8 text-white" /> : <MessageSquare className="w-8 h-8 text-white" />}
              </div>
              <h1 className="text-2xl font-bold text-white tracking-tight">
                {requires2FA ? 'Autenticação em 2 Etapas' : 'ZeroVC'}
              </h1>
              <p className="text-sm text-gray-400 mt-1">
                {requires2FA
                  ? useBackupCode
                    ? 'Digite um dos seus códigos de backup de uso único'
                    : 'Digite o código de 6 dígitos gerado pelo seu app autenticador'
                  : invitePreview
                  ? `Junte-se ao servidor ${invitePreview.guild_name}`
                  : mode === 'login'
                  ? 'Boas-vindas de volta!'
                  : 'Crie sua conta para começar'}
              </p>
            </div>

            {/* Invite Preview Banner */}
            {!requires2FA && invitePreview && (
              <div className="mb-5 p-3.5 bg-brand-500/15 border border-brand-500/30 rounded-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-1">
                {invitePreview.icon_url ? (
                  <img src={formatAssetUrl(invitePreview.icon_url)} alt="" className="w-10 h-10 rounded-full object-cover shadow" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-brand-500 flex items-center justify-center font-bold text-white shadow">
                    {invitePreview.guild_name[0]?.toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <span className="text-xs text-brand-300 font-semibold block uppercase tracking-wider">Convite Para Servidor</span>
                  <h3 className="font-bold text-white text-sm truncate">{invitePreview.guild_name}</h3>
                  <span className="text-[11px] text-gray-400">{invitePreview.member_count} membros</span>
                </div>
              </div>
            )}

            {/* Error alert */}
            {activeError && (
              <div className="mb-4 p-3 bg-dnd/20 border border-dnd/30 rounded-xl text-dnd text-xs text-center font-medium">
                {activeError}
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {requires2FA ? (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-300 uppercase mb-1.5 flex items-center gap-1">
                      <KeyRound className="w-3.5 h-3.5 text-brand-400" />
                      <span>{useBackupCode ? 'Código de Backup (8 caracteres)' : 'Código 2FA (6 dígitos)'}</span>
                    </label>
                    <input
                      type="text"
                      required
                      autoFocus
                      maxLength={useBackupCode ? 12 : 6}
                      value={twoFactorCode}
                      onChange={(e) => {
                        if (useBackupCode) {
                          setTwoFactorCode(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''));
                        } else {
                          setTwoFactorCode(e.target.value.replace(/\D/g, '').slice(0, 6));
                        }
                      }}
                      placeholder={useBackupCode ? 'xxxx-xxxx' : '000000'}
                      className="w-full bg-background-darker border border-white/10 rounded-xl px-4 py-3 text-center text-xl tracking-widest font-mono text-white placeholder-gray-600 focus:outline-none focus:border-brand-500"
                    />
                  </div>

                  <div className="flex justify-center">
                    <button
                      type="button"
                      onClick={() => {
                        setUseBackupCode(!useBackupCode);
                        setTwoFactorCode('');
                      }}
                      className="text-xs text-brand-400 hover:text-brand-300 underline font-medium cursor-pointer"
                    >
                      {useBackupCode ? 'Usar código do app autenticador' : 'Perdeu o autenticador? Usar código de backup'}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {mode === 'register' && (
                    <div>
                      <label className="block text-xs font-bold text-gray-300 uppercase mb-1.5">
                        Nome de Usuário (@)
                      </label>
                      <div className="relative">
                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-brand-400 font-bold text-sm select-none">
                          @
                        </span>
                        <input
                          type="text"
                          required
                          maxLength={32}
                          value={username}
                          onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                          placeholder="usuario"
                          className="w-full bg-background-darker border border-white/10 rounded-xl pl-8 pr-3.5 py-2.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-brand-500 font-mono lowercase"
                        />
                      </div>
                      <span className="text-[10px] text-gray-400 mt-1 block">
                        Apenas letras minúsculas, números e _ (sem espaços, maiúsculas ou símbolos)
                      </span>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-bold text-gray-300 uppercase mb-1.5">
                      E-mail {mode === 'login' ? 'ou Nome de Usuário' : ''}
                    </label>
                    <input
                      type={mode === 'login' ? 'text' : 'email'}
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder={mode === 'login' ? 'seuemail@exemplo.com ou @usuario' : 'seuemail@exemplo.com'}
                      className="w-full bg-background-darker border border-white/10 rounded-xl px-4 py-2.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-brand-500"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-bold text-gray-300 uppercase">
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
                          className="text-[11px] text-brand-400 hover:text-brand-300 hover:underline cursor-pointer"
                        >
                          Esqueceu sua senha?
                        </button>
                      )}
                    </div>
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-background-darker border border-white/10 rounded-xl px-4 py-2.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-brand-500"
                    />
                  </div>
                </>
              )}

              <button
                type="submit"
                disabled={isLoading || (requires2FA && (useBackupCode ? twoFactorCode.length < 8 : twoFactorCode.length !== 6))}
                className="w-full bg-brand-500 hover:bg-brand-600 active:scale-[0.98] text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-brand-500/20 disabled:opacity-50 mt-2 cursor-pointer"
              >
                {isLoading
                  ? 'Processando...'
                  : requires2FA
                  ? 'Verificar Código'
                  : invitePreview
                  ? mode === 'login'
                    ? 'Entrar e Participar do Servidor'
                    : 'Criar Conta e Participar'
                  : mode === 'login'
                  ? 'Entrar'
                  : 'Criar Conta'}
              </button>

              {requires2FA && (
                <button
                  type="button"
                  onClick={() => {
                    setRequires2FA(false);
                    setTwoFactorCode('');
                  }}
                  className="w-full flex items-center justify-center gap-1.5 text-xs text-gray-400 hover:text-white pt-1 transition-colors cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Voltar ao login</span>
                </button>
              )}
            </form>

            {/* Toggle between Login and Register */}
            {!requires2FA && (
              <div className="mt-6 text-center text-sm text-gray-400">
                {mode === 'login' ? (
                  <span>
                    Precisando de uma conta?{' '}
                    <button
                      onClick={() => {
                        setLocalError('');
                        clearError();
                        setMode('register');
                        onNavigate?.('/signup');
                      }}
                      className="text-brand-500 font-semibold hover:underline cursor-pointer"
                    >
                      Registre-se
                    </button>
                  </span>
                ) : (
                  <span>
                    Já tem uma conta?{' '}
                    <button
                      onClick={() => {
                        setLocalError('');
                        clearError();
                        setMode('login');
                        onNavigate?.('/signin');
                      }}
                      className="text-brand-500 font-semibold hover:underline cursor-pointer"
                    >
                      Entrar
                    </button>
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
