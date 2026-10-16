# BRIEFING — 2026-10-10T13:05:00Z

## Mission
Implement full LiveKit Voice/Video E2EE call encryption for Milestone M4 (Chamadas de Voz/Vídeo E2EE LiveKit - Fase 3).

## 🔒 My Identity
- Archetype: worker_m4
- Roles: implementer, qa, specialist
- Working directory: C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\worker_m4\
- Original parent: e52a8903-b2c2-47c9-abdc-a9d7e7091fdf
- Milestone: M4 LiveKit Voice/Video E2EE Calls

## 🔒 Key Constraints
- NUNCA execute git push automaticamente.
- Ações de alteração de estado EXCLUSIVAMENTE POST com validação CSRF.
- Zero segredos ou plaintext em logs ou DOM.
- Manter compilação limpa de TypeScript (npm run build) e Go (go build ./...).
- DO NOT CHEAT: All implementations must be genuine; no fake tests or dummy logic.

## Current Parent
- Conversation ID: e52a8903-b2c2-47c9-abdc-a9d7e7091fdf
- Updated: 2026-10-10T13:05:00Z

## Task Summary
- **What to build**: Full LiveKit E2EE Call Encryption: CallKeyManager state machine & manager, LiveKit SFrame & ExternalE2EEKeyProvider integration, anti-fallback compatibility gate, real-time WebSocket key delivery, backend token handlers with e2ee metadata, and comprehensive test suite.
- **Success criteria**: All tests pass (test:livekit-m4, test:livekit-gate, test:e2ee-spike, go test ./internal/...), clean build (npm run build, go build ./...).
- **Interface contracts**: e2ee_implementation_plan_revision6.md (§13, §14 Fase 3), ORIGINAL_REQUEST.md (R4).
- **Code layout**: client/src/crypto/callKeys.ts, client/src/lib/livekit.ts, client/src/lib/livekitE2EE.ts, client/src/stores/voiceStore.ts, client/src/stores/callStore.ts, client/src/App.tsx, backend/internal/handlers/, client/scripts/test-livekit-m4.ts.

## Key Decisions Made
- Deterministic distributor election via min(device_id) lexicographically.
- 256-bit symmetric call key generation using crypto.getRandomValues.
- Ephemeral key lifecycle: keys zeroed on call disconnect.
- Debounced ratchet rotation on participant join/leave (150-250ms).
- Strict anti-fallback gate blocking call connection when E2EE is not supported in an E2EE room.

## Artifact Index
- DISPATCH.md — Assignment instructions
- progress.md — Liveness & progress tracking
- handoff.md — Final hard handoff report

## Change Tracker
- **Files modified**: None yet
- **Build status**: Pending
- **Pending issues**: None

## Quality Status
- **Build/test result**: Not run yet
- **Lint status**: 0 violations
- **Tests added/modified**: client/scripts/test-livekit-m4.ts (pending creation)

## Loaded Skills
- None specified
