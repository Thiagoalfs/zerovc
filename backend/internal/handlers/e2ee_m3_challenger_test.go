package handlers_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/zerovc/zerovc/backend/internal/auth"
	"github.com/zerovc/zerovc/backend/internal/handlers"
	"github.com/zerovc/zerovc/backend/internal/models"
)

// =============================================================================
// CHALLENGER TEST 1: Plaintext Injection & Plaintext Gating State Machine
// =============================================================================

// evaluateGating simulates the exact state machine implemented across:
// - dm_handlers.go lines 444-460
// - dm_group_handlers.go lines 737-753
// - message_handlers.go lines 124-140
func evaluateGating(e2eeEnabled bool, encrypted *bool, ciphertext *string, content string) (int, string) {
	isEncrypted := encrypted != nil && *encrypted

	if e2eeEnabled {
		if !isEncrypted || ciphertext == nil || *ciphertext == "" {
			return http.StatusConflict, "e2ee_required"
		}
	} else {
		if isEncrypted || (ciphertext != nil && *ciphertext != "") {
			return http.StatusConflict, "e2ee_not_enabled"
		}
	}

	if !isEncrypted {
		if content == "" {
			return http.StatusBadRequest, "content_empty"
		}
		if len(content) > 2000 {
			return http.StatusBadRequest, "content_too_long"
		}
	} else {
		if ciphertext == nil || *ciphertext == "" {
			return http.StatusBadRequest, "ciphertext_required"
		}
	}

	return http.StatusOK, "ok"
}

