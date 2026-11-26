import React, { useEffect, useState, useCallback } from 'react';
import { motion } from 'motion/react';
import { ExternalLink, Loader2, UserPlus, AlertTriangle } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { getDesktopAPI } from '../../lib/platform';

const REMOTE_ORIGIN = (
  ((import.meta as any).env?.VITE_API_URL as string | undefined) || 'https://zerovc.safiroko.xyz'
).replace(/\/+$/, '');

export const DesktopAuthScreen: React.FC = () => {
  const { loginWithDesktopCode, isLoading, error, clearError } = useAuthStore();
  const [waitingBrowser, setWaitingBrowser] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleExchangeCode = useCallback(
    async (code: string) => {
      if (!code) return;
      setLocalError(null);
      clearError();
      setWaitingBrowser(false);
      try {
        await loginWithDesktopCode(code);
      } catch (err: any) {
        setLocalError(err?.message || 'Não foi possível concluir o login.');
      }
    },
    [loginWithDesktopCode, clearError]
  );

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;

    (async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        const unsub = await listen<string>('desktop-auth-code', (ev) => {
          if (!cancelled && ev.payload) {
            void handleExchangeCode(ev.payload);
          }
        });
        if (cancelled) {
          unsub();
        } else {
          unlisten = unsub;
        }
      } catch {}

      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const pendingCode = await invoke<string | null>('consume_desktop_auth_code');
        if (!cancelled && pendingCode) {
          void handleExchangeCode(pendingCode);
        }
      } catch {}
    })();

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [handleExchangeCode]);

  const openBrowserLogin = (mode: 'login' | 'register') => {
    setLocalError(null);
    clearError();
    setWaitingBrowser(true);
    const url =
      mode === 'register'
        ? `${REMOTE_ORIGIN}/desktop-auth?mode=register`
        : `${REMOTE_ORIGIN}/desktop-auth`;
    getDesktopAPI()?.openExternal?.(url);
  };

  const activeError = localError || error;

  return (
    <div className="w-full h-full flex items-center justify-center bg-background-darkest p-4 select-none">
      <div className="mx-auto w-full max-w-md">
        <div className="relative overflow-hidden rounded-xl border border-white/10 bg-background-dark/85 shadow-2xl backdrop-blur-md">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-brand-500/10 via-transparent to-brand-700/5" />
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="relative z-10 p-8"
          >
            <div className="flex flex-col items-center text-center mb-8">
              <h1 className="text-3xl font-semibold text-white tracking-tight">ZeroVC</h1>
              <p className="text-sm text-gray-400 mt-2">
                Entre com sua conta pelo navegador para continuar
              </p>
            </div>

            {activeError && (
              <div className="mb-6 rounded-lg border border-dnd/30 bg-dnd/10 p-3.5 text-sm text-dnd flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{activeError}</span>
              </div>
            )}

            <div className="space-y-3">
              <button
                type="button"
                onClick={() => openBrowserLogin('login')}
                disabled={isLoading}
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-white shadow-md shadow-brand-500/20 transition-all hover:bg-brand-600 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 disabled:pointer-events-none disabled:opacity-60 cursor-pointer"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Conectando...
                  </>
                ) : waitingBrowser ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Aguardando login no navegador...
                  </>
                ) : (
                  <>
                    <ExternalLink className="w-4 h-4" />
                    Entrar pelo navegador
                  </>
                )}
              </button>

              {waitingBrowser && !isLoading ? (
                <button
                  type="button"
                  onClick={() => openBrowserLogin('login')}
                  className="inline-flex h-10 w-full items-center justify-center rounded-md border border-white/10 bg-background-darker/90 px-4 text-sm font-medium text-gray-200 hover:bg-white/5 hover:text-white transition-colors cursor-pointer"
                >
                  Reabrir página no navegador
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => openBrowserLogin('register')}
                  disabled={isLoading}
                  className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-white/10 bg-background-darker/90 px-4 text-sm font-medium text-gray-200 hover:border-brand-500/40 hover:bg-white/5 hover:text-white transition-all cursor-pointer"
                >
                  <UserPlus className="w-4 h-4 text-brand-400" />
                  Criar uma conta
                </button>
              )}
            </div>

            <p className="text-xs text-gray-500 text-center mt-6 leading-relaxed">
              Após entrar no site, confirme a abertura do aplicativo{' '}
              <span className="text-gray-300 font-medium">ZeroVC</span> no navegador.
            </p>
          </motion.div>
        </div>
      </div>
    </div>
  );
};
