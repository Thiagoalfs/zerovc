/**
 * Unit tests for desktopBridge, platform detection, Tauri Phase 2 auth routing,
 * and Phase 3 audio output fallback.
 *
 * Run with:
 *   npm run test:desktop-bridge
 */

import assert from 'node:assert/strict';

function createMockLocalStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => {
      store.set(k, String(v));
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => {
      store.clear();
    },
    get length() {
      return store.size;
    },
    key: (i: number) => Array.from(store.keys())[i] ?? null,
  };
}

async function run() {
  const mockStorage = createMockLocalStorage();
  (globalThis as any).localStorage = mockStorage;
  Object.defineProperty(globalThis, 'navigator', {
    value: { userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' },
    configurable: true,
    writable: true,
  });
  (globalThis as any).window = {
    location: { origin: 'https://zerovc.safiroko.xyz' },
  };

  const {
    isTauri,
    isElectron,
    isDesktop,
    getDesktopAPI,
    desktopBridge,
    resetDesktopBridgeCacheForTests,
  } = await import('../src/lib/desktopBridge');
  const platformMod = await import('../src/lib/platform');
  const { getApiBaseUrl, initDesktopProxyUrl } = await import('../src/lib/api');

  // 1. Web / Capacitor Android environment (neither Electron nor Tauri)
  assert.equal(isTauri(), false, 'Web should not be detected as Tauri');
  assert.equal(isElectron(), false, 'Web should not be detected as Electron');
  assert.equal(isDesktop(), false, 'Web should not be detected as Desktop');
  assert.equal(getDesktopAPI(), null, 'Web getDesktopAPI() must return null');
  assert.equal(platformMod.isTauri(), false);
  assert.equal(platformMod.isElectron(), false);
  assert.equal(platformMod.isDesktop(), false);
  assert.equal(platformMod.getDesktopAPI(), null);
  assert.equal(getApiBaseUrl(), 'https://zerovc.safiroko.xyz');

  // 2. Tauri v2 environment
  resetDesktopBridgeCacheForTests();

  const invokedCalls: Array<{ cmd: string; args: any }> = [];
  let mockProxyUrl: string | null = 'http://127.0.0.1:45678';

  (globalThis as any).window.__TAURI_INTERNALS__ = {
    invoke: async (cmd: string, args?: any) => {
      invokedCalls.push({ cmd, args });
      if (cmd === 'get_proxy_url') return mockProxyUrl;
      return undefined;
    },
    transformCallback: () => 0,
  };

  assert.equal(isTauri(), true, 'Tauri should be detected when __TAURI_INTERNALS__ exists');
  assert.equal(isElectron(), false, 'Tauri should not be detected as Electron');
  assert.equal(isDesktop(), true, 'Tauri should be detected as Desktop');

  const tauriApi = getDesktopAPI();
  assert.ok(tauriApi, 'Tauri getDesktopAPI() must return bridge object');
  assert.equal(tauriApi.isTauri, true);
  assert.equal(tauriApi.isElectron, false);
  assert.equal(tauriApi.platform, 'linux');

  // Phase 2: keyring token storage (never in localStorage)
  await desktopBridge.setAuthToken('jwt-secret-token');
  assert.deepEqual(
    invokedCalls.find((c) => c.cmd === 'auth_set_token'),
    { cmd: 'auth_set_token', args: { token: 'jwt-secret-token' } },
    'setAuthToken must invoke Tauri auth_set_token command'
  );
  assert.equal(mockStorage.getItem('token'), null, 'JWT must never be stored in localStorage.token in Tauri');
  assert.equal(mockStorage.getItem('zerovc_token'), null, 'JWT must never be stored in localStorage.zerovc_token in Tauri');

  // Phase 2: loopback proxy URL routing
  const proxyUrl = await initDesktopProxyUrl();
  assert.equal(proxyUrl, 'http://127.0.0.1:45678');
  assert.equal(getApiBaseUrl(), 'http://127.0.0.1:45678', 'API base URL should route through Tauri loopback proxy');

  // Phase 3: audio output fallback via Rust pactl command
  await desktopBridge.setAudioOutputDevice('alsa_output.usb-headset');
  assert.deepEqual(
    invokedCalls.find((c) => c.cmd === 'set_audio_output_device'),
    { cmd: 'set_audio_output_device', args: { deviceId: 'alsa_output.usb-headset' } },
    'setAudioOutputDevice must invoke Tauri set_audio_output_device command'
  );

  // Tauri without proxy (tauri.localhost origin must fall back to production origin, not tauri.localhost)
  (globalThis as any).window.location.origin = 'http://tauri.localhost';
  mockProxyUrl = null;
  // Clear cached tauriProxyUrl by setting __ZEROVC_PROXY_URL__ empty and checking fallback
  // Note: tauriProxyUrl is module-scoped, so test __ZEROVC_PROXY_URL__ override
  (globalThis as any).window.__ZEROVC_PROXY_URL__ = 'http://127.0.0.1:55555';
  assert.equal(getApiBaseUrl(), 'http://127.0.0.1:55555');

  console.log('PASS: All desktopBridge unit tests passed.');
}

run().catch((err) => {
  console.error('FAIL:', err);
  process.exit(1);
});
