# DISPATCH — Explorer M2.1 (Backend Identity, Devices & Signed Roster Infrastructure)

## Milestone: M2 (R2 Infraestrutura de Identidade, Dispositivos e Roster Assinado - Fase 1)
Working Directory: `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\explorer_m2_1\`
Project Root: `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc`
Original Request: `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\ORIGINAL_REQUEST.md`
Specification: `c:\Users\Aluno CtrlPlay 4\Downloads\e2ee_implementation_plan_revision6.md`
Project Master Plan: `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\orchestrator\PROJECT.md`
Survey Backend Report: `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\explorer_survey_1\handoff.md`

## Mission
Investigate and produce the complete, drop-in technical design for the Go backend in Milestone M2:
1. Database migrations in `backend/internal/database/schema.sql` and `db.go:AutoMigrate`:
   - `e2ee_identities`, `e2ee_devices`, `e2ee_one_time_keys`, `e2ee_to_device`, `e2ee_rosters`, `e2ee_key_backups`, `e2ee_backup_sessions`.
   - Columns `e2ee_enabled BOOLEAN DEFAULT FALSE`, `rotation_epoch INT DEFAULT 1` on `dm_rooms`, `dm_groups`, `channels`.
2. Go structs and models in `backend/internal/models/e2ee.go`.
3. Client version middleware `backend/internal/middleware/e2ee_version.go`:
   - Checks `X-Client-E2EE-Version`, returns 426 Upgrade Required if < `E2EE_MIN_CLIENT_VERSION` (default: 1).
4. REST Handlers in `backend/internal/handlers/e2ee_handlers.go`:
   - All mutation endpoints strictly require POST and validate CSRF via `csrfService.RequireCSRF`.
   - `POST /api/e2ee/identities`
   - `GET /api/e2ee/identities/{user_id}`
   - `POST /api/e2ee/devices`: Verifies Ed25519 identity signature with standard Go `crypto/ed25519.Verify`.
   - `GET /api/e2ee/users/{user_id}/devices`
   - `POST /api/e2ee/devices/{device_id}/revoke`: Revokes device.
   - `POST /api/e2ee/devices/keys/claim`
   - `POST /api/e2ee/to-device`
   - `GET /api/e2ee/to-device`
   - `POST /api/e2ee/rosters`: Enforces monotonic `version = prev_version + 1`, `prev_roster_hash` chaining, and Ed25519 signature verification of the authorized signer.
   - `GET /api/e2ee/rosters/{conversation_id}`
   - `GET /api/e2ee/config`
5. WebSocket Gateway to-device delivery in `backend/internal/gateway/hub.go` and `client.go`:
   - Track `DeviceID *uuid.UUID` on client.
   - Push `E2EE_TO_DEVICE` real-time event when online.
6. Backend Unit Tests in `backend/internal/handlers/e2ee_handlers_test.go` verifying build and test suite execution (`go build ./...`, `go test ./...`).
7. Write full report to `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\explorer_m2_1\handoff.md`.


## 2026-10-08T18:01:39Z
You are Explorer M2.1 (Backend Identity, Devices & Signed Roster Infrastructure).
Working Directory: C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\explorer_m2_1\
Project Root: C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc
Original Request: C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\ORIGINAL_REQUEST.md
Specification: c:\Users\Aluno CtrlPlay 4\Downloads\e2ee_implementation_plan_revision6.md
Master Plan: C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\orchestrator\PROJECT.md

Read your full mission in C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\explorer_m2_1\DISPATCH.md.
Investigate and design complete drop-in Go backend code for Milestone M2:
- DB migrations in schema.sql and db.go (7 tables and channel/DM/group columns).
- Models in backend/internal/models/e2ee.go.
- Client version middleware in backend/internal/middleware/e2ee_version.go.
- REST Handlers in backend/internal/handlers/e2ee_handlers.go (all mutation endpoints strictly POST + CSRF).
- Standard library crypto/ed25519.Verify for device and roster signatures.
- WebSocket gateway to-device delivery in hub.go / client.go.
- Unit tests verifying `go build ./...` and `go test ./...`.

Maintain progress.md with 'Last visited: [timestamp]'. Write handoff to C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\explorer_m2_1\handoff.md and notify me via send_message.