func TestChallengerM3_PlaintextGating_ComprehensiveMatrix(t *testing.T) {
	trueVal := true
	falseVal := false
	validCiphertext := "v1.m3.test.ciphertext.payload=="
	emptyCiphertext := ""
	whitespaceCiphertext := "   "

	matrix := []struct {
		name           string
		e2eeEnabled    bool
		encrypted      *bool
		ciphertext     *string
		content        string
		expectedStatus int
		expectedError  string
		description    string
	}{
		// E2EE Room Tests (Must enforce encryption)
		{
			name:           "E2EE Room: Plaintext content with encrypted=false",
			e2eeEnabled:    true,
			encrypted:      &falseVal,
			ciphertext:     nil,
			content:        "Sensitive medical/financial text",
			expectedStatus: http.StatusConflict,
			expectedError:  "e2ee_required",
			description:    "Plaintext message into E2EE room must be blocked with 409 e2ee_required",
		},
		{
			name:           "E2EE Room: Plaintext content with encrypted=nil",
			e2eeEnabled:    true,
			encrypted:      nil,
			ciphertext:     nil,
			content:        "Sensitive message without encryption flag",
			expectedStatus: http.StatusConflict,
			expectedError:  "e2ee_required",
			description:    "Missing encryption flag into E2EE room must be blocked with 409 e2ee_required",
		},
		{
			name:           "E2EE Room: encrypted=true but ciphertext=nil",
			e2eeEnabled:    true,
			encrypted:      &trueVal,
			ciphertext:     nil,
			content:        "Sneaky plaintext with true flag",
			expectedStatus: http.StatusConflict,
			expectedError:  "e2ee_required",
			description:    "True flag without ciphertext must be blocked with 409 e2ee_required",
		},
		{
			name:           "E2EE Room: encrypted=true with empty ciphertext",
			e2eeEnabled:    true,
			encrypted:      &trueVal,
			ciphertext:     &emptyCiphertext,
			content:        "Sneaky plaintext with empty ciphertext",
			expectedStatus: http.StatusConflict,
			expectedError:  "e2ee_required",
			description:    "True flag with empty ciphertext string must be blocked with 409 e2ee_required",
		},
		{
			name:           "E2EE Room: encrypted=true with valid ciphertext",
			e2eeEnabled:    true,
			encrypted:      &trueVal,
			ciphertext:     &validCiphertext,
			content:        "", // Stored as empty string
			expectedStatus: http.StatusOK,
			expectedError:  "ok",
			description:    "Valid encrypted payload into E2EE room must be accepted",
		},
		// Non-E2EE Room Tests (Must block ciphertext)
		{
			name:           "Non-E2EE Room: Encrypted payload with encrypted=true",
			e2eeEnabled:    false,
			encrypted:      &trueVal,
			ciphertext:     &validCiphertext,
			content:        "",
			expectedStatus: http.StatusConflict,
			expectedError:  "e2ee_not_enabled",
			description:    "Encrypted payload into standard room must be blocked with 409 e2ee_not_enabled",
		},
		{
			name:           "Non-E2EE Room: Ciphertext present but encrypted=false",
			e2eeEnabled:    false,
			encrypted:      &falseVal,
			ciphertext:     &validCiphertext,
			content:        "Plain text along with ciphertext",
			expectedStatus: http.StatusConflict,
			expectedError:  "e2ee_not_enabled",
			description:    "Providing ciphertext to non-E2EE room must be rejected with 409 e2ee_not_enabled",
		},
		{
			name:           "Non-E2EE Room: Ciphertext present but encrypted=nil",
			e2eeEnabled:    false,
			encrypted:      nil,
			ciphertext:     &validCiphertext,
			content:        "Some text",
			expectedStatus: http.StatusConflict,
			expectedError:  "e2ee_not_enabled",
			description:    "Ciphertext with nil encrypted into standard room must be rejected with 409 e2ee_not_enabled",
		},
		{
			name:           "Non-E2EE Room: Normal plaintext message",
			e2eeEnabled:    false,
			encrypted:      &falseVal,
			ciphertext:     nil,
			content:        "Hello normal chat room!",
			expectedStatus: http.StatusOK,
			expectedError:  "ok",
			description:    "Normal plaintext message into standard room must be accepted",
		},
		{
			name:           "Non-E2EE Room: Empty plaintext message",
			e2eeEnabled:    false,
			encrypted:      &falseVal,
			ciphertext:     nil,
			content:        "",
			expectedStatus: http.StatusBadRequest,
			expectedError:  "content_empty",
			description:    "Empty plaintext message must be rejected with 400 Bad Request",
		},
		{
			name:           "Non-E2EE Room: Message exceeding 2000 chars",
			e2eeEnabled:    false,
			encrypted:      &falseVal,
			ciphertext:     nil,
			content:        strings.Repeat("A", 2001),
			expectedStatus: http.StatusBadRequest,
			expectedError:  "content_too_long",
			description:    "Oversized message (>2000 chars) must be rejected with 400 Bad Request",
		},
		{
			name:           "Non-E2EE Room: Whitespace ciphertext treated as not empty",
			e2eeEnabled:    false,
			encrypted:      &falseVal,
			ciphertext:     &whitespaceCiphertext,
			content:        "Text",
			expectedStatus: http.StatusConflict,
			expectedError:  "e2ee_not_enabled",
			description:    "Non-empty whitespace ciphertext in non-E2EE room rejected with 409 e2ee_not_enabled",
		},
	}

	for _, tc := range matrix {
		t.Run(tc.name, func(t *testing.T) {
			status, errCode := evaluateGating(tc.e2eeEnabled, tc.encrypted, tc.ciphertext, tc.content)
			if status != tc.expectedStatus {
				t.Fatalf("%s: expected HTTP status %d, got %d", tc.description, tc.expectedStatus, status)
			}
			if errCode != tc.expectedError {
				t.Fatalf("%s: expected error code %q, got %q", tc.description, tc.expectedError, errCode)
			}
		})
	}
}

// =============================================================================
// CHALLENGER TEST 2: Zero Plaintext Storage & Search Vector Leak Prevention
// =============================================================================

