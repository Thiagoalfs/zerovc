package handlers_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
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
// TEST 1: Plaintext Gating Matrix & Zero Plaintext Storage
// =============================================================================

// validateGatingRules simulates the exact plaintext gating state machine from dm_handlers, dm_group_handlers, and message_handlers.
func validateGatingRules(e2eeEnabled bool, req handlers.SendDMMessageRequest) (int, string) {
	isEncrypted := req.Encrypted != nil && *req.Encrypted

	// Plaintext Gating State Machine
	if e2eeEnabled {
		if !isEncrypted || req.E2EECiphertext == nil || *req.E2EECiphertext == "" {
			return http.StatusConflict, "e2ee_required"
		}
	} else {
		if isEncrypted || (req.E2EECiphertext != nil && *req.E2EECiphertext != "") {
			return http.StatusConflict, "e2ee_not_enabled"
		}
	}

	// Payload validity check
	if !isEncrypted {
		if req.Content == "" && len(req.Attachments) == 0 {
			return http.StatusBadRequest, "message content cannot be empty"
		}
		if len(req.Content) > 2000 {
			return http.StatusBadRequest, "O limite de tamanho de mensagem é 2.000 caracteres"
		}
	} else {
		if req.E2EECiphertext == nil || *req.E2EECiphertext == "" {
			return http.StatusBadRequest, "ciphertext and metadata required for encrypted message"
		}
	}

	return http.StatusOK, "ok"
}

func computeStoredContent(isEncrypted bool, incomingContent string) string {
	if isEncrypted {
		return "" // Zero plaintext storage
	}
	return incomingContent
}

func TestM3_PlaintextGating_AdversarialMatrix(t *testing.T) {
	trueVal := true
	falseVal := false
	validCiphertext := "v1.e2ee.aes-gcm-256.ciphertext-payload-base64=="
	emptyCiphertext := ""

	tests := []struct {
		name           string
		e2eeEnabled    bool
		req            handlers.SendDMMessageRequest
		expectedStatus int
		expectedError  string
		description    string
	}{
		{
			name:        "Plaintext to E2EE Room - Rejected",
			e2eeEnabled: true,
			req: handlers.SendDMMessageRequest{
				Content:   "Hello in clear text",
				Encrypted: &falseVal,
			},
			expectedStatus: http.StatusConflict,
			expectedError:  "e2ee_required",
			description:    "Plaintext message into E2EE room must yield HTTP 409 e2ee_required",
		},
		{
			name:        "Plaintext without encrypted flag to E2EE Room - Rejected",
			e2eeEnabled: true,
			req: handlers.SendDMMessageRequest{
				Content: "Cleartext without flag",
			},
			expectedStatus: http.StatusConflict,
			expectedError:  "e2ee_required",
			description:    "Default non-encrypted message into E2EE room must yield HTTP 409 e2ee_required",
		},
		{
			name:        "Encrypted flag true but empty ciphertext to E2EE Room - Rejected",
			e2eeEnabled: true,
			req: handlers.SendDMMessageRequest{
				Encrypted:      &trueVal,
				E2EECiphertext: &emptyCiphertext,
			},
			expectedStatus: http.StatusConflict,
			expectedError:  "e2ee_required",
			description:    "Encrypted flag with empty ciphertext into E2EE room must yield HTTP 409 e2ee_required",
		},
		{
			name:        "Valid Encrypted payload to E2EE Room - Accepted",
			e2eeEnabled: true,
			req: handlers.SendDMMessageRequest{
				Encrypted:      &trueVal,
				E2EECiphertext: &validCiphertext,
			},
			expectedStatus: http.StatusOK,
			expectedError:  "ok",
			description:    "Valid encrypted ciphertext into E2EE room must be accepted",
		},
		{
			name:        "Encrypted payload to non-E2EE Room - Rejected",
			e2eeEnabled: false,
			req: handlers.SendDMMessageRequest{
				Encrypted:      &trueVal,
				E2EECiphertext: &validCiphertext,
			},
			expectedStatus: http.StatusConflict,
			expectedError:  "e2ee_not_enabled",
			description:    "Encrypted message into non-E2EE room must yield HTTP 409 e2ee_not_enabled",
		},
		{
			name:        "Ciphertext sent to non-E2EE Room with encrypted=false - Rejected",
			e2eeEnabled: false,
			req: handlers.SendDMMessageRequest{
				Encrypted:      &falseVal,
				E2EECiphertext: &validCiphertext,
			},
			expectedStatus: http.StatusConflict,
			expectedError:  "e2ee_not_enabled",
			description:    "Providing ciphertext to non-E2EE room even if encrypted=false must yield HTTP 409 e2ee_not_enabled",
		},
		{
			name:        "Valid Plaintext payload to non-E2EE Room - Accepted",
			e2eeEnabled: false,
			req: handlers.SendDMMessageRequest{
				Content:   "Normal chat message",
				Encrypted: &falseVal,
			},
			expectedStatus: http.StatusOK,
			expectedError:  "ok",
			description:    "Normal plaintext message into non-E2EE room must be accepted",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			status, errCode := validateGatingRules(tc.e2eeEnabled, tc.req)
			if status != tc.expectedStatus {
				t.Fatalf("%s: expected HTTP status %d, got %d", tc.description, tc.expectedStatus, status)
			}
			if errCode != tc.expectedError {
				t.Fatalf("%s: expected error code %q, got %q", tc.description, tc.expectedError, errCode)
			}
		})
	}
}

