package ratelimit

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
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
	// 1. Per-(IP + identifier) throttle (or IP only if identifier is empty)
	key := "ip:" + clientIP
	if identifier != "" {
		key = "ip_user:" + clientIP + ":" + identifier
	}

	if allowed, retryAfter := l.ipUserLimiter.Allow(key); !allowed {
		return false, retryAfter
	}

	// 2. Global account throttle if identifier is provided
	if identifier != "" {
		if allowed, retryAfter := l.userLimiter.Allow("user:" + identifier); !allowed {
			l.ipUserLimiter.Refund(key)
			return false, retryAfter
		}
	}

	return true, 0
}

func cleanIP(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return ""
	}
	if host, _, err := net.SplitHostPort(s); err == nil {
		s = host
	}
	s = strings.Trim(s, "[]")
	parsed := net.ParseIP(s)
	if parsed == nil {
		return ""
	}
	return parsed.String()
}

func isTrustedProxyIP(ipStr string) bool {
	ip := net.ParseIP(ipStr)
	if ip == nil {
		return false
	}
	if cidrs := strings.TrimSpace(os.Getenv("TRUSTED_PROXY_CIDRS")); cidrs != "" {
		for _, entry := range strings.Split(cidrs, ",") {
			entry = strings.TrimSpace(entry)
			if entry == "" {
				continue
			}
			if strings.Contains(entry, "/") {
				if _, ipNet, err := net.ParseCIDR(entry); err == nil && ipNet.Contains(ip) {
					return true
				}
			} else if parsed := net.ParseIP(entry); parsed != nil && parsed.Equal(ip) {
				return true
			}
		}
	}
	return ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast()
}

// ExtractClientIP extracts the client IP address safely without trusting spoofable leftmost
// X-Forwarded-For values: proxy headers are only honored when RemoteAddr is a trusted proxy,
// and X-Forwarded-For is scanned right-to-left to return the rightmost untrusted IP.
func ExtractClientIP(r *http.Request) string {
	if r == nil {
		return ""
	}

	remoteIP := cleanIP(r.RemoteAddr)
	if remoteIP == "" {
		remoteIP = strings.TrimSpace(r.RemoteAddr)
	}

	if !isTrustedProxyIP(remoteIP) {
		return remoteIP
	}

	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		parts := strings.Split(xff, ",")
		var rightmostValid string
		for i := len(parts) - 1; i >= 0; i-- {
			ip := cleanIP(parts[i])
			if ip == "" {
				continue
			}
			if rightmostValid == "" {
				rightmostValid = ip
			}
			if !isTrustedProxyIP(ip) {
				return ip
			}
		}
		if xri := cleanIP(r.Header.Get("X-Real-IP")); xri != "" && !isTrustedProxyIP(xri) {
			return xri
		}
		if rightmostValid != "" {
			return rightmostValid
		}
	}

	if xri := cleanIP(r.Header.Get("X-Real-IP")); xri != "" {
		return xri
	}

	return remoteIP
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
