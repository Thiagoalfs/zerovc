package ratelimit_test

import (
	"bytes"
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
	ctx := auth.ContextWithUserID(req.Context(), uid)
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

func TestKeyedRateLimiter_Basic(t *testing.T) {
	limiter := ratelimit.NewKeyedRateLimiter(2, 0.5, "rate limited")
	key := "test-key"

	allowed1, _ := limiter.Allow(key)
	allowed2, _ := limiter.Allow(key)
	allowed3, retryAfter := limiter.Allow(key)

	if !allowed1 || !allowed2 {
		t.Fatal("first two requests should be allowed")
	}
	if allowed3 {
		t.Fatal("third request should be rejected")
	}
	if retryAfter < 1 {
		t.Fatalf("expected retryAfter >= 1, got %d", retryAfter)
	}
}
