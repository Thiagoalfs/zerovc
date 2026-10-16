package handlers_test

import (
	"encoding/json"
	"testing"

	"github.com/google/uuid"
	"github.com/zerovc/zerovc/backend/internal/handlers"
)

// TestE2EEM4_LiveKitParticipantMetadata tests that when E2EE is enabled,
// token participant metadata strictly contains {"e2ee_required": true, "user_id": userID.String()}
// by calling the genuine production helper handlers.BuildLiveKitParticipantMetadata.
func TestE2EEM4_LiveKitParticipantMetadata(t *testing.T) {
	userID := uuid.New()
	avatarURL := "https://cdn.example.com/avatar.png"
	displayName := "Alice Cryptographer"
	username := "alice"
	customStatus := "Testing E2EE"

	// 1. E2EE enabled: metadata MUST contain e2ee_required: true and user_id
	metaE2EE := handlers.BuildLiveKitParticipantMetadata(avatarURL, displayName, username, customStatus, userID, true)
	var parsedE2EE map[string]any
	if err := json.Unmarshal(metaE2EE, &parsedE2EE); err != nil {
		t.Fatalf("Failed to parse E2EE metadata JSON: %v", err)
	}

	if req, ok := parsedE2EE["e2ee_required"].(bool); !ok || !req {
		t.Errorf("Expected e2ee_required to be true, got %v", parsedE2EE["e2ee_required"])
	}
	if uid, ok := parsedE2EE["user_id"].(string); !ok || uid != userID.String() {
		t.Errorf("Expected user_id to be %s, got %v", userID.String(), parsedE2EE["user_id"])
	}
	if parsedE2EE["avatar_url"] != avatarURL {
		t.Errorf("Expected avatar_url %q, got %v", avatarURL, parsedE2EE["avatar_url"])
	}
	if parsedE2EE["display_name"] != displayName {
		t.Errorf("Expected display_name %q, got %v", displayName, parsedE2EE["display_name"])
	}
	if parsedE2EE["username"] != username {
		t.Errorf("Expected username %q, got %v", username, parsedE2EE["username"])
	}
	if parsedE2EE["custom_status"] != customStatus {
		t.Errorf("Expected custom_status %q, got %v", customStatus, parsedE2EE["custom_status"])
	}

	// 2. Non-E2EE: metadata MUST NOT require E2EE nor leak user_id
	metaPlain := handlers.BuildLiveKitParticipantMetadata(avatarURL, displayName, username, customStatus, userID, false)
	var parsedPlain map[string]any
	if err := json.Unmarshal(metaPlain, &parsedPlain); err != nil {
		t.Fatalf("Failed to parse plain metadata JSON: %v", err)
	}
	if _, exists := parsedPlain["e2ee_required"]; exists {
		t.Errorf("Plain voice room metadata must not contain e2ee_required")
	}
	if _, exists := parsedPlain["user_id"]; exists {
		t.Errorf("Plain voice room metadata must not contain user_id")
	}
	if parsedPlain["avatar_url"] != avatarURL || parsedPlain["username"] != username {
		t.Errorf("Plain voice room metadata missing basic user fields")
	}

	// 3. E2EE with DeviceID: verify optional device_id inclusion
	deviceID := "test-device-uuid-1234"
	metaDevice := handlers.BuildLiveKitParticipantMetadata(avatarURL, displayName, username, customStatus, userID, true, deviceID)
	var parsedDevice map[string]any
	if err := json.Unmarshal(metaDevice, &parsedDevice); err != nil {
		t.Fatalf("Failed to parse device metadata JSON: %v", err)
	}
	if dev, ok := parsedDevice["device_id"].(string); !ok || dev != deviceID {
		t.Errorf("Expected device_id %q, got %v", deviceID, parsedDevice["device_id"])
	}
}

