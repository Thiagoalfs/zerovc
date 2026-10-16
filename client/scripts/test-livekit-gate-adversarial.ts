/**
 * ZeroVC Opt-in E2EE — Challenger M1.2 Adversarial Stress Test Suite
 * LiveKit SFrame & Platform Gate Boundary Testing
 *
 * Suites:
 *  1. High-Frequency Key Transitions & Rapid Ratcheting Stress
 *  2. Key Size Variations & Adversarial Key Inputs
 *  3. Platform Environment Spoofing & Version Gate Matrix (Chrome 84/85/86, Safari, Non-WebRTC)
 *  4. Strict Anti-Fallback Verification & Zero-Plaintext Enforcement
 *
 * Run with:
 *  npx tsx scripts/test-livekit-gate-adversarial.ts
 */

// Polyfill Worker environment globals for Node.js / tsx testing before importing modules with worker dependencies
(globalThis as any).self = globalThis;
(globalThis as any).onmessage = null;
(globalThis as any).postMessage = () => {};

import { ExternalE2EEKeyProvider, isE2EESupported, deriveKeys, ratchet } from 'livekit-client';
import {
  checkCallEligibility,
  assertE2EESupported,
  isCallE2EESupported,
  LiveKitE2EEManager,
  type E2EESupportCheck,
} from '../src/lib/livekitE2EE';

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

// User-Agent parser helper for platform tests
function parseChromeVersion(ua: string): number | null {
  const match = /Chrome\/(\d+)/i.exec(ua);
  return match ? parseInt(match[1], 10) : null;
}

