# BRIEFING — 2026-09-17T17:18:30Z

## Mission
Design the rate limiting expansion for ZeroVC Milestone 1 covering moderation, guild mutations, message edits/deletes, channel acks, and login brute-force protection.

## 🔒 My Identity
- Archetype: explorer
- Roles: rate limiting explorer
- Working directory: C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork_preview_explorer_m1_ratelimit
- Original parent: 37ac41a1-52f9-4aad-bfb7-9203f8e60e3b
- Milestone: Milestone 1 (Backend Architecture, CSRF, Rate Limiting & DB Integrity)

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- Design rate limiting rules for moderation endpoints (10 req/min), guild structure mutations (10 req/min), message edits/deletes (15 req/min), channel ack (30 req/min), login brute-force protection
- Write deliverables only to working directory: ratelimit_design.md and handoff.md
- Never run git push

## Current Parent
- Conversation ID: 37ac41a1-52f9-4aad-bfb7-9203f8e60e3b
- Updated: not yet

## Investigation State
- **Explored paths**:
  - `backend/internal/ratelimit/limiter.go`
  - `backend/cmd/server/main.go`
  - `backend/internal/handlers/auth_handlers.go`
  - `backend/internal/handlers/message_handlers.go`
  - `backend/internal/handlers/guild_handlers.go`
  - `backend/internal/handlers/channel_handlers.go`
  - `backend/go.mod` and `backend/go.sum`
  - `PROJECT.md`, `ORIGINAL_REQUEST.md`, `survey_backend_contracts.md`
- **Key findings**:
  - `limiter.go` provides an in-memory token bucket keyed exclusively on `uuid.UUID`, which lacks standard RFC 6585 `Retry-After` calculation and cannot protect unauthenticated endpoints like `/api/auth/login`.
  - Moderation endpoints (`kick`, `bans`, `unban`, `mute`), guild structure mutations (`channels`, `roles`), message edits/deletes, and channel ack (`/ack`) have zero rate limiting in `main.go`.
  - `/api/auth/login` only has an IP limiter (`httprate.LimitByIP(10, time.Minute)`), exposing it to distributed botnet brute force against specific user accounts and CPU exhaustion on bcrypt.
- **Unexplored areas**: None for M1 Rate Limiting scope; all 5 target areas designed in full.

## Key Decisions Made
- Designed `KeyedRateLimiter` (string-keyed token bucket) to complement `UserRateLimiter` (`uuid.UUID`-keyed).
- Added `Retry-After` header calculation across rate limiters to comply with RFC 6585.
- Designed `LoginRateLimiter` using safe 4KB request body peeking (`io.LimitReader` + `io.NopCloser(bytes.NewReader)`) and dual-tier throttling (`IP:username` 5 req/min and global `username` 10 req/min).
- Placed rate limiting downstream of CSRF validation in the middleware pipeline to ensure invalid CSRF attacks do not exhaust legitimate user quotas.

## Artifact Index
- DISPATCH.md — record of incoming dispatch messages
- progress.md — liveness heartbeat
- ratelimit_design.md — rate limiting design deliverable
- handoff.md — handoff report
