# Handoff Report: Challenger M4-2 — Empirical Adversarial Verification (Anti-Fallback Gates & Backend Token Security)

## 1. Observation

Direct, verifiable observations across codebases, test executions, and adversarial attack vectors:

### 1.1 Existing Test Battery Execution
All pre-existing test suites pass 100% green without regressions:
1. `npm run test:livekit-m4 --prefix client`: 26/26 tests PASS (100% GREEN).
2. `npm run test:livekit-gate --prefix client`: 23/23 tests PASS (100% GREEN).
3. `npm run test:e2ee-spike --prefix client`: 27/27 tests PASS (100% GREEN).
4. `go test -v ./internal/handlers -run "TestE2EE"` in `backend`: 5/5 tests PASS (100% GREEN).
5. `go test ./...` in `backend`: All packages PASS (100% GREEN).
6. `npm run build --prefix client`: Exit code 0, 0 TypeScript errors, bundle written to `backend/web`.
7. `go build ./...` in `backend`: Exit code 0, clean compilation.

### 1.2 Backend Token Security & LiveKit Cryptographic Verification
Authored and executed `backend/internal/handlers/e2ee_m4_challenger_test.go`:
```powershell
go test -v ./internal/handlers -run "TestChallengerM4"
```
Output:
```
=== RUN   TestChallengerM4_ParticipantMetadataEnforcement
--- PASS: TestChallengerM4_ParticipantMetadataEnforcement (0.00s)
=== RUN   TestChallengerM4_LiveKitJWTCryptographicTamperResistance
--- PASS: TestChallengerM4_LiveKitJWTCryptographicTamperResistance (0.00s)
=== RUN   TestChallengerM4_ResponsePayloadSerialization
--- PASS: TestChallengerM4_ResponsePayloadSerialization (0.00s)
PASS
ok  	github.com/zerovc/zerovc/backend/internal/handlers	2.697s
```
- Direct observation in `backend/internal/handlers/channel_handlers.go` (lines 598-601):
  ```go
  if isE2EE {
      metaMap["e2ee_required"] = true
      metaMap["user_id"] = userID.String()
  }
  ```
- Direct observation in `backend/internal/handlers/dm_handlers.go` (lines 985-990):
  ```go
  if isE2EE {
      currentMetaMap["e2ee_required"] = true
      currentMetaMap["user_id"] = userID.String()
      otherMetaMap["e2ee_required"] = true
      otherMetaMap["user_id"] = otherUserID.String()
  }
  ```
- Direct observation in `backend/internal/handlers/dm_group_handlers.go` (lines 1036-1039):
  ```go
  if isE2EE {
      metaMap["e2ee_required"] = true
      metaMap["user_id"] = userID.String()
  }
  ```
- Cryptographic verification via `auth.ParseAPIToken` + `verifier.Verify`:
  * Flipped signature bit: verifier strictly rejects token with HMAC signature verification error.
  * Tampered payload (stripping `e2ee_required: true` or changing `user_id`): verifier strictly rejects token.
  * Incorrect API secret: verifier strictly rejects token.
  * Identity binding: `verifier.Identity()` strictly matches `user_id` in participant metadata claims.

### 1.3 Anti-Fallback Gates & Zero-Plaintext Leakage Verification
In `client/scripts/test-challenger-m4-2-adversarial.ts`:
- Suite 1 (Anti-Fallback Gate Matrix & Invariance): 3/3 PASS.
  * `fallbackAllowed` is strictly `false` across all E2EE parameter variations.
  * `assertE2EESupported()` throws `E2EE_UNSUPPORTED: Browser or WebView does not support Insertable Streams (Chrome >= 86 required). Plaintext fallback forbidden.` when insertable streams are missing.
- Suite 2 (Platform Environment Tampering & Spoofing Resilience): 3/3 PASS.
  * Crippled receiver, missing `RTCRtpScriptTransform`, or missing `createEncodedStreams` return `BLOCKED`.
  * `LiveKitE2EEManager.initialize()` throws `E2EE_UNSUPPORTED` defense-in-depth, preventing room initialization.
- Suite 3 (Store Interception & Zero-Plaintext Leakage): 4/4 PASS.
  * `voiceStore.joinDMCall` dispatches `zerovc:upgrade_required` with `{ modal: 'UPGRADE_REQUIRED', reason: 'E2EE_CALL_UNSUPPORTED' }`, throws error, rolls back state, and `livekit.connect` is NEVER called.
  * `callStore.startCall` dispatches upgrade modal, throws error, and resets `callState` to `'idle'`.
  * `callStore.handleIncomingCall` dispatches upgrade modal and stays in `'idle'`.
  * `callStore.acceptCall` dispatches upgrade modal, throws error, and resets `callState` to `'idle'`.
