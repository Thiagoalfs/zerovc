import './test-setup-worker';

/**
 * ZeroVC Opt-in E2EE — Challenger M5-2 Adversarial Verification Suite
 * Role: M5 Messaging Challenger 2
 *
 * Hostile Stress-Testing & Attack Vectors:
 *  1. Plaintext Gating State Machine Matrix (HTTP 409 e2ee_required / e2ee_not_enabled)
 *  2. Outbound Megolm Session Invalidation on E2EE_ROTATION_REQUIRED & KeyStore Purge
 *  3. Forward Secrecy & Strict Past History Isolation (New Member cannot decrypt past history)
 *  4. Revoked / Expelled Member Exclusion (Departed member cannot decrypt future messages)
 *  5. Client Store Wire Hygiene & Zero-Plaintext Network Leakage
 *  6. High-Frequency Concurrent E2EE_ROTATION_REQUIRED Event Storm
 *
 * Run with:
 *  npx tsx scripts/test-challenger-m5-2-adversarial.ts
 */

import { GroupSession, InboundGroupSession } from '@kinsh/vodozemac-wasm';
import { MegolmManager } from '../src/crypto/megolmSession';
import { MessageCodec } from '../src/messaging/messageCodec';
import { keyStore } from '../src/crypto/keyStore';
import { useGuildStore } from '../src/stores/guildStore';
import { useAuthStore } from '../src/stores/authStore';
import { api } from '../src/lib/api';

// ANSI Colors
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

// Setup environment polyfills for Node.js / tsx runtime
(globalThis as any).self = globalThis;
(globalThis as any).onmessage = null;
(globalThis as any).postMessage = () => {};

if (typeof (globalThis as any).localStorage === 'undefined') {
  const store: Record<string, string> = {
    zerovc_device_id: 'dev-challenger-m5-sender',
  };
  (globalThis as any).localStorage = {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, val: string) => {
      store[key] = String(val);
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      for (const k in store) delete store[k];
    },
  };
}

// ============================================================================
// TEST HARNESS
// ============================================================================

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  durationMs: number;
}

interface SuiteResult {
  name: string;
  tests: TestResult[];
}

const suiteResults: SuiteResult[] = [];
let currentSuite: SuiteResult | null = null;

async function suite(name: string, fn: () => void | Promise<void>) {
  currentSuite = { name, tests: [] };
  suiteResults.push(currentSuite);
  console.log(`\n${BOLD}${CYAN}=== ${name} ===${RESET}`);
  return fn();
}

async function test(name: string, fn: () => void | Promise<void>) {
  const start = performance.now();
  try {
    await fn();
    const durationMs = performance.now() - start;
    currentSuite?.tests.push({ name, passed: true, durationMs });
    console.log(`  ${GREEN}✓${RESET} ${name} ${CYAN}(${durationMs.toFixed(1)}ms)${RESET}`);
  } catch (err: any) {
    const durationMs = performance.now() - start;
    const errorMsg = err?.message || String(err);
    currentSuite?.tests.push({ name, passed: false, error: errorMsg, durationMs });
    console.log(`  ${RED}✗${RESET} ${name}`);
    console.log(`    ${RED}Error: ${errorMsg}${RESET}`);
  }
}

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

function assertEqual<T>(actual: T, expected: T, msg: string) {
  if (actual !== expected) {
    throw new Error(`Assertion failed: ${msg} (expected: ${expected}, got: ${actual})`);
  }
}

function assertNotEqual<T>(actual: T, expected: T, msg: string) {
  if (actual === expected) {
    throw new Error(`Assertion failed: ${msg} (did not expect: ${expected})`);
  }
}

// ============================================================================
// ADVERSARIAL TEST EXECUTION
// ============================================================================

