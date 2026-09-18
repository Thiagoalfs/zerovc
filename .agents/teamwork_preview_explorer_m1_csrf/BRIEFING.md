# BRIEFING — 2026-09-17T17:16:59Z

## Mission
Design the complete, production-grade CSRF protection engine for ZeroVC (Go backend), covering token generation, HMAC/session binding, cookie delivery, API auth payloads, constant-time validation middleware, and zero-DB-overhead 403 error handling.

## 🔒 My Identity
- Archetype: explorer
- Roles: Security & CSRF Engine Architecture Specialist
- Working directory: C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork_preview_explorer_m1_csrf
- Original parent: 37ac41a1-52f9-4aad-bfb7-9203f8e60e3b
- Milestone: Milestone 1 (Backend Architecture, CSRF, Rate Limiting & DB Integrity)

## 🔒 Key Constraints
- Read-only investigation — do NOT implement / do NOT modify source code
- Strictly write files only to .agents/teamwork_preview_explorer_m1_csrf/
- Constant-time validation using subtle.ConstantTimeCompare
- Immediate 403 Forbidden without database calls on failure
- State alteration methods validation: POST, PATCH, PUT, DELETE
- Token delivery via cookie (csrf_token) and in /api/auth/me and /api/auth/login responses
- Adhere to user global security guidelines: no git push; state-altering endpoints security

## Current Parent
- Conversation ID: 37ac41a1-52f9-4aad-bfb7-9203f8e60e3b
- Updated: 2026-09-17T17:16:59Z

## Investigation State
- **Explored paths**:
  - `backend/cmd/server/main.go` (Router, CORS, middleware stack, route inventory)
  - `backend/internal/auth/auth.go` (JWT generation, validation, session cookies, Context)
  - `backend/internal/handlers/auth_handlers.go` (Login, Register, VerifyEmail, Me, Logout, 2FA)
  - `client/src/lib/api.ts` (Fetch client, Bearer vs Cookie handling, endpoints)
  - `backend/go.mod` (Go 1.23, dependencies)
  - `PROJECT.md`, `ORIGINAL_REQUEST.md`, `TEST_INFRA.md`, `survey_backend_contracts.md`
- **Key findings**:
  - Zero CSRF validation exists currently; `X-CSRF-Token` is merely in CORS AllowedHeaders.
  - Go backend uses standard `crypto/rand`, `crypto/hmac`, `crypto/sha256`, and `crypto/subtle`.
  - Zero database overhead is achieved through stateless HMAC tokens bound to `userID` and secret.
  - Delivery is specified via readable cookie `csrf_token` and JSON response fields in `/login`, `/verify-email`, and `/me`.
  - Constant-time validation in `RequireCSRF` middleware guarantees immunity against timing side-channels.
- **Unexplored areas**: None for CSRF scope. Full specification delivered.

## Key Decisions Made
- Designed stateless HMAC-SHA256 token pattern: `<16-byte-salt-hex>.<timestamp>.<hmac-sha256-hex>`
- Bound token to `userID` to prevent cross-user token transplantation
- Delivered via non-HttpOnly cookie `csrf_token` and JSON response fields
- Formulated `RequireCSRF` middleware using `subtle.ConstantTimeCompare` with immediate 403 Forbidden
- Formulated complete unit test suite in `csrf_test.go` and detailed integration roadmap

## Artifact Index
- `DISPATCH.md` — incoming dispatch instructions
- `BRIEFING.md` — persistent situational awareness
- `progress.md` — liveness heartbeat
- `csrf_design.md` — complete CSRF architecture & middleware specification
- `handoff.md` — 5-component handoff report