- Suite 4 (Call Key Ephemeral Hygiene & Buffer In-Place Zeroization): 3/3 PASS.
  * `zeroKey(buffer)` overwrites 100% of bytes (32/32) with 0x00.
  * `endCall()` overwrites the internal active key buffer in memory with 0x00 and resets state to `NO_KEY`.
  * Key rotation overwrites the prior key buffer in memory with 0x00 before allocating the new key.

### 1.4 Cryptographic Signaling Vulnerabilities Discovered (Suite 5 Failures)
Execution of `npx tsx scripts/test-challenger-m4-2-adversarial.ts` revealed two test failures in Suite 5:

```
  ✗ Replay attack / Stale ratchet: Out-of-order key with stale key_index is rejected (0.3ms)
    Error: Assertion failed: Must ignore stale key index 3 (Expected: 5, Actual: 3)
[E2EE:CallKeyManager] Call ended. Ephemeral keys zeroed and discarded. 
[E2EE:CallKeyManager] Started call call-usurp. Elected distributor: dev-01 
[E2EE:CallKeyManager] Transitioned to state: REQUESTING 
[E2EE:CallKeyManager] Transitioned to state: ACTIVE 
[E2EE:CallKeyManager] Applied incoming call key from dev-03 (keyIndex: 1, epoch: 1) 
  ✗ Distributor Usurpation: Non-distributor peer claims to rotate and sends key (0.3ms)
    Error: Assertion failed: Must reject key sent by unauthorized sender dev-03 (Expected: "REQUESTING", Actual: "ACTIVE")
```

Inspection of `client/src/crypto/callKeys.ts` lines 361-408:
```typescript
  async handleIncomingCallKey(payload: CallKeyToDevicePayload): Promise<void> {
    if (!payload || payload.msg_type !== 'call_key') {
      safeCryptoLogger.warn('CallKeyManager', 'Ignored invalid payload msg_type');
      return;
    }

    if (this.callId && payload.call_id !== this.callId) {
      safeCryptoLogger.warn('CallKeyManager', `Ignored call key for mismatching call: ${payload.call_id} vs ${this.callId}`);
      return;
    }

    if (!payload.key) {
      safeCryptoLogger.warn('CallKeyManager', 'Ignored call key payload with missing key');
      return;
    }

    let keyBytes: Uint8Array;
    try {
      keyBytes = base64ToUint8Array(payload.key);
    } catch (e) {
      safeCryptoLogger.error('CallKeyManager', 'Failed to decode base64 call key:', e);
      return;
    }

    if (keyBytes.length !== 32) {
      safeCryptoLogger.error('CallKeyManager', `Rejected call key with invalid length: ${keyBytes.length} (must be 32 bytes)`);
      zeroKey(keyBytes);
      return;
    }

    // Zero out old key before storing new one
    if (this.currentKey) {
      zeroKey(this.currentKey);
      this.currentKey = null;
    }

    this.currentKey = keyBytes;
    this.keyIndex = payload.key_index;
    this.epoch = payload.epoch;

    await this.applyKeyToProvider(this.currentKey);
    this.setState('ACTIVE');

    safeCryptoLogger.info(
      'CallKeyManager',
      `Applied incoming call key from ${payload.sender_device_id} (keyIndex: ${this.keyIndex}, epoch: ${this.epoch})`
    );
  }
```

1. **Vulnerability 1 (Replay / Downgrade Attack)**: `handleIncomingCallKey` unconditionally overwrites `this.keyIndex` and `this.epoch` without verifying if `payload.key_index` is strictly greater than the current `this.keyIndex` (or equal with higher `epoch`). An adversary or delayed packet can replay an older key (e.g. from key index 1 when call is at index 5), rolling back the room's encryption key and compromising Forward Secrecy.
2. **Vulnerability 2 (Distributor Usurpation)**: `handleIncomingCallKey` never validates `payload.sender_device_id` against `this.distributorDeviceId`. Any participant device (even a non-distributor or unauthorized client) can send a `call_key` to peer devices and usurp the distributor role, circumventing the canonical deterministic $\min_{\text{lex}}(\text{device\_id})$ election algorithm.

---

## 2. Logic Chain

1. **Anti-Fallback Gating & Plaintext Protection**:
   - `checkCallEligibility` checks `isCallE2EESupported()` whenever `isE2EERoom: true`.
   - In both `voiceStore.ts` and `callStore.ts`, when `eligibility.status === 'BLOCKED'`, the client emits `window.dispatchEvent(new CustomEvent('zerovc:upgrade_required', ...))` and immediately throws `E2EE_CALL_UNSUPPORTED`.
   - Because execution throws before `livekit.connect(...)` is called, no WebRTC peer connection or SDP offer/answer is initiated. This guarantees zero unencrypted RTP packet leakage across all platforms.
   - Verified empirically: `livekit.connect` call count is 0, and UI modal event is dispatched with correct details.

