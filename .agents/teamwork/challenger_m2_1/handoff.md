# Handoff Report — Challenger M2.1: Adversarial Verification of Milestone M2

**Milestone:** M2 (Fase 1: Identidade, Dispositivos e Roster Assinado)  
**Agent:** challenger_m2_1 (Archetype: teamwork_preview_challenger, Roles: critic, specialist)  
**Target Recipient:** Orchestrator Gen 2 (`4defee18-ea09-4ed5-bf7a-16f28824f45a`)  
**Date:** 2026-10-09T12:23:00Z  
**Verdict:** **APPROVE**  
**Target Path:** `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\challenger_m2_1\handoff.md`  

---

## 1. Observation

### 1.1 Empirical Test Execution Results

1. **Frontend M2 Verification Suite (`npm run test:frontend-m2`)**:
   Executed in `client/`:
   ```
   > zerovc-client@1.0.2 test:frontend-m2
   > tsx scripts/test-frontend-m2.ts

   ============================================================
   ZEROVC E2EE — FRONTEND MILESTONE M2 VERIFICATION SUITE
   Device Management & Chained Signed Roster Architecture
   ============================================================

     ✓ Key order independence: differently sorted objects produce identical canonical JSON (0ms)
     ✓ SHA-256 Hex computation matches known standard vector (12ms)
     ✓ Audience hash sorts members and devices lexicographically (8ms)
     ✓ Vodozemac Account.sign verifies via verifyEd25519Signature (WebCrypto/Node) (10ms)
     ✓ Tampered payload fails Ed25519 verification (1ms)
     ✓ Tampered signature bit fails verification (0ms)
     ✓ Genesis Roster (v1) creates valid signature with prev_roster_hash = "" (1ms)
     ✓ Chained Roster (v2) links to v1 via prev_roster_hash = SHA256(canonicalJson(v1)) (1ms)
     ✓ Chained Roster (v3) links to v2 with epoch progression (1ms)
     ✓ RosterManager.handleRosterUpdate caches valid rosters and ignores duplicates (1ms)
     ✓ Attack 1: Broken Hash Chain (tampered prev_roster_hash) is rejected (5ms)
     ✓ Attack 2: Version Skip (v1 -> v3) is rejected by monotonic check (0ms)
     ✓ Attack 3: Audience Tampering (stealth device insertion) is rejected by audience_hash check (1ms)
     ✓ Attack 4: Unauthorized Signer (Mallory signing Alice roster) is rejected (0ms)
     ✓ Attack 5: Epoch Rollback (epoch decreases) is rejected (1ms)
     ✓ Device canonical message formatting matches binding standard (0ms)
     ✓ Device registration payload includes valid Ed25519 identity signature and 50 OTKs (4ms)
     ✓ OTK Replenishment generates requested batch and marks published (2ms)
     ✓ HTTP 426 Upgrade Required error parsing (0ms)
     ✓ WebSocket URL properly appends device_id and e2ee_version=1 (0ms)

   ============================================================
   TEST RUN SUMMARY
   Total Tests:  20
   Passed:       20
   Failed:       0
   ============================================================
   ```

