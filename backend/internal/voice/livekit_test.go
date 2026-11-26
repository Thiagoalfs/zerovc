package voice

import (
	"testing"

	"github.com/google/uuid"
	"github.com/livekit/protocol/auth"
)

func TestGenerateJoinToken_CanSubscribeAlwaysTrueWhenCannotPublish(t *testing.T) {
	const apiKey = "devkey"
	const apiSecret = "secret_key_for_livekit_testing_32bytes"
	svc := NewLiveKitService(apiKey, apiSecret, "ws://localhost:7880")

	token, err := svc.GenerateJoinToken("room-1", uuid.New(), "muted_user", `{}`, false)
	if err != nil {
		t.Fatalf("GenerateJoinToken failed: %v", err)
	}

	verifier, err := auth.ParseAPIToken(token)
	if err != nil {
		t.Fatalf("ParseAPIToken failed: %v", err)
	}

	grants, err := verifier.Verify(apiSecret)
	if err != nil {
		t.Fatalf("Verify failed: %v", err)
	}

	if grants.Video == nil {
		t.Fatal("expected Video grants to be present")
	}
	if grants.Video.CanPublish == nil || *grants.Video.CanPublish {
		t.Fatalf("expected CanPublish=false, got %v", grants.Video.CanPublish)
	}
	if grants.Video.CanSubscribe == nil || !*grants.Video.CanSubscribe {
		t.Fatalf("expected CanSubscribe=true even when canPublish=false, got %v", grants.Video.CanSubscribe)
	}
	if grants.Video.CanPublishData == nil || *grants.Video.CanPublishData {
		t.Fatalf("expected CanPublishData=false when canPublish=false, got %v", grants.Video.CanPublishData)
	}
}
