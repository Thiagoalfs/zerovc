# DISPATCH — Explorer M3.1 (Backend & Storage)

## Identity
- Archetype: teamwork_preview_explorer
- Working Directory: C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\explorer_m3_1\
- Parent: orchestrator_gen2 (Conv: 4defee18-ea09-4ed5-bf7a-16f28824f45a)

## Mission & Scope
Map and design all backend changes for Milestone M3 (R3: Mensageria E2EE em DMs e Grupos - Fases 2 e 4):
1. **Message Handlers**:
   - `backend/internal/handlers/dm_handlers.go`
   - `backend/internal/handlers/dm_group_handlers.go`
   - `backend/internal/handlers/message_handlers.go`
   - `backend/internal/handlers/e2ee_handlers.go`
2. **Protocol & Security Requirements**:
   - Reject plaintext in E2EE rooms (`409 e2ee_required`).
   - Reject `encrypted=true` in non-E2EE rooms (`409 e2ee_not_enabled`).
   - Idempotency by `conversation_id + message_id`: retry with identical payload returns success (200/201); conflicting ciphertext returns 409 Conflict.
   - For E2EE messages: store `content = ''`, `encrypted = true`, `e2ee_ciphertext`, `e2ee_meta = {v, alg, session_id, sender_device_id, msg_index, epoch, ciphertext_hash}`.
   - Reactions: store `reactions.e2ee_ciphertext`.
   - Message edits: preserve `message_id`, require higher `msg_index` (anti-replay), update `e2ee_meta`.
   - Dedicated attachments upload route: `POST /api/e2ee/attachments` accepting `application/octet-stream`, random UUID, setting `Content-Disposition: attachment`.
   - Key request endpoint: `POST /api/e2ee/key-requests` (TTL, rate limit, audience membership validation).
   - E2EE enable endpoints: `POST /api/dms/{id}/e2ee/enable` and `POST /api/dm/groups/{id}/e2ee/enable` with CSRF validation.

Produce concrete proposed patches and write a comprehensive handoff report to `handoff.md`.
Notify parent via `send_message`.

## 2026-10-09T13:07:14Z
From: 4defee18-ea09-4ed5-bf7a-16f28824f45a
You are explorer_m3_1 (archetype: teamwork_preview_explorer).
Working Directory: C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\explorer_m3_1\
Parent Orchestrator Conv ID: 4defee18-ea09-4ed5-bf7a-16f28824f45a

Read your instructions in C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\explorer_m3_1\DISPATCH.md
Read the authoritative specifications:
- C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\ORIGINAL_REQUEST.md
- c:\Users\Aluno CtrlPlay 4\Downloads\e2ee_implementation_plan_revision6.md (specifically §5, §7.6, §7.7, §7.8, §8, §10.2, §10.3, §10.4, §14 Fase 2 e 4)
- C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\orchestrator\PROJECT.md

Investigate backend handlers (dm_handlers.go, dm_group_handlers.go, message_handlers.go, e2ee_handlers.go), database schema, attachments upload route, key-requests route, and message idempotency.
Produce concrete proposed patches and write your comprehensive handoff report to C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\explorer_m3_1\handoff.md.
Notify parent via send_message.