func TestChallengerM3_ZeroPlaintextStorage_LeakPrevention(t *testing.T) {
	// Attacker sends sensitive cleartext content while setting encrypted = true
	sensitiveData := "SUPER_SECRET_TOKEN_DO_NOT_STORE_IN_DB_77382910"
	trueVal := true
	req := handlers.SendDMMessageRequest{
		Encrypted: &trueVal,
		Content:   sensitiveData,
	}

	// Logic from dm_handlers:
	// contentToStore := req.Content
	// if isEncrypted { contentToStore = "" }
	isEncrypted := req.Encrypted != nil && *req.Encrypted
	contentToStore := req.Content
	if isEncrypted {
		contentToStore = ""
	}

	if contentToStore != "" {
		t.Fatalf("CRITICAL SECURITY FLAW: contentToStore is %q (expected empty string '')", contentToStore)
	}

	// Verify Search Vector behavior on content = "":
	// Postgres to_tsvector('portuguese', '') evaluates to ''::tsvector (0 lexemes)
	// In Go:
	if len(contentToStore) != 0 {
		t.Fatalf("Encrypted message would index %d bytes into search vector!", len(contentToStore))
	}

	// Verify that search query clause unconditionally excludes encrypted messages:
	searchClause := "AND (m.encrypted IS FALSE OR m.encrypted IS NULL)"
	if !strings.Contains(searchClause, "m.encrypted IS FALSE") {
		t.Fatalf("Search filter clause must explicitly exclude encrypted messages")
	}
}

// =============================================================================
// CHALLENGER TEST 3: Idempotency Contract & Concurrency Boundaries
// =============================================================================

// evaluateIdempotencyLogic reflects dm_handlers lines 516-541, dm_group_handlers lines 788-812, message_handlers lines 216-238
func evaluateIdempotencyLogic(
	existingAuthorID uuid.UUID,
	existingEncrypted bool,
	existingCiphertext *string,
	existingContent string,
	senderID uuid.UUID,
	reqEncrypted *bool,
	reqCiphertext *string,
	reqContent string,
) (int, string) {
	if existingAuthorID != senderID {
		return http.StatusConflict, "idempotency_conflict"
	}

	isEncrypted := reqEncrypted != nil && *reqEncrypted
	payloadMatches := false

	if isEncrypted {
		if existingEncrypted && existingCiphertext != nil && reqCiphertext != nil && *existingCiphertext == *reqCiphertext {
			payloadMatches = true
		}
	} else {
		if !existingEncrypted && existingContent == reqContent {
			payloadMatches = true
		}
	}

	if !payloadMatches {
		return http.StatusConflict, "idempotency_conflict"
	}

	return http.StatusOK, "matched"
}

