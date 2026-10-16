/**
 * ZeroVC Opt-in E2EE — Milestone M3 Frontend Automated Verification Suite
 *
 * Exhaustively exercises:
 *  - Suite 1: Megolm Session Management & Ratchet Rotation
 *  - Suite 2: Canonical Envelope Serialization (RFC 8785)
 *  - Suite 3: Client-Side AES-256-GCM Attachments & Integrity
 *  - Suite 4: Pure MessageCodec Decoupling & Undecryptable Fallback
 *  - Suite 5: Key Request Protocol, Deduplication & Rate Limiting
 *  - Suite 6: 15-Member Group Cap & History Isolation Invariants
 *
 * Run with:
 *   npx tsx scripts/test-frontend-m3.ts
 */

import { GroupSession, InboundGroupSession } from '@kinsh/vodozemac-wasm';
import {
  serializeEnvelope,
  parseEnvelope,
  canonicalJsonStringify,
  EnvelopeV1,
  EnvelopeAttachment,
} from '../src/crypto/envelope';
import {
  encryptAttachmentData,
  decryptAttachmentData,
  computeSha256Hex,
  uint8ArrayToBase64,
  base64ToUint8Array,
} from '../src/crypto/attachments';
import { MegolmManager, megolmManager, RoomKeyToDevicePayload } from '../src/crypto/megolmSession';
import { KeyRequestManager, keyRequestManager } from '../src/crypto/keyRequestManager';
import { MessageCodec, messageCodec } from '../src/messaging/messageCodec';
import { useDMStore } from '../src/stores/dmStore';
import { useDMGroupStore } from '../src/stores/dmGroupStore';
import { api } from '../src/lib/api';

// ANSI Colors
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

