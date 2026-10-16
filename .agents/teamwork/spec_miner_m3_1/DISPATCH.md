# DISPATCH — Spec Miner M3.1 (Milestone M3: E2EE Messaging in DMs & Groups)

## Objective
Extract authoritative requirements, schemas, state machines, error codes, HTTP statuses, and validation rules for Milestone M3 (Mensageria E2EE em DMs e Grupos - Fases 2 e 4) from the specification documents.

## Authoritative Reference Paths
- Specification Reference: `c:\Users\Aluno CtrlPlay 4\Downloads\e2ee_implementation_plan_revision6.md` (Focus on §5, §7.6-§7.8, §7.10, §8, §10.3, §11, §14 Fase 2 e Fase 4)
- Original Request: `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\ORIGINAL_REQUEST.md`
- Project Plan: `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\orchestrator\PROJECT.md`

## Required Findings to Extract
1. Room E2EE State & Plaintext Gating:
   - What happens when a client sends plaintext in an E2EE room? (HTTP status, error code, e.g. 409 e2ee_required)
   - What happens when a client sends encrypted=true in a non-E2EE room? (HTTP status, error code, e.g. 409 e2ee_not_enabled)
   - How is E2EE enabled on DMs and DM Groups? Endpoints, permissions, CSRF requirements.
2. Group Size & Membership:
   - Strict 15-member cap for E2EE DM groups (Fase 4). Enforcement on creation and member addition.
   - History isolation: new members MUST NOT receive past Megolm session keys (ratchet forward / fresh session).
3. Database & Message Schema:
   - Message columns: `content = ''` for E2EE messages, `encrypted = true`, `e2ee_ciphertext`, `e2ee_meta` (JSONB/TEXT).
   - How `search_vector` and preview lateral joins are protected from plaintext leakage.
   - Idempotency contract: `conversation_id` + `message_id`. Retries return 200/201 with existing record, conflicting payload returns 409.
4. Encrypted Envelopes, Reactions & Edits:
   - Megolm envelope format (JSON inside ciphertext): fields, message types.
   - Reactions: how encrypted reactions are modeled and rendered.
   - Edits: preserving `message_id`, incrementing `msg_index` / edit timestamp, anti-replay rules.
5. Attachments:
   - Dedicated endpoint: `POST /api/e2ee/attachments`. Headers (`Content-Disposition: attachment`), response format (opaque UUID).
   - Client-side AES-256-GCM encryption: key, IV, sha256 digest included in Megolm envelope.
6. Key Request & Distribution Protocol:
   - To-device `room_key` distribution to roster members.
   - `key_request` protocol: format, rate limiting, TTL, deduplication, handling `room_key` responses.
   - Handling undecryptable messages: isolated UI placeholder without breaking unread badge.

## Output Requirements
Write your detailed report to:
`C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\spec_miner_m3_1\spec_analysis.md`
and write your self-contained handoff to:
`C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\spec_miner_m3_1\handoff.md`.
Notify orchestrator when done via send_message.

## 2026-10-10T12:01:47Z
[Message] timestamp=2026-10-10T12:01:47Z sender=e52a8903-b2c2-47c9-abdc-a9d7e7091fdf priority=MESSAGE_PRIORITY_HIGH content=You are spec_miner_m3_1 (Role: M3 Specification Miner).
Your working directory is: C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\spec_miner_m3_1\
Your parent is orchestrator_gen2.

MANDATORY FIRST STEP:
Read C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\ORIGINAL_REQUEST.md and C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\spec_miner_m3_1\DISPATCH.md.
Also read C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\orchestrator\PROJECT.md and c:\Users\Aluno CtrlPlay 4\Downloads\e2ee_implementation_plan_revision6.md (specifically §5, §7.6-§7.8, §7.10, §8, §10.3, §11, §14 Fase 2 e Fase 4).

Your mission is to extract and document all precise requirements, contracts, protocols, data schemas, error codes, HTTP statuses, and edge cases for Milestone M3 (Mensageria E2EE em DMs e Grupos - Fases 2 e 4):
1. Room E2EE State & Plaintext Gating:
   - 409 Conflict 'e2ee_required' when sending plaintext in E2EE rooms
   - 409 Conflict 'e2ee_not_enabled' when sending encrypted=true in non-E2EE rooms
   - Endpoints and CSRF requirements to enable E2EE on DMs and DM Groups (POST /api/dms/{id}/e2ee/enable, POST /api/dm/groups/{id}/e2ee/enable)
2. Group Size & Membership:
   - Strict 15-member cap for E2EE DM groups (creation & adding members)
   - History isolation: new members must not receive past Megolm session keys
3. Database & Message Schema:
   - Message columns: content='' for E2EE messages, encrypted=true, e2ee_ciphertext, e2ee_meta
   - Protection of search_vector tsvector trigger and lateral joins from plaintext leaks
   - Idempotency contract: (conversation_id, message_id), idempotent 200/201 on identical payload, 409 on conflicting payload
4. Encrypted Envelopes, Reactions & Edits:
   - Megolm envelope format (JSON inside ciphertext)
   - Encrypted reactions
   - Encrypted edits: preserving message_id, increasing msg_index, anti-replay
5. Attachments:
   - Dedicated upload endpoint: POST /api/e2ee/attachments (opaque UUID, Content-Disposition: attachment)
   - Client-side AES-256-GCM encryption: key, IV, sha256 digest inside Megolm envelope
6. Key Request & Distribution Protocol:
   - To-device room_key distribution to roster members
   - key_request protocol: rate limiting, TTL, deduplication, handling room_key responses
   - Undecryptable message handling: isolated UI placeholder without breaking unread badge

Write your full detailed report to:
C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\spec_miner_m3_1\spec_analysis.md
Write your self-contained handoff to:
C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\spec_miner_m3_1\handoff.md
Send a message with your completion report back to parent orchestrator_gen2 via send_message.
