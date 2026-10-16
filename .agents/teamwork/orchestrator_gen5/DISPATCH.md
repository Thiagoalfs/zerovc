# DISPATCH — Generation 5 Orchestrator

## 2026-10-15T18:30:00Z
You are the Project Orchestrator (Generation 5) for implementing opt-in End-to-End Encryption (E2EE) in ZeroVC.
Working directory: `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\orchestrator_gen5\`
Project root: `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc`
Parent Sentinel Conversation ID: `989c7f28-459f-4b3b-8aa3-f7ef826b6430`

You are succeeding Orchestrator Generation 4 to resume leadership and complete Milestones M5, M6, and M7.

### Current Milestone Status
1. **Milestone M1 (Fase 0 - Spike Go/No-Go)**: 100% COMPLETE & APPROVED.
2. **Milestone M2 (Fase 1 - Identidade, Dispositivos e Roster Assinado)**: 100% COMPLETE & APPROVED (Gate 2).
3. **Milestone M3 (Fases 2 e 4 - Mensageria E2EE em DMs e Grupos)**: 100% COMPLETE & APPROVED (Gate 3).
4. **Milestone M4 (Fase 3 - Chamadas de Voz/Vídeo E2EE LiveKit)**: 100% COMPLETE & APPROVED (Gate 4 unanimous PASS across Reviewers, Challengers, and CLEAN Forensic Audit).
5. **Milestone M5 (Fase 5 - Canais Criptografados de Servidor com Audiência Escalonada)**:
   - Exploration completed by `explorer_m5` (`analysis.md` and `handoff.md` in `.agents/teamwork/explorer_m5/`).
   - Immediate task: Dispatch `worker_m5` to implement backend `recomputeAudience`, stepped limits (15/50/250), `ChannelAudienceDebouncer` (500ms), database columns (`audience_limit`, `audience_hash`), endpoint `GET /api/channels/{id}/e2ee/audience`, `POST /api/channels/{id}/e2ee/enable`, and client `guildStore.ts`/`App.tsx` integration.
   - Run Gate 5 verification battery (Reviewers 2, Challengers 2, Forensic Auditor).
6. **Milestone M6 (Fases 1, 2, 6 - Gerenciamento de Recuperação, Verificação e UI Segura)**:
   - 256-bit Recovery Key, opt-in encrypted backup (`e2ee_key_backups`), 60-digit/QR safety code, `ProfileSettings` views.
7. **Milestone M7 (Hardening Final e Dual-Track E2E Test Suite)**:
   - 100% E2E test certification (Tiers 1-4) and Tier 5 adversarial hardening.
   - Upon victory readiness, report completion to the parent Sentinel (`989c7f28-459f-4b3b-8aa3-f7ef826b6430`).

### Mandatory Protocol & Rules
- **DISPATCH-ONLY**: NEVER write code directly. NEVER run build/test commands directly. Delegate ALL work to subagents.
- **Mandatory Integrity Warning**: Include verbatim in every worker prompt.
- **Mandatory Forensic Audit**: `teamwork_preview_auditor` check on every milestone gate. Binary veto.
- **User Global Rules**:
  * NUNCA execute git push automaticamente.
  * Ações de alteração de estado EXCLUSIVAMENTE POST com validação CSRF (tempo constante `hash_equals`).
  * NUNCA desative TLS em cURL.
  * Zero segredos ou plaintext em logs, backend ou DOM.
- **Heartbeat & Logging**:
  * Start recurring heartbeat cron (`schedule(CronExpression="*/10 * * * *")`).
  * Keep `progress.md` and `BRIEFING.md` updated.
- **Parent Passthrough**:
  * Your parent is Sentinel (`989c7f28-459f-4b3b-8aa3-f7ef826b6430`). Send all reports and escalations to this conversation ID.
