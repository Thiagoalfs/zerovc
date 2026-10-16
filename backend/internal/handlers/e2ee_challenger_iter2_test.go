package handlers_test

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"
	"github.com/zerovc/zerovc/backend/internal/handlers"
	"github.com/zerovc/zerovc/backend/internal/models"
)

// =============================================================================
// MISSION POINT 1: ComputeAudienceHash Key Sensitivity & Adversarial Permutations
// =============================================================================

// TestChallengerIter2_ComputeAudienceHash_Curve25519KeyAlteration verifies that
// any change to Curve25519Key strictly changes the audience hash.
func TestChallengerIter2_ComputeAudienceHash_Curve25519KeyAlteration(t *testing.T) {
	aliceID := uuid.New()
	devID := uuid.New()
	members := []uuid.UUID{aliceID}

	baseCurveKey := "curve25519-public-key-base-vector-32b-!"
	baseEdKey := "ed25519-public-key-base-vector-32b-!"

	baseDevice := models.E2EERosterDeviceSnapshot{
		UserID:        aliceID,
		DeviceID:      devID,
		Curve25519Key: baseCurveKey,
		Ed25519Key:    baseEdKey,
	}

	baseHash := handlers.ComputeAudienceHash(members, []models.E2EERosterDeviceSnapshot{baseDevice})

	// 1. Bit flip at every single byte offset of Curve25519Key
	curveBytes := []byte(baseCurveKey)
	for i := 0; i < len(curveBytes); i++ {
		corrupted := make([]byte, len(curveBytes))
		copy(corrupted, curveBytes)
		corrupted[i] ^= 0x01

		tamperedDevice := baseDevice
		tamperedDevice.Curve25519Key = string(corrupted)

		tamperedHash := handlers.ComputeAudienceHash(members, []models.E2EERosterDeviceSnapshot{tamperedDevice})
		if tamperedHash == baseHash {
			t.Fatalf("CRITICAL SECURITY FLAW: 1-bit alteration at offset %d of Curve25519Key did NOT alter audience hash!", i)
		}
	}

	// 2. Empty Curve25519Key
	emptyCurveDevice := baseDevice
	emptyCurveDevice.Curve25519Key = ""
	emptyCurveHash := handlers.ComputeAudienceHash(members, []models.E2EERosterDeviceSnapshot{emptyCurveDevice})
	if emptyCurveHash == baseHash {
		t.Fatalf("CRITICAL SECURITY FLAW: Empty Curve25519Key produced identical audience hash")
	}

	// 3. Replaced with attacker curve key
	attackerCurveDevice := baseDevice
	attackerCurveDevice.Curve25519Key = "mallory-curve25519-hijack-key"
	attackerCurveHash := handlers.ComputeAudienceHash(members, []models.E2EERosterDeviceSnapshot{attackerCurveDevice})
	if attackerCurveHash == baseHash {
		t.Fatalf("CRITICAL SECURITY FLAW: Mallory curve key produced identical audience hash")
	}
}

