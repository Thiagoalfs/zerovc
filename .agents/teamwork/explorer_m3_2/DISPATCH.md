# DISPATCH — Explorer M3.2 (Frontend & Codec Architecture)

## Identity
- Archetype: teamwork_preview_explorer
- Working Directory: C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\explorer_m3_2\
- Parent: orchestrator_gen2 (Conv: 4defee18-ea09-4ed5-bf7a-16f28824f45a)

## Mission & Scope
Map and design all frontend changes for Milestone M3 (R3: Mensageria E2EE em DMs e Grupos - Fases 2 e 4):
1. **Pure `messageCodec` Architecture**:
   - `client/src/messaging/messageCodec.ts`: Pure, idempotent encode/decode functions decoupled from UI store and unread counts.
   - Idempotent deduplication by `message_id`.
   - Isolated placeholder for undecryptable messages (`UNDECRYPTABLE_MESSAGE`) without breaking chat flow or unread badge.
2. **Envelope & Attachments**:
   - `client/src/crypto/envelope.ts`: Format `{ v: 1, body, reply_to, attachments, mentions, link_previews }`.
   - `client/src/crypto/attachments.ts`: Client-side AES-256-GCM encryption/decryption with per-file random key and IV.
3. **Session & Key Management**:
   - Outbound Megolm session per room/conversation.
   - Sharing Megolm session key to all member devices via Olm to-device message (`room_key`).
   - Group DM 15-member cap enforcement.
   - History isolation for new members (only receives Megolm sessions from their join epoch onwards).
   - Key request protocol (`key_request` / `room_key`): TTL, deduplication, first-valid signed response.
4. **Reactions & Edits**:
   - Reactions encrypted with Megolm session in `e2ee_ciphertext`.
   - Edits encrypted with higher `msg_index` on same `session_id`.

Produce concrete blueprints and write a comprehensive handoff report to `handoff.md`.
Notify parent via `send_message`.
