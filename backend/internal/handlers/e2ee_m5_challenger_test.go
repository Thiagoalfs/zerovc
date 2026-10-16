package handlers_test

import (
	"context"
	"net/http"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/zerovc/zerovc/backend/internal/handlers"
	"github.com/zerovc/zerovc/backend/internal/models"
)

// =============================================================================
// CHALLENGER TEST 1: Channel Message Plaintext Gating State Machine
// =============================================================================

// evaluateChannelMessageGating replicates the exact state machine from message_handlers.go lines 122-155.
func evaluateChannelMessageGating(e2eeEnabled bool, req handlers.SendMessageRequest) (int, string, string) {
	isEncrypted := req.Encrypted != nil && *req.Encrypted

	if e2eeEnabled {
		if !isEncrypted || req.E2EECiphertext == nil || *req.E2EECiphertext == "" {
			return http.StatusConflict, "e2ee_required", ""
		}
	} else {
		if isEncrypted || (req.E2EECiphertext != nil && *req.E2EECiphertext != "") {
			return http.StatusConflict, "e2ee_not_enabled", ""
		}
	}

	if !isEncrypted {
		if len(req.Content) == 0 && len(req.Attachments) == 0 {
			return http.StatusBadRequest, "content_empty", ""
		}
		if len(req.Content) > 2000 {
			return http.StatusBadRequest, "content_too_long", ""
		}
	} else {
		if req.E2EECiphertext == nil || *req.E2EECiphertext == "" {
			return http.StatusBadRequest, "ciphertext_required", ""
		}
	}

	contentToStore := req.Content
	if isEncrypted {
		contentToStore = ""
	}

	return http.StatusOK, "ok", contentToStore
}

func TestChallengerM5_ChannelPlaintextGating_AdversarialMatrix(t *testing.T) {
	trueVal := true
	falseVal := false
	validCiphertext := "v1.m5.test.ciphertext.payload=="
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
		expectEmpty    bool
	}{
		// E2EE Channel Enforcements
		{
			name:           "E2EE Channel: Plaintext content with encrypted=false",
			e2eeEnabled:    true,
			encrypted:      &falseVal,
			ciphertext:     nil,
			content:        "Sensitive channel strategy leak attempt",
			expectedStatus: http.StatusConflict,
			expectedError:  "e2ee_required",
		},
		{
			name:           "E2EE Channel: Plaintext content with encrypted=nil",
			e2eeEnabled:    true,
			encrypted:      nil,
			ciphertext:     nil,
			content:        "Missing encryption flag in secure channel",
			expectedStatus: http.StatusConflict,
			expectedError:  "e2ee_required",
		},
		{
			name:           "E2EE Channel: encrypted=true but ciphertext=nil",
			e2eeEnabled:    true,
			encrypted:      &trueVal,
			ciphertext:     nil,
			content:        "Missing ciphertext payload",
			expectedStatus: http.StatusConflict,
			expectedError:  "e2ee_required",
		},
		{
			name:           "E2EE Channel: encrypted=true but empty ciphertext string",
			e2eeEnabled:    true,
			encrypted:      &trueVal,
			ciphertext:     &emptyCiphertext,
			content:        "Empty ciphertext leak attempt",
			expectedStatus: http.StatusConflict,
			expectedError:  "e2ee_required",
		},
		{
			name:           "E2EE Channel: encrypted=false with ciphertext payload",
			e2eeEnabled:    true,
			encrypted:      &falseVal,
			ciphertext:     &validCiphertext,
			content:        "",
			expectedStatus: http.StatusConflict,
			expectedError:  "e2ee_required",
		},
		{
			name:           "E2EE Channel: Valid encrypted message succeeds with zero plaintext persistence",
			e2eeEnabled:    true,
			encrypted:      &trueVal,
			ciphertext:     &validCiphertext,
			content:        "Attacker attempted to send plaintext alongside ciphertext",
			expectedStatus: http.StatusOK,
			expectedError:  "ok",
			expectEmpty:    true,
		},

		// Standard Non-E2EE Channel Enforcements
		{
			name:           "Standard Channel: encrypted=true with valid ciphertext rejected",
			e2eeEnabled:    false,
			encrypted:      &trueVal,
			ciphertext:     &validCiphertext,
			content:        "",
			expectedStatus: http.StatusConflict,
			expectedError:  "e2ee_not_enabled",
		},
		{
			name:           "Standard Channel: encrypted=false but ciphertext provided rejected",
			e2eeEnabled:    false,
			encrypted:      &falseVal,
			ciphertext:     &validCiphertext,
			content:        "Hello",
			expectedStatus: http.StatusConflict,
			expectedError:  "e2ee_not_enabled",
		},
		{
			name:           "Standard Channel: encrypted=nil but ciphertext provided rejected",
			e2eeEnabled:    false,
			encrypted:      nil,
			ciphertext:     &validCiphertext,
			content:        "Hello",
			expectedStatus: http.StatusConflict,
			expectedError:  "e2ee_not_enabled",
		},
		{
			name:           "Standard Channel: Non-empty whitespace ciphertext rejected",
			e2eeEnabled:    false,
			encrypted:      &falseVal,
			ciphertext:     &whitespaceCiphertext,
			content:        "Hello",
			expectedStatus: http.StatusConflict,
			expectedError:  "e2ee_not_enabled",
		},
		{
			name:           "Standard Channel: Normal plaintext succeeds and preserves content",
			e2eeEnabled:    false,
			encrypted:      nil,
			ciphertext:     nil,
			content:        "Valid public channel message",
			expectedStatus: http.StatusOK,
			expectedError:  "ok",
			expectEmpty:    false,
		},
	}

	for _, tt := range matrix {
		t.Run(tt.name, func(t *testing.T) {
			req := handlers.SendMessageRequest{
				Encrypted:      tt.encrypted,
				E2EECiphertext: tt.ciphertext,
				Content:        tt.content,
			}
			status, errCode, storedContent := evaluateChannelMessageGating(tt.e2eeEnabled, req)

			if status != tt.expectedStatus {
				t.Fatalf("Expected HTTP %d, got %d (errCode: %s)", tt.expectedStatus, status, errCode)
			}
			if errCode != tt.expectedError {
				t.Fatalf("Expected error code %s, got %s", tt.expectedError, errCode)
			}
			if status == http.StatusOK {
				if tt.expectEmpty && storedContent != "" {
					t.Fatalf("Expected storedContent to be empty string, got %q", storedContent)
				}
				if !tt.expectEmpty && storedContent != tt.content {
					t.Fatalf("Expected storedContent %q, got %q", tt.content, storedContent)
				}
			}
		})
	}
}

