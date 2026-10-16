package handlers_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/zerovc/zerovc/backend/internal/auth"
	"github.com/zerovc/zerovc/backend/internal/handlers"
	"github.com/zerovc/zerovc/backend/internal/middleware"
	"github.com/zerovc/zerovc/backend/internal/models"
)

// =============================================================================
// TEST SUITE: E2EE Key Backup Wire Contracts, DTOs & Handler Validation
// =============================================================================

func TestE2EEBackup_DTO_Serialization(t *testing.T) {
	t.Run("UploadBackupRequest_EnvelopeFormat", func(t *testing.T) {
		reqJSON := `{
			"ciphertext": "aabbccddeeff00112233",
			"iv": "0102030405060708090a0b0c",
			"salt": "zerovc-e2ee-backup-salt-v1",
			"key_count": 42,
			"version": 1
		}`

		var req models.UploadBackupRequest
		if err := json.Unmarshal([]byte(reqJSON), &req); err != nil {
			t.Fatalf("Failed to deserialize UploadBackupRequest: %v", err)
		}

		if req.Ciphertext != "aabbccddeeff00112233" {
			t.Errorf("Expected ciphertext 'aabbccddeeff00112233', got '%s'", req.Ciphertext)
		}
		if req.IV != "0102030405060708090a0b0c" {
			t.Errorf("Expected IV '0102030405060708090a0b0c', got '%s'", req.IV)
		}
		if req.Salt != "zerovc-e2ee-backup-salt-v1" {
			t.Errorf("Expected salt 'zerovc-e2ee-backup-salt-v1', got '%s'", req.Salt)
		}
		if req.KeyCount != 42 {
			t.Errorf("Expected key_count 42, got %d", req.KeyCount)
		}
		if req.Version != 1 {
			t.Errorf("Expected version 1, got %d", req.Version)
		}
	})

	t.Run("UploadBackupRequest_LegacyBackupCiphertextAlias", func(t *testing.T) {
		reqJSON := `{
			"backup_ciphertext": "deadbeefcafebabe",
			"iv": "112233445566",
			"version": 2
		}`

		var req models.UploadBackupRequest
		if err := json.Unmarshal([]byte(reqJSON), &req); err != nil {
			t.Fatalf("Failed to deserialize UploadBackupRequest: %v", err)
		}

		if req.BackupCiphertext != "deadbeefcafebabe" {
			t.Errorf("Expected backup_ciphertext 'deadbeefcafebabe', got '%s'", req.BackupCiphertext)
		}
	})

	t.Run("UploadBackupRequest_MatrixKeyWrappingFormat", func(t *testing.T) {
		reqJSON := `{
			"backup_public_key": "pub-key-matrix-format",
			"wrapped_private_key": "wrapped-privkey-format",
			"version": 3
		}`

		var req models.UploadBackupRequest
		if err := json.Unmarshal([]byte(reqJSON), &req); err != nil {
			t.Fatalf("Failed to deserialize UploadBackupRequest: %v", err)
		}

		if req.BackupPublicKey != "pub-key-matrix-format" {
			t.Errorf("Expected backup_public_key 'pub-key-matrix-format', got '%s'", req.BackupPublicKey)
		}
		if req.WrappedPrivateKey != "wrapped-privkey-format" {
			t.Errorf("Expected wrapped_private_key 'wrapped-privkey-format', got '%s'", req.WrappedPrivateKey)
		}
	})

	t.Run("BackupResponse_Serialization", func(t *testing.T) {
		uid := uuid.New()
		now := time.Now()
		resp := models.BackupResponse{
			Backup: models.E2EEKeyBackup{
				UserID:     uid,
				Ciphertext: "01020304",
				IV:         "050607",
				Salt:       "test-salt",
				KeyCount:   10,
				Version:    1,
				CreatedAt:  now,
				UpdatedAt:  now,
			},
			Ciphertext: "01020304",
			IV:         "050607",
			Version:    1,
			Status:     "ok",
		}

		data, err := json.Marshal(resp)
		if err != nil {
			t.Fatalf("Failed to serialize BackupResponse: %v", err)
		}

		var decoded map[string]any
		if err := json.Unmarshal(data, &decoded); err != nil {
			t.Fatalf("Failed to unmarshal BackupResponse JSON: %v", err)
		}

		if decoded["status"] != "ok" {
			t.Errorf("Expected status 'ok', got %v", decoded["status"])
		}
		if decoded["ciphertext"] != "01020304" {
			t.Errorf("Expected root ciphertext '01020304', got %v", decoded["ciphertext"])
		}
		backupObj, ok := decoded["backup"].(map[string]any)
		if !ok {
			t.Fatalf("Expected backup object in JSON response")
		}
		if backupObj["ciphertext"] != "01020304" {
			t.Errorf("Expected nested backup ciphertext '01020304', got %v", backupObj["ciphertext"])
		}
	})
}

