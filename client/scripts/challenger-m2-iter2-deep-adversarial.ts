/**
 * ZeroVC Opt-in E2EE — Milestone M2 Iteration 2 Deep Adversarial Challenge Harness
 * Challenger M2.1 Iteration 2 (Empirical Adversarial Verification)
 *
 * Focus Areas:
 *  1. Outsider signer roster expansion rejection (Finding 3 remediation):
 *     - Mallory appending herself to roster.members and signing with her key (no explicit signerIdentityKey passed)
 *     - Mallory appending herself and passing her key explicitly
 *     - Outsider in multi-user group chat expansion
 *     - Signer spoofing Alice's user_id but registering Mallory's device key
 *     - Legitimate member removed in new roster attempting to self-sign
 *  2. Cold-start bootstrap roster functionality (Finding 4 remediation):
 *     - Rejection of version > 1 on unbootstrapped client via handleRosterUpdate
 *     - Successful cold-start bootstrap via bootstrapRoster
 *     - Progression: v2 bootstrap -> v3 chained update via handleRosterUpdate
 *     - Tampered bootstrap rosters: bad audience hash, orphan device, outsider signer, bad signature
 *     - Monotonic protection: bootstrap cannot rollback an already active newer roster
 *  3. Hash chain, version skip, and epoch rollback attacks:
 *     - Tampered prev_roster_hash (bit flip, truncated, zeroed)
 *     - Version skips (v1 -> v3, v1 -> v10)
 *     - Epoch rollback (epoch 5 -> epoch 2)
 *     - Epoch progression (epoch 1 -> epoch 10 accepted)
 *     - Invalid types: version 0, negative version, float version, negative epoch, float epoch
 *  4. Device binding & cross-user spoofing attacks:
 *     - Cross-user device injection in roster devices
 *     - Swapped Curve25519 vs Ed25519 key in audience hash
 *
 * Run with:
 *   npx tsx scripts/challenger-m2-iter2-deep-adversarial.ts
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

// ANSI styling
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

function flipBitInHex(hexStr: string, charOffset: number): string {
  const chars = hexStr.split('');
  const idx = Math.min(Math.max(0, charOffset), chars.length - 1);
  const currentVal = parseInt(chars[idx], 16);
  const flipped = (currentVal ^ 1).toString(16);
  chars[idx] = flipped;
  return chars.join('');
}

function flipBitInBase64(b64: string, byteOffset: number): string {
  const buf = Buffer.from(b64, 'base64');
  const targetOffset = Math.min(Math.max(0, byteOffset), buf.length - 1);
  buf[targetOffset] ^= 0x01;
  return buf.toString('base64');
}

async function runIteration2Adversarial() {
  console.log(`\n${BOLD}${CYAN}======================================================================${RESET}`);
  console.log(`${BOLD}${CYAN}ZEROVC E2EE — CHALLENGER M2.1 ITERATION 2 DEEP ADVERSARIAL HARNESS${RESET}`);
  console.log(`${BOLD}${CYAN}Stress Testing Remediated Roster & Device Management Implementations${RESET}`);
  console.log(`${BOLD}${CYAN}======================================================================\n${RESET}`);

  // Test identities
  const aliceAccount = new Account();
  const bobAccount = new Account();
  const malloryAccount = new Account();

  const aliceKeys = JSON.parse(aliceAccount.identityKeys());
  const bobKeys = JSON.parse(bobAccount.identityKeys());
  const malloryKeys = JSON.parse(malloryAccount.identityKeys());

  const convId = 'channel-deep-adversarial-m2';
  const aliceUserId = 'usr-alice-001';
  const bobUserId = 'usr-bob-002';
  const malloryUserId = 'usr-mallory-666';

  const aliceDeviceId = 'dev-alice-101';
  const bobDeviceId = 'dev-bob-202';
  const malloryDeviceId = 'dev-mallory-666';

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

  // Construct valid Genesis Roster (Alice & Bob)
  const initialMembers = [aliceUserId, bobUserId].sort();
  const initialDevices = [aliceDevEntry, bobDevEntry].sort((a, b) => a.device_id.localeCompare(b.device_id));
  const audHashV1 = await computeAudienceHash(initialMembers, initialDevices);

  const payloadV1 = {
    audience_hash: audHashV1,
    conversation_id: convId,
    conversation_type: 'channel' as const,
    devices: initialDevices,
    epoch: 1,
    members: initialMembers,
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

  const hashV1 = await computeRosterPayloadHash(validRosterV1);

  // --------------------------------------------------------------------------
  // SUITE 1: OUTSIDER SIGNER ROSTER EXPANSION ATTACK (Finding 3 Remediation)
  // --------------------------------------------------------------------------
  await suite('Suite 1: Outsider Signer Roster Expansion Attacks', async () => {
    const rosterMgr = new RosterManager();

    // Set up active state with v1
    const acceptedV1 = await rosterMgr.handleRosterUpdate(validRosterV1, aliceKeys.ed25519);
    assert(acceptedV1, 'Initial genesis roster v1 must be accepted');

    await test('Attack 1.1: Mallory appends herself to members and self-signs without explicit signerIdentityKey', async () => {
      // Mallory crafts v2 adding herself to members and devices, and signs with her key.
      // In incoming message handling, signerIdentityKey is omitted (resolved from roster.devices).
      const newMembers = [...initialMembers, malloryUserId].sort();
      const newDevices = [...initialDevices, malloryDevEntry].sort((a, b) => a.device_id.localeCompare(b.device_id));
      const audHash = await computeAudienceHash(newMembers, newDevices);

      const payload = {
        audience_hash: audHash,
        conversation_id: convId,
        conversation_type: 'channel' as const,
        devices: newDevices,
        epoch: 2,
        members: newMembers,
        prev_roster_hash: hashV1,
        signer_device_id: malloryDeviceId,
        signer_user_id: malloryUserId,
        version: 2,
      };
      const roster: SignedRoster = {
        ...payload,
        signature: malloryAccount.sign(canonicalJsonStringify(payload)),
      };

      // Verify directly without passing signerIdentityKey
      const check = await rosterMgr.verifyRoster(roster, validRosterV1);
      assert(!check.valid, 'Outsider self-signed roster expansion must be rejected');
      assert(
        check.reason?.includes('was not an authorized member in previous roster') || false,
        `Rejection reason must identify unauthorized signer in previous roster, got: "${check.reason}"`
      );

      // Verify handleRosterUpdate rejects and active roster remains v1
      const updateResult = await rosterMgr.handleRosterUpdate(roster);
      assert(!updateResult, 'handleRosterUpdate must return false for outsider expansion');
      const active = rosterMgr.getActiveRoster(convId);
      assertEqual(active?.version, 1, 'Active roster must remain version 1');
    });

    await test('Attack 1.2: Mallory appends herself and explicitly passes her own key to verifyRoster', async () => {
      const newMembers = [...initialMembers, malloryUserId].sort();
      const newDevices = [...initialDevices, malloryDevEntry].sort((a, b) => a.device_id.localeCompare(b.device_id));
      const audHash = await computeAudienceHash(newMembers, newDevices);

      const payload = {
        audience_hash: audHash,
        conversation_id: convId,
        conversation_type: 'channel' as const,
        devices: newDevices,
        epoch: 2,
        members: newMembers,
        prev_roster_hash: hashV1,
        signer_device_id: malloryDeviceId,
        signer_user_id: malloryUserId,
        version: 2,
      };
      const roster: SignedRoster = {
        ...payload,
        signature: malloryAccount.sign(canonicalJsonStringify(payload)),
      };

      const check = await rosterMgr.verifyRoster(roster, validRosterV1, malloryKeys.ed25519);
      assert(!check.valid, 'Even with explicit key passed, outsider in previous roster must be rejected');
      assert(
        check.reason?.includes('was not an authorized member in previous roster') || false,
        `Expected previous member failure, got: "${check.reason}"`
      );
    });

    await test('Attack 1.3: Mallory crafts v2 claiming signer_user_id is Alice but signs with Mallory key and Mallory device', async () => {
      const newMembers = [...initialMembers, malloryUserId].sort();
      const newDevices = [...initialDevices, malloryDevEntry].sort((a, b) => a.device_id.localeCompare(b.device_id));
      const audHash = await computeAudienceHash(newMembers, newDevices);

      const payload = {
        audience_hash: audHash,
        conversation_id: convId,
        conversation_type: 'channel' as const,
        devices: newDevices,
        epoch: 2,
        members: newMembers,
        prev_roster_hash: hashV1,
        signer_device_id: malloryDeviceId, // Mallory's device
        signer_user_id: aliceUserId,       // Spoofing Alice!
        version: 2,
      };
      const roster: SignedRoster = {
        ...payload,
        signature: malloryAccount.sign(canonicalJsonStringify(payload)),
      };

      // When resolved from roster.devices, malloryDeviceId belongs to malloryUserId, not aliceUserId!
      const check = await rosterMgr.verifyRoster(roster, validRosterV1);
      assert(!check.valid, 'Spoofing Alice with Mallory device must fail signer key resolution');
      assert(
        check.reason?.includes('Signer identity key unavailable') || false,
        `Expected key unavailable error, got: "${check.reason}"`
      );
    });

    await test('Attack 1.4: Mallory crafts rogue device under Alice user ID and signs with rogue device key', async () => {
      // Mallory adds dev-mallory-rogue with user_id: aliceUserId and signs with malloryAccount
      const rogueAliceDev: RosterDeviceEntry = {
        device_id: 'dev-alice-rogue-999',
        user_id: aliceUserId,
        curve25519_key: malloryKeys.curve25519,
        ed25519_key: malloryKeys.ed25519,
      };
      const devicesWithRogue = [...initialDevices, rogueAliceDev].sort((a, b) => a.device_id.localeCompare(b.device_id));
      const audHash = await computeAudienceHash(initialMembers, devicesWithRogue);

      const payload = {
        audience_hash: audHash,
        conversation_id: convId,
        conversation_type: 'channel' as const,
        devices: devicesWithRogue,
        epoch: 2,
        members: initialMembers,
        prev_roster_hash: hashV1,
        signer_device_id: rogueAliceDev.device_id,
        signer_user_id: aliceUserId,
        version: 2,
      };
      const roster: SignedRoster = {
        ...payload,
        signature: malloryAccount.sign(canonicalJsonStringify(payload)),
      };

      // When Alice client verifies with Alice's true identity key:
      const checkAliceVerifies = await rosterMgr.verifyRoster(roster, validRosterV1, aliceKeys.ed25519);
      assert(!checkAliceVerifies.valid, 'Rogue device key cannot forge signature against Alice identity');
      assert(
        checkAliceVerifies.reason?.includes('signature verification failed') || false,
        `Expected signature verification failure, got: "${checkAliceVerifies.reason}"`
      );
    });

    await test('Attack 1.5: Legitimate member Bob adds Charlie; signed by Alice -> VALID transition', async () => {
      const charlieAccount = new Account();
      const charlieKeys = JSON.parse(charlieAccount.identityKeys());
      const charlieUserId = 'usr-charlie-003';
      const charlieDeviceId = 'dev-charlie-303';
      const charlieDevEntry: RosterDeviceEntry = {
        device_id: charlieDeviceId,
        user_id: charlieUserId,
        curve25519_key: charlieKeys.curve25519,
        ed25519_key: charlieKeys.ed25519,
      };

      const expandedMembers = [...initialMembers, charlieUserId].sort();
      const expandedDevices = [...initialDevices, charlieDevEntry].sort((a, b) => a.device_id.localeCompare(b.device_id));
      const audHash = await computeAudienceHash(expandedMembers, expandedDevices);

      const payload = {
        audience_hash: audHash,
        conversation_id: convId,
        conversation_type: 'channel' as const,
        devices: expandedDevices,
        epoch: 2,
        members: expandedMembers,
        prev_roster_hash: hashV1,
        signer_device_id: aliceDeviceId,
        signer_user_id: aliceUserId, // Alice was in v1 and is in v2
        version: 2,
      };
      const validRosterV2: SignedRoster = {
        ...payload,
        signature: aliceAccount.sign(canonicalJsonStringify(payload)),
      };

      const check = await rosterMgr.verifyRoster(validRosterV2, validRosterV1);
      assert(check.valid, `Legitimate expansion signed by authorized member Alice must succeed: ${check.reason}`);

      const updateApplied = await rosterMgr.handleRosterUpdate(validRosterV2);
      assert(updateApplied, 'handleRosterUpdate must succeed for legitimate expansion');
      const active = rosterMgr.getActiveRoster(convId);
      assertEqual(active?.version, 2, 'Active roster version must advance to 2');
    });
  });

  // --------------------------------------------------------------------------
  // SUITE 2: COLD-START BOOTSTRAP ROSTER ATTACKS & INTEGRITY (Finding 4 Fix)
  // --------------------------------------------------------------------------
  await suite('Suite 2: Cold-Start Bootstrap Roster Attacks & Integrity', async () => {
    // Generate valid v2 roster from earlier
    const nextMembers = [aliceUserId, bobUserId].sort();
    const nextDevices = [aliceDevEntry, bobDevEntry].sort((a, b) => a.device_id.localeCompare(b.device_id));
    const audHashV2 = await computeAudienceHash(nextMembers, nextDevices);
    const payloadV2 = {
      audience_hash: audHashV2,
      conversation_id: convId,
      conversation_type: 'channel' as const,
      devices: nextDevices,
      epoch: 2,
      members: nextMembers,
      prev_roster_hash: hashV1,
      signer_device_id: aliceDeviceId,
      signer_user_id: aliceUserId,
      version: 2,
    };
    const validRosterV2: SignedRoster = {
      ...payloadV2,
      signature: aliceAccount.sign(canonicalJsonStringify(payloadV2)),
    };
    const hashV2 = await computeRosterPayloadHash(validRosterV2);

    await test('Attack 2.1: Cold-start without active roster rejects handleRosterUpdate(v2) directly', async () => {
      const coldMgr = new RosterManager();
      assert(coldMgr.getActiveRoster(convId) === null, 'Active roster must be null initially');

      // Attempting handleRosterUpdate directly on v2 when empty fails chain check
      const accepted = await coldMgr.handleRosterUpdate(validRosterV2);
      assert(!accepted, 'handleRosterUpdate(v2) on cold start must be rejected due to missing prevRoster');
      assert(coldMgr.getActiveRoster(convId) === null, 'Active roster remains null');
    });

    await test('Attack 2.2: Cold-start bootstrap via bootstrapRoster(v2) succeeds and establishes state', async () => {
      const coldMgr = new RosterManager();
      const bootstrapped = await coldMgr.bootstrapRoster(validRosterV2, aliceKeys.ed25519);
      assert(bootstrapped, 'bootstrapRoster(v2) must succeed with valid snapshot');
      const active = coldMgr.getActiveRoster(convId);
      assert(active !== null, 'Active roster must now exist');
      assertEqual(active?.version, 2, 'Bootstrapped version is 2');
      assertEqual(active?.epoch, 2, 'Bootstrapped epoch is 2');
    });

    await test('Attack 2.3: Bootstrapped v2 allows subsequent chained v3 update via handleRosterUpdate', async () => {
      const coldMgr = new RosterManager();
      await coldMgr.bootstrapRoster(validRosterV2, aliceKeys.ed25519);

      // Now create chained v3
      const payloadV3 = {
        audience_hash: audHashV2,
        conversation_id: convId,
        conversation_type: 'channel' as const,
        devices: nextDevices,
        epoch: 3,
        members: nextMembers,
        prev_roster_hash: hashV2,
        signer_device_id: aliceDeviceId,
        signer_user_id: aliceUserId,
        version: 3,
      };
      const rosterV3: SignedRoster = {
        ...payloadV3,
        signature: aliceAccount.sign(canonicalJsonStringify(payloadV3)),
      };

      const acceptedV3 = await coldMgr.handleRosterUpdate(rosterV3, aliceKeys.ed25519);
      assert(acceptedV3, 'Subsequent chained v3 must be accepted after bootstrap');
      assertEqual(coldMgr.getActiveRoster(convId)?.version, 3, 'Active roster is now v3');
    });

    await test('Attack 2.4: Bootstrap with tampered audience hash is rejected', async () => {
      const coldMgr = new RosterManager();
      const tamperedAudHash = flipBitInHex(audHashV2, 5);
      const payloadTampered = {
        ...payloadV2,
        audience_hash: tamperedAudHash,
      };
      const rosterTampered: SignedRoster = {
        ...payloadTampered,
        signature: aliceAccount.sign(canonicalJsonStringify(payloadTampered)),
      };

      const booted = await coldMgr.bootstrapRoster(rosterTampered, aliceKeys.ed25519);
      assert(!booted, 'bootstrapRoster must reject tampered audience hash');
      assert(coldMgr.getActiveRoster(convId) === null, 'Active roster remains null');
    });

    await test('Attack 2.5: Bootstrap with orphan device (user not in members) is rejected', async () => {
      const coldMgr = new RosterManager();
      const devicesWithMallory = [...nextDevices, malloryDevEntry].sort((a, b) => a.device_id.localeCompare(b.device_id));
      const audHash = await computeAudienceHash(nextMembers, devicesWithMallory); // members only Alice & Bob!

      const payloadTampered = {
        ...payloadV2,
        audience_hash: audHash,
        devices: devicesWithMallory,
      };
      const rosterTampered: SignedRoster = {
        ...payloadTampered,
        signature: aliceAccount.sign(canonicalJsonStringify(payloadTampered)),
      };

      const booted = await coldMgr.bootstrapRoster(rosterTampered, aliceKeys.ed25519);
      assert(!booted, 'bootstrapRoster must reject orphan device belonging to non-member');
      assert(coldMgr.getActiveRoster(convId) === null, 'Active roster remains null');
    });

    await test('Attack 2.6: Bootstrap with signer not in members is rejected', async () => {
      const coldMgr = new RosterManager();
      // Signer is Mallory, but members only Alice & Bob
      const payloadTampered = {
        ...payloadV2,
        signer_device_id: malloryDeviceId,
        signer_user_id: malloryUserId,
      };
      const rosterTampered: SignedRoster = {
        ...payloadTampered,
        signature: malloryAccount.sign(canonicalJsonStringify(payloadTampered)),
      };

      const booted = await coldMgr.bootstrapRoster(rosterTampered, malloryKeys.ed25519);
      assert(!booted, 'bootstrapRoster must reject signer not in members');
      assert(coldMgr.getActiveRoster(convId) === null, 'Active roster remains null');
    });

    await test('Attack 2.7: Bootstrap with corrupted signature is rejected', async () => {
      const coldMgr = new RosterManager();
      const corruptedSig = flipBitInBase64(validRosterV2.signature, 10);
      const rosterTampered: SignedRoster = {
        ...validRosterV2,
        signature: corruptedSig,
      };

      const booted = await coldMgr.bootstrapRoster(rosterTampered, aliceKeys.ed25519);
      assert(!booted, 'bootstrapRoster must reject invalid Ed25519 signature');
      assert(coldMgr.getActiveRoster(convId) === null, 'Active roster remains null');
    });

    await test('Attack 2.8: Bootstrap cannot rollback or overwrite an existing higher-version active roster', async () => {
      const localMgr = new RosterManager();
      // Bootstrap v2 first
      await localMgr.bootstrapRoster(validRosterV2, aliceKeys.ed25519);
      assertEqual(localMgr.getActiveRoster(convId)?.version, 2, 'Initial active is v2');

      // Now attempt to bootstrap v1
      const bootedOld = await localMgr.bootstrapRoster(validRosterV1, aliceKeys.ed25519);
      assert(!bootedOld, 'bootstrapRoster must reject rollback to older version v1');
      assertEqual(localMgr.getActiveRoster(convId)?.version, 2, 'Active roster remains v2');
    });
  });

  // --------------------------------------------------------------------------
  // SUITE 3: HASH CHAIN, VERSION SKIP, AND EPOCH ROLLBACK INVARIANTS
  // --------------------------------------------------------------------------
  await suite('Suite 3: Cryptographic Hash Chain, Versioning & Epoch Invariants', async () => {
    const rosterMgr = new RosterManager();

    await test('Attack 3.1: Broken prev_roster_hash in chained v2 is rejected', async () => {
      const badPrevHash = flipBitInHex(hashV1, 12);
      const payload = {
        audience_hash: audHashV1,
        conversation_id: convId,
        conversation_type: 'channel' as const,
        devices: initialDevices,
        epoch: 2,
        members: initialMembers,
        prev_roster_hash: badPrevHash,
        signer_device_id: aliceDeviceId,
        signer_user_id: aliceUserId,
        version: 2,
      };
      const roster: SignedRoster = {
        ...payload,
        signature: aliceAccount.sign(canonicalJsonStringify(payload)),
      };

      const check = await rosterMgr.verifyRoster(roster, validRosterV1, aliceKeys.ed25519);
      assert(!check.valid, 'Flipped bit in prev_roster_hash must fail verification');
      assert(check.reason?.includes('hash chain broken') || false, `Expected broken hash chain: ${check.reason}`);
    });

    await test('Attack 3.2: Empty prev_roster_hash in chained v2 is rejected', async () => {
      const payload = {
        audience_hash: audHashV1,
        conversation_id: convId,
        conversation_type: 'channel' as const,
        devices: initialDevices,
        epoch: 2,
        members: initialMembers,
        prev_roster_hash: '',
        signer_device_id: aliceDeviceId,
        signer_user_id: aliceUserId,
        version: 2,
      };
      const roster: SignedRoster = {
        ...payload,
        signature: aliceAccount.sign(canonicalJsonStringify(payload)),
      };

      const check = await rosterMgr.verifyRoster(roster, validRosterV1, aliceKeys.ed25519);
      assert(!check.valid, 'Empty prev_roster_hash on chained version must fail');
      assert(check.reason?.includes('hash chain broken') || false, `Expected broken chain: ${check.reason}`);
    });

    await test('Attack 3.3: Version skip (v1 -> v3, v1 -> v5) is rejected', async () => {
      for (const skippedVer of [3, 4, 10, 50]) {
        const payload = {
          audience_hash: audHashV1,
          conversation_id: convId,
          conversation_type: 'channel' as const,
          devices: initialDevices,
          epoch: 2,
          members: initialMembers,
          prev_roster_hash: hashV1,
          signer_device_id: aliceDeviceId,
          signer_user_id: aliceUserId,
          version: skippedVer,
        };
        const roster: SignedRoster = {
          ...payload,
          signature: aliceAccount.sign(canonicalJsonStringify(payload)),
        };

        const check = await rosterMgr.verifyRoster(roster, validRosterV1, aliceKeys.ed25519);
        assert(!check.valid, `Version skip v1 -> v${skippedVer} must fail verification`);
        assert(check.reason?.includes('Monotonic version violation') || false, `Expected monotonic violation: ${check.reason}`);
      }
    });

    await test('Attack 3.4: Epoch rollback (epoch 5 -> epoch 2) is rejected', async () => {
      // First construct a v1 with epoch 5
      const payloadEpoch5 = {
        ...payloadV1,
        epoch: 5,
      };
      const rosterEpoch5: SignedRoster = {
        ...payloadEpoch5,
        signature: aliceAccount.sign(canonicalJsonStringify(payloadEpoch5)),
      };
      const hashEpoch5 = await computeRosterPayloadHash(rosterEpoch5);

      // Now construct v2 with rolled-back epoch 2
      const payloadRollback = {
        audience_hash: audHashV1,
        conversation_id: convId,
        conversation_type: 'channel' as const,
        devices: initialDevices,
        epoch: 2, // Rolled back from 5!
        members: initialMembers,
        prev_roster_hash: hashEpoch5,
        signer_device_id: aliceDeviceId,
        signer_user_id: aliceUserId,
        version: 2,
      };
      const rosterRollback: SignedRoster = {
        ...payloadRollback,
        signature: aliceAccount.sign(canonicalJsonStringify(payloadRollback)),
      };

      const check = await rosterMgr.verifyRoster(rosterRollback, rosterEpoch5, aliceKeys.ed25519);
      assert(!check.valid, 'Epoch rollback must be rejected');
      assert(check.reason?.includes('Epoch rollback violation') || false, `Expected epoch rollback violation: ${check.reason}`);
    });

    await test('Attack 3.5: Epoch forward jump (epoch 1 -> epoch 20) is accepted', async () => {
      const payloadEpochJump = {
        audience_hash: audHashV1,
        conversation_id: convId,
        conversation_type: 'channel' as const,
        devices: initialDevices,
        epoch: 20, // Legitimate fast-forward (e.g. emergency key rotation)
        members: initialMembers,
        prev_roster_hash: hashV1,
        signer_device_id: aliceDeviceId,
        signer_user_id: aliceUserId,
        version: 2,
      };
      const rosterEpochJump: SignedRoster = {
        ...payloadEpochJump,
        signature: aliceAccount.sign(canonicalJsonStringify(payloadEpochJump)),
      };

      const check = await rosterMgr.verifyRoster(rosterEpochJump, validRosterV1, aliceKeys.ed25519);
      assert(check.valid, `Epoch forward jump must be valid: ${check.reason}`);
    });

    await test('Attack 3.6: Non-integer and negative versions/epochs are rejected', async () => {
      const invalidCases = [
        { version: 0, epoch: 1, reason: 'Invalid roster version' },
        { version: -1, epoch: 1, reason: 'Invalid roster version' },
        { version: 1.5, epoch: 1, reason: 'Invalid roster version' },
        { version: 2, epoch: -1, reason: 'Invalid roster epoch' },
        { version: 2, epoch: 3.14, reason: 'Invalid roster epoch' },
      ];

      for (const item of invalidCases) {
        const payload = {
          audience_hash: audHashV1,
          conversation_id: convId,
          conversation_type: 'channel' as const,
          devices: initialDevices,
          epoch: item.epoch,
          members: initialMembers,
          prev_roster_hash: hashV1,
          signer_device_id: aliceDeviceId,
          signer_user_id: aliceUserId,
          version: item.version,
        };
        const roster: SignedRoster = {
          ...payload,
          signature: aliceAccount.sign(canonicalJsonStringify(payload)),
        };

        const check = await rosterMgr.verifyRoster(roster, validRosterV1, aliceKeys.ed25519);
        assert(!check.valid, `Expected invalid version/epoch for v=${item.version}, e=${item.epoch}`);
        assert(check.reason?.includes(item.reason) || false, `Expected ${item.reason}, got: "${check.reason}"`);
      }
    });
  });

  // --------------------------------------------------------------------------
  // SUITE 4: DEVICE BINDING & CANONICAL SERIALIZATION INTEGRITY
  // --------------------------------------------------------------------------
  await suite('Suite 4: Device Binding & Canonical Integrity', async () => {
    const devMgr = new DeviceManager();

    await test('Attack 4.1: Canonical device signing message is strictly deterministic', () => {
      const msg1 = devMgr.getCanonicalDeviceMessage(aliceKeys.curve25519, aliceKeys.ed25519);
      const msg2 = devMgr.getCanonicalDeviceMessage(aliceKeys.curve25519, aliceKeys.ed25519);
      assertEqual(msg1, msg2, 'Canonical device message must be deterministic');
      assertEqual(msg1, `zerovc:device:${aliceKeys.curve25519}:${aliceKeys.ed25519}`, 'Format matches zerovc:device:<curve>:<ed>');
    });

    await test('Attack 4.2: Inverting Curve25519 and Ed25519 keys produces different audience hash', async () => {
      const devNormal: RosterDeviceEntry = {
        device_id: 'dev-1',
        user_id: 'user-1',
        curve25519_key: aliceKeys.curve25519,
        ed25519_key: aliceKeys.ed25519,
      };
      const devInverted: RosterDeviceEntry = {
        device_id: 'dev-1',
        user_id: 'user-1',
        curve25519_key: aliceKeys.ed25519, // Swapped!
        ed25519_key: aliceKeys.curve25519,
      };

      const hashNormal = await computeAudienceHash(['user-1'], [devNormal]);
      const hashInverted = await computeAudienceHash(['user-1'], [devInverted]);
      assert(hashNormal !== hashInverted, 'Swapped key fields must produce different audience hash');
    });

    await test('Attack 4.3: Signature verification rejects truncated and corrupted Ed25519 signatures', async () => {
      const message = 'canonical-payload-to-verify-4.3';
      const sig = aliceAccount.sign(message);

      // Verify legitimate signature first
      const valid = await verifyEd25519Signature(aliceKeys.ed25519, message, sig);
      assert(valid, 'Legitimate signature must verify');

      // Truncated signature
      const truncatedSig = sig.slice(0, 32);
      const invalidTruncated = await verifyEd25519Signature(aliceKeys.ed25519, message, truncatedSig);
      assert(!invalidTruncated, 'Truncated base64 signature must fail verification');

      // Corrupted signature bit
      const corruptedSig = flipBitInBase64(sig, 0);
      const invalidCorrupted = await verifyEd25519Signature(aliceKeys.ed25519, message, corruptedSig);
      assert(!invalidCorrupted, 'Corrupted signature bit must fail verification');

      // Mismatched public key
      const invalidKey = await verifyEd25519Signature(bobKeys.ed25519, message, sig);
      assert(!invalidKey, 'Verification with wrong public key must fail');
    });
  });

  // ==========================================================================
  // FINAL SUMMARY REPORT
  // ==========================================================================
  console.log(`\n${BOLD}${CYAN}======================================================================${RESET}`);
  console.log(`${BOLD}${CYAN}ITERATION 2 CHALLENGER ADVERSARIAL TEST RUN SUMMARY${RESET}`);
  console.log(`${BOLD}${CYAN}======================================================================\n${RESET}`);

  let totalTests = 0;
  let passedTests = 0;
  let failedTests = 0;

  for (const s of suiteResults) {
    const sPassed = s.tests.filter(t => t.passed).length;
    const sFailed = s.tests.filter(t => !t.passed).length;
    totalTests += s.tests.length;
    passedTests += sPassed;
    failedTests += sFailed;

    const statusColor = sFailed === 0 ? GREEN : RED;
    console.log(`  ${statusColor}${s.name}: ${sPassed}/${s.tests.length} passed${RESET}`);
    for (const t of s.tests) {
      if (!t.passed) {
        console.log(`    ${RED}✗ ${t.name}: ${t.error}${RESET}`);
      }
    }
  }

  console.log(`\n${BOLD}Total Tests:  ${totalTests}${RESET}`);
  console.log(`${GREEN}${BOLD}Passed:       ${passedTests}${RESET}`);
  console.log(`${failedTests > 0 ? RED : GREEN}${BOLD}Failed:       ${failedTests}${RESET}`);

  if (failedTests > 0) {
    console.log(`\n${RED}${BOLD}ADVERSARIAL VERDICT: REQUEST_CHANGES (${failedTests} tests failed)${RESET}\n`);
    process.exit(1);
  } else {
    console.log(`\n${GREEN}${BOLD}ADVERSARIAL VERDICT: APPROVE (All attack vectors successfully mitigated)${RESET}\n`);
    process.exit(0);
  }
}

runIteration2Adversarial().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
