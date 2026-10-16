# DISPATCH — Worker M1 (Spike Criptográfico e LiveKit Implementation)

## Milestone: M1 (R1 Spike Criptográfico e LiveKit - Go/No-Go)
Working Directory: `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\worker_m1\`
Project Root: `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc`
Original Request: `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\ORIGINAL_REQUEST.md`
Specification: `c:\Users\Aluno CtrlPlay 4\Downloads\e2ee_implementation_plan_revision6.md`
Project Master Plan: `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\orchestrator\PROJECT.md`

## Input Reports to Read
- `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\explorer_m1_1\handoff.md`
- `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\explorer_m1_2\handoff.md`
- `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\explorer_m1_3\handoff.md`

## Write Ownership
You exclusively own and may modify:
- `client/package.json`
- `client/src/crypto/vodozemac/index.ts`
- `client/src/crypto/keyStore.ts`
- `client/src/crypto/identity.ts`
- `client/src/crypto/olmSession.ts`
- `client/src/crypto/megolmSession.ts`
- `client/src/crypto/safeLogger.ts`
- `client/src/workers/e2ee.worker.ts`
- `client/src/lib/livekitE2EE.ts`
- `client/scripts/test-e2ee-spike.ts`

## Implementation Tasks
1. Add dependencies `@kinsh/vodozemac-wasm` and `tsx` (for the test runner) to `client/package.json` and install via `npm install`.
2. Implement cryptographic core in `client/src/crypto/` per Explorer M1.1 blueprints:
   - `vodozemac/index.ts`: WASM loader and primitive exports.
   - `keyStore.ts`: IndexedDB persistence with non-extractable WebCrypto AES-GCM-256 `CryptoKey`.
   - `identity.ts`: Olm Account lifecycle, Ed25519 identity, Curve25519 OTK generation and signing.
   - `olmSession.ts`: 1:1 Olm sessions (PreKey and Normal envelopes).
   - `megolmSession.ts`: Megolm group ratchets, session export/import, anti-replay validation.
   - `safeLogger.ts`: Sanitized logger with zero plaintext or secret leakage.
3. Implement LiveKit E2EE wrapper in `client/src/workers/e2ee.worker.ts` and `client/src/lib/livekitE2EE.ts` per Explorer M1.2 blueprints:
   - Worker wrapper importing `livekit-client/e2ee-worker`.
   - LiveKit E2EE helper with `ExternalE2EEKeyProvider`, `isE2EESupported()` gate, and anti-fallback protection.
4. Implement automated verification harness `client/scripts/test-e2ee-spike.ts` per Explorer M1.3 blueprints and add script `"test:e2ee-spike": "tsx scripts/test-e2ee-spike.ts"` to `client/package.json`.
5. Run build and tests:
   - `cd client && npm run test:e2ee-spike`
   - `cd client && npx tsc --noEmit`
   - `cd client && npm run build`
6. Write full handoff report to `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\worker_m1\handoff.md`.

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.


## 2026-10-08T17:24:23Z
[Message] timestamp=2026-10-08T17:24:23Z sender=87417a56-1d32-4426-9e81-5b3c6e3bf3f7 priority=MESSAGE_PRIORITY_HIGH content=You are Worker M1 (Spike Criptográfico e LiveKit Implementation).
Working Directory: C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\worker_m1\
Project Root: C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc
Original Request: C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\ORIGINAL_REQUEST.md
Specification: c:\Users\Aluno CtrlPlay 4\Downloads\e2ee_implementation_plan_revision6.md
Master Plan: C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\orchestrator\PROJECT.md

Read your full assignment in:
C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\worker_m1\DISPATCH.md

And review the 3 input Explorer reports:
- C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\explorer_m1_1\handoff.md
- C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\explorer_m1_2\handoff.md
- C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\explorer_m1_3\handoff.md

Write ownership:
You exclusively own:
- client/package.json
- client/src/crypto/vodozemac/index.ts
- client/src/crypto/keyStore.ts
- client/src/crypto/identity.ts
- client/src/crypto/olmSession.ts
- client/src/crypto/megolmSession.ts
- client/src/crypto/safeLogger.ts
- client/src/workers/e2ee.worker.ts
- client/src/lib/livekitE2EE.ts
- client/scripts/test-e2ee-spike.ts

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Tasks:
1. Install `@kinsh/vodozemac-wasm` and `tsx` in `client/package.json` (`npm install`).
2. Implement cryptographic core in `client/src/crypto/` (`vodozemac/index.ts`, `keyStore.ts`, `identity.ts`, `olmSession.ts`, `megolmSession.ts`, `safeLogger.ts`).
3. Implement LiveKit worker wrapper `client/src/workers/e2ee.worker.ts` and `client/src/lib/livekitE2EE.ts`.
4. Implement automated spike test suite in `client/scripts/test-e2ee-spike.ts` and add script `"test:e2ee-spike": "tsx scripts/test-e2ee-spike.ts"` to `client/package.json`.
5. Run tests:
   - `cd client && npm run test:e2ee-spike`
   - `cd client && npx tsc --noEmit`
   - `cd client && npm run build`
6. Maintain progress.md in your working directory with 'Last visited: [timestamp]'.
7. When finished, write your report to C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\worker_m1\handoff.md and notify me via send_message.