2. **Challenger Adversarial Harness (`npx tsx scripts/challenger-m2-adversarial.ts`)**:
   Directly imported `src/crypto/rosterManager.ts` and `src/crypto/deviceManager.ts` to stress-test 37 attack scenarios:
   ```
   ============================================================
   ZEROVC E2EE — EMPIRICAL ADVERSARIAL CHALLENGE HARNESS (M2)
   Challenger M2.1: Signed Rosters & Device Registration Attacks
   ============================================================

     ✓ Attack 1.1: Genesis v1 with non-empty prev_roster_hash is rejected (0.4ms)
     ✓ Attack 1.2: Chained v2 with empty prev_roster_hash is rejected (7.4ms)
     ✓ Attack 1.3: Chained v2 with single bit flipped in prev_roster_hash is rejected (0.6ms)
     ✓ Attack 1.4: Chained v2 with all-zeros prev_roster_hash is rejected (0.4ms)
     ✓ Attack 1.5: Chained v2 pointing to unrelated conversation roster hash is rejected (0.5ms)
     ✓ Attack 2.1: Version Skip v1 -> v3 is rejected by monotonic check (0.2ms)
     ✓ Attack 2.2: Extreme Version Skip v1 -> v100 is rejected (0.2ms)
     ✓ Attack 2.3: Version Rollback v2 -> v1 is rejected (0.2ms)
     ✓ Attack 2.4: Version Replay v2 -> v2 is ignored by handleRosterUpdate (2.5ms)
     ✓ Attack 2.5: Invalid Version 0, negative, and float versions are rejected (0.6ms)
     ✓ Attack 3.1: Stealth device injection with reused audience_hash is rejected (0.4ms)
     ✓ Attack 3.2: Stealth device with user not in members is rejected (0.6ms)
     ✓ Attack 3.3: Replacing legitimate Curve25519 key while keeping device_id fails audience check (0.4ms)
     ✓ Attack 3.4: Member removed while keeping orphan device is rejected (0.5ms)
     ✓ Attack 3.5: Permuted order of members and devices produces bitwise identical audience hash (0.3ms)
     ✓ Attack 4.1: Outsider Mallory signs Alice genesis roster -> rejected (0.4ms)
     ✓ Attack 4.2: Mallory signs v2 adding herself to Alice room without Alice consent (0.9ms)
     ✓ Attack 4.3: Mallory signs roster with Alice signer_user_id but Mallory Ed25519 key -> rejected (0.7ms)
     ✓ Attack 4.4: Signer device ID not present in roster devices is rejected (0.4ms)
     ✓ Attack 4.5: Signer device belongs to user Bob but signer_user_id claims Alice (0.4ms)
     ✓ Attack 5.1: Epoch decrease (epoch 1 -> epoch 0) is rejected (0.1ms)
     ✓ Attack 5.2: Multi-step epoch rollback (epoch 10 -> epoch 5) is rejected (0.4ms)
     ✓ Attack 5.3: Negative epoch is rejected (0.1ms)
     ✓ Attack 5.4: Float epoch (1.5, 3.14) is rejected (0.3ms)
     ✓ Attack 6.1: Bit flip at byte 0 of Ed25519 signature is rejected (0.5ms)
     ✓ Attack 6.2: Bit flip at byte 15 of Ed25519 signature is rejected (0.5ms)
     ✓ Attack 6.3: Bit flip at byte 31 of Ed25519 signature is rejected (0.4ms)
     ✓ Attack 6.4: Bit flip at byte 63 of Ed25519 signature is rejected (0.4ms)
     ✓ Attack 6.5: All-zeros signature is rejected (0.4ms)
     ✓ Attack 6.6: Truncated signature is rejected (0.3ms)
     ✓ Attack 6.7: Malformed base64 signature string is rejected (0.2ms)
     ✓ Attack 6.8: Single character mutation in signed payload fails signature check (0.3ms)
     ✓ Attack 7.1: Device canonical message format binds curve25519 and ed25519 keys (0.0ms)
     ✓ Attack 7.2: Bit-flipped identity signature fails device registration verification (0.4ms)
     ✓ Attack 7.3: Mismatched public key fails device signature verification (0.3ms)
     ✓ Attack 7.4: Cross-user key hijacking (Mallory signs Alice device keys) fails against Alice identity (0.4ms)
     ✓ Attack 7.5: Swapped Curve25519 key fails signature verification (0.4ms)

   ============================================================
   CHALLENGER ADVERSARIAL TEST RUN SUMMARY
   Total Attack Tests:  37
   Passed:              37
   Failed:              0
   ============================================================
   ```

3. **Backend Go Adversarial Tests (`go test -v ./internal/handlers -run TestChallengerAdversarialAttacks`)**:
   Executed in `backend/`:
   ```
   === RUN   TestChallengerAdversarialAttacks
   === RUN   TestChallengerAdversarialAttacks/Attack_1.1:_Broken_prev_roster_hash_fails_verification
   === RUN   TestChallengerAdversarialAttacks/Attack_2.1:_Mallory_signing_Alice_roster_fails_Alice_pubkey_verification
   === RUN   TestChallengerAdversarialAttacks/Attack_2.2:_Signer_user_ID_mismatch_in_canonical_payload
   === RUN   TestChallengerAdversarialAttacks/Attack_3.1:_Stealth_device_changes_audience_hash
   === RUN   TestChallengerAdversarialAttacks/Attack_3.2:_Rogue_device_injection_with_different_device_ID_changes_audience_hash
   === RUN   TestChallengerAdversarialAttacks/Attack_4.1:_Bit_flip_at_bytes_0,_15,_31,_63_fails_verification
   === RUN   TestChallengerAdversarialAttacks/Attack_4.2:_Bit_flip_in_CanonicalJSON_payload_fails_verification
   === RUN   TestChallengerAdversarialAttacks/Attack_5.1:_Device_key_tampering_fails_CanonicalDeviceSigningPayload_verification
   --- PASS: TestChallengerAdversarialAttacks (0.00s)
   PASS
   ok  	github.com/zerovc/zerovc/backend/internal/handlers	2.325s
   ```

