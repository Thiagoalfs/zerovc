# Soft Handoff — Orchestrator Generation 4 to Generation 5

**Author**: Project Orchestrator (Generation 4)  
**Timestamp**: 2026-10-15T18:30:00Z  
**Parent Sentinel ID**: `989c7f28-459f-4b3b-8aa3-f7ef826b6430`  
**Working Directory**: `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\orchestrator_gen4\`  
**Successor Target Directory**: `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\orchestrator_gen5\`  

---

## 1. Observation (State of the Project)

### 1.1 Milestone Status
| Milestone | Name | Status | Verified Capabilities |
|---|---|:---:|---|
| **M1** | Spike Criptográfico e LiveKit (Fase 0) | **DONE** | 98/98 tests green, vodozemac WASM, WebCrypto non-extractable keys, SFrame worker. |
| **M2** | Identidade, Dispositivos e Roster Assinado (Fase 1) | **DONE** | Gate 2 passed, DB schema, signed roster, device management, X-Client-E2EE-Version (426 Upgrade Required). |
| **M3** | Mensageria E2EE em DMs e Grupos (Fases 2 e 4) | **DONE** | Gate 3 passed, 1:1 DMs, 15-member groups, pure messageCodec, unread badge decoupling, zero plaintext database storage, idempotency, encrypted attachments. |
| **M4** | Chamadas de Voz/Vídeo E2EE LiveKit (Fase 3) | **DONE** | Gate 4 passed (unanimous APPROVE and CLEAN Forensic Audit across 8 test suites). CallKeyManager state machine, canonical $\min_{\text{lex}}(\text{device\_id})$ election, backward/forward ratchet rotations, 4 protocol security guards, strict anti-fallback gate (`checkCallEligibility`), pre-existing roster sync on connect, authentic production tests in `backend/internal/handlers/e2ee_m4_test.go` and `client/scripts/test-livekit-m4.ts`. |
| **M5** | Canais Criptografados de Servidor e Audiência Escalonada (Fase 5) | **IN_PROGRESS** | `explorer_m5` completed comprehensive architecture mapping (`explorer_m5/analysis.md` and `explorer_m5/handoff.md`). Ready for worker implementation. |
| **M6** | Gerenciamento de Recuperação, Verificação e UI Segura (Fases 1, 2, 6) | **PLANNED** | 256-bit Recovery Key, opt-in encrypted backup (`e2ee_key_backups`), 60-digit/QR safety code, `ProfileSettings` views. |
| **M7** | Final Hardening & Dual-Track E2E Test Suite (Tiers 1-5) | **TEST_READY** | 181/181 E2E tests passing across Tiers 1-4; Tier 5 adversarial hardening ready. |

### 1.2 Key Project State Artifacts
- Master Plan: `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\orchestrator\PROJECT.md` (Updated: M1-M4 marked `DONE`).
- Gate Status: `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\orchestrator_gen4\GATE_STATUS.md` (Gate 4 PASS recorded).
- User Intent: `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\ORIGINAL_REQUEST.md`.
- Specification Reference: `c:\Users\Aluno CtrlPlay 4\Downloads\e2ee_implementation_plan_revision6.md` (§12, §14 Fase 5 for M5).
- M5 Investigation Blueprint: `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\explorer_m5\handoff.md` and `analysis.md`.

---

## 2. Logic Chain & Decisions Made

1. **Gate 4 Resolution**:
   - Iteration 1 failed due to Forensic Auditor Check 5 violation (self-certifying tests in `e2ee_m4_test.go`) and Reviewer/Challenger findings (4 protocol guards in `callKeys.ts`, device ID vs user ID differentiation, pre-existing roster sync, worker cleanup).
   - Iteration 2 fully hardened both backend and client, eliminating all dummy tests and passing all 21 adversarial stress tests and all 17 anti-fallback tests.
   - Forensic Auditor certified CLEAN with invalidation resistance proof. Gate 4 officially passed.
2. **Succession Trigger**:
   - Spawn count reached 16 / 16 upon `explorer_m5` dispatch and completion.
   - All 16 subagents have completed and delivered their handoffs.
   - Clean architectural transition point between Milestone M4 sign-off and Milestone M5 implementation.

---

## 3. Concrete Next Steps for Successor (Orchestrator Gen 5)

1. **Initialize State in Generation 5**:
   - Working directory: `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\orchestrator_gen5\`
   - Initialize `BRIEFING.md` and `progress.md`.
   - Start recurring heartbeat cron (`schedule(CronExpression="*/10 * * * *")`).
2. **Execute Milestone M5 (Fase 5 - Canais Criptografados de Servidor)**:
   - Read `explorer_m5/handoff.md` and `explorer_m5/analysis.md`.
   - Dispatch `worker_m5` (`teamwork_preview_worker`) with working directory `.agents/teamwork/worker_m5/` to implement:
     * Backend:
       - `RecomputeAudience(channelID uuid.UUID)` in `backend/internal/services/e2ee_service.go` or `backend/internal/handlers/permission_helpers.go` checking `PermViewChannel` and filtering active devices (`d.revoked_at IS NULL`).
       - Columns in database (or migrations if needed): `channels.audience_limit INT DEFAULT 15`, `channels.audience_hash TEXT`.
       - Endpoint `GET /api/channels/{id}/e2ee/audience` returning authorized devices and current audience hash, enforcing stepped limits (15 -> 50 -> 250).
       - Endpoint `POST /api/channels/{id}/e2ee/enable` with CSRF validation.
       - `ChannelAudienceDebouncer` (500ms coalescing window) triggering `recomputeAudience` and `rotation_epoch++` on member join/leave/kick/ban/role change/device revocation, broadcasting WebSocket event `E2EE_ROTATION_REQUIRED`.
       - Test suite: `backend/internal/handlers/e2ee_m5_test.go`.
     * Frontend:
       - Update `api.channels.sendMessage` with E2EE fields.
       - Implement `api.e2ee.getChannelAudience(channelId)` and `enableChannelE2EE(channelId)`.
       - Update `client/src/stores/guildStore.ts` to encrypt outgoing messages with Megolm session and decrypt incoming/fetched messages with `messageCodec.ts`.
       - Update `client/src/App.tsx` to handle `E2EE_ROTATION_REQUIRED` for channels (invalidating cached outbound Megolm sessions).
       - Test suite: `client/scripts/test-channels-m5.ts` registered in `package.json`.
     * Worker verification: run builds and tests (`npm run test:channels-m5`, Go tests, `npm run build`).
   - Run Gate 5 verification battery (Reviewers 2, Challengers 2, Forensic Auditor).
   - Mark M5 as DONE in `PROJECT.md` upon passing.
3. **Execute Milestone M6 (Fases 1, 2, 6 - Gerenciamento de Recuperação, Verificação e UI Segura)**:
   - 256-bit Recovery Key generation (`crypto/recovery.ts`), opt-in encrypted backup endpoints and client sync (`e2ee_key_backups`), 60-digit/QR safety code verification (`crypto/verification.ts`), and `ProfileSettings` views.
   - Gate 6 certification.
4. **Execute Milestone M7 (Final Hardening & Dual-Track E2E Test Suite)**:
   - Phase 1: Pass 100% of E2E Dual-Track Test Suite (Tiers 1-4).
   - Phase 2: Adversarial coverage hardening (Tier 5 challenger testing).
5. **Victory Reporting**:
   - Send final completion report to parent Sentinel (`989c7f28-459f-4b3b-8aa3-f7ef826b6430`).

---

## 4. Key Constraints & User Global Rules
- **DISPATCH-ONLY**: Orchestrators must NEVER write code directly. NEVER run build/test commands directly. Delegate ALL work to subagents.
- **Mandatory Integrity Warning**: Include verbatim in every worker prompt.
- **Mandatory Forensic Audit**: `teamwork_preview_auditor` check on every milestone gate. Binary veto.
- **User Global Rules**:
  * NUNCA execute git push automaticamente.
  * Ações de alteração de estado EXCLUSIVAMENTE POST com validação CSRF (tempo constante `hash_equals`).
  * NUNCA desative TLS em cURL.
  * Zero segredos ou plaintext em logs, backend ou DOM.
- **Parent Passthrough**: Always report and escalate to `989c7f28-459f-4b3b-8aa3-f7ef826b6430`.
