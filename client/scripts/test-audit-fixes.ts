/**
 * Self-check tests for Phase 2/3/4/6 frontend fixes (#3, #12, #13, #38).
 * Run with: npx tsx -r ./scripts/test-setup-worker.ts scripts/test-audit-fixes.ts
 */

import assert from 'node:assert/strict';
import { Account, GroupSession } from '@kinsh/vodozemac-wasm';

function createMockStorage() {
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
  };
}

async function run() {
  const mockLocalStorage = createMockStorage();
  const mockSessionStorage = createMockStorage();
  (globalThis as any).localStorage = mockLocalStorage;
  (globalThis as any).sessionStorage = mockSessionStorage;
  (globalThis as any).window = {
    location: { origin: 'https://zerovc.safiroko.xyz', protocol: 'https:' },
    history: { replaceState: () => {} },
    dispatchEvent: () => true,
    addEventListener: () => {},
    removeEventListener: () => {},
  };

  const { keyStore } = await import('../src/crypto/keyStore');
  const { megolmManager } = await import('../src/crypto/megolmSession');
  const { olmSessionManager } = await import('../src/crypto/olmSession');
  const { CallKeyManager } = await import('../src/crypto/callKeys');
  const { backupManager } = await import('../src/crypto/backupManager');
  const { api } = await import('../src/lib/api');
  const { setCachedMessagesLRU } = await import('../src/utils/lruMessageCache');
  const { useAuthStore } = await import('../src/stores/authStore');
  const { useGuildStore } = await import('../src/stores/guildStore');
  const { resetDesktopBridgeCacheForTests } = await import('../src/lib/desktopBridge');
  const {
    saveChatScrollPosition,
    shouldAutoScrollToBottom,
    restoreChatScrollPosition,
  } = await import('../src/utils/chatScrollMemory');

  // --- #3: KeyStore strips plaintext sessionKey from extraFields ---
  await keyStore.encryptAndStorePickle('megolm_inbound', 'sess-strip-test', 'dummy-pickle', {
    sessionId: 'sess-strip-test',
    conversationId: 'conv-strip',
    sessionKey: 'SECRET_SHOULD_NOT_BE_STORED',
    session_key: 'SECRET_2',
  });
  const meta = await keyStore.getRecordMeta('megolm_inbound', 'sess-strip-test');
  assert.ok(meta, 'Record meta should exist');
  assert.equal((meta as any).sessionKey, undefined, 'sessionKey must be stripped from IndexedDB metadata');
  assert.equal((meta as any).session_key, undefined, 'session_key must be stripped from IndexedDB metadata');

  // --- #3: MegolmManager never uploads plaintext session_key & encrypts room_key with Olm ---
  let saveRoomKeyCalls = 0;
  (api.e2ee as any).saveRoomKey = async () => {
    saveRoomKeyCalls++;
    return { status: 'ok' };
  };
  (api.e2ee as any).saveRoomKeysBatch = async () => {
    saveRoomKeyCalls++;
    return { status: 'ok', saved_count: 0 };
  };

  const outbound = new GroupSession();
  const sId = outbound.sessionId();
  const sKey = outbound.sessionKey();
  await megolmManager.registerInboundSession('conv-1', sId, sKey, 'dev-sender', 1);
  assert.equal(saveRoomKeyCalls, 0, 'registerInboundSession must NOT upload plaintext room key');
  const inboundMeta = await keyStore.getRecordMeta('megolm_inbound', sId);
  assert.equal((inboundMeta as any).sessionKey, undefined, 'registerInboundSession must NOT store plaintext sessionKey');

  // Test Olm-encrypted distributeRoomKey
  const peerAcc = new Account();
  peerAcc.generateOneTimeKeys(2);
  const peerKeys = JSON.parse(peerAcc.identityKeys());
  const peerOtks = JSON.parse(peerAcc.oneTimeKeys()).curve25519;
  const otkId = Object.keys(peerOtks)[0];
  const otkPub = peerOtks[otkId];
  peerAcc.markKeysAsPublished();

  const sentToDev: any[] = [];
  (api.e2ee as any).claimOTKs = async () => ({
    claimed_keys: {
      'dev-peer-1': { key_id: otkId, public_key: otkPub, is_fallback: false },
    },
  });
  (api.e2ee as any).sendToDevice = async (msgs: any[]) => {
    sentToDev.push(...msgs);
    return { queued: msgs.length };
  };

  const distRes = await megolmManager.distributeRoomKey({
    conversationType: 'dm',
    conversationId: 'conv-1',
    sessionId: sId,
    sessionKey: sKey,
    epoch: 1,
    senderDeviceId: 'dev-me',
    recipientDevices: [{ device_id: 'dev-peer-1', user_id: 'u-peer', curve25519_key: peerKeys.curve25519 }],
  });
  assert.equal(distRes.queued, 1, 'Olm-encrypted room_key should be queued');
  const wirePayload = JSON.parse(sentToDev[0].payload);
  assert.equal(wirePayload.olm_v, 1, 'Wire payload must be Olm-encrypted');
  assert.equal(wirePayload.session_key, undefined, 'Wire payload must not expose session_key');
  const decryptedRoomKey = JSON.parse(peerAcc.createInboundSession(wirePayload.body).plaintext);
  assert.equal(decryptedRoomKey.session_key, sKey, 'Peer Olm decrypt must recover exact Megolm session_key');

  // Test CallKeyManager production Olm path (no customSendToDevice)
  sentToDev.length = 0;
  const callMgr = new CallKeyManager({ setKeyFn: async () => {} });
  // Reuse existing Olm session with dev-peer-1 (established above)
  await callMgr.startCall('call-olm-1', 'dev-aaa', ['dev-peer-1']);
  assert.equal(sentToDev.length, 1, 'CallKeyManager must send Olm-encrypted call_key via api.e2ee.sendToDevice');
  const callWire = JSON.parse(sentToDev[0].payload);
  assert.equal(callWire.olm_v, 1, 'Call key wire payload must be Olm-encrypted');
  assert.equal(callWire.key, undefined, 'Call key wire payload must not expose plaintext key');
  // Test decryptToDevicePayload fails on unencrypted payload
  await assert.rejects(
    () => olmSessionManager.decryptToDevicePayload('dev-peer-1', { msg_type: 'room_key', session_key: 'plain' }),
    /Olm-encrypted payload required/
  );
  callMgr.endCall();

  // --- #13: BackupManager binds vault_key to userId ---
  const rawVault = new Uint8Array(32).fill(42);
  backupManager.setVaultKey((await import('../src/crypto/recovery')).importVaultKeyFromBytes(rawVault) as any, 'user-A');
  await backupManager.saveVaultKeyToStore(rawVault, 'user-A');
  const wrongUserKey = await backupManager.loadVaultKeyFromStore('user-B');
  assert.equal(wrongUserKey, null, 'vault_key bound to user-A must be rejected for user-B');
  const deletedMeta = await keyStore.getRecordMeta('account', 'vault_key');
  assert.equal(deletedMeta, null, 'Mismatched vault_key must be deleted from KeyStore');

  // --- #12 & #13: authStore checkAuth + logout ---
  resetDesktopBridgeCacheForTests();
  const tokenCalls: Array<string | null> = [];
  (globalThis as any).window.__TAURI_INTERNALS__ = {
    invoke: async (cmd: string, args?: any) => {
      if (cmd === 'set_auth_token') tokenCalls.push(args?.token ?? null);
      if (cmd === 'get_proxy_url') return 'http://127.0.0.1:45678';
      return undefined;
    },
  };

  // Network error must NOT wipe keyring token
  (api.auth as any).me = async () => {
    throw new Error('Failed to fetch');
  };
  await useAuthStore.getState().checkAuth();
  assert.equal(tokenCalls.length, 0, 'Network error in checkAuth must NOT wipe keyring token');

  // 503 error must NOT wipe keyring token
  (api.auth as any).me = async () => {
    const err: any = new Error('Service Unavailable');
    err.status = 503;
    throw err;
  };
  await useAuthStore.getState().checkAuth();
  assert.equal(tokenCalls.length, 0, '5xx error in checkAuth must NOT wipe keyring token');

  // 401 error MUST wipe keyring token
  (api.auth as any).me = async () => {
    const err: any = new Error('Unauthorized');
    err.status = 401;
    throw err;
  };
  await useAuthStore.getState().checkAuth();
  assert.deepEqual(tokenCalls, [null], '401 error in checkAuth MUST wipe keyring token');

  // logout() clears zerovc_device_id, zerovc_csrf_token, and crypto store
  mockLocalStorage.setItem('zerovc_device_id', 'dev-abc');
  mockLocalStorage.setItem('zerovc_csrf_token', 'csrf-xyz');
  (api.auth as any).logout = async () => ({ message: 'ok' });
  await useAuthStore.getState().logout();
  assert.equal(mockLocalStorage.getItem('zerovc_device_id'), null, 'logout must remove zerovc_device_id');
  assert.equal(mockLocalStorage.getItem('zerovc_csrf_token'), null, 'logout must remove zerovc_csrf_token');

  // --- #38: LRU cache eviction (max 25) & typing timer debounce ---
  let msgCache: Record<string, any[]> = {};
  let fetched: Record<string, boolean> = {};
  const lru: string[] = [];
  for (let i = 1; i <= 30; i++) {
    const k = `ch-${i}`;
    fetched[k] = true;
    const res = setCachedMessagesLRU(msgCache, lru, k, [{ id: `m-${i}` }], fetched);
    msgCache = res.cache;
    fetched = res.fetched!;
  }
  assert.equal(Object.keys(msgCache).length, 25, 'LRU cache must cap at 25 entries');
  assert.equal(msgCache['ch-1'], undefined, 'Oldest entry ch-1 must be evicted');
  assert.equal(fetched['ch-1'], undefined, 'Evicted entry ch-1 must be pruned from fetchedMap');
  assert.ok(msgCache['ch-30'], 'Most recent entry ch-30 must be kept');

  useGuildStore.getState().setTyping('ch-typing', 'u-1');
  useGuildStore.getState().setTyping('ch-typing', 'u-1');
  assert.equal(useGuildStore.getState().typingUsers.get('ch-typing')?.has('u-1'), true, 'User should be marked typing');

  // --- Chat scroll memory & restore cleanup cancellation ---
  const origRaf = (globalThis as any).requestAnimationFrame;
  const origCancelRaf = (globalThis as any).cancelAnimationFrame;
  const rafQueue = new Map<number, FrameRequestCallback>();
  let nextRafId = 1;
  const cancelledRafIds: number[] = [];
  (globalThis as any).requestAnimationFrame = (cb: FrameRequestCallback) => {
    const id = nextRafId++;
    rafQueue.set(id, cb);
    return id;
  };
  (globalThis as any).cancelAnimationFrame = (id: number) => {
    cancelledRafIds.push(id);
    rafQueue.delete(id);
  };

  try {
    assert.equal(shouldAutoScrollToBottom('ch-unseen'), true, 'Unseen channel should auto-scroll to bottom');

    const containerAtTop = { scrollTop: 120, scrollHeight: 1000, clientHeight: 400 } as unknown as HTMLElement;
    saveChatScrollPosition('ch-scrolled-up', containerAtTop);
    assert.equal(shouldAutoScrollToBottom('ch-scrolled-up'), false, 'Scrolled-up channel should not auto-scroll');

    const containerBottom = { scrollTop: 580, scrollHeight: 1000, clientHeight: 400 } as unknown as HTMLElement;
    saveChatScrollPosition('ch-at-bottom', containerBottom);
    assert.equal(shouldAutoScrollToBottom('ch-at-bottom'), true, 'Near-bottom channel (<35px) should auto-scroll');

    // Verify restoreChatScrollPosition restores saved scrollTop and cleanup cancels pending rAF + timeout
    const restoreTarget = { scrollTop: 0, scrollHeight: 1200, clientHeight: 400 } as unknown as HTMLElement;
    const cancelSaved = restoreChatScrollPosition('ch-scrolled-up', restoreTarget);
    assert.equal(restoreTarget.scrollTop, 120, 'Initial restore must apply saved scrollTop');
    restoreTarget.scrollTop = 999;
    cancelSaved();
    assert.equal(cancelledRafIds.length, 1, 'Cleanup must cancel pending requestAnimationFrame');

    // Even if a rAF callback somehow ran after cleanup, cancelled flag must prevent mutation
    for (const cb of rafQueue.values()) cb(0);
    assert.equal(restoreTarget.scrollTop, 999, 'Cancelled restore must not mutate scrollTop');

    // Verify 80ms timeout for at-bottom channel is also cancelled by cleanup
    const bottomTarget = { scrollTop: 0, scrollHeight: 1500, clientHeight: 400 } as unknown as HTMLElement;
    const cancelBottom = restoreChatScrollPosition('ch-at-bottom', bottomTarget);
    assert.equal(bottomTarget.scrollTop, 1500, 'At-bottom channel must scroll to scrollHeight');
    bottomTarget.scrollHeight = 2000;
    bottomTarget.scrollTop = 0;
    cancelBottom();
    await new Promise((r) => setTimeout(r, 110));
    assert.equal(bottomTarget.scrollTop, 0, 'Cancelled 80ms timer must not re-clamp scrollTop');
  } finally {
    (globalThis as any).requestAnimationFrame = origRaf;
    (globalThis as any).cancelAnimationFrame = origCancelRaf;
  }

  console.log('PASS: All audit fix unit tests (#3, #12, #13, #38, chatScrollMemory) passed.');
  process.exit(0);
}

run().catch((err) => {
  console.error('FAIL:', err);
  process.exit(1);
});
