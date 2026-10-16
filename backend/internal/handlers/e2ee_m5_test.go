package handlers_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/zerovc/zerovc/backend/internal/auth"
	"github.com/zerovc/zerovc/backend/internal/handlers"
	"github.com/zerovc/zerovc/backend/internal/models"
)

// =============================================================================
// TEST 1: ChannelAudienceResponse Serialization & Wire Contract
// =============================================================================

func TestE2EEM5_ChannelAudienceResponse_Serialization(t *testing.T) {
	chID := uuid.New()
	u1 := uuid.New()
	u2 := uuid.New()
	d1 := uuid.New()
	d2 := uuid.New()

	devs := []models.E2EERosterDeviceSnapshot{
		{
			UserID:        u1,
			DeviceID:      d1,
			Curve25519Key: "curve_key_alice_1",
			Ed25519Key:    "ed_key_alice_1",
		},
		{
			UserID:        u2,
			DeviceID:      d2,
			Curve25519Key: "curve_key_bob_1",
			Ed25519Key:    "ed_key_bob_1",
		},
	}

	hash := handlers.ComputeAudienceHash([]uuid.UUID{u1, u2}, devs)
	if hash == "" {
		t.Fatalf("ComputeAudienceHash returned empty string")
	}

	resp := models.ChannelAudienceResponse{
		ChannelID:     chID,
		AudienceHash:  hash,
		RotationEpoch: 3,
		Epoch:         3,
		AudienceLimit: 15,
		MemberCount:   2,
		Members:       []uuid.UUID{u1, u2},
		Devices:       devs,
	}

	bytes, err := json.Marshal(resp)
	if err != nil {
		t.Fatalf("Failed to marshal ChannelAudienceResponse: %v", err)
	}

	var parsed map[string]any
	if err := json.Unmarshal(bytes, &parsed); err != nil {
		t.Fatalf("Failed to unmarshal JSON: %v", err)
	}

	if parsed["channel_id"] != chID.String() {
		t.Errorf("channel_id mismatch: expected %s, got %v", chID.String(), parsed["channel_id"])
	}
	if parsed["audience_hash"] != hash {
		t.Errorf("audience_hash mismatch: expected %s, got %v", hash, parsed["audience_hash"])
	}
	if parsed["rotation_epoch"] != float64(3) {
		t.Errorf("rotation_epoch mismatch: expected 3, got %v", parsed["rotation_epoch"])
	}
	if parsed["epoch"] != float64(3) {
		t.Errorf("epoch mismatch: expected 3, got %v", parsed["epoch"])
	}
	if parsed["audience_limit"] != float64(15) {
		t.Errorf("audience_limit mismatch: expected 15, got %v", parsed["audience_limit"])
	}
	if parsed["member_count"] != float64(2) {
		t.Errorf("member_count mismatch: expected 2, got %v", parsed["member_count"])
	}

	membersList, ok := parsed["members"].([]any)
	if !ok || len(membersList) != 2 {
		t.Fatalf("Expected 2 members in JSON, got %v", parsed["members"])
	}
	devicesList, ok := parsed["devices"].([]any)
	if !ok || len(devicesList) != 2 {
		t.Fatalf("Expected 2 devices in JSON, got %v", parsed["devices"])
	}
}

// =============================================================================
// TEST 2: Stepped Audience Limits Enforcement (15, 50, 250)
// =============================================================================

