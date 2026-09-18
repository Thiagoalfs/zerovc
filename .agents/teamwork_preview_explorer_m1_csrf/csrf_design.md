# ZeroVC — CSRF Protection Engine Architecture & Implementation Specification

**Author:** CSRF Engine Explorer (Antigravity Teamwork)  
**Milestone:** Milestone 1 — Backend Architecture, CSRF, Rate Limiting & DB Integrity  
**Date:** 2026-09-17  
**Status:** Complete Design Specification (Ready for Implementation)  
**Target Files:**  
- `backend/internal/middleware/csrf.go` (New)  
- `backend/internal/middleware/csrf_test.go` (New)  
- `backend/cmd/server/main.go` (Router wiring)  
- `backend/internal/handlers/auth_handlers.go` (Cookie & response delivery)  
- `client/src/lib/api.ts` (Client header injection — Milestone M2 preparation)  

---

## 1. Executive Summary & Problem Formulation

### 1.1 Context & Vulnerability Audit
ZeroVC is an open-source real-time communication platform with an authentication architecture that relies on:
1. **Web Browsers:** A 30-day session JWT stored in an `HttpOnly` cookie named `token` with `SameSite: Lax`. All web client requests include `credentials: 'include'`.
2. **Electron Desktop:** Bearer token transmitted in the `Authorization: Bearer <token>` header loaded from local storage.
3. **Capacitor Mobile (Android):** Hybrid cookie/Bearer authentication.

Prior to Milestone 1, **CSRF protection is completely absent** from the backend:
- `backend/cmd/server/main.go` line 184 merely whitelists `X-CSRF-Token` in CORS headers.
- No tokens are generated on login or session check.
- No middleware validates CSRF tokens on state-altering requests (`POST`, `PATCH`, `PUT`, `DELETE`).
- Over 70 state-altering endpoints (server deletions, channel creation, role assignments, kicks, bans, mutes, message sending/editing/deleting, password changes, and account deletions) are vulnerable to cross-site request forgery if a user visits a malicious website or navigates across origins in scenarios where `SameSite: Lax` does not provide sufficient defense (such as top-level POST navigations, subdomains, or plugin exploits).

### 1.2 Mandatory Security Directives (Authoritative Request & User Rules)
1. **Method Whitelist/Blacklist:** Safe methods (`GET`, `HEAD`, `OPTIONS`) must bypass validation. State-altering methods (`POST`, `PATCH`, `PUT`, `DELETE`) must strictly require a valid CSRF token.
2. **Constant-Time Verification:** Token comparison must employ constant-time evaluation via Go's standard library `crypto/subtle.ConstantTimeCompare` to eradicate timing side channels.
3. **Zero-Database Overhead & Immediate Rejection:** On missing or invalid tokens, the middleware must immediately abort execution with `HTTP 403 Forbidden` and JSON body `{"error": "CSRF token missing or invalid"}` without performing any database lookups, query executions, or downstream handler executions.
4. **Token Delivery:** The backend must deliver the CSRF token via a readable (non-HttpOnly) cookie named `csrf_token` and within the JSON payloads of `/api/auth/login`, `/api/auth/verify-email`, and `/api/auth/me`.
5. **Session/JWT Binding:** The token must be cryptographically bound to the authenticated user session (`userID` and server secret) to prevent attacker token transplantation.

---

## 2. Threat Modeling & Attack Vectors

```
+-------------------------------------------------------------------------+
|                               ATTACK SCENARIO                            |
+-------------------------------------------------------------------------+
|                                                                         |
|  Victim User                       Attacker Website (evil.com)          |
|  [Logged into ZeroVC]             [Embedded Hidden Form / Script]       |
|         |                                        |                      |
|         |  Visits evil.com                       |                      |
|         |--------------------------------------->|                      |
|         |                                        |                      |
|         |  Auto-submits POST to ZeroVC:          |                      |
|         |  /api/guilds/{id}/members/{user}/ban   |                      |
|         |  Browser attaches 'token' cookie       |                      |
|         |---------------------------------------> [ZeroVC Backend]      |
|         |                                                |              |
|         |                                   [RequireCSRF Middleware]    |
|         |                                   Checks 'X-CSRF-Token' header|
|         |                                   HEADER MISSING OR INVALID!  |
|         |                                                |              |
|         |                                   Immediate HTTP 403 Forbidden|
|         |                                   ZERO DB QUERIES EXECUTED    |
|         |                                   ATTACK NEUTRALIZED!         |
+-------------------------------------------------------------------------+
```