async function run() {
  console.log(`\n${BOLD}${YELLOW}================================================================${RESET}`);
  console.log(`${BOLD}${YELLOW}ZEROVC E2EE — CHALLENGER M5-2 ADVERSARIAL STRESS SUITE${RESET}`);
  console.log(`${BOLD}${YELLOW}Client Channel Messaging, Plaintext Gating & Session Invalidation${RESET}`);
  console.log(`${BOLD}${YELLOW}================================================================${RESET}`);

  // --------------------------------------------------------------------------
  // SUITE 1: PLAINTEXT GATING STATE MACHINE ADVERSARIAL MATRIX
  // --------------------------------------------------------------------------
  await suite('Suite 1: Plaintext Gating State Machine Adversary (HTTP 409 Enforcements)', async () => {
    // Replicates the strict server-side state machine in backend/internal/handlers/message_handlers.go lines 122-155:
    function simulateChannelMessageGating(params: {
      e2eeEnabled: boolean;
      req: {
        encrypted?: boolean;
        e2ee_ciphertext?: string | null;
        content?: string;
        attachments?: any[];
      };
    }): { status: number; error?: string; storedContent?: string } {
      const isEncrypted = params.req.encrypted !== undefined && params.req.encrypted === true;

      if (params.e2eeEnabled) {
        if (!isEncrypted || params.req.e2ee_ciphertext === null || params.req.e2ee_ciphertext === undefined || params.req.e2ee_ciphertext === '') {
          return { status: 409, error: 'e2ee_required' };
        }
      } else {
        if (isEncrypted || (params.req.e2ee_ciphertext !== null && params.req.e2ee_ciphertext !== undefined && params.req.e2ee_ciphertext !== '')) {
          return { status: 409, error: 'e2ee_not_enabled' };
        }
      }

      if (!isEncrypted) {
        if (!params.req.content && (!params.req.attachments || params.req.attachments.length === 0)) {
          return { status: 400, error: 'message content or attachment is required' };
        }
        if (params.req.content && params.req.content.length > 2000) {
          return { status: 400, error: 'O limite de tamanho de mensagem é 2.000 caracteres' };
        }
      } else {
        if (!params.req.e2ee_ciphertext || params.req.e2ee_ciphertext === '') {
          return { status: 400, error: 'ciphertext and metadata required for encrypted message' };
        }
      }

      // Zero-plaintext persistence invariant:
      let contentToStore = params.req.content || '';
      if (isEncrypted) {
        contentToStore = '';
      }

      return { status: 200, storedContent: contentToStore };
    }

    await test('Attack 1.1: Plaintext content sent into E2EE channel (encrypted=false) yields HTTP 409 e2ee_required', async () => {
      const res = simulateChannelMessageGating({
        e2eeEnabled: true,
        req: {
          encrypted: false,
          e2ee_ciphertext: undefined,
          content: 'Confidential corporate strategy plaintext',
        },
      });
      assertEqual(res.status, 409, 'Status must be 409');
      assertEqual(res.error, 'e2ee_required', 'Error code must be e2ee_required');
    });

    await test('Attack 1.2: Omitted encrypted flag into E2EE channel yields HTTP 409 e2ee_required', async () => {
      const res = simulateChannelMessageGating({
        e2eeEnabled: true,
        req: {
          content: 'Sensitive leak attempt without encryption flag',
        },
      });
      assertEqual(res.status, 409, 'Status must be 409');
      assertEqual(res.error, 'e2ee_required', 'Error code must be e2ee_required');
    });

    await test('Attack 1.3: encrypted=true but e2ee_ciphertext is null or omitted yields HTTP 409 e2ee_required', async () => {
      const res1 = simulateChannelMessageGating({
        e2eeEnabled: true,
        req: {
          encrypted: true,
          e2ee_ciphertext: null,
          content: 'Attacker trying to bypass with null ciphertext',
        },
      });
      assertEqual(res1.status, 409, 'Status must be 409');
      assertEqual(res1.error, 'e2ee_required', 'Error code must be e2ee_required');

      const res2 = simulateChannelMessageGating({
        e2eeEnabled: true,
        req: {
          encrypted: true,
          e2ee_ciphertext: undefined,
        },
      });
      assertEqual(res2.status, 409, 'Status must be 409');
      assertEqual(res2.error, 'e2ee_required', 'Error code must be e2ee_required');
    });

    await test('Attack 1.4: encrypted=true but e2ee_ciphertext is empty string yields HTTP 409 e2ee_required', async () => {
      const res = simulateChannelMessageGating({
        e2eeEnabled: true,
        req: {
          encrypted: true,
          e2ee_ciphertext: '',
          content: 'Leak with empty ciphertext',
        },
      });
      assertEqual(res.status, 409, 'Status must be 409');
      assertEqual(res.error, 'e2ee_required', 'Error code must be e2ee_required');
    });

    await test('Attack 1.5: encrypted=false with ciphertext payload into E2EE channel rejected with 409 e2ee_required', async () => {
      const res = simulateChannelMessageGating({
        e2eeEnabled: true,
        req: {
          encrypted: false,
          e2ee_ciphertext: 'bogus_ciphertext',
          content: '',
        },
      });
      assertEqual(res.status, 409, 'Status must be 409');
      assertEqual(res.error, 'e2ee_required', 'Error code must be e2ee_required');
    });

    await test('Attack 1.6: Encrypted message into non-E2EE channel yields HTTP 409 e2ee_not_enabled', async () => {
      const res = simulateChannelMessageGating({
        e2eeEnabled: false,
        req: {
          encrypted: true,
          e2ee_ciphertext: 'v1.m5.encrypted.payload.hex==',
          content: '',
        },
      });
      assertEqual(res.status, 409, 'Status must be 409');
      assertEqual(res.error, 'e2ee_not_enabled', 'Error code must be e2ee_not_enabled');
    });

    await test('Attack 1.7: Providing ciphertext into non-E2EE channel even if encrypted=false yields HTTP 409 e2ee_not_enabled', async () => {
      const res = simulateChannelMessageGating({
        e2eeEnabled: false,
        req: {
          encrypted: false,
          e2ee_ciphertext: 'rogue_ciphertext',
          content: 'Hello World',
        },
      });
      assertEqual(res.status, 409, 'Status must be 409');
      assertEqual(res.error, 'e2ee_not_enabled', 'Error code must be e2ee_not_enabled');
    });

    await test('Attack 1.8: Non-empty whitespace ciphertext into non-E2EE channel yields HTTP 409 e2ee_not_enabled', async () => {
      const res = simulateChannelMessageGating({
        e2eeEnabled: false,
        req: {
          encrypted: false,
          e2ee_ciphertext: '   ',
          content: 'Hello World',
        },
      });
      assertEqual(res.status, 409, 'Status must be 409');
      assertEqual(res.error, 'e2ee_not_enabled', 'Error code must be e2ee_not_enabled');
    });

    await test('Sanitization: Server unconditionally forces stored content to empty string for encrypted messages', async () => {
      const res = simulateChannelMessageGating({
        e2eeEnabled: true,
        req: {
          encrypted: true,
          e2ee_ciphertext: 'v1.valid.megolm.ciphertext==',
          content: 'LEAK_ATTEMPT_ATTACKER_INJECTED_PLAINTEXT',
        },
      });
      assertEqual(res.status, 200, 'Valid payload allowed');
      assertEqual(res.storedContent, '', 'Stored content MUST be forced to empty string');
    });
  });

  // --------------------------------------------------------------------------
  // SUITE 2: OUTBOUND SESSION INVALIDATION ON E2EE_ROTATION_REQUIRED & KEYSTORE PURGE
  // --------------------------------------------------------------------------
  await suite('Suite 2: Outbound Megolm Session Invalidation on E2EE_ROTATION_REQUIRED', async () => {
    const megolm = new MegolmManager();
    const channelId = 'channel-adversarial-rotation-id';

    let session1Id = '';
    let session1Key = '';

    await test('Establish initial outbound session at epoch 1', async () => {
      const res = await megolm.getOrCreateOutboundSession(channelId, 1);
      assert(res.isNew, 'Initial session must be new');
      assert(Boolean(res.sessionKey), 'Session key must be returned for distribution');
      session1Id = res.session.sessionId();
      session1Key = res.sessionKey!;
      assert(Boolean(session1Id), 'Session ID must exist');

      // Verify persisted in KeyStore
      const meta = await keyStore.getRecordMeta('megolm_outbound', channelId);
      assert(Boolean(meta), 'KeyStore must persist outbound record');
      assertEqual(meta?.epoch, 1, 'Persisted epoch must be 1');
    });

    await test('Reusing outbound session at epoch 1 retrieves existing session without rotation', async () => {
      const res = await megolm.getOrCreateOutboundSession(channelId, 1);
      assert(!res.isNew, 'Must reuse cached session');
      assertEqual(res.session.sessionId(), session1Id, 'Session ID must be identical');
    });

    await test('Invalidating outbound session purges record from KeyStore', async () => {
      await megolm.invalidateOutboundSession(channelId);
      const meta = await keyStore.getRecordMeta('megolm_outbound', channelId);
      assertEqual(meta, null, 'KeyStore outbound record must be completely deleted');
    });

    await test('Subsequent request after invalidation ratchets to brand new session with distinct ID and key', async () => {
      const res = await megolm.getOrCreateOutboundSession(channelId, 2);
      assert(res.isNew, 'Must generate new session after invalidation');
      assert(Boolean(res.sessionKey), 'New session key must be generated');
      const session2Id = res.session.sessionId();
      assertNotEqual(session2Id, session1Id, 'New session ID must be distinct from purged session');
      assertNotEqual(res.sessionKey, session1Key, 'New session key must be distinct from purged key');

      // KeyStore must now record epoch 2
      const meta = await keyStore.getRecordMeta('megolm_outbound', channelId);
      assertEqual(meta?.epoch, 2, 'KeyStore must record new epoch 2');
    });

    await test('Lazy ratchet rotation occurs on epoch increment even without explicit invalidation', async () => {
      // Current active session in store is at epoch 2.
      // Next call with epoch 3 (e.g. server broadcasted new epoch) must detect epoch mismatch:
      const res = await megolm.getOrCreateOutboundSession(channelId, 3);
      assert(res.isNew, 'Epoch mismatch must force lazy ratchet to new session');
      assertEqual(res.session.messageIndex(), 0, 'New session starts at messageIndex 0');
    });
  });

  // --------------------------------------------------------------------------
  // SUITE 3: FORWARD SECRECY & PAST HISTORY ISOLATION FOR NEW JOINERS
  // --------------------------------------------------------------------------
  await suite('Suite 3: Forward Secrecy & Strict Past History Isolation', async () => {
    const codec = new MessageCodec();
    const megolm = new MegolmManager();
    const channelId = 'channel-past-history-test';

    const aliceDevice = 'dev-alice-m5';
    const bobDevice = 'dev-bob-m5';
    const charlieDevice = 'dev-charlie-m5-new-joiner';

    let capturedToDeviceMsgs: any[] = [];
    (api.e2ee as any).sendToDevice = async (msgs: any[]) => {
      capturedToDeviceMsgs.push(...msgs);
      return { queued: msgs.length };
    };

    let epoch1Message: any = null;
    let epoch1SessionId = '';
    let epoch1SessionKey = '';

    await test('Phase 1 (Epoch 1): Alice sends Message 1 to audience [Alice, Bob]', async () => {
      capturedToDeviceMsgs = [];
      const rosterEpoch1 = [
        { user_id: 'alice-id', device_id: aliceDevice },
        { user_id: 'bob-id', device_id: bobDevice },
      ];

      const encoded = await codec.encodeMessage({
        conversationId: channelId,
        conversationType: 'channel',
        currentEpoch: 1,
        envelope: {
          v: 1,
          body: 'Epoch 1 Classified Discussion before Charlie joined',
          attachments: [],
        },
        senderDeviceId: aliceDevice,
        rosterDevices: rosterEpoch1,
      });

      epoch1SessionId = encoded.e2ee_meta.session_id;
      epoch1Message = {
        id: 'msg-epoch-1',
        channel_id: channelId,
        author_id: 'alice-id',
        content: '',
        encrypted: true,
        e2ee_ciphertext: encoded.e2ee_ciphertext,
        e2ee_meta: encoded.e2ee_meta,
        created_at: new Date().toISOString(),
      };

      // Verify room key was distributed to Bob, but NOT to Charlie
      const bobRoomKey = capturedToDeviceMsgs.find(
        (m) => m.recipient_device_id === bobDevice && m.msg_type === 'room_key'
      );
      assert(Boolean(bobRoomKey), 'Bob must receive room key for Epoch 1');
      const charlieRoomKey = capturedToDeviceMsgs.find(
        (m) => m.recipient_device_id === charlieDevice
      );
      assertEqual(charlieRoomKey, undefined, 'Charlie must NOT receive Epoch 1 room key');

      const payload = JSON.parse(bobRoomKey.payload);
      epoch1SessionKey = payload.session_key;

      // Bob imports room key and decrypts successfully
      await megolm.registerInboundSession(channelId, epoch1SessionId, epoch1SessionKey, aliceDevice, 1);
      const bobDecoded = await codec.decodeMessage(epoch1Message);
      assertEqual(bobDecoded.decryptionStatus, 'decrypted', 'Bob decodes Message 1');
      assertEqual(bobDecoded.content, 'Epoch 1 Classified Discussion before Charlie joined', 'Bob sees plaintext');
    });

    await test('Phase 2: Charlie joins channel -> Server invalidates session and steps to Epoch 2', async () => {
      // Simulate receipt of E2EE_ROTATION_REQUIRED event
      await megolm.invalidateOutboundSession(channelId);
    });

    let epoch2Message: any = null;
    let epoch2SessionId = '';
    let epoch2SessionKey = '';

    await test('Phase 3 (Epoch 2): Alice sends Message 2 to expanded audience [Alice, Bob, Charlie]', async () => {
      capturedToDeviceMsgs = [];
      const rosterEpoch2 = [
        { user_id: 'alice-id', device_id: aliceDevice },
        { user_id: 'bob-id', device_id: bobDevice },
        { user_id: 'charlie-id', device_id: charlieDevice },
      ];

      const encoded = await codec.encodeMessage({
        conversationId: channelId,
        conversationType: 'channel',
        currentEpoch: 2,
        envelope: {
          v: 1,
          body: 'Epoch 2 Welcome Charlie to the channel!',
          attachments: [],
        },
        senderDeviceId: aliceDevice,
        rosterDevices: rosterEpoch2,
      });

      epoch2SessionId = encoded.e2ee_meta.session_id;
      assertNotEqual(epoch2SessionId, epoch1SessionId, 'Epoch 2 must use brand new Megolm session ID');

      epoch2Message = {
        id: 'msg-epoch-2',
        channel_id: channelId,
        author_id: 'alice-id',
        content: '',
        encrypted: true,
        e2ee_ciphertext: encoded.e2ee_ciphertext,
        e2ee_meta: encoded.e2ee_meta,
        created_at: new Date().toISOString(),
      };

      // Room key for Epoch 2 must be distributed to BOTH Bob and Charlie
      const charlieKeyMsg = capturedToDeviceMsgs.find(
        (m) => m.recipient_device_id === charlieDevice && m.msg_type === 'room_key'
      );
      assert(Boolean(charlieKeyMsg), 'Charlie must receive room key for Epoch 2');
      const payload2 = JSON.parse(charlieKeyMsg.payload);
      epoch2SessionKey = payload2.session_key;

      // Charlie imports Epoch 2 session key
      await megolm.registerInboundSession(channelId, epoch2SessionId, epoch2SessionKey, aliceDevice, 2);

      // Charlie decodes Message 2 successfully
      const charlieDecoded2 = await codec.decodeMessage(epoch2Message);
      assertEqual(charlieDecoded2.decryptionStatus, 'decrypted', 'Charlie decodes Message 2');
      assertEqual(charlieDecoded2.content, 'Epoch 2 Welcome Charlie to the channel!', 'Charlie sees Message 2');
    });

    await test('Phase 4: Charlie attempts to decrypt Message 1 (Past History) -> STRICTLY BLOCKED', async () => {
      // Model Charlie's client device state: Charlie only joined at Epoch 2,
      // so Charlie's device NEVER received epoch1SessionKey.
      // We ensure epoch1SessionId is absent from Charlie's client keyring:
      await keyStore.deleteRecord('megolm_inbound', epoch1SessionId);

      // Charlie tries to decode Message 1 (encrypted under epoch1SessionId)
      const pastHistoryAttempt = await codec.decodeMessage(epoch1Message);

      // Must fail with isolated placeholder without crashing
      assertEqual(pastHistoryAttempt.decryptionStatus, 'undecryptable', 'Past history must be undecryptable to Charlie');
      assertEqual(pastHistoryAttempt.content, 'Mensagem criptografada indisponível', 'Placeholder rendered');
      assertNotEqual(pastHistoryAttempt.content, 'Epoch 1 Classified Discussion before Charlie joined', 'Plaintext NEVER leaked');
    });

    await test('Phase 5: Tamper Attack: Charlie tampers with meta.session_id to point to Epoch 2 session -> Fails MAC verification', async () => {
      // Attacker tries to fool client into using Epoch 2 inbound session to decrypt Epoch 1 ciphertext
      const tamperedMsg = {
        ...epoch1Message,
        id: 'msg-tampered-1',
        e2ee_meta: {
          ...epoch1Message.e2ee_meta,
          session_id: epoch2SessionId, // Tampered!
        },
      };

      const result = await codec.decodeMessage(tamperedMsg);
      assertEqual(result.decryptionStatus, 'undecryptable', 'Cross-session decrypt attempt must fail');
      assertEqual(result.content, 'Mensagem criptografada indisponível', 'Must render undecryptable placeholder');
    });
  });

  // --------------------------------------------------------------------------
  // SUITE 4: REVOKED / EXPELLED MEMBER EXCLUSION
  // --------------------------------------------------------------------------
  await suite('Suite 4: Revoked / Expelled Member Exclusion', async () => {
    const codec = new MessageCodec();
    const megolm = new MegolmManager();
    const channelId = 'channel-expelled-member-test';

    const aliceDevice = 'dev-alice-expel';
    const bobDevice = 'dev-bob-expel';
    const eveDevice = 'dev-eve-to-be-banned';

    let capturedToDeviceMsgs: any[] = [];
    (api.e2ee as any).sendToDevice = async (msgs: any[]) => {
      capturedToDeviceMsgs.push(...msgs);
      return { queued: msgs.length };
    };

    // Epoch 1: Eve is an active member
    const rosterEpoch1 = [
      { user_id: 'alice-id', device_id: aliceDevice },
      { user_id: 'bob-id', device_id: bobDevice },
      { user_id: 'eve-id', device_id: eveDevice },
    ];

    const encoded1 = await codec.encodeMessage({
      conversationId: channelId,
      conversationType: 'channel',
      currentEpoch: 1,
      envelope: { v: 1, body: 'Message 1 before Eve was banned', attachments: [] },
      senderDeviceId: aliceDevice,
      rosterDevices: rosterEpoch1,
    });

    const eveKeyMsg = capturedToDeviceMsgs.find(
      (m) => m.recipient_device_id === eveDevice && m.msg_type === 'room_key'
    );
    const eveKeyPayload = JSON.parse(eveKeyMsg.payload);
    await megolm.registerInboundSession(channelId, encoded1.e2ee_meta.session_id, eveKeyPayload.session_key, aliceDevice, 1);

    await test('Eve decrypts Message 1 while still an authorized member', async () => {
      const msg1 = {
        id: 'msg-eve-1',
        channel_id: channelId,
        author_id: 'alice-id',
        content: '',
        encrypted: true,
        e2ee_ciphertext: encoded1.e2ee_ciphertext,
        e2ee_meta: encoded1.e2ee_meta,
        created_at: new Date().toISOString(),
      };
      const decoded = await codec.decodeMessage(msg1);
      assertEqual(decoded.decryptionStatus, 'decrypted', 'Eve decodes while in channel');
      assertEqual(decoded.content, 'Message 1 before Eve was banned', 'Content matches');
    });

    await test('Eve is banned -> Outbound session invalidated, new audience excludes Eve', async () => {
      // Invalidate outbound session on rotation
      await megolm.invalidateOutboundSession(channelId);

      capturedToDeviceMsgs = [];
      // Recomputed audience after ban excludes Eve
      const rosterEpoch2ExcludingEve = [
        { user_id: 'alice-id', device_id: aliceDevice },
        { user_id: 'bob-id', device_id: bobDevice },
      ];

      const encoded2 = await codec.encodeMessage({
        conversationId: channelId,
        conversationType: 'channel',
        currentEpoch: 2,
        envelope: { v: 1, body: 'Message 2 after Eve was banned - highly confidential', attachments: [] },
        senderDeviceId: aliceDevice,
        rosterDevices: rosterEpoch2ExcludingEve,
      });

      // Verify to-device messages: Bob gets key, Eve DOES NOT get key
      const bobMsg = capturedToDeviceMsgs.find((m) => m.recipient_device_id === bobDevice);
      assert(Boolean(bobMsg), 'Bob receives room key for Epoch 2');
      const eveMsg = capturedToDeviceMsgs.find((m) => m.recipient_device_id === eveDevice);
      assertEqual(eveMsg, undefined, 'Eve must NOT receive room key for Epoch 2');

      // Eve attempts to decrypt Message 2 using her existing keyring
      const msg2 = {
        id: 'msg-eve-2',
        channel_id: channelId,
        author_id: 'alice-id',
        content: '',
        encrypted: true,
        e2ee_ciphertext: encoded2.e2ee_ciphertext,
        e2ee_meta: encoded2.e2ee_meta,
        created_at: new Date().toISOString(),
      };

      const eveDecoded2 = await codec.decodeMessage(msg2);
      assertEqual(eveDecoded2.decryptionStatus, 'undecryptable', 'Eve cannot decrypt future messages');
      assertEqual(eveDecoded2.content, 'Mensagem criptografada indisponível', 'Placeholder rendered to Eve');
    });
  });

  // --------------------------------------------------------------------------
  // SUITE 5: CLIENT STORE WIRE HYGIENE & ZERO-PLAINTEXT LEAKAGE
  // --------------------------------------------------------------------------
  await suite('Suite 5: Client Store Wire Hygiene & Zero-Plaintext Network Leakage', async () => {
    let capturedWirePayload: any = null;
    let capturedChannelId = '';

    // Mock api.channels.sendMessage to intercept raw HTTP transport payload
    api.channels.sendMessage = async (chId: string, payload: any) => {
      capturedChannelId = chId;
      capturedWirePayload = payload;
      return {
        id: payload.message_id || 'server-msg-123',
        channel_id: chId,
        author_id: 'user-sender',
        content: payload.content,
        encrypted: payload.encrypted,
        e2ee_ciphertext: payload.e2ee_ciphertext,
        e2ee_meta: payload.e2ee_meta,
        attachments: [],
        reactions: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as any;
    };

    // Mock api.e2ee.getChannelAudience
    api.e2ee.getChannelAudience = async (chId: string) => {
      return {
        channel_id: chId,
        audience_hash: 'test-audience-hash-123',
        rotation_epoch: 1,
        epoch: 1,
        audience_limit: 15,
        member_count: 2,
        devices: [
          { user_id: 'user-sender', device_id: 'dev-challenger-m5-sender' },
          { user_id: 'user-receiver', device_id: 'dev-receiver-1' },
        ],
      } as any;
    };

    useAuthStore.setState({
      user: {
        id: 'user-sender',
        username: 'alice',
        email: 'alice@zerovc.local',
        status: 'online',
        created_at: new Date().toISOString(),
      } as any,
    });

    const secureChannelId = 'channel-wire-hygiene-test';
    useGuildStore.setState({
      activeChannel: {
        id: secureChannelId,
        guild_id: 'guild-1',
        name: 'secret-ops',
        type: 'text',
        position: 0,
        e2ee_enabled: true,
        rotation_epoch: 1,
        created_at: new Date().toISOString(),
      },
      messages: [],
      messagesByChannel: {},
    });

    await test('Outgoing message via guildStore.sendMessage strictly wipes content on wire and sends ciphertext', async () => {
      const sensitiveInput = 'TOP_SECRET_CREDENTIALS_AND_PATIENT_RECORDS_PLAINTEXT';
      await useGuildStore.getState().sendMessage(sensitiveInput);

      assert(Boolean(capturedWirePayload), 'api.channels.sendMessage must be invoked');
      assertEqual(capturedChannelId, secureChannelId, 'Target channel ID matches');

      // CRITICAL LEAK CHECK:
      assertEqual(capturedWirePayload.content, '', 'Wire transport content field MUST BE strictly empty string');
      assertEqual(capturedWirePayload.encrypted, true, 'Wire transport encrypted flag MUST be true');
      assert(Boolean(capturedWirePayload.e2ee_ciphertext), 'Wire transport must contain non-empty e2ee_ciphertext');
      assert(capturedWirePayload.e2ee_ciphertext.length > 20, 'Ciphertext length must be substantial');
      assert(Boolean(capturedWirePayload.e2ee_meta), 'Wire transport must contain e2ee_meta');
      assertEqual(capturedWirePayload.e2ee_meta.alg, 'm.megolm.v1.aes-sha2', 'Megolm algorithm tag');

      // Confirm sensitive plaintext never exists anywhere in the wire payload
      const serializedWire = JSON.stringify(capturedWirePayload);
      assert(
        !serializedWire.includes(sensitiveInput),
        'CRITICAL LEAKAGE: Sensitive plaintext was detected in the raw wire JSON payload!'
      );
    });

    await test('Outgoing message into non-E2EE channel preserves content and does not set encrypted fields', async () => {
      capturedWirePayload = null;
      const plainChannelId = 'channel-standard-plain-test';
      useGuildStore.setState({
        activeChannel: {
          id: plainChannelId,
          guild_id: 'guild-1',
          name: 'general-public',
          type: 'text',
          position: 0,
          e2ee_enabled: false,
          created_at: new Date().toISOString(),
        },
        messages: [],
        messagesByChannel: {},
      });

      const normalText = 'Hello everybody in public general!';
      await useGuildStore.getState().sendMessage(normalText);

      assert(Boolean(capturedWirePayload), 'api.channels.sendMessage must be invoked');
      assertEqual(capturedWirePayload.content, normalText, 'Plain text content preserved in non-E2EE room');
      assertEqual(capturedWirePayload.encrypted, undefined, 'Encrypted flag must not be set');
      assertEqual(capturedWirePayload.e2ee_ciphertext, undefined, 'Ciphertext must not be set');
      assertEqual(capturedWirePayload.e2ee_meta, undefined, 'Meta must not be set');
    });
  });

  // --------------------------------------------------------------------------
  // SUITE 6: HIGH-FREQUENCY CONCURRENT E2EE_ROTATION_REQUIRED EVENT STORM
  // --------------------------------------------------------------------------
  await suite('Suite 6: High-Frequency Concurrent E2EE_ROTATION_REQUIRED Event Storm', async () => {
    const megolm = new MegolmManager();
    const stormChannelId = 'channel-storm-test';

    // Establish initial session
    const { session: initSession } = await megolm.getOrCreateOutboundSession(stormChannelId, 1);
    const initialSessionId = initSession.sessionId();

    // Prepare store with channel
    useGuildStore.setState({
      activeChannel: {
        id: stormChannelId,
        guild_id: 'guild-storm',
        name: 'storm-channel',
        type: 'text',
        position: 0,
        e2ee_enabled: true,
        rotation_epoch: 1,
        created_at: new Date().toISOString(),
      },
      guilds: [
        {
          id: 'guild-storm',
          name: 'Storm Guild',
          owner_id: 'owner-id',
          created_at: new Date().toISOString(),
          channels: [
            {
              id: stormChannelId,
              guild_id: 'guild-storm',
              name: 'storm-channel',
              type: 'text',
              position: 0,
              e2ee_enabled: true,
              rotation_epoch: 1,
              created_at: new Date().toISOString(),
            },
          ],
        },
      ],
    });

    await test('Concurrent storm of 50 E2EE_ROTATION_REQUIRED events executes without unhandled errors', async () => {
      // Simulate rapid WebSocket broadcast bursts (50 events within ~20ms)
      const promises: Promise<any>[] = [];

      for (let i = 2; i <= 51; i++) {
        const epoch = i;
        promises.push(
          (async () => {
            // App.tsx handleE2EERotationRequired handler logic:
            await megolm.invalidateOutboundSession(stormChannelId);
            useGuildStore.setState((s) => ({
              guilds: s.guilds.map((g) => ({
                ...g,
                channels: g.channels ? g.channels.map((c) => (c.id === stormChannelId ? { ...c, rotation_epoch: epoch } : c)) : g.channels,
              })),
              activeGuild: s.activeGuild ? {
                ...s.activeGuild,
                channels: s.activeGuild.channels ? s.activeGuild.channels.map((c) => (c.id === stormChannelId ? { ...c, rotation_epoch: epoch } : c)) : s.activeGuild.channels,
              } : s.activeGuild,
              activeChannel: s.activeChannel && s.activeChannel.id === stormChannelId ? { ...s.activeChannel, rotation_epoch: epoch } : s.activeChannel,
            }));
          })()
        );
      }

      await Promise.all(promises);

      // Verify channel ended at epoch 51
      const finalChannel = useGuildStore.getState().activeChannel;
      assertEqual(finalChannel?.rotation_epoch, 51, 'Channel rotation_epoch must be updated to 51');

      // Next session request creates session at epoch 51 with clean state
      const { session: finalSession, isNew } = await megolm.getOrCreateOutboundSession(stormChannelId, 51);
      assert(isNew, 'Must be a fresh session after storm');
      assertNotEqual(finalSession.sessionId(), initialSessionId, 'Final session distinct from initial');
    });
  });

  // ============================================================================
  // SUMMARY
  // ============================================================================
  console.log(`\n${BOLD}${YELLOW}================================================================${RESET}`);
  console.log(`${BOLD}${YELLOW}CHALLENGER M5-2 ADVERSARIAL STRESS TEST SUMMARY${RESET}`);
  console.log(`${BOLD}${YELLOW}================================================================${RESET}`);

  let totalTests = 0;
  let totalPassed = 0;
  let totalFailed = 0;

  for (const s of suiteResults) {
    const passed = s.tests.filter((t) => t.passed).length;
    const failed = s.tests.filter((t) => !t.passed).length;
    totalTests += s.tests.length;
    totalPassed += passed;
    totalFailed += failed;

    const icon = failed === 0 ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`;
    console.log(`${icon} ${s.name}: ${passed}/${s.tests.length} passed`);
  }

  console.log(`\n${BOLD}Total Suites:${RESET}     ${suiteResults.length}`);
  console.log(`${BOLD}Total Tests:${RESET}      ${totalTests}`);
  console.log(`${BOLD}Passed:${RESET}           ${GREEN}${totalPassed}${RESET}`);
  console.log(`${BOLD}Failed:${RESET}           ${totalFailed === 0 ? GREEN : RED}${totalFailed}${RESET}`);
  const verdict = totalFailed === 0 ? `${GREEN}${BOLD}APPROVE (100% GREEN)${RESET}` : `${RED}${BOLD}REQUEST_CHANGES${RESET}`;
  console.log(`${BOLD}Verdict:${RESET}          ${verdict}`);
  console.log(`${BOLD}${YELLOW}================================================================${RESET}\n`);

  if (totalFailed > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Unhandled failure in challenger harness:', err);
  process.exit(1);
});
