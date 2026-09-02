package ratelimit

import (
	"net/http"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/zerovc/zerovc/backend/internal/auth"
)

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

func NewUserRateLimiter(maxTokens float64, refillRate float64, errorMsg string) *UserRateLimiter {
	limiter := &UserRateLimiter{
		buckets:    make(map[uuid.UUID]*userBucket),
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

func (l *UserRateLimiter) Allow(userID uuid.UUID) bool {
	l.mu.Lock()
	defer l.mu.Unlock()

	now := time.Now()
	b, exists := l.buckets[userID]
	if !exists {
		l.buckets[userID] = &userBucket{
			tokens:     l.maxTokens - 1,
			maxTokens:  l.maxTokens,
			refillRate: l.refillRate,
			lastRefill: now,
		}
		return true
	}

	// Refill tokens
	elapsed := now.Sub(b.lastRefill).Seconds()
	b.tokens += elapsed * b.refillRate
	if b.tokens > b.maxTokens {
		b.tokens = b.maxTokens
	}
	b.lastRefill = now

	if b.tokens >= 1.0 {
		b.tokens -= 1.0
		return true
	}

	return false
}

func (l *UserRateLimiter) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		userID, ok := auth.GetUserIDFromContext(r.Context())
		if !ok {
			next.ServeHTTP(w, r)
			return
		}

		if !l.Allow(userID) {
			http.Error(w, {"error":"+l.errorMsg+"}, http.StatusTooManyRequests)
			return
		}

		next.ServeHTTP(w, r)
	})
}