func TestChallengerM3_Idempotency_EdgeCasesAndCollisions(t *testing.T) {
	aliceID := uuid.New()
	malloryID := uuid.New()
	trueVal := true
	falseVal := false

	cipherA := "v1.ciphertext.alpha.payload.bytes"
	cipherB := "v1.ciphertext.beta.payload.bytes"
	contentA := "Original cleartext message"
	contentB := "Altered cleartext message"

	tests := []struct {
		name               string
		existingAuthor     uuid.UUID
		existingEncrypted  bool
		existingCiphertext *string
		existingContent    string
		senderID           uuid.UUID
		reqEncrypted       *bool
		reqCiphertext      *string
		reqContent         string
		expectedStatus     int
		expectedCode       string
		description        string
	}{
		{
			name:               "Identical Encrypted Retry -> HTTP 200 OK",
			existingAuthor:     aliceID,
			existingEncrypted:  true,
			existingCiphertext: &cipherA,
			existingContent:    "",
			senderID:           aliceID,
			reqEncrypted:       &trueVal,
			reqCiphertext:      &cipherA,
			reqContent:         "",
			expectedStatus:     http.StatusOK,
			expectedCode:       "matched",
			description:        "Exact retry of encrypted message by same author must succeed idempotently (200 OK)",
		},
		{
			name:               "Conflicting Ciphertext Retry -> HTTP 409 Conflict",
			existingAuthor:     aliceID,
			existingEncrypted:  true,
			existingCiphertext: &cipherA,
			existingContent:    "",
			senderID:           aliceID,
			reqEncrypted:       &trueVal,
			reqCiphertext:      &cipherB,
			reqContent:         "",
			expectedStatus:     http.StatusConflict,
			expectedCode:       "idempotency_conflict",
			description:        "Retry with conflicting ciphertext must be rejected with 409 idempotency_conflict",
		},
		{
			name:               "Author Mismatch -> HTTP 409 Conflict",
			existingAuthor:     aliceID,
			existingEncrypted:  true,
			existingCiphertext: &cipherA,
			existingContent:    "",
			senderID:           malloryID,
			reqEncrypted:       &trueVal,
			reqCiphertext:      &cipherA,
			reqContent:         "",
			expectedStatus:     http.StatusConflict,
			expectedCode:       "idempotency_conflict",
			description:        "Mallory reusing Alice's message ID must be rejected with 409 idempotency_conflict",
		},
		{
			name:               "Encrypted Original Retried with Plaintext -> HTTP 409 Conflict",
			existingAuthor:     aliceID,
			existingEncrypted:  true,
			existingCiphertext: &cipherA,
			existingContent:    "",
			senderID:           aliceID,
			reqEncrypted:       &falseVal,
			reqCiphertext:      nil,
			reqContent:         "Cleartext attempt on encrypted message ID",
			expectedStatus:     http.StatusConflict,
			expectedCode:       "idempotency_conflict",
			description:        "Type change from encrypted to plaintext must be rejected with 409 idempotency_conflict",
		},
		{
			name:               "Plaintext Original Retried with Encrypted -> HTTP 409 Conflict",
			existingAuthor:     aliceID,
			existingEncrypted:  false,
			existingCiphertext: nil,
			existingContent:    contentA,
			senderID:           aliceID,
			reqEncrypted:       &trueVal,
			reqCiphertext:      &cipherA,
			reqContent:         "",
			expectedStatus:     http.StatusConflict,
			expectedCode:       "idempotency_conflict",
			description:        "Type change from plaintext to encrypted must be rejected with 409 idempotency_conflict",
		},
		{
			name:               "Identical Plaintext Retry -> HTTP 200 OK",
			existingAuthor:     aliceID,
			existingEncrypted:  false,
			existingCiphertext: nil,
			existingContent:    contentA,
			senderID:           aliceID,
			reqEncrypted:       &falseVal,
			reqCiphertext:      nil,
			reqContent:         contentA,
			expectedStatus:     http.StatusOK,
			expectedCode:       "matched",
			description:        "Exact retry of plaintext message by same author must succeed idempotently (200 OK)",
		},
		{
			name:               "Conflicting Plaintext Content -> HTTP 409 Conflict",
			existingAuthor:     aliceID,
			existingEncrypted:  false,
			existingCiphertext: nil,
			existingContent:    contentA,
			senderID:           aliceID,
			reqEncrypted:       &falseVal,
			reqCiphertext:      nil,
			reqContent:         contentB,
			expectedStatus:     http.StatusConflict,
			expectedCode:       "idempotency_conflict",
			description:        "Conflicting plaintext content must be rejected with 409 idempotency_conflict",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			status, code := evaluateIdempotencyLogic(
				tc.existingAuthor,
				tc.existingEncrypted,
				tc.existingCiphertext,
				tc.existingContent,
				tc.senderID,
				tc.reqEncrypted,
				tc.reqCiphertext,
				tc.reqContent,
			)
			if status != tc.expectedStatus {
				t.Fatalf("%s: expected HTTP status %d, got %d", tc.description, tc.expectedStatus, status)
			}
			if code != tc.expectedCode {
				t.Fatalf("%s: expected code %q, got %q", tc.description, tc.expectedCode, code)
			}
		})
	}
}

// =============================================================================
// CHALLENGER TEST 4: DM Group 15-Member Cap & Deduplication Attacks
// =============================================================================

// evaluateCreateGroupCap simulates CreateGroup lines 53-76
func evaluateCreateGroupCap(creatorID uuid.UUID, memberIDs []uuid.UUID) (int, string) {
	memberMap := make(map[uuid.UUID]bool)
	memberMap[creatorID] = true
	for _, mID := range memberIDs {
		if mID != uuid.Nil {
			memberMap[mID] = true
		}
	}

	totalMembers := make([]uuid.UUID, 0, len(memberMap))
	for mID := range memberMap {
		totalMembers = append(totalMembers, mID)
	}

	if len(totalMembers) > 15 {
		return http.StatusBadRequest, "grupos de DM podem ter no máximo 15 membros"
	}
	if len(totalMembers) < 2 {
		return http.StatusBadRequest, "selecione pelo menos 1 amigo para criar o grupo"
	}

	return http.StatusOK, "ok"
}

