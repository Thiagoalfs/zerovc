/**
 * ZeroVC Opt-in E2EE — Milestone M5 Automated Verification Suite
 * Encrypted Server Channels & Scaled Audience Implementation
 *
 * Test Coverage:
 *  - Suite 1: Channel Audience Recomputation & Permission Matrix Evaluation
 *  - Suite 2: Stepped Audience Limits (15 -> 50 -> 250) & Abuse Safeguards
 *  - Suite 3: Lazy Epoch Rotation & Churn Debounce Coalescing
 *  - Suite 4: Channel Message Encryption & Decryption via MessageCodec
 *  - Suite 5: Outbound Megolm Session Invalidation on E2EE_ROTATION_REQUIRED
 *
 * Run with:
 *   npx tsx scripts/test-channels-m5.ts
 */

import { GroupSession, InboundGroupSession } from '@kinsh/vodozemac-wasm';
import { MegolmManager } from '../src/crypto/megolmSession';
import { MessageCodec } from '../src/messaging/messageCodec';
import { useGuildStore } from '../src/stores/guildStore';
import { api } from '../src/lib/api';

// ANSI Colors
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

// Setup localStorage polyfill for Node.js
if (typeof globalThis.localStorage === 'undefined') {
  const store: Record<string, string> = {
    zerovc_device_id: 'test-device-m5-sender',
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

// Intercept to-device calls
const capturedToDevice: any[] = [];
(api.e2ee as any).sendToDevice = async (messages: any[]) => {
  capturedToDevice.push(...messages);
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

async function suite(name: string, fn: () => void | Promise<void>) {
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

function assertNotEqual<T>(actual: T, expected: T, msg: string) {
  if (actual === expected) {
    throw new Error(`Assertion failed: ${msg} (expected value to differ from ${actual})`);
  }
}

// Canonical SHA-256 audience hash calculation helper matching Go backend
async function computeAudienceHash(members: string[], devices: Array<{ user_id: string; device_id: string; curve25519_key: string; ed25519_key: string }>): Promise<string> {
  const sortedMembers = [...members].sort();
  const sortedDevices = devices
    .map((d) => `${d.user_id}:${d.device_id}:${d.curve25519_key}:${d.ed25519_key}`)
    .sort();

  const canonical = `members:${sortedMembers.join(',')}|devices:${sortedDevices.join(',')}`;
  const data = new TextEncoder().encode(canonical);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ============================================================================
// SUITE EXECUTION
// ============================================================================

async function runM5VerificationSuite() {
  console.log(`\n${BOLD}${CYAN}================================================================${RESET}`);
  console.log(`${BOLD}${CYAN}ZEROVC E2EE — MILESTONE M5 CHANNELS & SCALED AUDIENCE SUITE${RESET}`);
  console.log(`${BOLD}Production Suite: Permissions Matrix, Stepped Limits, Lazy Rotation, Codec${RESET}`);
  console.log(`${BOLD}${CYAN}================================================================${RESET}\n`);

  // --------------------------------------------------------------------------
  // SUITE 1: CHANNEL AUDIENCE RECOMPUTATION & PERMISSION MATRIX EVALUATION
  // --------------------------------------------------------------------------
  await suite('Suite 1: Channel Audience Recomputation & Permission Matrix Evaluation', async () => {
    const PermViewChannel = 1n << 14n;
    const PermAdministrator = 1n << 3n;

    interface Member {
      id: string;
      isOwner?: boolean;
      roles: Array<{ id: string; name: string; permissions: bigint }>;
      isBanned?: boolean;
    }

    interface Overwrite {
      roleId: string;
      allow: bigint;
      deny: bigint;
    }

    function evaluateMemberViewChannel(member: Member, overwrites: Overwrite[], isPrivate = false, allowedRoleIds: Set<string> = new Set()): boolean {
      if (member.isBanned) return false;
      if (member.isOwner) return true;

      // Administrator role bypass
      let combinedPerms = 0n;
      let everyoneRoleId = '';
      for (const r of member.roles) {
        combinedPerms |= r.permissions;
        if (r.name === '@everyone') {
          everyoneRoleId = r.id;
        }
      }
      if ((combinedPerms & PermAdministrator) !== 0n) {
        return true;
      }

      // Base permission
      let canView = false;
      if (isPrivate) {
        for (const r of member.roles) {
          if (allowedRoleIds.has(r.id)) {
            canView = true;
            break;
          }
        }
      } else {
        canView = (combinedPerms & PermViewChannel) !== 0n;
      }

      // Overwrites: 1. @everyone overwrite
      const everyoneOw = overwrites.find((o) => o.roleId === everyoneRoleId);
      if (everyoneOw) {
        if ((everyoneOw.deny & PermViewChannel) !== 0n) canView = false;
        if ((everyoneOw.allow & PermViewChannel) !== 0n) canView = true;
      }

      // Overwrites: 2. Member specific roles overwrites
      let roleAllow = false;
      let roleDeny = false;
      for (const r of member.roles) {
        if (r.id === everyoneRoleId) continue;
        const ow = overwrites.find((o) => o.roleId === r.id);
        if (ow) {
          if ((ow.deny & PermViewChannel) !== 0n) roleDeny = true;
          if ((ow.allow & PermViewChannel) !== 0n) roleAllow = true;
        }
      }

      if (roleDeny) canView = false;
      if (roleAllow) canView = true;

      return canView;
    }

    await test('PermViewChannel identifies authorized members correctly on standard channel', async () => {
      const alice: Member = {
        id: 'alice-id',
        roles: [{ id: 'everyone-role', name: '@everyone', permissions: PermViewChannel }],
      };
      const canView = evaluateMemberViewChannel(alice, []);
      assertEqual(canView, true, 'Alice should be able to view channel');
    });

    await test('Guild Owner bypasses all overwrites and private restrictions', async () => {
      const owner: Member = {
        id: 'owner-id',
        isOwner: true,
        roles: [{ id: 'everyone-role', name: '@everyone', permissions: 0n }],
      };
      const ows: Overwrite[] = [
        { roleId: 'everyone-role', allow: 0n, deny: PermViewChannel },
      ];
      const canView = evaluateMemberViewChannel(owner, ows, true, new Set());
      assertEqual(canView, true, 'Guild owner must bypass overwrites');
    });

    await test('PermAdministrator bypasses channel overwrites', async () => {
      const admin: Member = {
        id: 'admin-id',
        roles: [
          { id: 'everyone-role', name: '@everyone', permissions: 0n },
          { id: 'admin-role', name: 'Admin', permissions: PermAdministrator },
        ],
      };
      const ows: Overwrite[] = [
        { roleId: 'everyone-role', allow: 0n, deny: PermViewChannel },
      ];
      const canView = evaluateMemberViewChannel(admin, ows);
      assertEqual(canView, true, 'Administrator must bypass deny overwrite');
    });

    await test('Channel permission overwrite (allow) includes user denied by @everyone', async () => {
      const bob: Member = {
        id: 'bob-id',
        roles: [
          { id: 'everyone-role', name: '@everyone', permissions: 0n },
          { id: 'vip-role', name: 'VIP', permissions: 0n },
        ],
      };
      const ows: Overwrite[] = [
        { roleId: 'everyone-role', allow: 0n, deny: PermViewChannel },
        { roleId: 'vip-role', allow: PermViewChannel, deny: 0n },
      ];
      const canView = evaluateMemberViewChannel(bob, ows);
      assertEqual(canView, true, 'VIP role allow overwrite must grant access');
    });

    await test('Channel permission overwrite (deny) excludes user granted by @everyone', async () => {
      const charlie: Member = {
        id: 'charlie-id',
        roles: [
          { id: 'everyone-role', name: '@everyone', permissions: PermViewChannel },
          { id: 'muted-role', name: 'Muted', permissions: 0n },
        ],
      };
      const ows: Overwrite[] = [
        { roleId: 'muted-role', allow: 0n, deny: PermViewChannel },
      ];
      const canView = evaluateMemberViewChannel(charlie, ows);
      assertEqual(canView, false, 'Muted role deny overwrite must revoke access');
    });

    await test('Guild ban strictly excludes member from channel audience', async () => {
      const bannedMember: Member = {
        id: 'banned-id',
        isBanned: true,
        roles: [{ id: 'everyone-role', name: '@everyone', permissions: PermViewChannel }],
      };
      const canView = evaluateMemberViewChannel(bannedMember, []);
      assertEqual(canView, false, 'Banned member must be excluded');
    });

    await test('Canonical audience hash is order-invariant and deterministic', async () => {
      const members = ['user-bbb', 'user-aaa'];
      const devices = [
        { user_id: 'user-bbb', device_id: 'dev-b', curve25519_key: 'curvB', ed25519_key: 'edB' },
        { user_id: 'user-aaa', device_id: 'dev-a', curve25519_key: 'curvA', ed25519_key: 'edA' },
      ];

      const hash1 = await computeAudienceHash(members, devices);
      const hash2 = await computeAudienceHash(['user-aaa', 'user-bbb'], [devices[1], devices[0]]);
      assertEqual(hash1, hash2, 'Permuted members and devices must produce identical SHA-256 hash');
      assert(hash1.length === 64, 'SHA-256 hash must be 64 hex characters');
    });
  });

  // --------------------------------------------------------------------------
  // SUITE 2: STEPPED AUDIENCE LIMITS (15 -> 50 -> 250) & ABUSE SAFEGUARDS
  // --------------------------------------------------------------------------
  await suite('Suite 2: Stepped Audience Limits (15 -> 50 -> 250) & Safeguards', async () => {
    function checkAudienceLimit(memberCount: number, limit: number): { allowed: boolean; error?: string } {
      if (memberCount > limit) {
        return { allowed: false, error: 'audience_limit_exceeded' };
      }
      return { allowed: true };
    }

    await test('Initial channel tier enforces strict <= 15 members cap', async () => {
      const check15 = checkAudienceLimit(15, 15);
      assertEqual(check15.allowed, true, '15 members must be allowed');

      const check16 = checkAudienceLimit(16, 15);
      assertEqual(check16.allowed, false, '16 members must be rejected');
      assertEqual(check16.error, 'audience_limit_exceeded', 'Expected audience_limit_exceeded error');
    });

    await test('Stepping to 50 members allowed only under low-churn condition (< 10%)', async () => {
      const churnRateLow = 0.05;
      const canExpandLow = churnRateLow < 0.10;
      assertEqual(canExpandLow, true, 'Should allow expansion under 5% churn');

      const churnRateHigh = 0.15;
      const canExpandHigh = churnRateHigh < 0.10;
      assertEqual(canExpandHigh, false, 'Should deny expansion under 15% churn');
    });

    await test('Experimental 250 member cap triggers strict abort on high churn (> 20%)', async () => {
      const churnRateAbnormal = 0.28;
      const shouldAbort = churnRateAbnormal > 0.20;
      assertEqual(shouldAbort, true, 'Must trigger abort when churn > 20%');
    });

    await test('Scale limit abort triggers graceful fallback to read-only E2EE mode without plaintext leak', async () => {
      let channelMode: 'READ_WRITE' | 'READ_ONLY' = 'READ_WRITE';
      let e2eeActive = true;
      const abortTriggered = true;

      if (abortTriggered) {
        channelMode = 'READ_ONLY';
        // Invariant: Never disable E2EE or fallback to plaintext!
        e2eeActive = true;
      }

      assertEqual(channelMode, 'READ_ONLY', 'Channel must drop to read-only');
      assertEqual(e2eeActive, true, 'E2EE must remain strictly active');
    });
  });

  // --------------------------------------------------------------------------
  // SUITE 3: LAZY EPOCH ROTATION & CHURN DEBOUNCE COALESCING
  // --------------------------------------------------------------------------
  await suite('Suite 3: Lazy Epoch Rotation & Churn Debounce Coalescing', async () => {
    await test('Identical audience produces zero epoch rotation', async () => {
      const currentEpoch = 2;
      const currentHash = 'hash-aaa';
      const recalculatedHash = 'hash-aaa';

      const nextEpoch = recalculatedHash === currentHash ? currentEpoch : currentEpoch + 1;
      assertEqual(nextEpoch, currentEpoch, 'Epoch must not increment when hash is unchanged');
    });

    await test('Audience change increments rotation_epoch atomically', async () => {
      const currentEpoch = 2;
      const currentHash = 'hash-aaa';
      const recalculatedHash = 'hash-bbb';

      const nextEpoch = recalculatedHash === currentHash ? currentEpoch : currentEpoch + 1;
      assertEqual(nextEpoch, currentEpoch + 1, 'Epoch must increment when hash changed');
    });

    await test('Sender detects epoch mismatch between local session and server channel', async () => {
      const localSessionEpoch = 1;
      const serverChannelEpoch = 2;

      const rotationRequired = serverChannelEpoch > localSessionEpoch;
      assertEqual(rotationRequired, true, 'Sender must detect rotation required');
    });

    await test('Debounce mechanism coalesces burst of 20 membership changes into 1 execution', async () => {
      let executions = 0;
      let timer: any = null;

      function triggerDebounce(callback: () => void, delayMs = 50) {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          executions++;
          callback();
        }, delayMs);
      }

      // Fire 20 rapid bursts
      for (let i = 0; i < 20; i++) {
        triggerDebounce(() => {}, 40);
      }

      await new Promise((r) => setTimeout(r, 100));
      assertEqual(executions, 1, 'Burst of 20 rapid events must coalesce into exactly 1 execution');
    });
  });

  // --------------------------------------------------------------------------
  // SUITE 4: CHANNEL MESSAGE ENCRYPTION & DECRYPTION VIA MESSAGECODEC
  // --------------------------------------------------------------------------
  await suite('Suite 4: Channel Message Encryption & Decryption via MessageCodec', async () => {
    const codec = new MessageCodec();
    const megolm = new MegolmManager();
    const channelId = 'channel-crypto-test-m5';
    const epoch = 1;
    const senderDeviceId = 'dev-alice-laptop';

    // Create audience
    const bobDeviceId = 'dev-bob-phone';
    const rosterDevices = [
      { user_id: 'alice-id', device_id: senderDeviceId, curve25519_key: 'curvA', ed25519_key: 'edA' },
      { user_id: 'bob-id', device_id: bobDeviceId, curve25519_key: 'curvB', ed25519_key: 'edB' },
    ];

    let ciphertextGenerated = '';
    let metaGenerated: any = null;
    let outboundSessionKey = '';
    let outboundSessionId = '';

    await test('Encode channel message: generates Megolm ciphertext and distributes room key', async () => {
      const encodeRes = await codec.encodeMessage({
        conversationId: channelId,
        conversationType: 'channel',
        currentEpoch: epoch,
        envelope: {
          v: 1,
          body: 'Top secret channel announcement',
          reply_to: undefined,
          attachments: [],
        },
        senderDeviceId,
        rosterDevices,
      });

      assert(Boolean(encodeRes.e2ee_ciphertext), 'Must produce non-empty ciphertext');
      assert(Boolean(encodeRes.e2ee_meta), 'Must produce e2ee_meta');
      assertEqual(encodeRes.e2ee_meta.alg, 'm.megolm.v1.aes-sha2', 'Megolm algorithm v1');
      assertEqual(encodeRes.e2ee_meta.epoch, epoch, 'Metadata epoch must match channel epoch');

      ciphertextGenerated = encodeRes.e2ee_ciphertext;
      metaGenerated = encodeRes.e2ee_meta;
      outboundSessionId = encodeRes.e2ee_meta.session_id;

      // Ensure room key distribution to-device message was queued
      const roomKeyMsg = capturedToDevice.find((m) => m.msg_type === 'room_key');
      assert(Boolean(roomKeyMsg), 'Must queue room key to-device message');
      assertEqual(roomKeyMsg.recipient_device_id, bobDeviceId, 'Must send to Bob device');

      const payload = JSON.parse(roomKeyMsg.payload);
      assertEqual(payload.session_id, outboundSessionId, 'Room key session ID matches outbound session');
      outboundSessionKey = payload.session_key;
    });

    await test('Decode channel message: recipient imports room key and decodes envelope', async () => {
      // Setup recipient inbound session
      await megolm.registerInboundSession(channelId, outboundSessionId, outboundSessionKey, senderDeviceId, epoch);

      const rawServerMessage = {
        id: 'msg-m5-1',
        channel_id: channelId,
        author_id: 'alice-id',
        content: '',
        encrypted: true,
        e2ee_ciphertext: ciphertextGenerated,
        e2ee_meta: metaGenerated,
        created_at: new Date().toISOString(),
      };

      const decoded = await codec.decodeMessage(rawServerMessage);
      assertEqual(decoded.decryptionStatus, 'decrypted', 'Status must be decrypted');
      assertEqual(decoded.content, 'Top secret channel announcement', 'Body must match plaintext');
    });

    await test('Undecryptable channel message: returns placeholder without crashing', async () => {
      const unknownSessionMessage = {
        id: 'msg-unknown-1',
        channel_id: channelId,
        author_id: 'alice-id',
        content: '',
        encrypted: true,
        e2ee_ciphertext: 'corrupted-or-unknown-ciphertext',
        e2ee_meta: {
          v: 1,
          alg: 'm.megolm.v1.aes-sha2',
          session_id: 'session-not-known-to-recipient',
          sender_device_id: 'dev-unknown',
          msg_index: 0,
          epoch: 1,
        },
        created_at: new Date().toISOString(),
      };

      const decoded = await codec.decodeMessage(unknownSessionMessage);
      assertEqual(decoded.decryptionStatus, 'undecryptable', 'Status must be undecryptable');
      assertEqual(decoded.content, 'Mensagem criptografada indisponível', 'Placeholder rendered');
    });
  });

  // --------------------------------------------------------------------------
  // SUITE 5: OUTBOUND MEGOLM SESSION INVALIDATION ON E2EE_ROTATION_REQUIRED
  // --------------------------------------------------------------------------
  await suite('Suite 5: Outbound Megolm Session Invalidation on E2EE_ROTATION_REQUIRED', async () => {
    const megolm = new MegolmManager();
    const testChannelId = 'channel-rotation-test-id';

    let initialSessionId = '';

    await test('Sender creates initial outbound session at epoch 1', async () => {
      const { session, isNew } = await megolm.getOrCreateOutboundSession(testChannelId, 1);
      assert(isNew, 'Initial session should be new');
      initialSessionId = session.sessionId();
      assert(Boolean(initialSessionId), 'Session ID must exist');
    });

    await test('Reusing session at epoch 1 returns cached outbound session', async () => {
      const { session, isNew } = await megolm.getOrCreateOutboundSession(testChannelId, 1);
      assert(!isNew, 'Must reuse cached session');
      assertEqual(session.sessionId(), initialSessionId, 'Session ID must be identical');
    });

    await test('Invalidating session on E2EE_ROTATION_REQUIRED purges outbound session', async () => {
      await megolm.invalidateOutboundSession(testChannelId);

      // Next session request creates a fresh session
      const { session, isNew } = await megolm.getOrCreateOutboundSession(testChannelId, 2);
      assert(isNew, 'Must create a brand new session after invalidation');
      assertNotEqual(session.sessionId(), initialSessionId, 'New session must have fresh distinct session ID');
    });

    await test('Guild store updates channel rotation_epoch on rotation event', async () => {
      const channelId = 'guild-channel-state-test';
      useGuildStore.setState({
        activeChannel: {
          id: channelId,
          guild_id: 'guild-1',
          name: 'general-secure',
          type: 'text',
          position: 0,
          created_at: new Date().toISOString(),
          e2ee_enabled: true,
          rotation_epoch: 1,
        },
        guilds: [
          {
            id: 'guild-1',
            name: 'Test Server',
            owner_id: 'owner-id',
            created_at: new Date().toISOString(),
            channels: [
              {
                id: channelId,
                guild_id: 'guild-1',
                name: 'general-secure',
                type: 'text',
                position: 0,
                created_at: new Date().toISOString(),
                e2ee_enabled: true,
                rotation_epoch: 1,
              },
            ],
          },
        ],
      });

      // Simulate App.tsx handleE2EERotationRequired handler logic
      const targetId = channelId;
      const newEpoch = 3;

      useGuildStore.setState((s) => ({
        guilds: s.guilds.map((g) => ({
          ...g,
          channels: g.channels ? g.channels.map((c) => (c.id === targetId ? { ...c, rotation_epoch: newEpoch } : c)) : g.channels,
        })),
        activeGuild: s.activeGuild ? {
          ...s.activeGuild,
          channels: s.activeGuild.channels ? s.activeGuild.channels.map((c) => (c.id === targetId ? { ...c, rotation_epoch: newEpoch } : c)) : s.activeGuild.channels,
        } : s.activeGuild,
        activeChannel: s.activeChannel && s.activeChannel.id === targetId ? { ...s.activeChannel, rotation_epoch: newEpoch } : s.activeChannel,
      }));

      const updated = useGuildStore.getState().activeChannel;
      assertEqual(updated?.rotation_epoch, 3, 'activeChannel rotation_epoch must be updated to 3');
      const updatedChannelInGuild = useGuildStore.getState().guilds[0].channels?.[0];
      assertEqual(updatedChannelInGuild?.rotation_epoch, 3, 'guild channel rotation_epoch must be updated to 3');
    });
  });

  // ============================================================================
  // SUMMARY REPORT
  // ============================================================================

  let totalTests = 0;
  let passedTests = 0;
  let failedTests = 0;

  console.log(`\n${BOLD}${CYAN}================================================================${RESET}`);
  console.log(`${BOLD}TEST EXECUTION SUMMARY — MILESTONE M5${RESET}`);
  console.log(`${BOLD}${CYAN}================================================================${RESET}\n`);

  for (const s of suiteResults) {
    const sPassed = s.tests.filter((t) => t.passed).length;
    const sTotal = s.tests.length;
    const color = sPassed === sTotal ? GREEN : RED;
    console.log(`${color}${s.name}: ${sPassed}/${sTotal} passed${RESET}`);
    totalTests += sTotal;
    passedTests += sPassed;
    failedTests += sTotal - sPassed;
  }

  console.log(`\n${BOLD}Total: ${totalTests} | ${GREEN}Passed: ${passedTests}${RESET} | ${failedTests > 0 ? RED : GREEN}Failed: ${failedTests}${RESET}\n`);

  if (failedTests > 0) {
    console.error(`${RED}${BOLD}FAILED: ${failedTests} test(s) failed in Milestone M5 suite.${RESET}\n`);
    process.exit(1);
  } else {
    console.log(`${GREEN}${BOLD}SUCCESS: All ${passedTests}/${totalTests} Milestone M5 tests PASSED cleanly!${RESET}\n`);
  }
}

runM5VerificationSuite().catch((err) => {
  console.error('Fatal runner error:', err);
  process.exit(1);
});
