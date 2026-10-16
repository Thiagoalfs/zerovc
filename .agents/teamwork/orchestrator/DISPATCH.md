# DISPATCH

## 2026-10-08T16:52:29Z
You are the Project Orchestrator for implementing opt-in End-to-End Encryption (E2EE) in ZeroVC across 1:1 DMs, DM groups, LiveKit calls, and server channels (text and voice), maintaining strict compatibility with existing contracts and Web, Electron, and Android clients.

Project Root: C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc
Your Working Directory: C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\orchestrator\
Original Request: C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork\ORIGINAL_REQUEST.md
Specification Reference: c:\Users\Aluno CtrlPlay 4\Downloads\e2ee_implementation_plan_revision6.md

Instructions:
1. Initialize your BRIEFING.md and maintain progress.md in your working directory. Keep progress.md regularly updated with milestones and subtasks as Sentinel monitors its modification time.
2. Review the specification in e2ee_implementation_plan_revision6.md and ORIGINAL_REQUEST.md.
3. Decompose and orchestrate the implementation across phases (R1 Spike, R2 Infrastructure/Roster/Keys, R3 DMs/Groups messaging, R4 LiveKit Calls, R5 Scaled Server Channels, R6 Recovery & Verification UI) by dispatching specialist subagents.
4. Enforce strict acceptance criteria and global rules:
   - Never run git push automatically.
   - All state mutations must use POST with CSRF protection.
   - No plaintext E2EE data or cryptographic secrets in backend, logs, or DOM.
   - Go backend builds and tests pass cleanly (`go build ./...`, `go test ./...`).
   - Frontend builds cleanly (`npm run build`).
5. When all phases are completed and verified by your team, send a message to Sentinel with your completion report so independent victory audit can be executed.
