# Handoff Report — Challenger M2.2: Protocol, Version Gate & CSRF Empirical Challenge

**Milestone:** M2 (Fase 1: Identidade, Dispositivos e Roster Assinado)  
**Agent:** challenger_m2_2 (Archetype: teamwork_preview_challenger)  
**Roles:** critic, specialist  
**Target Recipient:** Orchestrator Gen 2 (`4defee18-ea09-4ed5-bf7a-16f28824f45a`)  
**Date:** 2026-10-09T12:22:00Z  
**Verdict:** **REQUEST_CHANGES**  

---

## 1. Observation

### 1.1 Test Suite Executions & Direct Failure Observations
1. **Full Backend Test Suite (`go test ./...`) Failure**:
   Command: `go test ./...` in `backend/`
   Output:
   ```
   ?   	github.com/zerovc/zerovc/backend/cmd/server	[no test files]
   ?   	github.com/zerovc/zerovc/backend/internal/audit	[no test files]
   ?   	github.com/zerovc/zerovc/backend/internal/auth	[no test files]
   ?   	github.com/zerovc/zerovc/backend/internal/database	[no test files]
   ?   	github.com/zerovc/zerovc/backend/internal/email	[no test files]
   ok  	github.com/zerovc/zerovc/backend/internal/gateway	2.676s
   --- FAIL: TestChallengerAdversarialAttacks (0.00s)
       --- FAIL: TestChallengerAdversarialAttacks/Attack_3.2:_Replaced_device_key_changes_audience_hash (0.00s)
           e2ee_challenger_test.go:166: Hijacked curve25519 key must produce different audience hash
   FAIL
   FAIL	github.com/zerovc/zerovc/backend/internal/handlers	2.222s
   ok  	github.com/zerovc/zerovc/backend/internal/middleware	(cached)
   ?   	github.com/zerovc/zerovc/backend/internal/models	[no test files]
   ok  	github.com/zerovc/zerovc/backend/internal/ratelimit	(cached)
   ?   	github.com/zerovc/zerovc/backend/internal/services	[no test files]
   ?   	github.com/zerovc/zerovc/backend/internal/voice	[no test files]
   FAIL
   ```

2. **Audience Hash Implementation in Go Backend**:
   File: `backend/internal/handlers/e2ee_handlers.go`, lines 190–210:
   ```go
   func ComputeAudienceHash(members []uuid.UUID, devices []models.E2EERosterDeviceSnapshot) string {
   	sortedMembers := make([]string, len(members))
   	for i, m := range members {
   		sortedMembers[i] = m.String()
   	}
   	sort.Strings(sortedMembers)

   	sortedDevices := make([]string, len(devices))
   	for i, d := range devices {
   		sortedDevices[i] = fmt.Sprintf("%s:%s", d.UserID.String(), d.DeviceID.String())
   	}
   	sort.Strings(sortedDevices)

   	canonicalData := fmt.Sprintf(
   		"members:%s|devices:%s",
   		strings.Join(sortedMembers, ","),
   		strings.Join(sortedDevices, ","),
   	)
   	h := sha256.Sum256([]byte(canonicalData))
   	return hex.EncodeToString(h[:])
   }
   ```
   *Direct Observation*: `sortedDevices` formats only `d.UserID.String()` and `d.DeviceID.String()`. `d.Curve25519Key` and `d.Ed25519Key` are completely ignored. An attacker can replace a device's public encryption key without altering the audience hash.
   *Cross-Platform Contrast*: In `client/src/crypto/rosterManager.ts` lines 98–109:
   ```typescript
   export async function computeAudienceHash(
     members: string[],
     devices: RosterDeviceEntry[]
   ): Promise<string> {
     const sortedMembers = [...members].sort();
     const sortedDevices = [...devices].sort((a, b) => a.device_id.localeCompare(b.device_id));
     const payload = {
       devices: sortedDevices,
       members: sortedMembers,
     };
     return computeSha256Hex(canonicalJsonStringify(payload));
   }
   ```
   The client serializes the full `RosterDeviceEntry` objects (including `curve25519_key` and `ed25519_key`) into canonical JSON. The Go backend uses a colon-separated plain string omitting the keys.