// Mock localStorage if running in pure Node.js
if (typeof globalThis.localStorage === 'undefined') {
  const store: Record<string, string> = {
    zerovc_device_id: 'test-device-uuid-1',
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

// Intercept api.e2ee.sendToDevice for to-device tracking in tests
const sentToDeviceMessages: any[] = [];
(api.e2ee as any).sendToDevice = async (messages: any[]) => {
  sentToDeviceMessages.push(...messages);
  return { queued: messages.length };
};

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

function suite(name: string, fn: () => void | Promise<void>) {
  currentSuite = { name, tests: [] };
  suiteResults.push(currentSuite);
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
    throw new Error(`Assertion failed: ${msg} (expected ${expected}, got ${actual})`);
  }
}

function assertThrows(fn: () => any, expectedSnippet?: string, msg?: string) {
  let threw = false;
  try {
    fn();
  } catch (err: any) {
    threw = true;
    if (expectedSnippet && !String(err.message || err).includes(expectedSnippet)) {
      throw new Error(`Expected error containing "${expectedSnippet}", got: "${err.message || err}"`);
    }
  }
  if (!threw) {
    throw new Error(`Expected function to throw: ${msg || 'did not throw'}`);
  }
}

async function assertRejects(fn: () => Promise<any>, expectedSnippet?: string, msg?: string) {
  let threw = false;
  try {
    await fn();
  } catch (err: any) {
    threw = true;
    if (expectedSnippet && !String(err.message || err).includes(expectedSnippet)) {
      throw new Error(`Expected rejection containing "${expectedSnippet}", got: "${err.message || err}"`);
    }
  }
  if (!threw) {
    throw new Error(`Expected async function to reject: ${msg || 'did not reject'}`);
  }
}

// ============================================================================
// SUITE EXECUTION
// ============================================================================

async function runM3VerificationSuite() {
  console.log(`\n${BOLD}${CYAN}============================================================${RESET}`);
  console.log(`${BOLD}${CYAN}ZEROVC E2EE — MILESTONE M3 FRONTEND VERIFICATION HARNESS${RESET}`);
  console.log(`${BOLD}Production Suite: Megolm, Envelopes, Attachments, Codec, UI Guards${RESET}`);
  console.log(`${BOLD}${CYAN}============================================================${RESET}\n`);

  // --------------------------------------------------------------------------
  // SUITE 1: MEGOLM SESSION MANAGEMENT & RATCHET ROTATION
  // --------------------------------------------------------------------------
  await suite('Suite 1: Megolm Session Management & Ratchet Rotation', async () => {
    const manager = new MegolmManager();
    const convId = 'conv-test-megolm-1';
    let epoch = 1;

    let sessionIdCreated = '';
    let exportedKey = '';

    await test('Outbound session creation: initial messageIndex is 0 and valid sessionId', async () => {
      const res = await manager.getOrCreateOutboundSession(convId, epoch);
      assert(res.isNew, 'Session should be freshly created');
      assert(Boolean(res.sessionKey), 'Fresh session must have sessionKey exported');
      assert(Boolean(res.session.sessionId()), 'Session must have non-empty sessionId');
      assertEqual(res.session.messageIndex(), 0, 'Initial messageIndex must be 0');
      sessionIdCreated = res.session.sessionId();
      exportedKey = res.sessionKey!;
    });

    await test('Reusing active session without rotation when epoch has not changed', async () => {
      const res = await manager.getOrCreateOutboundSession(convId, epoch);
      assert(!res.isNew, 'Should reuse existing outbound session');
      assertEqual(res.session.sessionId(), sessionIdCreated, 'Should keep same session ID');
    });

    await test('Ratchet progression: Encrypting messages advances messageIndex monotonically', async () => {
      const { session } = await manager.getOrCreateOutboundSession(convId, epoch);
      const envelope: EnvelopeV1 = { v: 1, body: 'Hello Alice!' };

      const enc1 = await manager.encryptMessage(convId, session, envelope, epoch, 'dev-1');
      assertEqual(enc1.meta.msg_index, 0, 'First encryption message index must be 0');
      assertEqual(session.messageIndex(), 1, 'Ratchet must advance to 1');

      const enc2 = await manager.encryptMessage(convId, session, envelope, epoch, 'dev-1');
      assertEqual(enc2.meta.msg_index, 1, 'Second encryption message index must be 1');
      assertEqual(session.messageIndex(), 2, 'Ratchet must advance to 2');
    });

    await test('Inbound session import and message decryption', async () => {
      await manager.registerInboundSession(convId, sessionIdCreated, exportedKey, 'dev-1', epoch);
      const exists = await manager.hasInboundSession(sessionIdCreated);
      assert(exists, 'Inbound session must be stored in KeyStore');

      // Create message with outbound session
      const { session } = await manager.getOrCreateOutboundSession(convId, epoch);
      const envelope: EnvelopeV1 = { v: 1, body: 'Secret E2EE message over Megolm' };
      const enc = await manager.encryptMessage(convId, session, envelope, epoch, 'dev-1');

      // Inbound session decrypts message
      const decrypted = await manager.decryptMessage(sessionIdCreated, enc.ciphertext, enc.meta.msg_index);
      assertEqual(decrypted.body, 'Secret E2EE message over Megolm', 'Decrypted body must match original plaintext');
    });

    await test('Anti-replay & monotonic index verification: Out-of-order or duplicate index rejected', async () => {
      const { session } = await manager.getOrCreateOutboundSession(convId, epoch);
      const envelope: EnvelopeV1 = { v: 1, body: 'Replay Test' };
      const enc = await manager.encryptMessage(convId, session, envelope, epoch, 'dev-1');

      // Expecting index != enc.meta.msg_index should throw
      await assertRejects(
        () => manager.decryptMessage(sessionIdCreated, enc.ciphertext, 999),
        'REPLAY_OR_INDEX_MISMATCH',
        'Should reject mismatched message index'
      );
    });

    await test('Ratchet rotation on epoch change (membership/roster updated)', async () => {
      epoch += 1; // Increment epoch
      const res = await manager.getOrCreateOutboundSession(convId, epoch);
      assert(res.isNew, 'Should rotate and create new session when epoch increments');
      assert(res.session.sessionId() !== sessionIdCreated, 'New session must have distinct sessionId');
    });

    await test('Manual session invalidation: invalidateOutboundSession forces fresh session', async () => {
      await manager.invalidateOutboundSession(convId);
      const res = await manager.getOrCreateOutboundSession(convId, epoch);
      assert(res.isNew, 'Must generate new session after explicit invalidation');
    });

    await test('To-device room_key distribution format verification', async () => {
      sentToDeviceMessages.length = 0; // Clear tracked messages
      const res = await manager.distributeRoomKey({
        conversationType: 'dm_group',
        conversationId: convId,
        sessionId: 'sess-dist-1',
        sessionKey: 'key-dist-1',
        epoch: 1,
        senderDeviceId: 'dev-sender',
        recipientDevices: [
          { device_id: 'dev-sender', user_id: 'u-1' }, // Self (must be omitted)
          { device_id: 'dev-alice', user_id: 'u-2' },
          { device_id: 'dev-bob', user_id: 'u-3' },
        ],
      });

      assertEqual(res.queued, 2, 'Should queue room_key to 2 recipients excluding sender');
      assertEqual(sentToDeviceMessages.length, 2, '2 messages dispatched');
      const payloadAlice = JSON.parse(sentToDeviceMessages[0].payload) as RoomKeyToDevicePayload;
      assertEqual(payloadAlice.msg_type, 'room_key', 'Payload type must be room_key');
      assertEqual(payloadAlice.session_id, 'sess-dist-1', 'Must carry correct session_id');
      assertEqual(payloadAlice.sender_device_id, 'dev-sender', 'Must carry sender device ID');
    });
  });

  // --------------------------------------------------------------------------
  // SUITE 2: CANONICAL ENVELOPE SERIALIZATION (RFC 8785)
  // --------------------------------------------------------------------------
  await suite('Suite 2: Canonical Envelope Serialization (RFC 8785)', async () => {
    await test('Deterministic lexicographical key ordering', () => {
      const obj1 = { z: 1, a: 2, m: 3 };
      const obj2 = { a: 2, m: 3, z: 1 };
      const s1 = canonicalJsonStringify(obj1);
      const s2 = canonicalJsonStringify(obj2);
      assertEqual(s1, s2, 'Stringified representations must be strictly identical');
      assertEqual(s1, '{"a":2,"m":3,"z":1}', 'Keys must be sorted alphabetically');
    });

    await test('Standard text envelope: serializeEnvelope -> parseEnvelope roundtrip', () => {
      const original: EnvelopeV1 = {
        v: 1,
        body: 'Hello world, canonical envelope test!',
      };
      const serialized = serializeEnvelope(original);
      assertEqual(serialized, '{"body":"Hello world, canonical envelope test!","v":1}', 'Serialized format matches');
      const parsed = parseEnvelope(serialized);
      assertEqual(parsed.v, 1, 'Version must be 1');
      assertEqual(parsed.body, original.body, 'Body must match');
    });

    await test('Envelope with attachments: fields preserved and SHA-256 lowercased', () => {
      const att: EnvelopeAttachment = {
        url: '/api/e2ee/attachments/opaque-uuid-1',
        name: 'report.pdf',
        mime: 'application/pdf',
        size: 1048576,
        key: 'c29tZS1rZXk=',
        iv: 'c29tZS1pdg==',
        sha256: 'E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855', // uppercase
      };
      const env: EnvelopeV1 = {
        v: 1,
        body: 'Please see attached report',
        attachments: [att],
      };
      const serialized = serializeEnvelope(env);
      const parsed = parseEnvelope(serialized);
      assert(Boolean(parsed.attachments && parsed.attachments.length === 1), 'Attachment must be parsed');
      assertEqual(parsed.attachments![0].sha256, att.sha256.toLowerCase(), 'SHA-256 must be normalized to lowercase');
      assertEqual(parsed.attachments![0].mime, 'application/pdf', 'MIME must match');
    });

    await test('Envelope with reaction and edit', () => {
      const reactEnv: EnvelopeV1 = {
        v: 1,
        body: '',
        reaction: {
          target_message_id: 'msg-123',
          emoji: '❤️',
          action: 'add',
        },
      };
      const parsedReact = parseEnvelope(serializeEnvelope(reactEnv));
      assert(Boolean(parsedReact.reaction), 'Reaction must be present');
      assertEqual(parsedReact.reaction?.emoji, '❤️', 'Emoji must match');
      assertEqual(parsedReact.reaction?.action, 'add', 'Action must match');

      const editEnv: EnvelopeV1 = {
        v: 1,
        body: 'Corrected text content',
        edit: {
          target_message_id: 'msg-123',
          original_created_at: '2026-10-10T12:00:00Z',
        },
      };
      const parsedEdit = parseEnvelope(serializeEnvelope(editEnv));
      assert(Boolean(parsedEdit.edit), 'Edit must be present');
      assertEqual(parsedEdit.edit?.target_message_id, 'msg-123', 'Target message ID must match');
      assertEqual(parsedEdit.body, 'Corrected text content', 'Edited body matches');
    });

    await test('Strict version gating: rejects version != 1', () => {
      assertThrows(
        () => serializeEnvelope({ v: 2 as any, body: 'Future version' }),
        'UNSUPPORTED_ENVELOPE_VERSION',
        'Must reject serialization of v:2'
      );
      assertThrows(
        () => parseEnvelope(JSON.stringify({ v: 2, body: 'Future version' })),
        'UNSUPPORTED_ENVELOPE_VERSION',
        'Must reject parsing of v:2'
      );
      assertThrows(
        () => parseEnvelope(JSON.stringify({ body: 'Missing v' })),
        'UNSUPPORTED_ENVELOPE_VERSION',
        'Must reject parsing without v'
      );
    });

    await test('Strict validation: rejects invalid non-string body or malformed JSON', () => {
      assertThrows(
        () => serializeEnvelope({ v: 1, body: 12345 as any }),
        'INVALID_ENVELOPE',
        'Must reject non-string body during serialization'
      );
      assertThrows(
        () => parseEnvelope('not-valid-json{'),
        'MALFORMED_ENVELOPE_JSON',
        'Must reject malformed JSON string'
      );
    });
  });

  // --------------------------------------------------------------------------
  // SUITE 3: CLIENT-SIDE AES-256-GCM ATTACHMENTS
  // --------------------------------------------------------------------------
  await suite('Suite 3: Client-Side AES-256-GCM Attachments', async () => {
    const sampleData = new TextEncoder().encode('Confidential ZeroVC opt-in attachment content');
    let encryptedPayload: any;

    await test('Attachment encryption: produces 256-bit key, 96-bit IV, and 64-char hex SHA-256', async () => {
      encryptedPayload = await encryptAttachmentData(sampleData, 'secret.txt', 'text/plain');

      assert(Boolean(encryptedPayload.ciphertext), 'Ciphertext buffer must be present');
      assert(encryptedPayload.ciphertext.byteLength > sampleData.byteLength, 'Ciphertext includes 16-byte GCM auth tag');
      assertEqual(base64ToUint8Array(encryptedPayload.key).byteLength, 32, 'Key must be exactly 256 bits (32 bytes)');
      assertEqual(base64ToUint8Array(encryptedPayload.iv).byteLength, 12, 'IV must be exactly 96 bits (12 bytes)');
      assertEqual(encryptedPayload.sha256.length, 64, 'SHA-256 must be 64 lowercase hex characters');
      assertEqual(encryptedPayload.sha256, encryptedPayload.sha256.toLowerCase(), 'Digest must be lowercase');
    });

    await test('Attachment decryption: exact plaintext recovery', async () => {
      const decrypted = await decryptAttachmentData(
        encryptedPayload.ciphertext,
        encryptedPayload.key,
        encryptedPayload.iv,
        encryptedPayload.sha256
      );

      const recoveredText = new TextDecoder().decode(decrypted);
      assertEqual(recoveredText, 'Confidential ZeroVC opt-in attachment content', 'Decrypted text matches original');
    });

    await test('Tamper resistance: Bit flip in ciphertext triggers SHA-256 integrity rejection', async () => {
      const tampered = new Uint8Array(encryptedPayload.ciphertext.slice(0));
      tampered[5] ^= 0x01; // flip 1 bit

      await assertRejects(
        () => decryptAttachmentData(tampered.buffer, encryptedPayload.key, encryptedPayload.iv, encryptedPayload.sha256),
        'Falha de integridade do anexo: hash SHA-256 divergente',
        'Must reject tampered ciphertext before decryption'
      );
    });

    await test('Tamper resistance: Incorrect key or IV fails decryption', async () => {
      const wrongKey = uint8ArrayToBase64(new Uint8Array(32).fill(7));
      const validDigest = await computeSha256Hex(encryptedPayload.ciphertext);

      await assertRejects(
        () => decryptAttachmentData(encryptedPayload.ciphertext, wrongKey, encryptedPayload.iv, validDigest),
        undefined,
        'Decryption with wrong key must fail WebCrypto auth tag check'
      );
    });
  });

  // --------------------------------------------------------------------------
  // SUITE 4: PURE MESSAGECODEC DECOUPLING & UNDECRYPTABLE FALLBACK
  // --------------------------------------------------------------------------
  await suite('Suite 4: Pure MessageCodec Decoupling & Undecryptable Fallback', async () => {
    const codec = new MessageCodec();

    await test('Decoding plaintext message produces plaintext status without errors', async () => {
      const raw = {
        id: 'msg-plain-1',
        content: 'Unencrypted normal message',
        encrypted: false,
      };
      const result = await codec.decodeMessage(raw);
      assertEqual(result.id, 'msg-plain-1', 'Message ID matches');
      assertEqual(result.content, 'Unencrypted normal message', 'Content matches');
      assertEqual(result.decryptionStatus, 'plaintext', 'Status is plaintext');
      assert(!result.encrypted, 'encrypted is false');
    });

    await test('Decoding encrypted message with missing key returns isolated placeholder without throwing', async () => {
      const rawEncrypted = {
        id: 'msg-missing-key-1',
        content: '',
        encrypted: true,
        e2ee_ciphertext: 'bogus-ciphertext-base64',
        e2ee_meta: {
          v: 1,
          alg: 'm.megolm.v1.aes-sha2',
          session_id: 'unknown-session-uuid-999',
          sender_device_id: 'dev-unknown',
          msg_index: 0,
          epoch: 1,
          ciphertext_hash: 'hash-abc',
        },
      };

      // Must NOT throw
      const result = await codec.decodeMessage(rawEncrypted);
      assertEqual(result.id, 'msg-missing-key-1', 'ID matches');
      assertEqual(result.content, 'Mensagem criptografada indisponível', 'Shows standardized placeholder');
      assertEqual(result.decryptionStatus, 'undecryptable', 'Status is undecryptable');
      assert(Boolean(result.isUndecryptablePlaceholder), 'isUndecryptablePlaceholder is true');
    });

    await test('Encoding message with outbound Megolm session succeeds and produces valid payload', async () => {
      const convId = 'conv-codec-encode-test';
      const encoded = await codec.encodeMessage({
        conversationId: convId,
        conversationType: 'dm',
        currentEpoch: 1,
        envelope: { v: 1, body: 'Message encoded through pure MessageCodec' },
        senderDeviceId: 'dev-codec-1',
      });

      assert(encoded.encrypted, 'Must be marked encrypted');
      assert(Boolean(encoded.e2ee_ciphertext), 'Must produce ciphertext');
      assertEqual(encoded.e2ee_meta.alg, 'm.megolm.v1.aes-sha2', 'Algorithm matches');
      assertEqual(encoded.e2ee_meta.sender_device_id, 'dev-codec-1', 'Sender device matches');
      assertEqual(encoded.content, '', 'Transport content must be blank');
    });

    await test('Unread count decoupling: Store increments unread count synchronously before async decode', () => {
      const dmRoomId = 'room-unread-test';
      const rawMsg: any = {
        id: 'msg-async-unread-1',
        dm_room_id: dmRoomId,
        author_id: 'user-other',
        content: '',
        encrypted: true,
        e2ee_ciphertext: 'some-ciphertext',
        e2ee_meta: {
          v: 1,
          alg: 'm.megolm.v1.aes-sha2',
          session_id: 'unknown-sess',
          sender_device_id: 'dev-other',
          msg_index: 0,
          epoch: 1,
          ciphertext_hash: 'hash-xyz',
        },
      };

      // Ensure store starts clean for this room
      const initialCount = useDMStore.getState().roomUnreadCounts[dmRoomId] || 0;

      // When message arrives via socket handler, store must immediately increment count
      useDMStore.getState().addMessage(rawMsg);

      const afterCount = useDMStore.getState().roomUnreadCounts[dmRoomId] || 0;
      assertEqual(afterCount, initialCount + 1, 'Unread count must increment immediately without awaiting decryption');
    });
  });

  // --------------------------------------------------------------------------
  // SUITE 5: KEY REQUEST PROTOCOL & DEDUPLICATION
  // --------------------------------------------------------------------------
  await suite('Suite 5: Key Request Protocol & Deduplication', async () => {
    const manager = new KeyRequestManager();
    const convId = 'conv-keyreq-test';
    const sessId = 'sess-missing-key-1';

    await test('First key_request is transmitted to-device', async () => {
      sentToDeviceMessages.length = 0;
      const sent = await manager.queueKeyRequest({
        conversationId: convId,
        conversationType: 'dm',
        sessionId: sessId,
        epoch: 1,
        senderDeviceId: 'dev-peer-alice',
        requesterDeviceId: 'dev-my-client',
      });

      assert(sent, 'First key request must be transmitted');
      assertEqual(sentToDeviceMessages.length, 1, '1 to-device message queued');
      const payload = JSON.parse(sentToDeviceMessages[0].payload);
      assertEqual(payload.msg_type, 'key_request', 'msg_type must be key_request');
      assertEqual(payload.session_id, sessId, 'session_id matches');
    });

    await test('Deduplication: Duplicate request for same session within 30s TTL is skipped', async () => {
      const sentSecond = await manager.queueKeyRequest({
        conversationId: convId,
        conversationType: 'dm',
        sessionId: sessId,
        epoch: 1,
        senderDeviceId: 'dev-peer-alice',
        requesterDeviceId: 'dev-my-client',
      });

      assert(!sentSecond, 'Second immediate request must be deduplicated (returns false)');
    });

    await test('Global rate limiting: Enforcing max 10 requests per minute', async () => {
      // Send 9 more requests with distinct session IDs
      for (let i = 0; i < 9; i++) {
        await manager.queueKeyRequest({
          conversationId: convId,
          conversationType: 'dm',
          sessionId: `sess-distinct-${i}`,
          epoch: 1,
          senderDeviceId: 'dev-peer-alice',
        });
      }

      // 11th request across the window must be rate-limited
      const rateLimited = await manager.queueKeyRequest({
        conversationId: convId,
        conversationType: 'dm',
        sessionId: 'sess-should-rate-limit',
        epoch: 1,
        senderDeviceId: 'dev-peer-alice',
      });

      assert(!rateLimited, 'Request exceeding 10/min must be dropped by rate limiter');
    });

    await test('Receiving room_key resolves pending request and triggers retroactive decrypt callback', async () => {
      let notifiedConv = '';
      let notifiedSess = '';

      const unsubscribe = manager.onSessionImported((cId, sId) => {
        notifiedConv = cId;
        notifiedSess = sId;
      });

      // Simulate incoming room_key from Alice
      const roomKeyPayload: RoomKeyToDevicePayload = {
        msg_type: 'room_key',
        conversation_type: 'dm',
        conversation_id: convId,
        session_id: sessId,
        session_key: new GroupSession().sessionKey(),
        epoch: 1,
        sender_device_id: 'dev-peer-alice',
      };

      const handled = await manager.handleRoomKeyReceived(roomKeyPayload);
      assert(handled, 'handleRoomKeyReceived should succeed');
      assertEqual(notifiedConv, convId, 'Retroactive listener must receive conversation ID');
      assertEqual(notifiedSess, sessId, 'Retroactive listener must receive session ID');

      unsubscribe();
    });
  });

  // --------------------------------------------------------------------------
  // SUITE 6: 15-MEMBER CAP & HISTORY ISOLATION
  // --------------------------------------------------------------------------
  await suite('Suite 6: 15-Member Cap & History Isolation', async () => {
    await test('Create group with > 14 friends throws 15-member cap error', async () => {
      const fifteenFriends = Array.from({ length: 15 }, (_, i) => `friend-${i + 1}`);

      await assertRejects(
        () => useDMGroupStore.getState().createGroup('Overloaded Group', fifteenFriends),
        '15 membros',
        'Must reject creating a group with > 14 friends (total > 15)'
      );
    });

    await test('Add members exceeding total 15 members throws cap error', async () => {
      // Mock active group with 10 existing members
      const mockGroup: any = {
        id: 'group-cap-test',
        name: 'Cap Test Group',
        members: Array.from({ length: 10 }, (_, i) => ({ id: `u-${i}` })),
        e2ee_enabled: true,
        rotation_epoch: 1,
      };

      useDMGroupStore.setState({
        groups: [mockGroup],
        activeGroup: mockGroup,
      });

      // Trying to add 6 members (10 + 6 = 16 > 15) must throw
      const sixNewMembers = Array.from({ length: 6 }, (_, i) => `new-user-${i}`);

      await assertRejects(
        () => useDMGroupStore.getState().addMembers('group-cap-test', sixNewMembers),
        '15 membros',
        'Must reject adding members when total exceeds 15'
      );
    });

    await test('History isolation: Adding member to E2EE group invalidates outbound session', async () => {
      const groupId = 'group-history-isolation-test';
      const mockGroup: any = {
        id: groupId,
        name: 'History Isolation Group',
        members: [{ id: 'u-1' }, { id: 'u-2' }],
        e2ee_enabled: true,
        rotation_epoch: 1,
      };

      useDMGroupStore.setState({
        groups: [mockGroup],
        activeGroup: mockGroup,
      });

      // 1. Establish an initial outbound session for this group
      const sess1 = await megolmManager.getOrCreateOutboundSession(groupId, 1);
      const initialSessionId = sess1.session.sessionId();

      // Mock backend addMembers response
      (api.dmGroups as any).addMembers = async () => [
        { id: 'u-1' },
        { id: 'u-2' },
        { id: 'u-3' }, // New member added
      ];

      // 2. Add member — this triggers history isolation: megolmManager.invalidateOutboundSession
      await useDMGroupStore.getState().addMembers(groupId, ['u-3']);

      // 3. Next outbound session generation must produce a completely fresh session
      const sess2 = await megolmManager.getOrCreateOutboundSession(groupId, 1);
      assert(sess2.isNew, 'Subsequent session must be fresh');
      assert(sess2.session.sessionId() !== initialSessionId, 'Session ID must change for history isolation');
    });
  });

  // --------------------------------------------------------------------------
  // SUMMARY REPORT
  // --------------------------------------------------------------------------
  console.log(`\n${BOLD}${CYAN}============================================================${RESET}`);
  console.log(`${BOLD}SUMMARY REPORT${RESET}`);
  console.log(`${BOLD}${CYAN}============================================================${RESET}`);

  let totalTests = 0;
  let totalPassed = 0;
  let totalFailed = 0;

  for (const s of suiteResults) {
    console.log(`\n${BOLD}${s.name}:${RESET}`);
    for (const t of s.tests) {
      totalTests++;
      if (t.passed) {
        totalPassed++;
        console.log(`  ${GREEN}✓${RESET} ${t.name} ${CYAN}(${t.durationMs.toFixed(1)}ms)${RESET}`);
      } else {
        totalFailed++;
        console.log(`  ${RED}✗${RESET} ${t.name}`);
        console.log(`    ${RED}Failure: ${t.error}${RESET}`);
      }
    }
  }

  console.log(`\n${BOLD}Total:${RESET} ${totalTests} | ${GREEN}Passed:${RESET} ${totalPassed} | ${RED}Failed:${RESET} ${totalFailed}`);
  if (totalFailed > 0) {
    console.log(`\n${RED}${BOLD}VERIFICATION FAILED${RESET}`);
    process.exit(1);
  } else {
    console.log(`\n${GREEN}${BOLD}ALL TESTS PASSED (100% SUCCESS RATE)${RESET}\n`);
    process.exit(0);
  }
}

runM3VerificationSuite().catch((err) => {
  console.error(`${RED}Fatal runner error:${RESET}`, err);
  process.exit(1);
});
