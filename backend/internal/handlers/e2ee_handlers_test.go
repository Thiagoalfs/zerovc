package handlers

import (
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"
	"github.com/zerovc/zerovc/backend/internal/middleware"
	"github.com/zerovc/zerovc/backend/internal/models"
)

func TestEd25519SignatureVerification(t *testing.T) {
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatalf("Failed to generate ed25519 keypair: %v", err)
	}

	pubB64 := base64.StdEncoding.EncodeToString(pub)
	message := []byte("zerovc-e2ee-test-payload-v1")
	sig := ed25519.Sign(priv, message)
	sigB64 := base64.StdEncoding.EncodeToString(sig)

	// 1. Valid signature must pass
	if err := VerifyEd25519Signature(pubB64, message, sigB64); err != nil {
		t.Errorf("Expected valid signature to pass, got error: %v", err)
	}

	// 2. Corrupted signature must fail
	corruptedSig := make([]byte, len(sig))
	copy(corruptedSig, sig)
	corruptedSig[0] ^= 0xFF
	corruptedSigB64 := base64.StdEncoding.EncodeToString(corruptedSig)

	if err := VerifyEd25519Signature(pubB64, message, corruptedSigB64); err == nil {
		t.Errorf("Expected corrupted signature to fail, but it succeeded")
	}

	// 3. Different public key must fail
	otherPub, _, _ := ed25519.GenerateKey(rand.Reader)
	otherPubB64 := base64.StdEncoding.EncodeToString(otherPub)
	if err := VerifyEd25519Signature(otherPubB64, message, sigB64); err == nil {
		t.Errorf("Expected wrong public key to fail, but it succeeded")
	}

	// 4. Invalid key length must fail
	shortKeyB64 := base64.StdEncoding.EncodeToString([]byte("short-key"))
	if err := VerifyEd25519Signature(shortKeyB64, message, sigB64); err == nil {
		t.Errorf("Expected short key length to fail, but it succeeded")
	}
}

func TestDeviceKeyRegistrationSignature(t *testing.T) {
	userID := uuid.New()
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatalf("Failed to generate keypair: %v", err)
	}

	pubB64 := base64.StdEncoding.EncodeToString(pub)
	curveKey := "curve25519-mock-pubkey-base64"
	edKey := "ed25519-mock-device-pubkey-base64"

	canonicalPayload := CanonicalDeviceSigningPayload(userID, curveKey, edKey)
	sig := ed25519.Sign(priv, canonicalPayload)
	sigB64 := base64.StdEncoding.EncodeToString(sig)

	if err := VerifyEd25519Signature(pubB64, canonicalPayload, sigB64); err != nil {
		t.Errorf("Device key signature verification failed: %v", err)
	}
}

func TestRosterChainingAndAudienceHash(t *testing.T) {
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatalf("Failed to generate keypair: %v", err)
	}

	pubB64 := base64.StdEncoding.EncodeToString(pub)
	convID := uuid.New()
	user1 := uuid.New()
	user2 := uuid.New()
	dev1 := uuid.New()
	dev2 := uuid.New()

	members := []uuid.UUID{user2, user1} // intentionally unordered
	devices := []models.E2EERosterDeviceSnapshot{
		{UserID: user2, DeviceID: dev2, Curve25519Key: "k2", Ed25519Key: "e2"},
		{UserID: user1, DeviceID: dev1, Curve25519Key: "k1", Ed25519Key: "e1"},
	}

	// 1. Audience hash determinism check (independent of input order)
	hash1 := ComputeAudienceHash(members, devices)
	hash2 := ComputeAudienceHash([]uuid.UUID{user1, user2}, []models.E2EERosterDeviceSnapshot{devices[1], devices[0]})

	if hash1 == "" {
		t.Errorf("Audience hash should not be empty")
	}
	if hash1 != hash2 {
		t.Errorf("Audience hash is not deterministic: %s != %s", hash1, hash2)
	}

	// 2. Canonical roster signing
	prevHash := ""
	payload := CanonicalRosterSigningPayload(
		models.ConversationTypeDM,
		convID,
		1,
		1,
		prevHash,
		hash1,
		user1,
		dev1,
	)

	sig := ed25519.Sign(priv, payload)
	sigB64 := base64.StdEncoding.EncodeToString(sig)

	if err := VerifyEd25519Signature(pubB64, payload, sigB64); err != nil {
		t.Errorf("Roster signature verification failed: %v", err)
	}

	// 3. Compute roster hash for version 1 chaining
	roster1 := models.E2EERoster{
		ConversationType: models.ConversationTypeDM,
		ConversationID:   convID,
		Version:          1,
		Epoch:            1,
		AudienceHash:     hash1,
		SignerUserID:     user1,
		SignerDeviceID:   dev1,
		PrevRosterHash:   nil,
		Signature:        sigB64,
	}

	roster1Hash := ComputeRosterHash(&roster1)
	if roster1Hash == "" {
		t.Errorf("Roster 1 hash should not be empty")
	}

	// Version 2 chains with roster1Hash
	payload2 := CanonicalRosterSigningPayload(
		models.ConversationTypeDM,
		convID,
		2,
		2,
		roster1Hash,
		hash1,
		user1,
		dev1,
	)
	sig2 := ed25519.Sign(priv, payload2)
	sig2B64 := base64.StdEncoding.EncodeToString(sig2)

	if err := VerifyEd25519Signature(pubB64, payload2, sig2B64); err != nil {
		t.Errorf("Chained roster signature verification failed: %v", err)
	}
}

func TestE2EEVersionMiddleware(t *testing.T) {
	mw := middleware.RequireE2EEClientVersion(1)
	okHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"ok"}`))
	})
	wrapped := mw(okHandler)

	// 1. Missing header -> 426
	req1 := httptest.NewRequest("GET", "/api/e2ee/config", nil)
	rec1 := httptest.NewRecorder()
	wrapped.ServeHTTP(rec1, req1)

	if rec1.Code != http.StatusUpgradeRequired {
		t.Errorf("Expected HTTP 426 for missing header, got %d", rec1.Code)
	}

	var errBody map[string]any
	if err := json.Unmarshal(rec1.Body.Bytes(), &errBody); err != nil {
		t.Fatalf("Failed to parse error json: %v", err)
	}
	if errBody["error"] != "e2ee_client_outdated" {
		t.Errorf("Expected error 'e2ee_client_outdated', got %v", errBody["error"])
	}

	// 2. Version 0 -> 426
	req2 := httptest.NewRequest("GET", "/api/e2ee/config", nil)
	req2.Header.Set("X-Client-E2EE-Version", "0")
	rec2 := httptest.NewRecorder()
	wrapped.ServeHTTP(rec2, req2)

	if rec2.Code != http.StatusUpgradeRequired {
		t.Errorf("Expected HTTP 426 for version 0, got %d", rec2.Code)
	}

	// 3. Version 1 -> 200 OK
	req3 := httptest.NewRequest("GET", "/api/e2ee/config", nil)
	req3.Header.Set("X-Client-E2EE-Version", "1")
	rec3 := httptest.NewRecorder()
	wrapped.ServeHTTP(rec3, req3)

	if rec3.Code != http.StatusOK {
		t.Errorf("Expected HTTP 200 for version 1, got %d", rec3.Code)
	}
}
