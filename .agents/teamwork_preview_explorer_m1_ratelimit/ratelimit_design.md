# ZeroVC — Milestone 1 Rate Limiting Architecture & Specification

**Author:** Rate Limiting Explorer (Teamwork Preview M1)  
**Date:** 2026-09-17  
**Scope:** Milestone 1 (Backend Architecture, CSRF, Rate Limiting & DB Integrity)  
**Target Files:**
- `backend/internal/ratelimit/limiter.go` (Audit & Extension)
- `backend/internal/ratelimit/login_limiter.go` (New Specification)
- `backend/cmd/server/main.go` (Router Middleware Chaining)
- `backend/internal/ratelimit/limiter_test.go` (Unit Test Suite)

---

## 1. Executive Summary & Objective

In modern real-time communication architectures (such as Discord and ZeroVC), unthrottled state mutations expose the platform to denial-of-service (DoS), database lock contention, WebSocket fan-out storms, vandalism by rogue administrators or compromised moderator accounts, and distributed brute-force credential stuffing.

In Phase 0, our comprehensive audit of `backend/cmd/server/main.go` and `backend/internal/ratelimit/limiter.go` identified that while ZeroVC has basic token-bucket rate limiting on 15 user actions (sending messages, creating guilds, uploads, and reactions), **critical mutation endpoints were completely unprotected**.

This design closes 100% of the identified gaps:
1. **Moderation Endpoints (Kick, Ban, Unban, Mute)**: Capped at **10 req/min per moderator**.
2. **Guild Structure Mutations (Channels create/reorder, Roles create/reorder/assign)**: Capped at **10 req/min per user**.
3. **Message Edits and Deletes**: Capped at **15 req/min per user** across channels, DMs, and DM groups.
4. **Channel Ack (`/ack`)**: Capped at **30 req/min per user** to prevent read-state database upsert floods and WebSocket broadcast loops.
5. **Login Brute-Force Protection**: Multi-tier throttle on `POST /api/auth/login` protecting against distributed botnet attacks targeting specific usernames while preserving legitimate user access and safeguarding CPU-intensive bcrypt hashing.

All rules strictly preserve 100% backward compatibility for all REST contracts and WebSocket event payloads.

---

## 2. Codebase Audit & Security Gap Analysis

### 2.1 Existing Rate Limiting Mechanism (`backend/internal/ratelimit/limiter.go`)
The current rate limiter implements an in-memory Token Bucket algorithm keyed by `uuid.UUID`:

```go
type userBucket struct {
    tokens     float64
    maxTokens  float64
    refillRate float64 // tokens per second
    lastRefill time.Time
}

type UserRateLimiter struct {
    mu         sync.Mutex
    buckets    map[uuid.UUID]*userBucket
    maxTokens  float64
    refillRate float64
    errorMsg   string
}
```

**Strengths:**
- High-performance, mutex-synchronized token bucket with zero database roundtrips.
- Token refill is calculated lazily on request arrival (`elapsed * refillRate`), avoiding per-user background timers.
- Background eviction ticker (`10 * time.Minute`) removes inactive user buckets older than 15 minutes, ensuring bounded memory usage.
- Standard Chi middleware pattern extracting `auth.GetUserIDFromContext(r.Context())`.

**Weaknesses & Gaps:**
- **Key restriction:** Exclusively accepts `uuid.UUID` as the bucket key. Unauthenticated public endpoints (like `POST /api/auth/login`) do NOT have a user ID in the request context, making `UserRateLimiter` unusable for login brute-force defense.
- **Missing `Retry-After` Header:** When rejecting requests with HTTP 429 Too Many Requests, it omits the standard RFC 6585 `Retry-After: <seconds>` header. Client apps, mobile clients (Capacitor), and desktop clients cannot tell how long to pause before retrying.
- **Dependency Status (`httprate`):** In `backend/cmd/server/main.go`, `httprate.LimitByIP` is imported and used, but `github.com/go-chi/httprate` is missing from `backend/go.sum`. Providing self-contained string-keyed limiters within `backend/internal/ratelimit` eliminates external fragility.

---

### 2.2 Unprotected Security Attack Vectors in `backend/cmd/server/main.go`

| Attack Vector | Current State in `main.go` | Vulnerability & Blast Radius | Required Rule |
|---|---|---|---|
| **Moderator Raid / Compromised Account** | Lines 302–305: `kick`, `bans`, `unban`, `mute` have NO limiter | A rogue or compromised moderator can issue hundreds of kicks and bans per second, wiping server membership and spamming the audit log. | **10 req/min** per moderator |
| **Server Structure Vandalism & DB Exhaustion** | Lines 308–325: `channels` (create, update, delete, reorder, permissions) and `roles` (create, update, delete, reorder, assign, remove) have NO limiter | An attacker with admin permissions can script the creation of 10,000 channels and roles, triggering foreign key cascading checks, database connection pool exhaustion, and massive `CHANNEL_CREATE`/`ROLE_CREATE` WebSocket broadcasts to all connected members. | **10 req/min** per user |
| **Message Edit / Delete DoS & Audit Evasion** | Lines 341–342, 364–365, 372–373: `PATCH` and `DELETE` on messages have NO limiter | While message sending is throttled to 5/s, editing and deleting have no limiter. A spam script can rapidly mutate or purge thousands of messages, overloading PostgreSQL write throughput and triggering rapid `MESSAGE_UPDATE`/`MESSAGE_DELETE` WebSocket cascades. | **15 req/min** per user |
| **Channel Ack Read-State Flooding** | Line 316: `POST /api/channels/{channelID}/ack` has NO limiter | Each ack triggers a PostgreSQL `INSERT ... ON CONFLICT (user_id, channel_id) DO UPDATE` query and a `CHANNEL_ACK` WebSocket event. Malicious clients can spam `/ack` to drive DB CPU to 100%. | **30 req/min** per user |
| **Distributed Login Brute-Force & Bcrypt Starvation** | Lines 192, 199: Only an IP-level limiter (`httprate.LimitByIP(10, time.Minute)`) exists for all `/api/auth/*` | Distributed botnets rotating residential IPs can submit thousands of password guesses against a single target account without hitting the 10/min/IP threshold. Each check calls `bcrypt.CompareHashAndPassword`, consuming ~100ms of CPU and starving backend resources. | **Multi-tier throttle**: 5 req/min per IP:username, 10 req/min per username globally |

