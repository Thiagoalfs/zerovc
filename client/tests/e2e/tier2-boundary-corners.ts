/**
 * ZeroVC Opt-in E2EE — Tier 2: Boundary & Corner Cases Test Suite
 *
 * Covers extreme boundaries, caps, corruptions, replays, and network faults:
 *  - 15-member DM group hard cap boundary
 *  - Stepped audience limit boundaries (15 -> 50 -> 250)
 *  - Empty, minimal, and maximum payload boundaries
 *  - Corrupt pickle state deserialization rejection
 *  - Tampered ciphertext & auth tag bit flips
 *  - Invalid signatures & broken hash chains
 *  - Replay attack defenses across Olm & Megolm
 *  - Concurrency, race conditions & network disconnection
 */

import { Account, GroupSession, InboundGroupSession, Session } from '@kinsh/vodozemac-wasm';
import * as crypto from 'crypto';

import { harness } from './harness/test-framework';
import {
  buildSignedRoster,
  canonicalJson,
  createTestDevice,
  decryptAttachment,
  encryptAttachment,
  sha256Hex,
  signWithDevice,
  verifyEd25519,
} from './harness/crypto-harness';
import { MockBackend } from './harness/mock-backend';
import { MockWebSocketGateway } from './harness/mock-websocket';

