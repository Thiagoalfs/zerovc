# DISPATCH — Reviewer M3.1 (Backend Code Reviewer)

## Mission
Review the Go backend implementation of Milestone M3 (Mensageria E2EE em DMs e Grupos - Fases 2 e 4).

## Files to Review
- `backend/internal/database/schema.sql` & `db.go`
- `backend/internal/models/models.go` & `e2ee.go`
- `backend/internal/handlers/dm_handlers.go`, `dm_group_handlers.go`, `message_handlers.go`, `e2ee_handlers.go`
- `backend/cmd/server/main.go`
- `backend/internal/handlers/*_test.go`
- Worker handoff: `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\worker_m3_backend\handoff.md`

## Required Verification
1. Run `go build ./...` in `backend/`.
2. Run `go test -count=1 ./internal/...` in `backend/`.
3. Verify:
   - Plaintext gating: 409 `e2ee_required` and 409 `e2ee_not_enabled`.
   - Zero plaintext storage: `content = ''` for encrypted messages, protecting `search_vector`.
   - Idempotency contract on `(conversation_id, message_id)`.
   - Strict 15-member DM group cap and `rotation_epoch` increment with `E2EE_ROTATION_REQUIRED`.
   - Enable endpoints: `POST /api/dms/{id}/e2ee/enable` & `POST /api/dm/groups/{id}/e2ee/enable` with CSRF checks.
   - Encrypted attachments: `POST /api/e2ee/attachments` and `GET /api/e2ee/attachments/{id}` (`Content-Disposition: attachment`).
   - Key requests: `POST /api/e2ee/key-requests`.
4. Output `handoff.md` with clear verdict: APPROVE or REQUEST_CHANGES.
## 2026-10-10T12:44:38Z
You are reviewer_m3_1 (Role: M3 Backend Reviewer).
Your working directory is: C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\reviewer_m3_1\
Your parent is orchestrator_gen2.

MANDATORY FIRST STEP:
Read C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\ORIGINAL_REQUEST.md and C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\reviewer_m3_1\DISPATCH.md.
Also read C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\worker_m3_backend\handoff.md and C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\orchestrator\PROJECT.md.

YOUR MISSION:
Review the Go backend changes made for Milestone M3 in backend/:
1. Run go build ./... in backend/.
2. Run go test -count=1 ./internal/... in backend/.
3. Verify:
   - Plaintext gating: HTTP 409 e2ee_required (in E2EE rooms) and 409 e2ee_not_enabled (in non-E2EE rooms).
   - Zero plaintext storage: content = '' for encrypted messages, protecting search_vector triggers.
   - Idempotency contract on (conversation_id, message_id).
   - Strict 15-member cap on DM groups and rotation_epoch increments with E2EE_ROTATION_REQUIRED.
   - Endpoints: POST /api/dms/{id}/e2ee/enable, POST /api/dm/groups/{id}/e2ee/enable, POST /api/e2ee/attachments, GET /api/e2ee/attachments/{id}, POST /api/e2ee/key-requests.
4. Write your self-contained handoff.md with clear verdict: APPROVE or REQUEST_CHANGES.
Send completion message to parent orchestrator_gen2 via send_message.
