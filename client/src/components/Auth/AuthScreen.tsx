import React, { useState } from 'react';
import { MessageSquare, Server, Settings, Check } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { getApiBaseUrl, setApiBaseUrl } from '../../lib/api';

export const AuthScreen: React.FC = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showServerConfig, setShowServerConfig] = useState(false);
  const [serverUrl, setServerUrl] = useState(getApiBaseUrl());
  const [serverSaved, setServerSaved] = useState(false);

  const { login, register, isLoading, error } = useAuthStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLogin) {
      await login(email, password);
    } else {
      await register(username, email, password);
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
        className="absolute top-4 right-4 z-20 flex items-center gap-2 bg-background-dark/80 hover:bg-background-dark text-gray-400 hover:text-gray-200 text-xs px-3 py-1.5 rounded-full border border-white/10 transition-colors shadow-md backdrop-blur-sm"
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
            <MessageSquare className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">ZeroVC</h1>
          <p className="text-sm text-gray-400 mt-1">
            {isLogin ? 'Boas-vindas de volta!' : 'Crie sua conta para começar'}
          </p>
        </div>

        {/* Server Config Dropdown */}
        {showServerConfig && (
          <form onSubmit={handleSaveServer} className="mb-4 p-4 bg-background-darkest rounded-2xl border border-brand-500/30 shadow-inner">
            <label className="block text-xs font-bold text-gray-300 uppercase mb-1">
              Endereço da API do Servidor
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
                className="bg-brand-500 hover:bg-brand-600 text-white text-xs font-medium px-3 py-1.5 rounded-lg flex items-center gap-1 transition-colors"
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
          {!isLogin && (
            <div>
              <label className="block text-xs font-bold text-gray-300 uppercase mb-1.5">
                Nome de Usuário
              </label>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Ex: thiago"
                className="w-full bg-background-darkest text-white px-3.5 py-2.5 rounded-xl border border-white/5 focus:outline-none focus:border-brand-500 text-sm transition-colors"
              />
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
              placeholder="seu@email.com"
              className="w-full bg-background-darkest text-white px-3.5 py-2.5 rounded-xl border border-white/5 focus:outline-none focus:border-brand-500 text-sm transition-colors"
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
              className="w-full bg-background-darkest text-white px-3.5 py-2.5 rounded-xl border border-white/5 focus:outline-none focus:border-brand-500 text-sm transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-semibold py-3 rounded-xl text-sm transition-all shadow-lg shadow-brand-500/25 mt-2"
          >
            {isLoading ? 'Aguarde...' : isLogin ? 'Entrar' : 'Registrar'}
          </button>
        </form>

        {/* Toggle Login/Register */}
        <div className="mt-6 text-center text-xs text-gray-400">
          {isLogin ? 'Novo por aqui? ' : 'Já possui uma conta? '}
          <button
            type="button"
            onClick={() => setIsLogin(!isLogin)}
            className="text-brand-500 hover:underline font-semibold"
          >
            {isLogin ? 'Criar uma conta' : 'Fazer login'}
          </button>
        </div>
      </div>
    </div>
  );
};
