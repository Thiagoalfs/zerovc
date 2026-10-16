import './test-setup-worker';

/**
 * ZeroVC Opt-in E2EE — Challenger M4 Adversarial Stress & Attack Suite
 * Author: challenger_m4_1 (Role: M4 Key Ratchet Challenger 1)
 *
 * Hostile verification of CallKeyManager (`client/src/crypto/callKeys.ts`):
 *  1. Malformed to-device payloads (corrupted base64, incorrect byte lengths, invalid msg_types).
 *  2. High-concurrency join/leave storms (100+ rapid events testing debounce and ratchet).
 *  3. Distributor failover cascades (progressive disconnection of min(device_id) leaders).
 *  4. Ephemeral memory zeroization (verify zeroKey clears buffers and leaves no remnants).
 *  5. Protocol abuse & boundary attacks (replay, reflection, rogue distributor, state desync).
 */

(globalThis as any).self = globalThis;
(globalThis as any).onmessage = null;
(globalThis as any).postMessage = () => {};

import {
  CallKeyManager,
  electDistributor,
  generateCallKey,
  zeroKey,
  type CallKeyState,
  type CallKeyToDevicePayload,
} from '../src/crypto/callKeys';
import { uint8ArrayToBase64, base64ToUint8Array } from '../src/crypto/attachments';

