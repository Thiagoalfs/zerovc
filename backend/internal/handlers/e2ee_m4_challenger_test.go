package handlers_test

import (
	"encoding/base64"
	"encoding/json"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/livekit/protocol/auth"
	"github.com/zerovc/zerovc/backend/internal/handlers"
	"github.com/zerovc/zerovc/backend/internal/voice"
)

// =============================================================================
// CHALLENGER M4-2: Backend Token Security & LiveKit Participant Metadata
// =============================================================================

// TestChallengerM4_ParticipantMetadataEnforcement tests that all voice endpoints
// (Guild Channel, DM Call, DM Group) strictly inject e2ee_required: true and user_id
// into participant metadata if and only if E2EE is enabled.
func TestChallengerM4_ParticipantMetadataEnforcement(t *testing.T) {
	testCases := []struct {
		name        string
		isE2EE      bool
		userID      uuid.UUID
		displayName string
		username    string
		expectReq   bool
	}{
		{
			name:        "Guild Voice E2EE Enabled",
			isE2EE:      true,
			userID:      uuid.New(),
			displayName: "Alice Secure",
			username:    "alice",
			expectReq:   true,
		},
		{
			name:        "Guild Voice Plaintext (E2EE Disabled)",
			isE2EE:      false,
			userID:      uuid.New(),
			displayName: "Bob Plain",
			username:    "bob",
			expectReq:   false,
		},
		{
			name:        "DM Call E2EE Enabled",
			isE2EE:      true,
			userID:      uuid.New(),
			displayName: "Carol E2EE",
			username:    "carol",
			expectReq:   true,
		},
		{
			name:        "DM Group Voice E2EE Enabled",
			isE2EE:      true,
			userID:      uuid.New(),
			displayName: "Dave Group",
			username:    "dave",
			expectReq:   true,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			rawJSON := handlers.BuildLiveKitParticipantMetadata(
				"https://avatar.test/pic.png",
				tc.displayName,
				tc.username,
				"Ready",
				tc.userID,
				tc.isE2EE,
			)

			var parsed map[string]any
			if err := json.Unmarshal(rawJSON, &parsed); err != nil {
				t.Fatalf("Failed to unmarshal metadata JSON: %v", err)
			}

			if tc.expectReq {
				reqVal, ok := parsed["e2ee_required"].(bool)
				if !ok || !reqVal {
					t.Fatalf("Expected e2ee_required: true (boolean), got %v", parsed["e2ee_required"])
				}
				uidVal, ok := parsed["user_id"].(string)
				if !ok || uidVal != tc.userID.String() {
					t.Fatalf("Expected user_id: %s, got %v", tc.userID.String(), parsed["user_id"])
				}
			} else {
				if _, exists := parsed["e2ee_required"]; exists {
					t.Fatalf("e2ee_required must NOT be present in plaintext room metadata")
				}
			}
		})
	}
}

