# BRIEFING — 2026-10-08T17:23:45Z

## Mission
Investigate LiveKit SFrame E2EE and worker setup for the Spike (Fase 0): ExternalE2EEKeyProvider, worker resolution across Vite/Electron/Capacitor, key ratcheting/smooth updates, and strict isE2EESupported pre-call check.

## 🔒 My Identity
- Archetype: explorer
- Roles: investigation, synthesis
- Working directory: C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\explorer_m1_2\
- Original parent: 87417a56-1d32-4426-9e81-5b3c6e3bf3f7
- Milestone: M1 (R1 Spike Criptográfico e LiveKit - Go/No-Go)

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- Never git push automatically
- Comply with all global rules: POST/CSRF, APK optimization, WASAPI fallback resilience
- Target files for metadata only: .agents/teamwork/explorer_m1_2/

## Current Parent
- Conversation ID: 87417a56-1d32-4426-9e81-5b3c6e3bf3f7
- Updated: not yet

## Investigation State
- **Explored paths**:
  - `client/node_modules/livekit-client/package.json` and `dist/` (v2.22.1)
  - `client/node_modules/livekit-client/src/e2ee/` (`E2eeManager.ts`, `KeyProvider.ts`, `ParticipantKeyHandler.ts`, `FrameCryptor.ts`, `utils.ts`)
  - `client/src/lib/livekit.ts`, `client/src/stores/voiceStore.ts`, `client/src/stores/callStore.ts`
  - `client/vite.config.ts`, `client/tsconfig.json`, `client/src/vite-env.d.ts`
  - `client/electron/main.ts`, `client/capacitor.config.ts`
  - `backend/cmd/server/main.go`
- **Key findings**:
  - Direct bare specifier `new Worker(new URL('livekit-client/e2ee-worker', import.meta.url))` fails in Rollup/Vite.
  - Creating a wrapper `client/src/workers/e2ee.worker.ts` with `import 'livekit-client/e2ee-worker'` and importing via `?worker` or relative `new URL(...)` bundles perfectly into `dist/assets/worker-[hash].js` in Vite 5 for Web, Electron 30, and Capacitor Android.
  - LiveKit SFrame appends 2-byte trailer `[IV_LENGTH, keyIndex]` to each frame. Keys are stored in `cryptoKeyRing` (16-slot ring buffer), allowing seamless key rotation without audio glitches or renegotiation.
  - Pre-call check `isE2EESupported()` tests `createEncodedStreams` / `RTCRtpScriptTransform` (Chrome >= 86) and must block connection with upgrade modal on unsupported clients, strictly forbidding unencrypted fallback.
- **Unexplored areas**: None. Spike investigation complete.

## Key Decisions Made
- Confirmed implementation recipe for LiveKit SFrame worker and `ExternalE2EEKeyProvider`.
- Confirmed zero-glitch rotation mechanism and wire protocol details.
- Completed full 5-component handoff report.

## Artifact Index
- DISPATCH.md — Dispatch instructions
- BRIEFING.md — Working memory
- progress.md — Liveness heartbeat
- handoff.md — Final investigation report