4. **Backend Full Go Test Suite & Compilation**:
   - `go test ./...`: All packages PASS with 0 failures.
   - `go build ./...`: Exit code 0, 0 compiler warnings/errors.

5. **Frontend Regression Baseline & Production Build**:
   - `npx tsc --noEmit`: Exit code 0, 0 type errors.
   - `npm run test:e2ee-spike`: 27/27 tests passed (100% green).
   - `npm run test:e2ee-adversarial`: 44/44 tests passed (100% green).
   - `npm run test:livekit-gate`: 23/23 tests passed (100% green).
   - `npm run build`: Exit code 0, 2449 modules transformed into `client/dist/`, static assets cleanly synchronized to `backend/web/assets`.

---

## 2. Logic Chain

1. **Broken Hash Chain Verification**:
   - *Observation*: Tested in `scripts/challenger-m2-adversarial.ts` (Attacks 1.1–1.5) and Go `e2ee_challenger_test.go` (Attack 1.1).
   - *Logic*: In `client/src/crypto/rosterManager.ts` (lines 284–303), `verifyRoster` requires `roster.prev_roster_hash === await computeRosterPayloadHash(prevRoster)`. On the backend `backend/internal/handlers/e2ee_handlers.go` (lines 987–996), `SubmitRoster` returns `409 Conflict` with `e2ee_roster_hash_mismatch` if `reqPrevHash != expectedPrevHash`. Any modification to the historical roster chain breaks the SHA-256 link and causes deterministic rejection.

2. **Monotonic Version Progression & Replay Defense**:
   - *Observation*: Tested in `scripts/challenger-m2-adversarial.ts` (Attacks 2.1–2.5).
   - *Logic*: Version skips (v1 -> v3, v1 -> v100), rollbacks (v2 -> v1), and non-integer versions (<1, floats) are strictly rejected by `verifyRoster` (lines 275–290) and by backend `SubmitRoster` (lines 972–980, `409 Conflict e2ee_roster_conflict`). Duplicate version replays (v2 -> v2) are safely ignored by `handleRosterUpdate` (line 394).

3. **Stealth Device Injection & Audience Integrity**:
   - *Observation*: Tested in `scripts/challenger-m2-adversarial.ts` (Attacks 3.1–3.5) and Go `e2ee_challenger_test.go` (Attacks 3.1 & 3.2).
   - *Logic*: `computeAudienceHash` in `rosterManager.ts` (lines 98–109) applies RFC 8785 canonical key ordering over sorted `members` and sorted `devices`. An attacker attempting to inject an unannounced device into `devices` while keeping the original `audience_hash` triggers an immediate `Audience hash mismatch` failure. Furthermore, lines 328–336 strictly verify that every device's `user_id` belongs to `roster.members`, preventing foreign or orphan device injection.

4. **Signer Authorization & Non-Repudiation**:
   - *Observation*: Tested in `scripts/challenger-m2-adversarial.ts` (Attacks 4.1–4.5) and Go `e2ee_challenger_test.go` (Attacks 2.1 & 2.2).
   - *Logic*: `rosterManager.ts` requires `memberSet.has(roster.signer_user_id)` (line 339) and verifies the Ed25519 signature over the canonical payload against the signer's identity key (lines 347–376). Mallory signing Alice's roster fails member authorization or cryptographic signature verification. On the backend, `SubmitRoster` enforces that the signer has an active E2EE device and is authorized for the conversation room.

5. **Epoch Rollback Resistance**:
   - *Observation*: Tested in `scripts/challenger-m2-adversarial.ts` (Attacks 5.1–5.4).
   - *Logic*: `verifyRoster` enforces `roster.epoch >= prevRoster.epoch` and `epoch >= 0` (lines 279, 292). Any attempt to roll back epochs or pass negative/float values fails verification with `Epoch rollback violation`.

