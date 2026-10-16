/**
 * ZeroVC Opt-in E2EE — Proposed Changes for client/src/lib/api.ts
 *
 * Implements Milestone M2 (Requirement R6 §4, Requirement R2 §10):
 *  - CLIENT_E2EE_VERSION constant (1)
 *  - X-Client-E2EE-Version header injection on all requests
 *  - HTTP 426 Upgrade Required handling with window event notification
 *  - Complete api.e2ee namespace for REST endpoints
 */

export const API_PATCH_DOCUMENTATION = `
// ============================================================================
// 1. CONSTANT DEFINITION (Add near top of client/src/lib/api.ts)
// ============================================================================
export const CLIENT_E2EE_VERSION = 1;

// ============================================================================
// 2. REQUEST FUNCTION MODIFICATION (client/src/lib/api.ts:77-165)
// ============================================================================
async function request<T>(endpoint: string, options: RequestInit = {}, isRetry = false): Promise<T> {
  const baseUrl = getApiBaseUrl();
  const method = (options.method || 'GET').toUpperCase();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Client-E2EE-Version': String(CLIENT_E2EE_VERSION),
    ...(options.headers as Record<string, string>),
  };

  // ... (existing CSRF token logic and Electron Bearer auth logic) ...

  const response = await fetch(\`\${baseUrl}/api\${endpoint}\`, {
    credentials: 'include',
    ...options,
    headers,
  });

  // Captura CSRF token retornado no cabeçalho se disponível
  const resCsrf = response.headers.get('X-CSRF-Token');
  if (resCsrf) {
    setCsrfToken(resCsrf);
  }

  if (!response.ok) {
    let errorMsg = \`HTTP Error \${response.status}\`;
    let isRequires2FA = response.status === 428;
    let isUpgradeRequired = response.status === 426;
    let minVersion: number | undefined;

    try {
      const errJson = await response.json();
      if (errJson.message) errorMsg = errJson.message;
      else if (errJson.error) errorMsg = errJson.error;
      if (errJson.min_version) minVersion = errJson.min_version;
      if (errJson.requires_2fa || errJson.error === '2fa_required' || response.status === 428) {
        isRequires2FA = true;
      }
    } catch {}

    // Auto-recuperação transparente se o token CSRF expirou ou dessincronizou
    if (response.status === 403 && errorMsg.toLowerCase().includes('csrf') && !isRetry && !isPublicAuth) {
      try {
        await request<User>('/auth/me', {}, true);
        return await request<T>(endpoint, options, true);
      } catch {}
    }

    if (response.status === 426) {
      isUpgradeRequired = true;
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('zerovc:upgrade_required', {
            detail: { minVersion, error: errorMsg, endpoint },
          })
        );
      }
    }

    const error: any = new Error(errorMsg);
    error.status = response.status;
    error.requires_2fa = isRequires2FA;
    error.upgrade_required = isUpgradeRequired;
    error.min_version = minVersion;
    throw error;
  }

  if (response.status === 204) {
    return {} as T;
  }

  const data = await response.json();
  if (data && typeof data === 'object') {
    if ('csrf_token' in data && typeof (data as any).csrf_token === 'string') {
      setCsrfToken((data as any).csrf_token);
    }
  }
  return data as T;
}

// ============================================================================
// 3. E2EE NAMESPACE ADDITION TO 'api' OBJECT (client/src/lib/api.ts)
// ============================================================================
export interface E2EEDevice {
  id: string;
  user_id: string;
  session_id?: string;
  curve25519_key: string;
  ed25519_key: string;
  identity_signature: string;
  fallback_key?: string;
  revoked_at?: string | null;
  created_at: string;
}

export interface E2EEConfig {
  min_version: number;
  recommended_version: number;
  features: Record<string, boolean>;
}

// Inside api export:
export const api = {
  // ... existing auth, users, channels, dms, etc. ...

  e2ee: {
    registerIdentity: (identity_public_key: string) =>
      request<{ user_id: string; identity_public_key: string }>('/e2ee/identities', {
        method: 'POST',
        body: JSON.stringify({ identity_public_key }),
      }),

    getIdentity: (userId: string) =>
      request<{ user_id: string; identity_public_key: string }>(\`/e2ee/identities/\${userId}\`),

    registerDevice: (data: {
      curve25519_key: string;
      ed25519_key: string;
      identity_signature: string;
      fallback_key?: string;
      one_time_keys: Record<string, string>;
    }) =>
      request<E2EEDevice>('/e2ee/devices', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    getUserDevices: (userId: string) =>
      request<E2EEDevice[]>(\`/e2ee/users/\${userId}/devices\`),

    replenishOTKs: (deviceId: string, keys: Record<string, string>) =>
      request<{ added: number }>(\`/e2ee/devices/\${deviceId}/keys\`, {
        method: 'POST',
        body: JSON.stringify({ keys }),
      }),

    revokeDevice: (deviceId: string) =>
      request<{ message: string }>(\`/e2ee/devices/\${deviceId}/revoke\`, {
        method: 'POST',
      }),

    claimOTKs: (deviceIds: string[]) =>
      request<Record<string, { key_id: string; public_key: string }>>('/e2ee/devices/keys/claim', {
        method: 'POST',
        body: JSON.stringify({ device_ids: deviceIds }),
      }),

    sendToDevice: (messages: Array<{
      recipient_device_id: string;
      sender_device_id: string;
      msg_type: string;
      payload: string;
    }>) =>
      request<{ queued: number }>('/e2ee/to-device', {
        method: 'POST',
        body: JSON.stringify({ messages }),
      }),

    getToDevice: () =>
      request<Array<{
        id: string;
        recipient_device_id: string;
        sender_device_id: string;
        msg_type: string;
        payload: string;
        created_at: string;
      }>>('/e2ee/to-device'),

    ackToDevice: (messageIds: string[]) =>
      request<{ acked: number }>('/e2ee/to-device/ack', {
        method: 'POST',
        body: JSON.stringify({ message_ids: messageIds }),
      }),

    submitRoster: (roster: any) =>
      request<any>('/e2ee/rosters', {
        method: 'POST',
        body: JSON.stringify(roster),
      }),

    getLatestRoster: (conversationId: string) =>
      request<any>(\`/e2ee/rosters/\${conversationId}\`),

    getConfig: () =>
      request<E2EEConfig>('/e2ee/config'),
  },
};
`;
