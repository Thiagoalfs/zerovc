package handlers_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/zerovc/zerovc/backend/internal/auth"
	"github.com/zerovc/zerovc/backend/internal/middleware"
)

func setupProtocolTestEnv() (*middleware.CSRFService, *auth.Service, string) {
	secret := "test-protocol-secret-key-32-bytes-long!"
	csrfSvc := middleware.NewCSRFService(secret)
	authSvc := auth.NewService(secret)
	return csrfSvc, authSvc, secret
}

// =============================================================================
// CHALLENGE 1: Adversarial Version Gating Matrix (RequireE2EEClientVersion)
// =============================================================================

func TestChallenge_E2EEVersion_AdversarialMatrix(t *testing.T) {
	minVersion := 1
	versionMW := middleware.RequireE2EEClientVersion(minVersion)

	var downstreamExecuted bool
	targetHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		downstreamExecuted = true
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"ok"}`))
	})
	wrapped := versionMW(targetHandler)

	rejectionCases := []struct {
		name        string
		headerVal   string
		expect426   bool
		description string
	}{
		{"Missing Header", "", true, "Empty header must be rejected"},
		{"Version 0", "0", true, "Version 0 is legacy / unsupported"},
		{"Negative Version -1", "-1", true, "Negative version must be rejected"},
		{"Negative Version -999", "-999", true, "Arbitrary negative version must be rejected"},
		{"Alpha string 'v1'", "v1", true, "Non-integer prefix must be rejected"},
		{"Floating point '1.0'", "1.0", true, "Float string must be rejected"},
		{"Floating point '1.5'", "1.5", true, "Float string must be rejected"},
		{"Whitespace only '   '", "   ", true, "Whitespace must be rejected"},
		{"Null keyword 'null'", "null", true, "Keyword null must be rejected"},
		{"NaN keyword 'NaN'", "NaN", true, "Keyword NaN must be rejected"},
		{"Boolean 'true'", "true", true, "Boolean must be rejected"},
		{"JSON object '{}'", "{}", true, "JSON payload must be rejected"},
		{"SQL injection '1; DROP TABLE'", "1; DROP TABLE", true, "SQL injection must be rejected"},
		{"Integer overflow", "99999999999999999999999999999999999999999999999", true, "Int overflow must return 426"},
	}

	for _, tc := range rejectionCases {
		t.Run(tc.name, func(t *testing.T) {
			downstreamExecuted = false
			req := httptest.NewRequest(http.MethodPost, "/api/e2ee/devices", strings.NewReader(`{}`))
			if tc.headerVal != "" {
				req.Header.Set("X-Client-E2EE-Version", tc.headerVal)
			}

			rec := httptest.NewRecorder()
			wrapped.ServeHTTP(rec, req)

			if downstreamExecuted {
				t.Fatalf("CRITICAL SECURITY VULNERABILITY: Downstream handler reached for invalid version %q (%s)", tc.headerVal, tc.description)
			}

			if rec.Code != http.StatusUpgradeRequired {
				t.Fatalf("Expected HTTP 426 Upgrade Required for %q, got %d", tc.headerVal, rec.Code)
			}

			if ct := rec.Header().Get("Content-Type"); !strings.Contains(ct, "application/json") {
				t.Errorf("Expected Content-Type application/json, got %q", ct)
			}

			var body map[string]any
			if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
				t.Fatalf("Failed to parse 426 error response JSON: %v", err)
			}

			if body["error"] != "e2ee_client_outdated" {
				t.Errorf("Expected error 'e2ee_client_outdated', got %v", body["error"])
			}

			minVerVal, ok := body["min_version"].(float64)
			if !ok || int(minVerVal) != minVersion {
				t.Errorf("Expected min_version %d in error response, got %v", minVersion, body["min_version"])
			}
		})
	}

	// Accepted versions matrix
	acceptanceCases := []struct {
		name      string
		headerVal string
	}{
		{"Exact minimum version 1", "1"},
		{"Higher version 2", "2"},
		{"Future version 10", "10"},
	}

	for _, tc := range acceptanceCases {
		t.Run(tc.name, func(t *testing.T) {
			downstreamExecuted = false
			req := httptest.NewRequest(http.MethodPost, "/api/e2ee/devices", strings.NewReader(`{}`))
			req.Header.Set("X-Client-E2EE-Version", tc.headerVal)

			rec := httptest.NewRecorder()
			wrapped.ServeHTTP(rec, req)

			if !downstreamExecuted {
				t.Fatalf("Expected downstream handler to execute for valid version %q", tc.headerVal)
			}
			if rec.Code != http.StatusOK {
				t.Fatalf("Expected HTTP 200 for valid version %q, got %d", tc.headerVal, rec.Code)
			}
		})
	}
}

// =============================================================================
// CHALLENGE 2: CSRF Enforcement on All E2EE Mutation Routes
// =============================================================================

func TestChallenge_E2EE_MutationRoutes_CSRFEnforcement(t *testing.T) {
	csrfSvc, _, _ := setupProtocolTestEnv()
	userID := uuid.New()
	attackerID := uuid.New()

	validToken, err := csrfSvc.GenerateToken(userID)
	if err != nil {
		t.Fatalf("GenerateToken failed: %v", err)
	}

	attackerToken, err := csrfSvc.GenerateToken(attackerID)
	if err != nil {
		t.Fatalf("GenerateToken failed for attacker: %v", err)
	}

	// All 10 E2EE state mutation routes
	mutationRoutes := []string{
		"/api/e2ee/identities",
		"/api/e2ee/devices",
		"/api/e2ee/devices/3b7543fa-09df-41c3-8a07-846174a74287/revoke",
		"/api/e2ee/devices/3b7543fa-09df-41c3-8a07-846174a74287/keys",
		"/api/e2ee/devices/keys/claim",
		"/api/e2ee/to-device",
		"/api/e2ee/to-device/ack",
		"/api/e2ee/rosters",
		"/api/e2ee/backup",
		"/api/e2ee/backup/delete",
	}

	for _, route := range mutationRoutes {
		t.Run("Route:"+route, func(t *testing.T) {
			var downstreamCalled bool
			mockHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				downstreamCalled = true
				w.WriteHeader(http.StatusOK)
				w.Write([]byte(`{"success":true}`))
			})

			r := chi.NewRouter()
			r.Use(csrfSvc.RequireCSRF)
			r.Post(route, mockHandler)

			// 1. Attack Scenario A: Missing CSRF Header
			{
				downstreamCalled = false
				req := httptest.NewRequest(http.MethodPost, route, strings.NewReader(`{}`))
				ctx := auth.ContextWithUserID(req.Context(), userID)
				req = req.WithContext(ctx)

				rec := httptest.NewRecorder()
				r.ServeHTTP(rec, req)

				if downstreamCalled {
					t.Fatalf("VULNERABILITY: Mutation route %s executed without CSRF header!", route)
				}
				if rec.Code != http.StatusForbidden {
					t.Fatalf("Expected HTTP 403 Forbidden for missing CSRF on %s, got %d", route, rec.Code)
				}
			}

			// 2. Attack Scenario B: Malformed CSRF Header
			{
				downstreamCalled = false
				req := httptest.NewRequest(http.MethodPost, route, strings.NewReader(`{}`))
				ctx := auth.ContextWithUserID(req.Context(), userID)
				req = req.WithContext(ctx)
				req.Header.Set("X-CSRF-Token", "malformed.token.value")

				rec := httptest.NewRecorder()
				r.ServeHTTP(rec, req)

				if downstreamCalled {
					t.Fatalf("VULNERABILITY: Mutation route %s executed with malformed CSRF token!", route)
				}
				if rec.Code != http.StatusForbidden {
					t.Fatalf("Expected HTTP 403 Forbidden for malformed CSRF on %s, got %d", route, rec.Code)
				}
			}

			// 3. Attack Scenario C: Attacker Token Transplantation (Attacker Token on Victim Session)
			{
				downstreamCalled = false
				req := httptest.NewRequest(http.MethodPost, route, strings.NewReader(`{}`))
				ctx := auth.ContextWithUserID(req.Context(), userID) // Victim user
				req = req.WithContext(ctx)
				req.Header.Set("X-CSRF-Token", attackerToken) // Attacker token

				rec := httptest.NewRecorder()
				r.ServeHTTP(rec, req)

				if downstreamCalled {
					t.Fatalf("CRITICAL VULNERABILITY: Mutation route %s accepted cross-user transplanted CSRF token!", route)
				}
				if rec.Code != http.StatusForbidden {
					t.Fatalf("Expected HTTP 403 Forbidden for cross-user CSRF on %s, got %d", route, rec.Code)
				}
			}

			// 4. Attack Scenario D: Double-Submit Mismatch (Cookie != Header)
			{
				downstreamCalled = false
				req := httptest.NewRequest(http.MethodPost, route, strings.NewReader(`{}`))
				ctx := auth.ContextWithUserID(req.Context(), userID)
				req = req.WithContext(ctx)
				req.Header.Set("X-CSRF-Token", validToken)
				req.AddCookie(&http.Cookie{Name: "csrf_token", Value: attackerToken})

				rec := httptest.NewRecorder()
				r.ServeHTTP(rec, req)

				if downstreamCalled {
					t.Fatalf("VULNERABILITY: Mutation route %s accepted mismatched cookie/header CSRF!", route)
				}
				if rec.Code != http.StatusForbidden {
					t.Fatalf("Expected HTTP 403 Forbidden for mismatched cookie/header on %s, got %d", route, rec.Code)
				}
			}

			// 5. Legitimate Request: Valid CSRF Header + Valid Cookie
			{
				downstreamCalled = false
				req := httptest.NewRequest(http.MethodPost, route, strings.NewReader(`{}`))
				ctx := auth.ContextWithUserID(req.Context(), userID)
				req = req.WithContext(ctx)
				req.Header.Set("X-CSRF-Token", validToken)
				req.AddCookie(&http.Cookie{Name: "csrf_token", Value: validToken})

				rec := httptest.NewRecorder()
				r.ServeHTTP(rec, req)

				if !downstreamCalled {
					t.Fatalf("Legitimate CSRF token was rejected on mutation route %s", route)
				}
				if rec.Code != http.StatusOK {
					t.Fatalf("Expected HTTP 200 OK for valid CSRF on %s, got %d", route, rec.Code)
				}
			}
		})
	}
}

// =============================================================================
// CHALLENGE 3: Read-Only E2EE Routes Bypass CSRF Check
// =============================================================================

func TestChallenge_E2EE_ReadOnlyRoutes_BypassCSRF(t *testing.T) {
	csrfSvc, _, _ := setupProtocolTestEnv()
	userID := uuid.New()

	readOnlyRoutes := []string{
		"/api/e2ee/identities/" + userID.String(),
		"/api/e2ee/users/" + userID.String() + "/devices",
		"/api/e2ee/to-device",
		"/api/e2ee/rosters/3b7543fa-09df-41c3-8a07-846174a74287",
		"/api/e2ee/backup",
		"/api/e2ee/config",
	}

	for _, route := range readOnlyRoutes {
		t.Run("GET:"+route, func(t *testing.T) {
			var downstreamCalled bool
			mockHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				downstreamCalled = true
				w.WriteHeader(http.StatusOK)
				w.Write([]byte(`{"read":true}`))
			})

			r := chi.NewRouter()
			r.Use(csrfSvc.RequireCSRF)
			r.Get(route, mockHandler)

			// GET request with NO CSRF token must SUCCEED (RFC 7231 safe method)
			req := httptest.NewRequest(http.MethodGet, route, nil)
			ctx := auth.ContextWithUserID(req.Context(), userID)
			req = req.WithContext(ctx)

			rec := httptest.NewRecorder()
			r.ServeHTTP(rec, req)

			if !downstreamCalled {
				t.Fatalf("Safe GET method on %s was blocked by CSRF!", route)
			}
			if rec.Code != http.StatusOK {
				t.Fatalf("Expected HTTP 200 for safe GET on %s without CSRF token, got %d", route, rec.Code)
			}
		})
	}
}

// =============================================================================
// CHALLENGE 4: Integrated Middleware Pipeline Verification (Auth + CSRF + E2EE Version)
// =============================================================================

func TestChallenge_IntegratedMiddlewarePipeline(t *testing.T) {
	csrfSvc, _, _ := setupProtocolTestEnv()
	userID := uuid.New()

	validCSRF, _ := csrfSvc.GenerateToken(userID)

	var downstreamReached bool
	mockTarget := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		downstreamReached = true
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"success":true}`))
	})

	// Build exact production pipeline sequence:
	// 1. Auth middleware mock (injects userID if authenticated)
	// 2. CSRF middleware (RequireCSRF)
	// 3. E2EE Version middleware (RequireE2EEClientVersion)
	r := chi.NewRouter()
	r.Group(func(r chi.Router) {
		// Mock auth
		r.Use(func(next http.Handler) http.Handler {
			return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.Header.Get("X-Mock-Unauthenticated") == "true" {
					http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
					return
				}
				ctx := auth.ContextWithUserID(r.Context(), userID)
				next.ServeHTTP(w, r.WithContext(ctx))
			})
		})
		r.Use(csrfSvc.RequireCSRF)

		r.Group(func(r chi.Router) {
			r.Use(middleware.RequireE2EEClientVersion(1))
			r.Post("/api/e2ee/devices", mockTarget)
		})
	})

	scenarios := []struct {
		name             string
		unauthenticated  bool
		csrfToken        string
		e2eeVersion      string
		expectedStatus   int
		expectedDown     bool
		expectedErrorMsg string
	}{
		{
			name:             "Unauthenticated -> 401 Unauthorized",
			unauthenticated:  true,
			csrfToken:        validCSRF,
			e2eeVersion:      "1",
			expectedStatus:   http.StatusUnauthorized,
			expectedDown:     false,
			expectedErrorMsg: "unauthorized",
		},
		{
			name:             "Authenticated + No CSRF + Valid Version -> 403 Forbidden (CSRF blocks first)",
			unauthenticated:  false,
			csrfToken:        "",
			e2eeVersion:      "1",
			expectedStatus:   http.StatusForbidden,
			expectedDown:     false,
			expectedErrorMsg: "CSRF token missing or invalid",
		},
		{
			name:             "Authenticated + Invalid CSRF + Valid Version -> 403 Forbidden",
			unauthenticated:  false,
			csrfToken:        "invalid-csrf",
			e2eeVersion:      "1",
			expectedStatus:   http.StatusForbidden,
			expectedDown:     false,
			expectedErrorMsg: "CSRF token missing or invalid",
		},
		{
			name:             "Authenticated + Valid CSRF + No E2EE Version -> 426 Upgrade Required (Version blocks)",
			unauthenticated:  false,
			csrfToken:        validCSRF,
			e2eeVersion:      "",
			expectedStatus:   http.StatusUpgradeRequired,
			expectedDown:     false,
			expectedErrorMsg: "e2ee_client_outdated",
		},
		{
			name:             "Authenticated + Valid CSRF + E2EE Version 0 -> 426 Upgrade Required",
			unauthenticated:  false,
			csrfToken:        validCSRF,
			e2eeVersion:      "0",
			expectedStatus:   http.StatusUpgradeRequired,
			expectedDown:     false,
			expectedErrorMsg: "e2ee_client_outdated",
		},
		{
			name:             "Authenticated + Valid CSRF + Malformed E2EE Version -> 426 Upgrade Required",
			unauthenticated:  false,
			csrfToken:        validCSRF,
			e2eeVersion:      "v1-beta",
			expectedStatus:   http.StatusUpgradeRequired,
			expectedDown:     false,
			expectedErrorMsg: "e2ee_client_outdated",
		},
		{
			name:             "Authenticated + Valid CSRF + Valid E2EE Version 1 -> 200 OK (Passes all gates)",
			unauthenticated:  false,
			csrfToken:        validCSRF,
			e2eeVersion:      "1",
			expectedStatus:   http.StatusOK,
			expectedDown:     true,
			expectedErrorMsg: "",
		},
		{
			name:             "Authenticated + Valid CSRF + Future E2EE Version 2 -> 200 OK (Passes all gates)",
			unauthenticated:  false,
			csrfToken:        validCSRF,
			e2eeVersion:      "2",
			expectedStatus:   http.StatusOK,
			expectedDown:     true,
			expectedErrorMsg: "",
		},
	}

	for _, sc := range scenarios {
		t.Run(sc.name, func(t *testing.T) {
			downstreamReached = false
			req := httptest.NewRequest(http.MethodPost, "/api/e2ee/devices", strings.NewReader(`{}`))
			if sc.unauthenticated {
				req.Header.Set("X-Mock-Unauthenticated", "true")
			}
			if sc.csrfToken != "" {
				req.Header.Set("X-CSRF-Token", sc.csrfToken)
				req.AddCookie(&http.Cookie{Name: "csrf_token", Value: sc.csrfToken})
			}
			if sc.e2eeVersion != "" {
				req.Header.Set("X-Client-E2EE-Version", sc.e2eeVersion)
			}

			rec := httptest.NewRecorder()
			r.ServeHTTP(rec, req)

			if downstreamReached != sc.expectedDown {
				t.Fatalf("downstreamReached=%v, expected=%v", downstreamReached, sc.expectedDown)
			}
			if rec.Code != sc.expectedStatus {
				t.Fatalf("Expected HTTP status %d, got %d (body: %s)", sc.expectedStatus, rec.Code, rec.Body.String())
			}
			if sc.expectedErrorMsg != "" && !strings.Contains(rec.Body.String(), sc.expectedErrorMsg) {
				t.Fatalf("Expected body to contain %q, got %s", sc.expectedErrorMsg, rec.Body.String())
			}
		})
	}
}
