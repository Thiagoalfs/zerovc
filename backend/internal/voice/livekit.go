package voice

import (
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/livekit/protocol/auth"
)

type LiveKitService struct {
	apiKey    string
	apiSecret string
	publicURL string
}

func NewLiveKitService(apiKey, apiSecret, publicURL string) *LiveKitService {
	return &LiveKitService{
		apiKey:    apiKey,
		apiSecret: apiSecret,
		publicURL: publicURL,
	}
}

func (s *LiveKitService) GenerateJoinToken(roomName string, userID uuid.UUID, username string, metadata string, canPublish bool) (string, error) {
	at := auth.NewAccessToken(s.apiKey, s.apiSecret)
	grant := &auth.VideoGrant{
		RoomJoin:       true,
		Room:           roomName,
		CanPublish:     &canPublish,
		CanSubscribe:   &canPublish, // can receive other streams
		CanPublishData: &canPublish, // for chat / data channel
	}

	at.AddGrant(grant).
		SetIdentity(userID.String()).
		SetName(username).
		SetMetadata(metadata).
		SetValidFor(24 * time.Hour)

	token, err := at.ToJWT()
	if err != nil {
		return "", fmt.Errorf("failed to generate LiveKit JWT token: %w", err)
	}

	return token, nil
}

func (s *LiveKitService) GetPublicURL() string {
	return s.publicURL
}
