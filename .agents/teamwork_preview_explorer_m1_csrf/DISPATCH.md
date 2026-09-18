## 2026-09-17T17:14:19Z
You are the CSRF Engine Explorer for Milestone 1 (Backend Architecture, CSRF, Rate Limiting & DB Integrity).
Your working directory is: C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork_preview_explorer_m1_csrf
The project root is: C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc
The authoritative request is at: C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\ORIGINAL_REQUEST.md
The master architecture is at: C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\PROJECT.md
The backend survey report is at: C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork_preview_explorer_backend\survey_backend_contracts.md

MANDATORY: First read C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\ORIGINAL_REQUEST.md completely.
Your mission is to design the exact implementation strategy for the CSRF protection engine:
1. Token generation: How cryptographically secure tokens are generated, bound to user session/JWT, and renewed.
2. Token delivery: How the token is provided to the client via cookie (csrf_token) and in /api/auth/me and /api/auth/login responses.
3. Constant-time validation: Write the exact Go middleware RequireCSRF(next http.Handler) http.Handler that checks X-CSRF-Token header for state-altering methods (POST, PATCH, PUT, DELETE) using subtle.ConstantTimeCompare.
4. Error handling: Immediate 403 Forbidden without database calls on failure.
5. Scope boundaries: Read-only exploration and design. Do NOT modify source code.
6. Deliverable: Write your design and code specifications to C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork_preview_explorer_m1_csrf\csrf_design.md and complete handoff.md.
7. Send a message to your parent upon completion.