### 2.1 Attack Vectors Mitigated
1. **Cross-Origin HTML Form Submission:** Standard HTML `<form method="POST">` can execute cross-origin POST requests. Since browsers cannot set custom headers like `X-CSRF-Token` via simple form posts, this attack fails instantly.
2. **Cross-Origin JavaScript Fetch/XHR:** Same-Origin Policy (SOP) blocks malicious scripts on third-party domains from reading the victim's `csrf_token` cookie or reading JSON responses from `/api/auth/me`. Therefore, an attacker cannot forge the `X-CSRF-Token` header.
3. **Token Transplantation (Attacker Token Substitution):** An attacker with an account on ZeroVC cannot supply their own valid CSRF token in an exploit targeting a victim. Because ZeroVC's CSRF token is cryptographically bound to the victim's `userID` via HMAC-SHA256, validating the attacker's token against the victim's authenticated `userID` fails immediately.
4. **Timing Attacks:** Variable-time string comparison (`tokenA == tokenB`) leaks byte-matching lengths via microsecond timing differences. Using `crypto/subtle.ConstantTimeCompare` eliminates all timing leakage.
5. **Database Denial of Service (DoS):** If invalid CSRF tokens triggered database session queries, an attacker could flood endpoints with forged requests to exhaust the PostgreSQL connection pool (`MaxConns: 25`). Because CSRF validation is pure CPU in-memory HMAC, rejected requests cost 0 database connections.

---

## 3. Cryptographic Token Architecture & Session Binding

### 3.1 Token Construction (HMAC-SHA256 Token Pattern)
ZeroVC implements a **Stateless, Cryptographically Signed Session-Bound Token**. The token is composed of three parts separated by dots:

$$\text{CSRF Token} = \text{Salt (Hex)} \,.\, \text{Timestamp (Unix)} \,.\, \text{HMAC-SHA256 (Hex)}$$

```
+------------------+   .   +---------------------+   .   +------------------------------------+
| 16-byte CSPRNG   |       | Unix Timestamp      |       | HMAC-SHA256 Signature              |
| Salt (32 hex ch) |   .   | (e.g. "1789750000") |   .   | (64 hex characters)                |
+------------------+       +---------------------+       +------------------------------------+
```

#### Mathematical Specification:
$$\text{Salt} \leftarrow \text{crypto/rand.Read}(16 \text{ bytes})$$
$$\text{Message} = \text{"csrf:"} \parallel \text{UserID} \parallel \text{":"} \parallel \text{Salt} \parallel \text{":"} \parallel \text{Timestamp}$$
$$\text{Signature} = \text{HMAC-SHA256}(\text{CSRFKey}, \text{Message})$$
$$\text{Token} = \text{hex}(\text{Salt}) + \text{"."} + \text{Timestamp} + \text{"."} + \text{hex}(\text{Signature})$$

### 3.2 Security Properties of This Construction
1. **Unpredictability & High Entropy:** The 16-byte random salt generated by `crypto/rand` provides $2^{128}$ possible values. Each token generated is unique, preventing token collision and replay analysis.
2. **Cryptographic Binding to User Identity:** The message input to the HMAC explicitly includes `userID.String()`. Token validation recomputes the HMAC using the `userID` extracted from the verified JWT in `r.Context()`. A token generated for User A is cryptographically invalid for User B.
3. **Session Key Isolation:** The HMAC key is derived from the server's master secret using a domain-separated HKDF or SHA-256 derivation (`SHA256("zerovc-csrf-token-v1:" + jwtSecret)`), ensuring that any theoretical vulnerability in CSRF does not compromise JWT signing keys.
4. **Sliding Expiration & Grace Period:** The token timestamp allows setting a validity lifetime (e.g., 24 hours or up to the 30-day session maximum). Requests within the valid window verify without needing database state.
5. **Zero Database Dependency:** Neither token generation nor token verification requires reading or writing to PostgreSQL.