// =============================================================================
// TEST SUITE: HTTP Gating, Method Enforcement & Security Validation
// =============================================================================

func TestE2EEBackup_HTTP_Gating_Endpoints(t *testing.T) {
	handler := handlers.NewE2EEHandler(nil, nil)

	t.Run("UploadBackup_UnauthorizedWithoutAuthContext", func(t *testing.T) {
		r := chi.NewRouter()
		r.Post("/api/e2ee/backup", handler.UploadBackup)

		body := bytes.NewBufferString(`{"ciphertext":"abc","iv":"def"}`)
		req := httptest.NewRequest(http.MethodPost, "/api/e2ee/backup", body)
		rec := httptest.NewRecorder()

		r.ServeHTTP(rec, req)

		if rec.Code != http.StatusUnauthorized {
			t.Errorf("Expected HTTP 401 Unauthorized for unauthenticated upload, got %d", rec.Code)
		}
	})

	t.Run("UploadBackup_MethodNotAllowedOnGET", func(t *testing.T) {
		r := chi.NewRouter()
		r.HandleFunc("/api/e2ee/backup", handler.UploadBackup)

		req := httptest.NewRequest(http.MethodGet, "/api/e2ee/backup", nil)
		rec := httptest.NewRecorder()

		r.ServeHTTP(rec, req)

		if rec.Code != http.StatusMethodNotAllowed {
			t.Errorf("Expected HTTP 405 Method Not Allowed on GET for UploadBackup, got %d", rec.Code)
		}
	})

	t.Run("UploadBackup_InvalidJSONBody", func(t *testing.T) {
		r := chi.NewRouter()
		r.Post("/api/e2ee/backup", handler.UploadBackup)

		ctx := auth.ContextWithUserID(context.Background(), uuid.New())
		req := httptest.NewRequest(http.MethodPost, "/api/e2ee/backup", strings.NewReader("{invalid-json")).WithContext(ctx)
		rec := httptest.NewRecorder()

		r.ServeHTTP(rec, req)

		if rec.Code != http.StatusBadRequest {
			t.Errorf("Expected HTTP 400 Bad Request for malformed JSON, got %d", rec.Code)
		}
	})

	t.Run("UploadBackup_MissingBackupKeysAndCiphertext", func(t *testing.T) {
		r := chi.NewRouter()
		r.Post("/api/e2ee/backup", handler.UploadBackup)

		ctx := auth.ContextWithUserID(context.Background(), uuid.New())
		req := httptest.NewRequest(http.MethodPost, "/api/e2ee/backup", strings.NewReader(`{"version":1}`)).WithContext(ctx)
		rec := httptest.NewRecorder()

		r.ServeHTTP(rec, req)

		if rec.Code != http.StatusBadRequest {
			t.Errorf("Expected HTTP 400 Bad Request for missing keys/ciphertext, got %d", rec.Code)
		}
	})

	t.Run("GetBackup_UnauthorizedWithoutAuthContext", func(t *testing.T) {
		r := chi.NewRouter()
		r.Get("/api/e2ee/backup", handler.GetBackup)

		req := httptest.NewRequest(http.MethodGet, "/api/e2ee/backup", nil)
		rec := httptest.NewRecorder()

		r.ServeHTTP(rec, req)

		if rec.Code != http.StatusUnauthorized {
			t.Errorf("Expected HTTP 401 Unauthorized for unauthenticated get, got %d", rec.Code)
		}
	})

	t.Run("GetBackup_MethodNotAllowedOnPOST", func(t *testing.T) {
		r := chi.NewRouter()
		r.HandleFunc("/api/e2ee/backup", handler.GetBackup)

		req := httptest.NewRequest(http.MethodPost, "/api/e2ee/backup", nil)
		rec := httptest.NewRecorder()

		r.ServeHTTP(rec, req)

		if rec.Code != http.StatusMethodNotAllowed {
			t.Errorf("Expected HTTP 405 Method Not Allowed on POST for GetBackup, got %d", rec.Code)
		}
	})

	t.Run("DeleteBackup_UnauthorizedWithoutAuthContext", func(t *testing.T) {
		r := chi.NewRouter()
		r.Post("/api/e2ee/backup/delete", handler.DeleteBackup)

		req := httptest.NewRequest(http.MethodPost, "/api/e2ee/backup/delete", nil)
		rec := httptest.NewRecorder()

		r.ServeHTTP(rec, req)

		if rec.Code != http.StatusUnauthorized {
			t.Errorf("Expected HTTP 401 Unauthorized for unauthenticated delete, got %d", rec.Code)
		}
	})

	t.Run("DeleteBackup_MethodNotAllowedOnGET", func(t *testing.T) {
		r := chi.NewRouter()
		r.HandleFunc("/api/e2ee/backup/delete", handler.DeleteBackup)

		req := httptest.NewRequest(http.MethodGet, "/api/e2ee/backup/delete", nil)
		rec := httptest.NewRecorder()

		r.ServeHTTP(rec, req)

		if rec.Code != http.StatusMethodNotAllowed {
			t.Errorf("Expected HTTP 405 Method Not Allowed on GET for DeleteBackup, got %d", rec.Code)
		}
	})
}

