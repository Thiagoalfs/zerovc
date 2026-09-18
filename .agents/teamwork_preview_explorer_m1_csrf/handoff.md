# Handoff Report — CSRF Protection Engine Explorer

**Explorer:** CSRF Engine Explorer (Milestone 1)  
**Deliverable File:** `C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork_preview_explorer_m1_csrf\csrf_design.md`  
**Parent Agent ID:** `37ac41a1-52f9-4aad-bfb7-9203f8e60e3b`  
**Date:** 2026-09-17  

---

## 1. Observation

Direct observations from the current codebase and project architecture:

1. **CORS Header Whitelist:**  
   In `backend/cmd/server/main.go` line 184:
   ```go
   AllowedHeaders: []string{"Accept", "Authorization", "Content-Type", "X-CSRF-Token"},
   ```
   `X-CSRF-Token` is allowed by CORS, but no middleware ever validates it or generates tokens.

2. **Session Authentication & Context:**  
   In `backend/internal/auth/auth.go` lines 79-118:
   `auth.Service.Middleware` validates the JWT session token (from `token` cookie or `Authorization: Bearer` header) and sets `UserContextKey` (`userID uuid.UUID`) in `r.Context()`.

3. **Current Auth Cookie Management:**  
   In `backend/internal/handlers/auth_handlers.go` lines 109-130:
   `setAuthCookie` sets an `HttpOnly: true`, `SameSite: Lax`, 30-day cookie named `token`. No `csrf_token` cookie is created.

4. **Auth Payloads Lack CSRF:**  
   In `backend/internal/handlers/auth_handlers.go` lines 298-301 and 672-675:
   `AuthResponse` returns `{ Token, User }` on login and verification without a CSRF token.
   In lines 684-717:
   `Me` handler returns `models.User` directly without generating or returning a CSRF token.

5. **Client Request Pipeline:**  
   In `client/src/lib/api.ts` lines 48-85:
   The `request()` helper includes credentials (`credentials: 'include'`) and sets `Authorization: Bearer` for Electron, but never sets the `X-CSRF-Token` header on state mutations.

6. **Authoritative Specification & Contract:**  
   `PROJECT.md` lines 71-79 specifies:
   - Backend sets readable cookie `csrf_token` on `/api/auth/me` and `/api/auth/login`.
   - All state-altering requests (`POST`, `PATCH`, `PUT`, `DELETE`) require `X-CSRF-Token: <token>`.
   - Validation must use `subtle.ConstantTimeCompare`.
   - Failure returns `HTTP 403 Forbidden` with `{"error": "CSRF token missing or invalid"}`.
   - Safe methods (`GET`, `HEAD`, `OPTIONS`) bypass checks.

---

## 2. Logic Chain

1. **Need for Cryptographic Session Binding (Observation 1, 2, 6):**  
   If tokens were static or shared, an attacker with a valid account could use their own CSRF token in an exploit targeting a victim. Therefore, the token must incorporate the authenticated `userID` and a server secret key derived from `jwtSecret` via HMAC-SHA256.

2. **Need for Stateless Verification with Zero Database Calls (Observation 2, 6):**  
   Querying PostgreSQL to look up CSRF tokens on every state alteration would degrade performance and allow attackers to flood endpoints to exhaust the 25-connection pool (`pgxpool`). By generating tokens as `<16-byte-salt-hex>.<timestamp>.<hmac-signature-hex>`, verification is performed entirely in-memory using CPU-light HMAC operations, guaranteeing 0 database queries.

3. **Need for Non-HttpOnly Cookie & Dual-Delivery (Observation 3, 4, 5, 6):**  
   Because the JWT cookie `token` is `HttpOnly: true` (Observation 3), client-side JavaScript cannot inspect it. To enable the frontend to extract and forward the CSRF token in the `X-CSRF-Token` header, the backend must deliver `csrf_token` as a readable cookie (`HttpOnly: false`), and also return it in the JSON responses of `/api/auth/login`, `/api/auth/verify-email`, and `/api/auth/me` to support non-cookie clients (Electron Desktop).

4. **Middleware Ordering in Router (Observation 1, 2, 6):**  
   In `backend/cmd/server/main.go`, `csrfService.RequireCSRF` must be mounted inside the protected route group immediately after `r.Use(authService.Middleware)`. This ensures `userID` is already authenticated in `r.Context()` before CSRF verification runs.

5. **Timing Attack Elimination (Observation 6):**  
   To prevent timing side-channel attacks on the HMAC signature, validation compares byte slices using `crypto/subtle.ConstantTimeCompare([]byte(provided), []byte(expected)) == 1`.

---

## 3. Caveats

1. **Client-Side Integration Timing:**  
   Updating `client/src/lib/api.ts` to attach `X-CSRF-Token` is mapped to **Milestone 2 (Feature #10)**. During Milestone 1 implementation, E2E tests and manual HTTP tests must explicitly include the `X-CSRF-Token` header to avoid 403 Forbidden on state mutations.
2. **Public Auth Endpoints:**  
   Unauthenticated endpoints (`/api/auth/login`, `/api/auth/register`, `/api/auth/forgot-password`) do not have an active user session and are protected against abuse via IP-based rate limiting (`httprate.LimitByIP(10, time.Minute)`), not session CSRF.
3. **HTTPS Secure Cookie Flag:**  
   In local development over HTTP, `Secure: false` must be preserved on cookies. In production environments where TLS is terminated at a reverse proxy, the backend should detect `r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https"`.

---

## 4. Conclusion

The complete, production-grade CSRF protection architecture and implementation specification for ZeroVC is fully designed and documented in:
`C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\.agents\teamwork_preview_explorer_m1_csrf\csrf_design.md`

Key deliverables specified:
- **`backend/internal/middleware/csrf.go`**: Complete Go source code for `CSRFService` and `RequireCSRF(next http.Handler) http.Handler` with constant-time verification, safe-method bypass, and zero-DB 403 error handling.
- **`backend/internal/middleware/csrf_test.go`**: 5 comprehensive unit test scenarios covering safe methods, missing headers, valid tokens, cross-user token transplantation attacks, and double-submit mismatches.
- **Handler Updates**: Exact line modifications for `Login`, `VerifyEmail`, `Me`, and `Logout` in `backend/internal/handlers/auth_handlers.go`.
- **Router Wiring**: Exact placement in `backend/cmd/server/main.go`.
- **Milestone 2 Bridge**: Frontend integration contract for `client/src/lib/api.ts`.

---

## 5. Verification Method

To independently verify the implementation once coded:

1. **Unit Test Verification:**  
   Run the middleware test suite:
   ```bash
   cd "C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\backend"
   go test -v ./internal/middleware/...
   ```
   *Expected outcome:* All CSRF test cases pass with 0 errors.

2. **Full Backend Compilation Verification:**  
   ```bash
   cd "C:\Users\Aluno CtrlPlay 4\Documents\GitHub\zerovc\backend"
   go build ./cmd/server
   ```
   *Expected outcome:* Compiles cleanly without syntax or typing errors.

3. **HTTP Endpoint Assertion (cURL):**  
   - `GET /api/auth/me` with session cookie returns JSON containing `"csrf_token"` and sets `Set-Cookie: csrf_token=...; Path=/`.
   - `POST /api/channels/{id}/messages` with valid session cookie but missing `X-CSRF-Token` header returns `HTTP 403 Forbidden` with body `{"error":"CSRF token missing or invalid"}`.
   - `POST /api/channels/{id}/messages` with valid session cookie and valid `X-CSRF-Token` succeeds (`200 OK` or `201 Created`).