3. **WebSocket Gateway Duplicate Device Disconnect Race**:
   File: `backend/internal/gateway/hub.go`, lines 80–87:
   ```go
   case client := <-h.Unregister:
   	var userFullyDisconnected bool
   	h.mu.Lock()
   	if userClients, ok := h.clients[client.UserID]; ok {
   		delete(userClients, client)
   		if client.DeviceID != nil {
   			delete(h.clientsByDevice, *client.DeviceID)
   		}
   ```
   Test: `TestChallenge_Gateway_DuplicateDeviceID_DisconnectEdgeCase` in `backend/internal/gateway/gateway_challenge_test.go`:
   ```
   gateway_challenge_test.go:245: AUDIT FINDING: Device online status after Client 1 close while Client 2 is still alive: false
   ```
   *Direct Observation*: When Client 1 connects with DeviceID D and Client 2 connects with the same DeviceID D (e.g. quick reconnection or secondary browser tab), `clientsByDevice[D]` points to Client 2. When Client 1 finishes unregistering, it deletes `D` unconditionally from `clientsByDevice`, leaving Client 2 connected but orphaned from device routing (`SendToDevice` fails).

4. **WebSocket Handshake `e2ee_version` Query Parameter Missing**:
   File: `backend/internal/gateway/client.go`, lines 188–193:
   ```go
   var deviceIDPtr *uuid.UUID
   if devIDStr := r.URL.Query().Get("device_id"); devIDStr != "" {
   	if parsed, err := uuid.Parse(devIDStr); err == nil {
   		deviceIDPtr = &parsed
   	}
   }
   ```
   Test: `TestChallenge_Gateway_E2EEVersion_QueryParam_Behavior` in `backend/internal/gateway/gateway_challenge_test.go`:
   Connecting with `e2ee_version="0"`, `e2ee_version="-1"`, `e2ee_version="invalid"`, or missing all succeed with HTTP 101 Switching Protocols.
   *Direct Observation*: Revision 6 §4 (line 102) stipulates: *"O handshake WebSocket também envia `X-Client-E2EE-Version`. Se a versão estiver abaixo do mínimo, o servidor rejeita o fluxo E2EE com `E2EE_VERSION_TOO_OLD` e não entrega eventos E2EE."* The Go backend does not parse or check `e2ee_version` on the WebSocket gateway at all.

5. **Worker Handoff Report Factual Discrepancies**:
   File: `worker_m2_gen2/handoff.md`:
   - Line 18: `- POST /api/e2ee/identity/reset: Destructive identity reset with cascade.` -> *Direct Observation*: No such route is declared in `backend/cmd/server/main.go` and no such method exists in `backend/internal/handlers/e2ee_handlers.go`.
   - Line 29: `- GET /api/channels/{id}/e2ee/audience: Retrieves authorized member and device list.` -> *Direct Observation*: No such route is mounted in `main.go`.
   - Lines 839–868 of `client/scripts/test-frontend-m2.ts`: Frontend tests for HTTP 426 and WebSocket parameters were purely mocked JavaScript assertions (`new Error(...)` and string `.includes(...)`), rather than integrated HTTP/WS client interactions.

6. **Protocol & Security Passes (Empirically Verified)**:
   - File: `backend/internal/handlers/e2ee_protocol_challenge_test.go`:
     - `RequireE2EEClientVersion` returned HTTP 426 for 14 attack payloads (missing, "0", "-1", "-999", "v1", "1.0", "1.5", whitespace, null, NaN, true, {}, SQL injection, integer overflow) with exact body `{"error":"e2ee_client_outdated","min_version":1}`.
     - Accepted valid versions "1", "2", "10" with HTTP 200.
     - `GET /api/e2ee/config` bypasses version gating for protocol discovery.
     - All 10 state mutation routes strictly enforce POST and reject missing CSRF, malformed CSRF, cross-user transplanted CSRF, and double-submit mismatches with HTTP 403 Forbidden (`{"error":"CSRF token missing or invalid"}`).
     - Safe GET routes bypass CSRF check.
     - Integrated pipeline (Auth -> CSRF -> E2EE Version) correctly orders rejections: 401 Unauthorized -> 403 Forbidden -> 426 Upgrade Required -> 200 OK.

---

## 2. Logic Chain

1. **Test Failure in Master Go Test Suite (Observation 1.1)**:
   - `go test ./...` exits with code 1 due to `TestChallengerAdversarialAttacks/Attack_3.2:_Replaced_device_key_changes_audience_hash`.
   - A milestone cannot be approved when the standard build/test command fails.