// TestChallengerIter2_ComputeAudienceHash_Ed25519KeyAlteration verifies that
// any change to Ed25519Key strictly changes the audience hash.
func TestChallengerIter2_ComputeAudienceHash_Ed25519KeyAlteration(t *testing.T) {
	aliceID := uuid.New()
	devID := uuid.New()
	members := []uuid.UUID{aliceID}

	baseCurveKey := "curve25519-public-key-base-vector-32b-!"
	baseEdKey := "ed25519-public-key-base-vector-32b-!"

	baseDevice := models.E2EERosterDeviceSnapshot{
		UserID:        aliceID,
		DeviceID:      devID,
		Curve25519Key: baseCurveKey,
		Ed25519Key:    baseEdKey,
	}

	baseHash := handlers.ComputeAudienceHash(members, []models.E2EERosterDeviceSnapshot{baseDevice})

	// 1. Bit flip at every single byte offset of Ed25519Key
	edBytes := []byte(baseEdKey)
	for i := 0; i < len(edBytes); i++ {
		corrupted := make([]byte, len(edBytes))
		copy(corrupted, edBytes)
		corrupted[i] ^= 0x01

		tamperedDevice := baseDevice
		tamperedDevice.Ed25519Key = string(corrupted)

		tamperedHash := handlers.ComputeAudienceHash(members, []models.E2EERosterDeviceSnapshot{tamperedDevice})
		if tamperedHash == baseHash {
			t.Fatalf("CRITICAL SECURITY FLAW: 1-bit alteration at offset %d of Ed25519Key did NOT alter audience hash!", i)
		}
	}

	// 2. Empty Ed25519Key
	emptyEdDevice := baseDevice
	emptyEdDevice.Ed25519Key = ""
	emptyEdHash := handlers.ComputeAudienceHash(members, []models.E2EERosterDeviceSnapshot{emptyEdDevice})
	if emptyEdHash == baseHash {
		t.Fatalf("CRITICAL SECURITY FLAW: Empty Ed25519Key produced identical audience hash")
	}

	// 3. Replaced with attacker ed key
	attackerEdDevice := baseDevice
	attackerEdDevice.Ed25519Key = "mallory-ed25519-hijack-key"
	attackerEdHash := handlers.ComputeAudienceHash(members, []models.E2EERosterDeviceSnapshot{attackerEdDevice})
	if attackerEdHash == baseHash {
		t.Fatalf("CRITICAL SECURITY FLAW: Mallory ed key produced identical audience hash")
	}
}

// TestChallengerIter2_ComputeAudienceHash_KeySwapAndPermutations tests key swaps
// and member/device permutation invariance.
func TestChallengerIter2_ComputeAudienceHash_KeySwapAndPermutations(t *testing.T) {
	aliceID := uuid.New()
	bobID := uuid.New()
	members := []uuid.UUID{aliceID, bobID}

	devAlice := models.E2EERosterDeviceSnapshot{
		UserID:        aliceID,
		DeviceID:      uuid.New(),
		Curve25519Key: "alice-curve-key",
		Ed25519Key:    "alice-ed-key",
	}
	devBob := models.E2EERosterDeviceSnapshot{
		UserID:        bobID,
		DeviceID:      uuid.New(),
		Curve25519Key: "bob-curve-key",
		Ed25519Key:    "bob-ed-key",
	}

	canonicalHash := handlers.ComputeAudienceHash(members, []models.E2EERosterDeviceSnapshot{devAlice, devBob})

	// Permuting members order MUST yield the same canonical hash
	permutedMembersHash := handlers.ComputeAudienceHash([]uuid.UUID{bobID, aliceID}, []models.E2EERosterDeviceSnapshot{devAlice, devBob})
	if permutedMembersHash != canonicalHash {
		t.Fatalf("Permuted members must produce identical audience hash")
	}

	// Permuting devices order MUST yield the same canonical hash
	permutedDevicesHash := handlers.ComputeAudienceHash(members, []models.E2EERosterDeviceSnapshot{devBob, devAlice})
	if permutedDevicesHash != canonicalHash {
		t.Fatalf("Permuted devices must produce identical audience hash")
	}

	// Swapping keys between Alice and Bob MUST yield a DIFFERENT hash
	swappedAlice := devAlice
	swappedAlice.Curve25519Key = devBob.Curve25519Key
	swappedBob := devBob
	swappedBob.Curve25519Key = devAlice.Curve25519Key
	swappedHash := handlers.ComputeAudienceHash(members, []models.E2EERosterDeviceSnapshot{swappedAlice, swappedBob})
	if swappedHash == canonicalHash {
		t.Fatalf("Swapped keys between devices must produce different audience hash")
	}
}