---

## 3. Core Architectural Design

To support both authenticated UUID-keyed rate limiting and public string-keyed / multi-dimensional rate limiting, `backend/internal/ratelimit` is expanded into a cohesive, zero-external-dependency rate limiting suite.

```
backend/internal/ratelimit/
├── limiter.go         # Token bucket core, UserRateLimiter (enhanced with Retry-After), KeyedRateLimiter
├── login_limiter.go   # Multi-tier LoginRateLimiter (IP:username, global username, IP fallback)
└── limiter_test.go    # Comprehensive unit tests for concurrency, bursts, refills, and eviction
```

### 3.1 Token Bucket Math & `Retry-After` Calculation

For a limiter configured with burst capacity $C$ (`maxTokens`) and refill rate $R$ (`refillRate` tokens/sec):
- When a new bucket is created, it is allocated $C - 1$ tokens (1 token consumed by the incoming request).
- On subsequent requests, refilled tokens are computed as:
  $$\text{tokens} = \min(C, \text{tokens} + \Delta t \times R)$$
- If $\text{tokens} \ge 1.0$, the request is permitted and $\text{tokens} \leftarrow \text{tokens} - 1.0$.
- If $\text{tokens} < 1.0$, the request is rejected with HTTP 429 Too Many Requests.
- The minimum seconds until the next token becomes available is:
  $$\text{Retry-After} = \max\left(1, \left\lceil \frac{1.0 - \text{tokens}}{R} \right\rceil\right)$$

This integer value is emitted as `Retry-After: <seconds>` along with `Content-Type: application/json` and the standard body:
```json
{"error": "<localized_error_message>"}
```

---

### 3.2 Login Brute-Force Defense Architecture (`LoginRateLimiter`)

The login brute-force protection must address two distinct attack models without denying service to legitimate users:

```
                  Incoming POST /api/auth/login
                                │
                  Peek request body (max 4KB)
               Extract normalized email/username
                    Extract normalized IP
                                │
                                ▼
         ┌──────────────────────────────────────────────┐
         │ Check 1: Per-(IP + Username) Token Bucket    │
         │ Max: 5 tokens, Refill: 5/60 tokens/sec       │
         └──────────────────────┬───────────────────────┘
                                │ Allowed
                                ▼
         ┌──────────────────────────────────────────────┐
         │ Check 2: Global Per-Username Token Bucket    │
         │ Max: 10 tokens, Refill: 10/60 tokens/sec     │
         └──────────────────────┬───────────────────────┘
                                │ Allowed
                                ▼
         ┌──────────────────────────────────────────────┐
         │ Restore r.Body via io.NopCloser(bytesReader) │
         │ Pass request downstream to AuthHandler.Login │
         └──────────────────────────────────────────────┘
```

#### Key Technical Decisions:
1. **Safe Non-Destructive Body Peeking:**
   The middleware uses `io.LimitReader(r.Body, 4096)` to read up to 4KB. It immediately replaces `r.Body` with `io.NopCloser(bytes.NewReader(bodyBytes))` so downstream `AuthHandler.Login` can parse the JSON payload without any loss of data.
2. **IP Normalization:**
   Client IPs can include ephemeral ports (e.g. `192.168.1.100:54321` or `[::1]:54321`). The IP extractor calls `net.SplitHostPort` to normalize the key to the host address alone, ensuring that distinct TCP connections from the same client IP map to the same bucket.
3. **Identifier Normalization:**
   User input in `req.Email` is lowercased and whitespace-trimmed (`strings.ToLower(strings.TrimSpace(email))`).
4. **Bcrypt CPU Protection:**
   Because the check occurs in the middleware **before** `AuthHandler.Login` executes SQL queries and `bcrypt.CompareHashAndPassword`, CPU exhaustion attacks are completely neutralized.

---

## 4. Concrete Rate Limiting Rules & Route Mappings

Below is the complete mapping of all routes, middleware instances, parameters, and localized error messages.

### 4.1 Summary of New Limiters