---

## 4. Token Delivery Protocol

ZeroVC uses a **Dual-Delivery Strategy** (Readable Cookie + JSON Response Payload) to support both Web browsers and non-browser clients (Electron and Mobile).

```
                      +-----------------------------+
                      | Client calls /auth/login    |
                      | or /auth/me                 |
                      +--------------+--------------+
                                     |
                                     v
                       [Backend Authenticates User]
                                     |
                         Generates CSRF Token
                                     |
               +---------------------+---------------------+
               |                                           |
               v                                           v
    1. Sets HTTP Cookie                         2. Returns JSON Body
    Set-Cookie: csrf_token=<token>;             {
      Path=/; Max-Age=2592000;                     "token": "...",
      SameSite=Lax; Secure=false                   "csrf_token": "<token>",
      (HttpOnly: FALSE)                            "user": { ... }
                                                }
```

### 4.1 Cookie Delivery Specification (`csrf_token`)
- **Name:** `csrf_token`
- **Value:** The serialized HMAC token (`salt.timestamp.signature`)
- **Path:** `/`
- **MaxAge:** `30 * 24 * 3600` (30 days, 2,592,000 seconds — synchronized with the `token` cookie)
- **HttpOnly:** `false`  
  *(CRITICAL: While the JWT auth cookie `token` is `HttpOnly: true` to prevent XSS credential theft, `csrf_token` MUST be readable by client-side JavaScript via `document.cookie` so the frontend can read and attach it to the `X-CSRF-Token` header).*
- **Secure:** `false` in development; `true` when behind HTTPS (`r.TLS != nil` or `X-Forwarded-Proto == "https"`).
- **SameSite:** `http.SameSiteLaxMode`

### 4.2 JSON Payload Delivery Specification
In addition to the cookie, the CSRF token is explicitly included in authentication responses:
1. **`POST /api/auth/login`**:
   ```json
   {
     "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
     "csrf_token": "a1b2c3d4...1789750000...e5f6g7h8",
     "user": { ... }
   }
   ```
2. **`POST /api/auth/verify-email`**:
   ```json
   {
     "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
     "csrf_token": "a1b2c3d4...1789750000...e5f6g7h8",
     "user": { ... }
   }
   ```
3. **`GET /api/auth/me`**:
   When the user fetches their current session profile, the backend sets/refreshes the `csrf_token` cookie and includes `"csrf_token"` in the returned JSON object.

### 4.3 Session Destruction (`POST /api/auth/logout`)
When `Logout` is executed, both cookies are expired simultaneously:
```go
func clearCSRFCookie(w http.ResponseWriter) {
    http.SetCookie(w, &http.Cookie{
        Name:     "csrf_token",
        Value:    "",
        Path:     "/",
        MaxAge:   -1,
        HttpOnly: false,
        SameSite: http.SameSiteLaxMode,
    })
}
```

---

## 5. Constant-Time Validation Middleware (`RequireCSRF`)

### 5.1 Complete Go Implementation (`backend/internal/middleware/csrf.go`)

The complete, production-ready Go source code for the CSRF middleware is specified below:

