# DISPATCH — Explorer M1.2 (LiveKit SFrame & Worker Spike)

## Milestone: M1 (R1 Spike Criptográfico e LiveKit - Go/No-Go)
Working Directory: `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\explorer_m1_2\`
Project Root: `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc`
Original Request: `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\ORIGINAL_REQUEST.md`
Specification: `c:\Users\Aluno CtrlPlay 4\Downloads\e2ee_implementation_plan_revision6.md`
Project Master Plan: `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\orchestrator\PROJECT.md`

## Mission
Investigate LiveKit SFrame E2EE and worker setup for the Spike (Fase 0):
1. How to initialize and configure `ExternalE2EEKeyProvider` and worker in `client/src/lib/livekit.ts` using the bundled `livekit-client/e2ee-worker` (or path in `dist/`).
2. Verify worker resolution across Vite dev server and `vite build` production output for both Electron and Android Capacitor environments.
3. Detail how `setKey(key)` sets the active call encryption key, how key ratcheting works, and how key changes trigger in the worker without audio glitches.
4. Detail the pre-call check with `isE2EESupported()`: ensure it blocks connection and shows an upgrade alert when false on an E2EE-flagged call, strictly forbidding unencrypted fallback.
5. Write your report to `.agents/teamwork/explorer_m1_2/handoff.md`.


## 2026-10-08T17:10:48Z
You are Explorer M1.2 (LiveKit SFrame & Worker Spike).
Working Directory: C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\explorer_m1_2\
Project Root: C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc
Original Request: C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\ORIGINAL_REQUEST.md
Specification: c:\Users\Aluno CtrlPlay 4\Downloads\e2ee_implementation_plan_revision6.md
Master Plan: C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\orchestrator\PROJECT.md

Follow instructions in C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\explorer_m1_2\DISPATCH.md.
Investigate LiveKit SFrame E2EE and worker setup for the Spike (Fase 0):
1. How to initialize and configure `ExternalE2EEKeyProvider` and worker in `client/src/lib/livekit.ts` using the bundled `livekit-client/e2ee-worker` (or path in `dist/`).
2. Verify worker resolution across Vite dev server and `vite build` production output for both Electron and Android Capacitor environments.
3. Detail how `setKey(key)` sets the active call encryption key, how key ratcheting works, and how key changes trigger in the worker without audio glitches.
4. Detail the pre-call check with `isE2EESupported()`: ensure it blocks connection and shows an upgrade alert when false on an E2EE-flagged call, strictly forbidding unencrypted fallback.

Maintain progress.md with 'Last visited: [timestamp]'. Write handoff to C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\explorer_m1_2\handoff.md and notify me via send_message with a concise summary.
