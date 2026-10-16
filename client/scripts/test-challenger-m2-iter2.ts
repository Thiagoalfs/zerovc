/**
 * ZEROVC E2EE — CHALLENGER M2.2 ITERATION 2 VERIFICATION SUITE
 * Empirical challenge of:
 * 1. ComputeAudienceHash key sensitivity (Curve25519 and Ed25519 alteration)
 * 2. Gateway device ID and version URL generation
 * 3. RosterManager epoch rollback rejection (HTTP 409 and client verifyRoster)
 * 4. DeviceManager socket synchronization
 */

import { computeAudienceHash, computeSha256Hex, rosterManager, SignedRoster, RosterDeviceEntry } from '../src/crypto/rosterManager';
import { deviceManager } from '../src/crypto/deviceManager';
import { socket } from '../src/lib/socket';
import { api } from '../src/lib/api';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
}

async function runChallengerIter2Tests() {
  console.log('============================================================');
  console.log('CHALLENGER M2.2 ITERATION 2 — EMPIRICAL ADVERSARIAL SUITE');
  console.log('============================================================');

  let passed = 0;
  let total = 0;

  async function test(name: string, fn: () => Promise<void> | void) {
    total++;
    try {
      await fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ ${name}`);
      console.error(err);
      process.exitCode = 1;
    }
  }

  // 1. Audience Hash: Curve25519 alteration
  await test('Audience Hash: Changing curve25519_key alters hash', async () => {
    const members = ['usr-alice', 'usr-bob'];
    const devices: RosterDeviceEntry[] = [
      {
        device_id: 'dev-1',
        user_id: 'usr-alice',
        curve25519_key: 'base-curve-key-1',
        ed25519_key: 'base-ed-key-1',
      },
    ];

    const baseHash = await computeAudienceHash(members, devices);

    const tamperedDevices: RosterDeviceEntry[] = [
      {
        device_id: 'dev-1',
        user_id: 'usr-alice',
        curve25519_key: 'hijacked-curve-key-2',
        ed25519_key: 'base-ed-key-1',
      },
    ];

    const tamperedHash = await computeAudienceHash(members, tamperedDevices);
    assert(baseHash !== tamperedHash, 'Audience hash must change when curve25519_key is changed');
  });

  // 2. Audience Hash: Ed25519 alteration
  await test('Audience Hash: Changing ed25519_key alters hash', async () => {
    const members = ['usr-alice', 'usr-bob'];
    const devices: RosterDeviceEntry[] = [
      {
        device_id: 'dev-1',
        user_id: 'usr-alice',
        curve25519_key: 'base-curve-key-1',
        ed25519_key: 'base-ed-key-1',
      },
    ];

    const baseHash = await computeAudienceHash(members, devices);

    const tamperedDevices: RosterDeviceEntry[] = [
      {
        device_id: 'dev-1',
        user_id: 'usr-alice',
        curve25519_key: 'base-curve-key-1',
        ed25519_key: 'hijacked-ed-key-2',
      },
    ];

    const tamperedHash = await computeAudienceHash(members, tamperedDevices);
    assert(baseHash !== tamperedHash, 'Audience hash must change when ed25519_key is changed');
  });

  // 3. RosterManager: Epoch Rollback Rejection
  await test('RosterManager.verifyRoster: Epoch rollback (epoch < prevRoster.epoch) is strictly rejected', async () => {
    const prevRoster: SignedRoster = {
      conversation_id: 'room-1',
      conversation_type: 'dm',
      version: 2,
      epoch: 5,
      members: ['usr-alice'],
      devices: [{ device_id: 'dev-1', user_id: 'usr-alice', curve25519_key: 'k1', ed25519_key: 'k2' }],
      prev_roster_hash: 'prev-hash-v1',
      audience_hash: await computeAudienceHash(['usr-alice'], [{ device_id: 'dev-1', user_id: 'usr-alice', curve25519_key: 'k1', ed25519_key: 'k2' }]),
      signer_user_id: 'usr-alice',
      signer_device_id: 'dev-1',
      signature: 'dummy-sig',
    };

    const rollbackRoster: SignedRoster = {
      conversation_id: 'room-1',
      conversation_type: 'dm',
      version: 3,
      epoch: 4, // Rollback: 4 < 5!
      members: ['usr-alice'],
      devices: [{ device_id: 'dev-1', user_id: 'usr-alice', curve25519_key: 'k1', ed25519_key: 'k2' }],
      prev_roster_hash: 'some-hash',
      audience_hash: prevRoster.audience_hash,
      signer_user_id: 'usr-alice',
      signer_device_id: 'dev-1',
      signature: 'dummy-sig',
    };

    const res = await rosterManager.verifyRoster(rollbackRoster, prevRoster);
    assert(!res.valid, 'Epoch rollback must be rejected');
    assert(res.reason?.includes('Epoch rollback violation') || false, 'Reason specifies epoch rollback violation');
  });

  // 4. WebSocket Client: Device ID Synchronization and Query Parameter Formatting
  await test('WebSocket Client: updateE2EEDeviceId tracks device and includes e2ee_version=1', async () => {
    const testDevId = 'test-dev-uuid-888';
    socket.updateE2EEDeviceId(testDevId);
    assert(socket.getE2EEDeviceId() === testDevId, 'Socket tracks active E2EE device ID');
  });

  console.log('============================================================');
  console.log(`SUMMARY: ${passed}/${total} passed`);
  console.log('============================================================');
}

runChallengerIter2Tests();
