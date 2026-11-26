import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import { ShieldCheck, CheckCircle2, Loader2, ExternalLink } from 'lucide-react';
import { isTauri } from '../../lib/platform';

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: string | HTMLElement,
        options: {
          sitekey: string;
          theme?: 'auto' | 'light' | 'dark';
          action?: string;
          cData?: string;
          callback?: (token: string) => void;
          'error-callback'?: (code?: string) => void;
          'expired-callback'?: () => void;
          'timeout-callback'?: () => void;
        }
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
    };
  }
}

export interface TurnstileWidgetRef {
  reset: () => void;
}

interface TurnstileWidgetProps {
  siteKey?: string;
  onSuccess: (token: string) => void;
  onError?: () => void;
  onExpire?: () => void;
  action?: string;
  className?: string;
}

export const TurnstileWidget = forwardRef<TurnstileWidgetRef, TurnstileWidgetProps>(
  ({ siteKey: propSiteKey, onSuccess, onError, onExpire, action, className = '' }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const widgetIdRef = useRef<string | null>(null);
    const tauriMode = isTauri();
    const [tauriToken, setTauriToken] = useState<string | null>(null);
    const [tauriLaunching, setTauriLaunching] = useState(false);

    // Mantém referências estáveis para as callbacks para evitar recriar o widget a cada re-render do componente pai
    const onSuccessRef = useRef(onSuccess);
    onSuccessRef.current = onSuccess;

    const onErrorRef = useRef(onError);
    onErrorRef.current = onError;

    const onExpireRef = useRef(onExpire);
    onExpireRef.current = onExpire;

    // Obtém a site key via prop ou da variável de ambiente VITE_TURNSTILE_SITE_KEY
    const siteKey = propSiteKey || ((import.meta as any).env?.VITE_TURNSTILE_SITE_KEY as string | undefined);

    useImperativeHandle(ref, () => ({
      reset: () => {
        if (tauriMode) {
          setTauriToken(null);
          setTauriLaunching(false);
          return;
        }
        if (widgetIdRef.current && window.turnstile) {
          try {
            window.turnstile.reset(widgetIdRef.current);
          } catch {}
        }
      },
    }), [tauriMode]);

    // No Tauri desktop, escuta o token recebido pelo callback do navegador e consome eventual token pendente
    useEffect(() => {
      if (!siteKey || !tauriMode) return;
      let cancelled = false;
      let unlisten: (() => void) | undefined;

      (async () => {
        try {
          const { listen } = await import('@tauri-apps/api/event');
          const unsub = await listen<string>('turnstile-token-received', (ev) => {
            if (cancelled || !ev.payload) return;
            setTauriToken(ev.payload);
            setTauriLaunching(false);
            onSuccessRef.current(ev.payload);
          });
          if (cancelled) {
            unsub();
          } else {
            unlisten = unsub;
          }
        } catch {}

        try {
          const { invoke } = await import('@tauri-apps/api/core');
          const token = await invoke<string | null>('consume_turnstile_token');
          if (!cancelled && token) {
            setTauriToken(token);
            setTauriLaunching(false);
            onSuccessRef.current(token);
          }
        } catch {}
      })();
      return () => {
        cancelled = true;
        unlisten?.();
      };
    }, [siteKey, tauriMode]);

    // Fallback: enquanto aguarda o retorno do navegador, faz polling leve em consume_turnstile_token
    useEffect(() => {
      if (!siteKey || !tauriMode || !tauriLaunching) return;
      let cancelled = false;
      const timer = setInterval(async () => {
        try {
          const { invoke } = await import('@tauri-apps/api/core');
          const token = await invoke<string | null>('consume_turnstile_token');
          if (!cancelled && token) {
            setTauriToken(token);
            setTauriLaunching(false);
            onSuccessRef.current(token);
          }
        } catch {}
      }, 400);
      return () => {
        cancelled = true;
        clearInterval(timer);
      };
    }, [siteKey, tauriMode, tauriLaunching]);

    useEffect(() => {
      // Se não há site key configurada ou está no modo Tauri, não inicializa o script direto
      if (!siteKey || !containerRef.current || tauriMode) return;

      let isMounted = true;

      const initWidget = () => {
        if (!isMounted || !containerRef.current || !window.turnstile) return;
        if (widgetIdRef.current) return; // Já renderizado

        try {
          widgetIdRef.current = window.turnstile.render(containerRef.current, {
            sitekey: siteKey,
            theme: 'dark',
            action,
            callback: (token: string) => {
              if (isMounted) onSuccessRef.current(token);
            },
            'error-callback': () => {
              if (isMounted) onErrorRef.current?.();
            },
            'expired-callback': () => {
              if (isMounted) onExpireRef.current?.();
            },
          });
        } catch (err) {
          console.warn('[TurnstileWidget] Falha ao renderizar widget Turnstile:', err);
        }
      };

      if (window.turnstile) {
        initWidget();
      } else {
        // Carrega o script oficial do Cloudflare Turnstile sob demanda
        const scriptId = 'cloudflare-turnstile-script';
        let script = document.getElementById(scriptId) as HTMLScriptElement | null;

        if (!script) {
          script = document.createElement('script');
          script.id = scriptId;
          script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
          script.async = true;
          script.defer = true;
          document.head.appendChild(script);
        }

        const checkInterval = setInterval(() => {
          if (window.turnstile) {
            clearInterval(checkInterval);
            initWidget();
          }
        }, 100);

        return () => {
          isMounted = false;
          clearInterval(checkInterval);
          if (widgetIdRef.current && window.turnstile) {
            try {
              window.turnstile.remove(widgetIdRef.current);
              widgetIdRef.current = null;
            } catch {}
          }
        };
      }

      return () => {
        isMounted = false;
        if (widgetIdRef.current && window.turnstile) {
          try {
            window.turnstile.remove(widgetIdRef.current);
            widgetIdRef.current = null;
          } catch {}
        }
      };
    }, [siteKey, action, tauriMode]);

    if (!siteKey) {
      return null;
    }

    if (tauriMode) {
      const handleVerifyClick = async () => {
        if (tauriLaunching) return;
        setTauriLaunching(true);
        try {
          const { invoke } = await import('@tauri-apps/api/core');
          await invoke('start_turnstile_verification', { action: action || null });
        } catch {
          setTauriLaunching(false);
          onErrorRef.current?.();
        }
      };

      if (tauriToken) {
        return (
          <div className={className}>
            <label className="block text-xs font-medium text-gray-300 uppercase mb-1.5">
              Verificação de Segurança
            </label>
            <div className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm">
              <span className="flex items-center gap-2.5 font-medium">
                <span className="w-7 h-7 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                </span>
                <span>Verificação humana concluída</span>
              </span>
              <button
                type="button"
                onClick={() => {
                  setTauriToken(null);
                  onExpireRef.current?.();
                }}
                className="text-xs font-medium text-emerald-300/80 hover:text-emerald-200 hover:underline cursor-pointer"
              >
                Refazer
              </button>
            </div>
          </div>
        );
      }

      return (
        <div className={className}>
          <label className="block text-xs font-medium text-gray-300 uppercase mb-1.5">
            Verificação de Segurança
          </label>
          <button
            type="button"
            onClick={handleVerifyClick}
            disabled={tauriLaunching}
            className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl bg-background-darker border border-white/10 hover:border-brand-500/60 focus:outline-none focus:border-brand-500 active:scale-[0.99] text-gray-100 text-sm transition-all disabled:opacity-60 cursor-pointer group"
          >
            <span className="flex items-center gap-2.5 text-left">
              <span className="w-7 h-7 rounded-lg bg-brand-500/15 border border-brand-500/25 flex items-center justify-center shrink-0">
                {tauriLaunching ? (
                  <Loader2 className="w-4 h-4 text-brand-400 animate-spin" />
                ) : (
                  <ShieldCheck className="w-4 h-4 text-brand-400" />
                )}
              </span>
              <span className="flex flex-col">
                <span className="font-medium text-gray-100 leading-tight">
                  {tauriLaunching ? 'Aguardando navegador...' : 'Verificar que você é humano'}
                </span>
                <span className="text-[11px] text-gray-400 leading-tight mt-0.5">
                  Cloudflare Turnstile
                </span>
              </span>
            </span>
            <ExternalLink className="w-4 h-4 text-gray-400 group-hover:text-brand-400 transition-colors shrink-0" />
          </button>
        </div>
      );
    }

    return (
      <div className={`flex justify-center my-3 ${className}`}>
        <div ref={containerRef} />
      </div>
    );
  }
);

TurnstileWidget.displayName = 'TurnstileWidget';