2. **Backend Token Integrity**:
   - The Go backend injects `{"e2ee_required": true, "user_id": userID.String()}` into participant metadata across `channel_handlers.go`, `dm_handlers.go`, and `dm_group_handlers.go`.
   - The token is signed using LiveKit HMAC-SHA256 JWT. Any client attempt to tamper with the token payload (e.g. flipping `e2ee_required` to `false`) or forge `user_id` produces a cryptographic signature mismatch and fails `verifier.Verify()`.
   - Verified empirically: 3/3 Go adversarial tests pass with 100% green.

3. **CallKeyManager Signaling Failures**:
   - In §13/§14 of the specification, the distributor is elected deterministically as $\min_{\text{lex}}(\text{device\_id})$. Peers must only accept call keys originating from the elected distributor.
   - In `callKeys.ts:361-408`, `handleIncomingCallKey` does not check `if (this.distributorDeviceId && payload.sender_device_id !== this.distributorDeviceId)`. As observed in Suite 5 Test 4, a rogue participant `dev-03` successfully overwrites `dev-02`'s state when `dev-01` is distributor.
   - Furthermore, in ratcheted key exchange, forward secrecy requires monotonic progression of `key_index`. Replaying an old key must be dropped. `handleIncomingCallKey` does not check `if (this.keyIndex > 0 && (payload.key_index < this.keyIndex || (payload.key_index === this.keyIndex && payload.epoch <= this.epoch)))`. As observed in Suite 5 Test 3, an older key at index 3 overwrote the current key at index 5.

---

## 3. Caveats

- All other Milestone M4 deliverables — including the anti-fallback gate matrix, UI upgrade modal events, WebRTC plaintext leak prevention, LiveKit `ExternalE2EEKeyProvider` integration, in-place buffer zeroization on disconnect and rotation, and backend token security — are thoroughly validated and completely green.
- The two discovered vulnerabilities are strictly localized to `client/src/crypto/callKeys.ts` inside `handleIncomingCallKey`.

---

## 4. Conclusion

**Verdict: REQUEST_CHANGES**

Milestone M4 cannot be certified for final approval until the two cryptographic signaling vulnerabilities in `CallKeyManager.handleIncomingCallKey` are remediated by `worker_m4_remediation`:

### Required Remediation in `client/src/crypto/callKeys.ts`:
In `handleIncomingCallKey`:
1. **Guard Distributor Authorization**:
   ```typescript
   if (this.distributorDeviceId && payload.sender_device_id !== this.distributorDeviceId) {
     safeCryptoLogger.warn(
       'CallKeyManager',
       `Rejected call key from non-distributor: ${payload.sender_device_id} (expected ${this.distributorDeviceId})`
     );
     return;
   }
   ```
2. **Guard Monotonic Key Index (Anti-Replay / Anti-Rollback)**:
   ```typescript
   if (
     this.keyIndex > 0 &&
     (payload.key_index < this.keyIndex ||
       (payload.key_index === this.keyIndex && payload.epoch <= this.epoch))
   ) {
     safeCryptoLogger.warn(
       'CallKeyManager',
       `Ignored stale or replayed call key: index ${payload.key_index} (current: ${this.keyIndex}), epoch ${payload.epoch} (current: ${this.epoch})`
     );
     return;
   }
   ```

---

## 5. Verification Method

To independently reproduce the findings and verify the subsequent fix:

1. **Run Challenger M4-2 Adversarial Test Harness**:
   ```powershell
   npx tsx scripts/test-challenger-m4-2-adversarial.ts
   ```
   *Current Observation*: Suites 1-4 PASS (15/15), Suite 5 FAILS 2/4 tests.
   *Target after remediation*: 17/17 PASS (100% GREEN).

2. **Run Backend Challenger Token Security Tests**:
   ```powershell
   cd backend
   go test -v ./internal/handlers -run "TestChallengerM4"
   ```
   *Expected Result*: 3/3 PASS (100% GREEN).

3. **Run M4 Certification Suite**:
   ```powershell
   npm run test:livekit-m4 --prefix client
   ```
   *Expected Result*: 26/26 PASS (100% GREEN).

4. **Run LiveKit Gate Adversarial Suite**:
   ```powershell
   npm run test:livekit-gate --prefix client
   ```
   *Expected Result*: 23/23 PASS (100% GREEN).

5. **Run Full Client Build**:
   ```powershell
   npm run build --prefix client
   ```
   *Expected Result*: Exit code 0, 0 TypeScript errors.
