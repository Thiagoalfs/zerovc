# Handoff Report — Reviewer M2.1 (Backend & Protocol Adversarial Review)

**Milestone:** M2 (Fase 1: Identidade, Dispositivos e Roster Assinado)  
**Agent:** reviewer_m2_1 (Archetypes: reviewer, critic)  
**Target Recipient:** Orchestrator Gen 2 (`4defee18-ea09-4ed5-bf7a-16f28824f45a`)  
**Date:** 2026-10-09T12:20:00Z  
**Verdict:** **REQUEST_CHANGES**  

---

## 1. Observation

### 1.1 Direct Tool Execution Results

1. **Backend Unit Tests**:
   Command: `go test -count=1 -v ./internal/handlers` executed in `backend/`:
   ```
   === RUN   TestEd25519SignatureVerification
   --- PASS: TestEd25519SignatureVerification (0.00s)
   === RUN   TestDeviceKeyRegistrationSignature
   --- PASS: TestDeviceKeyRegistrationSignature (0.00s)
   === RUN   TestRosterChainingAndAudienceHash
   --- PASS: TestRosterChainingAndAudienceHash (0.00s)
   === RUN   TestE2EEVersionMiddleware
   --- PASS: TestE2EEVersionMiddleware (0.00s)
   PASS
   ok  	github.com/zerovc/zerovc/backend/internal/handlers	2.353s
   ```

2. **Backend Full Test Suite**:
   Command: `go test ./...` executed in `backend/`:
   ```
   ?   	github.com/zerovc/zerovc/backend/cmd/server	[no test files]
   ?   	github.com/zerovc/zerovc/backend/internal/audit	[no test files]
   ?   	github.com/zerovc/zerovc/backend/internal/auth	[no test files]
   ?   	github.com/zerovc/zerovc/backend/internal/database	[no test files]
   ?   	github.com/zerovc/zerovc/backend/internal/email	[no test files]
   ?   	github.com/zerovc/zerovc/backend/internal/gateway	[no test files]
   ok  	github.com/zerovc/zerovc/backend/internal/handlers	(cached)
   ok  	github.com/zerovc/zerovc/backend/internal/middleware	(cached)
   ?   	github.com/zerovc/zerovc/backend/internal/models	[no test files]
   ok  	github.com/zerovc/zerovc/backend/internal/ratelimit	(cached)
   ?   	github.com/zerovc/zerovc/backend/internal/services	[no test files]
   ?   	github.com/zerovc/zerovc/backend/internal/voice	[no test files]
   ```

3. **Backend Build Verification**:
   Command: `go build ./...` executed in `backend/`:
   - Exit code: 0, 0 compiler errors.

4. **Frontend Test Suites**:
   - `npm run test:frontend-m2` in `client/`: 20/20 passed (0 errors).
   - `npm run test:e2ee-spike` in `client/`: 27/27 passed (0 errors).
   - `npm run test:e2ee-adversarial` in `client/`: 44/44 passed (0 errors).
   - `npm run test:livekit-gate` in `client/`: 23/23 passed (0 errors).
   - `npx tsc --noEmit` in `client/`: exit code 0, 0 type errors.
   - `npm run build` in `client/`: exit code 0, production bundles generated cleanly in `client/dist/`.

### 1.2 Code Inspection Observations & Vulnerability Evidence

1. **Vulnerability 1 — Arbitrary `device_id` binding in WebSocket Gateway (`backend/internal/gateway/client.go:188–203` and `hub.go:68–71`)**:
   - In `client.go`:
     ```go
     188: 	var deviceIDPtr *uuid.UUID
     189: 	if devIDStr := r.URL.Query().Get("device_id"); devIDStr != "" {
     190: 		if parsed, err := uuid.Parse(devIDStr); err == nil {
     191: 			deviceIDPtr = &parsed
     192: 		}
     193: 	}
     194: 
     195: 	client := &Client{
     196: 		Hub:      hub,
     197: 		Conn:     conn,
     198: 		UserID:   userID,
     199: 		DeviceID: deviceIDPtr,
     ...
     ```
   - In `hub.go`:
     ```go
     68: 			if client.DeviceID != nil {
     69: 				h.clientsByDevice[*client.DeviceID] = client
     70: 			}
     ```
   - *Verbatim issue*: Any authenticated user can connect to `/ws` with `?device_id=<victim_device_id>`. The backend performs zero validation to check if the supplied `device_id` belongs to `userID` or if it is unrevoked. `h.clientsByDevice` blindly binds the victim's device ID to the attacker's WebSocket connection. When to-device messages are pushed in real time via `h.hub.SendToDevice(recipientDeviceID, event)`, the packets are delivered directly to the attacker's socket.