// TestE2EEM4_ChannelJoinVoiceResponse tests that JoinVoiceResponse serializes e2ee_enabled correctly
func TestE2EEM4_ChannelJoinVoiceResponse(t *testing.T) {
	respE2EE := handlers.JoinVoiceResponse{
		Token:       "jwt-token-123",
		LiveKitURL:  "wss://livekit.zerovc.local",
		RoomName:    "voice-channel-uuid",
		E2EEEnabled: true,
	}

	bytesE2EE, err := json.Marshal(respE2EE)
	if err != nil {
		t.Fatalf("Failed to marshal JoinVoiceResponse: %v", err)
	}

	var parsed map[string]any
	if err := json.Unmarshal(bytesE2EE, &parsed); err != nil {
		t.Fatalf("Failed to unmarshal JoinVoiceResponse JSON: %v", err)
	}

	if e2ee, ok := parsed["e2ee_enabled"].(bool); !ok || !e2ee {
		t.Errorf("Expected e2ee_enabled: true in JSON response, got: %v", parsed["e2ee_enabled"])
	}

	respPlain := handlers.JoinVoiceResponse{
		Token:       "jwt-token-456",
		LiveKitURL:  "wss://livekit.zerovc.local",
		RoomName:    "voice-channel-uuid-2",
		E2EEEnabled: false,
	}

	bytesPlain, _ := json.Marshal(respPlain)
	var parsedPlain map[string]any
	json.Unmarshal(bytesPlain, &parsedPlain)
	if e2ee, ok := parsedPlain["e2ee_enabled"].(bool); !ok || e2ee {
		t.Errorf("Expected e2ee_enabled: false in plain voice room, got: %v", parsedPlain["e2ee_enabled"])
	}
}

// TestE2EEM4_DMCallResponses tests that DM InviteCall and AcceptCall payloads include e2ee_enabled
// by testing the genuine production structs handlers.DMCallInviteResponse and handlers.DMCallAcceptResponse.
func TestE2EEM4_DMCallResponses(t *testing.T) {
	roomID := uuid.New()

	// 1. InviteCall payload check (E2EE enabled)
	inviteE2EE := handlers.DMCallInviteResponse{
		Success:     true,
		RoomID:      roomID,
		E2EEEnabled: true,
	}
	inviteBytes, err := json.Marshal(inviteE2EE)
	if err != nil {
		t.Fatalf("Failed to marshal DMCallInviteResponse: %v", err)
	}
	var parsedInvite map[string]any
	if err := json.Unmarshal(inviteBytes, &parsedInvite); err != nil {
		t.Fatalf("Failed to unmarshal DMCallInviteResponse JSON: %v", err)
	}
	if e2ee, ok := parsedInvite["e2ee_enabled"].(bool); !ok || !e2ee {
		t.Errorf("Expected e2ee_enabled: true in DMCallInviteResponse")
	}
	if rid, ok := parsedInvite["room_id"].(string); !ok || rid != roomID.String() {
		t.Errorf("Expected room_id: %s in DMCallInviteResponse, got %v", roomID.String(), parsedInvite["room_id"])
	}

	// 2. InviteCall payload check (Plain / E2EE disabled)
	invitePlain := handlers.DMCallInviteResponse{
		Success:     true,
		RoomID:      roomID,
		E2EEEnabled: false,
	}
	invitePlainBytes, _ := json.Marshal(invitePlain)
	var parsedInvitePlain map[string]any
	json.Unmarshal(invitePlainBytes, &parsedInvitePlain)
	if e2ee, ok := parsedInvitePlain["e2ee_enabled"].(bool); !ok || e2ee {
		t.Errorf("Expected e2ee_enabled: false in plain DMCallInviteResponse, got %v", parsedInvitePlain["e2ee_enabled"])
	}

	// 3. AcceptCall payload check (E2EE enabled)
	acceptE2EE := handlers.DMCallAcceptResponse{
		Success:     true,
		RoomID:      roomID,
		RoomName:    "dm-" + roomID.String(),
		Token:       "test-token",
		LiveKitURL:  "wss://livekit.zerovc.local",
		E2EEEnabled: true,
	}
	acceptBytes, err := json.Marshal(acceptE2EE)
	if err != nil {
		t.Fatalf("Failed to marshal DMCallAcceptResponse: %v", err)
	}
	var parsedAccept map[string]any
	if err := json.Unmarshal(acceptBytes, &parsedAccept); err != nil {
		t.Fatalf("Failed to unmarshal DMCallAcceptResponse JSON: %v", err)
	}
	if e2ee, ok := parsedAccept["e2ee_enabled"].(bool); !ok || !e2ee {
		t.Errorf("Expected e2ee_enabled: true in AcceptCall response")
	}
	if parsedAccept["livekit_url"] != "wss://livekit.zerovc.local" {
		t.Errorf("Expected livekit_url in AcceptCall response, got %v", parsedAccept["livekit_url"])
	}

	// 4. AcceptCall payload check (Plain / E2EE disabled)
	acceptPlain := handlers.DMCallAcceptResponse{
		Success:     true,
		RoomID:      roomID,
		RoomName:    "dm-" + roomID.String(),
		Token:       "test-plain-token",
		LiveKitURL:  "wss://livekit.zerovc.local",
		E2EEEnabled: false,
	}
	acceptPlainBytes, _ := json.Marshal(acceptPlain)
	var parsedAcceptPlain map[string]any
	json.Unmarshal(acceptPlainBytes, &parsedAcceptPlain)
	if e2ee, ok := parsedAcceptPlain["e2ee_enabled"].(bool); !ok || e2ee {
		t.Errorf("Expected e2ee_enabled: false in plain AcceptCall response, got %v", parsedAcceptPlain["e2ee_enabled"])
	}
}