// =============================================================================
// TEST SUITE: CSRF Protection on Backup State Mutations
// =============================================================================

func TestE2EEBackup_CSRF_Enforcement(t *testing.T) {
	csrfSvc := middleware.NewCSRFService("zerovc-m6-csrf-testing-secret-key-32b")
	userID := uuid.New()

	routes := []struct {
		method string
		path   string
	}{
		{http.MethodPost, "/api/e2ee/backup"},
		{http.MethodPost, "/api/e2ee/backup/delete"},
		{http.MethodDelete, "/api/e2ee/backup"},
	}

	for _, rt := range routes {
		t.Run("CSRF_Reject_MissingToken_"+rt.method+"_"+rt.path, func(t *testing.T) {
			var reachedHandler bool
			mockHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				reachedHandler = true
				w.WriteHeader(http.StatusOK)
				w.Write([]byte(`{"status":"ok"}`))
			})

			r := chi.NewRouter()
			r.Use(csrfSvc.RequireCSRF)
			if rt.method == http.MethodPost {
				r.Post(rt.path, mockHandler)
			} else {
				r.Delete(rt.path, mockHandler)
			}

			req := httptest.NewRequest(rt.method, rt.path, strings.NewReader(`{}`))
			ctx := auth.ContextWithUserID(req.Context(), userID)
			req = req.WithContext(ctx)

			rec := httptest.NewRecorder()
			r.ServeHTTP(rec, req)

			if reachedHandler {
				t.Fatalf("VULNERABILITY: Endpoint %s %s was executed without CSRF token!", rt.method, rt.path)
			}
			if rec.Code != http.StatusForbidden {
				t.Fatalf("Expected HTTP 403 Forbidden for missing CSRF on %s %s, got %d", rt.method, rt.path, rec.Code)
			}
		})

		t.Run("CSRF_Reject_ForgedToken_"+rt.method+"_"+rt.path, func(t *testing.T) {
			var reachedHandler bool
			mockHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				reachedHandler = true
				w.WriteHeader(http.StatusOK)
			})

			r := chi.NewRouter()
			r.Use(csrfSvc.RequireCSRF)
			if rt.method == http.MethodPost {
				r.Post(rt.path, mockHandler)
			} else {
				r.Delete(rt.path, mockHandler)
			}

			req := httptest.NewRequest(rt.method, rt.path, strings.NewReader(`{}`))
			ctx := auth.ContextWithUserID(req.Context(), userID)
			req = req.WithContext(ctx)
			req.Header.Set("X-CSRF-Token", "forged-csrf-token-attacker-payload")

			rec := httptest.NewRecorder()
			r.ServeHTTP(rec, req)

			if reachedHandler {
				t.Fatalf("VULNERABILITY: Endpoint %s %s was executed with forged CSRF token!", rt.method, rt.path)
			}
			if rec.Code != http.StatusForbidden {
				t.Fatalf("Expected HTTP 403 Forbidden for forged CSRF on %s %s, got %d", rt.method, rt.path, rec.Code)
			}
		})

		t.Run("CSRF_Accept_ValidToken_"+rt.method+"_"+rt.path, func(t *testing.T) {
			validToken, err := csrfSvc.GenerateToken(userID)
			if err != nil {
				t.Fatalf("Failed to generate test CSRF token: %v", err)
			}

			var reachedHandler bool
			mockHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				reachedHandler = true
				w.WriteHeader(http.StatusOK)
				w.Write([]byte(`{"status":"ok"}`))
			})

			r := chi.NewRouter()
			r.Use(csrfSvc.RequireCSRF)
			if rt.method == http.MethodPost {
				r.Post(rt.path, mockHandler)
			} else {
				r.Delete(rt.path, mockHandler)
			}

			req := httptest.NewRequest(rt.method, rt.path, strings.NewReader(`{}`))
			ctx := auth.ContextWithUserID(req.Context(), userID)
			req = req.WithContext(ctx)
			req.Header.Set("X-CSRF-Token", validToken)
			req.AddCookie(&http.Cookie{
				Name:  "csrf_token",
				Value: validToken,
			})

			rec := httptest.NewRecorder()
			r.ServeHTTP(rec, req)

			if !reachedHandler {
				t.Fatalf("Expected valid CSRF token to allow request on %s %s, but handler was not reached (status %d)", rt.method, rt.path, rec.Code)
			}
			if rec.Code != http.StatusOK {
				t.Fatalf("Expected HTTP 200 OK with valid CSRF token on %s %s, got %d", rt.method, rt.path, rec.Code)
			}
		})
	}
}
