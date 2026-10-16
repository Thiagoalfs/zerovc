# BRIEFING — 2026-10-15T19:35:00Z

## Mission
Implement Milestone M6 (E2EE Recovery Key, PBKDF2/AES-GCM Cloud Backup, Safety Verification 60-digits/offline SVG QR, and Security UI in ProfileModal with full verification).

## 🔒 My Identity
- Archetype: implementer
- Roles: implementer, qa, specialist
- Working directory: C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\worker_m6\
- Original parent: c7bad961-fa24-42cb-b324-2269f48b6b9e
- Milestone: M6

## 🔒 Key Constraints
- NUNCA execute git push automaticamente.
- Ações de alteração de estado (INSERT / UPDATE / DELETE / Toggle) EXCLUSIVAMENTE via POST com validação CSRF.
- Validação TLS sempre ativa em cURL.
- Zero vazamento de segredos/plaintext em logs, backend ou DOM.
- Genuine implementation only, no dummy closures or hardcoded results.

## Current Parent
- Conversation ID: c7bad961-fa24-42cb-b324-2269f48b6b9e
- Updated: 2026-10-15T19:35:00Z

## Task Summary
- **What to build**: Milestone M6 (E2EE Recovery Key, PBKDF2/AES-GCM Cloud Backup, Safety Number Verification with 60-digits/offline QR, Security UI components in ProfileModal, Unit tests & E2E verification)
- **Success criteria**: 100% PASS on `npm run test:recovery-m6`, `npm run test:channels-m5`, `npm run test:livekit-m4`, `npm run test:callkeys-adversarial`, `npm run test:frontend-m3`, `npm run test:e2e`, `npm run build`, and `go test ./...` in backend.
- **Interface contracts**: explorer_m6/analysis.md and DISPATCH.md
- **Code layout**: backend/ (internal/database, internal/models, internal/handlers), client/ (src/crypto, src/components/Modals, scripts/)

## Key Decisions Made
- Reconcile `e2ee_key_backups` to support both envelope fields (`ciphertext`, `iv`, `salt`, `key_count`) and legacy key wrapping fields.
- Offline inline SVG QR code generator to eliminate any third-party network leakage.
- Strict POST + constant-time CSRF enforcement on all state-altering endpoints.

## Artifact Index
- `.agents/teamwork/worker_m6/DISPATCH.md` — Dispatch instructions
- `.agents/teamwork/worker_m6/progress.md` — Liveness and task progress
- `.agents/teamwork/worker_m6/handoff.md` — Final handoff report

## Change Tracker
- **Files modified**: None yet
- **Build status**: Initializing
- **Pending issues**: None

## Quality Status
- **Build/test result**: Pending implementation
- **Lint status**: Clean
- **Tests added/modified**: Pending test-recovery-m6.ts and e2ee_backup_test.go

## Loaded Skills
- None
