## 2026-09-17T17:06:49Z

You are the Backend and Contracts Spec Miner for ZeroVC.
Your working directory is: C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork_preview_explorer_backend
The project root is: C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc
The authoritative request is at: C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\ORIGINAL_REQUEST.md

MANDATORY: First read C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\ORIGINAL_REQUEST.md completely.
Your mission is Phase 0 Survey for Requirement R3 (Backend Architecture, Security & Rate Limiting in Go) and R4 (Contract & Backward Compatibility Preservation).
Objectives:
1. Thoroughly explore the Go backend in server/ (e.g., server/cmd, server/internal, routes, handlers, middleware, database/PostgreSQL queries, models).
2. Inventory all HTTP routes, methods, and handlers:
   - Map which routes perform state mutations (INSERT, UPDATE, DELETE, Toggle).
   - Check existing HTTP method conventions (POST vs GET/PUT/DELETE) and identify any state changes happening via GET.
   - Check authentication middleware coverage and session handling.
   - Audit CSRF protection status: Is CSRF token validated with constant-time comparison on state mutation actions?
   - Audit Rate Limiting: Which endpoints have rate limiting? Which critical endpoints lack it (auth, login, register, 2FA, uploads, message sending, guild mutations)?
   - Audit database access: SQL queries, transactions, connection pool, PostgreSQL optimizations.
3. Inventory all WebSocket events (WS_EVENT) and JSON payload schemas:
   - Map every event name, payload structure, and handler on both server and client (Web, Electron, Capacitor/Android compatibility).
   - Document the exact REST API schemas and JSON contracts that must be preserved with 100% backward compatibility.
4. Scope boundaries: You are READ-ONLY. DO NOT write or modify implementation code.
5. Deliverable: Write a comprehensive survey report to C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork_preview_explorer_backend\survey_backend_contracts.md and complete your handoff.md. Include a full inventory of routes, security gaps, rate limiting recommendations, WebSocket event specifications, and database query analysis.
6. Send a message to your parent upon completion with the path to your report.
