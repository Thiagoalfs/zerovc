# DISPATCH — Worker M4 (Milestone M4: LiveKit Voice/Video E2EE Calls Implementation)

## Mission & Scope
Implement full LiveKit Voice/Video E2EE call encryption for Milestone M4 (Chamadas de Voz/Vídeo E2EE LiveKit - Fase 3):
1. `client/src/crypto/callKeys.ts`:
   - Implement `CallKeyManager`:
     * State machine: `NO_KEY` -> `GENERATING` -> `DISTRIBUTING` -> `ACTIVE` -> `ROTATING` (and `REQUESTING`).
     * Deterministic distributor election: `electDistributor` selecting participant device with $\min_{\text{lex}}(\text{device\_id})$.
     * 256-bit symmetric call key generation via `crypto.getRandomValues(new Uint8Array(32))`.
     * Olm to-device key exchange: dispatch `POST /api/e2ee/to-device` with `msg_type: 'call_key'`.
     * Ratchet rotation on participant join (backward secrecy) and leave (forward secrecy), with a 150-250ms debounce.
     * Ephemeral key lifecycle: keys discarded and zeroed upon call disconnect.
2. `client/src/lib/livekit.ts` & `client/src/lib/livekitE2EE.ts`:
   - Integrate `ExternalE2EEKeyProvider` and worker URL in `new Room({ e2ee: e2eeOptions })`.
   - Call `room.setE2EEEnabled(true)` when room is E2EE.
   - Synchronize keys between `CallKeyManager` and `ExternalE2EEKeyProvider.setKey`.
3. `client/src/stores/voiceStore.ts` & `callStore.ts`:
   - Enforce anti-fallback gate `checkCallEligibility({ isE2EERoom: true })`: if `isCallE2EESupported()` is false (e.g. Android WebView < 86 or legacy browser), strictly block call connection and show upgrade modal. NEVER allow fallback to unencrypted WebRTC!
4. `client/src/App.tsx`:
   - Handle incoming WebSocket `E2EE_TO_DEVICE` messages with `msg_type === 'call_key'` and forward to `callKeyManager.handleIncomingCallKey()`.
5. Backend Token Handlers:
   - In `backend/internal/handlers/dm_handlers.go`, `dm_group_handlers.go`, `channel_handlers.go`:
     Ensure LiveKit join token endpoints return `e2ee_enabled: bool` and include device metadata in participant token.
6. Automated Test Suite (`client/scripts/test-livekit-m4.ts`):
   - Author comprehensive automated tests covering:
     * Call key state machine transitions.
     * Deterministic distributor election ($\min_{\text{lex}}(\text{device\_id})$).
     * To-device key distribution format (`msg_type: 'call_key'`).
     * Join/Leave ratchet rotation (backward/forward secrecy).
     * Anti-fallback gate rejection when unsupported.
     * Ephemeral key discard on disconnect.
   - Add script to `client/package.json`: `"test:livekit-m4": "tsx scripts/test-livekit-m4.ts"`.
7. Verification:
   - Run `npm run test:livekit-m4` in `client/`.
   - Run `npm run test:livekit-gate` and `npm run test:e2ee-spike` in `client/`.
   - Run `npm run build` in `client/`.
   - Run `go test ./internal/...` and `go build ./...` in `backend/`.
   - All tests must pass 100%.

## Mandatory References
1. `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\ORIGINAL_REQUEST.md` (READ FIRST)
2. `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\explorer_m4\analysis.md` (Blueprint)
3. `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\explorer_m4\handoff.md`
4. `c:\Users\Aluno CtrlPlay 4\Downloads\e2ee_implementation_plan_revision6.md` (§13, §14 Fase 3)
5. `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\orchestrator\PROJECT.md`

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Global Rules
- NUNCA execute git push automaticamente.
- Ações de alteração de estado EXCLUSIVAMENTE POST com validação CSRF.
- Zero segredos ou plaintext em logs ou DOM.
- Manter compilação limpa de TypeScript e Go.


## 2026-10-10T13:03:46Z
From: orchestrator_gen2 (e52a8903-b2c2-47c9-abdc-a9d7e7091fdf)
Role: worker_m4 (Role: M4 LiveKit Worker)
Tasks:
1. Call Key State Machine & Manager (client/src/crypto/callKeys.ts)
2. LiveKit SFrame & Provider Integration (client/src/lib/livekit.ts, client/src/lib/livekitE2EE.ts)
3. Anti-Fallback Compatibility Gate (client/src/stores/voiceStore.ts, callStore.ts)
4. Real-time WebSocket Key Delivery (client/src/App.tsx)
5. Backend Token Handlers (backend/internal/handlers/dm_handlers.go, dm_group_handlers.go, channel_handlers.go)
6. Automated Test Suite (client/scripts/test-livekit-m4.ts)
7. Verification & Handoff
