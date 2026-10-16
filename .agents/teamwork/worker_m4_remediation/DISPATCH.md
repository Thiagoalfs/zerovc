# DISPATCH — Worker M4 Remediation (LiveKit Voice/Video E2EE Calls Completion)

## Mission & Scope
Complete and certify the LiveKit Voice/Video E2EE call implementation for Milestone M4 (Chamadas de Voz/Vídeo E2EE LiveKit - Fase 3):

1. `client/src/stores/voiceStore.ts`:
   - In `connectLiveKitRoom`:
     * Wire up `onParticipantConnected` to invoke `callKeyManager.handleParticipantJoined(participant.identity)`.
     * Wire up `onParticipantDisconnected` to invoke `callKeyManager.handleParticipantLeft(participant.identity)`.
     * Ensure on call disconnect / `leaveVoice`: invoke `callKeyManager.endCall()`.
2. Backend Token Handlers:
   - In `backend/internal/handlers/channel_handlers.go`, `dm_handlers.go`, `dm_group_handlers.go`:
     * Ensure voice join/accept endpoints query `e2ee_enabled` for the room/channel and return `e2ee_enabled: bool` in the JSON response.
     * When `e2ee_enabled == true`, ensure LiveKit join token participant metadata contains `{"e2ee_required": true, "user_id": userID.String()}`.
3. Automated Test Suite (`client/scripts/test-livekit-m4.ts`):
   - Author a comprehensive, authentic test suite covering all 6 core areas:
     * Area 1: Call key state machine transitions (`NO_KEY` -> `GENERATING` -> `DISTRIBUTING` -> `ACTIVE` -> `ROTATING` -> `ACTIVE`).
     * Area 2: Deterministic distributor election (`electDistributor` canonical $\min_{\text{lex}}(\text{device\_id})$ across participants).
     * Area 3: Olm to-device key exchange formatting (`msg_type: 'call_key'`, 256-bit base64 key, key_index, epoch).
     * Area 4: Backward and Forward Secrecy ratchet rotations (participant join re-keying and participant leave re-keying with debounce).
     * Area 5: Anti-fallback gate enforcement (`checkCallEligibility({ isE2EERoom: true })` strictly blocking unencrypted fallback and emitting upgrade modal).
     * Area 6: Ephemeral key lifecycle and zeroization (`zeroKey` overwriting memory, `endCall()` wiping active key and state).
   - Add script to `client/package.json`: `"test:livekit-m4": "tsx scripts/test-livekit-m4.ts"`.
4. Verification:
   - Run `npm run test:livekit-m4` in `client/`.
   - Run `npm run test:livekit-gate` in `client/`.
   - Run `npm run test:e2ee-spike` in `client/`.
   - Run `npm run build` in `client/`.
   - In `backend/`, run `go test ./...` and `go build ./...`.
   - All tests and builds MUST pass 100% cleanly.

## Mandatory References
1. `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\ORIGINAL_REQUEST.md` (READ FIRST)
2. `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\explorer_m4\analysis.md`
3. `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\explorer_m4\handoff.md`
4. `c:\Users\Aluno CtrlPlay 4\Downloads\e2ee_implementation_plan_revision6.md` (§13, §14 Fase 3)
5. `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\orchestrator\PROJECT.md`

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Global Rules
- NUNCA execute git push automaticamente.
- Ações de alteração de estado EXCLUSIVAMENTE POST com validação CSRF (tempo constante hash_equals).
- NUNCA desative TLS em cURL.
- Zero segredos ou plaintext em logs, backend ou DOM.
- Escreva `progress.md` e `handoff.md` em seu diretório de trabalho.


## 2026-10-15T16:57:18Z
Message received from parent orchestrator:
- Role: M4 Remediation Worker
- Project root: C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc
- Working directory: C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\worker_m4_remediation\
- Instructions: Complete and certify LiveKit Voice/Video E2EE call implementation (voiceStore.ts wiring, backend token handlers e2ee metadata, test-livekit-m4.ts test suite, package.json script, verification and handoff).
