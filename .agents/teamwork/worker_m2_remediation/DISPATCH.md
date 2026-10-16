# DISPATCH — Worker M2 Remediation (Iteration 2)

## Identity
- Archetype: teamwork_preview_worker
- Working Directory: C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\worker_m2_remediation\
- Parent: orchestrator_gen2 (Conv: 4defee18-ea09-4ed5-bf7a-16f28824f45a)

## Mission
Remediate the 9 concrete security, cryptographic, and protocol defects identified by Reviewer M2.1, Reviewer M2.2, and Challenger M2.2 in Milestone M2.

## Inputs
- `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\orchestrator_gen2\GATE_STATUS.md`
- `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\reviewer_m2_1\handoff.md`
- `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\reviewer_m2_2\handoff.md`
- `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\challenger_m2_2\handoff.md`
- `c:\Users\Aluno CtrlPlay 4\Downloads\e2ee_implementation_plan_revision6.md`

## Required Fixes

### 1. Backend: `ComputeAudienceHash` Key Inclusion (`backend/internal/handlers/e2ee_handlers.go`)
- In `ComputeAudienceHash`, format each device as `fmt.Sprintf("%s:%s:%s:%s", dev.UserID, dev.DeviceID, dev.Curve25519Key, dev.Ed25519Key)` to match frontend `rosterManager.ts` format `${d.user_id}:${d.device_id}:${d.curve25519_key}:${d.ed25519_key}`.

### 2. Backend: WebSocket Gateway Security & Versioning (`backend/internal/gateway/client.go` & `hub.go`)
- In `client.go`: Check device ownership and active status: verify `SELECT EXISTS(SELECT 1 FROM e2ee_devices WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL)` before setting `c.DeviceID`. If invalid, discard device ID or close connection.
- In `client.go`: Parse and validate query parameter `e2ee_version`. If present and < `appMiddleware.GetMinE2EEClientVersion()`, reject or close with error `E2EE_VERSION_TOO_OLD`.
- In `hub.go:84`: Guard device unregistration on disconnect: `if h.clientsByDevice[*client.DeviceID] == client { delete(h.clientsByDevice, *client.DeviceID) }`.

### 3. Backend: Revoked Device Filtering in `ClaimKeys` (`backend/internal/handlers/e2ee_handlers.go`)
- In `ClaimKeys`, update query to join `e2ee_devices` and ensure `d.revoked_at IS NULL`:
  `SELECT k.id FROM e2ee_one_time_keys k INNER JOIN e2ee_devices d ON d.id = k.device_id WHERE k.device_id = $1 AND k.claimed_at IS NULL AND d.revoked_at IS NULL LIMIT 1 FOR UPDATE SKIP LOCKED`

### 4. Backend: Epoch Monotonicity in `SubmitRoster` (`backend/internal/handlers/e2ee_handlers.go`)
- In `SubmitRoster`, reject `req.Epoch < latest.Epoch` with HTTP 409 Conflict: `{"error": "e2ee_roster_epoch_rollback"}`.
- Catch unique constraint violation on roster insert and return HTTP 409 Conflict: `{"error": "e2ee_roster_conflict"}`.

### 5. Frontend: Guard `localStorage` in Non-Browser Environments (`client/src/lib/api.ts`)
- In `api.ts`, guard all `localStorage` access with `typeof localStorage !== 'undefined'`.

### 6. Frontend: Roster Signer Authorization against Previous Roster (`client/src/crypto/rosterManager.ts`)
- In `verifyRoster`, when `prevRoster` exists, enforce that `prevRoster.members.includes(roster.signer_user_id)`. If false, reject as unauthorized signer.

### 7. Frontend: Cold-Start / Reconnect Roster Bootstrapping (`client/src/crypto/rosterManager.ts`)
- Provide `bootstrapRoster(roster)` method to initialize or update the active roster from an authenticated server snapshot when local state is empty.

### 8. Frontend: WebSocket Gateway Device ID Synchronization (`client/src/crypto/deviceManager.ts`)
- In `deviceManager.ts`, call `socket.updateE2EEDeviceId(registered.id)` immediately upon successful device registration.

### 9. Frontend: Genuine Test Suite (`client/scripts/test-frontend-m2.ts`)
- Refactor `test-frontend-m2.ts` to directly import production modules `rosterManager`, `deviceManager`, `api`, and `socket`. Remove duplicate implementation helpers and dummy facade assertions.

## MANDATORY INTEGRITY WARNING
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work.

## Verification Commands to Execute
1. Backend:
   `cd backend; go test -v ./internal/handlers; go test ./...; go build ./...`
2. Frontend:
   `cd client; npx tsc --noEmit; npm run test:frontend-m2; npm run test:e2ee-spike; npm run build`
3. Deliver `handoff.md` in your working directory and notify parent orchestrator via `send_message`.


## 2026-10-09T12:24:17Z
You are worker_m2_remediation (archetype: teamwork_preview_worker).
Working Directory: C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\worker_m2_remediation\
Parent Orchestrator Conv ID: 4defee18-ea09-4ed5-bf7a-16f28824f45a

Read your instructions in C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\worker_m2_remediation\DISPATCH.md
Read the reports:
- C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\orchestrator_gen2\GATE_STATUS.md
- C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\reviewer_m2_1\handoff.md
- C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\reviewer_m2_2\handoff.md
- C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\challenger_m2_2\handoff.md

Your mission is to implement the 9 specific fixes:
1. Backend ComputeAudienceHash key inclusion (UserID:DeviceID:Curve25519Key:Ed25519Key).
2. Backend client.go & hub.go device ownership validation, unregister disconnect guard, e2ee_version handshake validation.
3. Backend ClaimKeys join e2ee_devices to filter revoked devices.
4. Backend SubmitRoster epoch rollback rejection (409) and unique conflict handling.
5. Frontend api.ts localStorage guard for non-browser runtimes.
6. Frontend rosterManager.ts signer validation against prevRoster.members.
7. Frontend rosterManager.ts bootstrapRoster method for cold start / reconnect.
8. Frontend deviceManager.ts call socket.updateE2EEDeviceId.
9. Frontend test-frontend-m2.ts import production modules directly and remove facade duplicates.