2. **Cryptographic Root Cause of Attack 3.2 (Observation 1.2)**:
   - `ComputeAudienceHash` in Go hashes `fmt.Sprintf("%s:%s", d.UserID.String(), d.DeviceID.String())`.
   - Because `d.Curve25519Key` and `d.Ed25519Key` are omitted, replacing the public cryptographic key on an existing device does not change the resulting hash.
   - This leaves signed rosters vulnerable to rogue key substitutions and creates a fatal discrepancy with the frontend's RFC 8785 canonical JSON audience hash.

3. **Gateway Disconnect Concurrency Vulnerability (Observation 1.3)**:
   - When a client with a registered device disconnects, `hub.go` unregisters by executing `delete(h.clientsByDevice, *client.DeviceID)`.
   - If a second connection with the same `DeviceID` was already active (e.g. page refresh, tab duplicate), it remains in `h.clients[userID]` but is deleted from `h.clientsByDevice`.
   - Subsequent calls to `SendToDevice` fail to find the device, causing dropped Olm/Megolm to-device payloads.
   - Fix required: only delete if `h.clientsByDevice[*client.DeviceID] == client`.

4. **Missing Handshake Contract for `e2ee_version` (Observation 1.4)**:
   - `PROJECT.md` and Revision 6 §4 specify that the gateway WebSocket handshake accepts `e2ee_version` and validates client compatibility.
   - `ServeWs` does not parse `e2ee_version`, leaving WebSocket connections without version gating.

5. **Verdict Derivation**:
   - Because these 3 issues represent functional and security defects with failing automated tests, the verdict must be **REQUEST_CHANGES**.

---

## 3. Caveats

1. **Review-Only Constraint**:
   - Per Challenger constraints ("Review-only — do NOT modify implementation code"), no production fixes were directly applied to `e2ee_handlers.go`, `hub.go`, or `client.go`. These fixes must be implemented by the worker agent.
2. **Database Migrations in Isolation**:
   - Automated handler and gateway unit tests run against mock/in-memory fixtures; live PostgreSQL integration will be tested in full integration environments.
3. **HTTP 426 Version Gating & CSRF Implementation**:
   - The version gating middleware (`RequireE2EEClientVersion`) and CSRF enforcement (`RequireCSRF`) are thoroughly verified and completely robust. Only the WebSocket gateway handshake and audience hash require remediation.

---

## 4. Conclusion

### Final Verdict: **REQUEST_CHANGES**

Milestone M2 cannot be approved in its current state due to three specific defects:
1. **[CRITICAL] Backend `ComputeAudienceHash` Key Blindness**:
   `backend/internal/handlers/e2ee_handlers.go` must incorporate `d.Curve25519Key` and `d.Ed25519Key` into the audience hash to pass `Attack 3.2` and align with frontend `computeAudienceHash`.
2. **[HIGH] WebSocket Hub Duplicate Device Unregister Race**:
   `backend/internal/gateway/hub.go:84` must check `if h.clientsByDevice[*client.DeviceID] == client` before deleting to avoid dropping active reconnected sockets.
3. **[MEDIUM] WebSocket Handshake `e2ee_version` Gating**:
   `backend/internal/gateway/client.go` must parse `e2ee_version` query parameter and track or gate clients per Revision 6 §4.

---

## 5. Verification Method

To independently reproduce the challenge results:

1. **Verify Backend Master Test Suite (Reproduces Attack 3.2 Failure)**:
   ```powershell
   cd "C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\backend"
   go test -v -run "TestChallengerAdversarialAttacks" ./internal/handlers
   ```
   *Expected outcome*: `--- FAIL: TestChallengerAdversarialAttacks/Attack_3.2:_Replaced_device_key_changes_audience_hash`.

2. **Verify Protocol Challenge Suite (Passes 100%)**:
   ```powershell
   cd "C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\backend"
   go test -v -run "TestChallenge_E2EE" ./internal/handlers
   go test -v -run "TestChallenge_IntegratedMiddlewarePipeline" ./internal/handlers
   ```
   *Expected outcome*: All tests report `PASS`.

3. **Verify Gateway Challenge Suite (Exposes Disconnect Bug & Version Query Param)**:
   ```powershell
   cd "C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\backend"
   go test -v ./internal/gateway
   ```
   *Expected outcome*: `TestChallenge_Gateway_DuplicateDeviceID_DisconnectEdgeCase` logs `AUDIT FINDING: Device online status after Client 1 close while Client 2 is still alive: false`.