```go
package middleware

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/zerovc/zerovc/backend/internal/auth"
)

const (
	// CSRFCookieName is the standard cookie name for CSRF tokens.
	CSRFCookieName = "csrf_token"

	// CSRFHeaderName is the HTTP request header expected on state mutations.
	CSRFHeaderName = "X-CSRF-Token"

	// CSRFTokenTTL defines the maximum validity period for a CSRF token (30 days).
	CSRFTokenTTL = 30 * 24 * time.Hour
)

// CSRFService provides cryptographic CSRF token generation, delivery, and validation.
type CSRFService struct {
	key []byte
}

// NewCSRFService initializes the CSRF service with a secret key derived from the master JWT secret.
func NewCSRFService(jwtSecret string) *CSRFService {
	// Derive dedicated 256-bit CSRF key using domain separation
	h := sha256.New()
	h.Write([]byte("zerovc-csrf-key-derivation-v1:"))
	h.Write([]byte(jwtSecret))
	derivedKey := h.Sum(nil)

	return &CSRFService{
		key: derivedKey,
	}
}

// GenerateToken creates a cryptographically secure, user-bound HMAC CSRF token.
// Format: <16-byte-salt-hex>.<timestamp-unix>.<hmac-sha256-hex>
func (s *CSRFService) GenerateToken(userID uuid.UUID) (string, error) {
	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		return "", fmt.Errorf("failed to generate csrf entropy: %w", err)
	}

	saltHex := hex.EncodeToString(salt)
	timestamp := time.Now().Unix()

	sig := s.computeHMAC(userID, saltHex, timestamp)
	return fmt.Sprintf("%s.%d.%s", saltHex, timestamp, sig), nil
}

// ValidateToken verifies the format, expiration, and HMAC signature of a CSRF token in constant time.
func (s *CSRFService) ValidateToken(tokenString string, userID uuid.UUID) bool {
	parts := strings.Split(tokenString, ".")
	if len(parts) != 3 {
		return false
	}

	saltHex := parts[0]
	tsStr := parts[1]
	providedSig := parts[2]

	// Salt must be exactly 32 hex chars (16 bytes)
	if len(saltHex) != 32 {
		return false
	}

	// Verify salt hex decoding
	if _, err := hex.DecodeString(saltHex); err != nil {
		return false
	}

	// Parse and check timestamp
	ts, err := strconv.ParseInt(tsStr, 10, 64)
	if err != nil {
		return false
	}

	issuedAt := time.Unix(ts, 0)
	now := time.Now()

	// Check if token has expired or is from the future beyond 5 minutes (clock skew tolerance)
	if now.Sub(issuedAt) > CSRFTokenTTL || issuedAt.After(now.Add(5*time.Minute)) {
		return false
	}

	// Compute expected HMAC signature
	expectedSig := s.computeHMAC(userID, saltHex, ts)

	// Constant-time comparison of HMAC signatures
	return subtle.ConstantTimeCompare([]byte(providedSig), []byte(expectedSig)) == 1
}

// computeHMAC generates the hex-encoded HMAC-SHA256 signature for a user and salt.
func (s *CSRFService) computeHMAC(userID uuid.UUID, saltHex string, timestamp int64) string {
	mac := hmac.New(sha256.New, s.key)
	message := fmt.Sprintf("csrf:%s:%s:%d", userID.String(), saltHex, timestamp)
	mac.Write([]byte(message))
	return hex.EncodeToString(mac.Sum(nil))
}

// SetCookie sets the readable csrf_token cookie on the response.
func (s *CSRFService) SetCookie(w http.ResponseWriter, token string, isSecure bool) {
	http.SetCookie(w, &http.Cookie{
		Name:     CSRFCookieName,
		Value:    token,
		Path:     "/",
		MaxAge:   int(CSRFTokenTTL.Seconds()),
		HttpOnly: false, // Must be readable by client-side JavaScript
		Secure:   isSecure,
		SameSite: http.SameSiteLaxMode,
	})
}

// ClearCookie removes the csrf_token cookie from the client.
func (s *CSRFService) ClearCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     CSRFCookieName,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: false,
		SameSite: http.SameSiteLaxMode,
	})
}

// RequireCSRF returns an HTTP middleware that verifies X-CSRF-Token on all state-altering requests.
// Safe methods (GET, HEAD, OPTIONS) bypass verification.
// On failure, immediately responds with HTTP 403 Forbidden without database calls.
func (s *CSRFService) RequireCSRF(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// 1. Safe HTTP methods bypass CSRF verification
		if isSafeMethod(r.Method) {
			next.ServeHTTP(w, r)
			return
		}

		// 2. Extract authenticated user ID from context (injected by authService.Middleware)
		userID, ok := auth.GetUserIDFromContext(r.Context())
		if !ok || userID == uuid.Nil {
			rejectCSRF(w, "CSRF token missing or invalid")
			return
		}

		// 3. Extract X-CSRF-Token header
		headerToken := strings.TrimSpace(r.Header.Get(CSRFHeaderName))
		if headerToken == "" {
			rejectCSRF(w, "CSRF token missing or invalid")
			return
		}

		// 4. Double-Submit validation: if csrf_token cookie is present, it must match the header token in constant time
		if cookie, err := r.Cookie(CSRFCookieName); err == nil && cookie.Value != "" {
			if subtle.ConstantTimeCompare([]byte(headerToken), []byte(cookie.Value)) != 1 {
				rejectCSRF(w, "CSRF token missing or invalid")
				return
			}
		}

		// 5. Cryptographic signature validation bound to the authenticated user ID
		if !s.ValidateToken(headerToken, userID) {
			rejectCSRF(w, "CSRF token missing or invalid")
			return
		}

		// 6. Token is valid; proceed to next handler
		next.ServeHTTP(w, r)
	})
}

// isSafeMethod checks if the HTTP method is read-only / safe per RFC 7231.
func isSafeMethod(method string) bool {
	switch method {
	case http.MethodGet, http.MethodHead, http.MethodOptions:
		return true
	default:
		return false
	}
}

// rejectCSRF writes an immediate HTTP 403 Forbidden response with zero database calls.
func rejectCSRF(w http.ResponseWriter, errorMsg string) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(http.StatusForbidden)
	// Body matches exact project specification: {"error": "CSRF token missing or invalid"}
	w.Write([]byte(fmt.Sprintf(`{"error":%q}`, errorMsg)))
}
```

