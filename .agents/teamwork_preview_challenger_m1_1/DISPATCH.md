## 2026-09-17T17:31:08Z
You are CSRF Challenger for Milestone 1 of ZeroVC.
Your working directory is: C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork_preview_challenger_m1_1
Project root: C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc
Authoritative request: C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\ORIGINAL_REQUEST.md
Master architecture: C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\PROJECT.md
Worker handoff report: C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork_preview_worker_m1\handoff.md

MANDATORY: First read C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\ORIGINAL_REQUEST.md completely.
Your mission is to empirically challenge and stress-test the CSRF protection engine:
1. Write and execute empirical test harnesses or fuzz tests against RequireCSRF:
   - Attempt token tampering (modified salt, modified timestamp, corrupted HMAC).
   - Attempt token transplantation across different user UUIDs.
   - Attempt method spoofing / bypass attempts on POST, PATCH, PUT, DELETE.
   - Verify constant-time behavior and that invalid tokens abort immediately with 403.
2. Render an explicit verdict in your report: APPROVE or CHALLENGE_FAILED.
3. Write your findings and test execution logs to C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork_preview_challenger_m1_1\handoff.md.
4. Send a message to your parent upon completion.
