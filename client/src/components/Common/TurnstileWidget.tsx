import React, { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
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
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const widgetIdRef = useRef<string | null>(null);
    const tauriMode = isTauri();
    const remoteOrigin = (
      ((import.meta as any).env?.VITE_API_URL as string | undefined) || 'https://zerovc.safiroko.xyz'
    ).replace(/\/+$/, '');

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
          iframeRef.current?.contentWindow?.postMessage(
            { source: 'zerovc-turnstile', type: 'reset' },
            remoteOrigin
          );
          return;
        }
        if (widgetIdRef.current && window.turnstile) {
          try {
            window.turnstile.reset(widgetIdRef.current);
          } catch {}
        }
      },
    }), [tauriMode, remoteOrigin]);

    useEffect(() => {
      if (!siteKey || !tauriMode) return;

      const handleMessage = (event: MessageEvent) => {
        if (event.origin !== remoteOrigin) return;
        const data = event.data;
        if (!data || data.source !== 'zerovc-turnstile') return;

        if (data.type === 'success' && typeof data.token === 'string') {
          onSuccessRef.current(data.token);
        } else if (data.type === 'error') {
          onErrorRef.current?.();
        } else if (data.type === 'expired') {
          onExpireRef.current?.();
        }
      };

      window.addEventListener('message', handleMessage);
      return () => window.removeEventListener('message', handleMessage);
    }, [siteKey, tauriMode, remoteOrigin]);

    useEffect(() => {
      // Se não há site key configurada no .env, não inicializa o widget
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
      const widgetUrl = `${remoteOrigin}/api/auth/turnstile-widget${
        action ? `?action=${encodeURIComponent(action)}` : ''
      }`;
      return (
        <div className={`flex justify-center my-3 ${className}`}>
          <iframe
            ref={iframeRef}
            src={widgetUrl}
            title="Verificação de segurança"
            className="w-[310px] h-[72px] border-0 overflow-hidden bg-transparent"
          />
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