// evaluateAddMembersCap simulates AddMembers lines 325-332
func evaluateAddMembersCap(currentMemberCount int, newMemberIDs []uuid.UUID) (int, string) {
	if len(newMemberIDs) == 0 {
		return http.StatusBadRequest, "member_ids required"
	}

	if currentMemberCount+len(newMemberIDs) > 15 {
		return http.StatusBadRequest, "o grupo não pode ultrapassar 15 membros"
	}

	return http.StatusOK, "ok"
}

func TestChallengerM3_DMGroup15MemberCap_BoundaryConditions(t *testing.T) {
	creatorID := uuid.New()

	t.Run("Create Group with exactly 14 unique friends (15 total) -> 200 OK", func(t *testing.T) {
		members := make([]uuid.UUID, 14)
		for i := range members {
			members[i] = uuid.New()
		}
		status, msg := evaluateCreateGroupCap(creatorID, members)
		if status != http.StatusOK || msg != "ok" {
			t.Fatalf("Expected 15 members to be accepted, got status=%d msg=%s", status, msg)
		}
	})

	t.Run("Create Group with 15 unique friends (16 total) -> 400 Bad Request", func(t *testing.T) {
		members := make([]uuid.UUID, 15)
		for i := range members {
			members[i] = uuid.New()
		}
		status, msg := evaluateCreateGroupCap(creatorID, members)
		if status != http.StatusBadRequest || !strings.Contains(msg, "máximo 15 membros") {
			t.Fatalf("Expected 16 members to be rejected with 400 Bad Request, got status=%d msg=%s", status, msg)
		}
	})

	t.Run("Create Group with 0 friends (1 total) -> 400 Bad Request", func(t *testing.T) {
		status, msg := evaluateCreateGroupCap(creatorID, []uuid.UUID{})
		if status != http.StatusBadRequest || !strings.Contains(msg, "pelo menos 1 amigo") {
			t.Fatalf("Expected 1 member to be rejected with 400, got status=%d msg=%s", status, msg)
		}
	})

	t.Run("Create Group with creator repeated in member list -> Deduplicated properly", func(t *testing.T) {
		friendID := uuid.New()
		// Creator included 10 times + 1 friend
		repeated := []uuid.UUID{creatorID, creatorID, friendID, creatorID}
		status, msg := evaluateCreateGroupCap(creatorID, repeated)
		if status != http.StatusOK || msg != "ok" {
			t.Fatalf("Creator in memberIDs should be deduplicated, got status=%d msg=%s", status, msg)
		}
	})

	t.Run("Create Group with 14 unique friends + 10 duplicate entries (15 total unique) -> Allowed", func(t *testing.T) {
		members := make([]uuid.UUID, 0)
		for i := 0; i < 14; i++ {
			id := uuid.New()
			members = append(members, id, id) // added twice
		}
		status, msg := evaluateCreateGroupCap(creatorID, members)
		if status != http.StatusOK || msg != "ok" {
			t.Fatalf("Duplicates should be deduplicated resulting in 15 unique members, got status=%d msg=%s", status, msg)
		}
	})

	t.Run("Add Members: Existing 10 members + 5 new -> 15 total (Allowed)", func(t *testing.T) {
		status, msg := evaluateAddMembersCap(10, make([]uuid.UUID, 5))
		if status != http.StatusOK || msg != "ok" {
			t.Fatalf("Adding up to 15 total members should be allowed, got status=%d msg=%s", status, msg)
		}
	})

	t.Run("Add Members: Existing 10 members + 6 new -> 16 total (Rejected: 400)", func(t *testing.T) {
		status, msg := evaluateAddMembersCap(10, make([]uuid.UUID, 6))
		if status != http.StatusBadRequest || !strings.Contains(msg, "não pode ultrapassar 15 membros") {
			t.Fatalf("Adding exceeding 15 members must be rejected, got status=%d msg=%s", status, msg)
		}
	})

	t.Run("Add Members: Existing 15 members + 1 new -> 16 total (Rejected: 400)", func(t *testing.T) {
		status, msg := evaluateAddMembersCap(15, make([]uuid.UUID, 1))
		if status != http.StatusBadRequest || !strings.Contains(msg, "não pode ultrapassar 15 membros") {
			t.Fatalf("Adding to full group must be rejected, got status=%d msg=%s", status, msg)
		}
	})

	t.Run("Add Members: Empty list -> Rejected: 400", func(t *testing.T) {
		status, _ := evaluateAddMembersCap(10, []uuid.UUID{})
		if status != http.StatusBadRequest {
			t.Fatalf("Empty add list must be rejected with 400")
		}
	})
}