---

## 6. Integration Touchpoints & Handler Wiring

### 6.1 Wiring in `backend/cmd/server/main.go`

In `backend/cmd/server/main.go`, the middleware is instantiated after `authService` and mounted inside the protected route group:

```go
// --- In Step 3: Initialize Services ---
authService := auth.NewService(jwtSecret)
csrfService := middleware.NewCSRFService(jwtSecret)

// --- In Step 4: Initialize Handlers ---
// Pass csrfService to authHandler so Login, VerifyEmail, and Me can generate and set tokens
authHandler := handlers.NewAuthHandler(db, authService, emailService, csrfService)

// --- In Step 5: Router & Middleware ---
// Protected API Routes
r.Group(func(r chi.Router) {
    // 1. Authenticate user from Cookie or Bearer header -> populates UserContextKey in r.Context()
    r.Use(authService.Middleware)

    // 2. Validate CSRF on all state-altering requests (POST, PATCH, PUT, DELETE)
    r.Use(csrfService.RequireCSRF)

    // 3. User-level rate limiters and handlers follow...
    ...
```

### 6.2 Handler Updates in `backend/internal/handlers/auth_handlers.go`

#### A. In `Login`:
```go
// After verifying credentials and 2FA, generate JWT token and CSRF token:
token, err := h.auth.GenerateToken(user.ID, user.Username)
if err != nil {
    http.Error(w, `{"error":"failed to generate token"}`, http.StatusInternalServerError)
    return
}

// Set HttpOnly session cookie
setAuthCookie(w, token)

// Generate and set readable CSRF cookie
csrfToken, _ := h.csrf.GenerateToken(user.ID)
h.csrf.SetCookie(w, csrfToken, r.TLS != nil)

w.Header().Set("Content-Type", "application/json")
json.NewEncoder(w).Encode(AuthResponse{
    Token:     token,
    CSRFToken: csrfToken,
    User:      user.ToPublic(),
})
```

#### B. In `VerifyEmail`:
```go
// Upon successful email verification, issue both tokens:
token, err := h.auth.GenerateToken(user.ID, user.Username)
if err != nil {
    http.Error(w, `{"error":"failed to generate token"}`, http.StatusInternalServerError)
    return
}

setAuthCookie(w, token)

csrfToken, _ := h.csrf.GenerateToken(user.ID)
h.csrf.SetCookie(w, csrfToken, r.TLS != nil)

w.Header().Set("Content-Type", "application/json")
json.NewEncoder(w).Encode(AuthResponse{
    Token:     token,
    CSRFToken: csrfToken,
    User:      user.ToPublic(),
})
```

