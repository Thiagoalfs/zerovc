package handlers_test

import (
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
	"github.com/zerovc/zerovc/backend/internal/models"
)

// =============================================================================
// TEST SUITE: E2EE Room Keys Serialization, DTOs & Handler Validation
// =============================================================================

func TestE2EERoomKeys_DTO_Serialization(t *testing.T) {
	t.Run("SaveRoomKeyRequest_Serialization", func(t *testing.T) {
		convID := uuid.New()
		reqJSON := `{
			"conversation_type": "dm",
			"conversation_id": "` + convID.String() + `",
			"session_id": "session-12345",
			"session_key": "opaque-megolm-key-bytes",
			"sender_device_id": "device-uuid-abc",
			"epoch": 2
		}`

		var req models.SaveRoomKeyRequest
		if err := json.Unmarshal([]byte(reqJSON), &req); err != nil {
			t.Fatalf("Failed to deserialize SaveRoomKeyRequest: %v", err)
		}

		if req.ConversationType != "dm" {
			t.Errorf("Expected conversation_type 'dm', got '%s'", req.ConversationType)
		}
		if req.ConversationID != convID {
			t.Errorf("Expected conversation_id %s, got %s", convID, req.ConversationID)
		}
		if req.SessionID != "session-12345" {
			t.Errorf("Expected session_id 'session-12345', got '%s'", req.SessionID)
		}
		if req.SessionKey != "opaque-megolm-key-bytes" {
			t.Errorf("Expected session_key 'opaque-megolm-key-bytes', got '%s'", req.SessionKey)
		}
		if req.SenderDeviceID != "device-uuid-abc" {
			t.Errorf("Expected sender_device_id 'device-uuid-abc', got '%s'", req.SenderDeviceID)
		}
		if req.Epoch != 2 {
			t.Errorf("Expected epoch 2, got %d", req.Epoch)
		}
	})

	t.Run("E2EERoomKeyResponse_Serialization", func(t *testing.T) {
		keyID := uuid.New()
		convID := uuid.New()
		creatorID := uuid.New()
		now := time.Now().UTC().Truncate(time.Second)

		resp := models.E2EERoomKeyResponse{
			ID:               keyID,
			ConversationType: "channel",
			ConversationID:   convID,
			SessionID:        "session-67890",
			SessionKey:       "secret-room-key-payload",
			SenderDeviceID:   "device-sender-xyz",
			Epoch:            3,
			CreatedBy:        creatorID,
			CreatedAt:        now,
		}

		bytes, err := json.Marshal(resp)
		if err != nil {
			t.Fatalf("Failed to serialize E2EERoomKeyResponse: %v", err)
		}

		var parsed map[string]any
		if err := json.Unmarshal(bytes, &parsed); err != nil {
			t.Fatalf("Failed to unmarshal JSON: %v", err)
		}

		if parsed["id"] != keyID.String() {
			t.Errorf("id mismatch: expected %s, got %v", keyID, parsed["id"])
		}
		if parsed["conversation_type"] != "channel" {
			t.Errorf("conversation_type mismatch: expected 'channel', got %v", parsed["conversation_type"])
		}
		if parsed["conversation_id"] != convID.String() {
			t.Errorf("conversation_id mismatch: expected %s, got %v", convID, parsed["conversation_id"])
		}
		if parsed["session_id"] != "session-67890" {
			t.Errorf("session_id mismatch: expected 'session-67890', got %v", parsed["session_id"])
		}
		if parsed["session_key"] != "secret-room-key-payload" {
			t.Errorf("session_key mismatch: expected 'secret-room-key-payload', got %v", parsed["session_key"])
		}
		if parsed["sender_device_id"] != "device-sender-xyz" {
			t.Errorf("sender_device_id mismatch: expected 'device-sender-xyz', got %v", parsed["sender_device_id"])
		}
		if parsed["epoch"] != float64(3) {
			t.Errorf("epoch mismatch: expected 3, got %v", parsed["epoch"])
		}
		if parsed["created_by"] != creatorID.String() {
			t.Errorf("created_by mismatch: expected %s, got %v", creatorID, parsed["created_by"])
		}
	})
}

