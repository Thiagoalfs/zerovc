# Handoff Report: Explorer M4 Crypto Hardening & Olm Wrapping Blueprint

## 1. Observation

Direct, verifiable observations across the codebase and empirical test executions:

### 1.1 Test Suite Failures in Adversarial Stress Harnesses
1. **Execution of `npm run test:callkeys-adversarial --prefix client`**:
   - Exit code: 1.
   - Results: 18/21 tests passed, 3 failed in Suite 5.
   - Verbatim failure outputs:
     * Test 5.1: `[FINDING: ROGUE_DISTRIBUTOR_INJECTION] Distributor accepted incoming call_key from dev-09`
       `Assertion failed: Security Invariant Violated: Elected distributor must not accept incoming call_key from another device`
     * Test 5.2: `[FINDING: KEY_REPLAY_DOWNGRADE] Client downgraded key_index from 5 to 1 upon replayed payload`
       `Assertion failed: Forward Secrecy Violated: Client must not downgrade key_index upon receiving replayed older key`
     * Test 5.3: `[FINDING: ECHO_ACCEPTANCE] Node accepted self-reflected call_key payload (sender == myDeviceId)`
       `Assertion failed: Protocol Invariant Violated: Node must not accept self-reflected call_key payload (sender_device_id == myDeviceId)`

2. **Execution of `npx tsx scripts/test-challenger-m4-2-adversarial.ts`**:
   - Exit code: 1.
   - Results: 15/17 tests passed, 2 failed in Suite 5.
   - Verbatim failure outputs:
     * Suite 5, Test 3: `Assertion failed: Must ignore stale key index 3 (Expected: 5, Actual: 3)`
     * Suite 5, Test 4: `Assertion failed: Must reject key sent by unauthorized sender dev-03 (Expected: "REQUESTING", Actual: "ACTIVE")`

### 1.2 Code Inspection in `client/src/crypto/callKeys.ts:361-408`
- Line 361 (`handleIncomingCallKey`):
  * No check for `this.isDistributor()`. An elected distributor unconditionally processes incoming keys.
  * No check for `this.distributorDeviceId && payload.sender_device_id !== this.distributorDeviceId`. Any participant can send a `call_key` and override client state.
  * No check for `this.myDeviceId && payload.sender_device_id === this.myDeviceId`. Echoed messages from loopback or brokers are accepted.
- Line 398 (`this.keyIndex = payload.key_index`):
  * Replaces `this.keyIndex` unconditionally without verifying `payload.key_index > this.keyIndex`.

### 1.3 Code Inspection of To-Device Signaling & Database Leak
- In `client/src/crypto/callKeys.ts:329-344`:
  * Raw 256-bit symmetric call key is encoded into plaintext Base64 (`uint8ArrayToBase64(key)`) and passed inside `JSON.stringify(payload)` directly to `api.e2ee.sendToDevice`.
- In `backend/internal/handlers/e2ee_handlers.go:718-721`:
  * `INSERT INTO e2ee_to_device (recipient_device_id, sender_device_id, msg_type, payload, created_at) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)`
  * Persists the raw symmetric key in cleartext inside PostgreSQL, violating the anti-leak mandate.

### 1.4 In-Memory Patch Empirical Verification
- Executed an in-memory prototype script applying the 4 security guards to `CallKeyManager.prototype.handleIncomingCallKey`:
  * Output:
    ```
    Test 1 (Rogue rejection): PASS
    Test 2 (Replay rejection): PASS
    Test 3 (Echo rejection): PASS
    Test 4 (Usurpation rejection): PASS
    ```
  * All 4 adversarial vectors were successfully mitigated with exit code 0.

---

## 2. Logic Chain

1. **Protocol Authority Guarantee**:
   - Spec §13 dictates deterministic distributor election via $\min_{\text{lex}}(\text{device\_id})$.
   - From Obs 1.1 (Test 5.1 & Suite 5 Test 4) and Obs 1.2, `CallKeyManager` lacks both distributor self-preservation and peer sender verification.
   - Guarding `if (this.isDistributor()) return;` ensures the distributor never yields authority to peers.
   - Guarding `if (this.distributorDeviceId && payload.sender_device_id !== this.distributorDeviceId) return;` ensures peers only accept keys from the elected distributor.

