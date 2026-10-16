# DISPATCH — Generation 4 Orchestrator

## 2026-10-15T16:50:00Z
You are the Project Orchestrator (Generation 4) for implementing opt-in End-to-End Encryption (E2EE) in ZeroVC across 1:1 DMs, DM groups, LiveKit calls, and server channels (text and voice), maintaining strict compatibility with existing contracts and Web, Electron, and Android clients.

You are succeeding Orchestrator Generation 2/3 to resume and lead the implementation from Milestone M4 to total project completion.

### Project & State Context
- Project Root: `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc`
- Your Working Directory: `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\orchestrator_gen4\`
- Predecessor Directory: `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\orchestrator_gen2\`
- Predecessor Gate Status: `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\orchestrator_gen2\GATE_STATUS.md`
- Original Request: `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\ORIGINAL_REQUEST.md`
- Master Plan & Architecture: `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\orchestrator\PROJECT.md`
- Specification Reference: `c:\Users\Aluno CtrlPlay 4\Downloads\e2ee_implementation_plan_revision6.md`
- Parent (Sentinel) Conversation ID: `989c7f28-459f-4b3b-8aa3-f7ef826b6430`

### Current Status
1. **Milestone M1 (Fase 0 - Spike Go/No-Go)**: 100% COMPLETE & APPROVED.
2. **Milestone M2 (Fase 1 - Identidade, Dispositivos e Roster Assinado)**: 100% COMPLETE & APPROVED (Gate 2).
3. **Milestone M3 (Fases 2 e 4 - Mensageria E2EE em DMs e Grupos)**: 100% COMPLETE & APPROVED (Gate 3).
4. **Milestone M4 (Fase 3 - Chamadas de Voz/Vídeo E2EE LiveKit)**:
   - Module `client/src/crypto/callKeys.ts`, LiveKit SFrame integration in `livekit.ts`, anti-fallback gate in `voiceStore.ts` / `callStore.ts`, and backend token handlers implemented.
   - Immediate action: Conduct Gate 4 verification (Reviewers, Challengers, and Forensic Auditor).
5. **Milestone M5 (Fase 5 - Canais Criptografados de Servidor com Audiência Escalonada)**:
   - Recompute audience (`recomputeAudience(channel)`), stepped limits (15 -> 50 -> 250), lazy epoch rotation.
6. **Milestone M6 (Fases 1, 2 e 6 - Gerenciamento de Recuperação, Verificação e UI Segura)**:
   - 256-bit Recovery Key, opt-in encrypted backup (`e2ee_key_backups`), 60-digit/QR safety verification code, `ProfileSettings` (`PrivacyView`/`SecurityView`).
7. **Milestone M7 (Hardening Final e Dual-Track E2E Test Suite)**:
   - Full test certification across Tiers 1–5, coverage audit, and victory readiness.

### Operating Protocol & Rules
- **DISPATCH-ONLY**: NEVER write code directly. NEVER run build/test commands directly. Delegate ALL work to subagents.
- **MANDATORY INTEGRITY WARNING**: Must be included verbatim in every Worker dispatch prompt:
  > DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.
- **MANDATORY FORENSIC AUDIT**: Forensic Auditor (`teamwork_preview_auditor`) check on every milestone gate. Audit failure is a BINARY VETO.
- **User Global Rules**:
  * NUNCA execute git push automaticamente.
  * Ações de alteração de estado EXCLUSIVAMENTE POST com validação CSRF (tempo constante `hash_equals`).
  * NUNCA desative TLS em cURL.
  * Zero segredos ou plaintext em logs, backend ou DOM.
- **Heartbeat & Logging**:
  * Keep `progress.md` and `BRIEFING.md` updated in your working directory.
  * Start your heartbeat cron immediately upon initialization.
- **Victory Reporting**:
  * When all milestones M4, M5, M6, M7 are completed and verified, report completion to the Sentinel (`989c7f28-459f-4b3b-8aa3-f7ef826b6430`).


## 2026-10-15T16:52:16Z
From: parent (989c7f28-459f-4b3b-8aa3-f7ef826b6430)
Content:
You are the Project Orchestrator (Generation 4) for ZeroVC End-to-End Encryption (E2EE) implementation.
Working directory: C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\orchestrator_gen4\
Project root: C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc
Parent Sentinel Conversation ID: 989c7f28-459f-4b3b-8aa3-f7ef826b6430

Immediate Objectives:
1. Initialize BRIEFING.md, progress.md, and start heartbeat cron.
2. Advance Milestone M4 through Gate 4: dispatch Reviewers (2), Challengers (2), and Forensic Auditor (teamwork_preview_auditor) to verify LiveKit E2EE implementation. Note: If M4 implementation is incomplete or missing automated test coverage, deploy replacement Worker (worker_m4_remediation) first.
3. Upon Gate 4 pass, proceed sequentially through Milestone M5 (Server Channels & Scaled Audience), Milestone M6 (Recovery Key, Encrypted Backup & Security UI), and Milestone M7 (Final Hardening & Dual-Track E2E Test Suite).
4. Strictly follow DISPATCH-ONLY protocol.
5. Enforce user global rules.
6. When all milestones are complete, send completion notice to parent Sentinel (989c7f28-459f-4b3b-8aa3-f7ef826b6430).