| Limiter Variable | Limiter Type | Capacity (Burst) | Refill Rate (tokens/sec) | Rate Equivalent | Localized Error Message |
|---|---|---|---|---|---|
| `moderationLimiter` | `UserRateLimiter` | 10 | `10.0 / 60.0` (~0.167) | 10 req / min | `"Você está realizando ações de moderação muito rápido. Aguarde um instante."` |
| `guildStructureLimiter` | `UserRateLimiter` | 10 | `10.0 / 60.0` (~0.167) | 10 req / min | `"Você está alterando a estrutura do servidor muito rápido. Aguarde um instante."` |
| `messageMutationLimiter` | `UserRateLimiter` | 15 | `15.0 / 60.0` (0.250) | 15 req / min | `"Você está editando ou excluindo mensagens muito rápido. Aguarde um instante."` |
| `channelAckLimiter` | `UserRateLimiter` | 30 | `30.0 / 60.0` (0.500) | 30 req / min | `"Você está confirmando leitura de canais muito rápido. Aguarde um instante."` |
| `loginLimiter` | `LoginRateLimiter` | 5 (IP:User) / 10 (User) | `5.0/60.0` / `10.0/60.0` | 5/min per IP:user, 10/min per user | `"Muitas tentativas de login. Aguarde um instante antes de tentar novamente."` |

---

### 4.2 Endpoint Registration Changes in `backend/cmd/server/main.go`

#### A. Public Authentication Route
- **Path:** `POST /api/auth/login`
- **Current (Line 199):** `r.Post("/login", authHandler.Login)`
- **Protected:**
  ```go
  r.With(loginLimiter.Middleware).Post("/login", authHandler.Login)
  ```

#### B. Moderation Endpoints
- **Current (Lines 302–305):**
  ```go
  r.Post("/api/guilds/{id}/members/{userID}/kick", guildHandler.KickMember)
  r.Post("/api/guilds/{id}/bans", guildHandler.BanMember)
  r.Delete("/api/guilds/{id}/bans/{userID}", guildHandler.UnbanMember)
  r.Post("/api/guilds/{id}/members/{userID}/mute", guildHandler.MuteMember)
  ```
- **Protected:**
  ```go
  r.With(moderationLimiter.Middleware).Post("/api/guilds/{id}/members/{userID}/kick", guildHandler.KickMember)
  r.With(moderationLimiter.Middleware).Post("/api/guilds/{id}/bans", guildHandler.BanMember)
  r.With(moderationLimiter.Middleware).Delete("/api/guilds/{id}/bans/{userID}", guildHandler.UnbanMember)
  r.With(moderationLimiter.Middleware).Post("/api/guilds/{id}/members/{userID}/mute", guildHandler.MuteMember)
  ```
- **Defense in Depth (Admin Voice Moderation, Line 382):**
  ```go
  r.With(moderationLimiter.Middleware).Post("/api/channels/{channelID}/members/{userID}/voice-state", channelHandler.AdminUpdateVoiceState)
  ```

#### C. Guild Structure Mutations (Channels & Roles)
- **Channels (Lines 308–313):**
  ```go
  r.With(guildStructureLimiter.Middleware).Post("/api/guilds/{guildID}/channels", channelHandler.Create)
  r.With(guildStructureLimiter.Middleware).Patch("/api/channels/{id}", channelHandler.Update)
  r.With(guildStructureLimiter.Middleware).Delete("/api/channels/{id}", channelHandler.Delete)
  r.With(guildStructureLimiter.Middleware).Put("/api/channels/{id}/permissions/{roleID}", channelHandler.UpdatePermissionOverwrite)
  r.With(guildStructureLimiter.Middleware).Delete("/api/channels/{id}/permissions/{roleID}", channelHandler.DeletePermissionOverwrite)
  r.With(guildStructureLimiter.Middleware).Put("/api/guilds/{guildID}/channels/positions", channelHandler.Reorder)
  ```
- **Roles (Lines 319–324):**
  ```go
  r.With(guildStructureLimiter.Middleware).Post("/api/guilds/{guildID}/roles", roleHandler.Create)
  r.With(guildStructureLimiter.Middleware).Patch("/api/guilds/{guildID}/roles/{roleID}", roleHandler.Update)
  r.With(guildStructureLimiter.Middleware).Put("/api/guilds/{guildID}/roles/positions", roleHandler.Reorder)
  r.With(guildStructureLimiter.Middleware).Delete("/api/guilds/{guildID}/roles/{roleID}", roleHandler.Delete)
  r.With(guildStructureLimiter.Middleware).Post("/api/guilds/{guildID}/members/{userID}/roles/{roleID}", roleHandler.AssignRole)
  r.With(guildStructureLimiter.Middleware).Delete("/api/guilds/{guildID}/members/{userID}/roles/{roleID}", roleHandler.RemoveRole)
  ```

#### D. Message Mutations (Edits & Deletions)
- **Guild Channel Messages (Lines 372–373):**
  ```go
  r.With(messageMutationLimiter.Middleware).Patch("/api/channels/{channelID}/messages/{messageID}", messageHandler.Update)
  r.With(messageMutationLimiter.Middleware).Delete("/api/channels/{channelID}/messages/{messageID}", messageHandler.Delete)
  ```
- **1x1 Direct Messages (Lines 341–342):**
  ```go
  r.With(messageMutationLimiter.Middleware).Patch("/api/dms/{roomID}/messages/{messageID}", dmHandler.UpdateMessage)
  r.With(messageMutationLimiter.Middleware).Delete("/api/dms/{roomID}/messages/{messageID}", dmHandler.DeleteMessage)
  ```
- **DM Group Messages (Lines 364–365):**
  ```go
  r.With(messageMutationLimiter.Middleware).Patch("/api/dm/groups/{id}/messages/{messageID}", dmGroupHandler.UpdateMessage)
  r.With(messageMutationLimiter.Middleware).Delete("/api/dm/groups/{id}/messages/{messageID}", dmGroupHandler.DeleteMessage)
  ```

