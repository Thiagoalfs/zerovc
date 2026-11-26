package auth

import (
	"fmt"
	"testing"
	"time"

	"github.com/google/uuid"
)

func TestGenerateAndValidateToken(t *testing.T) {
	svc := NewService("0123456789abcdef0123456789abcdef")
	uid := uuid.New()

	token, err := svc.GenerateToken(uid, "alice")
	if err != nil {
		t.Fatalf("GenerateToken failed: %v", err)
	}

	claims, err := svc.ValidateToken(token)
	if err != nil {
		t.Fatalf("ValidateToken failed: %v", err)
	}
	if claims.UserID != uid || claims.Username != "alice" {
		t.Fatalf("unexpected claims: %+v", claims)
	}

	otherSvc := NewService("fedcba9876543210fedcba9876543210")
	if _, err := otherSvc.ValidateToken(token); err == nil {
		t.Fatal("expected token signed with different secret to fail validation")
	}
}

func TestTwoFAChallengeIsolationAndBinding(t *testing.T) {
	svc := NewService("0123456789abcdef0123456789abcdef")
	uid := uuid.New()

	challenge, err := svc.Generate2FAChallenge(uid, "Alice@Example.com ")
	if err != nil {
		t.Fatalf("Generate2FAChallenge failed: %v", err)
	}

	// Must never validate as a regular session JWT
	if _, err := svc.ValidateToken(challenge); err == nil {
		t.Fatal("2FA challenge token must not validate as session JWT")
	}

	gotID, ok := svc.Validate2FAChallenge(challenge, "alice@example.com")
	if !ok || gotID != uid {
		t.Fatalf("expected valid 2FA challenge for matching identifier, got ok=%v id=%v", ok, gotID)
	}

	if _, ok := svc.Validate2FAChallenge(challenge, "bob@example.com"); ok {
		t.Fatal("expected 2FA challenge bound to alice to fail for bob")
	}
}

func TestRevocationPruningAndSizeCap(t *testing.T) {
	svc := NewService("0123456789abcdef0123456789abcdef")
	svc.revocationTTL = 5 * time.Minute
	svc.maxRevokedEntries = 3

	uid := uuid.New()
	now := time.Now()

	// Seed an expired token hash and an expired user-wide revocation
	svc.mu.Lock()
	svc.revokedTokens["expired-hash"] = now.Add(-10 * time.Minute)
	svc.revokedTokens["fresh-hash"] = now.Add(-1 * time.Minute)
	svc.revokedAllBefore[uid] = now.Add(-10 * time.Minute)
	svc.mu.Unlock()

	// Expired entries must not report as revoked even before pruning
	if svc.IsTokenRevoked(uid, "expired-hash", now.Add(-15*time.Minute)) {
		t.Fatal("expected expired revocation entry to be ignored")
	}
	if !svc.IsTokenRevoked(uuid.Nil, "fresh-hash", now.Add(-2*time.Minute)) {
		t.Fatal("expected fresh revoked token hash to be treated as revoked")
	}

	svc.PruneRevoked(now)

	svc.mu.RLock()
	_, expiredStillPresent := svc.revokedTokens["expired-hash"]
	_, freshStillPresent := svc.revokedTokens["fresh-hash"]
	_, expiredUserStillPresent := svc.revokedAllBefore[uid]
	svc.mu.RUnlock()

	if expiredStillPresent || expiredUserStillPresent {
		t.Fatal("expected PruneRevoked to delete expired entries")
	}
	if !freshStillPresent {
		t.Fatal("expected PruneRevoked to retain fresh entry")
	}

	// Verify maxRevokedEntries cap evicts oldest entries
	for i := 0; i < 6; i++ {
		svc.RevokeTokenHash(fmt.Sprintf("tok-%d", i))
	}

	svc.mu.RLock()
	tokenMapLen := len(svc.revokedTokens)
	svc.mu.RUnlock()
	if tokenMapLen > svc.maxRevokedEntries {
		t.Fatalf("expected revokedTokens len <= %d, got %d", svc.maxRevokedEntries, tokenMapLen)
	}
}