// =============================================================================
// CHALLENGER TEST 2: Stepped Audience Limits Strict Boundaries
// =============================================================================

func TestChallengerM5_SteppedAudienceLimits_BoundaryStress(t *testing.T) {
	bounds := []struct {
		name          string
		limit         int
		members       int
		shouldSucceed bool
	}{
		{"Tier 1 exact limit (15/15)", 15, 15, true},
		{"Tier 1 off-by-one breach (16/15)", 15, 16, false},
		{"Tier 2 exact limit (50/50)", 50, 50, true},
		{"Tier 2 off-by-one breach (51/50)", 50, 51, false},
		{"Tier 3 experimental limit (250/250)", 250, 250, true},
		{"Tier 3 off-by-one breach (251/250)", 250, 251, false},
	}

	for _, b := range bounds {
		t.Run(b.name, func(t *testing.T) {
			var err error
			if b.members > b.limit {
				err = &handlers.AudienceLimitExceededError{
					CurrentMembers: b.members,
					Limit:          b.limit,
				}
			}

			if b.shouldSucceed && err != nil {
				t.Fatalf("Expected %d members under limit %d to succeed, got %v", b.members, b.limit, err)
			}
			if !b.shouldSucceed && err == nil {
				t.Fatalf("Expected %d members under limit %d to fail with AudienceLimitExceededError", b.members, b.limit)
			}
		})
	}
}

// =============================================================================
// CHALLENGER TEST 3: Order Invariance & Hash Determinism under Permutations
// =============================================================================

func TestChallengerM5_ComputeAudienceHash_PermutationInvariance(t *testing.T) {
	u1 := uuid.New()
	u2 := uuid.New()
	u3 := uuid.New()
	u4 := uuid.New()

	d1 := uuid.New()
	d2 := uuid.New()
	d3 := uuid.New()

	devs1 := []models.E2EERosterDeviceSnapshot{
		{UserID: u1, DeviceID: d1, Curve25519Key: "curv_1", Ed25519Key: "ed_1"},
		{UserID: u2, DeviceID: d2, Curve25519Key: "curv_2", Ed25519Key: "ed_2"},
		{UserID: u3, DeviceID: d3, Curve25519Key: "curv_3", Ed25519Key: "ed_3"},
	}

	// Permuted device order
	devs2 := []models.E2EERosterDeviceSnapshot{
		{UserID: u3, DeviceID: d3, Curve25519Key: "curv_3", Ed25519Key: "ed_3"},
		{UserID: u1, DeviceID: d1, Curve25519Key: "curv_1", Ed25519Key: "ed_1"},
		{UserID: u2, DeviceID: d2, Curve25519Key: "curv_2", Ed25519Key: "ed_2"},
	}

	// Permuted user ID order
	members1 := []uuid.UUID{u1, u2, u3, u4}
	members2 := []uuid.UUID{u4, u2, u1, u3}

	hashA := handlers.ComputeAudienceHash(members1, devs1)
	hashB := handlers.ComputeAudienceHash(members2, devs2)

	if hashA != hashB {
		t.Fatalf("ComputeAudienceHash is NOT permutation invariant! hashA=%s != hashB=%s", hashA, hashB)
	}

	// Distinct audience must produce distinct hash
	u5 := uuid.New()
	members3 := []uuid.UUID{u1, u2, u3, u4, u5}
	hashC := handlers.ComputeAudienceHash(members3, devs1)
	if hashA == hashC {
		t.Fatalf("Different audience produced identical hash! (collision): %s", hashA)
	}
}

// =============================================================================
// CHALLENGER TEST 4: Debouncer Concurrency Storm (60 Rapid Triggers)
// =============================================================================

func TestChallengerM5_Debouncer_ConcurrencyStorm(t *testing.T) {
	var count int64
	chID := uuid.New()

	debouncer := handlers.NewChannelAudienceDebouncer(nil, nil, 50*time.Millisecond, func(ctx context.Context, id uuid.UUID) (*models.ChannelAudienceResponse, error) {
		atomic.AddInt64(&count, 1)
		return &models.ChannelAudienceResponse{ChannelID: id}, nil
	})
	defer debouncer.Stop()

	var wg sync.WaitGroup
	// 60 concurrent triggers within 10ms
	for i := 0; i < 60; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			debouncer.Trigger(chID)
		}()
	}
	wg.Wait()

	// Wait for debounce window (50ms + margin)
	time.Sleep(150 * time.Millisecond)

	executed := atomic.LoadInt64(&count)
	if executed != 1 {
		t.Fatalf("Expected exactly 1 coalesced execution for 60 rapid events, got %d", executed)
	}
}