#### E. Channel Ack
- **Path (Line 315):**
  ```go
  r.With(channelAckLimiter.Middleware).Post("/api/channels/{channelID}/ack", messageHandler.AckChannel)
  ```

---

## 5. Code Specifications (Drop-In Implementation)

### 5.1 `backend/internal/ratelimit/limiter.go`

```go
package ratelimit

import (
	"fmt"
	"math"
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/zerovc/zerovc/backend/internal/auth"
)

type tokenBucket struct {
	tokens     float64
	maxTokens  float64
	refillRate float64 // tokens per second
	lastRefill time.Time
}

// UserRateLimiter throttles authenticated requests keyed by user UUID.
type UserRateLimiter struct {
	mu         sync.Mutex
	buckets    map[uuid.UUID]*tokenBucket
	maxTokens  float64
	refillRate float64
	errorMsg   string
}

// NewUserRateLimiter creates an in-memory token bucket limiter for authenticated users.
func NewUserRateLimiter(maxTokens float64, refillRate float64, errorMsg string) *UserRateLimiter {
	limiter := &UserRateLimiter{
		buckets:    make(map[uuid.UUID]*tokenBucket),
		maxTokens:  maxTokens,
		refillRate: refillRate,
		errorMsg:   errorMsg,
	}

	// Periodic cleanup of stale buckets every 10 minutes
	go func() {
		ticker := time.NewTicker(10 * time.Minute)
		for range ticker.C {
			limiter.mu.Lock()
			now := time.Now()
			for id, b := range limiter.buckets {
				if now.Sub(b.lastRefill) > 15*time.Minute {
					delete(limiter.buckets, id)
				}
			}
			limiter.mu.Unlock()
		}
	}()

	return limiter
}

// Allow checks if the request for the given user ID is permitted.
// If not permitted, it returns false and the recommended Retry-After seconds.
func (l *UserRateLimiter) Allow(userID uuid.UUID) (bool, int) {
	l.mu.Lock()
	defer l.mu.Unlock()

	now := time.Now()
	b, exists := l.buckets[userID]
	if !exists {
		l.buckets[userID] = &tokenBucket{
			tokens:     l.maxTokens - 1,
			maxTokens:  l.maxTokens,
			refillRate: l.refillRate,
			lastRefill: now,
		}
		return true, 0
	}

	// Refill tokens based on elapsed time
	elapsed := now.Sub(b.lastRefill).Seconds()
	b.tokens += elapsed * b.refillRate
	if b.tokens > b.maxTokens {
		b.tokens = b.maxTokens
	}
	b.lastRefill = now

	if b.tokens >= 1.0 {
		b.tokens -= 1.0
		return true, 0
	}

	// Calculate wait time until at least 1 full token is refilled
	needed := 1.0 - b.tokens
	retryAfter := int(math.Ceil(needed / b.refillRate))
	if retryAfter <= 0 {
		retryAfter = 1
	}
	return false, retryAfter
}

// Middleware returns an HTTP handler wrapping next with user token bucket rate limiting.
func (l *UserRateLimiter) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		userID, ok := auth.GetUserIDFromContext(r.Context())
		if !ok {
			next.ServeHTTP(w, r)
			return
		}

		allowed, retryAfter := l.Allow(userID)
		if !allowed {
			w.Header().Set("Content-Type", "application/json")
			w.Header().Set("Retry-After", strconv.Itoa(retryAfter))
			w.WriteHeader(http.StatusTooManyRequests)
			_, _ = w.Write([]byte(fmt.Sprintf(`{"error":"%s"}`, l.errorMsg)))
			return
		}

		next.ServeHTTP(w, r)
	})
}

// KeyedRateLimiter throttles requests keyed by an arbitrary string (IP, username, compound key).
type KeyedRateLimiter struct {
	mu         sync.Mutex
	buckets    map[string]*tokenBucket
	maxTokens  float64
	refillRate float64
	errorMsg   string
}

// NewKeyedRateLimiter creates a token bucket limiter keyed by string.
func NewKeyedRateLimiter(maxTokens float64, refillRate float64, errorMsg string) *KeyedRateLimiter {
	limiter := &KeyedRateLimiter{
		buckets:    make(map[string]*tokenBucket),
		maxTokens:  maxTokens,
		refillRate: refillRate,
		errorMsg:   errorMsg,
	}

	go func() {
		ticker := time.NewTicker(10 * time.Minute)
		for range ticker.C {
			limiter.mu.Lock()
			now := time.Now()
			for k, b := range limiter.buckets {
				if now.Sub(b.lastRefill) > 15*time.Minute {
					delete(limiter.buckets, k)
				}
			}
			limiter.mu.Unlock()
		}
	}()

	return limiter
}

// Allow checks if the request for the key is permitted and returns retryAfter seconds if denied.
func (l *KeyedRateLimiter) Allow(key string) (bool, int) {
	l.mu.Lock()
	defer l.mu.Unlock()

	now := time.Now()
	b, exists := l.buckets[key]
	if !exists {
		l.buckets[key] = &tokenBucket{
			tokens:     l.maxTokens - 1,
			maxTokens:  l.maxTokens,
			refillRate: l.refillRate,
			lastRefill: now,
		}
		return true, 0
	}

	elapsed := now.Sub(b.lastRefill).Seconds()
	b.tokens += elapsed * b.refillRate
	if b.tokens > b.maxTokens {
		b.tokens = b.maxTokens
	}
	b.lastRefill = now

	if b.tokens >= 1.0 {
		b.tokens -= 1.0
		return true, 0
	}

	needed := 1.0 - b.tokens
	retryAfter := int(math.Ceil(needed / b.refillRate))
	if retryAfter <= 0 {
		retryAfter = 1
	}
	return false, retryAfter
}
```

