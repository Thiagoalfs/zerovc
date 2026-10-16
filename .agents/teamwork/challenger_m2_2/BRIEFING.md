# BRIEFING — 2026-10-09T12:21:00Z

## Mission
Adversarially challenge M2 backend version enforcement (HTTP 426), WebSocket device gateway parameters, and CSRF enforcement on state mutation routes.

## 🔒 My Identity
- Archetype: teamwork_preview_challenger
- Roles: critic, specialist
- Working directory: C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\challenger_m2_2\
- Original parent: 4defee18-ea09-4ed5-bf7a-16f28824f45a
- Milestone: M2
- Instance: 2 of 2

## 🔒 Key Constraints
- Review-only — do NOT modify implementation code
- Git push prohibited unless explicitly requested by user
- Empirical verification mandatory: write and run tests, do not trust claims without reproduction
- .agents/teamwork/ holds only metadata

## Current Parent
- Conversation ID: 4defee18-ea09-4ed5-bf7a-16f28824f45a
- Updated: 2026-10-09T12:11:16Z

## Review Scope
- **Files to review**: `backend/internal/middleware/e2ee_version.go`, `backend/internal/gateway/client.go`, `backend/internal/gateway/hub.go`, `backend/internal/handlers/e2ee_handlers.go`, `backend/internal/middleware/csrf.go`, `backend/cmd/server/main.go`.
- **Interface contracts**: `e2ee_implementation_plan_revision6.md`, `PROJECT.md`.
- **Review criteria**: HTTP 426 on missing/outdated/malformed X-Client-E2EE-Version, WebSocket handshake query param parsing (device_id, e2ee_version), CSRF token constant-time comparison & POST-only enforcement on state mutation routes.

## Attack Surface
- **Hypotheses tested**:
  1. `RequireE2EEClientVersion` correctly rejects missing, <=0, and malformed header inputs with HTTP 426 and JSON body: PASS.
  2. Public discovery endpoint `GET /api/e2ee/config` bypasses version gating: PASS.
  3. All 10 E2EE state mutation routes strictly enforce POST and CSRF HMAC tokens (cross-user transplantation, malformed, double-submit mismatch): PASS.
  4. Safe GET routes in E2EE bypass CSRF check: PASS.
  5. WebSocket gateway correctly parses `device_id` as UUID and ignores malformed/missing: PASS.
  6. WebSocket gateway tracks device online status and routes `SendToDevice`: PASS.
  7. WebSocket gateway parses and gates `e2ee_version` query parameter per Rev 6 §4: FAIL (Gateway completely ignores `e2ee_version`).
  8. Concurrent connections with same `device_id` handle disconnect safely without dropping live connection: FAIL (Naively unregistering Client 1 drops Client 2 from `clientsByDevice`).
  9. `ComputeAudienceHash` key sensitivity: FAIL (`ComputeAudienceHash` in `e2ee_handlers.go` only hashes `UserID:DeviceID`, omitting `Curve25519Key` and `Ed25519Key`).
- **Vulnerabilities found**:
  1. `ComputeAudienceHash` does not include Curve25519 or Ed25519 keys, allowing key substitution attacks without audience hash mismatch (`Attack 3.2` failing).
  2. WebSocket gateway `hub.go` deletes `clientsByDevice[*client.DeviceID]` on any disconnect even if a newer client is active with that same device ID.
  3. WebSocket gateway `client.go` does not parse or validate `e2ee_version` query parameter on `/ws`.
  4. Discrepancies in `worker_m2_gen2/handoff.md`: non-existent `POST /api/e2ee/identity/reset` and `GET /api/channels/{id}/e2ee/audience` claimed as implemented.
- **Untested angles**:
  - LiveKit SFrame audio/video integration in live cluster (Milestone M4).

## Loaded Skills
- None

## Key Decisions Made
- Created empirical test harnesses `backend/internal/gateway/gateway_challenge_test.go` and `backend/internal/handlers/e2ee_protocol_challenge_test.go`.
- Executed full test suites and observed test failure in `TestChallengerAdversarialAttacks` (`Attack 3.2`).
- Final verdict: REQUEST_CHANGES.

## Artifact Index
- `backend/internal/gateway/gateway_challenge_test.go` — Gateway handshake and device lifecycle stress tests
- `backend/internal/handlers/e2ee_protocol_challenge_test.go` — Version gating and CSRF mutation route stress tests
- `handoff.md` — Final verdict and empirical challenge report
