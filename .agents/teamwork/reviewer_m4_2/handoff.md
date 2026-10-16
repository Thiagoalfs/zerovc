# Handoff Report: Reviewer M4-2 (Milestone M4 Conformance & Adversarial Review)

## 1. Observation

Direct, verifiable observations across the codebase, execution runs, and adversarial stress tests:

### 1.1 Mandatory Verification Commands Output

1. **`npm run test:livekit-m4 --prefix client`**:
   - Exit code: 0
   - Output: 26/26 tests passed across 6 core areas (State Machine, min_lex Distributor, Olm To-Device, Backward & Forward Secrecy, Anti-Fallback Gate, and Ephemeral Zeroization).
   - Verbatim summary:
     ```
     Total Suites:     6
     Total Tests:      26
     Passed:           26
     Failed:           0
     Verdict:          APPROVE (100% GREEN)
     ```

2. **`npm run test:livekit-gate --prefix client`**:
   - Exit code: 0
   - Output: 23/23 tests passed across 4 suites (High-Frequency Transitions, Key Size Variations, Platform Environment Spoofing & Version Gate, Anti-Fallback & Zero-Plaintext Enforcement).
   - Verbatim summary:
     ```
     Total Suites:     4
     Total Tests:      23
     Passed:           23
     Failed:           0
     Verdict:          APPROVE (100% GREEN)
     ```

3. **`npm run test:e2ee-spike --prefix client`**:
   - Exit code: 0
   - Output: 27/27 tests passed across 7 suites (Identity, Non-Extractable KeyStore, Olm 1:1, Megolm Ratchet, LiveKit ExternalE2EEKeyProvider, Platform Gate, Leak Prevention).
   - Verbatim summary:
     ```
     Total Suites:     7
     Total Tests:      27
     Passed:           27
     Failed:           0
     Verdict:          GO (100% GREEN)
     ```

4. **`npm run build --prefix client`**:
   - Exit code: 0
   - Output: Vite production build completed in 9.65s with 0 TypeScript compilation errors. Static assets bundled and synchronized to `backend/web`.

5. **`cd backend && go test -v ./internal/handlers -run "TestE2EE" && go build ./...`**:
   - Exit code: 0
   - Output:
     ```
     === RUN   TestE2EEVersionMiddleware
     --- PASS: TestE2EEVersionMiddleware (0.00s)
     === RUN   TestE2EEM4_LiveKitParticipantMetadata
     --- PASS: TestE2EEM4_LiveKitParticipantMetadata (0.00s)
     === RUN   TestE2EEM4_ChannelJoinVoiceResponse
     --- PASS: TestE2EEM4_ChannelJoinVoiceResponse (0.00s)
     === RUN   TestE2EEM4_DMCallResponses
     --- PASS: TestE2EEM4_DMCallResponses (0.00s)
     === RUN   TestE2EEM4_DMGroupVoiceResponse
     --- PASS: TestE2EEM4_DMGroupVoiceResponse (0.00s)
     PASS
     ok  	github.com/zerovc/zerovc/backend/internal/handlers	3.782s
     ```
   - `go build ./...` exited cleanly with code 0 and zero warnings.

6. **Full Project Test Suites (`tests/e2e/runner.ts` & `backend/go test ./...`)**:
   - `npm run test:e2e --prefix client`: 181/181 passed across Tiers 1–4 with zero secrets leaked.
   - `cd backend && go test ./...`: 100% passed across all internal packages.

---

### 1.2 Adversarial Stress Testing (`client/scripts/challenger-m4-adversarial.ts`)

Execution command: `npx tsx scripts/challenger-m4-adversarial.ts` (inside `client/`).
Exit code: 1.
Total tests: 21. Passed: 18. Failed: 3.

Direct failure observations:
1. **Failure 1 (Rogue Distributor Injection)**:
   - Test: `Distributor self-preservation: elected distributor ignores incoming rogue keys`
   - Verbatim log:
     ```
     [E2EE:CallKeyManager] Applied incoming call key from dev-09 (keyIndex: 999, epoch: 999) 
         [FINDING: ROGUE_DISTRIBUTOR_INJECTION] Distributor accepted incoming call_key from dev-09
       ✗ Distributor self-preservation: elected distributor ignores incoming rogue keys (0.5ms)
         Error: Assertion failed: Security Invariant Violated: Elected distributor must not accept incoming call_key from another device
     ```
