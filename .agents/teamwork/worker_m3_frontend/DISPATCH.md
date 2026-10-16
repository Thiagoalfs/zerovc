# DISPATCH — Worker M3 Frontend (Milestone M3 Frontend Implementation)

## Mission & Scope
Implement all TypeScript frontend features, cryptographic modules, pure messaging codec, envelope serialization, attachments AES-256-GCM, key requests protocol, UI components, and automated tests for Milestone M3 (Mensageria E2EE em DMs e Grupos - Fases 2 e 4).

## Exclusive Write Ownership
You own and may ONLY edit files inside `client/`:
- `client/src/crypto/` (`megolmSession.ts`, `envelope.ts`, `attachments.ts`, `keyRequestManager.ts`)
- `client/src/messaging/` (`messageCodec.ts`)
- `client/src/stores/` (`dmStore.ts`, `dmGroupStore.ts`)
- `client/src/components/` (`Chat/MessageItem.tsx`, `Chat/ChatHeader.tsx`, `DM/DMChatArea.tsx`, `DM/DMGroupChatArea.tsx`, `Modals/CreateDMGroupModal.tsx`, `Modals/AddDMGroupMembersModal.tsx`)
- `client/src/App.tsx` (WebSocket subscriptions)
- `client/scripts/test-frontend-m3.ts` (automated test suite)
DO NOT modify any file in `backend/` or any file outside `client/`.

## Mandatory References
1. `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\ORIGINAL_REQUEST.md` (READ FIRST)
2. `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\explorer_m3_frontend\analysis.md` (Blueprint)
3. `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\spec_miner_m3_1\spec_analysis.md` (Requirements)
4. `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\orchestrator\PROJECT.md`

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Global Rules
- NUNCA execute git push automaticamente.
- Ações de alteração de estado EXCLUSIVAMENTE POST com validação CSRF (tempo constante `hash_equals`).
- Zero segredos ou plaintext exposto no DOM ou em console logs.
- Manter compilação limpa de TypeScript (`npm run build`).

## Concrete Implementation Checklist
1. Megolm Session Management (`client/src/crypto/megolmSession.ts`):
   - Outbound `GroupSession` and inbound `InboundGroupSession` using `@kinsh/vodozemac-wasm`.
   - Ratchet rotation on `rotation_epoch`, max 100 messages, or 7 days.
   - Outbound key distribution: export session key and distribute via Olm to-device (`POST /api/e2ee/to-device` with `msg_type: 'room_key'`) to all active devices in room roster.
2. Canonical Envelopes (`client/src/crypto/envelope.ts`):
   - RFC 8785 canonical JSON serialization of message payload (text, attachments, mentions, reactions, edits).
   - Envelope types: `message`, `reaction`, `edit`.
3. Client-Side Attachments (`client/src/crypto/attachments.ts`):
   - WebCrypto `AES-256-GCM` encryption/decryption. Random 256-bit key, 96-bit IV, SHA-256 digest.
   - Upload pre-encrypted blob to `/api/e2ee/attachments` with opaque UUID.
   - Embed key, IV, digest, and mime type inside Megolm envelope.
4. Pure Messaging Codec (`client/src/messaging/messageCodec.ts`):
   - Pure, decoupled from Zustand UI store and unread counts.
   - Decode message: if encrypted, fetch InboundGroupSession, decrypt Megolm ciphertext, parse envelope.
   - If decryption fails: return isolated placeholder `{ decryption_status: 'undecryptable', display_content: 'Mensagem criptografada indisponível' }` without throwing.
   - Unread count decoupling: raw messages increment unread count immediately upon WebSocket arrival without awaiting async decryption.
5. Key Request Protocol (`client/src/crypto/keyRequestManager.ts`):
   - On unknown session ID during decode: trigger `keyRequestManager.requestKey(roomId, sessionId)`.
   - Rate limiting (10/min), deduplication (30s TTL), queuing to-device `key_request`.
   - Handle incoming `room_key` to import InboundGroupSession and re-decode cached undecrypted messages.
6. UI & Store Integration:
   - `CreateDMGroupModal.tsx` & `AddDMGroupMembersModal.tsx`: Strictly enforce 15-member cap and add E2EE toggle.
   - History isolation: When adding a member to an E2EE group, sender rotates outbound Megolm session so new member cannot decrypt past messages.
   - `ChatHeader.tsx`, `DMChatArea.tsx`, `DMGroupChatArea.tsx`: Show E2EE badge and support sending encrypted messages.
   - `MessageItem.tsx`: Handle `encrypted: true` and display undecryptable placeholder safely.
   - `App.tsx`: Subscribe to `E2EE_TO_DEVICE`, `E2EE_ROSTER_UPDATE`, `E2EE_ROTATION_REQUIRED`.
7. Automated Test Suite (`client/scripts/test-frontend-m3.ts`):
   - Write comprehensive tests covering:
     * Megolm session creation, encryption, export, import, and decryption.
     * Envelope canonical serialization and parsing (text, reactions, edits).
     * Attachments AES-256-GCM encryption, SHA-256 verification, and decryption.
     * Pure messageCodec decoding and resilient undecryptable fallback.
     * Unread count decoupling verification.
     * Key request deduplication and rate limiting.
     * 15-member group cap enforcement.
   - Add script to `package.json` if appropriate: `npm run test:frontend-m3`.
8. Verification:
   - Run `npx tsx scripts/test-frontend-m3.ts` and `npm run build` in `client/`. Ensure 100% pass rate.
   - Document commands, test output, and files changed in `handoff.md`.

## 2026-10-10T12:12:50Z
Received dispatch from e52a8903-b2c2-47c9-abdc-a9d7e7091fdf (orchestrator_gen2).
Scope: Milestone M3 Frontend Implementation.
Write ownership strictly client/:
- client/src/crypto/ (megolmSession.ts, envelope.ts, attachments.ts, keyRequestManager.ts)
- client/src/messaging/ (messageCodec.ts)
- client/src/stores/ (dmStore.ts, dmGroupStore.ts)
- client/src/components/ (Chat/MessageItem.tsx, Chat/ChatHeader.tsx, DM/DMChatArea.tsx, DM/DMGroupChatArea.tsx, Modals/CreateDMGroupModal.tsx, Modals/AddDMGroupMembersModal.tsx)
- client/src/App.tsx (WebSocket subscriptions)
- client/scripts/test-frontend-m3.ts
- client/package.json (test:frontend-m3 script)
- client/src/lib/api.ts (e2ee endpoints if needed within client/)