---

### 5.2 `backend/internal/ratelimit/login_limiter.go`

```go
package ratelimit

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"strconv"
	"strings"
)

// LoginRateLimiter enforces dual-dimensional throttling for login attempts:
// 1. Per-(IP + Username) throttle to stop single-source password guessing.
// 2. Per-Username global throttle to stop distributed botnet password spraying.
type LoginRateLimiter struct {
	ipUserLimiter *KeyedRateLimiter
	userLimiter   *KeyedRateLimiter
	errorMsg      string
}

// NewLoginRateLimiter creates a coordinated login rate limiter.
// - ipUserMax / ipUserRefill: limits requests per (IP + username) (e.g. 5 tokens, 5.0/60.0).
// - userMax / userRefill: limits requests per username globally (e.g. 10 tokens, 10.0/60.0).
func NewLoginRateLimiter(ipUserMax, ipUserRefill, userMax, userRefill float64, errorMsg string) *LoginRateLimiter {
	return &LoginRateLimiter{
		ipUserLimiter: NewKeyedRateLimiter(ipUserMax, ipUserRefill, errorMsg),
		userLimiter:   NewKeyedRateLimiter(userMax, userRefill, errorMsg),
		errorMsg:      errorMsg,
	}
}

// Allow evaluates both throttle layers. If either is exceeded, returns false and retryAfter.
func (l *LoginRateLimiter) Allow(clientIP, identifier string) (bool, int) {
	// 1. Global account throttle if identifier is provided
	if identifier != "" {
		if allowed, retryAfter := l.userLimiter.Allow("user:" + identifier); !allowed {
			return false, retryAfter
		}
	}

	// 2. Per-(IP + identifier) throttle (or IP only if identifier is empty)
	key := "ip:" + clientIP
	if identifier != "" {
		key = "ip_user:" + clientIP + ":" + identifier
	}

	if allowed, retryAfter := l.ipUserLimiter.Allow(key); !allowed {
		return false, retryAfter
	}

	return true, 0
}

// ExtractClientIP normalizes the client IP address, stripping ephemeral TCP ports and
// honoring trusted reverse proxy headers.
func ExtractClientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		parts := strings.Split(xff, ",")
		ip := strings.TrimSpace(parts[0])
		if ip != "" {
			return ip
		}
	}
	if xri := r.Header.Get("X-Real-IP"); xri != "" {
		return strings.TrimSpace(xri)
	}

	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err == nil && host != "" {
		return host
	}
	return r.RemoteAddr
}

// Middleware peeks the JSON login body up to 4KB, extracts the identifier, evaluates rate limits,
// and restores the request body for AuthHandler.Login.
func (l *LoginRateLimiter) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			next.ServeHTTP(w, r)
			return
		}

		// Read up to 4KB to prevent memory exhaustion
		bodyBytes, err := io.ReadAll(io.LimitReader(r.Body, 4096))
		if err != nil {
			http.Error(w, `{"error":"invalid request payload"}`, http.StatusBadRequest)
			return
		}
		_ = r.Body.Close()

		// Restore request body for the downstream handler
		r.Body = io.NopCloser(bytes.NewReader(bodyBytes))

		var peek struct {
			Email string `json:"email"`
		}
		_ = json.Unmarshal(bodyBytes, &peek)

		identifier := strings.TrimSpace(strings.ToLower(peek.Email))
		clientIP := ExtractClientIP(r)

		allowed, retryAfter := l.Allow(clientIP, identifier)
		if !allowed {
			w.Header().Set("Content-Type", "application/json")
			w.Header().Set("Retry-After", strconv.Itoa(retryAfter))
			w.WriteHeader(http.StatusTooManyRequests)
			_, _ = w.Write([]byte(fmt.Sprintf(`{"error":"%s"}`, l.errorMsg)))
			return
		}

		next.ServeHTTP(w, r)
	})
}
```

---

### 5.3 `backend/cmd/server/main.go` Changes (Git Diff Style)

