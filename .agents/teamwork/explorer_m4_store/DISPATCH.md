# DISPATCH — Explorer M4 Store (VoiceStore & LiveKit Integration Hardening)

## Mission
Analyze and formulate the exact code design to resolve store integration and lifecycle issues in `client/src/stores/voiceStore.ts`.

## Feedback & Findings from Gate 4 Iteration 1:
1. `DEVICE_ID_EXTRACTION`:
   `voiceStore.ts` currently passes `participant.identity` (User ID UUID) into `callKeyManager.handleParticipantJoined`. `CallKeyManager` expects device IDs so that:
   - $\min_{\text{lex}}(\text{device\_id})$ distributor election runs on device IDs consistently.
   - `broadcastCallKeyToParticipants` sends `recipient_device_id` that satisfies PostgreSQL `FOREIGN KEY (recipient_device_id) REFERENCES e2ee_devices(id)`.
   Design how `participant.metadata` should be parsed in `voiceStore.ts` (e.g. `const meta = JSON.parse(participant.metadata || '{}'); const deviceId = meta.device_id || participant.identity;`).
2. `PRE_EXISTING_PARTICIPANTS`:
   When connecting to a room, `RoomEvent.ParticipantConnected` does not fire for users already in the call.
   In `connectLiveKitRoom`, populate pre-existing participants from `room.remoteParticipants` into `CallKeyManager.startCall(callId, myDeviceId, existingDeviceIds)`.
3. `RESOURCE_CLEANUP`:
   Ensure `livekitE2EEManager.cleanup()` is invoked on call disconnect so WebRTC worker threads do not leak.
4. `PACKAGE_JSON_CONSISTENCY`:
   Check `client/package.json` `"test:frontend-m3"` command flags (`-r ./scripts/test-setup-worker.ts`).

## References
1. `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\ORIGINAL_REQUEST.md` (READ FIRST)
2. `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\reviewer_m4_1\handoff.md`
3. `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\reviewer_m4_2\handoff.md`
4. `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\client\src\stores\voiceStore.ts`
5. `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\client\src\lib\livekitE2EE.ts`

## Your Task
- Inspect `voiceStore.ts` and `livekitE2EE.ts`.
- Formulate the exact integration changes.
- Write `analysis.md` and `handoff.md`.
- Report back via `send_message`.

## 2026-10-15T17:29:29Z
You are explorer_m4_store (Role: M4 Store Integration Explorer).
Working directory: C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\explorer_m4_store\
Project root: C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc
Parent Orchestrator Conversation ID: c7bad961-fa24-42cb-b324-2269f48b6b9e

Read C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\explorer_m4_store\DISPATCH.md.
Also read C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\ORIGINAL_REQUEST.md.
Also read C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\reviewer_m4_1\handoff.md.

Formulate the exact technical blueprint for `client/src/stores/voiceStore.ts` (device_id extraction from participant metadata, pre-existing participants sync on connect, resource cleanup, and package.json script flags).
Write analysis.md and handoff.md in your working directory.
Report back via send_message.
