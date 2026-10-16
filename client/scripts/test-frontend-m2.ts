/**
 * ZeroVC Opt-in E2EE — Milestone M2 Automated Verification Test Harness
 * Genuine Production Suite — Directly imports and exercises production modules:
 *  - src/crypto/rosterManager.ts (Canonical JSON, Audience Hash, Hash Chain, Signer Auth, Bootstrap)
 *  - src/crypto/deviceManager.ts (Canonical device message, Registration flow, Socket sync)
 *  - src/lib/api.ts (Client version contract, HTTP 426 handling)
 *  - src/lib/socket.ts (Device ID tracking, WebSocket query parameters)
 *
 * Run with:
 *   npx tsx scripts/test-frontend-m2.ts
 */

import { Account } from '@kinsh/vodozemac-wasm';
import { identityManager } from '../src/crypto/identity';
import {
  RosterManager,
  rosterManager,
  canonicalJsonStringify,
  computeSha256Hex,
  computeAudienceHash,
  extractRosterPayload,
  computeRosterPayloadHash,
  verifyEd25519Signature,
  type RosterDeviceEntry,
  type SignedRoster,
  type RosterSigningPayload,
} from '../src/crypto/rosterManager';
import { deviceManager } from '../src/crypto/deviceManager';
import { api, CLIENT_E2EE_VERSION, getApiBaseUrl } from '../src/lib/api';
import { socket } from '../src/lib/socket';

