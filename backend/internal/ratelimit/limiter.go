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

// Refund adds a token back to the user's bucket if a downstream check failed.
func (l *UserRateLimiter) Refund(userID uuid.UUID) {
	l.mu.Lock()
	defer l.mu.Unlock()

	if b, exists := l.buckets[userID]; exists {
		b.tokens += 1.0
		if b.tokens > b.maxTokens {
			b.tokens = b.maxTokens
		}
	}
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

// Refund adds a token back to the bucket if a downstream check failed.
func (l *KeyedRateLimiter) Refund(key string) {
	l.mu.Lock()
	defer l.mu.Unlock()

	if b, exists := l.buckets[key]; exists {
		b.tokens += 1.0
		if b.tokens > b.maxTokens {
			b.tokens = b.maxTokens
		}
	}
}

