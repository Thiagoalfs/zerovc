# DISPATCH — Explorer M3 Frontend (Milestone M3: Frontend Architecture, Codec & UI)

## Objective
Map and design all frontend TypeScript/React changes for Milestone M3 (Mensageria E2EE em DMs e Grupos - Fases 2 e 4), inspecting existing code, stores, socket events, and crypto modules, and formulating concrete implementation blueprints.

## Authoritative Reference Paths
- Original Request: `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\ORIGINAL_REQUEST.md`
- Project Plan: `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\orchestrator\PROJECT.md`
- Specification Reference: `c:\Users\Aluno CtrlPlay 4\Downloads\e2ee_implementation_plan_revision6.md`

## Areas of Investigation in `client/`
1. Crypto Modules (`client/src/crypto/`):
   - Review `vodozemac` Megolm wrappers (`megolmSession.ts` or needed new modules).
   - Review `deviceManager.ts`, `rosterManager.ts`, `keyStore.ts`.
   - Design `envelope.ts`: canonical serialization of message payloads, reaction envelopes, edit envelopes.
   - Design `attachments.ts`: client-side file encryption using WebCrypto AES-256-GCM, generating random 256-bit key + 96-bit IV, computing SHA-256 digest, uploading blob to `/api/e2ee/attachments`, and placing key/iv/digest in envelope.
   - Design Megolm session distribution: sending `room_key` to all valid devices in signed roster via Olm to-device messages (`/api/e2ee/to-device`).
2. Messaging Codec (`client/src/messaging/messageCodec.ts`):
   - Architecture of pure `messageCodec`:
     * Must be pure and decoupled from Zustand UI stores and unread count state.
     * Decryption errors must NOT throw or crash rendering; return isolated undecryptable placeholder ("Mensagem criptografada indisponível").
     * Unread count must increment correctly on raw message arrival without waiting for asynchronous decryption.
3. Key Request Protocol:
   - When receiving a Megolm ciphertext for an unknown session: queue a `key_request` to-device message.
   - Rate limiting, deduplication, TTL, and processing incoming `room_key` to-device events to retroactively decrypt cached messages.
4. UI & Store Integration:
   - Check chat store (`client/src/stores/chatStore.ts` or equivalent) and message component (`MessageItem.tsx` etc.).
   - Enable E2EE toggle / indicator in DM header and Group settings.
   - Cap DM group creation / member addition at 15 members when E2EE is enabled.
   - History isolation: when adding a member to an E2EE group, sender MUST rotate Megolm session so new member cannot decrypt past messages.
5. Unit and Component Testing Strategy:
   - Plan comprehensive tests in `client/tests/` (e.g. `test-frontend-m3.ts`) verifying envelope encoding/decoding, attachment encryption/decryption, pure messageCodec decoupling, key request deduplication, and 15-member cap.

## Output Requirements
Write your detailed report to:
`C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\explorer_m3_frontend\analysis.md`
and write your self-contained handoff to:
`C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\explorer_m3_frontend\handoff.md`.
Notify orchestrator when done via send_message.


## 2026-10-10T12:01:47Z
[Message] timestamp=2026-10-10T12:01:47Z sender=e52a8903-b2c2-47c9-abdc-a9d7e7091fdf priority=MESSAGE_PRIORITY_HIGH content=You are explorer_m3_frontend (Role: M3 Frontend Explorer).
Your working directory is: C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\explorer_m3_frontend\
Your parent is orchestrator_gen2.

MANDATORY FIRST STEP:
Read C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\ORIGINAL_REQUEST.md and C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\explorer_m3_frontend\DISPATCH.md.
Also read C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\orchestrator\PROJECT.md and c:\Users\Aluno CtrlPlay 4\Downloads\e2ee_implementation_plan_revision6.md.

Your mission is to inspect the frontend codebase (client/) and design the complete technical implementation for Milestone M3 (Mensageria E2EE em DMs e Grupos - Fases 2 e 4):
1. Crypto Modules (client/src/crypto/):
   - Review existing vodozemac wrappers and deviceManager.ts, rosterManager.ts, keyStore.ts.
   - Design megolmSession.ts (Megolm group session management using vodozemac GroupSession and InboundGroupSession).
   - Design envelope.ts (canonical serialization of message text, attachments, reactions, edits).
   - Design attachments.ts (client-side AES-256-GCM file encryption/decryption, SHA-256 digest, upload to /api/e2ee/attachments).
   - Design Megolm session distribution: sending room_key via Olm to-device (/api/e2ee/to-device) to all active devices in room's signed roster.
2. Messaging Codec (client/src/messaging/messageCodec.ts):
   - Design pure messageCodec decoupled from Zustand UI stores and unread counters.
   - Decryption failure handling: return isolated undecryptable placeholder ("Mensagem criptografada indisponível") without crashing or throwing.
   - Unread count decoupling: raw messages increment unread count immediately upon arrival without awaiting async decryption.
3. Key Request Protocol:
   - Queue key_request to-device message when receiving ciphertext for unknown Megolm session.
   - Deduplication, rate-limiting, TTL, and processing incoming room_key to retroactively decrypt cached messages.
4. UI & Store Integration:
   - Check chat store, message rendering (MessageItem.tsx etc.), and DM/group creation/settings.
   - DM & Group E2EE toggle / indicator.
   - 15-member cap on E2EE DM group creation and member addition.
   - History isolation: rotate outbound Megolm session when a new member joins an E2EE group.
5. Testing Plan:
   - Plan comprehensive TypeScript tests in client/tests/ (e.g. test-frontend-m3.ts) for envelope encoding/decoding, attachment encryption/decryption, pure messageCodec decoupling, key request deduplication, and 15-member cap.

Write your full detailed technical analysis to:
C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\explorer_m3_frontend\analysis.md
Write your self-contained handoff to:
C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\explorer_m3_frontend\handoff.md
Send a message with your completion report back to parent orchestrator_gen2 via send_message.
