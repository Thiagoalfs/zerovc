# BRIEFING — 2026-10-15T17:36:00Z

## Mission
Formulate the exact technical blueprint for `client/src/stores/voiceStore.ts` (device_id extraction, pre-existing participants sync, resource cleanup) and `client/package.json` script flags.

## 🔒 My Identity
- Archetype: explorer
- Roles: M4 Store Integration Explorer
- Working directory: C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\explorer_m4_store
- Original parent: c7bad961-fa24-42cb-b324-2269f48b6b9e
- Milestone: Milestone M4 (LiveKit Voice/Video E2EE)

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- NUNCA execute git push automaticamente
- Mutações de estado exclusivamente via POST com CSRF
- Sem vazamento de chaves privadas ou plaintext em logs/DOM
- Manter compilação limpa de Go e TypeScript

## Current Parent
- Conversation ID: c7bad961-fa24-42cb-b324-2269f48b6b9e
- Updated: not yet

## Investigation State
- **Explored paths**:
  - `client/src/stores/voiceStore.ts`
  - `client/src/lib/livekitE2EE.ts`
  - `client/src/crypto/callKeys.ts`
  - `client/src/lib/livekit.ts`
  - `client/package.json`
  - `.agents/teamwork/reviewer_m4_1/handoff.md`
  - `.agents/teamwork/reviewer_m4_2/handoff.md`
  - `backend/internal/handlers/channel_handlers.go`, `dm_handlers.go`, `dm_group_handlers.go`
- **Key findings**:
  1. `DEVICE_ID_EXTRACTION`: `voiceStore.ts` lines 251-256 passes `participant.identity` (User ID) into `callKeyManager.handleParticipantJoined`, breaking `min_lex(device_id)` election and violating foreign key `REFERENCES e2ee_devices(id)` in PostgreSQL.
  2. `PRE_EXISTING_PARTICIPANTS`: `callKeyManager.startCall` is called before `livekit.connect(...)` with empty `[]`, and `RoomEvent.ParticipantConnected` does not fire for already connected participants.
  3. `RESOURCE_CLEANUP`: `livekitE2EEManager.cleanup()` is never called in `voiceStore.ts` on leave, disconnect, or error, leaking Web Workers.
  4. `PACKAGE_JSON_CONSISTENCY`: `client/package.json` line 15 lacks `-r ./scripts/test-setup-worker.ts`, causing `npm run test:frontend-m3` to fail with `ReferenceError: onmessage is not defined`.
- **Unexplored areas**: None within the voice store scope.

## Key Decisions Made
- Formulated precise, drop-in replacement code snippets for `voiceStore.ts` and `client/package.json`.
- Added `extractParticipantDeviceId` helper and `participantDeviceMap` tracking in `voiceStore.ts`.
- Moved `callKeyManager.startCall(...)` invocation to run immediately after `await livekit.connect(...)`, extracting `room.remoteParticipants` into `existingDeviceIds`.
- Invoked `livekitE2EEManager.cleanup()` in `cleanupPreviousConnection`, `leaveVoice`, `onDisconnected`, and catch blocks.
- Documented verification commands and test results.

## Artifact Index
- `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\explorer_m4_store\analysis.md` — Detailed analysis and blueprint
- `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\explorer_m4_store\handoff.md` — Formal 5-component handoff report
- `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\explorer_m4_store\progress.md` — Liveness heartbeat