2. **Failure 2 (Key Replay Downgrade)**:
   - Test: `Replay attack stress: older key_index and epoch payloads`
   - Verbatim log:
     ```
     [E2EE:CallKeyManager] Applied incoming call key from dev-01 (keyIndex: 5, epoch: 5) 
     [E2EE:CallKeyManager] Applied incoming call key from dev-01 (keyIndex: 1, epoch: 1) 
         [FINDING: KEY_REPLAY_DOWNGRADE] Client downgraded key_index from 5 to 1 upon replayed payload
       ✗ Replay attack stress: older key_index and epoch payloads (0.4ms)
         Error: Assertion failed: Forward Secrecy Violated: Client must not downgrade key_index upon receiving replayed older key
     ```
3. **Failure 3 (Self-Reflection / Echo Acceptance)**:
   - Test: `Reflection / Echo attack: client receiving payload with sender_device_id === myDeviceId`
   - Verbatim log:
     ```
     [E2EE:CallKeyManager] Applied incoming call key from dev-01 (keyIndex: 10, epoch: 10) 
         [FINDING: ECHO_ACCEPTANCE] Node accepted self-reflected call_key payload (sender == myDeviceId)
       ✗ Reflection / Echo attack: client receiving payload with sender_device_id === myDeviceId (0.2ms)
         Error: Assertion failed: Protocol Invariant Violated: Node must not accept self-reflected call_key payload (sender_device_id == myDeviceId)
     ```

### 1.3 Code Inspection in `client/src/crypto/callKeys.ts`

Lines 361–408 (`handleIncomingCallKey`):
```ts
361:   async handleIncomingCallKey(payload: CallKeyToDevicePayload): Promise<void> {
362:     if (!payload || payload.msg_type !== 'call_key') {
363:       safeCryptoLogger.warn('CallKeyManager', 'Ignored invalid payload msg_type');
364:       return;
365:     }
366: 
367:     if (this.callId && payload.call_id !== this.callId) {
368:       safeCryptoLogger.warn('CallKeyManager', `Ignored call key for mismatching call: ${payload.call_id} vs ${this.callId}`);
369:       return;
370:     }
371: 
372:     if (!payload.key) {
373:       safeCryptoLogger.warn('CallKeyManager', 'Ignored call key payload with missing key');
374:       return;
375:     }
...
397:     this.currentKey = keyBytes;
398:     this.keyIndex = payload.key_index;
399:     this.epoch = payload.epoch;
```
Inspection directly confirms:
- **No distributor guard**: No check `if (this.isDistributor()) return;`. If the node is the distributor, it overwrites its key with incoming foreign keys.
- **No sender verification**: No check `if (this.distributorDeviceId && payload.sender_device_id !== this.distributorDeviceId) return;`. Non-distributors accept `call_key` from any participant, not just the elected distributor.
- **No reflection check**: No check `if (this.myDeviceId && payload.sender_device_id === this.myDeviceId) return;`.
- **No monotonic key_index check**: No check `if (this.state === 'ACTIVE' && payload.key_index <= this.keyIndex) return;`.

### 1.4 Script Configuration Observation in `client/package.json`

Line 15:
```json
"test:frontend-m3": "tsx scripts/test-frontend-m3.ts",
```
Running `npm run test:frontend-m3 --prefix client` fails with:
`ReferenceError: onmessage is not defined`
Adding `-r ./scripts/test-setup-worker.ts` resolves this immediately (29/29 tests pass).

---

## 2. Logic Chain

1. **From Observation 1.1 (Baseline Builds & Tests)**:
   - The foundational requirements of Milestone M4 (R4, Spec §13/14) are implemented: `callKeyManager.ts` exists, LiveKit callbacks (`onParticipantConnected`, `onParticipantDisconnected`, `onDisconnected`) are wired in `voiceStore.ts`, `livekit.ts` passes `e2eeSetup` into `new Room({ e2ee })`, anti-fallback gate blocks unsupported clients without plaintext downgrade, and backend endpoints inject participant metadata (`e2ee_required: true`) and return `e2ee_enabled: bool`.
   - All standard tests (`test:livekit-m4`, `test:livekit-gate`, `test:e2ee-spike`, Go unit tests) pass 100%.

2. **From Observation 1.2 and 1.3 (Adversarial Security Gaps in `handleIncomingCallKey`)**:
   - In any deterministic distributor architecture ($\min_{\text{lex}}(\text{device\_id})$), the elected leader is the exclusive authority responsible for key generation and distribution. If an elected distributor accepts external keys, any malicious client can broadcast a fabricated key and usurp room encryption (Rogue Distributor Injection).
   - In end-to-end encrypted real-time calls, ratchet keys must follow strictly monotonic index progression. Without checking `payload.key_index > this.keyIndex`, an adversary or out-of-order network replay can force clients back to an old, discarded key (Replay Downgrade Attack), breaking Forward Secrecy and causing call audio/video to drop immediately due to decryption failure.
   - Without verifying `payload.sender_device_id !== this.myDeviceId`, a node risks processing its own reflected packets, causing state desynchronization.
   - Without verifying that `payload.sender_device_id === this.distributorDeviceId`, any non-distributor device can impersonate the leader.