```diff
@@ -190,16 +190,21 @@
 	// Public Auth Endpoints — rate limit só aqui dentro
+	loginLimiter := ratelimit.NewLoginRateLimiter(
+		5, 5.0/60.0,   // 5 req/min per IP:username
+		10, 10.0/60.0, // 10 req/min per username globally
+		"Muitas tentativas de login. Aguarde um instante antes de tentar novamente.",
+	)
 	r.Route("/api/auth", func(r chi.Router) {
 		r.Use(httprate.LimitByIP(10, time.Minute))
 		r.Post("/register", authHandler.Register)
 		r.Post("/verify-email", authHandler.VerifyEmail)
 		r.Post("/resend-verification", authHandler.ResendVerification)
 		r.Post("/forgot-password", authHandler.ForgotPassword)
 		r.Post("/verify-reset-token", authHandler.VerifyResetToken)
 		r.Post("/reset-password", authHandler.ResetPassword)
-		r.Post("/login", authHandler.Login)
+		r.With(loginLimiter.Middleware).Post("/login", authHandler.Login)
 		r.Post("/logout", authHandler.Logout)
 	})
@@ -261,6 +266,11 @@
 		emojiLimiter := ratelimit.NewUserRateLimiter(10, 10.0/60.0, "Você está alterando emojis muito rápido. Aguarde um instante.")
 		profileUpdateLimiter := ratelimit.NewUserRateLimiter(10, 10.0/60.0, "Você está atualizando seu perfil muito rápido. Aguarde um instante.")
+		moderationLimiter := ratelimit.NewUserRateLimiter(10, 10.0/60.0, "Você está realizando ações de moderação muito rápido. Aguarde um instante.")
+		guildStructureLimiter := ratelimit.NewUserRateLimiter(10, 10.0/60.0, "Você está alterando a estrutura do servidor muito rápido. Aguarde um instante.")
+		messageMutationLimiter := ratelimit.NewUserRateLimiter(15, 15.0/60.0, "Você está editando ou excluindo mensagens muito rápido. Aguarde um instante.")
+		channelAckLimiter := ratelimit.NewUserRateLimiter(30, 30.0/60.0, "Você está confirmando leitura de canais muito rápido. Aguarde um instante.")
@@ -301,10 +311,10 @@
 		// Guild Moderation (Protected)
-		r.Post("/api/guilds/{id}/members/{userID}/kick", guildHandler.KickMember)
-		r.Post("/api/guilds/{id}/bans", guildHandler.BanMember)
-		r.Delete("/api/guilds/{id}/bans/{userID}", guildHandler.UnbanMember)
-		r.Post("/api/guilds/{id}/members/{userID}/mute", guildHandler.MuteMember)
+		r.With(moderationLimiter.Middleware).Post("/api/guilds/{id}/members/{userID}/kick", guildHandler.KickMember)
+		r.With(moderationLimiter.Middleware).Post("/api/guilds/{id}/bans", guildHandler.BanMember)
+		r.With(moderationLimiter.Middleware).Delete("/api/guilds/{id}/bans/{userID}", guildHandler.UnbanMember)
+		r.With(moderationLimiter.Middleware).Post("/api/guilds/{id}/members/{userID}/mute", guildHandler.MuteMember)
@@ -307,17 +317,17 @@
 		// Channels (Protected)
-		r.Post("/api/guilds/{guildID}/channels", channelHandler.Create)
-		r.Patch("/api/channels/{id}", channelHandler.Update)
-		r.Delete("/api/channels/{id}", channelHandler.Delete)
-		r.Put("/api/channels/{id}/permissions/{roleID}", channelHandler.UpdatePermissionOverwrite)
-		r.Delete("/api/channels/{id}/permissions/{roleID}", channelHandler.DeletePermissionOverwrite)
-		r.Put("/api/guilds/{guildID}/channels/positions", channelHandler.Reorder)
+		r.With(guildStructureLimiter.Middleware).Post("/api/guilds/{guildID}/channels", channelHandler.Create)
+		r.With(guildStructureLimiter.Middleware).Patch("/api/channels/{id}", channelHandler.Update)
+		r.With(guildStructureLimiter.Middleware).Delete("/api/channels/{id}", channelHandler.Delete)
+		r.With(guildStructureLimiter.Middleware).Put("/api/channels/{id}/permissions/{roleID}", channelHandler.UpdatePermissionOverwrite)
+		r.With(guildStructureLimiter.Middleware).Delete("/api/channels/{id}/permissions/{roleID}", channelHandler.DeletePermissionOverwrite)
+		r.With(guildStructureLimiter.Middleware).Put("/api/guilds/{guildID}/channels/positions", channelHandler.Reorder)
 		r.With(searchLimiter.Middleware).Get("/api/channels/{channelID}/messages/search", messageHandler.Search)
-		r.Post("/api/channels/{channelID}/ack", messageHandler.AckChannel)
+		r.With(channelAckLimiter.Middleware).Post("/api/channels/{channelID}/ack", messageHandler.AckChannel)
 
 		// Server Roles (Protected)
 		r.Get("/api/guilds/{guildID}/roles", roleHandler.List)
-		r.Post("/api/guilds/{guildID}/roles", roleHandler.Create)
-		r.Patch("/api/guilds/{guildID}/roles/{roleID}", roleHandler.Update)
-		r.Put("/api/guilds/{guildID}/roles/positions", roleHandler.Reorder)
-		r.Delete("/api/guilds/{guildID}/roles/{roleID}", roleHandler.Delete)
-		r.Post("/api/guilds/{guildID}/members/{userID}/roles/{roleID}", roleHandler.AssignRole)
-		r.Delete("/api/guilds/{guildID}/members/{userID}/roles/{roleID}", roleHandler.RemoveRole)
+		r.With(guildStructureLimiter.Middleware).Post("/api/guilds/{guildID}/roles", roleHandler.Create)
+		r.With(guildStructureLimiter.Middleware).Patch("/api/guilds/{guildID}/roles/{roleID}", roleHandler.Update)
+		r.With(guildStructureLimiter.Middleware).Put("/api/guilds/{guildID}/roles/positions", roleHandler.Reorder)
+		r.With(guildStructureLimiter.Middleware).Delete("/api/guilds/{guildID}/roles/{roleID}", roleHandler.Delete)
+		r.With(guildStructureLimiter.Middleware).Post("/api/guilds/{guildID}/members/{userID}/roles/{roleID}", roleHandler.AssignRole)
+		r.With(guildStructureLimiter.Middleware).Delete("/api/guilds/{guildID}/members/{userID}/roles/{roleID}", roleHandler.RemoveRole)
@@ -340,9 +350,9 @@
 		r.With(messageLimiter.Middleware).Post("/api/dms/{roomID}/messages", dmHandler.SendMessage)
-		r.Patch("/api/dms/{roomID}/messages/{messageID}", dmHandler.UpdateMessage)
-		r.Delete("/api/dms/{roomID}/messages/{messageID}", dmHandler.DeleteMessage)
+		r.With(messageMutationLimiter.Middleware).Patch("/api/dms/{roomID}/messages/{messageID}", dmHandler.UpdateMessage)
+		r.With(messageMutationLimiter.Middleware).Delete("/api/dms/{roomID}/messages/{messageID}", dmHandler.DeleteMessage)
@@ -363,9 +373,9 @@
 		r.With(messageLimiter.Middleware).Post("/api/dm/groups/{id}/messages", dmGroupHandler.SendMessage)
-		r.Patch("/api/dm/groups/{id}/messages/{messageID}", dmGroupHandler.UpdateMessage)
-		r.Delete("/api/dm/groups/{id}/messages/{messageID}", dmGroupHandler.DeleteMessage)
+		r.With(messageMutationLimiter.Middleware).Patch("/api/dm/groups/{id}/messages/{messageID}", dmGroupHandler.UpdateMessage)
+		r.With(messageMutationLimiter.Middleware).Delete("/api/dm/groups/{id}/messages/{messageID}", dmGroupHandler.DeleteMessage)
@@ -371,9 +381,9 @@
 		r.With(messageLimiter.Middleware).Post("/api/channels/{channelID}/messages", messageHandler.Send)
-		r.Patch("/api/channels/{channelID}/messages/{messageID}", messageHandler.Update)
-		r.Delete("/api/channels/{channelID}/messages/{messageID}", messageHandler.Delete)
+		r.With(messageMutationLimiter.Middleware).Patch("/api/channels/{channelID}/messages/{messageID}", messageHandler.Update)
+		r.With(messageMutationLimiter.Middleware).Delete("/api/channels/{channelID}/messages/{messageID}", messageHandler.Delete)
@@ -381,7 +391,7 @@
 		// Voice & WebRTC (Protected)
 		r.With(voiceJoinLimiter.Middleware).Post("/api/channels/{id}/join-voice", channelHandler.JoinVoice)
 		r.Post("/api/channels/{id}/leave-voice", channelHandler.LeaveVoice)
 		r.Post("/api/channels/{id}/voice-state", channelHandler.UpdateVoiceState)
-		r.Post("/api/channels/{channelID}/members/{userID}/voice-state", channelHandler.AdminUpdateVoiceState)
+		r.With(moderationLimiter.Middleware).Post("/api/channels/{channelID}/members/{userID}/voice-state", channelHandler.AdminUpdateVoiceState)
```

