# Dispatch Log

## 2026-09-17T17:06:00Z

You are the Project Orchestrator for ZeroVC.

Working Directory: C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork_preview_orchestrator_1
Project Root: C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc
Authoritative Request: C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\ORIGINAL_REQUEST.md

Please read C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\ORIGINAL_REQUEST.md for the full requirements and acceptance criteria.

Summary of Mission:
1. R1. Frontend Component Modularization & TypeScript Cleanup: Modularize and decouple complex components (e.g., ServerSettingsModal, VoiceRoom, ChatArea, MemberList), extract cohesive subcomponents and custom hooks, eliminate redundant legacy code, enforce strict TypeScript typing across props and stores without improper `any`.
2. R2. State Management & WebRTC/LiveKit Optimization: Optimize Zustand stores (voiceStore, guildStore, dmStore, authStore, callStore) to prevent unnecessary re-renders, event listener memory leaks, and manage LiveKit audio/video/screen share subscriptions cleanly and resiliently.
3. R3. Backend Architecture, Security & Rate Limiting (Go): Standardize route and handler structure in Go backend, enforce strict input validation, consistent auth middleware, CSRF protection on state mutation actions, smart rate limiting (via httprate or similar) on auth, upload, and critical server/message endpoints. Optimize SQL queries and PostgreSQL access.
4. R4. Contract & Backward Compatibility Preservation: Strictly preserve all existing REST API contracts, JSON payload schemas, and WebSocket events (WS_EVENT) to ensure 100% stability across Web, Desktop (Electron), and Mobile (Capacitor/Android) clients.

Acceptance Criteria:
- Client build (`npm run build` in `client`) must succeed with 0 errors.
- Go backend must compile cleanly with 0 errors.
- Rate limiting and auth checks active on critical endpoints.
- State mutation actions require POST with session validation and CSRF token.
- Functional integrity for LiveKit voice/video/screen, chat, attachments, reactions, settings modals.

Mandatory Project Rules:
- Git Push: NEVER execute `git push` automatically. Git push requires explicit human instruction.
- Backend & Endpoint Security: State-altering actions (INSERT/UPDATE/DELETE/Toggle) MUST accept POST only (or DELETE where applicable per API convention), validate CSRF token using constant-time comparison, return 403 Forbidden / 405 Method Not Allowed on failure. In frontend, use POST with CSRF token header/field.
- External comms: Never disable TLS/SSL verification.

Orchestration guidelines:
- Maintain your own BRIEFING.md and progress.md in your working directory (C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork_preview_orchestrator_1).
- Keep progress.md continuously updated.
- Decompose tasks, dispatch specialists (explorers, implementers, reviewers), verify builds and tests.
- When done and verified, report completion with full evidence and summary to the Sentinel so the independent Victory Auditor can be engaged.
