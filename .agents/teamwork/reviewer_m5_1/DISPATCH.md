# DISPATCH — Reviewer M5-1 (Milestone M5: Encrypted Server Channels & Scaled Audience)

## Mission & Scope
Conduct an independent code and quality review of Milestone M5:
1. Review implementation:
   - `backend/internal/handlers/e2ee_audience.go` (`RecomputeAudience`, `ChannelAudienceDebouncer`, endpoints `GET /api/channels/{id}/e2ee/audience` and `POST /api/channels/{id}/e2ee/enable`).
   - `backend/internal/models/models.go` & `backend/internal/models/e2ee.go`.
   - `backend/internal/handlers/e2ee_m5_test.go`.
   - `client/src/lib/api.ts` & `client/src/stores/guildStore.ts`.
   - `client/src/App.tsx` (`handleE2EERotationRequired` channel handling).
   - `client/scripts/test-channels-m5.ts`.
2. Functional & Security checks:
   - Permission calculation: verifies `PermViewChannel` (1 << 14), guild owner and admin bypass, channel role overwrites, and guild bans.
   - Stepped limits: verify 15-member cap, step to 50, and 250 experimental limit enforcement.
   - Debounce mechanism: 500ms coalescing window preventing epoch churning.
   - Lazy rotation: verify epoch increment and session invalidation on audience change.
   - User Global Rules: NO git push, POST with CSRF for state mutations, constant-time `hash_equals`, TLS enabled, zero plaintext/keys in logs or DOM.
3. Verification commands:
   - `npm run test:channels-m5 --prefix client`
   - `npm run test:livekit-m4 --prefix client`
   - `npm run test:callkeys-adversarial --prefix client`
   - `npm run test:frontend-m3 --prefix client`
   - `npm run build --prefix client`
   - `cd backend && go test -count=1 -v ./internal/handlers -run "TestE2EE" && go build ./...`
4. Deliverable:
   - Write `handoff.md` with explicit Verdict (`APPROVE` or `REQUEST_CHANGES`).
   - Report back to parent orchestrator via `send_message`.

## Mandatory References
1. `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\ORIGINAL_REQUEST.md` (READ FIRST)
2. `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\worker_m5\handoff.md`
3. `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\explorer_m5\handoff.md`


## 2026-10-15T19:07:27Z
You are reviewer_m5_1 (Role: M5 Code Reviewer 1).
Working directory: C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\reviewer_m5_1\
Project root: C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc
Parent Orchestrator Conversation ID: c7bad961-fa24-42cb-b324-2269f48b6b9e

Read C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\reviewer_m5_1\DISPATCH.md.
Also read C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\ORIGINAL_REQUEST.md.
Also read C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\worker_m5\handoff.md.

Perform comprehensive code and quality review of Milestone M5.
Run verification commands:
- npm run test:channels-m5 --prefix client
- npm run test:livekit-m4 --prefix client
- npm run test:callkeys-adversarial --prefix client
- npm run test:frontend-m3 --prefix client
- npm run build --prefix client
- cd backend && go test -count=1 -v ./internal/handlers -run "TestE2EE" && go build ./...

Write handoff.md in your working directory with explicit Verdict: APPROVE or REQUEST_CHANGES.
Report back via send_message.