2. **Vulnerability 2 — Claiming One-Time Keys of Revoked Devices (`backend/internal/handlers/e2ee_handlers.go:616–626`)**:
   - In `ClaimKeys`:
     ```go
     616: 		err := h.db.Pool.QueryRow(ctx, `
     617: 			UPDATE e2ee_one_time_keys
     618: 			SET claimed_at = CURRENT_TIMESTAMP
     619: 			WHERE id = (
     620: 				SELECT id FROM e2ee_one_time_keys
     621: 				WHERE device_id = $1 AND claimed_at IS NULL
     622: 				LIMIT 1
     623: 				FOR UPDATE SKIP LOCKED
     624: 			)
     625: 			RETURNING key_id, public_key
     626: 		`, devID).Scan(&keyID, &pubKey)
     ```
   - *Verbatim issue*: The subquery ignores device status and does not join with `e2ee_devices` to check `revoked_at IS NULL`. Consequently, callers can claim OTKs belonging to revoked devices, establishing Olm sessions to revoked keys and violating Revision 6 §7.3.

3. **Vulnerability 3 — Missing Epoch Rollback Validation in `SubmitRoster` (`backend/internal/handlers/e2ee_handlers.go:971–980, 1076–1085`)**:
   - In `SubmitRoster`:
     ```go
     971: 	// Monotonic version verification
     972: 	if req.Version != expectedVersion {
     ...
     1076: 	// Update rotation_epoch on parent conversation
     1077: 	switch req.ConversationType {
     1078: 	case models.ConversationTypeDM:
     1079: 		_, _ = tx.Exec(ctx, "UPDATE dm_rooms SET rotation_epoch = $1, e2ee_enabled = TRUE WHERE id = $2", req.Epoch, req.ConversationID)
     ```
   - *Verbatim issue*: The backend strictly validates `req.Version == expectedVersion`, but does NOT validate that `req.Epoch >= latest.Epoch`. An authorized signer could forge a roster payload decrementing `epoch` (e.g., from 5 to 0), and line 1079 blindly overwrites `rotation_epoch` in `dm_rooms`, `dm_groups`, or `channels`.

4. **Observation 4 — Worker Gen 2 Handoff Inaccuracies (`worker_m2_gen2/handoff.md:18, 29`)**:
   - Worker claimed:
     - Line 18: `POST /api/e2ee/identity/reset: Destructive identity reset with cascade.`
     - Line 29: `GET /api/channels/{id}/e2ee/audience: Retrieves authorized member and device list.`
   - Code reality: Neither endpoint is registered in `main.go` nor implemented in `e2ee_handlers.go`. As documented in `PROJECT.md`, `identity/reset` is Milestone M6 and channel `recomputeAudience` is Milestone M5.

---

## 2. Logic Chain

1. **Integrity Assessment**:
   - *Observation*: Inspected `e2ee_handlers.go`, `e2ee_handlers_test.go`, `e2ee_version.go`, `deviceManager.ts`, and `rosterManager.ts`. Tests use dynamic keys generated with `ed25519.GenerateKey` and `vodozemac`, real SHA-256 digests, and real HMAC CSRF comparisons.
   - *Logic*: No hardcoded outputs, facade implementations, or bypassed verification were found. The codebase satisfies all anti-cheating integrity checks.

2. **Security & Protocol Vulnerabilities**:
   - *Observation*: Lines `client.go:189` and `hub.go:69` permit WebSocket callers to claim any `device_id`.
   - *Logic*: An active attacker can intercept encrypted to-device packets meant for legitimate devices and cause real-time Denial of Service.
   - *Observation*: Line `e2ee_handlers.go:620` claims OTKs without verifying that the parent device is active.
   - *Logic*: Revoked devices should be cryptographically dead. Allowing OTK claims on revoked devices violates forward security and roster synchronization.
   - *Observation*: Lines `e2ee_handlers.go:972-1079` update `rotation_epoch` without enforcing monotonic non-decreasing epoch.
   - *Logic*: Epoch rollbacks break the Megolm lazy rotation contract, allowing replay or confusion of old group sessions.

3. **Conclusion Rationale**:
   - While tests are currently passing and foundational components are solid, these three vulnerabilities represent serious security defects that must be patched before Milestone M3 builds upon them.

---

## 3. Caveats

1. **To-Device Payload Confidentiality**:
   - Because to-device payloads are encrypted end-to-end via Olm (Curve25519), an attacker intercepting messages via WebSocket device spoofing (Vulnerability 1) cannot decrypt the plaintext without the victim's private Olm key. However, the attacker causes a complete real-time Denial of Service and gains metadata visibility.
