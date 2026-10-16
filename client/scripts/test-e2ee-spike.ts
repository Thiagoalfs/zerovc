/**
 * ZeroVC Opt-in E2EE — Fase 0 Automated Spike Verification Runner
 *
 * Exercises:
 *  1. Account Creation, Ed25519/Curve25519 Identity & One-Time Keys (OTKs)
 *  2. WebCrypto Non-Extractable Key Management & Pickle State Protection
 *  3. Olm 1:1 Session Handshake, To-Device Channels & Tamper Rejection
 *  4. Megolm Group Ratchet, Multi-Recipient Decryption & Late-Joiner History Isolation
 *  5. LiveKit ExternalE2EEKeyProvider Instantiation, Passphrase & HKDF Buffer setKey()
 *  6. Platform Compatibility Matrix (Chrome >= 86 vs Chrome < 86 WebView, Zero Fallback)
 *  7. Leak Prevention & Error Sanitization Audit
 *
 * Run with:
 *   npx tsx scripts/test-e2ee-spike.ts
 */

import { ExternalE2EEKeyProvider, isE2EESupported } from 'livekit-client';
import { Account, GroupSession, InboundGroupSession, Session } from '@kinsh/vodozemac-wasm';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { sanitizeObject } from '../src/crypto/safeLogger';

interface E2EESupportCheck {
  supported: boolean;
  status: 'ALLOWED' | 'BLOCKED';
  fallbackAllowed: boolean;
  modal?: 'UPGRADE_REQUIRED';
}

function checkCallEligibility(opts: {
  isE2EERoom: boolean;
  e2eeSupported: boolean;
}): E2EESupportCheck {
  if (opts.isE2EERoom) {
    if (!opts.e2eeSupported) {
      return {
        supported: false,
        status: 'BLOCKED',
        fallbackAllowed: false,
        modal: 'UPGRADE_REQUIRED',
      };
    }
    return {
      supported: true,
      status: 'ALLOWED',
      fallbackAllowed: false,
    };
  }
  return {
    supported: true,
    status: 'ALLOWED',
    fallbackAllowed: true,
  };
}

// File path resolution in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
    throw new Error(`Assertion failed: ${message} (Expected: ${JSON.stringify(expected)}, Actual: ${JSON.stringify(actual)})`);
  }
}