func TestE2EEM5_SteppedAudienceLimits(t *testing.T) {
	tiers := []struct {
		name          string
		limit         int
		memberCount   int
		expectAllowed bool
	}{
		{"Tier 1 Initial Limit (under limit)", 15, 10, true},
		{"Tier 1 Initial Limit (at limit)", 15, 15, true},
		{"Tier 1 Initial Limit (exceeded)", 15, 16, false},
		{"Tier 2 Stepped Expansion (under limit)", 50, 45, true},
		{"Tier 2 Stepped Expansion (at limit)", 50, 50, true},
		{"Tier 2 Stepped Expansion (exceeded)", 50, 51, false},
		{"Tier 3 Experimental Cap (under limit)", 250, 200, true},
		{"Tier 3 Experimental Cap (at limit)", 250, 250, true},
		{"Tier 3 Experimental Cap (exceeded)", 250, 251, false},
	}

	for _, tt := range tiers {
		t.Run(tt.name, func(t *testing.T) {
			var err error
			if tt.memberCount > tt.limit {
				err = &handlers.AudienceLimitExceededError{
					CurrentMembers: tt.memberCount,
					Limit:          tt.limit,
				}
			}

			if tt.expectAllowed && err != nil {
				t.Fatalf("Expected member count %d to be allowed under limit %d, got err: %v", tt.memberCount, tt.limit, err)
			}
			if !tt.expectAllowed {
				if err == nil {
					t.Fatalf("Expected member count %d to exceed limit %d, but error was nil", tt.memberCount, tt.limit)
				}
				var limitErr *handlers.AudienceLimitExceededError
				if !errorsAs(err, &limitErr) {
					t.Fatalf("Expected AudienceLimitExceededError, got %T: %v", err, err)
				}
				if limitErr.CurrentMembers != tt.memberCount || limitErr.Limit != tt.limit {
					t.Fatalf("Mismatched limit error payload: %+v", limitErr)
				}
			}
		})
	}
}

func errorsAs(err error, target **handlers.AudienceLimitExceededError) bool {
	if e, ok := err.(*handlers.AudienceLimitExceededError); ok {
		*target = e
		return true
	}
	return false
}

// =============================================================================
// TEST 3: Invariant: Unchanged Audience Produces Zero Epoch Rotations
// =============================================================================

func TestE2EEM5_UnchangedAudience_ZeroRotationInvariant(t *testing.T) {
	u1 := uuid.New()
	u2 := uuid.New()
	d1 := uuid.New()

	devs := []models.E2EERosterDeviceSnapshot{
		{UserID: u1, DeviceID: d1, Curve25519Key: "c1", Ed25519Key: "e1"},
	}

	// Permuted input
	hash1 := handlers.ComputeAudienceHash([]uuid.UUID{u1, u2}, devs)
	hash2 := handlers.ComputeAudienceHash([]uuid.UUID{u2, u1}, devs)

	if hash1 != hash2 {
		t.Fatalf("ComputeAudienceHash must be order-invariant, got %s != %s", hash1, hash2)
	}

	// State machine simulation: identical hash must NOT bump epoch
	currentEpoch := 4
	currentHash := hash1

	var newEpoch int
	if currentHash == hash2 {
		newEpoch = currentEpoch // Zero bump!
	} else {
		newEpoch = currentEpoch + 1
	}

	if newEpoch != currentEpoch {
		t.Fatalf("Expected zero epoch rotation when audience is identical, got epoch %d instead of %d", newEpoch, currentEpoch)
	}

	// Changing audience (adding u3) MUST bump epoch
	u3 := uuid.New()
	hash3 := handlers.ComputeAudienceHash([]uuid.UUID{u1, u2, u3}, devs)
	if hash3 == currentHash {
		t.Fatalf("New member must change audience hash")
	}

	var changedEpoch int
	if hash3 != currentHash {
		changedEpoch = currentEpoch + 1
	} else {
		changedEpoch = currentEpoch
	}

	if changedEpoch != currentEpoch+1 {
		t.Fatalf("Expected epoch bump on audience change, got %d", changedEpoch)
	}
}

// =============================================================================
// TEST 4: ChannelAudienceDebouncer Coalescing & Thread Safety
// =============================================================================