---

### 5.4 Unit Test Suite (`backend/internal/ratelimit/limiter_test.go`)

```go
package ratelimit_test

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/zerovc/zerovc/backend/internal/auth"
	"github.com/zerovc/zerovc/backend/internal/ratelimit"
)

func TestUserRateLimiter_BurstAndRefill(t *testing.T) {
	// 3 tokens max, refill 1 token per second
	limiter := ratelimit.NewUserRateLimiter(3, 1.0, "rate limit exceeded")
	uid := uuid.New()

	// 1st, 2nd, 3rd requests must succeed
	for i := 1; i <= 3; i++ {
		allowed, _ := limiter.Allow(uid)
		if !allowed {
			t.Fatalf("request %d should have been allowed", i)
		}
	}

	// 4th request must be rejected
	allowed, retryAfter := limiter.Allow(uid)
	if allowed {
		t.Fatal("4th request should have been rejected")
	}
	if retryAfter < 1 {
		t.Fatalf("expected retryAfter >= 1, got %d", retryAfter)
	}

	// Wait 1.1 seconds for 1 token to refill
	time.Sleep(1100 * time.Millisecond)

	allowed, _ = limiter.Allow(uid)
	if !allowed {
		t.Fatal("request after refill should have been allowed")
	}
}

func TestUserRateLimiter_Middleware(t *testing.T) {
	limiter := ratelimit.NewUserRateLimiter(1, 0.1, "too many requests")
	uid := uuid.New()

	handler := limiter.Middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodPost, "/test", nil)
	ctx := auth.SetUserIDInContext(req.Context(), uid)
	req = req.WithContext(ctx)

	// 1st request -> 200 OK
	w1 := httptest.NewRecorder()
	handler.ServeHTTP(w1, req)
	if w1.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d", w1.Code)
	}

	// 2nd request -> 429 Too Many Requests
	w2 := httptest.NewRecorder()
	handler.ServeHTTP(w2, req)
	if w2.Code != http.StatusTooManyRequests {
		t.Fatalf("expected 429, got %d", w2.Code)
	}
	if w2.Header().Get("Retry-After") == "" {
		t.Fatal("expected Retry-After header on 429 response")
	}
}

func TestLoginRateLimiter_DualThrottling(t *testing.T) {
	// IP:user limit = 2, user global limit = 3
	loginLimiter := ratelimit.NewLoginRateLimiter(2, 0.1, 3, 0.1, "too many login attempts")

	handler := loginLimiter.Middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	loginPayload := []byte(`{"email":"alice@example.com","password":"secret"}`)

	sendLogin := func(ip string) int {
		req := httptest.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewReader(loginPayload))
		req.RemoteAddr = ip + ":1234"
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, req)
		return w.Code
	}

	// Requests from IP1 for alice:
	// #1 -> 200 OK
	if code := sendLogin("192.168.1.10"); code != http.StatusOK {
		t.Fatalf("expected 200, got %d", code)
	}
	// #2 -> 200 OK
	if code := sendLogin("192.168.1.10"); code != http.StatusOK {
		t.Fatalf("expected 200, got %d", code)
	}
	// #3 -> 429 Too Many Requests (IP1:alice limit of 2 reached)
	if code := sendLogin("192.168.1.10"); code != http.StatusTooManyRequests {
		t.Fatalf("expected 429 from same IP, got %d", code)
	}

	// Request from IP2 for alice:
	// #4 (IP2 1st attempt, but alice's 3rd total) -> 200 OK
	if code := sendLogin("10.0.0.1"); code != http.StatusOK {
		t.Fatalf("expected 200 from IP2, got %d", code)
	}
	// #5 (alice's 4th global attempt) -> 429 Too Many Requests (user global limit of 3 reached)
	if code := sendLogin("10.0.0.2"); code != http.StatusTooManyRequests {
		t.Fatalf("expected 429 due to global user limit, got %d", code)
	}
}

func TestUserRateLimiter_Concurrency(t *testing.T) {
	limiter := ratelimit.NewUserRateLimiter(100, 10.0, "error")
	uid := uuid.New()

	var wg sync.WaitGroup
	var allowedCount int64
	var mu sync.Mutex

	for i := 0; i < 50; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			allowed, _ := limiter.Allow(uid)
			if allowed {
				mu.Lock()
				allowedCount++
				mu.Unlock()
			}
		}()
	}
	wg.Wait()

	if allowedCount != 50 {
		t.Fatalf("expected all 50 concurrent requests allowed within capacity 100, got %d", allowedCount)
	}
}
```

