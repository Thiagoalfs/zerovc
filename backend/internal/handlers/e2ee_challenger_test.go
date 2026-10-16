package handlers

import (
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"testing"

	"github.com/google/uuid"
	"github.com/zerovc/zerovc/backend/internal/models"
)

// TestChallengerAdversarialAttacks runs empirical adversarial stress testing on backend E2EE primitives.
func TestChallengerAdversarialAttacks(t *testing.T) {
	alicePub, alicePriv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatalf("Failed to generate Alice key: %v", err)
	}
	alicePubB64 := base64.StdEncoding.EncodeToString(alicePub)

	malloryPub, malloryPriv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatalf("Failed to generate Mallory key: %v", err)
	}
	malloryPubB64 := base64.StdEncoding.EncodeToString(malloryPub)

	aliceUserID := uuid.New()
	malloryUserID := uuid.New()
	aliceDevID := uuid.New()
	malloryDevID := uuid.New()
	convID := uuid.New()

	members := []uuid.UUID{aliceUserID}
	devices := []models.E2EERosterDeviceSnapshot{
		{UserID: aliceUserID, DeviceID: aliceDevID, Curve25519Key: "curve-key-alice", Ed25519Key: alicePubB64},
	}
	audHash := ComputeAudienceHash(members, devices)

	// -------------------------------------------------------------------------
	// 1. Broken Hash Chain
	// -------------------------------------------------------------------------
	t.Run("Attack 1.1: Broken prev_roster_hash fails verification", func(t *testing.T) {
		roster1 := models.E2EERoster{
			ConversationType: models.ConversationTypeDM,
			ConversationID:   convID,
			Version:          1,
			Epoch:            1,
			AudienceHash:     audHash,
			SignerUserID:     aliceUserID,
			SignerDeviceID:   aliceDevID,
			PrevRosterHash:   nil,
		}
		roster1Hash := ComputeRosterHash(&roster1)

		tamperedPrevHash := roster1Hash[:len(roster1Hash)-1] + "0"
		if tamperedPrevHash == roster1Hash {
			tamperedPrevHash = roster1Hash[:len(roster1Hash)-1] + "1"
		}

		payloadV2Tampered := CanonicalRosterSigningPayload(
			models.ConversationTypeDM,
			convID,
			2,
			2,
			tamperedPrevHash,
			audHash,
			aliceUserID,
			aliceDevID,
		)
		sigV2Tampered := ed25519.Sign(alicePriv, payloadV2Tampered)
		sigV2TamperedB64 := base64.StdEncoding.EncodeToString(sigV2Tampered)

		// Verification with correct expected payload MUST fail against tampered payload signature
		correctPayloadV2 := CanonicalRosterSigningPayload(
			models.ConversationTypeDM,
			convID,
			2,
			2,
			roster1Hash,
			audHash,
			aliceUserID,
			aliceDevID,
		)
		if err := VerifyEd25519Signature(alicePubB64, correctPayloadV2, sigV2TamperedB64); err == nil {
			t.Errorf("Signature over tampered prev_roster_hash must not verify against correct payload")
		}
	})

	// -------------------------------------------------------------------------
	// 2. Unauthorized Signer
	// -------------------------------------------------------------------------
	t.Run("Attack 2.1: Mallory signing Alice roster fails Alice pubkey verification", func(t *testing.T) {
		payload := CanonicalRosterSigningPayload(
			models.ConversationTypeDM,
			convID,
			1,
			1,
			"",
			audHash,
			aliceUserID,
			aliceDevID,
		)
		// Mallory signs Alice's payload
		mallorySig := ed25519.Sign(malloryPriv, payload)
		mallorySigB64 := base64.StdEncoding.EncodeToString(mallorySig)

		if err := VerifyEd25519Signature(alicePubB64, payload, mallorySigB64); err == nil {
			t.Errorf("Mallory signature must NOT verify against Alice's public key")
		}
	})

	t.Run("Attack 2.2: Signer user ID mismatch in canonical payload", func(t *testing.T) {
		payloadMallorySigner := CanonicalRosterSigningPayload(
			models.ConversationTypeDM,
			convID,
			1,
			1,
			"",
			audHash,
			malloryUserID, // Mallory sets herself as signer
			malloryDevID,
		)
		sig := ed25519.Sign(malloryPriv, payloadMallorySigner)
		sigB64 := base64.StdEncoding.EncodeToString(sig)

		// Verifying against Alice's expected signer payload must fail
		expectedPayloadAlice := CanonicalRosterSigningPayload(
			models.ConversationTypeDM,
			convID,
			1,
			1,
			"",
			audHash,
			aliceUserID,
			aliceDevID,
		)
		if err := VerifyEd25519Signature(malloryPubB64, expectedPayloadAlice, sigB64); err == nil {
			t.Errorf("Mismatched signer in payload must fail verification")
		}
	})

	// -------------------------------------------------------------------------
	// 3. Stealth Device & Audience Tampering
	// -------------------------------------------------------------------------
	t.Run("Attack 3.1: Stealth device changes audience hash", func(t *testing.T) {
		devicesWithMallory := append(devices, models.E2EERosterDeviceSnapshot{
			UserID:        malloryUserID,
			DeviceID:      malloryDevID,
			Curve25519Key: "curve-key-mallory",
			Ed25519Key:    malloryPubB64,
		})
		tamperedAudHash := ComputeAudienceHash(members, devicesWithMallory)

		if tamperedAudHash == audHash {
			t.Errorf("Stealth device must produce a different audience hash")
		}
	})

	t.Run("Attack 3.2: Rogue device injection with different device ID changes audience hash", func(t *testing.T) {
		rogueDevID := uuid.New()
		hijackedDevices := []models.E2EERosterDeviceSnapshot{
			{UserID: aliceUserID, DeviceID: rogueDevID, Curve25519Key: "hijacked-curve-key", Ed25519Key: alicePubB64},
		}
		hijackedAudHash := ComputeAudienceHash(members, hijackedDevices)

		if hijackedAudHash == audHash {
			t.Errorf("Rogue device ID must produce different audience hash")
		}
	})

	t.Run("Attack 3.3: Replaced device key changes audience hash", func(t *testing.T) {
		hijackedKeyDevices := []models.E2EERosterDeviceSnapshot{
			{UserID: aliceUserID, DeviceID: aliceDevID, Curve25519Key: "hijacked-curve-key", Ed25519Key: alicePubB64},
		}
		hijackedAudHash := ComputeAudienceHash(members, hijackedKeyDevices)

		if hijackedAudHash == audHash {
			t.Errorf("Hijacked curve25519 key must produce different audience hash")
		}
	})

	// -------------------------------------------------------------------------
	// 4. Bit-Flip Signature Tampering
	// -------------------------------------------------------------------------
	t.Run("Attack 4.1: Bit flip at bytes 0, 15, 31, 63 fails verification", func(t *testing.T) {
		payload := CanonicalRosterSigningPayload(
			models.ConversationTypeDM,
			convID,
			1,
			1,
			"",
			audHash,
			aliceUserID,
			aliceDevID,
		)
		validSig := ed25519.Sign(alicePriv, payload)

		for _, offset := range []int{0, 15, 31, 63} {
			corruptedSig := make([]byte, len(validSig))
			copy(corruptedSig, validSig)
			corruptedSig[offset] ^= 0x01
			corruptedSigB64 := base64.StdEncoding.EncodeToString(corruptedSig)

			if err := VerifyEd25519Signature(alicePubB64, payload, corruptedSigB64); err == nil {
				t.Errorf("Bit flip at offset %d must fail verification", offset)
			}
		}
	})

	t.Run("Attack 4.2: Bit flip in CanonicalJSON payload fails verification", func(t *testing.T) {
		jsonPayload, err := CanonicalJSONRosterSigningPayload(
			models.ConversationTypeDM,
			convID,
			1,
			1,
			"",
			audHash,
			aliceUserID,
			aliceDevID,
			nil,
			nil,
		)
		if err != nil {
			t.Fatalf("Failed to generate json payload: %v", err)
		}
		sig := ed25519.Sign(alicePriv, jsonPayload)
		sigB64 := base64.StdEncoding.EncodeToString(sig)

		// Mutate jsonPayload by flipping a byte
		mutatedPayload := make([]byte, len(jsonPayload))
		copy(mutatedPayload, jsonPayload)
		mutatedPayload[len(mutatedPayload)/2] ^= 0x01

		if err := VerifyEd25519Signature(alicePubB64, mutatedPayload, sigB64); err == nil {
			t.Errorf("Mutated JSON payload must fail signature verification")
		}
	})

	// -------------------------------------------------------------------------
	// 5. Device Registration Canonical Binding
	// -------------------------------------------------------------------------
	t.Run("Attack 5.1: Device key tampering fails CanonicalDeviceSigningPayload verification", func(t *testing.T) {
		curveKey := "curve-key-alice-valid"
		edKey := alicePubB64

		devicePayload := CanonicalDeviceSigningPayload(aliceUserID, curveKey, edKey)
		sig := ed25519.Sign(alicePriv, devicePayload)
		sigB64 := base64.StdEncoding.EncodeToString(sig)

		// 1. Valid must pass
		if err := VerifyEd25519Signature(alicePubB64, devicePayload, sigB64); err != nil {
			t.Errorf("Valid device payload signature failed: %v", err)
		}

		// 2. Tampered curve key
		tamperedPayload := CanonicalDeviceSigningPayload(aliceUserID, "curve-key-tampered", edKey)
		if err := VerifyEd25519Signature(alicePubB64, tamperedPayload, sigB64); err == nil {
			t.Errorf("Tampered curve key in device payload must fail verification")
		}

		// 3. User ID spoofing (Mallory registering Alice's keys for Mallory's user ID)
		spoofedUserPayload := CanonicalDeviceSigningPayload(malloryUserID, curveKey, edKey)
		if err := VerifyEd25519Signature(alicePubB64, spoofedUserPayload, sigB64); err == nil {
			t.Errorf("Spoofed user ID in device payload must fail verification")
		}
	})
}