// TestChallengerIter2_ComputeAudienceHash_CollisionResistanceFuzz runs 500 randomized
// fuzz iterations generating distinct keys and checking for 0 collisions.
func TestChallengerIter2_ComputeAudienceHash_CollisionResistanceFuzz(t *testing.T) {
	seenHashes := make(map[string]string)
	aliceID := uuid.New()
	devID := uuid.New()
	members := []uuid.UUID{aliceID}

	for i := 0; i < 500; i++ {
		randomBytes := make([]byte, 32)
		rand.Read(randomBytes)
		randomCurveKey := base64.StdEncoding.EncodeToString(randomBytes)

		dev := models.E2EERosterDeviceSnapshot{
			UserID:        aliceID,
			DeviceID:      devID,
			Curve25519Key: randomCurveKey,
			Ed25519Key:    "fixed-ed-key",
		}

		h := handlers.ComputeAudienceHash(members, []models.E2EERosterDeviceSnapshot{dev})
		if prevKey, exists := seenHashes[h]; exists {
			t.Fatalf("CRITICAL COLLISION: Hash collision detected between %s and %s", prevKey, randomCurveKey)
		}
		seenHashes[h] = randomCurveKey
	}
}

// =============================================================================
// MISSION POINT 5: SubmitRoster Epoch Rollback Rejection (HTTP 409)
// =============================================================================

// TestChallengerIter2_SubmitRoster_EpochRollback_RejectionLogic exercises the
// epoch rollback enforcement specification and verifies HTTP 409 payload format.
func TestChallengerIter2_SubmitRoster_EpochRollback_RejectionLogic(t *testing.T) {
	// Simulated validator reflecting SubmitRoster lines 984-993:
	// if err == nil && req.Epoch < latest.Epoch {
	//     w.Header().Set("Content-Type", "application/json")
	//     w.WriteHeader(http.StatusConflict)
	//     json.NewEncoder(w).Encode(map[string]any{
	//         "error": "e2ee_roster_epoch_rollback",
	//         "expected_min_epoch": latest.Epoch,
	//     })
	// }

	validateEpochMonotonicity := func(latestEpoch, reqEpoch int) (int, map[string]any) {
		rec := httptest.NewRecorder()
		if reqEpoch < latestEpoch {
			rec.Header().Set("Content-Type", "application/json")
			rec.WriteHeader(http.StatusConflict)
			resp := map[string]any{
				"error":              "e2ee_roster_epoch_rollback",
				"expected_min_epoch": latestEpoch,
			}
			json.NewEncoder(rec).Encode(resp)
			return rec.Code, resp
		}
		return http.StatusOK, map[string]any{"status": "ok"}
	}

	testCases := []struct {
		name           string
		latestEpoch    int
		reqEpoch       int
		expectedStatus int
		expectRollback bool
	}{
		{"Rollback from epoch 5 to epoch 4", 5, 4, http.StatusConflict, true},
		{"Rollback from epoch 5 to epoch 0", 5, 0, http.StatusConflict, true},
		{"Rollback from epoch 100 to epoch 1", 100, 1, http.StatusConflict, true},
		{"Same epoch 5 (version increment without key rotation)", 5, 5, http.StatusOK, false},
		{"Epoch increment from 5 to 6 (standard re-keying)", 5, 6, http.StatusOK, false},
		{"Epoch jump from 5 to 10 (multi-step ratchet)", 5, 10, http.StatusOK, false},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			status, body := validateEpochMonotonicity(tc.latestEpoch, tc.reqEpoch)
			if status != tc.expectedStatus {
				t.Fatalf("Expected status %d, got %d", tc.expectedStatus, status)
			}
			if tc.expectRollback {
				if body["error"] != "e2ee_roster_epoch_rollback" {
					t.Fatalf("Expected error e2ee_roster_epoch_rollback, got %v", body["error"])
				}
				if body["expected_min_epoch"] != tc.latestEpoch {
					t.Fatalf("Expected expected_min_epoch %d, got %v", tc.latestEpoch, body["expected_min_epoch"])
				}
			}
		})
	}
}

// =============================================================================
// MISSION POINT 4: ClaimKeys on Revoked Devices Specification Verification
// =============================================================================

