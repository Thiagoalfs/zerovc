# DISPATCH — Worker M3 Backend (Milestone M3 Go Implementation)

## Mission & Scope
Implement all Go backend features, database updates, handlers, plaintext gating, idempotency, 15-member cap, endpoints, and unit tests for Milestone M3 (Mensageria E2EE em DMs e Grupos - Fases 2 e 4).

## Exclusive Write Ownership
You own and may ONLY edit files inside `backend/`:
- `backend/internal/database/schema.sql`
- `backend/internal/database/db.go`
- `backend/internal/models/` (`models.go`, `e2ee.go`)
- `backend/internal/handlers/` (`dm_handlers.go`, `dm_group_handlers.go`, `message_handlers.go`, `e2ee_handlers.go`)
- `backend/cmd/server/main.go` / `routes.go`
- `backend/internal/handlers/*_test.go`
DO NOT modify any file in `client/` or any file outside `backend/`.

## Mandatory References
1. `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\ORIGINAL_REQUEST.md` (READ FIRST)
2. `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\explorer_m3_backend\analysis.md` (Blueprint)
3. `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\spec_miner_m3_1\spec_analysis.md` (Requirements)
4. `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\orchestrator\PROJECT.md`

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Global Rules
- NUNCA execute git push automaticamente.
- Ações de alteração de estado EXCLUSIVAMENTE POST com validação CSRF (tempo constante `hash_equals`).
- NUNCA desative verificação TLS/SSL em cURL.
- Nenhum segredo criptográfico ou plaintext E2EE em logs ou retornado ao backend.

## Concrete Implementation Checklist
1. Schema & DB Migrations (`schema.sql` & `db.go`):
   - Add `e2ee_ciphertext TEXT` to `message_reactions` and `dm_group_message_id UUID REFERENCES dm_group_messages(id) ON DELETE CASCADE`.
   - Create table `e2ee_attachments` (`id UUID PRIMARY KEY`, `uploader_id UUID REFERENCES users(id)`, `file_size BIGINT`, `created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()`, `associated_message_id UUID NULL`).
   - Confirm `messages_search_vector_update` trigger evaluates `to_tsvector('portuguese', COALESCE(NEW.content, ''))` cleanly for `content = ''`.
2. Models (`models.go`, `e2ee.go`):
   - Ensure `Message`, `DMMessage`, and `DMGroupMessage` have `Encrypted bool`, `E2EECiphertext *string`, and `E2EEMeta *string` (or `json.RawMessage`).
   - Ensure `DMRoom` and `DMGroup` have `E2EEEnabled bool` and `RotationEpoch int`.
3. Handlers Plaintext Gating (`dm_handlers.go`, `dm_group_handlers.go`, `message_handlers.go`):
   - In `SendMessage`:
     * If room `e2ee_enabled == true` and (`!req.Encrypted` or `req.E2EECiphertext == ""`): return HTTP 409 Conflict with JSON `{"error": "e2ee_required"}`.
     * If room `e2ee_enabled == false` and `req.Encrypted == true`: return HTTP 409 Conflict with JSON `{"error": "e2ee_not_enabled"}`.
     * Allow `req.Content == ""` when `req.Encrypted == true` and `req.E2EECiphertext != ""`.
     * Store `content = ""` in DB for encrypted messages.
4. Idempotency Contract:
   - Accept optional client-generated `message_id` / `ID *uuid.UUID`.
   - If message with `(room_id, message_id)` already exists:
     * If author and ciphertext/content match: return 200/201 idempotent success with the existing message without duplicating DB row or emitting duplicate WebSocket event.
     * If payload conflicts: return HTTP 409 Conflict with `{"error": "idempotency_conflict"}`.
5. Group 15-Member Cap & Epoch Rotation (`dm_group_handlers.go`):
   - Enforce strictly max 15 members in `CreateGroup` and `AddMembers`.
   - On member addition/removal in E2EE group (`e2ee_enabled == true`), increment `rotation_epoch = rotation_epoch + 1` and broadcast `E2EE_ROTATION_REQUIRED`.
6. Enable E2EE Endpoints:
   - `POST /api/dms/{id}/e2ee/enable`
   - `POST /api/dm/groups/{id}/e2ee/enable`
   - Require POST + CSRF validation. Mark `e2ee_enabled = true`. Return updated room status.
7. Encrypted Attachments Endpoints (`e2ee_handlers.go`, `main.go`):
   - `POST /api/e2ee/attachments`: Accept `application/octet-stream`, store encrypted blob with UUID filename, insert row in `e2ee_attachments`, return JSON `{"id": "...", "size": ...}`.
   - `GET /api/e2ee/attachments/{id}`: Serve blob with `Content-Disposition: attachment; filename="encrypted.bin"` and `X-Content-Type-Options: nosniff`.
8. Key Requests Endpoint:
   - `POST /api/e2ee/key-requests`: Accept request payload, forward or queue in `e2ee_to_device` for recipient devices.
9. Verification:
   - Run `go test ./internal/...` and `go build ./...` in `backend/`. Ensure 100% pass rate.
   - Document commands, test output, and files changed in `handoff.md`.


## 2026-10-10T12:12:50Z
You are worker_m3_backend (Role: M3 Backend Worker).
Your working directory is: C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\worker_m3_backend\
Your parent is orchestrator_gen2.
Implementation Tasks:
1. Schema & DB Migrations (schema.sql & db.go)
2. Models (models.go, e2ee.go)
3. Plaintext Gating in Handlers (dm_handlers.go, dm_group_handlers.go, message_handlers.go)
4. Idempotency Contract
5. Group 15-Member Cap & Epoch Rotation (dm_group_handlers.go)
6. Enable E2EE Endpoints (/api/dms/{id}/e2ee/enable, /api/dm/groups/{id}/e2ee/enable)
7. Encrypted Attachments Endpoints (e2ee_handlers.go, main.go)
8. Key Requests Endpoint (/api/e2ee/key-requests)
9. Verification (go test, go build)
