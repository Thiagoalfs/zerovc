/**
 * ZeroVC Opt-in E2EE — Milestone M2 Empirical Adversarial Challenge Suite
 * Challenger M2.1 (Empirical Challenger)
 *
 * Directly imports and stress-tests:
 *  - src/crypto/rosterManager.ts (RosterManager, verifyEd25519Signature, computeAudienceHash, computeRosterPayloadHash, canonicalJsonStringify)
 *  - src/crypto/deviceManager.ts (DeviceManager)
 *
 * Adversarial Attack Vectors:
 *  1. Broken hash chain (tampered prev_roster_hash, non-empty genesis hash, empty chained hash, all-zeros hash)
 *  2. Version skip & monotonicity (v1->v3, v1->v100, v2->v1 rollback, v2->v2 replay, v0, negative, float)
 *  3. Stealth device injection & audience tampering (unannounced device, rogue device with non-member user, key replacement)
 *  4. Unauthorized signer (Mallory signing Alice roster, outsider signing roster, mismatched device/user)
 *  5. Epoch rollback & sanity (epoch decrease, negative epoch, float epoch)
 *  6. Bit-flip signature & payload tampering (bit flips across signature bytes 0, 15, 31, 63, malformed encoding, payload mutation)
 *  7. Device registration canonical binding & attack resistance (bit flip in device sig, cross-user binding)
 *
 * Run with:
 *   npx tsx scripts/challenger-m2-adversarial.ts
 */

import { Account } from '@kinsh/vodozemac-wasm';
import * as crypto from 'crypto';
import {
  RosterManager,
  verifyEd25519Signature,
  computeAudienceHash,
  computeRosterPayloadHash,
  canonicalJsonStringify,
  extractRosterPayload,
  SignedRoster,
  RosterDeviceEntry,
} from '../src/crypto/rosterManager';
import { DeviceManager } from '../src/crypto/deviceManager';