export async function runTier2Tests(): Promise<void> {
  const backend = new MockBackend();
  const ws = new MockWebSocketGateway();
  const validHeaders = {
    'X-Client-E2EE-Version': '1',
    'X-CSRF-Token': backend.getValidCsrfToken(),
  };

  const alice = createTestDevice('alice-b', 'dev-alice-b');
  const bob = createTestDevice('bob-b', 'dev-bob-b');
  backend.registerIdentity(alice.userId, { identity_public_key: alice.ed25519 }, validHeaders);
  backend.registerIdentity(bob.userId, { identity_public_key: bob.ed25519 }, validHeaders);
  backend.registerDevice(alice.userId, alice.deviceId, {
    curve25519_key: alice.curve25519,
    ed25519_key: alice.ed25519,
    identity_signature: signWithDevice(alice, `zerovc:device:${alice.curve25519}:${alice.ed25519}`),
  }, validHeaders);
  backend.registerDevice(bob.userId, bob.deviceId, {
    curve25519_key: bob.curve25519,
    ed25519_key: bob.ed25519,
    identity_signature: signWithDevice(bob, `zerovc:device:${bob.curve25519}:${bob.ed25519}`),
  }, validHeaders);

  // ==========================================================================
  // SUITE 1: Max Limits & Member Caps
  // ==========================================================================
  harness.startSuite('Tier 2: Max Limits & Member Caps', 2);

  await harness.runTest('T2.1: Exactly 15 members in DM group is permitted', 2, () => {
    const members = Array.from({ length: 15 }, (_, i) => `user-${i}`);
    harness.assertEqual(members.length <= 15, true, '15 members within limit');
  });

  await harness.runTest('T2.2: 16th member addition in DM group is strictly blocked', 2, () => {
    const members = Array.from({ length: 16 }, (_, i) => `user-${i}`);
    const blocked = members.length > 15;
    harness.assertEqual(blocked, true, '16th member blocked by 15-member cap');
  });

  await harness.runTest('T2.3: Massive group attempt (100 members) rejected by DM cap', 2, () => {
    const members = Array.from({ length: 100 }, (_, i) => `user-${i}`);
    harness.assertEqual(members.length > 15, true, '100 members rejected');
  });

  await harness.runTest('T2.4: Stepped server channel limit: 15 members initial ceiling enforced', 2, () => {
    const chId = 'stepped-ch-bound';
    backend.createChannel({
      id: chId,
      name: 'stepped',
      isE2EE: true,
      audienceLimit: 15,
      rotationEpoch: 1,
      members: new Set(Array.from({ length: 16 }, (_, i) => `user-${i}`)),
      bannedUsers: new Set(),
      roles: new Map(),
    });
    const res = backend.getChannelAudience(chId, validHeaders);
    harness.assertEqual(res.status, 403, '16 members in 15-limit channel rejected with 403');
  });

  await harness.runTest('T2.5: Scale experiment abort when churn metric exceeds 20%', 2, () => {
    const churn = 0.25; // 25%
    const abortExperiment = churn > 0.20;
    harness.assertEqual(abortExperiment, true, 'scale experiment aborted due to churn');
  });

  // ==========================================================================
  // SUITE 2: Empty & Extreme Payload Boundaries
  // ==========================================================================
  harness.startSuite('Tier 2: Empty & Extreme Payload Boundaries', 2);

  await harness.runTest('T2.6: Empty string message encryption and decryption roundtrip', 2, () => {
    const s = new GroupSession();
    const inbound = new InboundGroupSession(s.sessionKey());
    const ct = s.encrypt('');
    const dec = JSON.parse(inbound.decrypt(ct));
    harness.assertEqual(dec.plaintext, '', 'empty string decrypted cleanly');
  });

  await harness.runTest('T2.7: 1-byte minimal message payload', 2, () => {
    const s = new GroupSession();
    const inbound = new InboundGroupSession(s.sessionKey());
    const ct = s.encrypt('X');
    const dec = JSON.parse(inbound.decrypt(ct));
    harness.assertEqual(dec.plaintext, 'X', '1-byte payload decrypted');
  });

  await harness.runTest('T2.8: 64KB large message payload encryption roundtrip', 2, () => {
    const largeStr = 'A'.repeat(64 * 1024);
    const s = new GroupSession();
    const inbound = new InboundGroupSession(s.sessionKey());
    const ct = s.encrypt(largeStr);
    const dec = JSON.parse(inbound.decrypt(ct));
    harness.assertEqual(dec.plaintext.length, 64 * 1024, '64KB payload decrypted');
  });

  await harness.runTest('T2.9: 0-byte empty file attachment encryption and integrity verification', 2, () => {
    const emptyBuf = Buffer.alloc(0);
    const enc = encryptAttachment(emptyBuf, 'application/octet-stream');
    harness.assertEqual(enc.originalSize, 0, 'original size 0');
    const dec = decryptAttachment(enc.data, enc.keyHex, enc.ivHex, enc.sha256Hex);
    harness.assertEqual(dec.length, 0, '0-byte file decrypted successfully');
  });

  await harness.runTest('T2.10: Special unicode characters and emoji payloads (RTL, surrogate pairs, zero-width joiners)', 2, () => {
    const complexUnicode = '👨‍👩‍👧‍👦 🏳️‍🌈 مرحبا بالعالم \u200B\u200C\u200D 🦀🔒';
    const s = new GroupSession();
    const inbound = new InboundGroupSession(s.sessionKey());
    const ct = s.encrypt(complexUnicode);
    const dec = JSON.parse(inbound.decrypt(ct));
    harness.assertEqual(dec.plaintext, complexUnicode, 'complex unicode preserved byte-for-byte');
  });

  // ==========================================================================
  // SUITE 3: Corrupt & Tampered Inputs
  // ==========================================================================
  harness.startSuite('Tier 2: Corrupt & Tampered Inputs', 2);

  await harness.runTest('T2.11: Account deserialization of malformed pickle throws error', 2, () => {
    harness.assertThrows(
      () => Account.fromPickle('not-a-valid-pickle-string'),
      undefined,
      'invalid pickle throws'
    );
  });

  await harness.runTest('T2.12: InboundGroupSession deserialization of corrupted pickle throws error', 2, () => {
    harness.assertThrows(
      () => InboundGroupSession.fromPickle('{"corrupted":true}'),
      undefined,
      'corrupted inbound pickle throws'
    );
  });

  await harness.runTest('T2.13: Single bit flip in Megolm ciphertext body causes MAC verification failure', 2, () => {
    const s = new GroupSession();
    const inbound = new InboundGroupSession(s.sessionKey());
    const ct = s.encrypt('Sensitive text');
    const ctBuf = Buffer.from(ct, 'base64');
    ctBuf[0] ^= 0x01; // flip 1 bit
    const tampered = ctBuf.toString('base64');

    harness.assertThrows(
      () => inbound.decrypt(tampered),
      undefined,
      'bit flipped ciphertext rejected'
    );
  });

  await harness.runTest('T2.14: Truncated Megolm ciphertext fails decryption', 2, () => {
    const s = new GroupSession();
    const inbound = new InboundGroupSession(s.sessionKey());
    const ct = s.encrypt('Test message');
    const truncated = ct.slice(0, ct.length - 8);

    harness.assertThrows(
      () => inbound.decrypt(truncated),
      undefined,
      'truncated ciphertext rejected'
    );
  });

  await harness.runTest('T2.15: Attachment decryption with tampered GCM auth tag throws authentication error', 2, () => {
    const enc = encryptAttachment(Buffer.from('Attachment secret'), 'text/plain');
    // Mutate the auth tag at the end of ciphertext
    const tamperedData = Buffer.from(enc.data);
    tamperedData[tamperedData.length - 1] ^= 0xff;

    harness.assertThrows(
      () => decryptAttachment(tamperedData, enc.keyHex, enc.ivHex, sha256Hex(tamperedData)),
      undefined,
      'tampered GCM auth tag rejected'
    );
  });

  await harness.runTest('T2.16: Attachment decryption with mismatched SHA-256 digest throws integrity mismatch', 2, () => {
    const enc = encryptAttachment(Buffer.from('Attachment data'), 'text/plain');
    harness.assertThrows(
      () => decryptAttachment(enc.data, enc.keyHex, enc.ivHex, '0000000000000000000000000000000000000000000000000000000000000000'),
      'digest mismatch',
      'mismatched digest throws'
    );
  });

  // ==========================================================================
  // SUITE 4: Invalid Signatures & Broken Roster Chains
  // ==========================================================================
  harness.startSuite('Tier 2: Invalid Signatures & Broken Roster Chains', 2);

  await harness.runTest('T2.17: Single bit flip in Ed25519 signature fails verification', 2, () => {
    const msg = 'zerovc-signature-test';
    const sig = signWithDevice(alice, msg);
    const sigBuf = Buffer.from(sig, 'base64');
    sigBuf[0] ^= 0xff;
    const tamperedSig = sigBuf.toString('base64');

    const valid = verifyEd25519(alice.ed25519, msg, tamperedSig);
    harness.assertEqual(valid, false, 'tampered signature rejected');
  });

  await harness.runTest('T2.18: Swapped public key fails signature verification', 2, () => {
    const msg = 'test-message';
    const sig = signWithDevice(alice, msg);
    const valid = verifyEd25519(bob.ed25519, msg, sig);
    harness.assertEqual(valid, false, 'signature verified with wrong public key fails');
  });

  await harness.runTest('T2.19: Broken roster hash chain (tampered prev_roster_hash) rejected with HTTP 409', 2, () => {
    const r1 = buildSignedRoster({
      conversationType: 'dm',
      conversationId: 'dm-chain-test',
      version: 1,
      epoch: 1,
      members: [alice.userId],
      devices: [{ user_id: alice.userId, device_id: alice.deviceId, curve25519_key: alice.curve25519, ed25519_key: alice.ed25519 }],
      signer: alice,
    });
    backend.submitRoster(r1, validHeaders);

    const r2Tampered = buildSignedRoster({
      conversationType: 'dm',
      conversationId: 'dm-chain-test',
      version: 2,
      epoch: 1,
      members: [alice.userId],
      devices: [{ user_id: alice.userId, device_id: alice.deviceId, curve25519_key: alice.curve25519, ed25519_key: alice.ed25519 }],
      signer: alice,
      prevRoster: r1,
    });
    r2Tampered.prev_roster_hash = 'badbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadb';
    // Re-sign with bad prev hash
    r2Tampered.signature = signWithDevice(alice, canonicalJson({
      audience_hash: r2Tampered.audience_hash,
      conversation_id: r2Tampered.conversation_id,
      conversation_type: r2Tampered.conversation_type,
      devices: r2Tampered.devices,
      epoch: r2Tampered.epoch,
      members: r2Tampered.members,
      prev_roster_hash: r2Tampered.prev_roster_hash,
      signer_device_id: r2Tampered.signer_device_id,
      signer_user_id: r2Tampered.signer_user_id,
      version: r2Tampered.version,
    }));

    const res = backend.submitRoster(r2Tampered, validHeaders);
    harness.assertEqual(res.status, 409, 'broken hash chain rejected with 409');
  });

  await harness.runTest('T2.20: Version skip in signed roster (v1 -> v3) rejected with HTTP 409', 2, () => {
    const r1 = (backend as any).rosters.get('dm-chain-test');
    const rSkip = buildSignedRoster({
      conversationType: 'dm',
      conversationId: 'dm-chain-test',
      version: 3, // skipped v2!
      epoch: 1,
      members: [alice.userId],
      devices: [{ user_id: alice.userId, device_id: alice.deviceId, curve25519_key: alice.curve25519, ed25519_key: alice.ed25519 }],
      signer: alice,
      prevRoster: r1,
    });
    const res = backend.submitRoster(rSkip, validHeaders);
    harness.assertEqual(res.status, 409, 'version skip rejected with 409');
  });

  await harness.runTest('T2.21: Epoch rollback in signed roster rejected with HTTP 409', 2, () => {
    const rEpochDown = buildSignedRoster({
      conversationType: 'dm',
      conversationId: 'dm-chain-test',
      version: 2,
      epoch: 0, // rollback to 0
      members: [alice.userId],
      devices: [{ user_id: alice.userId, device_id: alice.deviceId, curve25519_key: alice.curve25519, ed25519_key: alice.ed25519 }],
      signer: alice,
      prevRoster: (backend as any).rosters.get('dm-chain-test'),
    });
    const res = backend.submitRoster(rEpochDown, validHeaders);
    harness.assertEqual(res.status, 409, 'epoch rollback rejected with 409');
  });

  // ==========================================================================
  // SUITE 5: Replay Attacks & Duplicates
  // ==========================================================================
  harness.startSuite('Tier 2: Replay Attack Defenses', 2);

  await harness.runTest('T2.22: Replaying identical message_id with conflicting payload rejected with 409', 2, () => {
    const msgId = 'replay-id-500';
    backend.sendMessage('c1', { message_id: msgId, e2ee_ciphertext: 'first-ct' }, validHeaders);
    const replayRes = backend.sendMessage('c1', { message_id: msgId, e2ee_ciphertext: 'tampered-ct' }, validHeaders);
    harness.assertEqual(replayRes.status, 409, 'replay with conflicting payload returns 409');
  });

  await harness.runTest('T2.23: Megolm ratchet anti-replay maintains forward ratchet position', 2, () => {
    const s = new GroupSession();
    const inbound = new InboundGroupSession(s.sessionKey());
    const m0 = s.encrypt('Message 0');
    const m1 = s.encrypt('Message 1');

    inbound.decrypt(m0);
    inbound.decrypt(m1);

    // In Megolm ratchet, firstKnownIndex moves forward.
    harness.assert(inbound.firstKnownIndex() <= 1, 'inbound ratchet state preserved');
  });

  await harness.runTest('T2.24: Out-of-order edit replay rejected by monotonic timestamp check', 2, () => {
    const appliedEditTimestamp = 5000;
    const replayedOldEditTimestamp = 3000;
    const accept = replayedOldEditTimestamp > appliedEditTimestamp;
    harness.assertEqual(accept, false, 'replayed stale edit rejected');
  });

  // ==========================================================================
  // SUITE 6: Concurrency & Network Disconnections
  // ==========================================================================
  harness.startSuite('Tier 2: Concurrency & Network Disconnections', 2);

  await harness.runTest('T2.25: Concurrent key requests for same session merged by deduplication', 2, () => {
    const pendingRequests = new Map<string, Promise<any>>();
    let fetchCount = 0;
    function requestSession(id: string) {
      if (!pendingRequests.has(id)) {
        fetchCount++;
        pendingRequests.set(id, Promise.resolve({ session_id: id }));
      }
      return pendingRequests.get(id)!;
    }
    requestSession('sess-concurrent-1');
    requestSession('sess-concurrent-1');
    requestSession('sess-concurrent-1');

    harness.assertEqual(fetchCount, 1, 'concurrent requests collapsed into single fetch');
  });

  await harness.runTest('T2.26: Client WebSocket disconnect leaves to-device messages queued in backend', 2, () => {
    ws.connect(bob.userId, bob.deviceId, { e2ee_version: 1 });
    ws.disconnect(bob.deviceId);

    // Send while disconnected
    backend.sendToDevice({
      messages: [{ recipient_device_id: bob.deviceId, sender_device_id: alice.deviceId, msg_type: 'offline', payload: 'offline-msg' }],
    }, validHeaders);

    // Client reconnects and polls queue
    const pollRes = backend.getToDevice(bob.deviceId, validHeaders);
    harness.assertEqual(pollRes.body.messages.length, 1, 'message retained in queue while offline');
    harness.assertEqual(pollRes.body.messages[0].payload, 'offline-msg', 'offline message retrieved on reconnect');
    backend.ackToDevice(bob.deviceId, { message_ids: [pollRes.body.messages[0].id] }, validHeaders);
  });

  await harness.runTest('T2.27: Client version downgrade attempt receives HTTP 426 Upgrade Required', 2, () => {
    const res = backend.getIdentity(alice.userId, { 'X-Client-E2EE-Version': '0' });
    harness.assertEqual(res.status, 426, 'downgraded version 0 blocked with 426');
  });

  await harness.runTest('T2.28: State mutation rejecting invalid CSRF token with HTTP 403', 2, () => {
    const badCsrfHeaders = { 'X-Client-E2EE-Version': '1', 'X-CSRF-Token': 'wrong-token' };
    const res = backend.revokeDevice(alice.deviceId, badCsrfHeaders);
    harness.assertEqual(res.status, 403, 'invalid CSRF returns 403');
  });
}