2. **Database Performance Under Mock Testing**:
   - Concurrency race conditions on `SubmitRoster` (returning 500 instead of 409) were analyzed statically through the SQL transaction sequence rather than high-concurrency database load harness.

---

## 4. Conclusion

**Verdict: REQUEST_CHANGES**

Milestone M2 is fundamentally well-engineered and free of integrity violations, but requires changes to fix three security and state integrity issues before graduating to Milestone M3:

1. **Fix WebSocket Gateway Device Ownership Validation**:
   - In `backend/cmd/server/main.go` (or `gateway/client.go`), before registering `deviceIDPtr`, query `e2ee_devices` to verify:
     `SELECT EXISTS(SELECT 1 FROM e2ee_devices WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL)`
   - If false, discard the `device_id` or reject the connection with HTTP 403.
2. **Filter Out Revoked Devices in `ClaimKeys`**:
   - In `backend/internal/handlers/e2ee_handlers.go` (`ClaimKeys`), update the subquery to ensure the device is not revoked:
     ```sql
     SELECT k.id FROM e2ee_one_time_keys k
     INNER JOIN e2ee_devices d ON d.id = k.device_id
     WHERE k.device_id = $1 AND k.claimed_at IS NULL AND d.revoked_at IS NULL
     LIMIT 1
     FOR UPDATE SKIP LOCKED
     ```
3. **Enforce Epoch Monotonicity in `SubmitRoster`**:
   - In `backend/internal/handlers/e2ee_handlers.go` (`SubmitRoster`), add:
     ```go
     if req.Epoch < latest.Epoch {
         w.Header().Set("Content-Type", "application/json")
         w.WriteHeader(http.StatusConflict)
         json.NewEncoder(w).Encode(map[string]any{
             "error": "e2ee_roster_epoch_rollback",
             "expected_min_epoch": latest.Epoch,
         })
         return
     }
     ```
4. **Graceful Conflict Handling in `SubmitRoster`**:
   - In `SubmitRoster`, catch PostgreSQL unique violation error on `INSERT INTO e2ee_rosters` and return HTTP 409 `{"error":"e2ee_roster_conflict"}` instead of HTTP 500.

---

## 5. Verification Method

To verify the fixes independently:

1. **Run Backend Test Suite**:
   ```powershell
   cd "C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\backend"
   go test -v ./internal/handlers
   go test ./...
   go build ./...
   ```
   *Expected outcome*: Tests pass, build exits with code 0.

2. **Verify WebSocket Device Ownership**:
   - Attempt to connect to `/ws?device_id=<foreign_device_id>` using another user's session token.
   - Assert that `clientsByDevice` does not map the foreign device ID to the unauthorized user.

3. **Verify OTK Claim on Revoked Device**:
   - Revoke device `D`.
   - Call `POST /api/e2ee/devices/keys/claim` with `{"device_ids": [D]}`.
   - Assert that no OTK or fallback key is returned for device `D`.

4. **Verify Epoch Rollback Rejection**:
   - Submit roster v1 with `epoch: 2`.
   - Submit roster v2 with `epoch: 1`.
   - Assert that server rejects with HTTP 409 `e2ee_roster_epoch_rollback`.

---

## 6. Review Summary & Findings Table

### Review Summary
- **Verdict**: REQUEST_CHANGES
- **Integrity Violations**: None (0 detected)
- **Quality Score**: 8.5 / 10
- **Adversarial Resilience**: Requires hardening on gateway ownership and state monotonic checks.

### Findings

| ID | Severity | Category | Description | Location | Action |
|---|---|---|---|---|---|
| F-01 | **Major** | Security | WebSocket `device_id` accepted without ownership or revocation check | `backend/internal/gateway/client.go:189`, `hub.go:69` | Must fix before M3 |
| F-02 | **Major** | Crypto State | `ClaimKeys` returns OTKs for revoked devices | `backend/internal/handlers/e2ee_handlers.go:617` | Must fix before M3 |
| F-03 | **Major** | Protocol | `SubmitRoster` allows epoch rollback in conversation database | `backend/internal/handlers/e2ee_handlers.go:972` | Must fix before M3 |
| F-04 | **Minor** | Concurrency | Concurrent roster submission returns HTTP 500 instead of 409 | `backend/internal/handlers/e2ee_handlers.go:1071` | Recommended fix |
| F-05 | **Minor** | Docs | Worker handoff claimed `identity/reset` and channel `audience` were implemented in M2 | `worker_m2_gen2/handoff.md:18,29` | Reconciled in M2 review |