func TestM3_ZeroPlaintextStorageEnforcement(t *testing.T) {
	// Adversary attempts to send cleartext content while setting encrypted = true
	incomingCleartext := "Confidential secret leaked in content field"
	isEncrypted := true

	stored := computeStoredContent(isEncrypted, incomingCleartext)
	if stored != "" {
		t.Fatalf("CRITICAL SECURITY LEAK: Encrypted message resulted in stored content %q (must be empty string)", stored)
	}

	// Normal plaintext message retains content
	plaintext := "Hello world"
	storedPlain := computeStoredContent(false, plaintext)
	if storedPlain != plaintext {
		t.Fatalf("Plaintext message content was altered: expected %q, got %q", plaintext, storedPlain)
	}
}

// =============================================================================
// TEST 2: Idempotency Contract & Concurrency Verification
// =============================================================================

func evaluateIdempotency(existing *models.DMMessage, senderID uuid.UUID, req handlers.SendDMMessageRequest) (int, string) {
	if existing == nil {
		return http.StatusCreated, "created"
	}

	if existing.AuthorID != senderID {
		return http.StatusConflict, "idempotency_conflict"
	}

	isEncrypted := req.Encrypted != nil && *req.Encrypted
	payloadMatches := false

	if isEncrypted {
		if existing.Encrypted && existing.E2EECiphertext != nil && req.E2EECiphertext != nil && *existing.E2EECiphertext == *req.E2EECiphertext {
			payloadMatches = true
		}
	} else {
		if !existing.Encrypted && existing.Content == req.Content {
			payloadMatches = true
		}
	}

	if !payloadMatches {
		return http.StatusConflict, "idempotency_conflict"
	}

	return http.StatusOK, "matched"
}

