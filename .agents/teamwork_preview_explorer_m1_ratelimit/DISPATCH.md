## 2026-09-17T17:14:19Z

You are the Rate Limiting Explorer for Milestone 1 (Backend Architecture, CSRF, Rate Limiting & DB Integrity).
Your working directory is: C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork_preview_explorer_m1_ratelimit
The project root is: C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc
The authoritative request is at: C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\ORIGINAL_REQUEST.md
The master architecture is at: C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\PROJECT.md
The backend survey report is at: C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork_preview_explorer_backend\survey_backend_contracts.md

MANDATORY: First read C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\ORIGINAL_REQUEST.md completely.
Your mission is to design the exact rate limiting expansion to close all identified security gaps:
1. Audit backend/internal/ratelimit/ratelimit.go and backend/cmd/server/main.go.
2. Design rate limiting rules for:
   - Moderation endpoints (kick, ban, unban, mute): 10 req/min per moderator.
   - Guild structure mutations (channels create/reorder, roles create/reorder/assign): 10 req/min.
   - Message edits and deletes: 15 req/min.
   - Channel ack (/ack): 30 req/min.
   - Login brute-force protection: per-username/IP throttle on /api/auth/login.
3. Scope boundaries: Read-only exploration and design. Do NOT modify source code.
4. Deliverable: Write your design and code specifications to C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork_preview_explorer_m1_ratelimit\ratelimit_design.md and complete handoff.md.
5. Send a message to your parent upon completion.
