# BRIEFING — 2026-10-09T13:16:00Z

## Mission
Map and design frontend crypto & messaging architecture for Milestone M3 (R3: Mensageria E2EE em DMs e Grupos - Fases 2 e 4): pure messageCodec.ts, unread decoupling, envelope.ts, attachments.ts, outbound Megolm sessions, key requests, 15-member cap, reactions/edits, and history isolation.

## 🔒 My Identity
- Archetype: teamwork_preview_explorer
- Roles: investigation, synthesis
- Working directory: C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\explorer_m3_2\
- Original parent: 4defee18-ea09-4ed5-bf7a-16f28824f45a
- Milestone: M3 (Frontend & Codec Architecture)

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- Strictly follow e2ee_implementation_plan_revision6.md (§5, §7.6, §7.7, §7.8, §8, §11, §14 Fase 2 e 4)
- Comply with PROJECT.md and ORIGINAL_REQUEST.md
- Produce concrete blueprints for pure messageCodec.ts, unread decoupling, envelope.ts, attachments.ts, outbound Megolm sessions, key requests, 15-member cap, history isolation

## Current Parent
- Conversation ID: 4defee18-ea09-4ed5-bf7a-16f28824f45a
- Updated: 2026-10-09T13:16:00Z

## Investigation State
- **Explored paths**:
  - `ORIGINAL_REQUEST.md`, `PROJECT.md`, `e2ee_implementation_plan_revision6.md` (§5, §7.6-§7.8, §8, §11, §14)
  - `client/src/crypto/` (`keyStore.ts`, `identity.ts`, `deviceManager.ts`, `rosterManager.ts`, `megolmSession.ts`, `olmSession.ts`)
  - `client/src/stores/` (`dmStore.ts`, `dmGroupStore.ts`, `authStore.ts`, `uploadStore.ts`)
  - `client/src/lib/` (`api.ts`, `socket.ts`)
  - `client/src/components/` (`MessageItem.tsx`, `MessageInput.tsx`, `CreateDMGroupModal.tsx`, `AddDMGroupMembersModal.tsx`)
  - `backend/internal/handlers/` (`e2ee_handlers.go`, `dm_group_handlers.go`, `upload_handlers.go`)
- **Key findings**:
  - Pure `messageCodec.ts` must decouple decoding from Zustand stores and unread state.
  - Undecryptable messages must return isolated placeholders (`UNDECRYPTABLE_MESSAGE`) with error codes without throwing or breaking conversation rendering.
  - Unread count must be purely driven by message existence and author ID, never by decryption status.
  - `envelope.ts` must enforce strict `v: 1` schema, attachments metadata, reactions and mentions.
  - `attachments.ts` must use client-side WebCrypto AES-256-GCM with per-file 256-bit random key and 96-bit IV, with SHA-256 verification.
  - Outbound Megolm sessions must rotate lazily (100 msgs, 7 days, or epoch change), distributing `room_key` via Olm to-device messages to all devices in the active roster.
  - History isolation prevents distributing sessions prior to member join epoch, and `key_request` handler must reject requests for older epochs.
  - Key request protocol must enforce TTL (30s), cooldown deduplication, and accept only first valid signed response.
  - 15-member cap is already present in `CreateDMGroupModal.tsx` and `AddDMGroupMembersModal.tsx`, and must be strictly validated in stores.
  - Reactions and edits must use Megolm session ciphertext; edits advance ratchet `msg_index` for anti-replay.
- **Unexplored areas**: None. All core architectural components have been investigated.

## Key Decisions Made
- Architected blueprints for:
  1. `client/src/crypto/envelope.ts`
  2. `client/src/crypto/attachments.ts`
  3. `client/src/messaging/messageCodec.ts`
  4. `client/src/crypto/keyRequest.ts`
  5. Enhanced `megolmSession.ts` and `olmSession.ts` to-device exchange
  6. Integration guides for `dmStore.ts`, `dmGroupStore.ts`, and `MessageItem.tsx`.

## Artifact Index
- DISPATCH.md — Initial task dispatch
- BRIEFING.md — Persistent working memory
- progress.md — Liveness heartbeat
- handoff.md — 5-component handoff report with concrete blueprints
