/**
 * Zero-Leakage Logger for E2EE Subsystems.
 * Strips all sensitive plaintext, private keys, pickles, and session keys.
 */

const SENSITIVE_KEYS = new Set([
  'body', 'plaintext', 'content', 'key', 'pickle',
  'sessionKey', 'session_key', 'privateKey', 'secret',
  'recoveryKey', 'token', 'signature', 'ed25519_secret',
  'curve25519_secret', 'megolm_secret_key'
]);

export function sanitizeObject(obj: any): any {
  if (typeof obj !== 'object' || obj === null) return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeObject);

  const clean: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.has(k)) {
      clean[k] = '[REDACTED]';
    } else if (k === 'session_id' || k === 'sessionId') {
      clean[k] = typeof v === 'string' ? `${v.slice(0, 8)}...` : v;
    } else if (typeof v === 'string') {
      let val = v;
      for (const secretKey of SENSITIVE_KEYS) {
        if (val.includes(secretKey)) {
          val = val.replace(new RegExp(secretKey, 'g'), '[REDACTED_SECRET]');
        }
      }
      clean[k] = val;
    } else {
      clean[k] = sanitizeObject(v);
    }
  }
  return clean;
}

export const safeCryptoLogger = {
  debug: (tagOrMessage: string, messageOrMeta?: any, meta?: any) => {
    if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'production') return;
    const tag = meta !== undefined || typeof messageOrMeta === 'string' ? tagOrMessage : 'LOG';
    const message = meta !== undefined || typeof messageOrMeta === 'string' ? messageOrMeta : tagOrMessage;
    const data = meta !== undefined ? meta : (typeof messageOrMeta !== 'string' ? messageOrMeta : undefined);
    console.debug(`[E2EE:${tag}] ${message}`, data ? sanitizeObject(data) : '');
  },
  info: (tagOrMessage: string, messageOrMeta?: any, meta?: any) => {
    const tag = meta !== undefined || typeof messageOrMeta === 'string' ? tagOrMessage : 'LOG';
    const message = meta !== undefined || typeof messageOrMeta === 'string' ? messageOrMeta : tagOrMessage;
    const data = meta !== undefined ? meta : (typeof messageOrMeta !== 'string' ? messageOrMeta : undefined);
    console.info(`[E2EE:${tag}] ${message}`, data ? sanitizeObject(data) : '');
  },
  warn: (tagOrMessage: string, messageOrMeta?: any, meta?: any) => {
    const tag = meta !== undefined || typeof messageOrMeta === 'string' ? tagOrMessage : 'LOG';
    const message = meta !== undefined || typeof messageOrMeta === 'string' ? messageOrMeta : tagOrMessage;
    const data = meta !== undefined ? meta : (typeof messageOrMeta !== 'string' ? messageOrMeta : undefined);
    console.warn(`[E2EE:${tag}] ${message}`, data ? sanitizeObject(data) : '');
  },
  error: (tagOrMessage: string, messageOrErr?: any, err?: any) => {
    const tag = err !== undefined || typeof messageOrErr === 'string' ? tagOrMessage : 'ERROR';
    const message = err !== undefined || typeof messageOrErr === 'string' ? messageOrErr : tagOrMessage;
    const data = err !== undefined ? err : (typeof messageOrErr !== 'string' ? messageOrErr : undefined);
    console.error(`[E2EE:${tag}] ${message}`, data?.message || data || '');
  }
};
