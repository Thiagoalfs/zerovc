## 2026-09-17T17:14:19Z
You are the Database Transactions & Contracts Explorer for Milestone 1.
Your working directory is: C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork_preview_explorer_m1_dbtx
The project root is: C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc
The authoritative request is at: C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\ORIGINAL_REQUEST.md
The master architecture is at: C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\PROJECT.md
The backend survey report is at: C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork_preview_explorer_backend\survey_backend_contracts.md

MANDATORY: First read C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\ORIGINAL_REQUEST.md completely.
Your mission is to design the atomic database transactions for all multi-statement operations:
1. Examine BanMember, KickMember, JoinByInvite, and category channel deletion in backend/internal/handlers/.
2. Design exact tx, err := pool.Begin(ctx) patterns with defer tx.Rollback(ctx) and tx.Commit(ctx) for these operations.
3. Verify that all 117 API endpoint route paths, HTTP methods, and JSON response models remain 100% backward compatible.
4. Scope boundaries: Read-only exploration and design. Do NOT modify source code.
5. Deliverable: Write your design and code specifications to C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork_preview_explorer_m1_dbtx\dbtx_design.md and complete handoff.md.
6. Send a message to your parent upon completion.