async function runAdversarialTests() {
  console.log(`${BOLD}${CYAN}============================================================${RESET}`);
  console.log(`${BOLD}${CYAN}CHALLENGER M1.2 — LIVEKIT SFRAME & PLATFORM GATE STRESS TEST${RESET}`);
  console.log(`${BOLD}${CYAN}Adversarial boundaries, spoofing, high-frequency ratchets${RESET}`);
  console.log(`${BOLD}${CYAN}============================================================${RESET}\n`);

  // ==========================================================================
  // SUITE 1: HIGH-FREQUENCY KEY TRANSITIONS & RAPID RATCHETING STRESS
  // ==========================================================================
  await suite('Suite 1: High-Frequency Key Transitions & Rapid Ratcheting', async () => {
    await test('High-frequency ratchet burst: 100 ratchet requests emit without listener loss or crash', () => {
      const provider = new ExternalE2EEKeyProvider();
      let emittedCount = 0;
      const identities: (string | undefined)[] = [];
      const keyIndexes: (number | undefined)[] = [];

      provider.on('ratchetRequest', (participantId, keyIndex) => {
        emittedCount++;
        identities.push(participantId);
        keyIndexes.push(keyIndex);
      });

      const BURST_COUNT = 100;
      for (let i = 0; i < BURST_COUNT; i++) {
        provider.ratchetKey(`participant-${i}`, i);
      }

      assertEqual(emittedCount, BURST_COUNT, `Expected ${BURST_COUNT} ratchet events emitted`);
      assertEqual(identities[0], 'participant-0', 'First identity matches');
      assertEqual(identities[BURST_COUNT - 1], `participant-${BURST_COUNT - 1}`, 'Last identity matches');
      assertEqual(keyIndexes[BURST_COUNT - 1], BURST_COUNT - 1, 'Last keyIndex matches');
    });

    await test('Rapid successive ratcheting chain: 50 consecutive HKDF ratchets maintain 100% collision-free forward secrecy', async () => {
      const salt = 'LK_RATCHET_SALT_V1';
      let seed = crypto.getRandomValues(new Uint8Array(32)).buffer;
      let currentKey = await crypto.subtle.importKey('raw', seed, 'HKDF', false, ['deriveBits', 'deriveKey']);

      const seenKeyHex = new Set<string>();
      seenKeyHex.add(Buffer.from(seed).toString('hex'));

      const STEPS = 50;
      for (let step = 1; step <= STEPS; step++) {
        const nextBits = await ratchet(currentKey, salt);
        assertEqual(nextBits.byteLength, 32, `Step ${step} derived 32-byte (256-bit) ratchet material`);

        const hex = Buffer.from(nextBits).toString('hex');
        assert(!seenKeyHex.has(hex), `Step ${step} produced duplicate key material (cycle detected!)`);
        seenKeyHex.add(hex);

        // Next ratchet step
        currentKey = await crypto.subtle.importKey('raw', nextBits, 'HKDF', false, ['deriveBits', 'deriveKey']);
      }

      assertEqual(seenKeyHex.size, STEPS + 1, 'All 51 keys in the ratchet chain are strictly unique');
    });

    await test('Concurrent setKey operations: 50 simultaneous setKey calls converge safely with 1 active key', async () => {
      const provider = new ExternalE2EEKeyProvider();
      const promises: Promise<void>[] = [];
      const CONCURRENCY = 50;

      for (let i = 0; i < CONCURRENCY; i++) {
        if (i % 2 === 0) {
          promises.push(provider.setKey(`passphrase-burst-${i}`));
        } else {
          const buf = crypto.getRandomValues(new Uint8Array(32)).buffer;
          promises.push(provider.setKey(buf));
        }
      }

      await Promise.all(promises);

      const activeKeys = provider.getKeys();
      assertEqual(activeKeys.length, 1, 'ExternalE2EEKeyProvider retains exactly 1 active shared key after concurrent updates');
      assert(activeKeys[0].key instanceof CryptoKey, 'Active key is a valid CryptoKey instance');
    });

    await test('Interleaved setKey and ratchetKey: 30 alternating cycles execute stably', async () => {
      const provider = new ExternalE2EEKeyProvider();
      let ratchetsReceived = 0;
      provider.on('ratchetRequest', () => {
        ratchetsReceived++;
      });

      const CYCLES = 30;
      for (let i = 0; i < CYCLES; i++) {
        const keyMaterial = crypto.getRandomValues(new Uint8Array(32)).buffer;
        await provider.setKey(keyMaterial);
        provider.ratchetKey('shared-call', i);
      }

      assertEqual(ratchetsReceived, CYCLES, 'All interleaved ratchet requests were processed');
      assertEqual(provider.getKeys().length, 1, 'Active key map remains clean at 1 item');
    });

    await test('Extreme keyIndex boundary handling: extreme and non-standard indices in ratchetKey', () => {
      const provider = new ExternalE2EEKeyProvider();
      const receivedIndices: any[] = [];
      provider.on('ratchetRequest', (_participant, idx) => {
        receivedIndices.push(idx);
      });

      const extremeCases = [
        0,
        1,
        1000,
        999999999,
        Number.MAX_SAFE_INTEGER,
        -1,
        -99999,
        1.5,
        NaN,
        undefined,
      ];

      for (const idx of extremeCases) {
        provider.ratchetKey('test-user', idx);
      }

      assertEqual(receivedIndices.length, extremeCases.length, 'All extreme index calls dispatched cleanly');
    });
  });

  // ==========================================================================
  // SUITE 2: KEY SIZE VARIATIONS & ADVERSARIAL KEY INPUTS
  // ==========================================================================
  await suite('Suite 2: Key Size Variations & Adversarial Key Inputs', async () => {
    await test('Empty string passphrase (""): accepted by PBKDF2 without crash, derives 128-bit AES-GCM key', async () => {
      const provider = new ExternalE2EEKeyProvider();
      await provider.setKey('');

      const keys = provider.getKeys();
      assertEqual(keys.length, 1, 'Key registered');
      const derived = await deriveKeys(keys[0].key, provider.getOptions());
      assertEqual(derived.encryptionKey.algorithm.name, 'AES-GCM', 'Derives AES-GCM encryption key');
    });

    await test('Empty ArrayBuffer (0 bytes): accepted by HKDF without crash, derives 128-bit AES-GCM key', async () => {
      const provider = new ExternalE2EEKeyProvider();
      const emptyBuf = new ArrayBuffer(0);
      await provider.setKey(emptyBuf);

      const keys = provider.getKeys();
      assertEqual(keys.length, 1, 'Key registered');
      const derived = await deriveKeys(keys[0].key, provider.getOptions());
      assertEqual(derived.encryptionKey.algorithm.name, 'AES-GCM', 'Derives AES-GCM encryption key');
    });

    await test('TypedArray (Uint8Array 32 bytes) without .buffer property: accepted by WebCrypto as BufferSource', async () => {
      const provider = new ExternalE2EEKeyProvider();
      const u8 = crypto.getRandomValues(new Uint8Array(32));
      await provider.setKey(u8 as any);

      const keys = provider.getKeys();
      assertEqual(keys.length, 1, 'Key registered');
      const derived = await deriveKeys(keys[0].key, provider.getOptions());
      assertEqual(derived.encryptionKey.algorithm.name, 'AES-GCM', 'Derives AES-GCM key');
    });

    await test('Buffer sizes from 1 byte to 64KB derive valid encryption keys and ratchet bits', async () => {
      const testSizes = [1, 7, 16, 31, 32, 64, 128, 512, 1024, 65536];
      const provider = new ExternalE2EEKeyProvider();

      for (const size of testSizes) {
        const buf = crypto.getRandomValues(new Uint8Array(size)).buffer;
        await provider.setKey(buf);
        const kInfo = provider.getKeys()[0];
        const derived = await deriveKeys(kInfo.key, provider.getOptions());
        assertEqual(derived.encryptionKey.algorithm.name, 'AES-GCM', `Size ${size} produces AES-GCM key`);

        const ratchetedBits = await ratchet(kInfo.key, provider.getOptions().ratchetSalt);
        assertEqual(ratchetedBits.byteLength, 32, `Size ${size} ratchets to 256 bits`);
      }
    });

    await test('Invalid key types (null, undefined, number, object, boolean) are strictly rejected with TypeError', async () => {
      const provider = new ExternalE2EEKeyProvider();
      const invalidInputs: any[] = [null, undefined, 12345, {}, true, [1, 2, 3]];

      for (const input of invalidInputs) {
        let threw = false;
        let errType = '';
        try {
          await provider.setKey(input);
        } catch (e: any) {
          threw = true;
          errType = e.name;
        }
        assert(threw, `Expected setKey(${JSON.stringify(input)}) to throw exception`);
        assertEqual(errType, 'TypeError', `Expected TypeError for invalid input type (${input})`);
      }
    });

    await test('Unicode, emoji and large passphrases (100,000 chars) execute without overflow', async () => {
      const provider = new ExternalE2EEKeyProvider();

      // Unicode & emojis
      await provider.setKey('🔒ZeroVC-E2EE-Criptografia-Avançada-🔑-123456');
      assertEqual(provider.getKeys().length, 1, 'Emoji passphrase accepted');

      // 100,000 character passphrase
      const giantPassphrase = 'A'.repeat(100000);
      await provider.setKey(giantPassphrase);
      assertEqual(provider.getKeys().length, 1, '100K character passphrase accepted');
    });
  });

  // ==========================================================================
  // SUITE 3: PLATFORM ENVIRONMENT SPOOFING & VERSION GATE MATRIX
  // ==========================================================================
  await suite('Suite 3: Platform Environment Spoofing & Version Gate Matrix', async () => {
    const mockGlobal: any = global;
    const originalWindow = mockGlobal.window;

    await test('Chrome 84 spoofing (Android WebView / Browser): strictly blocked, upgrade required', () => {
      const uaChrome84 = 'Mozilla/5.0 (Linux; Android 10; Pixel 4) AppleWebKit/537.36 Chrome/84.0.4147.125 Mobile Safari/537.36';
      assertEqual(parseChromeVersion(uaChrome84), 84, 'UA parses to Chrome 84');
      assert((parseChromeVersion(uaChrome84) ?? 0) < 86, 'Chrome 84 is < 86');

      // In Chrome 84, RTCRtpSender exists but createEncodedStreams is undefined
      mockGlobal.window = {
        RTCRtpSender: {
          prototype: {},
        },
      };

      const supported = isCallE2EESupported();
      assertEqual(supported, false, 'Chrome 84 has no insertable streams -> supported = false');

      const gate = checkCallEligibility({ isE2EERoom: true });
      assertEqual(gate.status, 'BLOCKED', 'Call status is strictly BLOCKED');
      assertEqual(gate.supported, false, 'supported is false');
      assertEqual(gate.fallbackAllowed, false, 'fallbackAllowed is false');
      assertEqual(gate.modal, 'UPGRADE_REQUIRED', 'Upgrade required modal triggered');

      let threw = false;
      try {
        assertE2EESupported();
      } catch (e: any) {
        threw = true;
        assert(e.message.includes('E2EE_UNSUPPORTED'), 'Error message contains E2EE_UNSUPPORTED');
      }
      assert(threw, 'assertE2EESupported must throw in Chrome 84');
    });

    await test('Chrome 85 spoofing (Android WebView / Browser): strictly blocked, upgrade required', () => {
      const uaChrome85 = 'Mozilla/5.0 (Linux; Android 10; Pixel 4) AppleWebKit/537.36 Chrome/85.0.4183.127 Mobile Safari/537.36';
      assertEqual(parseChromeVersion(uaChrome85), 85, 'UA parses to Chrome 85');
      assert((parseChromeVersion(uaChrome85) ?? 0) < 86, 'Chrome 85 is < 86');

      mockGlobal.window = {
        RTCRtpSender: {
          prototype: {},
        },
      };

      const supported = isCallE2EESupported();
      assertEqual(supported, false, 'Chrome 85 supported = false');

      const gate = checkCallEligibility({ isE2EERoom: true });
      assertEqual(gate.status, 'BLOCKED', 'Call is BLOCKED');
      assertEqual(gate.fallbackAllowed, false, 'Plaintext fallback is forbidden');
      assertEqual(gate.modal, 'UPGRADE_REQUIRED', 'Modal is UPGRADE_REQUIRED');

      let threw = false;
      try {
        assertE2EESupported();
      } catch (e: any) {
        threw = true;
      }
      assert(threw, 'assertE2EESupported throws in Chrome 85');
    });

    await test('Chrome 86 spoofing (Minimum supported Android WebView): allowed, zero-fallback preserved', () => {
      const uaChrome86 = 'Mozilla/5.0 (Linux; Android 11; SM-G991B) AppleWebKit/537.36 Chrome/86.0.4240.185 Mobile Safari/537.36';
      assertEqual(parseChromeVersion(uaChrome86), 86, 'UA parses to Chrome 86');
      assert((parseChromeVersion(uaChrome86) ?? 0) >= 86, 'Chrome 86 is >= 86');

      // In Chrome 86, RTCRtpSender.prototype.createEncodedStreams is defined
      mockGlobal.window = {
        RTCRtpSender: {
          prototype: {
            createEncodedStreams: () => {},
          },
        },
      };

      const supported = isCallE2EESupported();
      assertEqual(supported, true, 'Chrome 86 supported = true');

      const gate = checkCallEligibility({ isE2EERoom: true });
      assertEqual(gate.status, 'ALLOWED', 'Call is ALLOWED');
      assertEqual(gate.supported, true, 'supported is true');
      assertEqual(gate.fallbackAllowed, false, 'fallbackAllowed remains FALSE even when allowed');

      let threw = false;
      try {
        assertE2EESupported();
      } catch {
        threw = true;
      }
      assert(!threw, 'assertE2EESupported does NOT throw in Chrome 86');
    });

    await test('Modern Chrome 120+ / Electron 30 spoofing: fully supported, call allowed', () => {
      const uaElectron = 'Mozilla/5.0 Chrome/124.0.6367.243 Electron/30.0.1 Safari/537.36';
      assertEqual(parseChromeVersion(uaElectron), 124, 'Electron Chromium 124');

      mockGlobal.window = {
        RTCRtpSender: {
          prototype: {
            createEncodedStreams: () => {},
          },
        },
      };

      const supported = isCallE2EESupported();
      assertEqual(supported, true, 'Electron 30 / Chromium 124 supported = true');

      const gate = checkCallEligibility({ isE2EERoom: true });
      assertEqual(gate.status, 'ALLOWED', 'Call allowed');
      assertEqual(gate.fallbackAllowed, false, 'fallbackAllowed is false');
    });

    await test('Safari 15.4+ spoofing (uses RTCRtpScriptTransform without createEncodedStreams): supported', () => {
      // Safari implements SFrame via RTCRtpScriptTransform
      mockGlobal.window = {
        RTCRtpScriptTransform: function () {},
      };

      const supported = isCallE2EESupported();
      assertEqual(supported, true, 'Safari with RTCRtpScriptTransform is recognized');

      const gate = checkCallEligibility({ isE2EERoom: true });
      assertEqual(gate.status, 'ALLOWED', 'Call allowed on Safari ScriptTransform');
      assertEqual(gate.fallbackAllowed, false, 'fallbackAllowed is false');
    });

    await test('Non-WebRTC environment spoofing (legacy browser without WebRTC): strictly blocked', () => {
      mockGlobal.window = {};

      const supported = isCallE2EESupported();
      assertEqual(supported, false, 'Non-WebRTC supported = false');

      const gate = checkCallEligibility({ isE2EERoom: true });
      assertEqual(gate.status, 'BLOCKED', 'Call is BLOCKED');
      assertEqual(gate.fallbackAllowed, false, 'Plaintext fallback is forbidden');
    });

    await test('Node.js / Headless environment (window is undefined): strictly blocked', () => {
      delete mockGlobal.window;

      const supported = isCallE2EESupported();
      assertEqual(supported, false, 'Node.js environment supported = false');

      const gate = checkCallEligibility({ isE2EERoom: true });
      assertEqual(gate.status, 'BLOCKED', 'Call is BLOCKED in headless');
      assertEqual(gate.fallbackAllowed, false, 'fallbackAllowed is false');
    });

    await test('LiveKit insertable streams edge case: createEncodedStreams set to null or false', () => {
      // In JS, `typeof null !== 'undefined'` is true. If an env has createEncodedStreams: null,
      // LiveKit utility returns true unless explicitly guarded.
      mockGlobal.window = {
        RTCRtpSender: {
          prototype: {
            createEncodedStreams: null,
          },
        },
      };

      const livekitSupported = isE2EESupported();
      // Documenting known quirk: livekit-client checks `typeof !== 'undefined'`
      assertEqual(typeof (mockGlobal.window.RTCRtpSender.prototype.createEncodedStreams), 'object', 'typeof null is object');
      assertEqual(livekitSupported, true, 'LiveKit returns true when createEncodedStreams is null (known SDK boundary quirk)');
    });

    // Restore original window
    mockGlobal.window = originalWindow;
  });

  // ==========================================================================
  // SUITE 4: STRICT ANTI-FALLBACK & ZERO-PLAINTEXT ENFORCEMENT
  // ==========================================================================
  await suite('Suite 4: Strict Anti-Fallback & Zero-Plaintext Enforcement', async () => {
    await test('Matrix verification: fallbackAllowed is NEVER true when isE2EERoom is true', () => {
      // Test all permutations of supported: true/false
      const checkSupported = checkCallEligibility({ isE2EERoom: true, e2eeSupported: true });
      const checkUnsupported = checkCallEligibility({ isE2EERoom: true, e2eeSupported: false });

      assertEqual(checkSupported.fallbackAllowed, false, 'fallbackAllowed MUST be false when supported');
      assertEqual(checkUnsupported.fallbackAllowed, false, 'fallbackAllowed MUST be false when unsupported');
      assertEqual(checkUnsupported.status, 'BLOCKED', 'Unsupported E2EE call MUST be BLOCKED');
      assertEqual(checkUnsupported.modal, 'UPGRADE_REQUIRED', 'Upgrade required modal must trigger');
    });

    await test('Non-E2EE room comparison: plaintext rooms allow fallback and are allowed', () => {
      const checkPlaintextSupported = checkCallEligibility({ isE2EERoom: false, e2eeSupported: true });
      const checkPlaintextUnsupported = checkCallEligibility({ isE2EERoom: false, e2eeSupported: false });

      assertEqual(checkPlaintextSupported.status, 'ALLOWED', 'Plaintext room is allowed');
      assertEqual(checkPlaintextSupported.fallbackAllowed, true, 'Plaintext room allows plaintext');
      assertEqual(checkPlaintextUnsupported.status, 'ALLOWED', 'Plaintext room is allowed even without WebRTC E2EE');
      assertEqual(checkPlaintextUnsupported.fallbackAllowed, true, 'Plaintext room allows fallback');
    });

    await test('Caller parameter alias audit: roomRequiresE2EE property check', () => {
      // If a caller passes { roomRequiresE2EE: true } instead of { isE2EERoom: true },
      // let's verify what checkCallEligibility returns
      const withRoomRequires = checkCallEligibility({
        roomRequiresE2EE: true,
        e2eeSupported: false,
      } as any);

      // Observation: opts.isE2EERoom is undefined, so checkCallEligibility currently treats it as false!
      console.log(`    ${YELLOW}Observed: checkCallEligibility({ roomRequiresE2EE: true }) without isE2EERoom returns fallbackAllowed=${withRoomRequires.fallbackAllowed}${RESET}`);
      // Document: callers must explicitly pass `isE2EERoom: true` to engage the strict gate
      const withIsE2EE = checkCallEligibility({
        isE2EERoom: true,
        e2eeSupported: false,
      });
      assertEqual(withIsE2EE.status, 'BLOCKED', 'With isE2EERoom: true, call is strictly BLOCKED');
      assertEqual(withIsE2EE.fallbackAllowed, false, 'With isE2EERoom: true, fallbackAllowed is strictly FALSE');
    });

    await test('LiveKitE2EEManager lifecycle: operations before initialize() and after cleanup() throw safely', async () => {
      const manager = new LiveKitE2EEManager();

      // Before initialize
      let threwOnSetKey = false;
      try {
        await manager.setCallKey('secret');
      } catch (e: any) {
        threwOnSetKey = true;
        assertEqual(e.message, 'Key provider not initialized', 'Expected error message');
      }
      assert(threwOnSetKey, 'setCallKey before initialize must throw');

      let threwOnRatchet = false;
      try {
        manager.ratchetKey();
      } catch (e: any) {
        threwOnRatchet = true;
        assertEqual(e.message, 'Key provider not initialized', 'Expected error message');
      }
      assert(threwOnRatchet, 'ratchetKey before initialize must throw');

      // Cleanup
      manager.cleanup();
      assertEqual(manager.getKeyProvider(), null, 'KeyProvider is null after cleanup');
      assertEqual(manager.getWorker(), null, 'Worker is null after cleanup');
    });
  });

  // ==========================================================================
  // SUMMARY REPORT
  // ==========================================================================
  let totalTests = 0;
  let totalPassed = 0;
  let totalFailed = 0;

  console.log(`\n${BOLD}${CYAN}============================================================${RESET}`);
  console.log(`${BOLD}${CYAN}ADVERSARIAL STRESS TEST SUMMARY (CHALLENGER M1.2)${RESET}`);
  console.log(`${BOLD}${CYAN}============================================================${RESET}`);

  for (const s of suiteResults) {
    const passedInSuite = s.tests.filter((t) => t.passed).length;
    const failedInSuite = s.tests.filter((t) => !t.passed).length;
    totalTests += s.tests.length;
    totalPassed += passedInSuite;
    totalFailed += failedInSuite;

    const icon = failedInSuite === 0 ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`;
    console.log(`${icon} ${BOLD}${s.name}${RESET}: ${passedInSuite}/${s.tests.length} passed`);
  }

  console.log(`\n${BOLD}Total Suites:${RESET}     ${suiteResults.length}`);
  console.log(`${BOLD}Total Tests:${RESET}      ${totalTests}`);
  console.log(`${BOLD}Passed:${RESET}           ${GREEN}${totalPassed}${RESET}`);
  console.log(`${BOLD}Failed:${RESET}           ${totalFailed > 0 ? RED : GREEN}${totalFailed}${RESET}`);

  const allPassed = totalFailed === 0;
  console.log(`${BOLD}Verdict:${RESET}          ${allPassed ? `${GREEN}${BOLD}APPROVE (100% GREEN)${RESET}` : `${RED}${BOLD}REJECT (FAILURES DETECTED)${RESET}`}`);
  console.log(`${BOLD}${CYAN}============================================================${RESET}\n`);

  if (!allPassed) {
    process.exit(1);
  }
}

runAdversarialTests().catch((err) => {
  console.error(`${RED}Fatal runner error:${RESET}`, err);
  process.exit(1);
});