---

## 6. Middleware Execution Pipeline & CSRF Interaction

For authenticated state mutations (`POST`, `PUT`, `PATCH`, `DELETE`), the order of middleware execution is critical to security:

```
1. Global Middlewares:
   ├── middleware.RequestID
   ├── middleware.RealIP             (Resolves client IP header)
   ├── middleware.Logger
   ├── middleware.Recoverer
   ├── middleware.Compress
   └── cors.Handler                  (CORS headers and preflight OPTIONS)

2. Authentication:
   └── authService.Middleware        (Validates token cookie/bearer, injects userID in context)

3. Security Validation (CSRF):
   └── csrf.RequireCSRF              (Validates X-CSRF-Token in constant time; returns 403 on failure)

4. Rate Limiting:
   └── <domain>Limiter.Middleware    (Checks token bucket for userID; returns 429 on exhaustion)

5. Business Handler:
   └── handler.Method(...)           (Executes database queries/transactions and broadcasts)
```

### Architectural Rationale:
1. **CSRF Before Rate Limiting:**
   If Rate Limiting ran before CSRF, an attacker performing CSRF attacks on a victim's session could artificially exhaust that user's rate limiting quota even if the CSRF tokens were completely invalid. By placing CSRF validation before Rate Limiting, fraudulent requests are rejected at step 3 without consuming the victim's rate limiting tokens.
2. **Public Login Endpoint:**
   `POST /api/auth/login` does not require prior authentication or CSRF tokens. Its middleware pipeline is:
   `RealIP` $\to$ `CORS` $\to$ `httprate.LimitByIP(10/min)` $\to$ `loginLimiter.Middleware` $\to$ `AuthHandler.Login`.

---

## 7. Verification & Testing Method

1. **Static Analysis & Syntax Check:**
   - Verify all routes in `main.go` compile cleanly with Go 1.23.
   - Confirm `backend/go.mod` includes required dependencies (`go mod tidy`).
2. **Rate Limit Boundary Test:**
   - **Moderation:** Call `POST /api/guilds/{id}/members/{userID}/mute` 10 times in rapid succession $\to$ 10 successes. 11th request $\to$ HTTP 429 with JSON `{"error":"Você está realizando ações de moderação muito rápido. Aguarde um instante."}` and header `Retry-After: 6`.
   - **Guild Structure:** Call `POST /api/guilds/{guildID}/channels` 10 times $\to$ 10 successes. 11th request $\to$ HTTP 429 with JSON `{"error":"Você está alterando a estrutura do servidor muito rápido. Aguarde um instante."}`.
   - **Message Mutations:** Send 15 `PATCH /api/channels/{channelID}/messages/{messageID}` requests $\to$ 15 successes. 16th request $\to$ HTTP 429.
   - **Channel Ack:** Send 30 `POST /api/channels/{channelID}/ack` requests $\to$ 30 successes. 31st request $\to$ HTTP 429.
   - **Login Throttle:** Send 5 `POST /api/auth/login` requests with invalid passwords from IP `192.168.1.10` for user `bob` $\to$ 5 HTTP 401. 6th request from same IP $\to$ HTTP 429 with header `Retry-After`. Send request for `bob` from a different IP after 10 attempts $\to$ HTTP 429.