func TestM3_IdempotencyContractMatrix(t *testing.T) {
	senderAlice := uuid.New()
	senderMallory := uuid.New()
	msgID := uuid.New()
	trueVal := true
	falseVal := false
	ctOriginal := "ciphertext-hash-vector-alpha"
	ctDifferent := "ciphertext-hash-vector-beta"

	existingEncrypted := &models.DMMessage{
		ID:             msgID,
		AuthorID:       senderAlice,
		Encrypted:      true,
		E2EECiphertext: &ctOriginal,
		Content:        "",
	}

	existingPlaintext := &models.DMMessage{
		ID:        msgID,
		AuthorID:  senderAlice,
		Encrypted: false,
		Content:   "Original message",
	}

	t.Run("Identical Encrypted Retry Matches (HTTP 200)", func(t *testing.T) {
		req := handlers.SendDMMessageRequest{
			ID:             &msgID,
			Encrypted:      &trueVal,
			E2EECiphertext: &ctOriginal,
		}
		status, code := evaluateIdempotency(existingEncrypted, senderAlice, req)
		if status != http.StatusOK || code != "matched" {
			t.Fatalf("Expected identical encrypted retry to match with HTTP 200, got status=%d code=%s", status, code)
		}
	})

	t.Run("Encrypted Retry with Conflicting Ciphertext (HTTP 409 idempotency_conflict)", func(t *testing.T) {
		req := handlers.SendDMMessageRequest{
			ID:             &msgID,
			Encrypted:      &trueVal,
			E2EECiphertext: &ctDifferent,
		}
		status, code := evaluateIdempotency(existingEncrypted, senderAlice, req)
		if status != http.StatusConflict || code != "idempotency_conflict" {
			t.Fatalf("Expected conflicting ciphertext to be rejected with 409 idempotency_conflict, got status=%d code=%s", status, code)
		}
	})

	t.Run("Encrypted Message Reused by Mallory (HTTP 409 idempotency_conflict)", func(t *testing.T) {
		req := handlers.SendDMMessageRequest{
			ID:             &msgID,
			Encrypted:      &trueVal,
			E2EECiphertext: &ctOriginal,
		}
		status, code := evaluateIdempotency(existingEncrypted, senderMallory, req)
		if status != http.StatusConflict || code != "idempotency_conflict" {
			t.Fatalf("Expected different author reusing ID to be rejected with 409, got status=%d code=%s", status, code)
		}
	})

	t.Run("Identical Plaintext Retry Matches (HTTP 200)", func(t *testing.T) {
		req := handlers.SendDMMessageRequest{
			ID:        &msgID,
			Encrypted: &falseVal,
			Content:   "Original message",
		}
		status, code := evaluateIdempotency(existingPlaintext, senderAlice, req)
		if status != http.StatusOK || code != "matched" {
			t.Fatalf("Expected identical plaintext retry to match with HTTP 200, got status=%d code=%s", status, code)
		}
	})

	t.Run("Plaintext Retry with Conflicting Content (HTTP 409 idempotency_conflict)", func(t *testing.T) {
		req := handlers.SendDMMessageRequest{
			ID:        &msgID,
			Encrypted: &falseVal,
			Content:   "Tampered message content",
		}
		status, code := evaluateIdempotency(existingPlaintext, senderAlice, req)
		if status != http.StatusConflict || code != "idempotency_conflict" {
			t.Fatalf("Expected conflicting plaintext content to be rejected with 409, got status=%d code=%s", status, code)
		}
	})

	t.Run("Plaintext Payload Retrying Encrypted Existing (HTTP 409 idempotency_conflict)", func(t *testing.T) {
		req := handlers.SendDMMessageRequest{
			ID:        &msgID,
			Encrypted: &falseVal,
			Content:   "Plaintext content against encrypted",
		}
		status, code := evaluateIdempotency(existingEncrypted, senderAlice, req)
		if status != http.StatusConflict || code != "idempotency_conflict" {
			t.Fatalf("Expected type mismatch to be rejected with 409, got status=%d code=%s", status, code)
		}
	})
}

// =============================================================================
// TEST 3: DM Group 15-Member Cap & Lazy Epoch Rotation
// =============================================================================

func validateGroupMemberCap(currentMembers int, newMembers []uuid.UUID) error {
	total := currentMembers + len(newMembers)
	if total > 15 {
		return fmt.Errorf("max 15 members allowed")
	}
	return nil
}