3. **From Observation 1.4 (`package.json` test script)**:
   - Transitive imports of LiveKit worker code require the polyfill in Node.js test environments. Lacking `-r ./scripts/test-setup-worker.ts` causes `test:frontend-m3` to fail when run standalone.

4. **Integrity Assessment**:
   - There are **no integrity violations** (no hardcoded test outputs, no fake implementations, no shortcuts, no fabricated logs).
   - However, the protocol vulnerabilities uncovered by adversarial testing are material and must be corrected before Milestone M4 can be certified as fully secure and robust.

---

## 3. Caveats

No caveats. All areas of the M4 specification (voiceStore, callStore, livekit.ts, callKeys.ts, backend handlers, and user global rules) were directly inspected and tested across both standard and hostile adversarial test harnesses.

---

## 4. Conclusion

**Verdict: REQUEST_CHANGES**

Milestone M4 has accomplished high quality implementation of the core LiveKit E2EE SFrame engine and anti-fallback gate. However, adversarial stress testing proved that `client/src/crypto/callKeys.ts` has 4 security gaps in `handleIncomingCallKey` that violate protocol invariants and expose calls to rogue distributor injection, replay downgrade attacks, and self-reflection loops.

### Actionable Remediation Required:

1. **Remediation in `client/src/crypto/callKeys.ts` (`handleIncomingCallKey`)**:
   Incorporate the following guards at the start of `handleIncomingCallKey`:
   ```ts
   // 1. Elected distributor must NEVER accept incoming call_key payloads from other peers
   if (this.isDistributor()) {
     safeCryptoLogger.warn('CallKeyManager', 'Elected distributor ignored incoming call_key from external peer');
     return;
   }

   // 2. Reject self-reflected or echoed payloads
   if (this.myDeviceId && payload.sender_device_id === this.myDeviceId) {
     safeCryptoLogger.warn('CallKeyManager', 'Ignored self-reflected call key payload');
     return;
   }

   // 3. Reject keys from senders that are not the elected distributor
   if (this.distributorDeviceId && payload.sender_device_id !== this.distributorDeviceId) {
     safeCryptoLogger.warn(
       'CallKeyManager',
       `Rejected call key from unauthorized sender ${payload.sender_device_id} (elected distributor: ${this.distributorDeviceId})`
     );
     return;
   }

   // 4. Anti-replay monotonic key_index check (Forward Secrecy preservation)
   if (this.state === 'ACTIVE' && payload.key_index <= this.keyIndex) {
     safeCryptoLogger.warn(
       'CallKeyManager',
       `Rejected replayed or outdated key_index: ${payload.key_index} <= ${this.keyIndex}`
     );
     return;
   }
   ```

2. **Remediation in `client/package.json`**:
   Update line 15 to include the worker polyfill flag:
   ```json
   "test:frontend-m3": "tsx -r ./scripts/test-setup-worker.ts scripts/test-frontend-m3.ts",
   ```

---

## 5. Verification Method

To verify the remediated code independently:

1. **Verify Adversarial Stress Suite**:
   ```powershell
   npx tsx scripts/challenger-m4-adversarial.ts
   ```
   *Pass criteria*: 21/21 tests PASS (100% GREEN), with zero assertion failures in Suite 5.

2. **Verify M4 Certification Suite**:
   ```powershell
   npm run test:livekit-m4 --prefix client
   ```
   *Pass criteria*: 26/26 tests PASS (100% GREEN).

3. **Verify Gate Adversarial Suite**:
   ```powershell
   npm run test:livekit-gate --prefix client
   ```
   *Pass criteria*: 23/23 tests PASS (100% GREEN).

4. **Verify E2EE Spike Suite**:
   ```powershell
   npm run test:e2ee-spike --prefix client
   ```
   *Pass criteria*: 27/27 tests PASS (100% GREEN).

5. **Verify Full Client Build**:
   ```powershell
   npm run build --prefix client
   ```
   *Pass criteria*: Exit code 0, 0 TypeScript errors.

6. **Verify Backend Tests & Build**:
   ```powershell
   cd backend
   go test -v ./internal/handlers -run "TestE2EE"
   go build ./...
   ```
   *Pass criteria*: 5/5 unit tests pass, compilation succeeds.