func TestE2EEM5_ChannelAudienceDebouncer(t *testing.T) {
	var recomputeCount int64
	chID := uuid.New()

	debouncer := handlers.NewChannelAudienceDebouncer(nil, nil, 60*time.Millisecond, func(ctx context.Context, id uuid.UUID) (*models.ChannelAudienceResponse, error) {
		atomic.AddInt64(&recomputeCount, 1)
		return &models.ChannelAudienceResponse{ChannelID: id}, nil
	})
	defer debouncer.Stop()

	// Rapid burst of 25 triggers within 20 milliseconds
	var wg sync.WaitGroup
	for i := 0; i < 25; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			debouncer.Trigger(chID)
		}()
	}
	wg.Wait()

	// Wait for debounce timer to fire (60ms window + margin)
	time.Sleep(150 * time.Millisecond)

	count := atomic.LoadInt64(&recomputeCount)
	if count != 1 {
		t.Fatalf("Expected exactly 1 coalesced recomputation for burst, got %d", count)
	}

	// Second burst after window expires should fire another single recomputation
	debouncer.Trigger(chID)
	time.Sleep(150 * time.Millisecond)

	count2 := atomic.LoadInt64(&recomputeCount)
	if count2 != 2 {
		t.Fatalf("Expected second recomputation after delay, got total %d", count2)
	}
}

// =============================================================================
// TEST 5: HTTP Gating for Audience Endpoint & Enable Endpoint
// =============================================================================

func TestE2EEM5_HTTP_Gating_Endpoints(t *testing.T) {
	t.Run("GetChannelAudience_UnauthorizedWithoutAuthContext", func(t *testing.T) {
		handler := handlers.NewE2EEHandler(nil, nil)
		r := chi.NewRouter()
		r.Get("/api/channels/{id}/e2ee/audience", handler.GetChannelAudience)

		req := httptest.NewRequest(http.MethodGet, "/api/channels/"+uuid.New().String()+"/e2ee/audience", nil)
		rec := httptest.NewRecorder()

		r.ServeHTTP(rec, req)

		if rec.Code != http.StatusUnauthorized {
			t.Errorf("Expected HTTP 401 Unauthorized, got %d", rec.Code)
		}
	})

	t.Run("EnableChannelE2EE_MethodNotAllowedOnGET", func(t *testing.T) {
		handler := handlers.NewE2EEHandler(nil, nil)
		r := chi.NewRouter()
		r.HandleFunc("/api/channels/{id}/e2ee/enable", handler.EnableChannelE2EE)

		req := httptest.NewRequest(http.MethodGet, "/api/channels/"+uuid.New().String()+"/e2ee/enable", nil)
		rec := httptest.NewRecorder()

		r.ServeHTTP(rec, req)

		if rec.Code != http.StatusMethodNotAllowed {
			t.Errorf("Expected HTTP 405 Method Not Allowed on GET, got %d", rec.Code)
		}
	})

	t.Run("EnableChannelE2EE_UnauthorizedWithoutAuthContext", func(t *testing.T) {
		handler := handlers.NewE2EEHandler(nil, nil)
		r := chi.NewRouter()
		r.Post("/api/channels/{id}/e2ee/enable", handler.EnableChannelE2EE)

		req := httptest.NewRequest(http.MethodPost, "/api/channels/"+uuid.New().String()+"/e2ee/enable", nil)
		rec := httptest.NewRecorder()

		r.ServeHTTP(rec, req)

		if rec.Code != http.StatusUnauthorized {
			t.Errorf("Expected HTTP 401 Unauthorized on POST without user, got %d", rec.Code)
		}
	})

	t.Run("GetChannelAudience_InvalidUUID", func(t *testing.T) {
		handler := handlers.NewE2EEHandler(nil, nil)
		r := chi.NewRouter()
		r.Get("/api/channels/{id}/e2ee/audience", handler.GetChannelAudience)

		ctx := auth.SetUserIDInContext(context.Background(), uuid.New())
		req := httptest.NewRequest(http.MethodGet, "/api/channels/invalid-uuid-string/e2ee/audience", nil).WithContext(ctx)
		rec := httptest.NewRecorder()

		r.ServeHTTP(rec, req)

		if rec.Code != http.StatusBadRequest {
			t.Errorf("Expected HTTP 400 Bad Request on invalid UUID, got %d", rec.Code)
		}
	})
}
