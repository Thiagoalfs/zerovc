# BRIEFING — 2026-09-17T17:30:00Z

## Mission
Implement Milestone 1 Backend & Security for ZeroVC: CSRF Protection Engine, Rate Limiting Engine, and Database Transactions across handlers.

## 🔒 My Identity
- Archetype: teamwork_preview_worker_m1
- Roles: implementer, qa, specialist
- Working directory: C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork_preview_worker_m1
- Original parent: 37ac41a1-52f9-4aad-bfb7-9203f8e60e3b
- Milestone: Milestone 1: Core Foundation & Security Hardening

## 🔒 Key Constraints
- Follow blueprints from the three explorer agents: csrf_design.md, ratelimit_design.md, dbtx_design.md
- Strict write ownership: only modify designated files
- Zero compilation errors (`go build ./...`)
- All tests pass (`go test -v ./internal/middleware/...`, `go test -v ./internal/ratelimit/...`)
- No cheating, no dummy facades, genuine implementations

## Current Parent
- Conversation ID: 37ac41a1-52f9-4aad-bfb7-9203f8e60e3b
- Updated: 2026-09-17T17:30:00Z

## Task Summary
- **What to build**: CSRF middleware & token service, rate limiters (login limiter, keyed rate limiters with retry-after header), database transaction wrapping for multi-step / critical mutations (ban, kick, invite join, category deletion, role reorder, dm group create & remove).
- **Success criteria**: Middleware unit tests pass (7/7), ratelimit unit tests pass (5/5), `go build ./...` passes with 0 errors, E2E suite passes 100% (120/120).
- **Interface contracts**: PROJECT.md, csrf_design.md, ratelimit_design.md, dbtx_design.md
- **Code layout**: Go standard layout in `backend/`

## Key Decisions Made
- Implemented HMAC-SHA256 user-bound stateless CSRF tokens with double-submit cookie validation and constant-time comparison via `subtle.ConstantTimeCompare`.
- Added Retry-After integer header to 429 Too Many Requests responses based on ceiling token refill calculation.
- Implemented multi-tier LoginRateLimiter: evaluates per-IP+username first, then global username, with automatic token refund if the second check fails to prevent denial-of-service against innocent users sharing target usernames.
- Wrapped all multi-query handler mutations (`BanMember`, `KickMember`, `JoinByInvite`, `Delete`, `Reorder`, `CreateGroup`, `RemoveMember`, `VerifyEmail`) in atomic `tx, err := pool.Begin(ctx)` blocks with deferred rollbacks and post-commit side effects.
- Added `SELECT ... FOR UPDATE` row locking on `guild_invites` during `JoinByInvite` to eradicate TOCTOU concurrency races on `max_uses`.

## Artifact Index
- DISPATCH.md — Assignment from orchestrator
- BRIEFING.md — Situational awareness
- progress.md — Liveness & status tracking
- handoff.md — Final handoff report

## Change Tracker
- **Files modified**:
  - `backend/internal/middleware/csrf.go` (created): CSRF token generation, double-submit cookie validation, constant-time verification.
  - `backend/internal/middleware/csrf_test.go` (created): 7 unit tests covering bypass on safe methods, missing header rejection, valid tokens, cross-user transplantation, cookie mismatch, malformed tokens, and cookie helpers.
  - `backend/internal/ratelimit/limiter.go` (updated): UserRateLimiter with Retry-After header and Refund, KeyedRateLimiter.
  - `backend/internal/ratelimit/login_limiter.go` (created): Multi-tier LoginRateLimiter with IP extraction, body peeking, and dual throttling.
  - `backend/internal/ratelimit/limiter_test.go` (created): 5 unit tests covering bursts, refills, middleware, dual login throttling, concurrency, and keyed limits.
  - `backend/internal/auth/auth.go` (updated): ContextWithUserID and SetUserIDInContext helpers.
  - `backend/cmd/server/main.go` (updated): Wired csrfService.RequireCSRF into protected route group; wired loginLimiter, moderationLimiter, guildStructureLimiter, messageMutationLimiter, channelAckLimiter.
  - `backend/internal/handlers/auth_handlers.go` (updated): Added CSRF cookie & payload delivery on Login, VerifyEmail, Me; ClearCookie on Logout; atomic tx on VerifyEmail; ContextWithUserID helper.
  - `backend/internal/handlers/guild_handlers.go` (updated): Wrapped KickMember and BanMember in atomic tx.Begin transactions.
  - `backend/internal/handlers/invite_handlers.go` (updated): Wrapped JoinByInvite in atomic tx.Begin transaction with FOR UPDATE row locking.
  - `backend/internal/handlers/channel_handlers.go` (updated): Wrapped Delete category reparenting and Reorder in atomic tx.Begin transactions.
  - `backend/internal/handlers/role_handlers.go` (updated): Wrapped Reorder in atomic tx.Begin transaction.
  - `backend/internal/handlers/dm_group_handlers.go` (updated): Wrapped CreateGroup and RemoveMember in atomic tx.Begin transactions.
- **Build status**: PASS (0 errors)
- **Pending issues**: None

## Quality Status
- **Build/test result**: PASS. All unit tests pass: middleware (7/7), ratelimit (5/5), backend all packages pass, E2E suite passes 120/120.
- **Lint status**: 0 outstanding violations.
- **Tests added/modified**: `csrf_test.go` (7 tests), `limiter_test.go` (5 tests).

## Loaded Skills
None
