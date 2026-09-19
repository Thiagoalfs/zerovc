package middleware_test

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

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

// Test 6: Malformed CSRF token fails with 403
func TestMalformedCSRFTokenFails(t *testing.T) {
	csrfSvc, _, _ := setupTestService()
	userID := uuid.New()

	handler := csrfSvc.RequireCSRF(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("handler should not have been called on malformed token")
	}))

	malformedTokens := []string{
		"not-a-token",
		"part1.part2",
		"invalidhex.123456789.signature",
		fmt.Sprintf("%s.notanumber.sig", strings.Repeat("a", 32)),
	}

	for _, token := range malformedTokens {
		req := httptest.NewRequest(http.MethodPost, "/api/guilds", nil)
		ctx := auth.ContextWithUserID(req.Context(), userID)
		req = req.WithContext(ctx)
		req.Header.Set("X-CSRF-Token", token)

		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusForbidden {
			t.Errorf("expected 403 for malformed token %q, got %d", token, rec.Code)
		}
	}
}

// Test 7: Cookie Helpers
func TestCookieHelpers(t *testing.T) {
	csrfSvc, _, _ := setupTestService()
	rec := httptest.NewRecorder()

	csrfSvc.SetCookie(rec, "sample-token", false)
	cookies := rec.Result().Cookies()
	var found bool
	for _, c := range cookies {
		if c.Name == "csrf_token" && c.Value == "sample-token" && !c.HttpOnly {
			found = true
			break
		}
	}
	if !found {
		t.Fatal("csrf_token cookie was not set correctly")
	}

	// Test ClearCookie
	rec2 := httptest.NewRecorder()
	csrfSvc.ClearCookie(rec2)
	cookies2 := rec2.Result().Cookies()
	foundCleared := false
	for _, c := range cookies2 {
		if c.Name == "csrf_token" && c.MaxAge < 0 {
			foundCleared = true
			break
		}
	}
	if !foundCleared {
		t.Fatal("csrf_token cookie was not cleared correctly")
	}
}