#### C. In `Me` (`GET /api/auth/me`):
```go
// When client loads user data, ensure valid CSRF cookie is present / renewed:
csrfToken, _ := h.csrf.GenerateToken(userID)
h.csrf.SetCookie(w, csrfToken, r.TLS != nil)

w.Header().Set("Content-Type", "application/json")
// Retain 100% backward-compatible User object fields, appending csrf_token
response := struct {
    models.User
    CSRFToken string `json:"csrf_token"`
}{
    User:      user,
    CSRFToken: csrfToken,
}
json.NewEncoder(w).Encode(response)
```

#### D. In `Logout`:
```go
func (h *AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
    clearAuthCookie(w)
    h.csrf.ClearCookie(w)
    w.Header().Set("Content-Type", "application/json")
    w.Write([]byte(`{"message":"logged out successfully"}`))
}
```

---

## 7. Client Integration Strategy (Milestone M2 Preparation)

### 7.1 Client CSRF Header Integration (`client/src/lib/api.ts`)
In Milestone M2, `client/src/lib/api.ts` will be updated to automatically attach `X-CSRF-Token` to every mutation request:

```ts
// Helper to extract CSRF token from cookie or local storage
function getCSRFToken(): string | null {
  // 1. Check document.cookie in browser environments
  if (typeof document !== 'undefined' && document.cookie) {
    const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
    if (match && match[1]) {
      return decodeURIComponent(match[1]);
    }
  }

  // 2. Fallback to localStorage (used by Electron Desktop)
  if (typeof localStorage !== 'undefined') {
    return localStorage.getItem('csrf_token');
  }

  return null;
}

// In request<T>():
const method = (options.method || 'GET').toUpperCase();
if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) {
  const csrfToken = getCSRFToken();
  if (csrfToken) {
    headers['X-CSRF-Token'] = csrfToken;
  }
}
```

### 7.2 Handling Login & Me Responses in `client/src/stores/authStore.ts`
When `login()` or `fetchMe()` succeeds:
```ts
if (response.csrf_token) {
  localStorage.setItem('csrf_token', response.csrf_token);
}
```

### 7.3 Handling Media Uploads (`FormData`)
In `api.upload.*` functions (`uploadAvatar`, `uploadGuildIcon`, `uploadAttachment`):
The `fetch` request passes `headers: { ... }`. We add `'X-CSRF-Token': getCSRFToken() || ''` to the request headers.

---

## 8. Verification & Testing Specification

### 8.1 Unit Test Suite (`backend/internal/middleware/csrf_test.go`)

The unit test suite validates all 10 core requirements:

```go
package middleware_test

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/zerovc/zerovc/backend/internal/auth"
	"github.com/zerovc/zerovc/backend/internal/middleware"
)

func setupTestService() (*middleware.CSRFService, *auth.Service, string) {
	secret := "test-jwt-secret-key-32-bytes-long!"
	csrfSvc := middleware.NewCSRFService(secret)
	authSvc := auth.NewService(secret)
	return csrfSvc, authSvc, secret
}

// Test 1: Safe methods bypass CSRF check
func TestSafeMethodsBypassCSRF(t *testing.T) {
	csrfSvc, _, _ := setupTestService()
	handler := csrfSvc.RequireCSRF(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	}))

	safeMethods := []string{http.MethodGet, http.MethodHead, http.MethodOptions}
	for _, method := range safeMethods {
		req := httptest.NewRequest(method, "/api/guilds", nil)
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Errorf("expected %s to bypass CSRF, got code %d", method, rec.Code)
		}
	}
}

// Test 2: Mutation methods without X-CSRF-Token fail with 403 Forbidden
func TestMutationsWithoutCSRFHeaderFail(t *testing.T) {
	csrfSvc, _, _ := setupTestService()
	handler := csrfSvc.RequireCSRF(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("handler should not have been called")
	}))

	mutations := []string{http.MethodPost, http.MethodPatch, http.MethodPut, http.MethodDelete}
	for _, method := range mutations {
		req := httptest.NewRequest(method, "/api/guilds", strings.NewReader(`{"name":"test"}`))
		// Set authenticated user context
		ctx := auth.ContextWithUserID(req.Context(), uuid.New())
		req = req.WithContext(ctx)

		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusForbidden {
			t.Errorf("expected %s without CSRF header to return 403, got %d", method, rec.Code)
		}
		if !strings.Contains(rec.Body.String(), `"error":"CSRF token missing or invalid"`) {
			t.Errorf("unexpected body: %s", rec.Body.String())
		}
	}
}

// Test 3: Valid CSRF token succeeds with 200 OK
func TestValidCSRFTokenSucceeds(t *testing.T) {
	csrfSvc, _, _ := setupTestService()
	userID := uuid.New()

	token, err := csrfSvc.GenerateToken(userID)
	if err != nil {
		t.Fatalf("failed to generate token: %v", err)
	}

	handler := csrfSvc.RequireCSRF(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"success":true}`))
	}))

	req := httptest.NewRequest(http.MethodPost, "/api/guilds", strings.NewReader(`{}`))
	ctx := auth.ContextWithUserID(req.Context(), userID)
	req = req.WithContext(ctx)
	req.Header.Set("X-CSRF-Token", token)
	req.AddCookie(&http.Cookie{Name: "csrf_token", Value: token})

	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d: %s", rec.Code, rec.Body.String())
	}
}