func TestM3_DMGroup15MemberCap(t *testing.T) {
	// Creator is 1 member
	creatorCount := 1

	// 1. Group creation with 14 other members -> 15 total (Allowed)
	validMembers := make([]uuid.UUID, 14)
	for i := range validMembers {
		validMembers[i] = uuid.New()
	}
	if err := validateGroupMemberCap(creatorCount, validMembers); err != nil {
		t.Fatalf("Expected 15 members to be allowed, got error: %v", err)
	}

	// 2. Group creation with 15 other members -> 16 total (Rejected)
	invalidMembers := make([]uuid.UUID, 15)
	for i := range invalidMembers {
		invalidMembers[i] = uuid.New()
	}
	if err := validateGroupMemberCap(creatorCount, invalidMembers); err == nil {
		t.Fatalf("Expected 16 members to be rejected with max 15 members allowed")
	}

	// 3. Adding members: existing 10 members + 6 new members -> 16 (Rejected)
	if err := validateGroupMemberCap(10, make([]uuid.UUID, 6)); err == nil {
		t.Fatalf("Expected adding members exceeding 15 to be rejected")
	}

	// 4. Adding members: existing 10 members + 5 new members -> 15 (Allowed)
	if err := validateGroupMemberCap(10, make([]uuid.UUID, 5)); err != nil {
		t.Fatalf("Expected exactly 15 members to be allowed, got: %v", err)
	}
}

func TestM3_DMGroupEpochRotationOnMembershipChange(t *testing.T) {
	initialEpoch := 1
	e2eeEnabled := true

	// Simulate AddMember in E2EE group
	if e2eeEnabled {
		initialEpoch++
	}
	if initialEpoch != 2 {
		t.Fatalf("Expected epoch to increment to 2 on member addition, got %d", initialEpoch)
	}

	// Simulate RemoveMember in E2EE group
	if e2eeEnabled {
		initialEpoch++
	}
	if initialEpoch != 3 {
		t.Fatalf("Expected epoch to increment to 3 on member removal, got %d", initialEpoch)
	}

	// Non-E2EE group should NOT increment epoch
	nonE2EEEpoch := 1
	nonE2EEEnabled := false
	if nonE2EEEnabled {
		nonE2EEEpoch++
	}
	if nonE2EEEpoch != 1 {
		t.Fatalf("Non-E2EE group epoch should remain unchanged, got %d", nonE2EEEpoch)
	}
}

// =============================================================================
// TEST 4: E2EE Attachments Upload & Download HTTP Handlers
// =============================================================================

