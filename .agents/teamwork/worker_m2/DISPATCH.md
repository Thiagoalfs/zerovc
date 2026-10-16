# DISPATCH — Worker M2 (Identity, Devices & Signed Roster Infrastructure Implementation)

## Milestone: M2 (R2 Infraestrutura de Identidade, Dispositivos e Roster Assinado - Fase 1)
Working Directory: `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\worker_m2\`
Project Root: `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc`
Original Request: `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\ORIGINAL_REQUEST.md`
Specification: `c:\Users\Aluno CtrlPlay 4\Downloads\e2ee_implementation_plan_revision6.md`
Project Master Plan: `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\orchestrator\PROJECT.md`

## Input Reports to Read
- Backend Design: `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\explorer_m2_1\handoff.md`
- Frontend Design: `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\explorer_m2_2\handoff.md`

## Write Ownership
Backend:
- `backend/internal/database/schema.sql`
- `backend/internal/database/db.go`
- `backend/internal/models/e2ee.go`
- `backend/internal/middleware/e2ee_version.go`
- `backend/internal/handlers/e2ee_handlers.go`
- `backend/internal/gateway/hub.go`
- `backend/internal/gateway/client.go`
- `backend/cmd/server/main.go`
- `backend/internal/handlers/e2ee_handlers_test.go`
Frontend:
- `client/src/lib/api.ts`
- `client/src/lib/socket.ts`
- `client/src/crypto/deviceManager.ts`
- `client/src/crypto/rosterManager.ts`
- `client/package.json`
- `client/scripts/test-frontend-m2.ts`

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Tasks
1. Implement Backend files per Explorer M2.1 blueprints:
   - Update `schema.sql` and `db.go` with 7 E2EE tables (`e2ee_identities`, `e2ee_devices`, `e2ee_one_time_keys`, `e2ee_to_device`, `e2ee_rosters`, `e2ee_key_backups`, `e2ee_backup_sessions`) and columns `e2ee_enabled`, `rotation_epoch`.
   - Create `backend/internal/models/e2ee.go`.
   - Create `backend/internal/middleware/e2ee_version.go` (426 Upgrade Required).
   - Create `backend/internal/handlers/e2ee_handlers.go` (16 endpoints, strict POST + CSRF, Ed25519 verification).
   - Update `hub.go` and `client.go` with device mapping and real-time to-device push.
   - Update `main.go` to mount routes.
   - Create `backend/internal/handlers/e2ee_handlers_test.go`.
   - Run `cd backend && go build ./...` and `go test ./...`.
2. Implement Frontend files per Explorer M2.2 blueprints:
   - Patch `client/src/lib/api.ts` to attach `X-Client-E2EE-Version: 1` and expose `api.e2ee`.
   - Patch `client/src/lib/socket.ts` with device ID and version query params.
   - Create `client/src/crypto/deviceManager.ts`.
   - Create `client/src/crypto/rosterManager.ts`.
   - Add `"test:frontend-m2": "tsx scripts/test-frontend-m2.ts"` to `client/package.json`.
   - Run `cd client && npm run test:frontend-m2`.
   - Run `cd client && npm run test:e2ee-spike`.
   - Run `cd client && npx tsc --noEmit`.
   - Run `cd client && npm run build`.
3. Verify that all backend and frontend builds and tests pass cleanly with exit code 0.

## 2026-10-08T18:14:59Z
You are Worker M2 (Identity, Devices & Signed Roster Infrastructure Implementation).
Working Directory: C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\worker_m2\
Project Root: C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc
Original Request: C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\ORIGINAL_REQUEST.md
Specification: c:\Users\Aluno CtrlPlay 4\Downloads\e2ee_implementation_plan_revision6.md
Master Plan: C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\orchestrator\PROJECT.md