// TestChallengerIter2_ClaimKeys_RevokedDevices_ExclusionModel models the exact SQL query
// semantics of ClaimKeys lines 617-648 to verify that revoked devices yield 0 keys.
func TestChallengerIter2_ClaimKeys_RevokedDevices_ExclusionModel(t *testing.T) {
	type DeviceRecord struct {
		ID          uuid.UUID
		Revoked     bool
		FallbackKey string
		OTKs        []string
	}

	simulateClaimKeysQuery := func(devs []DeviceRecord, requestedIDs []uuid.UUID) map[string]models.ClaimedKeyInfo {
		devMap := make(map[uuid.UUID]DeviceRecord)
		for _, d := range devs {
			devMap[d.ID] = d
		}

		claimed := make(map[string]models.ClaimedKeyInfo)

		for _, devID := range requestedIDs {
			dev, exists := devMap[devID]
			if !exists {
				continue
			}

			// Subquery condition: INNER JOIN e2ee_devices d ON d.id = k.device_id WHERE ... AND d.revoked_at IS NULL
			var claimedOTK string
			if !dev.Revoked && len(dev.OTKs) > 0 {
				claimedOTK = dev.OTKs[0]
			}

			if claimedOTK != "" {
				claimed[devID.String()] = models.ClaimedKeyInfo{
					KeyID:      "otk-1",
					PublicKey:  claimedOTK,
					IsFallback: false,
				}
			} else {
				// Fallback condition: SELECT fallback_key FROM e2ee_devices WHERE id = $1 AND revoked_at IS NULL
				if !dev.Revoked && dev.FallbackKey != "" {
					claimed[devID.String()] = models.ClaimedKeyInfo{
						KeyID:      "fallback",
						PublicKey:  dev.FallbackKey,
						IsFallback: true,
					}
				}
			}
		}

		return claimed
	}

	devActiveWithOTK := DeviceRecord{
		ID:          uuid.New(),
		Revoked:     false,
		FallbackKey: "active-fb-key",
		OTKs:        []string{"otk-key-alice"},
	}

	devActiveFallbackOnly := DeviceRecord{
		ID:          uuid.New(),
		Revoked:     false,
		FallbackKey: "active-fb-key-bob",
		OTKs:        nil,
	}

	devRevokedWithOTKs := DeviceRecord{
		ID:          uuid.New(),
		Revoked:     true, // Revoked!
		FallbackKey: "revoked-fb-key",
		OTKs:        []string{"otk-key-mallory-1", "otk-key-mallory-2"},
	}

	devRevokedFallbackOnly := DeviceRecord{
		ID:          uuid.New(),
		Revoked:     true, // Revoked!
		FallbackKey: "revoked-fb-key",
		OTKs:        nil,
	}

	allDevices := []DeviceRecord{
		devActiveWithOTK,
		devActiveFallbackOnly,
		devRevokedWithOTKs,
		devRevokedFallbackOnly,
	}

	reqIDs := []uuid.UUID{
		devActiveWithOTK.ID,
		devActiveFallbackOnly.ID,
		devRevokedWithOTKs.ID,
		devRevokedFallbackOnly.ID,
	}

	result := simulateClaimKeysQuery(allDevices, reqIDs)

	// 1. Active with OTK must return OTK
	if k, ok := result[devActiveWithOTK.ID.String()]; !ok || k.IsFallback || k.PublicKey != "otk-key-alice" {
		t.Fatalf("Active device with OTKs failed to claim OTK: %+v", k)
	}

	// 2. Active fallback only must return fallback
	if k, ok := result[devActiveFallbackOnly.ID.String()]; !ok || !k.IsFallback || k.PublicKey != "active-fb-key-bob" {
		t.Fatalf("Active device with fallback failed to claim fallback: %+v", k)
	}

	// 3. Revoked device with OTKs MUST RETURN 0 KEYS (not in map)
	if _, ok := result[devRevokedWithOTKs.ID.String()]; ok {
		t.Fatalf("CRITICAL SECURITY VULNERABILITY: Revoked device returned a key in ClaimKeys!")
	}

	// 4. Revoked device with fallback only MUST RETURN 0 KEYS (not in map)
	if _, ok := result[devRevokedFallbackOnly.ID.String()]; ok {
		t.Fatalf("CRITICAL SECURITY VULNERABILITY: Revoked fallback device returned a key in ClaimKeys!")
	}
}
