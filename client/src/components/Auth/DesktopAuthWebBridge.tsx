import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { ExternalLink, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { api } from '../../lib/api';
import { User } from '../../types';

interface DesktopAuthWebBridgeProps {
  user: User;
  onContinueWeb: () => void;
}

export const DesktopAuthWebBridge: React.FC<DesktopAuthWebBridgeProps> = ({
  user,
  onContinueWeb,
}) => {
  const [deepLinkUrl, setDeepLinkUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const issueAndOpen = async () => {
    setError(null);
    try {
      const { code } = await api.auth.createDesktopCode();
      const url = `zerovc://auth?code=${encodeURIComponent(code)}`;
      setDeepLinkUrl(url);
      window.location.href = url;
    } catch (err: any) {
      setError(err?.message || 'Não foi possível gerar o código de acesso.');
    }
  };

  useEffect(() => {
    void issueAndOpen();
  }, []);

  return (
    <div className="w-screen h-[100dvh] flex items-center justify-center bg-background-darkest p-4">
      <div className="mx-auto w-full max-w-md">
        <div className="relative overflow-hidden rounded-xl border border-white/10 bg-background-dark/85 shadow-2xl backdrop-blur-md">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-brand-500/10 via-transparent to-brand-700/5" />
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="relative z-10 p-8 text-center"
          >
            <h1 className="text-3xl font-semibold text-white tracking-tight">ZeroVC</h1>
            <p className="text-sm text-gray-400 mt-2">
              Conectado como <span className="text-white font-semibold">@{user.username}</span>
            </p>

            {error ? (
              <div className="mt-6 p-3.5 rounded-lg border border-dnd/30 bg-dnd/10 text-dnd text-sm flex items-center gap-2 justify-center">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            ) : deepLinkUrl ? (
              <div className="mt-6 p-3.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-xs flex items-center gap-2 justify-center">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Confirme no aviso do navegador para abrir o ZeroVC.</span>
              </div>
            ) : (
              <div className="mt-6 flex items-center justify-center gap-2 text-sm text-gray-300">
                <Loader2 className="w-4 h-4 animate-spin text-brand-400" />
                <span>Preparando acesso para o aplicativo...</span>
              </div>
            )}

            <div className="mt-6 space-y-2.5">
              {deepLinkUrl ? (
                <a
                  href={deepLinkUrl}
                  className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-brand-500 px-4 text-sm font-medium text-white shadow-md shadow-brand-500/20 transition-all hover:bg-brand-600 active:scale-[0.99]"
                >
                  <ExternalLink className="w-4 h-4" />
                  Abrir ZeroVC
                </a>
              ) : (
                <button
                  type="button"
                  onClick={issueAndOpen}
                  className="inline-flex h-10 w-full items-center justify-center rounded-md bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600 transition-all cursor-pointer"
                >
                  Tentar novamente
                </button>
              )}

              <button
                type="button"
                onClick={onContinueWeb}
                className="inline-flex h-10 w-full items-center justify-center rounded-md border border-white/10 bg-background-darker/90 px-4 text-sm font-medium text-gray-300 hover:bg-white/5 hover:text-white transition-colors cursor-pointer"
              >
                Continuar no navegador
              </button>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
};