// TestE2EEM4_DMGroupVoiceResponse tests that DM Group VoiceToken payload includes e2ee_enabled
// by testing the genuine production struct handlers.DMGroupVoiceTokenResponse.
func TestE2EEM4_DMGroupVoiceResponse(t *testing.T) {
	groupID := uuid.New()
	livekitRoomName := "dmgroup-" + groupID.String()

	// 1. DM Group voice response check (E2EE enabled)
	groupE2EE := handlers.DMGroupVoiceTokenResponse{
		Token:       "test-group-token",
		LiveKitURL:  "wss://livekit.zerovc.local",
		RoomName:    livekitRoomName,
		E2EEEnabled: true,
	}
	groupBytes, err := json.Marshal(groupE2EE)
	if err != nil {
		t.Fatalf("Failed to marshal DMGroupVoiceTokenResponse: %v", err)
	}
	var parsedGroup map[string]any
	if err := json.Unmarshal(groupBytes, &parsedGroup); err != nil {
		t.Fatalf("Failed to unmarshal DMGroupVoiceTokenResponse JSON: %v", err)
	}
	if e2ee, ok := parsedGroup["e2ee_enabled"].(bool); !ok || !e2ee {
		t.Errorf("Expected e2ee_enabled: true in DMGroup Voice response")
	}
	if parsedGroup["room_name"] != livekitRoomName {
		t.Errorf("Expected room_name %s, got %v", livekitRoomName, parsedGroup["room_name"])
	}

	// 2. DM Group voice response check (Plain / E2EE disabled)
	groupPlain := handlers.DMGroupVoiceTokenResponse{
		Token:       "test-group-token-plain",
		LiveKitURL:  "wss://livekit.zerovc.local",
		RoomName:    livekitRoomName,
		E2EEEnabled: false,
	}
	groupPlainBytes, _ := json.Marshal(groupPlain)
	var parsedGroupPlain map[string]any
	json.Unmarshal(groupPlainBytes, &parsedGroupPlain)
	if e2ee, ok := parsedGroupPlain["e2ee_enabled"].(bool); !ok || e2ee {
		t.Errorf("Expected e2ee_enabled: false in plain DMGroup Voice response, got %v", parsedGroupPlain["e2ee_enabled"])
	}
}