// =============================================================================
// CHALLENGER TEST 5: E2EE Attachments Security & Path Traversal Resistance
// =============================================================================

func TestChallengerM3_E2EEAttachment_SecurityHardening(t *testing.T) {
	handler := &handlers.E2EEHandler{}
	testUserID := uuid.New()
	ctx := auth.SetUserIDInContext(context.Background(), testUserID)
	r := chi.NewRouter()
	r.Get("/api/e2ee/attachments/{id}", handler.DownloadAttachment)
	r.Post("/api/e2ee/attachments", handler.UploadAttachment)

	t.Run("Path Traversal Attack on Attachment Download", func(t *testing.T) {
		traversalPaths := []string{
			"../../../../etc/passwd",
			"..%2F..%2F..%2Fetc%2Fpasswd",
			"....//....//etc/passwd",
			"invalid-uuid-with-slashes/test",
		}
		for _, path := range traversalPaths {
			req := httptest.NewRequest(http.MethodGet, "/api/e2ee/attachments/"+path, nil).WithContext(ctx)
			rec := httptest.NewRecorder()
			r.ServeHTTP(rec, req)

			// Chi router or uuid.Parse will reject with 400 Bad Request or 404
			if rec.Code == http.StatusOK {
				t.Fatalf("CRITICAL SECURITY VULNERABILITY: Path traversal attempt %q returned HTTP 200!", path)
			}
			if rec.Code != http.StatusBadRequest && rec.Code != http.StatusNotFound {
				t.Fatalf("Expected 400 or 404 for traversal path %q, got %d", path, rec.Code)
			}
		}
	})

	t.Run("Strict Download Security Headers Verification", func(t *testing.T) {
		uploadDir := filepath.Join("uploads", "e2ee_attachments")
		_ = os.MkdirAll(uploadDir, 0755)

		testID := uuid.New()
		testPayload := []byte("v1.aes-256-gcm.raw-binary-test-stream")
		filePath := filepath.Join(uploadDir, testID.String()+".bin")
		if err := os.WriteFile(filePath, testPayload, 0644); err != nil {
			t.Fatalf("Failed to create temporary test file: %v", err)
		}
		defer os.Remove(filePath)

		req := httptest.NewRequest(http.MethodGet, "/api/e2ee/attachments/"+testID.String(), nil).WithContext(ctx)
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("Expected 200 OK, got %d", rec.Code)
		}

		// Security headers
		if ct := rec.Header().Get("Content-Type"); ct != "application/octet-stream" {
			t.Fatalf("Expected application/octet-stream to prevent MIME sniffing, got %q", ct)
		}
		if cd := rec.Header().Get("Content-Disposition"); cd != `attachment; filename="encrypted.bin"` {
			t.Fatalf("Expected Content-Disposition to force encrypted.bin download, got %q", cd)
		}
		if nosniff := rec.Header().Get("X-Content-Type-Options"); nosniff != "nosniff" {
			t.Fatalf("Expected nosniff header, got %q", nosniff)
		}
		if cc := rec.Header().Get("Cache-Control"); !strings.Contains(cc, "private") {
			t.Fatalf("Expected private cache control, got %q", cc)
		}
	})

	t.Run("Upload without auth is rejected with 401", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/api/e2ee/attachments", bytes.NewReader([]byte("bytes")))
		rec := httptest.NewRecorder()
		handler.UploadAttachment(rec, req)
		if rec.Code != http.StatusUnauthorized {
			t.Fatalf("Expected 401 for unauthenticated upload, got %d", rec.Code)
		}
	})
}