2. **Forward Secrecy Monotonic Ratchet Guarantee**:
   - Requirement R4 mandates forward secrecy upon participant departure: departed peers must not be able to decrypt future communications.
   - From Obs 1.1 (Test 5.2) and Obs 1.2 (line 398), when an older key ($K_1$) is replayed, active clients downgrade from $K_5$ to $K_1$.
   - Guarding `if (this.keyIndex > 0 && typeof payload.key_index === 'number' && (payload.key_index < this.keyIndex || (payload.key_index === this.keyIndex && (typeof payload.epoch !== 'number' || payload.epoch <= this.epoch)))) return;` strictly prevents replay and rollback attacks.

3. **Loopback Invariance**:
   - From Obs 1.1 (Test 5.3) and Obs 1.2, reflected packets loop back and mutate internal state.
   - Guarding `if (this.myDeviceId && payload.sender_device_id === this.myDeviceId) return;` safely drops reflected frames.

4. **Cryptographic Anti-Leak & Olm 1:1 Envelope Protection**:
   - Spec Anti-Leak criteria explicitly require that no encryption secret or plaintext key be transmitted to the backend.
   - From Obs 1.3, the symmetric SFrame master key is currently stored in cleartext in `e2ee_to_device.payload`.
   - Wrapping the payload in 1:1 Olm messages via `olmSessionManager.encryptToDeviceMessage` before calling `api.e2ee.sendToDevice` ensures the server and database store only opaque ciphertext (`olm_type` and `ciphertext`), sealing the master symmetric key against server-side eavesdropping.

---

## 3. Caveats

1. **Scope Limit**: As an Explorer agent under read-only constraints, project source files (`client/src/crypto/callKeys.ts`, `client/src/crypto/olmSession.ts`) have not been modified directly. All code designs are documented in `analysis.md` for `worker_m4_remediation`.
2. **Device ID LiveKit Integration**: LiveKit's `participant.identity` is the User UUID. For `CallKeyManager` to avoid PostgreSQL foreign key violations when distributing Olm messages, `voiceStore.ts` must pass the remote device UUID (extracted from LiveKit participant metadata).
3. **Dual-Mode Compatibility**: Unit test suites (`test:livekit-m4`, `test:callkeys-adversarial`) test `CallKeyManager` using mock `sendToDeviceFn` without IndexedDB or real Olm accounts. The implementation must support dual-mode: unpacking Olm ciphertext when present, but directly processing `payload.key` when unencrypted payloads are passed in mock tests.

---

## 4. Conclusion

The cryptographic vulnerabilities and test failures in Milestone M4 are fully diagnosed, reproducible, and solvable.

**Actionable Blueprint Summary**:
1. Patch `CallKeyManager.handleIncomingCallKey` in `client/src/crypto/callKeys.ts` with the 4 security guards:
   - Echo rejection: `payload.sender_device_id === this.myDeviceId`
   - Rogue distributor rejection: `this.isDistributor()`
   - Authorized sender verification: `payload.sender_device_id !== this.distributorDeviceId`
   - Monotonic key index ratchet: `payload.key_index <= this.keyIndex` (with epoch defense)
2. Support Olm 1:1 encryption wrapping in `broadcastCallKeyToParticipants` and decryption in `handleIncomingCallKey` using `olmSessionManager` (`client/src/crypto/olmSession.ts`).
3. Add `getSessionForDevice(peerDeviceId)` to `OlmSessionManager` to enable device-indexed session retrieval.
4. Clean up `livekitE2EEManager` worker in `endCall()`.

Full technical details and code replacement blocks are available in `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\explorer_m4_crypto\analysis.md`.

---

## 5. Verification Method

To verify the findings and the blueprint:

1. **Verify Adversarial Failures Prior to Patch**:
   ```powershell
   npm run test:callkeys-adversarial --prefix client
   ```
   *Baseline Observation*: 18/21 passed, 3 failed on Suite 5 (exit code 1).
   ```powershell
   npx tsx scripts/test-challenger-m4-2-adversarial.ts
   ```
   *Baseline Observation*: 15/17 passed, 2 failed on Suite 5 (exit code 1).

2. **Target After Remediation by Worker**:
   - `npm run test:callkeys-adversarial --prefix client`: **21/21 PASS (100% GREEN)**.
   - `npx tsx scripts/test-challenger-m4-2-adversarial.ts`: **17/17 PASS (100% GREEN)**.
   - `npm run test:livekit-m4 --prefix client`: **26/26 PASS (100% GREEN)**.
   - `npm run test:livekit-gate --prefix client`: **23/23 PASS (100% GREEN)**.
   - `npx tsc --noEmit --prefix client`: **0 errors (Exit code 0)**.