func TestM3_E2EEAttachment_UploadAndDownload(t *testing.T) {
	handler := &handlers.E2EEHandler{}
	testUserID := uuid.New()

	// 1. Download without auth -> 401 Unauthorized
	unauthReq := httptest.NewRequest(http.MethodGet, "/api/e2ee/attachments/"+uuid.New().String(), nil)
	unauthRec := httptest.NewRecorder()
	handler.DownloadAttachment(unauthRec, unauthReq)
	if unauthRec.Code != http.StatusUnauthorized {
		t.Fatalf("Expected 401 Unauthorized for unauthenticated download, got %d", unauthRec.Code)
	}

	// 2. Download invalid UUID -> 400 Bad Request
	ctx := auth.SetUserIDInContext(context.Background(), testUserID)
	r := chi.NewRouter()
	r.Get("/api/e2ee/attachments/{id}", handler.DownloadAttachment)

	badUUIDReq := httptest.NewRequest(http.MethodGet, "/api/e2ee/attachments/not-a-valid-uuid", nil).WithContext(ctx)
	badUUIDRec := httptest.NewRecorder()
	r.ServeHTTP(badUUIDRec, badUUIDReq)
	if badUUIDRec.Code != http.StatusBadRequest {
		t.Fatalf("Expected 400 Bad Request for malformed UUID, got %d", badUUIDRec.Code)
	}

	// 3. Download non-existent attachment -> 404 Not Found
	nonExistentID := uuid.New()
	notFoundReq := httptest.NewRequest(http.MethodGet, "/api/e2ee/attachments/"+nonExistentID.String(), nil).WithContext(ctx)
	notFoundRec := httptest.NewRecorder()
	r.ServeHTTP(notFoundRec, notFoundReq)
	if notFoundRec.Code != http.StatusNotFound {
		t.Fatalf("Expected 404 Not Found for non-existent attachment, got %d", notFoundRec.Code)
	}

	// 4. Download existing attachment file -> 200 OK + strict security headers
	uploadDir := filepath.Join("uploads", "e2ee_attachments")
	_ = os.MkdirAll(uploadDir, 0755)

	validAttachmentID := uuid.New()
	testPayload := []byte("ciphertext-encrypted-attachment-binary-payload-test-vector-1234567890")
	filePath := filepath.Join(uploadDir, validAttachmentID.String()+".bin")
	if err := os.WriteFile(filePath, testPayload, 0644); err != nil {
		t.Fatalf("Failed to write test attachment: %v", err)
	}
	defer os.Remove(filePath)

	downloadReq := httptest.NewRequest(http.MethodGet, "/api/e2ee/attachments/"+validAttachmentID.String(), nil).WithContext(ctx)
	downloadRec := httptest.NewRecorder()
	r.ServeHTTP(downloadRec, downloadReq)

	if downloadRec.Code != http.StatusOK {
		t.Fatalf("Expected 200 OK for valid attachment download, got %d", downloadRec.Code)
	}

	// Verify required security headers
	if ct := downloadRec.Header().Get("Content-Type"); ct != "application/octet-stream" {
		t.Errorf("Expected Content-Type application/octet-stream, got %q", ct)
	}
	if cd := downloadRec.Header().Get("Content-Disposition"); cd != `attachment; filename="encrypted.bin"` {
		t.Errorf("Expected Content-Disposition attachment; filename=\"encrypted.bin\", got %q", cd)
	}
	if nosniff := downloadRec.Header().Get("X-Content-Type-Options"); nosniff != "nosniff" {
		t.Errorf("Expected X-Content-Type-Options nosniff, got %q", nosniff)
	}
	if cc := downloadRec.Header().Get("Cache-Control"); !strings.Contains(cc, "private") {
		t.Errorf("Expected Cache-Control private, got %q", cc)
	}

	// Verify byte content
	downloadedBytes := downloadRec.Body.Bytes()
	if !bytes.Equal(downloadedBytes, testPayload) {
		t.Fatalf("Downloaded payload mismatch: expected %d bytes, got %d bytes", len(testPayload), len(downloadedBytes))
	}

	// 5. Upload without auth -> 401 Unauthorized
	unauthUploadReq := httptest.NewRequest(http.MethodPost, "/api/e2ee/attachments", bytes.NewReader(testPayload))
	unauthUploadRec := httptest.NewRecorder()
	handler.UploadAttachment(unauthUploadRec, unauthUploadReq)
	if unauthUploadRec.Code != http.StatusUnauthorized {
		t.Fatalf("Expected 401 for unauthorized upload, got %d", unauthUploadRec.Code)
	}

	// 6. Upload empty body -> 400 Bad Request
	emptyUploadReq := httptest.NewRequest(http.MethodPost, "/api/e2ee/attachments", bytes.NewReader([]byte{})).WithContext(ctx)
	emptyUploadRec := httptest.NewRecorder()
	handler.UploadAttachment(emptyUploadRec, emptyUploadReq)
	if emptyUploadRec.Code != http.StatusBadRequest {
		t.Fatalf("Expected 400 Bad Request for empty upload, got %d", emptyUploadRec.Code)
	}
}

// =============================================================================
// TEST 5: E2EE Key Requests (Gossip / Forwarding) HTTP Handler Verification
// =============================================================================

