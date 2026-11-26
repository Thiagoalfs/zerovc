import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import { ShieldCheck, CheckCircle2, Loader2 } from 'lucide-react';
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
          <div className={`my-3 ${className}`}>
            <div className="flex items-center justify-between px-3.5 py-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm">
              <span className="flex items-center gap-2 font-medium">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                Verificação humana concluída
              </span>
              <button
                type="button"
                onClick={() => {
                  setTauriToken(null);
                  onExpireRef.current?.();
                }}
                className="text-xs text-emerald-300/80 hover:text-emerald-200 underline"
              >
                Refazer
              </button>
            </div>
          </div>
        );
      }

      return (
        <div className={`my-3 ${className}`}>
          <button
            type="button"
            onClick={handleVerifyClick}
            disabled={tauriLaunching}
            className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg bg-[#1e1f22] border border-white/10 hover:border-indigo-500/50 hover:bg-[#232428] text-gray-200 text-sm transition-colors disabled:opacity-60"
          >
            <span className="flex items-center gap-2.5 font-medium">
              {tauriLaunching ? (
                <Loader2 className="w-4 h-4 text-indigo-400 animate-spin shrink-0" />
              ) : (
                <ShieldCheck className="w-4 h-4 text-indigo-400 shrink-0" />
              )}
              {tauriLaunching ? 'Aguardando verificação no navegador...' : 'Verificar que você é humano'}
            </span>
            <span className="text-[11px] text-gray-400">Cloudflare</span>
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
