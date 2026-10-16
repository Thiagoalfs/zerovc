# DISPATCH — Explorer M4 (Milestone M4: LiveKit Voice/Video E2EE Calls - Fase 3)

## Objective
Map and design all frontend and backend components for Milestone M4 (Chamadas de Voz/Vídeo E2EE LiveKit - Fase 3):
1. LiveKit SFrame & Worker Integration:
   - Check `client/src/lib/livekit.ts`, `livekitE2EE.ts`, `client/src/crypto/callKeys.ts`.
   - Inspect `livekit-client` E2EE initialization: `ExternalE2EEKeyProvider`, worker url, key index, ratchet.
2. Call Key State Machine & Deterministic Distributor:
   - State machine: `NO_KEY` -> `GENERATING` -> `DISTRIBUTING` -> `ACTIVE` -> `ROTATING`.
   - Deterministic distributor: participant device with minimum lexical `device_id` in call roster generates the 256-bit symmetric call key.
   - Key distribution: Olm 1:1 to-device message (`POST /api/e2ee/to-device`, `msg_type: 'call_key'`) to all active participant devices in the call.
3. Rotation on Join/Leave:
   - On new participant join: key rotation ensuring backward secrecy.
   - On participant leave: key rotation ensuring forward secrecy.
4. Anti-Fallback & Compatibility Gate:
   - Enforce `isE2EESupported()` check. If false (e.g. legacy browser, Android WebView < 86 without insertable streams): strictly block call connection and show upgrade notice. Never allow unencrypted WebRTC fallback.
5. Testing Plan:
   - Author automated test suite (e.g. `client/scripts/test-livekit-m4.ts` or extending existing LiveKit tests) verifying state transitions, deterministic distributor election, Olm distribution, join/leave rotation, and anti-fallback gate rejection.

## Reference Paths
- `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\ORIGINAL_REQUEST.md` (READ FIRST)
- `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\orchestrator\PROJECT.md`
- `c:\Users\Aluno CtrlPlay 4\Downloads\e2ee_implementation_plan_revision6.md` (§13, §14 Fase 3)

## Output
Write your detailed report to:
`C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\explorer_m4\analysis.md`
and self-contained handoff to:
`C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\explorer_m4\handoff.md`.
Notify orchestrator via send_message.


## 2026-10-10T12:54:02Z
From: orchestrator_gen2 (e52a8903-b2c2-47c9-abdc-a9d7e7091fdf)
You are explorer_m4 (Role: M4 LiveKit Explorer).
Your working directory is: C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\explorer_m4\
Your parent is orchestrator_gen2.
Task: Map and design all components for Milestone M4 (Chamadas de Voz/Vídeo E2EE LiveKit - Fase 3).