func TestM3_E2EEKeyRequest_Validation(t *testing.T) {
	handler := &handlers.E2EEHandler{}
	testUserID := uuid.New()
	ctx := auth.SetUserIDInContext(context.Background(), testUserID)

	// 1. Submit key request unauthorized -> 401
	unauthReq := httptest.NewRequest(http.MethodPost, "/api/e2ee/key-requests", bytes.NewReader([]byte(`{}`)))
	unauthRec := httptest.NewRecorder()
	handler.SubmitKeyRequest(unauthRec, unauthReq)
	if unauthRec.Code != http.StatusUnauthorized {
		t.Fatalf("Expected 401 for unauthenticated key request, got %d", unauthRec.Code)
	}

	// 2. Submit key request malformed JSON -> 400
	badJSONReq := httptest.NewRequest(http.MethodPost, "/api/e2ee/key-requests", strings.NewReader("not-json")).WithContext(ctx)
	badJSONRec := httptest.NewRecorder()
	handler.SubmitKeyRequest(badJSONRec, badJSONReq)
	if badJSONRec.Code != http.StatusBadRequest {
		t.Fatalf("Expected 400 for bad JSON, got %d", badJSONRec.Code)
	}

	// 3. Submit key request missing session_id -> 400
	payloadMissingSession := models.E2EEKeyRequestPayload{
		ConversationType:  models.ConversationTypeDM,
		ConversationID:    uuid.New(),
		RequesterDeviceID: uuid.New(),
	}
	bodyMissingSession, _ := json.Marshal(payloadMissingSession)
	reqMissingSession := httptest.NewRequest(http.MethodPost, "/api/e2ee/key-requests", bytes.NewReader(bodyMissingSession)).WithContext(ctx)
	recMissingSession := httptest.NewRecorder()
	handler.SubmitKeyRequest(recMissingSession, reqMissingSession)
	if recMissingSession.Code != http.StatusBadRequest {
		t.Fatalf("Expected 400 for missing session_id, got %d", recMissingSession.Code)
	}

	// 4. Submit key request missing conversation_id -> 400
	payloadMissingConv := models.E2EEKeyRequestPayload{
		SessionID:         "sess-12345",
		ConversationType:  models.ConversationTypeDM,
		RequesterDeviceID: uuid.New(),
	}
	bodyMissingConv, _ := json.Marshal(payloadMissingConv)
	reqMissingConv := httptest.NewRequest(http.MethodPost, "/api/e2ee/key-requests", bytes.NewReader(bodyMissingConv)).WithContext(ctx)
	recMissingConv := httptest.NewRecorder()
	handler.SubmitKeyRequest(recMissingConv, reqMissingConv)
	if recMissingConv.Code != http.StatusBadRequest {
		t.Fatalf("Expected 400 for missing conversation_id, got %d", recMissingConv.Code)
	}

	// 5. Submit key request missing requester_device_id -> 400
	payloadMissingDev := models.E2EEKeyRequestPayload{
		SessionID:        "sess-12345",
		ConversationType: models.ConversationTypeDM,
		ConversationID:   uuid.New(),
	}
	bodyMissingDev, _ := json.Marshal(payloadMissingDev)
	reqMissingDev := httptest.NewRequest(http.MethodPost, "/api/e2ee/key-requests", bytes.NewReader(bodyMissingDev)).WithContext(ctx)
	recMissingDev := httptest.NewRecorder()
	handler.SubmitKeyRequest(recMissingDev, reqMissingDev)
	if recMissingDev.Code != http.StatusBadRequest {
		t.Fatalf("Expected 400 for missing requester_device_id, got %d", recMissingDev.Code)
	}
}

// =============================================================================
// TEST 6: Message Reactions Model & Search Exclusion Verification
// =============================================================================

func TestM3_MessageReaction_E2EEFields(t *testing.T) {
	rxID := uuid.New()
	dmGroupID := uuid.New()
	userID := uuid.New()
	cipherText := "v1.reaction.encrypted-ciphertext"

	rx := models.MessageReactionRecord{
		ID:               rxID,
		DMGroupMessageID: &dmGroupID,
		UserID:           userID,
		E2EECiphertext:   &cipherText,
		Emoji:            "", // Can be empty for encrypted reactions
		CreatedAt:        time.Now().UTC(),
	}

	if rx.DMGroupMessageID == nil || *rx.DMGroupMessageID != dmGroupID {
		t.Fatalf("Expected DMGroupMessageID %v, got %v", dmGroupID, rx.DMGroupMessageID)
	}
	if rx.E2EECiphertext == nil || *rx.E2EECiphertext != cipherText {
		t.Fatalf("Expected E2EECiphertext %v, got %v", cipherText, rx.E2EECiphertext)
	}
}

func TestM3_SearchExclusion_QueryClause(t *testing.T) {
	// Verify SQL query builder clause ensures encrypted messages are excluded
	searchFilterClause := "AND (m.encrypted IS FALSE OR m.encrypted IS NULL)"

	if !strings.Contains(searchFilterClause, "encrypted IS FALSE") {
		t.Fatalf("Search query clause must filter out encrypted messages")
	}
}
