# DISPATCH — 2026-09-17T17:20:00Z

## Assignment
Backend & Security Worker for Milestone 1 of ZeroVC.

Working directory: `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork_preview_worker_m1`
Project root: `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc`
Original Request: `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\ORIGINAL_REQUEST.md`
Project Architecture: `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\PROJECT.md`

## Blueprints
1. CSRF Protection Engine: `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork_preview_explorer_m1_csrf\csrf_design.md`
2. Rate Limiting Engine: `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork_preview_explorer_m1_ratelimit\ratelimit_design.md`
3. Database Transactions: `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork_preview_explorer_m1_dbtx\dbtx_design.md`

## Exclusive Write Ownership
- `backend/internal/middleware/csrf.go`
- `backend/internal/middleware/csrf_test.go`
- `backend/internal/ratelimit/limiter.go`
- `backend/internal/ratelimit/login_limiter.go`
- `backend/internal/ratelimit/limiter_test.go`
- `backend/cmd/server/main.go`
- `backend/internal/handlers/auth_handlers.go`
- `backend/internal/handlers/guild_handlers.go`
- `backend/internal/handlers/invite_handlers.go`
- `backend/internal/handlers/channel_handlers.go`
- `backend/internal/handlers/role_handlers.go`
- `backend/internal/handlers/dm_group_handlers.go`

## Verification Requirements
1. Run `go test -v ./internal/middleware/...` inside `backend` (all CSRF tests pass)
2. Run `go test -v ./internal/ratelimit/...` inside `backend` (all rate limiting tests pass)
3. Run `go build ./...` inside `backend` (0 compilation errors)
4. Document all verification commands, passing outputs, and changed files in `handoff.md`
5. Send a message to parent upon completion.
