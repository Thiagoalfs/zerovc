# DISPATCH — Explorer M3 Backend (Milestone M3: Go Backend & Storage Architecture)

## Objective
Map and design all backend Go changes required for Milestone M3 (Mensageria E2EE em DMs e Grupos - Fases 2 e 4), inspecting existing code, schemas, and routes, and determining exact implementation points.

## Authoritative Reference Paths
- Original Request: `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\ORIGINAL_REQUEST.md`
- Project Plan: `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\orchestrator\PROJECT.md`
- Specification Reference: `c:\Users\Aluno CtrlPlay 4\Downloads\e2ee_implementation_plan_revision6.md`

## Areas of Investigation in `backend/`
1. Database Schema & Models:
   - Check `backend/internal/database/schema.sql` and `db.go`.
   - Inspect tables: `messages`, `dm_conversations`, `dm_groups`, `dm_group_members`, `attachments`, `reactions`, `e2ee_rosters`.
   - Identify needed columns:
     * `messages`: `encrypted BOOLEAN DEFAULT FALSE`, `e2ee_ciphertext TEXT`, `e2ee_meta TEXT` (or JSONB). Ensure `content` can be empty string without violating NOT NULL or search_vector triggers!
     * `dm_conversations` and `dm_groups`: `is_e2ee BOOLEAN DEFAULT FALSE` (or `e2ee_enabled`).
   - Check `search_vector` tsvector trigger on `messages` — ensure it does NOT index `e2ee_ciphertext` or error on empty `content`.
2. Handlers & Routes:
   - Check `backend/internal/handlers/dm_handlers.go`, `dm_group_handlers.go`, `message_handlers.go`, `e2ee_handlers.go`.
   - Plaintext Gating:
     * If room is E2EE (`is_e2ee == true`) and message is not encrypted (`encrypted != true` or empty ciphertext) -> return HTTP 409 Conflict with error code `e2ee_required`.
     * If room is NOT E2EE (`is_e2ee == false`) and client sends `encrypted == true` -> return HTTP 409 Conflict with error code `e2ee_not_enabled`.
   - Idempotency Contract:
     * Check how `message_id` is passed from client or generated.
     * Enforce uniqueness on `(conversation_id, message_id)`.
     * If duplicate `message_id` arrives with identical content/ciphertext -> return 200/201 idempotent success.
     * If duplicate `message_id` arrives with conflicting payload from same sender -> return HTTP 409 Conflict.
   - Group Member Cap:
     * Check `dm_group_handlers.go`: enforce max 15 members when creating or adding members to an E2EE group. Return HTTP 400/409 if exceeded.
   - Enable E2EE Endpoints:
     * `POST /api/dms/{id}/e2ee/enable`
     * `POST /api/dm/groups/{id}/e2ee/enable`
     * Must require POST and valid CSRF token.
   - Attachment Upload:
     * `POST /api/e2ee/attachments`: pre-encrypted binary upload, returns opaque UUID. Ensure `Content-Disposition: attachment` when serving.
   - Key Requests:
     * `POST /api/e2ee/key-requests` or routing through to-device messaging (`/api/e2ee/to-device`).
3. WebSocket Gateway:
   - Check `backend/internal/gateway/hub.go` and `client.go` to verify how message broadcast and to-device messages are routed without leaking plaintext.
4. Unit Testing Strategy:
   - Map existing tests (`e2ee_handlers_test.go`, `dm_handlers_test.go`, etc.) and plan comprehensive Go unit tests for all M3 behavior.

## Output Requirements
Write your detailed report to:
`C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\explorer_m3_backend\analysis.md`
and write your self-contained handoff to:
`C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\explorer_m3_backend\handoff.md`.
Notify orchestrator when done via send_message.