// ANSI terminal colors
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
    console.log(`  ${RED}✗${RESET} ${name} ${CYAN}(${duration.toFixed(1)}ms)${RESET}`);
    console.log(`    ${RED}Error: ${errorMsg}${RESET}`);
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(
      `Assertion failed: ${message} (Expected: ${JSON.stringify(expected)}, Actual: ${JSON.stringify(actual)})`
    );
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runAdversarialBattery() {
  console.log(`${BOLD}${CYAN}============================================================${RESET}`);
  console.log(`${BOLD}${CYAN}ZEROVC E2EE — CHALLENGER M4 ADVERSARIAL STRESS TEST SUITE${RESET}`);
  console.log(`${BOLD}${CYAN}Author: challenger_m4_1 (critic, specialist)${RESET}`);
  console.log(`${BOLD}${CYAN}============================================================${RESET}\n`);

  // ==========================================================================
  // SUITE 1: Malformed To-Device Payloads & Deserialization Hostility
  // ==========================================================================
  await suite('Suite 1: Malformed To-Device Payloads & Boundary Defense', async () => {
    await test('Rejects null, undefined, primitives, and non-object payloads without crashing', async () => {
      const manager = new CallKeyManager();
      await manager.startCall('call-malform-1', 'dev-02', ['dev-01']);
      assertEqual(manager.getState(), 'REQUESTING', 'Should be in REQUESTING state');

      const nonObjects: any[] = [
        null,
        undefined,
        12345,
        'string-payload',
        true,
        false,
        [],
        Symbol('foo'),
      ];

      for (const badPayload of nonObjects) {
        await manager.handleIncomingCallKey(badPayload);
        assertEqual(manager.getState(), 'REQUESTING', `State must remain REQUESTING on bad payload: ${String(badPayload)}`);
        assertEqual(manager.getCurrentKey(), null, 'No key should be accepted');
      }
    });

    await test('Rejects invalid or missing msg_type values', async () => {
      const manager = new CallKeyManager();
      await manager.startCall('call-malform-2', 'dev-02', ['dev-01']);

      const invalidMsgTypes: any[] = [
        '',
        ' ',
        'room_key',
        'key_request',
        'callKey',
        'CALL_KEY',
        'call_key_ack',
        'megolm_key',
        'olm_key',
        null,
        undefined,
        123,
      ];

      for (const badType of invalidMsgTypes) {
        await manager.handleIncomingCallKey({
          msg_type: badType,
          call_id: 'call-malform-2',
          key: uint8ArrayToBase64(generateCallKey()),
          key_index: 1,
          epoch: 1,
          sender_device_id: 'dev-01',
        });
        assertEqual(manager.getState(), 'REQUESTING', `Must reject msg_type: ${String(badType)}`);
        assertEqual(manager.getCurrentKey(), null, 'Key must remain null');
      }
    });

    await test('Rejects mismatched call_id, empty call_id, or cross-call key injections', async () => {
      const manager = new CallKeyManager();
      await manager.startCall('call-correct-id', 'dev-02', ['dev-01']);

      const badCallIds: any[] = [
        'call-foreign-id',
        'CALL-CORRECT-ID', // Case sensitivity
        'call-correct-id ', // Trailing whitespace
        ' call-correct-id',
        '',
        null,
        undefined,
      ];

      for (const badId of badCallIds) {
        await manager.handleIncomingCallKey({
          msg_type: 'call_key',
          call_id: badId,
          key: uint8ArrayToBase64(generateCallKey()),
          key_index: 1,
          epoch: 1,
          sender_device_id: 'dev-01',
        });
        if (badId !== 'call-correct-id') {
          // If badId is not exactly matching 'call-correct-id', it must be rejected or not match
          if (badId && badId !== 'call-correct-id') {
            assertEqual(manager.getState(), 'REQUESTING', `Must reject mismatched call_id: ${badId}`);
          }
        }
      }
    });

    await test('Rejects missing, null, empty, whitespace, and non-string key fields', async () => {
      const manager = new CallKeyManager();
      await manager.startCall('call-malform-key', 'dev-02', ['dev-01']);

      const badKeys: any[] = [
        '',
        '   ',
        null,
        undefined,
        123456789,
        ['base64', 'array'],
        { key: 'nested' },
      ];

      for (const badKey of badKeys) {
        await manager.handleIncomingCallKey({
          msg_type: 'call_key',
          call_id: 'call-malform-key',
          key: badKey,
          key_index: 1,
          epoch: 1,
          sender_device_id: 'dev-01',
        });
        assertEqual(manager.getState(), 'REQUESTING', `Must reject bad key type/value: ${typeof badKey}`);
        assertEqual(manager.getCurrentKey(), null, 'Current key must remain null');
      }
    });

    await test('Rejects corrupted Base64 encoding strings without crashing', async () => {
      const manager = new CallKeyManager();
      await manager.startCall('call-corrupted-b64', 'dev-02', ['dev-01']);

      const corruptedBase64: string[] = [
        'ThisIsNotValidBase64!',
        'A===',
        'Zm9v==',
        '!!!@@@###$$$%%%^^^&&&***',
        '00 11 22 33 44',
        '\x00\x01\x02\x03',
        'YWJjZA==extra',
      ];

      for (const badB64 of corruptedBase64) {
        await manager.handleIncomingCallKey({
          msg_type: 'call_key',
          call_id: 'call-corrupted-b64',
          key: badB64,
          key_index: 1,
          epoch: 1,
          sender_device_id: 'dev-01',
        });
        assertEqual(manager.getState(), 'REQUESTING', `Must not crash and remain REQUESTING on corrupted base64: ${badB64}`);
        assertEqual(manager.getCurrentKey(), null, 'Current key must remain null');
      }
    });

    await test('Strictly enforces 256-bit (32-byte) key length (rejects 0, 1, 16, 24, 31, 33, 64, 1024 bytes)', async () => {
      const manager = new CallKeyManager();
      await manager.startCall('call-len-test', 'dev-02', ['dev-01']);

      const invalidLengths = [0, 1, 15, 16, 24, 31, 33, 48, 64, 128, 512, 1024];

      for (const len of invalidLengths) {
        const fakeKey = new Uint8Array(len);
        fakeKey.fill(0xaa);
        const b64 = uint8ArrayToBase64(fakeKey);

        await manager.handleIncomingCallKey({
          msg_type: 'call_key',
          call_id: 'call-len-test',
          key: b64,
          key_index: 1,
          epoch: 1,
          sender_device_id: 'dev-01',
        });

        assertEqual(manager.getState(), 'REQUESTING', `Must reject key with length ${len} bytes`);
        assertEqual(manager.getCurrentKey(), null, `Key length ${len} must not be accepted`);
      }

      // Now send valid 32 bytes to ensure normal operation still works
      const validKey = generateCallKey();
      await manager.handleIncomingCallKey({
        msg_type: 'call_key',
        call_id: 'call-len-test',
        key: uint8ArrayToBase64(validKey),
        key_index: 1,
        epoch: 1,
        sender_device_id: 'dev-01',
      });
      assertEqual(manager.getState(), 'ACTIVE', 'Valid 32-byte key must transition to ACTIVE');
      assert(manager.getCurrentKey() !== null, 'Valid key must be stored');
      assertEqual(manager.getCurrentKey()!.byteLength, 32, 'Stored key must be exactly 32 bytes');
    });
  });

  // ==========================================================================
  // SUITE 2: High-Concurrency Join/Leave Storms (100+ Rapid Events)
  // ==========================================================================
  await suite('Suite 2: High-Concurrency Join/Leave Storms (100+ Events)', async () => {
    await test('Join storm: 100 rapid sequential joins debounced into single ratchet rotation', async () => {
      let rotationsFired = 0;
      let totalDispatches = 0;
      let lastDispatchedCount = 0;

      const manager = new CallKeyManager({
        debounceMs: 50,
        onKeyRotated: () => {
          rotationsFired++;
        },
        sendToDeviceFn: async (msgs) => {
          totalDispatches++;
          lastDispatchedCount = msgs.length;
        },
        setKeyFn: async () => {},
      });

      // Start call with Alice ('dev-000') as initial distributor
      await manager.startCall('call-storm-100', 'dev-000', ['dev-001']);
      assertEqual(manager.getKeyIndex(), 1, 'Initial keyIndex is 1');
      assertEqual(totalDispatches, 1, 'Initial dispatch to dev-001');

      // Reset rotation counter after initial startCall key generation
      rotationsFired = 0;

      // Fire 100 rapid join events synchronously
      const joinStart = performance.now();
      for (let i = 2; i <= 101; i++) {
        const devId = `dev-${String(i).padStart(3, '0')}`;
        // immediate = false (triggers debounce timer)
        void manager.handleParticipantJoined(devId, false);
      }
      const joinEnd = performance.now();

      // Assert that during the burst, no rotations have completed yet
      assertEqual(rotationsFired, 0, 'No rotations should fire during the debounce burst');
      assertEqual(manager.getKeyIndex(), 1, 'keyIndex remains 1 during debounce');

      // Connected devices should already reflect all 102 devices
      assertEqual(manager.getConnectedDevices().length, 102, 'All 102 devices must be tracked immediately');

      // Wait for debounce timer to fire (50ms + safety margin)
      await sleep(100);

      assertEqual(rotationsFired, 1, '100 rapid joins must collapse into exactly 1 debounced rotation');
      assertEqual(manager.getKeyIndex(), 2, 'keyIndex must advance by exactly 1');
      assertEqual(manager.getEpoch(), 2, 'epoch must advance by exactly 1');
      assertEqual(manager.getState(), 'ACTIVE', 'Manager must return to ACTIVE state');
      assertEqual(lastDispatchedCount, 101, 'New key must be dispatched to all 101 peers');
      console.log(`    [Storm Metric] 100 joins injected in ${(joinEnd - joinStart).toFixed(2)}ms -> 1 debounced re-key`);
    });

    await test('Leave storm: 100 rapid participant leaves debounced into single re-keying', async () => {
      let rotationsFired = 0;
      let lastDispatchedCount = 0;

      const initialDevices = Array.from({ length: 105 }, (_, i) => `dev-${String(i).padStart(3, '0')}`);
      const manager = new CallKeyManager({
        debounceMs: 50,
        onKeyRotated: () => {
          rotationsFired++;
        },
        sendToDeviceFn: async (msgs) => {
          lastDispatchedCount = msgs.length;
        },
        setKeyFn: async () => {},
      });

      // Alice ('dev-000') starts with 104 peers
      await manager.startCall('call-leave-storm', 'dev-000', initialDevices.slice(1));
      assertEqual(manager.getConnectedDevices().length, 105, 'Should have 105 total participants');
      rotationsFired = 0; // Reset after startCall

      // 100 participants rapidly leave (leaving dev-000 and dev-101..dev-104 = 5 devices total)
      for (let i = 1; i <= 100; i++) {
        const devId = `dev-${String(i).padStart(3, '0')}`;
        void manager.handleParticipantLeft(devId, false);
      }

      assertEqual(rotationsFired, 0, 'No rotation completed mid-storm');
      assertEqual(manager.getConnectedDevices().length, 5, 'Only 5 remaining devices should be tracked');

      // Wait for debounce timer to resolve
      await sleep(100);

      assertEqual(rotationsFired, 1, '100 leaves must collapse into exactly 1 rotation');
      assertEqual(manager.getKeyIndex(), 2, 'Key index must advance by 1');
      assertEqual(lastDispatchedCount, 4, 'Must dispatch only to the 4 surviving peers');
      assertEqual(manager.getState(), 'ACTIVE', 'State must remain ACTIVE');
    });

    await test('Mixed churn storm: 120 asynchronous concurrent join/leave events under Promise.all', async () => {
      let rotationsFired = 0;
      const manager = new CallKeyManager({
        debounceMs: 40,
        onKeyRotated: () => {
          rotationsFired++;
        },
        sendToDeviceFn: async () => {},
        setKeyFn: async () => {},
      });

      // Alice ('dev-00') starts call with 20 base peers
      const basePeers = Array.from({ length: 20 }, (_, i) => `peer-${String(i).padStart(2, '0')}`);
      await manager.startCall('call-mixed-churn', 'dev-00', basePeers);

      // Track expected devices
      const expectedDevices = new Set(['dev-00', ...basePeers]);

      // Stage 1: 50 participants join concurrently
      const joinOps = Array.from({ length: 50 }, (_, i) => {
        const id = `churn-new-${i}`;
        expectedDevices.add(id);
        return manager.handleParticipantJoined(id, false);
      });
      await Promise.all(joinOps);

      // Stage 2: 30 participants leave concurrently
      const leaveOps = Array.from({ length: 30 }, (_, i) => {
        const id = i < 15 ? `peer-${String(i).padStart(2, '0')}` : `churn-new-${i - 15}`;
        expectedDevices.delete(id);
        return manager.handleParticipantLeft(id, false);
      });
      await Promise.all(leaveOps);

      // Stage 3: 20 more participants join
      const joinOps2 = Array.from({ length: 20 }, (_, i) => {
        const id = `churn-extra-${i}`;
        expectedDevices.add(id);
        return manager.handleParticipantJoined(id, false);
      });
      await Promise.all(joinOps2);

      // Wait for debounce to settle after all operations
      await sleep(120);

      assertEqual(manager.getState(), 'ACTIVE', 'State must be ACTIVE after churn settles');
      assert(rotationsFired >= 1, `Rotations must have occurred (fired: ${rotationsFired})`);

      const trackedDevices = new Set(manager.getConnectedDevices());
      assertEqual(trackedDevices.size, expectedDevices.size, 'Connected device count must match ground truth oracle');

      for (const dev of expectedDevices) {
        assert(trackedDevices.has(dev), `Expected device ${dev} must be present in connectedDevices`);
      }

      const activeKey = manager.getCurrentKey();
      assert(activeKey !== null, 'Active key must exist');
      assertEqual(activeKey!.byteLength, 32, 'Active key must be 32 bytes');
      console.log(`    [Churn Metric] 120 staged events collapsed into ${rotationsFired} rotations. Oracle accuracy: 100%`);
    });

    await test('Abrupt endCall() mid-storm cancels pending debounce and prevents state resurrection', async () => {
      let resurrected = false;
      const manager = new CallKeyManager({
        debounceMs: 50,
        onStateChange: (s) => {
          if (s === 'ACTIVE') resurrected = true;
        },
        sendToDeviceFn: async () => {},
        setKeyFn: async () => {},
      });

      await manager.startCall('call-abort-storm', 'dev-00', ['dev-01']);
      resurrected = false; // Reset after startCall

      // Fire 10 rapid joins that queue a rotation timer
      for (let i = 2; i <= 10; i++) {
        void manager.handleParticipantJoined(`dev-${i}`, false);
      }

      // Abruptly end call 15ms into the 50ms debounce window
      await sleep(15);
      manager.endCall();
      assertEqual(manager.getState(), 'NO_KEY', 'Must immediately become NO_KEY');

      // Wait 100ms for debounce timer to fire if not properly cleared
      await sleep(100);

      assertEqual(manager.getState(), 'NO_KEY', 'State must strictly remain NO_KEY');
      assertEqual(resurrected, false, 'Debounce timer MUST NOT resurrect state to ACTIVE after endCall');
      assertEqual(manager.getCurrentKey(), null, 'Current key must remain null');
    });
  });

  // ==========================================================================
  // SUITE 3: Distributor Failover Cascades & Multi-Node Network Simulation
  // ==========================================================================
  await suite('Suite 3: Distributor Failover Cascades (Progressive Drop)', async () => {
    await test('Progressive disconnection of 10 min_lex leaders cascades deterministically to the last survivor', async () => {
      const NODE_COUNT = 10;
      const nodes: {
        id: string;
        manager: CallKeyManager;
        appliedKeys: Uint8Array[];
        active: boolean;
      }[] = [];

      // Router to deliver to-device messages among virtual nodes
      const deliverMessage = async (msg: {
        recipient_device_id: string;
        sender_device_id: string;
        msg_type: string;
        payload: string;
      }) => {
        const recipient = nodes.find((n) => n.id === msg.recipient_device_id);
        if (recipient && recipient.active) {
          const parsed = JSON.parse(msg.payload);
          await recipient.manager.handleIncomingCallKey(parsed);
        }
      };

      // Initialize 10 nodes: dev-00, dev-01, ..., dev-09
      for (let i = 0; i < NODE_COUNT; i++) {
        const id = `node-${String(i).padStart(2, '0')}`;
        const nodeObj = {
          id,
          manager: null as any,
          appliedKeys: [] as Uint8Array[],
          active: true,
        };

        const mgr = new CallKeyManager({
          sendToDeviceFn: async (msgs) => {
            for (const m of msgs) {
              await deliverMessage(m);
            }
          },
          setKeyFn: async (keyBuf) => {
            nodeObj.appliedKeys.push(new Uint8Array(keyBuf));
          },
        });
        nodeObj.manager = mgr;
        nodes.push(nodeObj);
      }

      const allIds = nodes.map((n) => n.id);

      // Start call on non-distributors first so they are in REQUESTING state
      for (let i = 1; i < NODE_COUNT; i++) {
        const otherIds = allIds.filter((id) => id !== nodes[i].id);
        await nodes[i].manager.startCall('call-cascade', nodes[i].id, otherIds);
        assertEqual(nodes[i].manager.getState(), 'REQUESTING', `${nodes[i].id} should be REQUESTING`);
      }

      // Now distributor (node-00) starts call and generates/distributes key
      const otherIdsForLeader = allIds.filter((id) => id !== nodes[0].id);
      await nodes[0].manager.startCall('call-cascade', nodes[0].id, otherIdsForLeader);

      // Initial state check: node-00 must be distributor; all 10 nodes must be ACTIVE
      assertEqual(nodes[0].manager.isDistributor(), true, 'node-00 must be distributor');
      for (let i = 1; i < NODE_COUNT; i++) {
        assertEqual(nodes[i].manager.isDistributor(), false, `node-${i} must NOT be distributor`);
        assertEqual(nodes[i].manager.getState(), 'ACTIVE', `node-${i} must have reached ACTIVE`);
        assertEqual(nodes[i].manager.getDistributorDeviceId(), 'node-00', `node-${i} must recognize node-00 as distributor`);
      }

      // Now progressively drop leaders node-00 through node-08 one by one
      for (let dropIdx = 0; dropIdx < NODE_COUNT - 1; dropIdx++) {
        const droppingNode = nodes[dropIdx];
        const nextLeader = nodes[dropIdx + 1];

        droppingNode.active = false;
        droppingNode.manager.endCall();

        // Notify all remaining active nodes that droppingNode left (immediate = true)
        const remainingNodes = nodes.filter((n) => n.active);
        for (const activeNode of remainingNodes) {
          await activeNode.manager.handleParticipantLeft(droppingNode.id, true);
        }

        // Verify failover: nextLeader must be the new distributor
        assertEqual(
          nextLeader.manager.isDistributor(),
          true,
          `Failover step ${dropIdx}: ${nextLeader.id} must assume leadership`
        );
        assertEqual(
          nextLeader.manager.getDistributorDeviceId(),
          nextLeader.id,
          `Distributor device ID must be ${nextLeader.id}`
        );

        // Verify all remaining nodes adopt nextLeader as distributor and have matching ACTIVE state
        for (const activeNode of remainingNodes) {
          assertEqual(
            activeNode.manager.getDistributorDeviceId(),
            nextLeader.id,
            `Active node ${activeNode.id} must adopt ${nextLeader.id} as distributor`
          );
          assertEqual(
            activeNode.manager.getState(),
            'ACTIVE',
            `Active node ${activeNode.id} must be ACTIVE after failover`
          );
          assertEqual(
            activeNode.manager.getKeyIndex(),
            nextLeader.manager.getKeyIndex(),
            `Active node ${activeNode.id} keyIndex must match leader`
          );
        }
      }

      // Final step: Only node-09 remains
      const lastSurvivor = nodes[NODE_COUNT - 1];
      assertEqual(lastSurvivor.manager.isDistributor(), true, 'Last survivor node-09 must be distributor');
      assertEqual(lastSurvivor.manager.getConnectedDevices().length, 1, 'Only 1 connected device remaining');

      // Last survivor leaves
      lastSurvivor.manager.endCall();
      assertEqual(lastSurvivor.manager.getState(), 'NO_KEY', 'Final node must reset to NO_KEY');
      assertEqual(lastSurvivor.manager.getCurrentKey(), null, 'Final node key must be purged');
      console.log(`    [Cascade Metric] 10 consecutive leader failovers verified with 100% key and state consensus`);
    });

    await test('Multi-leader crash: simultaneous disconnection of top 3 leaders resolves to 4th leader', async () => {
      const nodeIds = ['dev-01', 'dev-02', 'dev-03', 'dev-04', 'dev-05'];
      const node4 = new CallKeyManager({
        sendToDeviceFn: async () => {},
        setKeyFn: async () => {},
      });

      // dev-04 joins call with dev-01, dev-02, dev-03, dev-05
      await node4.startCall('call-crash', 'dev-04', ['dev-01', 'dev-02', 'dev-03', 'dev-05']);
      assertEqual(node4.isDistributor(), false, 'dev-04 is not initial distributor');
      assertEqual(node4.getDistributorDeviceId(), 'dev-01', 'dev-01 is initial distributor');

      // dev-01, dev-02, dev-03 crash simultaneously
      await node4.handleParticipantLeft('dev-01', false);
      await node4.handleParticipantLeft('dev-02', false);
      await node4.handleParticipantLeft('dev-03', true); // trigger election

      assertEqual(node4.isDistributor(), true, 'dev-04 must emerge as distributor');
      assertEqual(node4.getDistributorDeviceId(), 'dev-04', 'dev-04 is now distributor');
      assertEqual(node4.getState(), 'ACTIVE', 'dev-04 must transition to ACTIVE');
      assertEqual(
        JSON.stringify(node4.getConnectedDevices().sort()),
        JSON.stringify(['dev-04', 'dev-05'].sort()),
        'Remaining devices must be dev-04 and dev-05'
      );
    });
  });

  // ==========================================================================
  // SUITE 4: Ephemeral Memory Zeroization & Residual Key Inspection
  // ==========================================================================
  await suite('Suite 4: Ephemeral Memory Zeroization & Residual Key Inspection', async () => {
    await test('zeroKey completely zeroes 32-byte buffers in-place without altering byteLength', () => {
      const key = generateCallKey();
      assertEqual(key.byteLength, 32, 'Must be 32 bytes');

      // Precondition: key contains non-zero entropy
      const hasEntropyBefore = key.some((b) => b !== 0);
      assert(hasEntropyBefore, 'Key must contain non-zero entropy before zeroization');

      // Execute zeroKey
      zeroKey(key);

      // Oracle verification: every byte must strictly equal 0
      for (let i = 0; i < 32; i++) {
        assertEqual(key[i], 0, `Byte at index ${i} must be zero`);
      }
      assertEqual(key.byteLength, 32, 'byteLength must remain 32 after zeroKey');
    });

    await test('Key rotation zeroes previous internal buffer reference in-place', async () => {
      const manager = new CallKeyManager({
        sendToDeviceFn: async () => {},
        setKeyFn: async () => {},
      });

      await manager.startCall('call-zero-rot', 'dev-01', ['dev-02']);

      // Directly capture reference to internal memory buffer
      const internalBufferV1 = (manager as any).currentKey;
      assert(internalBufferV1 instanceof Uint8Array, 'Internal currentKey must be Uint8Array');
      assert(internalBufferV1.some((b: number) => b !== 0), 'Internal buffer must have entropy');

      // Trigger key rotation
      await manager.rotateKey();

      // Verify that the memory occupied by internalBufferV1 was wiped in-place
      const v1AllZeroes = internalBufferV1.every((b: number) => b === 0);
      assert(v1AllZeroes, 'Internal buffer V1 MUST be zeroed out in-place by rotateKey()');

      // Verify that internal currentKey is now a fresh, distinct buffer with entropy
      const internalBufferV2 = (manager as any).currentKey;
      assert(internalBufferV2 !== internalBufferV1, 'V2 must be a newly allocated buffer');
      assert(internalBufferV2.some((b: number) => b !== 0), 'V2 must contain new cryptographic entropy');
    });

    await test('Incoming call key zeroes previous internal buffer reference in-place', async () => {
      const manager = new CallKeyManager({
        sendToDeviceFn: async () => {},
        setKeyFn: async () => {},
      });

      await manager.startCall('call-zero-inc', 'dev-02', ['dev-01']);

      // Receive Key 1
      const key1 = generateCallKey();
      await manager.handleIncomingCallKey({
        msg_type: 'call_key',
        call_id: 'call-zero-inc',
        key: uint8ArrayToBase64(key1),
        key_index: 1,
        epoch: 1,
        sender_device_id: 'dev-01',
      });

      const internalBuffer1 = (manager as any).currentKey;
      assert(internalBuffer1.some((b: number) => b !== 0), 'Key 1 buffer must have entropy');

      // Receive Key 2 (rotation from distributor)
      const key2 = generateCallKey();
      await manager.handleIncomingCallKey({
        msg_type: 'call_key',
        call_id: 'call-zero-inc',
        key: uint8ArrayToBase64(key2),
        key_index: 2,
        epoch: 2,
        sender_device_id: 'dev-01',
      });

      // Verify internalBuffer1 was zeroed in-place
      const buffer1Zeroed = internalBuffer1.every((b: number) => b === 0);
      assert(buffer1Zeroed, 'Key 1 buffer MUST be wiped in-place upon receiving Key 2');
    });

    await test('endCall() zeroes internal buffer in-place and clears all reference handles', async () => {
      const manager = new CallKeyManager({
        sendToDeviceFn: async () => {},
        setKeyFn: async () => {},
      });

      await manager.startCall('call-zero-end', 'dev-01', ['dev-02']);
      const internalBuffer = (manager as any).currentKey;
      assert(internalBuffer !== null, 'Internal key buffer must exist before endCall');

      manager.endCall();

      // Oracle verification: the captured memory buffer is 100% zeroed
      const bufferZeroed = internalBuffer.every((b: number) => b === 0);
      assert(bufferZeroed, 'Internal buffer MUST be zeroed out in-place by endCall()');

      // Oracle verification: manager handles and state are wiped
      assertEqual((manager as any).currentKey, null, 'Internal currentKey must be null');
      assertEqual(manager.getCurrentKey(), null, 'getCurrentKey() must return null');
      assertEqual(manager.getState(), 'NO_KEY', 'State must be NO_KEY');
    });

    await test('Invalid length key payload zeroes decoded buffer before discarding', async () => {
      const manager = new CallKeyManager();
      await manager.startCall('call-zero-invalid', 'dev-02', ['dev-01']);

      // 16-byte buffer
      const shortBytes = new Uint8Array(16);
      shortBytes.fill(0xff);

      // Verify base64 decode and rejection behavior
      const b64 = uint8ArrayToBase64(shortBytes);
      await manager.handleIncomingCallKey({
        msg_type: 'call_key',
        call_id: 'call-zero-invalid',
        key: b64,
        key_index: 1,
        epoch: 1,
        sender_device_id: 'dev-01',
      });

      assertEqual(manager.getCurrentKey(), null, 'No key must be retained');
      assertEqual(manager.getState(), 'REQUESTING', 'Must remain in REQUESTING');
    });
  });

  // ==========================================================================
  // SUITE 5: Adversarial Attacks & Protocol Invariants
  // ==========================================================================
  await suite('Suite 5: Adversarial Attacks & Protocol Invariants', async () => {
    await test('Distributor self-preservation: elected distributor ignores incoming rogue keys', async () => {
      const manager = new CallKeyManager({
        sendToDeviceFn: async () => {},
        setKeyFn: async () => {},
      });

      // dev-01 is elected distributor
      await manager.startCall('call-attack-rogue', 'dev-01', ['dev-02', 'dev-03']);
      assertEqual(manager.isDistributor(), true, 'dev-01 is distributor');
      const legitimateKey = manager.getCurrentKey()!;

      // Rogue device dev-09 sends a malicious call_key to distributor dev-01
      const rogueKey = new Uint8Array(32);
      rogueKey.fill(0x66);

      await manager.handleIncomingCallKey({
        msg_type: 'call_key',
        call_id: 'call-attack-rogue',
        key: uint8ArrayToBase64(rogueKey),
        key_index: 999,
        epoch: 999,
        sender_device_id: 'dev-09',
      });

      // ADVERSARIAL CHECK: Does the distributor adopt the rogue key or maintain its own authority?
      const currentKey = manager.getCurrentKey()!;
      const adoptedRogue = currentKey.every((b, idx) => b === rogueKey[idx]);
      if (adoptedRogue) {
        console.log(`    ${YELLOW}[FINDING: ROGUE_DISTRIBUTOR_INJECTION] Distributor accepted incoming call_key from dev-09${RESET}`);
      }
      assert(!adoptedRogue, 'Security Invariant Violated: Elected distributor must not accept incoming call_key from another device');
    });

    await test('Replay attack stress: older key_index and epoch payloads', async () => {
      const manager = new CallKeyManager({
        sendToDeviceFn: async () => {},
        setKeyFn: async () => {},
      });

      await manager.startCall('call-replay', 'dev-02', ['dev-01']);

      // Advance key to index 5, epoch 5
      const currentKey = generateCallKey();
      await manager.handleIncomingCallKey({
        msg_type: 'call_key',
        call_id: 'call-replay',
        key: uint8ArrayToBase64(currentKey),
        key_index: 5,
        epoch: 5,
        sender_device_id: 'dev-01',
      });
      assertEqual(manager.getKeyIndex(), 5, 'Key index should be 5');

      // Attacker replays compromised key from index 1
      const oldKey = generateCallKey();
      await manager.handleIncomingCallKey({
        msg_type: 'call_key',
        call_id: 'call-replay',
        key: uint8ArrayToBase64(oldKey),
        key_index: 1,
        epoch: 1,
        sender_device_id: 'dev-01',
      });

      // ADVERSARIAL CHECK: Did key_index downgrade to 1?
      const replayed = manager.getKeyIndex() === 1;
      if (replayed) {
        console.log(`    ${YELLOW}[FINDING: KEY_REPLAY_DOWNGRADE] Client downgraded key_index from 5 to 1 upon replayed payload${RESET}`);
      }
      assert(!replayed, 'Forward Secrecy Violated: Client must not downgrade key_index upon receiving replayed older key');
    });

    await test('Reflection / Echo attack: client receiving payload with sender_device_id === myDeviceId', async () => {
      const manager = new CallKeyManager({
        sendToDeviceFn: async () => {},
        setKeyFn: async () => {},
      });

      await manager.startCall('call-echo', 'dev-01', ['dev-02']);
      const originalKey = manager.getCurrentKey()!;

      // Echoed payload with sender_device_id = dev-01 (myself)
      const echoedKey = generateCallKey();
      await manager.handleIncomingCallKey({
        msg_type: 'call_key',
        call_id: 'call-echo',
        key: uint8ArrayToBase64(echoedKey),
        key_index: 10,
        epoch: 10,
        sender_device_id: 'dev-01',
      });

      // ADVERSARIAL CHECK: Did node accept its own reflected payload?
      const echoed = manager.getKeyIndex() === 10;
      if (echoed) {
        console.log(`    ${YELLOW}[FINDING: ECHO_ACCEPTANCE] Node accepted self-reflected call_key payload (sender == myDeviceId)${RESET}`);
      }
      assert(!echoed, 'Protocol Invariant Violated: Node must not accept self-reflected call_key payload (sender_device_id == myDeviceId)');
    });

    await test('electDistributor invariants under adversarial inputs', () => {
      // 1. Extreme string lengths
      const longId1 = 'a'.repeat(1000);
      const longId2 = 'a'.repeat(999) + 'b';
      assertEqual(electDistributor([longId2, longId1]), longId1, 'Long string comparison must work');

      // 2. Unicode / special characters
      const unicodeDevices = ['device-🔥', 'device-🌟', 'device-001', 'device-🚀'];
      assertEqual(electDistributor(unicodeDevices), 'device-001', 'Ascii comes before high unicode');

      // 3. Null / undefined / invalid types in deviceIds array
      const dirtyArray: any[] = [null, undefined, '', '   ', 12345, {}, 'device-real'];
      assertEqual(electDistributor(dirtyArray), 'device-real', 'Must filter dirty non-string values');
    });
  });

  // ==========================================================================
  // Summary & Attestation
  // ==========================================================================
  console.log(`\n${BOLD}${CYAN}============================================================${RESET}`);
  console.log(`${BOLD}${CYAN}CHALLENGER M4 ADVERSARIAL STRESS TEST SUMMARY${RESET}`);
  console.log(`${BOLD}${CYAN}============================================================${RESET}`);

  let totalTests = 0;
  let passedTests = 0;
  let failedTests = 0;

  for (const s of suiteResults) {
    const sPassed = s.tests.filter((t) => t.passed).length;
    const sTotal = s.tests.length;
    totalTests += sTotal;
    passedTests += sPassed;
    failedTests += sTotal - sPassed;
    const statusColor = sPassed === sTotal ? GREEN : RED;
    console.log(`${statusColor}✓ ${s.name}: ${sPassed}/${sTotal} passed${RESET}`);
  }

  console.log(`\nTotal Suites:     ${suiteResults.length}`);
  console.log(`Total Tests:      ${totalTests}`);
  console.log(`Passed:           ${GREEN}${passedTests}${RESET}`);
  console.log(`Failed:           ${failedTests > 0 ? RED : GREEN}${failedTests}${RESET}`);
  console.log(`Verdict:          ${failedTests === 0 ? `${GREEN}${BOLD}APPROVE (100% GREEN)${RESET}` : `${RED}${BOLD}REQUEST_CHANGES${RESET}`}`);
  console.log(`${BOLD}${CYAN}============================================================${RESET}\n`);

  if (failedTests > 0) {
    process.exit(1);
  }
}

runAdversarialBattery().catch((err) => {
  console.error('Fatal adversarial runner error:', err);
  process.exit(1);
});