6. **Bit-Flip Signature & Payload Corruption**:
   - *Observation*: Tested in `scripts/challenger-m2-adversarial.ts` (Attacks 6.1–6.8) and Go `e2ee_challenger_test.go` (Attacks 4.1 & 4.2).
   - *Logic*: Flipping a single bit at offsets 0, 15, 31, or 63 of the 64-byte Ed25519 signature causes instant verification failure in both WebCrypto/Node SPKI and Go `crypto/ed25519.Verify`. Likewise, corrupting any character of the signed payload causes signature verification failure.

7. **Device Registration Canonical Binding**:
   - *Observation*: Tested in `scripts/challenger-m2-adversarial.ts` (Attacks 7.1–7.5) and Go `e2ee_challenger_test.go` (Attack 5.1).
   - *Logic*: Device registration binds the Olm Curve25519 and Ed25519 device keys to the user identity via `zerovc:device:<curve>:<ed>`. Any bit flip or attempt by an attacker to sign another user's device keys is rejected by signature verification against the registered user's Ed25519 identity key.

---

## 3. Caveats & Hardening Observations

1. **Security Observation 1 — Backend `SubmitRoster` Epoch Guard**:
   - In `backend/internal/handlers/e2ee_handlers.go` (line 948), `SubmitRoster` queries `&latest.Epoch` from the database, but does not explicitly check `if req.Epoch < latest.Epoch { return 409 }` before running the update query. The client-side `rosterManager.verifyRoster` strictly rejects epoch rollbacks before applying any roster update, so client integrity is maintained. However, for defense-in-depth, a one-line backend check is recommended when Milestone M5 implements `recomputeAudience`.
2. **Security Observation 2 — Alignment of Backend `ComputeAudienceHash`**:
   - `backend/internal/handlers/e2ee_handlers.go` defines `ComputeAudienceHash` using `user_id:device_id` without public keys, whereas frontend `computeAudienceHash` uses RFC 8785 canonical JSON including `curve25519_key` and `ed25519_key`. In M2, `SubmitRoster` accepts the client-provided `req.AudienceHash` and validates the Ed25519 signature over it; it does not invoke `ComputeAudienceHash` on the backend. When Milestone M5 centralizes `recomputeAudience(channel)`, the backend audience hash function should be updated to match the canonical JSON representation.
3. **No Caveats Regarding M2 Approval**:
   - Both observations are non-blocking for M2 and documented for Milestone M5 alignment.

---

## 4. Conclusion

Milestone M2 (Fase 1: Identidade, Dispositivos e Roster Assinado) is **APPROVED**:
- All 6 mandatory adversarial attack vectors (broken hash chain, version skip, stealth device injection, unauthorized signer, epoch rollback, bit-flip signature) were empirically tested and confirmed rejected with 100% success.
- Frontend test harness `client/scripts/challenger-m2-adversarial.ts` passed 37/37 attack tests.
- Backend test harness `backend/internal/handlers/e2ee_challenger_test.go` passed 8/8 attack tests.
- Zero regressions across existing test suites (M1 spike 27/27, adversarial crypto 44/44, livekit gate 23/23, frontend M2 20/20, Go full suite 100% green).
- Full production builds in Go (`go build ./...`) and TypeScript (`npm run build`) pass cleanly with exit code 0.

---

## 5. Verification Method

To independently reproduce the complete empirical adversarial verification suite:

1. **Run Frontend Challenger Adversarial Harness**:
   ```powershell
   cd "C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\client"
   npx tsx scripts/challenger-m2-adversarial.ts
   ```
   *Expected outcome*: 37/37 attack tests PASS.

2. **Run Backend Go Challenger Adversarial Harness**:
   ```powershell
   cd "C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\backend"
   go test -v ./internal/handlers -run TestChallengerAdversarialAttacks
   ```
   *Expected outcome*: 8/8 attack tests PASS.

3. **Run Regression Suites**:
   ```powershell
   cd "C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\client"
   npm run test:frontend-m2
   npm run test:e2ee-spike
   npm run test:e2ee-adversarial
   npm run test:livekit-gate
   npx tsc --noEmit
   npm run build
   ```
   *Expected outcome*: All suites report 100% PASS, 0 TypeScript errors, production build exits with code 0.