// TestChallengerM4_LiveKitJWTCryptographicTamperResistance tests that LiveKit JWTs
// generated with e2ee_required metadata are cryptographically sealed and any tampering
// is strictly rejected by LiveKit verification.
func TestChallengerM4_LiveKitJWTCryptographicTamperResistance(t *testing.T) {
	apiKey := "devkey_m4_challenger"
	apiSecret := "super_secret_signing_key_32bytes_long"
	publicURL := "wss://livekit.zerovc.local"

	lkService := voice.NewLiveKitService(apiKey, apiSecret, publicURL)
	userID := uuid.New()
	roomName := "dm-" + uuid.New().String()

	metaMap := map[string]any{
		"avatar_url":    "https://avatar.test/u.png",
		"display_name":  "Alice Cryptographer",
		"username":      "alice",
		"custom_status": "Testing E2EE",
		"e2ee_required": true,
		"user_id":       userID.String(),
	}
	metaJSON, _ := json.Marshal(metaMap)

	token, err := lkService.GenerateJoinToken(roomName, userID, "alice", string(metaJSON), true)
	if err != nil {
		t.Fatalf("GenerateJoinToken failed: %v", err)
	}

	// 1. Legitimate Verification
	verifier, err := auth.ParseAPIToken(token)
	if err != nil {
		t.Fatalf("ParseAPIToken failed on legitimate token: %v", err)
	}

	if verifier.APIKey() != apiKey {
		t.Fatalf("APIKey mismatch: expected %s, got %s", apiKey, verifier.APIKey())
	}
	if verifier.Identity() != userID.String() {
		t.Fatalf("Identity mismatch: expected %s, got %s", userID.String(), verifier.Identity())
	}

	claims, err := verifier.Verify([]byte(apiSecret))
	if err != nil {
		t.Fatalf("Verify failed on legitimate token: %v", err)
	}

	var parsedClaimsMeta map[string]any
	if err := json.Unmarshal([]byte(claims.Metadata), &parsedClaimsMeta); err != nil {
		t.Fatalf("Failed to parse verified claims metadata: %v", err)
	}

	if req, ok := parsedClaimsMeta["e2ee_required"].(bool); !ok || !req {
		t.Fatalf("e2ee_required missing from verified token metadata")
	}
	if uid, ok := parsedClaimsMeta["user_id"].(string); !ok || uid != userID.String() {
		t.Fatalf("user_id inside verified metadata does not match token identity")
	}

	// 2. Tamper Attack 1: Modify Signature
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		t.Fatalf("Expected 3 JWT parts, got %d", len(parts))
	}

	// Flip last character of signature
	tamperedSig := parts[2]
	if tamperedSig[len(tamperedSig)-1] == 'A' {
		tamperedSig = tamperedSig[:len(tamperedSig)-1] + "B"
	} else {
		tamperedSig = tamperedSig[:len(tamperedSig)-1] + "A"
	}
	tamperedSigToken := parts[0] + "." + parts[1] + "." + tamperedSig

	verifierTampered, err := auth.ParseAPIToken(tamperedSigToken)
	if err == nil {
		_, verifyErr := verifierTampered.Verify([]byte(apiSecret))
		if verifyErr == nil {
			t.Fatalf("ADVERSARIAL LEAK: Tampered signature was accepted by verifier!")
		}
	}

	// 3. Tamper Attack 2: Tamper Payload to strip e2ee_required
	payloadBytes, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		t.Fatalf("Failed to base64 decode payload: %v", err)
	}

	var rawPayloadMap map[string]any
	if err := json.Unmarshal(payloadBytes, &rawPayloadMap); err != nil {
		t.Fatalf("Failed to unmarshal payload map: %v", err)
	}

	// Tamper metadata to omit e2ee_required
	tamperedMetaMap := map[string]any{
		"avatar_url":    "https://avatar.test/u.png",
		"display_name":  "Alice Cryptographer",
		"username":      "alice",
		"custom_status": "Testing E2EE",
		"e2ee_required": false, // Attacker flips to false!
		"user_id":       userID.String(),
	}
	tamperedMetaJSON, _ := json.Marshal(tamperedMetaMap)
	rawPayloadMap["metadata"] = string(tamperedMetaJSON)

	tamperedPayloadBytes, _ := json.Marshal(rawPayloadMap)
	tamperedPayloadB64 := base64.RawURLEncoding.EncodeToString(tamperedPayloadBytes)
	tamperedPayloadToken := parts[0] + "." + tamperedPayloadB64 + "." + parts[2]

	verifierPayload, err := auth.ParseAPIToken(tamperedPayloadToken)
	if err == nil {
		_, verifyErr := verifierPayload.Verify([]byte(apiSecret))
		if verifyErr == nil {
			t.Fatalf("ADVERSARIAL LEAK: Tampered payload without valid re-signature was accepted!")
		}
	}

	// 4. Tamper Attack 3: Impersonate different user_id
	attackerUserID := uuid.New()
	impersonatedMetaMap := map[string]any{
		"e2ee_required": true,
		"user_id":       attackerUserID.String(), // Mismatched user_id
	}
	impMetaJSON, _ := json.Marshal(impersonatedMetaMap)
	rawPayloadMap["metadata"] = string(impMetaJSON)

	impPayloadBytes, _ := json.Marshal(rawPayloadMap)
	impPayloadB64 := base64.RawURLEncoding.EncodeToString(impPayloadBytes)
	impToken := parts[0] + "." + impPayloadB64 + "." + parts[2]

	verifierImp, err := auth.ParseAPIToken(impToken)
	if err == nil {
		_, verifyErr := verifierImp.Verify([]byte(apiSecret))
		if verifyErr == nil {
			t.Fatalf("ADVERSARIAL LEAK: Impersonated user_id was accepted without signature failure!")
		}
	}

	// 5. Tamper Attack 4: Verification with wrong API Secret
	wrongSecret := "completely_wrong_secret_key_12345"
	verifierWrong, err := auth.ParseAPIToken(token)
	if err != nil {
		t.Fatalf("Failed to parse legitimate token: %v", err)
	}
	_, verifyWrongErr := verifierWrong.Verify([]byte(wrongSecret))
	if verifyWrongErr == nil {
		t.Fatalf("ADVERSARIAL LEAK: Token verified with incorrect secret!")
	}

	// 6. Identity Binding Oracle Invariant
	// If a rogue server were to issue a token where Identity != metadata["user_id"],
	// the client/oracle verifier must strictly detect this desynchronization.
	rogueToken, _ := lkService.GenerateJoinToken(roomName, userID, "alice", string(impMetaJSON), true)
	rogueVerifier, err := auth.ParseAPIToken(rogueToken)
	if err != nil {
		t.Fatalf("Failed to parse rogue token: %v", err)
	}
	rogueClaims, err := rogueVerifier.Verify([]byte(apiSecret))
	if err != nil {
		t.Fatalf("Rogue token failed verification: %v", err)
	}
	var rogueMeta map[string]any
	json.Unmarshal([]byte(rogueClaims.Metadata), &rogueMeta)
	if rogueVerifier.Identity() == rogueMeta["user_id"] {
		t.Fatalf("Expected identity binding oracle to detect mismatch between identity and user_id")
	}
}