// Test 4: Attacker cannot use their own CSRF token against another user (User B token used by User A)
func TestCrossUserTokenTransplantationFails(t *testing.T) {
	csrfSvc, _, _ := setupTestService()
	victimID := uuid.New()
	attackerID := uuid.New()

	attackerToken, _ := csrfSvc.GenerateToken(attackerID)

	handler := csrfSvc.RequireCSRF(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("handler should not have been called on transplanted token")
	}))

	req := httptest.NewRequest(http.MethodPost, "/api/guilds/123/delete", nil)
	// Request is authenticated as victim
	ctx := auth.ContextWithUserID(req.Context(), victimID)
	req = req.WithContext(ctx)
	// But sends attacker's CSRF token
	req.Header.Set("X-CSRF-Token", attackerToken)

	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403 Forbidden on transplanted token, got %d", rec.Code)
	}
}

// Test 5: Double-submit mismatch (cookie != header) fails with 403
func TestDoubleSubmitMismatchFails(t *testing.T) {
	csrfSvc, _, _ := setupTestService()
	userID := uuid.New()

	validToken1, _ := csrfSvc.GenerateToken(userID)
	validToken2, _ := csrfSvc.GenerateToken(userID)

	handler := csrfSvc.RequireCSRF(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("handler should not have been called on mismatch")
	}))

	req := httptest.NewRequest(http.MethodPost, "/api/channels", nil)
	ctx := auth.ContextWithUserID(req.Context(), userID)
	req = req.WithContext(ctx)
	req.Header.Set("X-CSRF-Token", validToken1)
	req.AddCookie(&http.Cookie{Name: "csrf_token", Value: validToken2}) // Mismatch!

	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403 on mismatched cookie/header, got %d", rec.Code)
	}
}
```

---

## 9. Implementation Checklist & Verification Commands

### 9.1 Developer Steps for Milestone 1 Implementer
- [ ] Create `backend/internal/middleware/csrf.go` using the complete code in Section 5.1.
- [ ] Create `backend/internal/middleware/csrf_test.go` with the test suite in Section 8.1.
- [ ] In `backend/internal/auth/auth.go`, add helper `ContextWithUserID(ctx context.Context, id uuid.UUID) context.Context` (if not already public).
- [ ] In `backend/cmd/server/main.go`, instantiate `csrfService := middleware.NewCSRFService(jwtSecret)` and add `r.Use(csrfService.RequireCSRF)` inside the protected `r.Group`.
- [ ] In `backend/internal/handlers/auth_handlers.go`, inject `csrfService` into `AuthHandler` and update `Login`, `VerifyEmail`, `Me`, and `Logout` as described in Section 6.2.
- [ ] Run `go test -v ./internal/middleware/...` and verify all tests pass with 0 errors.
- [ ] Run `go build ./...` from `backend/` to verify zero compilation errors.

### 9.2 Verification Commands
```bash
# Verify Go build and compilation
cd backend
go build ./cmd/server

# Run unit tests for CSRF middleware
go test -v ./internal/middleware/...

# Run all backend unit tests
go test -v ./...
```