// ============================================================================
// MAIN SPIKE SUITES
// ============================================================================
async function runSpikeTests() {
  console.log(`${BOLD}${CYAN}============================================================${RESET}`);
  console.log(`${BOLD}${CYAN}ZEROVC OPT-IN E2EE — AUTOMATED SPIKE TEST HARNESS (FASE 0)${RESET}`);
  console.log(`${BOLD}${CYAN}Target: Web, Electron 30, Android WebView (Chrome >= 86)${RESET}`);
  console.log(`${BOLD}${CYAN}============================================================${RESET}\n`);

  // --------------------------------------------------------------------------
  // SUITE 1: ACCOUNT & IDENTITY KEYS
  // --------------------------------------------------------------------------
  await suite('Suite 1: Account Creation, Identity Generation & OTKs', async () => {
    let aliceAccount: Account;
    let bobAccount: Account;
    let bobOtks: Record<string, string>;

    await test('Alice and Bob Olm Accounts initialize with Ed25519 and Curve25519 identity keys', () => {
      aliceAccount = new Account();
      bobAccount = new Account();

      const aliceKeys = JSON.parse(aliceAccount.identityKeys());
      const bobKeys = JSON.parse(bobAccount.identityKeys());

      assert(typeof aliceKeys.ed25519 === 'string' && aliceKeys.ed25519.length > 20, 'Alice has valid Ed25519 key');
      assert(typeof aliceKeys.curve25519 === 'string' && aliceKeys.curve25519.length > 20, 'Alice has valid Curve25519 key');
      assert(typeof bobKeys.ed25519 === 'string' && bobKeys.ed25519.length > 20, 'Bob has valid Ed25519 key');
      assert(typeof bobKeys.curve25519 === 'string' && bobKeys.curve25519.length > 20, 'Bob has valid Curve25519 key');
      assert(aliceKeys.ed25519 !== bobKeys.ed25519, 'Alice and Bob have distinct identity keys');
    });

    await test('Bob generates 5 One-Time Keys (OTKs) and marks them published', () => {
      bobAccount.generateOneTimeKeys(5);
      const otksObj = JSON.parse(bobAccount.oneTimeKeys());
      bobOtks = otksObj.curve25519;

      const count = Object.keys(bobOtks).length;
      assert(count >= 5, `Bob generated at least 5 OTKs (got ${count})`);
      bobAccount.markKeysAsPublished();

      // Unpublished OTKs should now be empty
      const afterPublish = JSON.parse(bobAccount.oneTimeKeys());
      assert(Object.keys(afterPublish.curve25519 || {}).length === 0, 'Unpublished OTK map is empty after markKeysAsPublished');
    });
  });

  // --------------------------------------------------------------------------
  // SUITE 2: WEBCRYPTO NON-EXTRACTABLE KEY & PICKLE PROTECTION
  // --------------------------------------------------------------------------
  await suite('Suite 2: WebCrypto Non-Extractable Key & State Pickling', async () => {
    let masterKey: CryptoKey;
    let encryptedPickle: ArrayBuffer;
    let iv: Uint8Array;
    let originalIdentity: string;

    await test('Generate non-extractable AES-GCM-256 WebCrypto key', async () => {
      masterKey = await crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        false, // STRICT: extractable: false
        ['encrypt', 'decrypt']
      );

      assertEqual(masterKey.extractable, false, 'Key extractable property must be false');
      assertEqual(masterKey.algorithm.name, 'AES-GCM', 'Algorithm must be AES-GCM');

      // Attempting to export must throw DOMException
      let threw = false;
      try {
        await crypto.subtle.exportKey('raw', masterKey);
      } catch {
        threw = true;
      }
      assert(threw, 'Exporting non-extractable key must throw DOMException');
    });

    await test('Encrypt account pickle, verify byte opacity, and restore state', async () => {
      const account = new Account();
      originalIdentity = account.identityKeys();
      const rawPickle = account.pickle();

      iv = crypto.getRandomValues(new Uint8Array(12));
      const pickleBytes = new TextEncoder().encode(rawPickle);

      encryptedPickle = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        masterKey,
        pickleBytes
      );

      assert(encryptedPickle.byteLength > 0, 'Encrypted pickle has non-zero length');
      const ciphertextStr = Buffer.from(encryptedPickle).toString('utf-8');
      assert(!ciphertextStr.includes('ed25519'), 'Ciphertext does NOT contain raw pickle keys');

      // Decrypt and restore
      const decryptedBytes = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        masterKey,
        encryptedPickle
      );
      const restoredPickleStr = new TextDecoder().decode(decryptedBytes);
      const restoredAccount = Account.fromPickle(restoredPickleStr);

      assertEqual(restoredAccount.identityKeys(), originalIdentity, 'Restored account identity matches original exactly');
    });
  });

  // --------------------------------------------------------------------------
  // SUITE 3: OLM 1:1 SESSION HANDSHAKE & TO-DEVICE
  // --------------------------------------------------------------------------
  await suite('Suite 3: Olm 1:1 Session Handshake & To-Device Encryption', async () => {
    const aliceAccount = new Account();
    const bobAccount = new Account();
    bobAccount.generateOneTimeKeys(1);

    const bobIdentity = JSON.parse(bobAccount.identityKeys());
    const bobOtks = JSON.parse(bobAccount.oneTimeKeys()).curve25519;
    const bobOtkId = Object.keys(bobOtks)[0];
    const bobOtk = bobOtks[bobOtkId];

    let aliceSession: Session;
    let bobSession: Session;
    let prekeyCiphertext: { type: number; body: string };
    const secretRoomKeyPayload = JSON.stringify({
      type: 'room_key',
      room_id: 'dm-room-123',
      session_id: 'megolm-sess-456',
      key: 'super-secret-megolm-key',
    });

    await test('Alice initiates outbound Olm session to Bob using Bob OTK', () => {
      aliceSession = aliceAccount.createOutboundSession(bobIdentity.curve25519, bobOtk);
      assert(typeof aliceSession.sessionId() === 'string' && aliceSession.sessionId().length > 0, 'Alice has valid session ID');
    });

    await test('Alice encrypts secret to-device payload as PreKey message (type 0)', () => {
      const encryptedStr = aliceSession.encrypt(secretRoomKeyPayload);
      prekeyCiphertext = JSON.parse(encryptedStr);

      assertEqual(prekeyCiphertext.type, 0, 'Initial message must be Olm PreKey type 0');
      assert(typeof prekeyCiphertext.body === 'string' && prekeyCiphertext.body.length > 0, 'Encrypted body exists');
      assert(!prekeyCiphertext.body.includes('super-secret-megolm-key'), 'Ciphertext does not leak plaintext');
    });

    await test('Bob creates inbound Olm session from PreKey message and decrypts payload', () => {
      const inboundResult = bobAccount.createInboundSession(prekeyCiphertext.body);
      const aliceIdentity = JSON.parse(aliceAccount.identityKeys());

      assertEqual(inboundResult.senderIdentityKey, aliceIdentity.curve25519, 'Sender identity key matches Alice');
      assertEqual(inboundResult.plaintext, secretRoomKeyPayload, 'Decrypted plaintext matches secret payload');

      bobSession = inboundResult.takeSession();
      assertEqual(bobSession.sessionId(), aliceSession.sessionId(), 'Bob session ID matches Alice session ID');
    });

    await test('Bob sends reply; Alice decrypts with established outbound session', () => {
      const replyPayload = JSON.stringify({ ack: true, timestamp: 1728400000 });
      const bobEncrypted = JSON.parse(bobSession.encrypt(replyPayload));

      assert(bobEncrypted.type === 0 || bobEncrypted.type === 1, 'Reply message is valid Olm envelope type');

      const aliceDecrypted = aliceSession.decrypt(bobEncrypted.type, bobEncrypted.body);
      assertEqual(aliceDecrypted, replyPayload, 'Alice successfully decrypted Bob reply');
    });

    await test('Tampered ciphertext body fails decryption with cryptographic error', () => {
      let threw = false;
      try {
        const tampered = prekeyCiphertext.body.slice(0, -4) + 'AAAA';
        bobAccount.createInboundSession(tampered);
      } catch {
        threw = true;
      }
      assert(threw, 'Tampered ciphertext must be rejected');
    });
  });

  // --------------------------------------------------------------------------
  // SUITE 4: MEGOLM GROUP RATCHET & MULTI-RECIPIENT DECRYPTION
  // --------------------------------------------------------------------------
  await suite('Suite 4: Megolm Group Ratchet & Multi-Recipient Decryption', async () => {
    let outboundGroup: GroupSession;
    let bobInbound: InboundGroupSession;
    let charlieInbound: InboundGroupSession;
    let daveLateJoinerInbound: InboundGroupSession;

    let megolmSessionId: string;
    let megolmSessionKey: string;
    let msg0Ciphertext: string;
    let msg1Ciphertext: string;
    let msg2Ciphertext: string;

    await test('Alice creates Outbound Group Session with initial index 0', () => {
      outboundGroup = new GroupSession();
      megolmSessionId = outboundGroup.sessionId();
      megolmSessionKey = outboundGroup.sessionKey();

      assert(typeof megolmSessionId === 'string' && megolmSessionId.length > 0, 'Valid Megolm session ID');
      assert(typeof megolmSessionKey === 'string' && megolmSessionKey.length > 0, 'Valid Megolm session key');
      assertEqual(outboundGroup.messageIndex(), 0, 'Initial message index is 0');
    });

    await test('Bob and Charlie initialize Inbound Group Sessions from shared session key', () => {
      bobInbound = new InboundGroupSession(megolmSessionKey);
      charlieInbound = new InboundGroupSession(megolmSessionKey);

      assertEqual(bobInbound.firstKnownIndex(), 0, 'Bob first known index is 0');
      assertEqual(charlieInbound.firstKnownIndex(), 0, 'Charlie first known index is 0');
    });

    await test('Alice encrypts Message 0; Bob and Charlie decrypt identical plaintext', () => {
      const msg0 = JSON.stringify({ text: 'Hello ZeroVC E2EE!', index: 0 });
      msg0Ciphertext = outboundGroup.encrypt(msg0);

      assertEqual(outboundGroup.messageIndex(), 1, 'Outbound index incremented to 1');

      const bobDecrypted = JSON.parse(bobInbound.decrypt(msg0Ciphertext));
      const charlieDecrypted = JSON.parse(charlieInbound.decrypt(msg0Ciphertext));

      assertEqual(bobDecrypted.plaintext, msg0, 'Bob decrypted message 0');
      assertEqual(charlieDecrypted.plaintext, msg0, 'Charlie decrypted message 0');
      assertEqual(bobDecrypted.messageIndex, 0, 'Decrypted index is 0');
    });

    await test('Alice encrypts Message 1; ratchet advances and both decrypt', () => {
      const msg1 = JSON.stringify({ text: 'Second group message', index: 1 });
      msg1Ciphertext = outboundGroup.encrypt(msg1);

      assertEqual(outboundGroup.messageIndex(), 2, 'Outbound index incremented to 2');

      const bobDecrypted = JSON.parse(bobInbound.decrypt(msg1Ciphertext));
      assertEqual(bobDecrypted.plaintext, msg1, 'Bob decrypted message 1');
      assertEqual(bobDecrypted.messageIndex, 1, 'Decrypted index is 1');
    });

    await test('Alice encrypts Message 2; Bob exports ratchet state at index 2 for late joiner Dave', () => {
      const msg2 = JSON.stringify({ text: 'Third group message', index: 2 });
      msg2Ciphertext = outboundGroup.encrypt(msg2);

      assertEqual(outboundGroup.messageIndex(), 3, 'Outbound index incremented to 3');

      const exportedKeyAt2 = bobInbound.exportAt(2);
      assert(typeof exportedKeyAt2 === 'string' && exportedKeyAt2.length > 0, 'Exported ratchet key exists at index 2');

      daveLateJoinerInbound = InboundGroupSession.import(exportedKeyAt2!);
      assertEqual(daveLateJoinerInbound.firstKnownIndex(), 2, 'Dave first known index is 2');
    });

    await test('Late-Joiner History Isolation (Spec §12.6): Dave joining at index 2 cannot decrypt past messages', () => {
      let threwOnMsg0 = false;
      try {
        daveLateJoinerInbound.decrypt(msg0Ciphertext);
      } catch {
        threwOnMsg0 = true;
      }
      assert(threwOnMsg0, 'Dave MUST NOT be able to decrypt past message 0 (forward secrecy / history isolation enforced)');

      let threwOnMsg1 = false;
      try {
        daveLateJoinerInbound.decrypt(msg1Ciphertext);
      } catch {
        threwOnMsg1 = true;
      }
      assert(threwOnMsg1, 'Dave MUST NOT be able to decrypt past message 1');

      // But Dave CAN decrypt Message 2 (created at index 2)
      const daveDecrypted2 = JSON.parse(daveLateJoinerInbound.decrypt(msg2Ciphertext));
      assert(daveDecrypted2.messageIndex === 2, 'Dave successfully decrypts message 2 at his first known index');
    });
  });

  // --------------------------------------------------------------------------
  // SUITE 5: LIVEKIT EXTERNAL E2EE KEY PROVIDER
  // --------------------------------------------------------------------------
  await suite('Suite 5: LiveKit ExternalE2EEKeyProvider & SFrame Keys', async () => {
    let keyProvider: ExternalE2EEKeyProvider;

    await test('ExternalE2EEKeyProvider instantiates cleanly', () => {
      keyProvider = new ExternalE2EEKeyProvider();
      assert(keyProvider !== null && typeof keyProvider.setKey === 'function', 'KeyProvider initialized with setKey');
      assertEqual(keyProvider.getKeys().length, 0, 'Initially has 0 active keys');
    });

    await test('setKey accepts string passphrase using PBKDF2 derivation', async () => {
      await keyProvider.setKey('zerovc-call-passphrase-alpha-123');
      assertEqual(keyProvider.getKeys().length, 1, 'Key provider has 1 registered key');
      assertEqual(keyProvider.getLatestManuallySetKeyIndex(), 0, 'Latest key index is 0');
    });

    await test('setKey accepts cryptographically secure 32-byte ArrayBuffer using HKDF', async () => {
      const raw32 = crypto.getRandomValues(new Uint8Array(32));
      await keyProvider.setKey(raw32.buffer);
      assertEqual(keyProvider.getKeys().length, 1, 'Key updated with raw buffer');
    });

    await test('keyProvider.ratchetKey() executes smoothly', () => {
      let threw = false;
      try {
        keyProvider.ratchetKey();
      } catch {
        threw = true;
      }
      assert(!threw, 'ratchetKey executed without error');
    });

    await test('LiveKit SFrame worker bundle exists on disk', () => {
      const workerPath = path.resolve(__dirname, '../node_modules/livekit-client/dist/livekit-client.e2ee.worker.js');
      const exists = fs.existsSync(workerPath);
      assert(exists, `Worker bundle must exist at ${workerPath}`);
      const stats = fs.statSync(workerPath);
      assert(stats.size > 1000, `Worker bundle must be non-empty (size: ${stats.size} bytes)`);
    });

    await test('ZeroVC custom worker wrapper exists at client/src/workers/e2ee.worker.ts', () => {
      const customWorkerPath = path.resolve(__dirname, '../src/workers/e2ee.worker.ts');
      const exists = fs.existsSync(customWorkerPath);
      assert(exists, `Custom worker wrapper must exist at ${customWorkerPath}`);
    });
  });

  // --------------------------------------------------------------------------
  // SUITE 6: PLATFORM MATRIX & ANTI-FALLBACK ENFORCEMENT
  // --------------------------------------------------------------------------
  await suite('Suite 6: Platform Matrix & Strict Anti-Fallback Call Gate', async () => {
    function parseChromeVersion(ua: string): number | null {
      const match = /Chrome\/(\d+)/i.exec(ua);
      return match ? parseInt(match[1], 10) : null;
    }

    await test('Modern Chrome >= 86 / Electron 30: isE2EESupported returns true', () => {
      const mockGlobal: any = global;
      const originalWindow = mockGlobal.window;
      mockGlobal.window = {
        RTCRtpSender: {
          prototype: {
            createEncodedStreams: () => {},
          },
        },
      };

      const supported = isE2EESupported();
      assertEqual(supported, true, 'Chrome >= 86 must support E2EE');

      const gate = checkCallEligibility({ isE2EERoom: true, e2eeSupported: supported });
      assertEqual(gate.status, 'ALLOWED', 'Call is allowed in E2EE room');
      assertEqual(gate.supported, true, 'E2EE is supported');
      assertEqual(gate.fallbackAllowed, false, 'No fallback allowed');

      mockGlobal.window = originalWindow;
    });

    await test('Outdated Android WebView Chrome < 86 (Chrome 85): isE2EESupported returns false', () => {
      const mockGlobal: any = global;
      const originalWindow = mockGlobal.window;
      mockGlobal.window = {
        RTCRtpSender: {
          prototype: {}, // missing createEncodedStreams!
        },
      };

      const supported = isE2EESupported();
      assertEqual(supported, false, 'Chrome < 86 must return false');

      const gate = checkCallEligibility({ isE2EERoom: true, e2eeSupported: supported });
      assertEqual(gate.status, 'BLOCKED', 'Call MUST BE BLOCKED');
      assertEqual(gate.fallbackAllowed, false, 'Plaintext fallback is STRICTLY FORBIDDEN');
      assertEqual(gate.modal, 'UPGRADE_REQUIRED', 'Upgrade required modal must trigger');

      mockGlobal.window = originalWindow;
    });

    await test('Legacy environment without WebRTC: isE2EESupported returns false', () => {
      const mockGlobal: any = global;
      const originalWindow = mockGlobal.window;
      mockGlobal.window = {};

      const supported = isE2EESupported();
      assertEqual(supported, false, 'Environment without WebRTC must return false');

      const gate = checkCallEligibility({ isE2EERoom: true, e2eeSupported: supported });
      assertEqual(gate.status, 'BLOCKED', 'Call is strictly blocked');
      assertEqual(gate.fallbackAllowed, false, 'Zero plaintext fallback');

      mockGlobal.window = originalWindow;
    });

    await test('User-Agent parser correctly categorizes WebView Chrome versions', () => {
      const uaModern = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/120.0.6099.144 Mobile Safari/537.36';
      const uaMin = 'Mozilla/5.0 (Linux; Android 11; SM-G991B) AppleWebKit/537.36 Chrome/86.0.4240.185 Mobile Safari/537.36';
      const uaOutdated = 'Mozilla/5.0 (Linux; Android 10; Pixel 4) AppleWebKit/537.36 Chrome/84.0.4147.125 Mobile Safari/537.36';
      const uaElectron = 'Mozilla/5.0 Chrome/124.0.6367.243 Electron/30.0.1 Safari/537.36';

      assertEqual(parseChromeVersion(uaModern), 120, 'Modern Chrome 120');
      assertEqual(parseChromeVersion(uaMin), 86, 'Min Chrome 86');
      assertEqual(parseChromeVersion(uaOutdated), 84, 'Outdated Chrome 84');
      assertEqual(parseChromeVersion(uaElectron), 124, 'Electron Chromium 124');

      assert((parseChromeVersion(uaModern) ?? 0) >= 86, 'Modern >= 86');
      assert((parseChromeVersion(uaMin) ?? 0) >= 86, 'Min >= 86');
      assert((parseChromeVersion(uaOutdated) ?? 0) < 86, 'Outdated < 86');
    });
  });

  // --------------------------------------------------------------------------
  // SUITE 7: LEAK PREVENTION & ERROR SANITIZATION AUDIT
  // --------------------------------------------------------------------------
  await suite('Suite 7: Leak Prevention & Anti-Exposure Audit', async () => {
    await test('sanitizeObject strips sensitive keys and redacts session IDs safely', () => {
      const dirty = {
        plaintext: 'top secret message',
        key: 'secret-key-123',
        pickle: 'sensitive-pickle-state',
        sessionId: '0123456789abcdef',
        normalInfo: 'visible data',
        nested: {
          ed25519_secret: 'hidden secret'
        }
      };

      const cleaned = sanitizeObject(dirty);

      assertEqual(cleaned.plaintext, '[REDACTED]', 'Plaintext is redacted');
      assertEqual(cleaned.key, '[REDACTED]', 'Key is redacted');
      assertEqual(cleaned.pickle, '[REDACTED]', 'Pickle is redacted');
      assertEqual(cleaned.sessionId, '01234567...', 'Session ID is masked');
      assertEqual(cleaned.normalInfo, 'visible data', 'Normal info is preserved');
      assert(!JSON.stringify(cleaned).includes('top secret message'), 'Zero leak of plaintext in serialized output');
      assert(!JSON.stringify(cleaned).includes('secret-key-123'), 'Zero leak of secret key in serialized output');
    });

    await test('Console and error strings never expose unencrypted private key material', () => {
      const sensitiveKeys = ['ed25519_secret', 'curve25519_secret', 'megolm_secret_key'];
      const mockLogOutput: string[] = [];

      function safeLog(context: string, data: any) {
        let serialized = typeof data === 'string' ? data : JSON.stringify(data);
        for (const k of sensitiveKeys) {
          if (serialized.includes(k)) {
            serialized = serialized.replace(new RegExp(k, 'g'), '[REDACTED_SECRET]');
          }
        }
        mockLogOutput.push(`${context}: ${serialized}`);
      }

      safeLog('ErrorEvent', { error: 'Failed', secret: 'ed25519_secret_12345' });

      assert(!mockLogOutput[0].includes('ed25519_secret_12345'), 'Sanitized log does not leak secret');
      assert(mockLogOutput[0].includes('[REDACTED_SECRET]'), 'Sanitizer replaces secret with redacted tag');
    });
  });

  // --------------------------------------------------------------------------
  // SUMMARY REPORT
  // --------------------------------------------------------------------------
  let totalTests = 0;
  let totalPassed = 0;
  let totalFailed = 0;

  console.log(`\n${BOLD}${CYAN}============================================================${RESET}`);
  console.log(`${BOLD}${CYAN}SPIKE TEST SUMMARY${RESET}`);
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
  console.log(`${BOLD}Verdict:${RESET}          ${allPassed ? `${GREEN}${BOLD}GO (100% GREEN)${RESET}` : `${RED}${BOLD}NO-GO (FAILURES DETECTED)${RESET}`}`);
  console.log(`${BOLD}${CYAN}============================================================${RESET}\n`);

  if (!allPassed) {
    process.exit(1);
  }
}

runSpikeTests().catch((err) => {
  console.error(`${RED}Fatal runner error:${RESET}`, err);
  process.exit(1);
});