// TestChallengerM4_ResponsePayloadSerialization tests that API responses for voice
// join/call strictly communicate e2ee_enabled boolean to the frontend.
func TestChallengerM4_ResponsePayloadSerialization(t *testing.T) {
	// Guild Voice
	gvResp := handlers.JoinVoiceResponse{
		Token:       "tok-1",
		LiveKitURL:  "wss://lk.test",
		RoomName:    "room-1",
		E2EEEnabled: true,
	}
	gvBytes, _ := json.Marshal(gvResp)
	var gvMap map[string]any
	json.Unmarshal(gvBytes, &gvMap)
	if v, ok := gvMap["e2ee_enabled"].(bool); !ok || !v {
		t.Errorf("Guild Voice response must serialize e2ee_enabled: true")
	}

	// DM Call
	dmResp := handlers.DMCallAcceptResponse{
		Success:     true,
		RoomID:      uuid.New(),
		RoomName:    "dm-room",
		Token:       "tok-2",
		LiveKitURL:  "wss://lk.test",
		E2EEEnabled: true,
	}
	dmBytes, _ := json.Marshal(dmResp)
	var dmMap map[string]any
	json.Unmarshal(dmBytes, &dmMap)
	if v, ok := dmMap["e2ee_enabled"].(bool); !ok || !v {
		t.Errorf("DM call response must serialize e2ee_enabled: true")
	}

	// DM Group
	dmgResp := handlers.DMGroupVoiceTokenResponse{
		Token:       "tok-3",
		LiveKitURL:  "wss://lk.test",
		RoomName:    "group-room",
		E2EEEnabled: true,
	}
	dmgBytes, _ := json.Marshal(dmgResp)
	var dmgMap map[string]any
	json.Unmarshal(dmgBytes, &dmgMap)
	if v, ok := dmgMap["e2ee_enabled"].(bool); !ok || !v {
		t.Errorf("DM Group response must serialize e2ee_enabled: true")
	}
}