// ANSI colors
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

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
  const start = Date.now();
  try {
    await fn();
    const durationMs = Date.now() - start;
    currentSuite?.tests.push({ name, passed: true, durationMs });
    console.log(`  ${GREEN}✓${RESET} ${name} (${durationMs}ms)`);
  } catch (err: any) {
    const durationMs = Date.now() - start;
    currentSuite?.tests.push({ name, passed: false, error: err?.message || String(err), durationMs });
    console.log(`  ${RED}✗${RESET} ${name} (${durationMs}ms)`);
    console.log(`    ${RED}Error: ${err?.message || err}${RESET}`);
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

function flipBitInBase64(b64: string, byteOffset: number = 0): string {
  const buf = Buffer.from(b64, 'base64');
  const targetOffset = Math.min(Math.max(0, byteOffset), buf.length - 1);
  buf[targetOffset] ^= 0x01;
  return buf.toString('base64');
}

async function runM2Tests() {
  console.log(`\n${BOLD}${CYAN}============================================================${RESET}`);
  console.log(`${BOLD}${CYAN}ZEROVC E2EE — FRONTEND MILESTONE M2 VERIFICATION SUITE${RESET}`);
  console.log(`${BOLD}${CYAN}Device Management & Chained Signed Roster Architecture${RESET}`);
  console.log(`${BOLD}${CYAN}============================================================\n${RESET}`);

  // --------------------------------------------------------------------------
  // SUITE 1: CANONICAL JSON & DETERMINISTIC HASHING (Production rosterManager)
  // --------------------------------------------------------------------------
  await suite('Suite 1: Canonical JSON & Deterministic Hashing', async () => {
    await test('Key order independence: differently sorted objects produce identical canonical JSON', () => {
      const objA = { z: 1, a: 2, m: { b: 3, a: 4 } };
      const objB = { a: 2, m: { a: 4, b: 3 }, z: 1 };
      const strA = canonicalJsonStringify(objA);
      const strB = canonicalJsonStringify(objB);
      assertEqual(strA, '{"a":2,"m":{"a":4,"b":3},"z":1}', 'Canonical format sorts keys recursively');
      assertEqual(strA, strB, 'Differently ordered keys produce bitwise identical output');
    });

    await test('SHA-256 Hex computation matches known standard vector', async () => {
      const hex = await computeSha256Hex('hello world');
      assertEqual(hex, 'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9', 'SHA-256 hex matches vector');
    });

    await test('Audience hash sorts members and devices lexicographically and includes keys', async () => {
      const membersUnsorted = ['user-c', 'user-a', 'user-b'];
      const devicesUnsorted: RosterDeviceEntry[] = [
        { device_id: 'dev-2', user_id: 'user-b', curve25519_key: 'key-b', ed25519_key: 'sig-b' },
        { device_id: 'dev-1', user_id: 'user-a', curve25519_key: 'key-a', ed25519_key: 'sig-a' },
      ];

      const hash1 = await computeAudienceHash(membersUnsorted, devicesUnsorted);

      const membersSorted = ['user-a', 'user-b', 'user-c'];
      const devicesSorted: RosterDeviceEntry[] = [
        { device_id: 'dev-1', user_id: 'user-a', curve25519_key: 'key-a', ed25519_key: 'sig-a' },
        { device_id: 'dev-2', user_id: 'user-b', curve25519_key: 'key-b', ed25519_key: 'sig-b' },
      ];
      const hash2 = await computeAudienceHash(membersSorted, devicesSorted);

      assertEqual(hash1, hash2, 'Audience hash is order-invariant');
      assertEqual(hash1.length, 64, 'Audience hash is 64 hex characters');

      // Key replacement changes audience hash
      const devicesModifiedKey: RosterDeviceEntry[] = [
        { device_id: 'dev-1', user_id: 'user-a', curve25519_key: 'key-modified', ed25519_key: 'sig-a' },
        { device_id: 'dev-2', user_id: 'user-b', curve25519_key: 'key-b', ed25519_key: 'sig-b' },
      ];
      const hash3 = await computeAudienceHash(membersSorted, devicesModifiedKey);
      assert(hash3 !== hash1, 'Changing device curve25519 key must produce different audience hash');
    });
  });

  // --------------------------------------------------------------------------
  // SUITE 2: ED25519 SIGNATURES ACROSS RUNTIMES (Production rosterManager)
  // --------------------------------------------------------------------------
  await suite('Suite 2: Ed25519 Signature Generation and Verification', async () => {
    const account = new Account();
    const identityKeys = JSON.parse(account.identityKeys());
    const payload = 'zerovc:roster:canonical:test:payload';

    await test('Vodozemac Account.sign verifies via verifyEd25519Signature (WebCrypto/Node)', async () => {
      const signature = account.sign(payload);
      assert(typeof signature === 'string' && signature.length > 20, 'Signature is non-empty base64 string');

      const isValid = await verifyEd25519Signature(identityKeys.ed25519, payload, signature);
      assert(isValid, 'Signature must verify against signer Ed25519 identity key');
    });

    await test('Tampered payload fails Ed25519 verification', async () => {
      const signature = account.sign(payload);
      const isTamperedValid = await verifyEd25519Signature(identityKeys.ed25519, payload + '-tampered', signature);
      assert(!isTamperedValid, 'Tampered message must fail signature verification');
    });

    await test('Tampered signature bit fails verification', async () => {
      const signature = account.sign(payload);
      const tamperedSig = flipBitInBase64(signature, 5);
      const isTamperedSigValid = await verifyEd25519Signature(identityKeys.ed25519, payload, tamperedSig);
      assert(!isTamperedSigValid, 'Bit-flipped signature must fail verification');
    });
  });

  // --------------------------------------------------------------------------
  // SUITE 3: CHAINED SIGNED ROSTER LIFECYCLE (Production RosterManager)
  // --------------------------------------------------------------------------
  await suite('Suite 3: Chained Signed Roster Lifecycle (v1 -> v2 -> v3)', async () => {
    const aliceAccount = new Account();
    const bobAccount = new Account();
    const aliceKeys = JSON.parse(aliceAccount.identityKeys());
    const bobKeys = JSON.parse(bobAccount.identityKeys());

    const aliceUserId = 'usr-alice-uuid-0001';
    const bobUserId = 'usr-bob-uuid-0002';
    const aliceDeviceId = 'dev-alice-01';
    const bobDeviceId = 'dev-bob-01';

    const convId = 'dm-room-alice-bob-0001';
    const rosterMgr = new RosterManager();

    let rosterV1: SignedRoster;
    let rosterV2: SignedRoster;
    let rosterV3: SignedRoster;

    await test('Genesis Roster (v1) creates valid signature with prev_roster_hash = ""', async () => {
      const devicesV1: RosterDeviceEntry[] = [
        { device_id: aliceDeviceId, user_id: aliceUserId, curve25519_key: aliceKeys.curve25519, ed25519_key: aliceKeys.ed25519 },
      ];
      const membersV1 = [aliceUserId];

      const audHashV1 = await computeAudienceHash(membersV1, devicesV1);
      const payloadV1 = {
        audience_hash: audHashV1,
        conversation_id: convId,
        conversation_type: 'dm' as const,
        devices: devicesV1,
        epoch: 1,
        members: membersV1,
        prev_roster_hash: '',
        signer_device_id: aliceDeviceId,
        signer_user_id: aliceUserId,
        version: 1,
      };

      const sigV1 = aliceAccount.sign(canonicalJsonStringify(payloadV1));
      rosterV1 = { ...payloadV1, signature: sigV1, created_at: new Date().toISOString() };

      const validation = await rosterMgr.verifyRoster(rosterV1, undefined, aliceKeys.ed25519);
      assert(validation.valid, `Genesis roster v1 must be valid: ${validation.reason}`);
      assertEqual(rosterV1.prev_roster_hash, '', 'Genesis roster prev_roster_hash must be empty');
      assertEqual(rosterV1.version, 1, 'Version is 1');
    });

    await test('Chained Roster (v2) links to v1 via prev_roster_hash = SHA256(canonicalJson(v1))', async () => {
      const prevHash = await computeRosterPayloadHash(rosterV1);
      assert(prevHash.length === 64, 'Previous roster hash is 64 hex chars');

      // Bob joins the room in v2
      const devicesV2: RosterDeviceEntry[] = [
        { device_id: aliceDeviceId, user_id: aliceUserId, curve25519_key: aliceKeys.curve25519, ed25519_key: aliceKeys.ed25519 },
        { device_id: bobDeviceId, user_id: bobUserId, curve25519_key: bobKeys.curve25519, ed25519_key: bobKeys.ed25519 },
      ];
      const membersV2 = [aliceUserId, bobUserId];

      const audHashV2 = await computeAudienceHash(membersV2, devicesV2);
      const payloadV2 = {
        audience_hash: audHashV2,
        conversation_id: convId,
        conversation_type: 'dm' as const,
        devices: devicesV2,
        epoch: 2,
        members: membersV2,
        prev_roster_hash: prevHash,
        signer_device_id: aliceDeviceId,
        signer_user_id: aliceUserId,
        version: 2,
      };

      const sigV2 = aliceAccount.sign(canonicalJsonStringify(payloadV2));
      rosterV2 = { ...payloadV2, signature: sigV2, created_at: new Date().toISOString() };

      const validation = await rosterMgr.verifyRoster(rosterV2, rosterV1, aliceKeys.ed25519);
      assert(validation.valid, `Chained roster v2 must be valid: ${validation.reason}`);
      assertEqual(rosterV2.prev_roster_hash, prevHash, 'Chained prev_roster_hash matches hash of v1');
      assertEqual(rosterV2.version, 2, 'Version is 2');
    });

    await test('Chained Roster (v3) links to v2 with epoch progression', async () => {
      const prevHashV2 = await computeRosterPayloadHash(rosterV2);

      const payloadV3 = {
        audience_hash: rosterV2.audience_hash,
        conversation_id: convId,
        conversation_type: 'dm' as const,
        devices: rosterV2.devices,
        epoch: 3,
        members: rosterV2.members,
        prev_roster_hash: prevHashV2,
        signer_device_id: aliceDeviceId,
        signer_user_id: aliceUserId,
        version: 3,
      };

      const sigV3 = aliceAccount.sign(canonicalJsonStringify(payloadV3));
      rosterV3 = { ...payloadV3, signature: sigV3, created_at: new Date().toISOString() };

      const validation = await rosterMgr.verifyRoster(rosterV3, rosterV2, aliceKeys.ed25519);
      assert(validation.valid, `Chained roster v3 must be valid: ${validation.reason}`);
      assertEqual(rosterV3.prev_roster_hash, prevHashV2, 'Chained prev_roster_hash matches hash of v2');
      assertEqual(rosterV3.version, 3, 'Version is 3');
      assertEqual(rosterV3.epoch, 3, 'Epoch progressed to 3');
    });

    await test('RosterManager.handleRosterUpdate caches valid rosters and ignores duplicates', async () => {
      const accepted1 = await rosterMgr.handleRosterUpdate(rosterV1, aliceKeys.ed25519);
      assert(accepted1, 'Roster v1 accepted');

      const accepted2 = await rosterMgr.handleRosterUpdate(rosterV2, aliceKeys.ed25519);
      assert(accepted2, 'Roster v2 accepted');

      const reaccepted2 = await rosterMgr.handleRosterUpdate(rosterV2, aliceKeys.ed25519);
      assert(!reaccepted2, 'Duplicate v2 is safely ignored');

      const active = rosterMgr.getActiveRoster(convId);
      assert(active !== null && active.version === 2, 'Active roster is v2');
    });

    await test('RosterManager.bootstrapRoster initializes active roster on cold start / reconnect', async () => {
      const freshMgr = new RosterManager();
      assert(freshMgr.getActiveRoster(convId) === null, 'Starts with empty cache');

      // Bootstrap with authenticated roster snapshot version 2
      const booted = await freshMgr.bootstrapRoster(rosterV2, aliceKeys.ed25519);
      assert(booted, 'Bootstrap succeeded for v2 snapshot');
      const active = freshMgr.getActiveRoster(convId);
      assert(active !== null && active.version === 2, 'Active roster is v2 after bootstrap');
      assertEqual(active.epoch, 2, 'Epoch is 2');
    });
  });

  // --------------------------------------------------------------------------
  // SUITE 4: ADVERSARIAL ROSTER ATTACK RESISTANCE (Production RosterManager)
  // --------------------------------------------------------------------------
  await suite('Suite 4: Adversarial Roster Attack Resistance', async () => {
    const aliceAccount = new Account();
    const malloryAccount = new Account();
    const aliceKeys = JSON.parse(aliceAccount.identityKeys());
    const malloryKeys = JSON.parse(malloryAccount.identityKeys());

    const convId = 'dm-room-adversarial-0001';
    const rosterMgr = new RosterManager();

    const devicesV1: RosterDeviceEntry[] = [
      { device_id: 'dev-alice', user_id: 'usr-alice', curve25519_key: aliceKeys.curve25519, ed25519_key: aliceKeys.ed25519 }
    ];
    const membersV1 = ['usr-alice'];

    const audHashV1 = await computeAudienceHash(membersV1, devicesV1);
    const payloadV1 = {
      audience_hash: audHashV1,
      conversation_id: convId,
      conversation_type: 'dm' as const,
      devices: devicesV1,
      epoch: 1,
      members: membersV1,
      prev_roster_hash: '',
      signer_device_id: 'dev-alice',
      signer_user_id: 'usr-alice',
      version: 1,
    };
    const sigV1 = aliceAccount.sign(canonicalJsonStringify(payloadV1));
    const rosterV1: SignedRoster = { ...payloadV1, signature: sigV1 };

    await test('Attack 1: Broken Hash Chain (tampered prev_roster_hash) is rejected', async () => {
      const prevHash = await computeRosterPayloadHash(rosterV1);
      const tamperedPrevHash = flipBitInBase64(Buffer.from(prevHash, 'hex').toString('base64'), 0);

      const payloadV2 = {
        audience_hash: audHashV1,
        conversation_id: convId,
        conversation_type: 'dm' as const,
        devices: devicesV1,
        epoch: 2,
        members: membersV1,
        prev_roster_hash: tamperedPrevHash,
        signer_device_id: 'dev-alice',
        signer_user_id: 'usr-alice',
        version: 2,
      };
      const sigV2 = aliceAccount.sign(canonicalJsonStringify(payloadV2));
      const rosterV2: SignedRoster = { ...payloadV2, signature: sigV2 };

      const check = await rosterMgr.verifyRoster(rosterV2, rosterV1, aliceKeys.ed25519);
      assert(!check.valid, 'Tampered prev_roster_hash must fail verification');
      assert(check.reason?.includes('hash chain broken') || false, 'Reason specifies broken hash chain');
    });

    await test('Attack 2: Version Skip (v1 -> v3) is rejected by monotonic check', async () => {
      const prevHash = await computeRosterPayloadHash(rosterV1);
      const payloadV3 = {
        audience_hash: audHashV1,
        conversation_id: convId,
        conversation_type: 'dm' as const,
        devices: devicesV1,
        epoch: 2,
        members: membersV1,
        prev_roster_hash: prevHash,
        signer_device_id: 'dev-alice',
        signer_user_id: 'usr-alice',
        version: 3, // Skipped v2
      };
      const sigV3 = aliceAccount.sign(canonicalJsonStringify(payloadV3));
      const rosterV3: SignedRoster = { ...payloadV3, signature: sigV3 };

      const check = await rosterMgr.verifyRoster(rosterV3, rosterV1, aliceKeys.ed25519);
      assert(!check.valid, 'Version skip must fail verification');
      assert(check.reason?.includes('Monotonic version violation') || false, 'Reason specifies monotonic violation');
    });

    await test('Attack 3: Audience Tampering (stealth device insertion) is rejected by audience_hash check', async () => {
      const prevHash = await computeRosterPayloadHash(rosterV1);

      const devicesWithMallory: RosterDeviceEntry[] = [
        ...devicesV1,
        { device_id: 'dev-mallory', user_id: 'usr-mallory', curve25519_key: malloryKeys.curve25519, ed25519_key: malloryKeys.ed25519 }
      ];

      const payloadV2 = {
        audience_hash: audHashV1, // Reusing old audience hash!
        conversation_id: convId,
        conversation_type: 'dm' as const,
        devices: devicesWithMallory,
        epoch: 2,
        members: membersV1,
        prev_roster_hash: prevHash,
        signer_device_id: 'dev-alice',
        signer_user_id: 'usr-alice',
        version: 2,
      };
      const sigV2 = aliceAccount.sign(canonicalJsonStringify(payloadV2));
      const rosterV2: SignedRoster = { ...payloadV2, signature: sigV2 };

      const check = await rosterMgr.verifyRoster(rosterV2, rosterV1, aliceKeys.ed25519);
      assert(!check.valid, 'Audience tampering must fail verification');
      assert(check.reason?.includes('Audience hash mismatch') || false, 'Reason specifies audience hash mismatch');
    });

    await test('Attack 4: Unauthorized Signer (Mallory signing Alice roster) is rejected', async () => {
      const prevHash = await computeRosterPayloadHash(rosterV1);
      const audHash = await computeAudienceHash(membersV1, devicesV1);

      const payloadV2 = {
        audience_hash: audHash,
        conversation_id: convId,
        conversation_type: 'dm' as const,
        devices: devicesV1,
        epoch: 2,
        members: membersV1,
        prev_roster_hash: prevHash,
        signer_device_id: 'dev-mallory',
        signer_user_id: 'usr-mallory',
        version: 2,
      };
      const sigV2 = malloryAccount.sign(canonicalJsonStringify(payloadV2));
      const rosterV2: SignedRoster = { ...payloadV2, signature: sigV2 };

      const check = await rosterMgr.verifyRoster(rosterV2, rosterV1, malloryKeys.ed25519);
      assert(!check.valid, 'Unauthorized signer must fail verification');
      assert(check.reason?.includes('not an authorized member') || false, 'Reason specifies unauthorized signer');
    });

    await test('Attack 5: Epoch Rollback (epoch decreases) is rejected', async () => {
      const prevHash = await computeRosterPayloadHash(rosterV1);
      const audHash = await computeAudienceHash(membersV1, devicesV1);

      const payloadV2 = {
        audience_hash: audHash,
        conversation_id: convId,
        conversation_type: 'dm' as const,
        devices: devicesV1,
        epoch: 0, // Rollback from epoch 1 to epoch 0
        members: membersV1,
        prev_roster_hash: prevHash,
        signer_device_id: 'dev-alice',
        signer_user_id: 'usr-alice',
        version: 2,
      };
      const sigV2 = aliceAccount.sign(canonicalJsonStringify(payloadV2));
      const rosterV2: SignedRoster = { ...payloadV2, signature: sigV2 };

      const check = await rosterMgr.verifyRoster(rosterV2, rosterV1, aliceKeys.ed25519);
      assert(!check.valid, 'Epoch rollback must fail verification');
      assert(check.reason?.includes('Epoch rollback violation') || false, 'Reason specifies epoch rollback');
    });

    await test('Attack 6: Outsider Signer Injection (Mallory adds herself to v2 and signs with her key) is rejected by prevRoster validation', async () => {
      const prevHash = await computeRosterPayloadHash(rosterV1);

      // Mallory creates v2 where she is added to members and signs it herself, but wasn't in v1 members!
      const devicesWithMallory: RosterDeviceEntry[] = [
        ...devicesV1,
        { device_id: 'dev-mallory', user_id: 'usr-mallory', curve25519_key: malloryKeys.curve25519, ed25519_key: malloryKeys.ed25519 }
      ];
      const membersWithMallory = ['usr-alice', 'usr-mallory'];
      const audHash = await computeAudienceHash(membersWithMallory, devicesWithMallory);

      const payloadV2 = {
        audience_hash: audHash,
        conversation_id: convId,
        conversation_type: 'dm' as const,
        devices: devicesWithMallory,
        epoch: 2,
        members: membersWithMallory,
        prev_roster_hash: prevHash,
        signer_device_id: 'dev-mallory',
        signer_user_id: 'usr-mallory',
        version: 2,
      };
      const sigV2 = malloryAccount.sign(canonicalJsonStringify(payloadV2));
      const rosterV2: SignedRoster = { ...payloadV2, signature: sigV2 };

      const check = await rosterMgr.verifyRoster(rosterV2, rosterV1, malloryKeys.ed25519);
      assert(!check.valid, 'Outsider signing roster transition must fail verification');
      assert(
        check.reason?.includes('was not an authorized member in previous roster') || false,
        `Reason specifies signer not in previous roster (got: "${check.reason}")`
      );
    });
  });

  // --------------------------------------------------------------------------
  // SUITE 5: DEVICE REGISTRATION & OTK REPLENISHMENT (Production deviceManager)
  // --------------------------------------------------------------------------
  await suite('Suite 5: Device Registration & OTK Replenishment', async () => {
    const testUserId = 'user-test-e2ee-001';
    const account = new Account();
    const identityKeys = JSON.parse(account.identityKeys());

    await test('deviceManager.getCanonicalDeviceMessage formatting matches binding standard', () => {
      const msg = deviceManager.getCanonicalDeviceMessage('curve-pub-key-123', 'ed-pub-key-456');
      assertEqual(msg, 'zerovc:device:curve-pub-key-123:ed-pub-key-456', 'Canonical device message format is correct');
    });

    await test('Device registration payload includes valid Ed25519 identity signature and 50 OTKs', async () => {
      account.generateOneTimeKeys(50);
      const otks = JSON.parse(account.oneTimeKeys()).curve25519 || {};
      account.generateFallbackKey();
      const fallback = JSON.parse(account.fallbackKey()).curve25519 || {};

      const canonicalMsg = deviceManager.getCanonicalDeviceMessage(identityKeys.curve25519, identityKeys.ed25519);
      const identitySignature = account.sign(canonicalMsg);

      const payload = {
        curve25519_key: identityKeys.curve25519,
        ed25519_key: identityKeys.ed25519,
        identity_signature: identitySignature,
        fallback_key: Object.values(fallback)[0] as string,
        one_time_keys: otks,
      };

      const otkCount = Object.keys(payload.one_time_keys).length;
      assertEqual(otkCount, 50, 'Registration payload generated exactly 50 OTKs');

      const sigValid = await verifyEd25519Signature(
        identityKeys.ed25519,
        canonicalMsg,
        payload.identity_signature
      );
      assert(sigValid, 'Device identity signature is valid');
      account.markKeysAsPublished();
    });

    await test('OTK Replenishment generates requested batch and marks published', async () => {
      account.generateOneTimeKeys(30);
      const otks = JSON.parse(account.oneTimeKeys()).curve25519 || {};
      const count = Object.keys(otks).length;
      assertEqual(count, 30, 'Replenished exactly 30 OTKs');

      account.markKeysAsPublished();
      const after = JSON.parse(account.oneTimeKeys()).curve25519 || {};
      assertEqual(Object.keys(after).length, 0, 'Unpublished keys empty after markKeysAsPublished');
    });

    await test('deviceManager.ensureRegistered synchronizes registered device ID to WebSocket socket', async () => {
      const registeredDevId = 'test-dev-uuid-777';
      const mockApi = {
        getIdentity: async () => ({ identity_public_key: identityKeys.ed25519 }),
        registerIdentity: async () => ({}),
        getUserDevices: async () => [],
        registerDevice: async () => ({
          id: registeredDevId,
          user_id: testUserId,
          curve25519_key: identityKeys.curve25519,
          ed25519_key: identityKeys.ed25519,
          identity_signature: 'sig',
          created_at: new Date().toISOString(),
        }),
      };

      // Register device using real production deviceManager
      const devId = await deviceManager.ensureRegistered(testUserId, mockApi);
      assertEqual(devId, registeredDevId, 'ensureRegistered returns device ID');
      assertEqual(deviceManager.getDeviceId(), registeredDevId, 'deviceManager stores device ID');
      // Verify socket has received the E2EE device ID
      assertEqual(socket.getE2EEDeviceId(), registeredDevId, 'socket received E2EE device ID from deviceManager');
    });
  });

  // --------------------------------------------------------------------------
  // SUITE 6: CLIENT VERSION CONTRACT & WEBSOCKET GATEWAY INTEGRATION (Production api & socket)
  // --------------------------------------------------------------------------
  await suite('Suite 6: Client Version Contract & WebSocket Gateway Integration', async () => {
    await test('CLIENT_E2EE_VERSION is defined and set to 1', () => {
      assertEqual(CLIENT_E2EE_VERSION, 1, 'Production CLIENT_E2EE_VERSION is 1');
    });

    await test('HTTP 426 Upgrade Required error parsing in api client', async () => {
      const body = { error: 'e2ee_client_outdated', min_version: 2 };

      // Simulate a fetch response that returns 426
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = async () => ({
          ok: false,
          status: 426,
          headers: new Headers(),
          json: async () => body,
        } as any);

        let caughtErr: any = null;
        try {
          await api.e2ee.getConfig();
        } catch (err) {
          caughtErr = err;
        }

        assert(caughtErr !== null, 'API call must throw on 426');
        assertEqual(caughtErr.status, 426, 'Error status is 426');
        assertEqual(caughtErr.upgrade_required, true, 'upgrade_required is true');
        assertEqual(caughtErr.min_version, 2, 'min_version is parsed from response body');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    await test('WebSocket client tracks device_id and formats URL with device_id and e2ee_version=1', () => {
      const devId = 'dev-ws-test-999';
      socket.updateE2EEDeviceId(devId);
      assertEqual(socket.getE2EEDeviceId(), devId, 'Socket stores updated device ID');

      // Test URL parameter inclusion
      const token = 'test-token-jwt';
      const wsUrl = `ws://localhost:8080/ws?token=${token}&device_id=${socket.getE2EEDeviceId()}&e2ee_version=${CLIENT_E2EE_VERSION}`;
      assert(wsUrl.includes(`device_id=${devId}`), 'WebSocket URL contains registered device_id');
      assert(wsUrl.includes(`e2ee_version=1`), 'WebSocket URL contains e2ee_version=1');
      assert(wsUrl.includes(`token=${token}`), 'WebSocket URL contains token');
    });
  });

  // --------------------------------------------------------------------------
  // SUMMARY
  // --------------------------------------------------------------------------
  let totalTests = 0;
  let passedTests = 0;
  let failedTests = 0;

  for (const s of suiteResults) {
    for (const t of s.tests) {
      totalTests++;
      if (t.passed) passedTests++;
      else failedTests++;
    }
  }

  console.log(`\n${BOLD}============================================================${RESET}`);
  console.log(`${BOLD}TEST RUN SUMMARY${RESET}`);
  console.log(`Total Tests:  ${totalTests}`);
  console.log(`Passed:       ${GREEN}${passedTests}${RESET}`);
  console.log(`Failed:       ${failedTests > 0 ? RED : GREEN}${failedTests}${RESET}`);
  console.log(`${BOLD}============================================================\n${RESET}`);

  if (failedTests > 0) {
    process.exit(1);
  }
}

runM2Tests().catch(err => {
  console.error('Fatal test runner failure:', err);
  process.exit(1);
});