// ANSI colors
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

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
    const duration = performance.now() - start;
    currentSuite?.tests.push({ name, passed: true, durationMs: duration });
    console.log(`  ${GREEN}✓${RESET} ${name} ${CYAN}(${duration.toFixed(1)}ms)${RESET}`);
  } catch (err: any) {
    const duration = performance.now() - start;
    const errorMsg = err?.message || String(err);
    currentSuite?.tests.push({ name, passed: false, error: errorMsg, durationMs: duration });
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

function flipBitInBase64(b64: string, byteOffset: number): string {
  const buf = Buffer.from(b64, 'base64');
  const targetOffset = Math.min(Math.max(0, byteOffset), buf.length - 1);
  buf[targetOffset] ^= 0x01;
  return buf.toString('base64');
}

function flipBitInHex(hexStr: string, charOffset: number): string {
  const chars = hexStr.split('');
  const idx = Math.min(Math.max(0, charOffset), chars.length - 1);
  const currentVal = parseInt(chars[idx], 16);
  const flipped = (currentVal ^ 1).toString(16);
  chars[idx] = flipped;
  return chars.join('');
}

async function runAdversarialHarness() {
  console.log(`\n${BOLD}${CYAN}============================================================${RESET}`);
  console.log(`${BOLD}${CYAN}ZEROVC E2EE — EMPIRICAL ADVERSARIAL CHALLENGE HARNESS (M2)${RESET}`);
  console.log(`Challenger M2.1: Signed Rosters & Device Registration Attacks`);
  console.log(`${BOLD}${CYAN}============================================================\n${RESET}`);

  const aliceAccount = new Account();
  const bobAccount = new Account();
  const malloryAccount = new Account();

  const aliceKeys = JSON.parse(aliceAccount.identityKeys());
  const bobKeys = JSON.parse(bobAccount.identityKeys());
  const malloryKeys = JSON.parse(malloryAccount.identityKeys());

  const aliceUserId = 'usr-alice-uuid-0001';
  const bobUserId = 'usr-bob-uuid-0002';
  const malloryUserId = 'usr-mallory-uuid-6666';

  const aliceDeviceId = 'dev-alice-01';
  const bobDeviceId = 'dev-bob-01';
  const malloryDeviceId = 'dev-mallory-01';

  const convId = 'dm-room-adversarial-test-conv';
  const rosterMgr = new RosterManager();

  // Helper to construct a valid genesis roster
  const aliceDevEntry: RosterDeviceEntry = {
    device_id: aliceDeviceId,
    user_id: aliceUserId,
    curve25519_key: aliceKeys.curve25519,
    ed25519_key: aliceKeys.ed25519,
  };

  const bobDevEntry: RosterDeviceEntry = {
    device_id: bobDeviceId,
    user_id: bobUserId,
    curve25519_key: bobKeys.curve25519,
    ed25519_key: bobKeys.ed25519,
  };

  const malloryDevEntry: RosterDeviceEntry = {
    device_id: malloryDeviceId,
    user_id: malloryUserId,
    curve25519_key: malloryKeys.curve25519,
    ed25519_key: malloryKeys.ed25519,
  };

  // Genesis v1 signed by Alice
  const audHashV1 = await computeAudienceHash([aliceUserId], [aliceDevEntry]);
  const payloadV1 = {
    audience_hash: audHashV1,
    conversation_id: convId,
    conversation_type: 'dm' as const,
    devices: [aliceDevEntry],
    epoch: 1,
    members: [aliceUserId],
    prev_roster_hash: '',
    signer_device_id: aliceDeviceId,
    signer_user_id: aliceUserId,
    version: 1,
  };
  const sigV1 = aliceAccount.sign(canonicalJsonStringify(payloadV1));
  const validRosterV1: SignedRoster = {
    ...payloadV1,
    signature: sigV1,
    created_at: new Date().toISOString(),
  };

  // --------------------------------------------------------------------------
  // SUITE 1: BROKEN HASH CHAIN ATTACK VECTOR
  // --------------------------------------------------------------------------
  await suite('Suite 1: Broken Hash Chain Adversarial Attacks', async () => {
    await test('Attack 1.1: Genesis v1 with non-empty prev_roster_hash is rejected', async () => {
      const tamperedV1: SignedRoster = {
        ...payloadV1,
        prev_roster_hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        signature: '',
      };
      tamperedV1.signature = aliceAccount.sign(canonicalJsonStringify(extractRosterPayload(tamperedV1)));

      const check = await rosterMgr.verifyRoster(tamperedV1, undefined, aliceKeys.ed25519);
      assert(!check.valid, 'Genesis roster with non-empty prev_roster_hash must fail');
      assert(check.reason?.includes('empty prev_roster_hash') || false, `Expected empty prev hash error: ${check.reason}`);
    });

    await test('Attack 1.2: Chained v2 with empty prev_roster_hash is rejected', async () => {
      const audHashV2 = await computeAudienceHash([aliceUserId, bobUserId], [aliceDevEntry, bobDevEntry]);
      const payloadV2 = {
        audience_hash: audHashV2,
        conversation_id: convId,
        conversation_type: 'dm' as const,
        devices: [aliceDevEntry, bobDevEntry],
        epoch: 2,
        members: [aliceUserId, bobUserId],
        prev_roster_hash: '', // Attack: empty hash on version 2
        signer_device_id: aliceDeviceId,
        signer_user_id: aliceUserId,
        version: 2,
      };
      const rosterV2: SignedRoster = {
        ...payloadV2,
        signature: aliceAccount.sign(canonicalJsonStringify(payloadV2)),
      };

      const check = await rosterMgr.verifyRoster(rosterV2, validRosterV1, aliceKeys.ed25519);
      assert(!check.valid, 'Version 2 with empty prev_roster_hash must fail');
      assert(check.reason?.includes('hash chain broken') || false, `Expected hash chain error: ${check.reason}`);
    });

    await test('Attack 1.3: Chained v2 with single bit flipped in prev_roster_hash is rejected', async () => {
      const legitimatePrevHash = await computeRosterPayloadHash(validRosterV1);
      const flippedPrevHash = flipBitInHex(legitimatePrevHash, 10);

      const audHashV2 = await computeAudienceHash([aliceUserId, bobUserId], [aliceDevEntry, bobDevEntry]);
      const payloadV2 = {
        audience_hash: audHashV2,
        conversation_id: convId,
        conversation_type: 'dm' as const,
        devices: [aliceDevEntry, bobDevEntry],
        epoch: 2,
        members: [aliceUserId, bobUserId],
        prev_roster_hash: flippedPrevHash,
        signer_device_id: aliceDeviceId,
        signer_user_id: aliceUserId,
        version: 2,
      };
      const rosterV2: SignedRoster = {
        ...payloadV2,
        signature: aliceAccount.sign(canonicalJsonStringify(payloadV2)),
      };

      const check = await rosterMgr.verifyRoster(rosterV2, validRosterV1, aliceKeys.ed25519);
      assert(!check.valid, 'Flipped prev_roster_hash must fail');
      assert(check.reason?.includes('hash chain broken') || false, `Expected hash chain broken: ${check.reason}`);
    });

    await test('Attack 1.4: Chained v2 with all-zeros prev_roster_hash is rejected', async () => {
      const allZerosHash = '0000000000000000000000000000000000000000000000000000000000000000';
      const audHashV2 = await computeAudienceHash([aliceUserId, bobUserId], [aliceDevEntry, bobDevEntry]);
      const payloadV2 = {
        audience_hash: audHashV2,
        conversation_id: convId,
        conversation_type: 'dm' as const,
        devices: [aliceDevEntry, bobDevEntry],
        epoch: 2,
        members: [aliceUserId, bobUserId],
        prev_roster_hash: allZerosHash,
        signer_device_id: aliceDeviceId,
        signer_user_id: aliceUserId,
        version: 2,
      };
      const rosterV2: SignedRoster = {
        ...payloadV2,
        signature: aliceAccount.sign(canonicalJsonStringify(payloadV2)),
      };

      const check = await rosterMgr.verifyRoster(rosterV2, validRosterV1, aliceKeys.ed25519);
      assert(!check.valid, 'All zeros prev_roster_hash must fail');
      assert(check.reason?.includes('hash chain broken') || false, `Expected hash chain broken: ${check.reason}`);
    });

    await test('Attack 1.5: Chained v2 pointing to unrelated conversation roster hash is rejected', async () => {
      const unrelatedRoster: SignedRoster = {
        ...validRosterV1,
        conversation_id: 'dm-different-unrelated-conv',
      };
      const unrelatedHash = await computeRosterPayloadHash(unrelatedRoster);

      const audHashV2 = await computeAudienceHash([aliceUserId, bobUserId], [aliceDevEntry, bobDevEntry]);
      const payloadV2 = {
        audience_hash: audHashV2,
        conversation_id: convId,
        conversation_type: 'dm' as const,
        devices: [aliceDevEntry, bobDevEntry],
        epoch: 2,
        members: [aliceUserId, bobUserId],
        prev_roster_hash: unrelatedHash,
        signer_device_id: aliceDeviceId,
        signer_user_id: aliceUserId,
        version: 2,
      };
      const rosterV2: SignedRoster = {
        ...payloadV2,
        signature: aliceAccount.sign(canonicalJsonStringify(payloadV2)),
      };

      const check = await rosterMgr.verifyRoster(rosterV2, validRosterV1, aliceKeys.ed25519);
      assert(!check.valid, 'Unrelated roster hash must fail');
      assert(check.reason?.includes('hash chain broken') || false, `Expected hash chain broken: ${check.reason}`);
    });
  });

  // --------------------------------------------------------------------------
  // SUITE 2: VERSION SKIP & MONOTONICITY ATTACK VECTOR
  // --------------------------------------------------------------------------
  await suite('Suite 2: Version Skip & Monotonicity Adversarial Attacks', async () => {
    const legitimatePrevHash = await computeRosterPayloadHash(validRosterV1);
    const audHash = await computeAudienceHash([aliceUserId], [aliceDevEntry]);

    await test('Attack 2.1: Version Skip v1 -> v3 is rejected by monotonic check', async () => {
      const payloadV3 = {
        audience_hash: audHash,
        conversation_id: convId,
        conversation_type: 'dm' as const,
        devices: [aliceDevEntry],
        epoch: 2,
        members: [aliceUserId],
        prev_roster_hash: legitimatePrevHash,
        signer_device_id: aliceDeviceId,
        signer_user_id: aliceUserId,
        version: 3, // Skipped version 2
      };
      const rosterV3: SignedRoster = {
        ...payloadV3,
        signature: aliceAccount.sign(canonicalJsonStringify(payloadV3)),
      };

      const check = await rosterMgr.verifyRoster(rosterV3, validRosterV1, aliceKeys.ed25519);
      assert(!check.valid, 'Version skip v1->v3 must fail');
      assert(check.reason?.includes('Monotonic version violation') || false, `Expected monotonic violation: ${check.reason}`);
    });

    await test('Attack 2.2: Extreme Version Skip v1 -> v100 is rejected', async () => {
      const payloadV100 = {
        audience_hash: audHash,
        conversation_id: convId,
        conversation_type: 'dm' as const,
        devices: [aliceDevEntry],
        epoch: 2,
        members: [aliceUserId],
        prev_roster_hash: legitimatePrevHash,
        signer_device_id: aliceDeviceId,
        signer_user_id: aliceUserId,
        version: 100,
      };
      const rosterV100: SignedRoster = {
        ...payloadV100,
        signature: aliceAccount.sign(canonicalJsonStringify(payloadV100)),
      };

      const check = await rosterMgr.verifyRoster(rosterV100, validRosterV1, aliceKeys.ed25519);
      assert(!check.valid, 'Extreme version skip must fail');
    });

    await test('Attack 2.3: Version Rollback v2 -> v1 is rejected', async () => {
      // Create valid v2 first
      const payloadV2 = {
        audience_hash: audHash,
        conversation_id: convId,
        conversation_type: 'dm' as const,
        devices: [aliceDevEntry],
        epoch: 2,
        members: [aliceUserId],
        prev_roster_hash: legitimatePrevHash,
        signer_device_id: aliceDeviceId,
        signer_user_id: aliceUserId,
        version: 2,
      };
      const rosterV2: SignedRoster = {
        ...payloadV2,
        signature: aliceAccount.sign(canonicalJsonStringify(payloadV2)),
      };

      // Now attempt to verify v1 against v2 (rollback)
      const check = await rosterMgr.verifyRoster(validRosterV1, rosterV2, aliceKeys.ed25519);
      assert(!check.valid, 'Version rollback must fail');
      assert(check.reason?.includes('Monotonic version violation') || false, `Expected monotonic violation: ${check.reason}`);
    });

    await test('Attack 2.4: Version Replay v2 -> v2 is ignored by handleRosterUpdate', async () => {
      const localMgr = new RosterManager();
      await localMgr.handleRosterUpdate(validRosterV1, aliceKeys.ed25519);

      const payloadV2 = {
        audience_hash: audHash,
        conversation_id: convId,
        conversation_type: 'dm' as const,
        devices: [aliceDevEntry],
        epoch: 2,
        members: [aliceUserId],
        prev_roster_hash: legitimatePrevHash,
        signer_device_id: aliceDeviceId,
        signer_user_id: aliceUserId,
        version: 2,
      };
      const rosterV2: SignedRoster = {
        ...payloadV2,
        signature: aliceAccount.sign(canonicalJsonStringify(payloadV2)),
      };

      const firstAccept = await localMgr.handleRosterUpdate(rosterV2, aliceKeys.ed25519);
      assert(firstAccept, 'First acceptance of v2 must succeed');

      // Attempt replay of v2
      const secondAccept = await localMgr.handleRosterUpdate(rosterV2, aliceKeys.ed25519);
      assert(!secondAccept, 'Replay of existing v2 must be safely ignored');
    });

    await test('Attack 2.5: Invalid Version 0, negative, and float versions are rejected', async () => {
      for (const badVer of [0, -1, -99, 1.5, 2.7]) {
        const payloadBad = {
          audience_hash: audHash,
          conversation_id: convId,
          conversation_type: 'dm' as const,
          devices: [aliceDevEntry],
          epoch: 1,
          members: [aliceUserId],
          prev_roster_hash: '',
          signer_device_id: aliceDeviceId,
          signer_user_id: aliceUserId,
          version: badVer,
        };
        const rosterBad: SignedRoster = {
          ...payloadBad,
          signature: aliceAccount.sign(canonicalJsonStringify(payloadBad)),
        };

        const check = await rosterMgr.verifyRoster(rosterBad, undefined, aliceKeys.ed25519);
        assert(!check.valid, `Version ${badVer} must fail validation`);
        assert(check.reason?.includes('Invalid roster version') || false, `Expected invalid version: ${check.reason}`);
      }
    });
  });

  // --------------------------------------------------------------------------
  // SUITE 3: STEALTH DEVICE INJECTION & AUDIENCE TAMPERING ATTACK VECTOR
  // --------------------------------------------------------------------------
  await suite('Suite 3: Stealth Device Injection & Audience Tampering Attacks', async () => {
    const legitimatePrevHash = await computeRosterPayloadHash(validRosterV1);

    await test('Attack 3.1: Stealth device injection with reused audience_hash is rejected', async () => {
      // Mallory tries to inject her device into Alice's room while keeping old audience_hash
      const tamperedDevices = [aliceDevEntry, malloryDevEntry];
      const payloadTampered = {
        audience_hash: audHashV1, // Reusing Alice-only audience hash!
        conversation_id: convId,
        conversation_type: 'dm' as const,
        devices: tamperedDevices,
        epoch: 2,
        members: [aliceUserId, malloryUserId],
        prev_roster_hash: legitimatePrevHash,
        signer_device_id: aliceDeviceId,
        signer_user_id: aliceUserId,
        version: 2,
      };
      const rosterTampered: SignedRoster = {
        ...payloadTampered,
        signature: aliceAccount.sign(canonicalJsonStringify(payloadTampered)),
      };

      const check = await rosterMgr.verifyRoster(rosterTampered, validRosterV1, aliceKeys.ed25519);
      assert(!check.valid, 'Stealth device injection with stale audience hash must fail');
      assert(check.reason?.includes('Audience hash mismatch') || false, `Expected audience mismatch: ${check.reason}`);
    });

    await test('Attack 3.2: Stealth device with user not in members is rejected', async () => {
      // Device claims user is Mallory, but members only lists Alice
      const tamperedAudHash = await computeAudienceHash([aliceUserId], [aliceDevEntry, malloryDevEntry]);
      const payloadTampered = {
        audience_hash: tamperedAudHash,
        conversation_id: convId,
        conversation_type: 'dm' as const,
        devices: [aliceDevEntry, malloryDevEntry],
        epoch: 2,
        members: [aliceUserId], // Mallory NOT in members!
        prev_roster_hash: legitimatePrevHash,
        signer_device_id: aliceDeviceId,
        signer_user_id: aliceUserId,
        version: 2,
      };
      const rosterTampered: SignedRoster = {
        ...payloadTampered,
        signature: aliceAccount.sign(canonicalJsonStringify(payloadTampered)),
      };

      const check = await rosterMgr.verifyRoster(rosterTampered, validRosterV1, aliceKeys.ed25519);
      assert(!check.valid, 'Device whose user is not in members must fail');
      assert(check.reason?.includes('who is not in roster members') || false, `Expected member mismatch: ${check.reason}`);
    });

    await test('Attack 3.3: Replacing legitimate Curve25519 key while keeping device_id fails audience check', async () => {
      // Attacker replaces Alice's Curve25519 key with Mallory's key, keeping Alice's device_id
      const hijackedAliceDev: RosterDeviceEntry = {
        device_id: aliceDeviceId,
        user_id: aliceUserId,
        curve25519_key: malloryKeys.curve25519, // Hijacked key
        ed25519_key: aliceKeys.ed25519,
      };

      const payloadHijacked = {
        audience_hash: audHashV1, // Reusing old audience hash
        conversation_id: convId,
        conversation_type: 'dm' as const,
        devices: [hijackedAliceDev],
        epoch: 2,
        members: [aliceUserId],
        prev_roster_hash: legitimatePrevHash,
        signer_device_id: aliceDeviceId,
        signer_user_id: aliceUserId,
        version: 2,
      };
      const rosterHijacked: SignedRoster = {
        ...payloadHijacked,
        signature: aliceAccount.sign(canonicalJsonStringify(payloadHijacked)),
      };

      const check = await rosterMgr.verifyRoster(rosterHijacked, validRosterV1, aliceKeys.ed25519);
      assert(!check.valid, 'Key hijacking under same device_id must fail audience hash');
    });

    await test('Attack 3.4: Member removed while keeping orphan device is rejected', async () => {
      // Bob removed from members, but bobDevEntry remains in devices
      const orphanAudHash = await computeAudienceHash([aliceUserId], [aliceDevEntry, bobDevEntry]);
      const payloadOrphan = {
        audience_hash: orphanAudHash,
        conversation_id: convId,
        conversation_type: 'dm' as const,
        devices: [aliceDevEntry, bobDevEntry],
        epoch: 2,
        members: [aliceUserId],
        prev_roster_hash: legitimatePrevHash,
        signer_device_id: aliceDeviceId,
        signer_user_id: aliceUserId,
        version: 2,
      };
      const rosterOrphan: SignedRoster = {
        ...payloadOrphan,
        signature: aliceAccount.sign(canonicalJsonStringify(payloadOrphan)),
      };

      const check = await rosterMgr.verifyRoster(rosterOrphan, validRosterV1, aliceKeys.ed25519);
      assert(!check.valid, 'Orphan device of removed member must fail');
      assert(check.reason?.includes('who is not in roster members') || false, `Expected orphan device error: ${check.reason}`);
    });

    await test('Attack 3.5: Permuted order of members and devices produces bitwise identical audience hash', async () => {
      const m1 = [aliceUserId, bobUserId, malloryUserId];
      const m2 = [malloryUserId, aliceUserId, bobUserId];
      const d1 = [aliceDevEntry, bobDevEntry, malloryDevEntry];
      const d2 = [malloryDevEntry, aliceDevEntry, bobDevEntry];

      const hash1 = await computeAudienceHash(m1, d1);
      const hash2 = await computeAudienceHash(m2, d2);

      assertEqual(hash1, hash2, 'Audience hash must be strictly order-invariant (RFC 8785 canonical)');
    });
  });

  // --------------------------------------------------------------------------
  // SUITE 4: UNAUTHORIZED SIGNER ATTACK VECTOR
  // --------------------------------------------------------------------------
  await suite('Suite 4: Unauthorized Signer Adversarial Attacks', async () => {
    const legitimatePrevHash = await computeRosterPayloadHash(validRosterV1);
    const audHash = await computeAudienceHash([aliceUserId], [aliceDevEntry]);

    await test('Attack 4.1: Outsider Mallory signs Alice genesis roster -> rejected', async () => {
      // Mallory tries to sign a roster where Mallory is not even a member
      const payload = {
        audience_hash: audHash,
        conversation_id: convId,
        conversation_type: 'dm' as const,
        devices: [aliceDevEntry],
        epoch: 1,
        members: [aliceUserId],
        prev_roster_hash: '',
        signer_device_id: malloryDeviceId,
        signer_user_id: malloryUserId,
        version: 1,
      };
      const roster: SignedRoster = {
        ...payload,
        signature: malloryAccount.sign(canonicalJsonStringify(payload)),
      };

      const check = await rosterMgr.verifyRoster(roster, undefined, malloryKeys.ed25519);
      assert(!check.valid, 'Outsider signing roster must fail');
      assert(check.reason?.includes('not an authorized member') || false, `Expected unauthorized signer: ${check.reason}`);
    });

    await test('Attack 4.2: Mallory signs v2 adding herself to Alice room without Alice consent', async () => {
      // Mallory signs v2 adding herself to members, claiming herself as signer
      const audHashWithMallory = await computeAudienceHash([aliceUserId, malloryUserId], [aliceDevEntry, malloryDevEntry]);
      const payload = {
        audience_hash: audHashWithMallory,
        conversation_id: convId,
        conversation_type: 'dm' as const,
        devices: [aliceDevEntry, malloryDevEntry],
        epoch: 2,
        members: [aliceUserId, malloryUserId],
        prev_roster_hash: legitimatePrevHash,
        signer_device_id: malloryDeviceId,
        signer_user_id: malloryUserId,
        version: 2,
      };
      const roster: SignedRoster = {
        ...payload,
        signature: malloryAccount.sign(canonicalJsonStringify(payload)),
      };

      // When verified by Alice (who expects Alice to have signed or authorized signer):
      // If Alice verifies with Alice's expected signer or checks if signer was authorized:
      // If client checks against signer's key:
      const checkWithAliceKey = await rosterMgr.verifyRoster(roster, validRosterV1, aliceKeys.ed25519);
      assert(!checkWithAliceKey.valid, 'Signature with Mallory key when Alice expected must fail');
    });

    await test('Attack 4.3: Mallory signs roster with Alice signer_user_id but Mallory Ed25519 key -> rejected', async () => {
      // Mallory impersonates Alice's signer_user_id, but signs with Mallory's private key
      const payload = {
        audience_hash: audHash,
        conversation_id: convId,
        conversation_type: 'dm' as const,
        devices: [aliceDevEntry],
        epoch: 2,
        members: [aliceUserId],
        prev_roster_hash: legitimatePrevHash,
        signer_device_id: aliceDeviceId,
        signer_user_id: aliceUserId,
        version: 2,
      };
      // Mallory signs payload
      const forgedSig = malloryAccount.sign(canonicalJsonStringify(payload));
      const roster: SignedRoster = {
        ...payload,
        signature: forgedSig,
      };

      const check = await rosterMgr.verifyRoster(roster, validRosterV1, aliceKeys.ed25519);
      assert(!check.valid, 'Forged signature with Mallory key must fail Alice identity check');
      assert(check.reason?.includes('signature verification failed') || false, `Expected sig failure: ${check.reason}`);
    });

    await test('Attack 4.4: Signer device ID not present in roster devices is rejected', async () => {
      const payload = {
        audience_hash: audHash,
        conversation_id: convId,
        conversation_type: 'dm' as const,
        devices: [aliceDevEntry],
        epoch: 2,
        members: [aliceUserId],
        prev_roster_hash: legitimatePrevHash,
        signer_device_id: 'dev-ghost-nonexistent', // Nonexistent device!
        signer_user_id: aliceUserId,
        version: 2,
      };
      const roster: SignedRoster = {
        ...payload,
        signature: aliceAccount.sign(canonicalJsonStringify(payload)),
      };

      // Without explicit signerIdentityKey, verifyRoster attempts lookup from roster devices
      const check = await rosterMgr.verifyRoster(roster, validRosterV1);
      assert(!check.valid, 'Ghost signer device must fail');
      assert(check.reason?.includes('Signer identity key unavailable') || false, `Expected unavailable key: ${check.reason}`);
    });

    await test('Attack 4.5: Signer device belongs to user Bob but signer_user_id claims Alice', async () => {
      const audHashBoth = await computeAudienceHash([aliceUserId, bobUserId], [aliceDevEntry, bobDevEntry]);
      const payload = {
        audience_hash: audHashBoth,
        conversation_id: convId,
        conversation_type: 'dm' as const,
        devices: [aliceDevEntry, bobDevEntry],
        epoch: 2,
        members: [aliceUserId, bobUserId],
        prev_roster_hash: legitimatePrevHash,
        signer_device_id: bobDeviceId, // Bob's device!
        signer_user_id: aliceUserId,   // Alice's user ID!
        version: 2,
      };
      const roster: SignedRoster = {
        ...payload,
        signature: aliceAccount.sign(canonicalJsonStringify(payload)),
      };

      // Signer device lookup will find bobDeviceId has user_id bobUserId != aliceUserId
      const check = await rosterMgr.verifyRoster(roster, validRosterV1);
      assert(!check.valid, 'Mismatched device user and signer user must fail');
      assert(check.reason?.includes('Signer identity key unavailable') || false, `Expected key lookup failure: ${check.reason}`);
    });
  });

  // --------------------------------------------------------------------------
  // SUITE 5: EPOCH ROLLBACK & MONOTONICITY ATTACK VECTOR
  // --------------------------------------------------------------------------
  await suite('Suite 5: Epoch Rollback & Progression Adversarial Attacks', async () => {
    const legitimatePrevHash = await computeRosterPayloadHash(validRosterV1);
    const audHash = await computeAudienceHash([aliceUserId], [aliceDevEntry]);

    await test('Attack 5.1: Epoch decrease (epoch 1 -> epoch 0) is rejected', async () => {
      const payloadRollback = {
        audience_hash: audHash,
        conversation_id: convId,
        conversation_type: 'dm' as const,
        devices: [aliceDevEntry],
        epoch: 0, // Rollback to 0 from epoch 1
        members: [aliceUserId],
        prev_roster_hash: legitimatePrevHash,
        signer_device_id: aliceDeviceId,
        signer_user_id: aliceUserId,
        version: 2,
      };
      const rosterRollback: SignedRoster = {
        ...payloadRollback,
        signature: aliceAccount.sign(canonicalJsonStringify(payloadRollback)),
      };

      const check = await rosterMgr.verifyRoster(rosterRollback, validRosterV1, aliceKeys.ed25519);
      assert(!check.valid, 'Epoch decrease must fail');
      assert(check.reason?.includes('Epoch rollback violation') || false, `Expected epoch rollback error: ${check.reason}`);
    });

    await test('Attack 5.2: Multi-step epoch rollback (epoch 10 -> epoch 5) is rejected', async () => {
      const rosterEpoch10: SignedRoster = {
        ...validRosterV1,
        epoch: 10,
        version: 2,
        prev_roster_hash: legitimatePrevHash,
      };
      rosterEpoch10.signature = aliceAccount.sign(canonicalJsonStringify(extractRosterPayload(rosterEpoch10)));
      const hashEpoch10 = await computeRosterPayloadHash(rosterEpoch10);

      const payloadEpoch5 = {
        audience_hash: audHash,
        conversation_id: convId,
        conversation_type: 'dm' as const,
        devices: [aliceDevEntry],
        epoch: 5, // Rolled back from 10 to 5
        members: [aliceUserId],
        prev_roster_hash: hashEpoch10,
        signer_device_id: aliceDeviceId,
        signer_user_id: aliceUserId,
        version: 3,
      };
      const rosterEpoch5: SignedRoster = {
        ...payloadEpoch5,
        signature: aliceAccount.sign(canonicalJsonStringify(payloadEpoch5)),
      };

      const check = await rosterMgr.verifyRoster(rosterEpoch5, rosterEpoch10, aliceKeys.ed25519);
      assert(!check.valid, 'Epoch rollback from 10 to 5 must fail');
      assert(check.reason?.includes('Epoch rollback violation') || false, `Expected epoch rollback error: ${check.reason}`);
    });

    await test('Attack 5.3: Negative epoch is rejected', async () => {
      const payloadNegative = {
        audience_hash: audHash,
        conversation_id: convId,
        conversation_type: 'dm' as const,
        devices: [aliceDevEntry],
        epoch: -1,
        members: [aliceUserId],
        prev_roster_hash: '',
        signer_device_id: aliceDeviceId,
        signer_user_id: aliceUserId,
        version: 1,
      };
      const rosterNegative: SignedRoster = {
        ...payloadNegative,
        signature: aliceAccount.sign(canonicalJsonStringify(payloadNegative)),
      };

      const check = await rosterMgr.verifyRoster(rosterNegative, undefined, aliceKeys.ed25519);
      assert(!check.valid, 'Negative epoch must fail');
      assert(check.reason?.includes('Invalid roster epoch') || false, `Expected invalid epoch: ${check.reason}`);
    });

    await test('Attack 5.4: Float epoch (1.5, 3.14) is rejected', async () => {
      for (const badEpoch of [1.5, 3.14159, 2.0001]) {
        const payloadFloat = {
          audience_hash: audHash,
          conversation_id: convId,
          conversation_type: 'dm' as const,
          devices: [aliceDevEntry],
          epoch: badEpoch,
          members: [aliceUserId],
          prev_roster_hash: '',
          signer_device_id: aliceDeviceId,
          signer_user_id: aliceUserId,
          version: 1,
        };
        const rosterFloat: SignedRoster = {
          ...payloadFloat,
          signature: aliceAccount.sign(canonicalJsonStringify(payloadFloat)),
        };

        const check = await rosterMgr.verifyRoster(rosterFloat, undefined, aliceKeys.ed25519);
        assert(!check.valid, `Float epoch ${badEpoch} must fail`);
      }
    });
  });

  // --------------------------------------------------------------------------
  // SUITE 6: BIT-FLIP SIGNATURE & PAYLOAD CORRUPTION ATTACK VECTOR
  // --------------------------------------------------------------------------
  await suite('Suite 6: Bit-Flip Signature & Payload Corruption Attacks', async () => {
    const rawPayload = canonicalJsonStringify(extractRosterPayload(validRosterV1));
    const genuineSig = aliceAccount.sign(rawPayload);

    await test('Attack 6.1: Bit flip at byte 0 of Ed25519 signature is rejected', async () => {
      const tamperedSig = flipBitInBase64(genuineSig, 0);
      const roster: SignedRoster = { ...validRosterV1, signature: tamperedSig };
      const check = await rosterMgr.verifyRoster(roster, undefined, aliceKeys.ed25519);
      assert(!check.valid, 'Bit flip at byte 0 must fail');
      assert(check.reason?.includes('signature verification failed') || false, `Expected sig failure: ${check.reason}`);
    });

    await test('Attack 6.2: Bit flip at byte 15 of Ed25519 signature is rejected', async () => {
      const tamperedSig = flipBitInBase64(genuineSig, 15);
      const roster: SignedRoster = { ...validRosterV1, signature: tamperedSig };
      const check = await rosterMgr.verifyRoster(roster, undefined, aliceKeys.ed25519);
      assert(!check.valid, 'Bit flip at byte 15 must fail');
    });

    await test('Attack 6.3: Bit flip at byte 31 of Ed25519 signature is rejected', async () => {
      const tamperedSig = flipBitInBase64(genuineSig, 31);
      const roster: SignedRoster = { ...validRosterV1, signature: tamperedSig };
      const check = await rosterMgr.verifyRoster(roster, undefined, aliceKeys.ed25519);
      assert(!check.valid, 'Bit flip at byte 31 must fail');
    });

    await test('Attack 6.4: Bit flip at byte 63 of Ed25519 signature is rejected', async () => {
      const tamperedSig = flipBitInBase64(genuineSig, 63);
      const roster: SignedRoster = { ...validRosterV1, signature: tamperedSig };
      const check = await rosterMgr.verifyRoster(roster, undefined, aliceKeys.ed25519);
      assert(!check.valid, 'Bit flip at byte 63 must fail');
    });

    await test('Attack 6.5: All-zeros signature is rejected', async () => {
      const zeroSig = Buffer.alloc(64, 0).toString('base64');
      const roster: SignedRoster = { ...validRosterV1, signature: zeroSig };
      const check = await rosterMgr.verifyRoster(roster, undefined, aliceKeys.ed25519);
      assert(!check.valid, 'All zeros signature must fail');
    });

    await test('Attack 6.6: Truncated signature is rejected', async () => {
      const shortSig = Buffer.from(genuineSig, 'base64').subarray(0, 32).toString('base64');
      const roster: SignedRoster = { ...validRosterV1, signature: shortSig };
      const check = await rosterMgr.verifyRoster(roster, undefined, aliceKeys.ed25519);
      assert(!check.valid, 'Truncated signature must fail');
    });

    await test('Attack 6.7: Malformed base64 signature string is rejected', async () => {
      const malformedSig = '!!!not-a-valid-base64-string@@@';
      const roster: SignedRoster = { ...validRosterV1, signature: malformedSig };
      const check = await rosterMgr.verifyRoster(roster, undefined, aliceKeys.ed25519);
      assert(!check.valid, 'Malformed base64 must fail');
    });

    await test('Attack 6.8: Single character mutation in signed payload fails signature check', async () => {
      // Modify conversation_type from 'dm' to 'dm_group'
      const mutatedPayload: SignedRoster = {
        ...validRosterV1,
        conversation_type: 'dm_group',
        // keeping original signature!
      };
      const check = await rosterMgr.verifyRoster(mutatedPayload, undefined, aliceKeys.ed25519);
      assert(!check.valid, 'Mutated payload with original signature must fail');
      assert(check.reason?.includes('signature verification failed') || false, `Expected sig failure: ${check.reason}`);
    });
  });

  // --------------------------------------------------------------------------
  // SUITE 7: DEVICE REGISTRATION BINDING & ADVERSARIAL VECTORS
  // --------------------------------------------------------------------------
  await suite('Suite 7: Device Registration Binding & Adversarial Vectors', async () => {
    const devMgr = new DeviceManager();

    await test('Attack 7.1: Device canonical message format binds curve25519 and ed25519 keys', () => {
      const msg = devMgr.getCanonicalDeviceMessage(aliceKeys.curve25519, aliceKeys.ed25519);
      assertEqual(
        msg,
        `zerovc:device:${aliceKeys.curve25519}:${aliceKeys.ed25519}`,
        'Canonical message must match zerovc:device:<curve>:<ed> format'
      );
    });

    await test('Attack 7.2: Bit-flipped identity signature fails device registration verification', async () => {
      const canonicalMsg = devMgr.getCanonicalDeviceMessage(aliceKeys.curve25519, aliceKeys.ed25519);
      const validSig = aliceAccount.sign(canonicalMsg);
      const tamperedSig = flipBitInBase64(validSig, 12);

      const isValid = await verifyEd25519Signature(aliceKeys.ed25519, canonicalMsg, tamperedSig);
      assert(!isValid, 'Bit-flipped identity signature must fail verification');
    });

    await test('Attack 7.3: Mismatched public key fails device signature verification', async () => {
      const canonicalMsg = devMgr.getCanonicalDeviceMessage(aliceKeys.curve25519, aliceKeys.ed25519);
      const aliceSig = aliceAccount.sign(canonicalMsg);

      // Verifying against Mallory's public key
      const isMalloryValid = await verifyEd25519Signature(malloryKeys.ed25519, canonicalMsg, aliceSig);
      assert(!isMalloryValid, 'Verifying Alice signature against Mallory key must fail');
    });

    await test('Attack 7.4: Cross-user key hijacking (Mallory signs Alice device keys) fails against Alice identity', async () => {
      // Mallory tries to sign Alice's device keys to register as Mallory
      const canonicalMsg = devMgr.getCanonicalDeviceMessage(aliceKeys.curve25519, aliceKeys.ed25519);
      const mallorySig = malloryAccount.sign(canonicalMsg);

      // Backend verifies against Alice's registered identity key
      const isAliceValid = await verifyEd25519Signature(aliceKeys.ed25519, canonicalMsg, mallorySig);
      assert(!isAliceValid, 'Mallory signature over Alice device keys cannot verify against Alice identity');
    });

    await test('Attack 7.5: Swapped Curve25519 key fails signature verification', async () => {
      const canonicalMsg = devMgr.getCanonicalDeviceMessage(aliceKeys.curve25519, aliceKeys.ed25519);
      const validSig = aliceAccount.sign(canonicalMsg);

      // Attacker swaps curve25519 key to Mallory's curve key
      const swappedMsg = devMgr.getCanonicalDeviceMessage(malloryKeys.curve25519, aliceKeys.ed25519);
      const isSwappedValid = await verifyEd25519Signature(aliceKeys.ed25519, swappedMsg, validSig);
      assert(!isSwappedValid, 'Swapped curve25519 key must fail signature verification');
    });
  });

  // --------------------------------------------------------------------------
  // SUMMARY & VERDICT
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
  console.log(`${BOLD}CHALLENGER ADVERSARIAL TEST RUN SUMMARY${RESET}`);
  console.log(`Total Attack Tests:  ${totalTests}`);
  console.log(`Passed:              ${GREEN}${passedTests}${RESET}`);
  console.log(`Failed:              ${failedTests > 0 ? RED : GREEN}${failedTests}${RESET}`);
  console.log(`${BOLD}============================================================\n${RESET}`);

  if (failedTests > 0) {
    process.exit(1);
  }
}

runAdversarialHarness().catch(err => {
  console.error('Fatal challenge harness error:', err);
  process.exit(1);
});