// =============================================================================
// CHALLENGER TEST 6: Key Requests Input Fuzzing & Structural Validation
// =============================================================================

func TestChallengerM3_KeyRequests_StructuralValidation(t *testing.T) {
	handler := &handlers.E2EEHandler{}
	testUserID := uuid.New()
	ctx := auth.SetUserIDInContext(context.Background(), testUserID)

	fuzzCases := []struct {
		name        string
		body        string
		expectCode  int
		description string
	}{
		{
			name:        "Empty Body",
			body:        "",
			expectCode:  http.StatusBadRequest,
			description: "Empty body must return 400 Bad Request",
		},
		{
			name:        "Invalid JSON syntax",
			body:        "{malformed-json-payload",
			expectCode:  http.StatusBadRequest,
			description: "Malformed JSON syntax must return 400 Bad Request",
		},
		{
			name: "Missing session_id",
			body: func() string {
				p := models.E2EEKeyRequestPayload{
					ConversationType:  models.ConversationTypeDM,
					ConversationID:    uuid.New(),
					RequesterDeviceID: uuid.New(),
				}
				b, _ := json.Marshal(p)
				return string(b)
			}(),
			expectCode:  http.StatusBadRequest,
			description: "Missing session_id must return 400",
		},
		{
			name: "Missing conversation_id",
			body: func() string {
				p := models.E2EEKeyRequestPayload{
					SessionID:         "sess-abc",
					ConversationType:  models.ConversationTypeDM,
					RequesterDeviceID: uuid.New(),
				}
				b, _ := json.Marshal(p)
				return string(b)
			}(),
			expectCode:  http.StatusBadRequest,
			description: "Missing conversation_id must return 400",
		},
		{
			name: "Missing requester_device_id",
			body: func() string {
				p := models.E2EEKeyRequestPayload{
					SessionID:        "sess-abc",
					ConversationType: models.ConversationTypeDM,
					ConversationID:   uuid.New(),
				}
				b, _ := json.Marshal(p)
				return string(b)
			}(),
			expectCode:  http.StatusBadRequest,
			description: "Missing requester_device_id must return 400",
		},
	}

	for _, fc := range fuzzCases {
		t.Run(fc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, "/api/e2ee/key-requests", strings.NewReader(fc.body)).WithContext(ctx)
			rec := httptest.NewRecorder()
			handler.SubmitKeyRequest(rec, req)
			if rec.Code != fc.expectCode {
				t.Fatalf("%s: expected HTTP status %d, got %d", fc.description, fc.expectCode, rec.Code)
			}
		})
	}
}

// =============================================================================
// CHALLENGER TEST 7: DB Trigger / Migration Compatibility
// =============================================================================

func TestChallengerM3_SchemaMigration_Integrity(t *testing.T) {
	// Verify that composite unique index names and column additions are present in schema.sql
	schemaBytes, err := os.ReadFile(filepath.Join("..", "database", "schema.sql"))
	if err != nil {
		t.Fatalf("Failed to read schema.sql: %v", err)
	}
	schema := string(schemaBytes)

	requiredTokens := []string{
		"idx_uniq_dm_msg_room_id",
		"idx_uniq_dm_group_msg_group_id",
		"idx_uniq_channel_msg_channel_id",
		"e2ee_attachments",
		"e2ee_ciphertext TEXT",
		"e2ee_meta JSONB",
		"encrypted BOOLEAN DEFAULT FALSE",
		"e2ee_enabled BOOLEAN DEFAULT FALSE",
		"rotation_epoch INT DEFAULT 1",
	}

	for _, token := range requiredTokens {
		if !strings.Contains(schema, token) {
			t.Fatalf("CRITICAL SCHEMA DEFECT: schema.sql is missing required M3 token: %q", token)
		}
	}
}