func TestE2EERoomKeys_HandlerValidation(t *testing.T) {
	handler := handlers.NewE2EEHandler(nil, nil)

	t.Run("SaveRoomKey_MethodNotAllowedOnGET", func(t *testing.T) {
		r := chi.NewRouter()
		r.HandleFunc("/api/e2ee/room-keys", handler.SaveRoomKey)

		req := httptest.NewRequest(http.MethodGet, "/api/e2ee/room-keys", nil)
		rec := httptest.NewRecorder()

		r.ServeHTTP(rec, req)

		if rec.Code != http.StatusMethodNotAllowed {
			t.Errorf("Expected HTTP 405 Method Not Allowed on GET, got %d", rec.Code)
		}
	})

	t.Run("SaveRoomKey_UnauthorizedWithoutAuthContext", func(t *testing.T) {
		r := chi.NewRouter()
		r.Post("/api/e2ee/room-keys", handler.SaveRoomKey)

		req := httptest.NewRequest(http.MethodPost, "/api/e2ee/room-keys", strings.NewReader(`{}`))
		rec := httptest.NewRecorder()

		r.ServeHTTP(rec, req)

		if rec.Code != http.StatusUnauthorized {
			t.Errorf("Expected HTTP 401 Unauthorized, got %d", rec.Code)
		}
	})

	t.Run("SaveRoomKey_MalformedJSON", func(t *testing.T) {
		r := chi.NewRouter()
		r.Post("/api/e2ee/room-keys", handler.SaveRoomKey)

		ctx := auth.ContextWithUserID(context.Background(), uuid.New())
		req := httptest.NewRequest(http.MethodPost, "/api/e2ee/room-keys", strings.NewReader("{invalid-json")).WithContext(ctx)
		rec := httptest.NewRecorder()

		r.ServeHTTP(rec, req)

		if rec.Code != http.StatusBadRequest {
			t.Errorf("Expected HTTP 400 Bad Request for malformed JSON, got %d", rec.Code)
		}
	})

	t.Run("SaveRoomKey_InvalidConversationType", func(t *testing.T) {
		r := chi.NewRouter()
		r.Post("/api/e2ee/room-keys", handler.SaveRoomKey)

		ctx := auth.ContextWithUserID(context.Background(), uuid.New())
		body := `{"conversation_type":"invalid_type","conversation_id":"` + uuid.New().String() + `","session_id":"s1","session_key":"k1"}`
		req := httptest.NewRequest(http.MethodPost, "/api/e2ee/room-keys", strings.NewReader(body)).WithContext(ctx)
		rec := httptest.NewRecorder()

		r.ServeHTTP(rec, req)

		if rec.Code != http.StatusBadRequest {
			t.Errorf("Expected HTTP 400 Bad Request for invalid conversation_type, got %d", rec.Code)
		}
	})

	t.Run("SaveRoomKey_MissingRequiredFields", func(t *testing.T) {
		r := chi.NewRouter()
		r.Post("/api/e2ee/room-keys", handler.SaveRoomKey)

		ctx := auth.ContextWithUserID(context.Background(), uuid.New())
		body := `{"conversation_type":"dm","conversation_id":"00000000-0000-0000-0000-000000000000","session_id":"","session_key":""}`
		req := httptest.NewRequest(http.MethodPost, "/api/e2ee/room-keys", strings.NewReader(body)).WithContext(ctx)
		rec := httptest.NewRecorder()

		r.ServeHTTP(rec, req)

		if rec.Code != http.StatusBadRequest {
			t.Errorf("Expected HTTP 400 Bad Request for missing required fields, got %d", rec.Code)
		}
	})

	t.Run("GetMyRoomKeys_MethodNotAllowedOnPOST", func(t *testing.T) {
		r := chi.NewRouter()
		r.HandleFunc("/api/e2ee/my-room-keys", handler.GetMyRoomKeys)

		req := httptest.NewRequest(http.MethodPost, "/api/e2ee/my-room-keys", nil)
		rec := httptest.NewRecorder()

		r.ServeHTTP(rec, req)

		if rec.Code != http.StatusMethodNotAllowed {
			t.Errorf("Expected HTTP 405 Method Not Allowed on POST, got %d", rec.Code)
		}
	})

	t.Run("GetMyRoomKeys_UnauthorizedWithoutAuthContext", func(t *testing.T) {
		r := chi.NewRouter()
		r.Get("/api/e2ee/my-room-keys", handler.GetMyRoomKeys)

		req := httptest.NewRequest(http.MethodGet, "/api/e2ee/my-room-keys", nil)
		rec := httptest.NewRecorder()

		r.ServeHTTP(rec, req)

		if rec.Code != http.StatusUnauthorized {
			t.Errorf("Expected HTTP 401 Unauthorized, got %d", rec.Code)
		}
	})

	t.Run("GetConversationRoomKeys_MethodNotAllowedOnPOST", func(t *testing.T) {
		r := chi.NewRouter()
		r.HandleFunc("/api/e2ee/conversations/{conversation_id}/keys", handler.GetConversationRoomKeys)

		req := httptest.NewRequest(http.MethodPost, "/api/e2ee/conversations/"+uuid.New().String()+"/keys", nil)
		rec := httptest.NewRecorder()

		r.ServeHTTP(rec, req)

		if rec.Code != http.StatusMethodNotAllowed {
			t.Errorf("Expected HTTP 405 Method Not Allowed on POST, got %d", rec.Code)
		}
	})

	t.Run("GetConversationRoomKeys_UnauthorizedWithoutAuthContext", func(t *testing.T) {
		r := chi.NewRouter()
		r.Get("/api/e2ee/conversations/{conversation_id}/keys", handler.GetConversationRoomKeys)

		req := httptest.NewRequest(http.MethodGet, "/api/e2ee/conversations/"+uuid.New().String()+"/keys", nil)
		rec := httptest.NewRecorder()

		r.ServeHTTP(rec, req)

		if rec.Code != http.StatusUnauthorized {
			t.Errorf("Expected HTTP 401 Unauthorized, got %d", rec.Code)
		}
	})

	t.Run("GetConversationRoomKeys_InvalidConversationID", func(t *testing.T) {
		r := chi.NewRouter()
		r.Get("/api/e2ee/conversations/{conversation_id}/keys", handler.GetConversationRoomKeys)

		ctx := auth.ContextWithUserID(context.Background(), uuid.New())
		req := httptest.NewRequest(http.MethodGet, "/api/e2ee/conversations/not-a-valid-uuid/keys", nil).WithContext(ctx)
		rec := httptest.NewRecorder()

		r.ServeHTTP(rec, req)

		if rec.Code != http.StatusBadRequest {
			t.Errorf("Expected HTTP 400 Bad Request for invalid UUID, got %d", rec.Code)
		}
	})
}
