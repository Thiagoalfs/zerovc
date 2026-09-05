import React, { useState, useEffect } from 'react';
import { MessageSquare, Server, Settings, Check, Shield, ArrowLeft, KeyRound } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { api, getApiBaseUrl, setApiBaseUrl, formatAssetUrl } from '../../lib/api';

export const AuthScreen: React.FC = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [requires2FA, setRequires2FA] = useState(false);
  const [showServerConfig, setShowServerConfig] = useState(false);
  const [serverUrl, setServerUrl] = useState(getApiBaseUrl());
  const [serverSaved, setServerSaved] = useState(false);
  const [invitePreview, setInvitePreview] = useState<{ guild_name: string; icon_url?: string; member_count: number } | null>(null);

  const { login, register, isLoading, error } = useAuthStore();

  useEffect(() => {
    // Check if path has /invite/:code, /invites/:code or stored in sessionStorage
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLogin) {
      const res = await login(email, password, twoFactorCode.trim() || undefined);
      if (res?.requires_2fa) {
        setRequires2FA(true);
      }
    } else {
      const cleanUsername = username.trim();
      if (!/^[a-zA-Z0-9]+$/.test(cleanUsername)) {
        alert('O nome de usuário (@) deve conter apenas letras e números, sem espaços ou símbolos.');
        return;
      }
      if (cleanUsername.length < 2 || cleanUsername.length > 32) {
        alert('O nome de usuário (@) deve ter entre 2 e 32 caracteres.');
        return;
      }
      await register(cleanUsername, email, password);
    }
  };

  const handleSaveServer = (e: React.FormEvent) => {
    e.preventDefault();
    setApiBaseUrl(serverUrl);
    setServerSaved(true);
    setTimeout(() => {
      setServerSaved(false);
      setShowServerConfig(false);
    }, 1200);
  };

  return (
    <div className="w-screen h-screen flex items-center justify-center bg-background-darkest select-none p-4 relative overflow-hidden">
      {/* Server Config Button at top right */}
      <button
        onClick={() => setShowServerConfig(!showServerConfig)}
        className="absolute top-4 right-4 z-20 flex items-center gap-2 bg-background-dark/80 hover:bg-background-dark text-gray-400 hover:text-gray-200 text-xs px-3 py-1.5 rounded-full border border-white/10 transition-colors shadow-md backdrop-blur-sm cursor-pointer"
        title="Configurar Servidor"
      >
        <Server className="w-3.5 h-3.5 text-online" />
        <span className="truncate max-w-[200px]">{getApiBaseUrl()}</span>
        <Settings className="w-3.5 h-3.5 ml-0.5" />
      </button>

      {/* Background ambient glow */}
      <div className="absolute w-[500px] h-[500px] bg-brand-500/10 rounded-full blur-3xl pointer-events-none -top-20 -left-20" />
      <div className="absolute w-[500px] h-[500px] bg-online/10 rounded-full blur-3xl pointer-events-none -bottom-20 -right-20" />

      {/* Main Card */}
      <div className="w-full max-w-md bg-background-dark rounded-3xl p-8 shadow-2xl border border-white/10 relative z-10 animate-in fade-in zoom-in-95 duration-200">
        {/* Logo and Brand */}
        <div className="text-center mb-6">
          <div className="w-14 h-14 bg-brand-500 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-lg shadow-brand-500/30">
            {requires2FA ? <Shield className="w-8 h-8 text-white" /> : <MessageSquare className="w-8 h-8 text-white" />}
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            {requires2FA ? 'Autenticação em 2 Etapas' : 'ZeroVC'}
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            {requires2FA
              ? 'Digite o código de 6 dígitos gerado pelo seu app autenticador'
              : invitePreview
              ? `Junte-se ao servidor ${invitePreview.guild_name}`
              : isLogin
              ? 'Boas-vindas de volta!'
              : 'Crie sua conta para começar'}
          </p>
        </div>

        {/* Invite Preview Banner if user followed an invite link */}
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

        {/* Server URL Config Drawer */}
        {showServerConfig && (
          <form onSubmit={handleSaveServer} className="mb-5 p-4 bg-background-darker rounded-2xl border border-white/10 animate-in fade-in slide-in-from-top-2">
            <label className="block text-xs font-bold text-gray-300 uppercase mb-1.5">
              URL do Servidor ZeroVC
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
                placeholder="http://162.35.97.76:8081"
                className="flex-1 bg-background-dark text-white px-3 py-1.5 rounded-lg border border-white/10 text-xs font-mono focus:outline-none focus:border-brand-500"
              />
              <button
                type="submit"
                className="bg-brand-500 hover:bg-brand-600 text-white text-xs font-medium px-3 py-1.5 rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
              >
                {serverSaved ? <Check className="w-3.5 h-3.5" /> : 'Salvar'}
              </button>
            </div>
          </form>
        )}

        {/* Error alert */}
        {error && (
          <div className="mb-4 p-3 bg-dnd/20 border border-dnd/30 rounded-xl text-dnd text-xs text-center font-medium">
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {requires2FA ? (
            <div>
              <label className="block text-xs font-bold text-gray-300 uppercase mb-1.5 flex items-center gap-1">
                <KeyRound className="w-3.5 h-3.5 text-brand-400" />
                <span>Código 2FA (6 dígitos)</span>
              </label>
              <input
                type="text"
                required
                maxLength={6}
                autoFocus
                value={twoFactorCode}
                onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, ''))}
                placeholder="123456"
                className="w-full bg-background-darker border border-white/10 rounded-xl px-4 py-3 text-center text-xl tracking-widest font-mono text-white placeholder-gray-600 focus:outline-none focus:border-brand-500"
              />
            </div>
          ) : (
            <>
              {!isLogin && (
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
                      onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9]/g, ''))}
                      placeholder="usuario"
                      className="w-full bg-background-darker border border-white/10 rounded-xl pl-8 pr-3.5 py-2.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-brand-500 font-mono"
                    />
                  </div>
                  <span className="text-[10px] text-gray-400 mt-1 block">
                    Apenas letras e números (sem espaços ou símbolos)
                  </span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-gray-300 uppercase mb-1.5">
                  E-mail
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="timotei@email.com"
                  className="w-full bg-background-darker border border-white/10 rounded-xl px-4 py-2.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-brand-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-300 uppercase mb-1.5">
                  Senha
                </label>
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
            disabled={isLoading || (requires2FA && twoFactorCode.length !== 6)}
            className="w-full bg-brand-500 hover:bg-brand-600 active:scale-[0.98] text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-brand-500/20 disabled:opacity-50 mt-2 cursor-pointer"
          >
            {isLoading
              ? 'Processando...'
              : requires2FA
              ? 'Verificar Código'
              : invitePreview
              ? isLogin
                ? 'Entrar e Participar do Servidor'
                : 'Criar Conta e Participar'
              : isLogin
              ? 'Entrar'
              : 'Cadastrar'}
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
            {isLogin ? (
              <span>
                Precisando de uma conta?{' '}
                <button
                  onClick={() => setIsLogin(false)}
                  className="text-brand-500 font-semibold hover:underline cursor-pointer"
                >
                  Registre-se
                </button>
              </span>
            ) : (
              <span>
                Já tem uma conta?{' '}
                <button
                  onClick={() => setIsLogin(true)}
                  className="text-brand-500 font-semibold hover:underline cursor-pointer"
                >
                  Entrar
                </button>
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
