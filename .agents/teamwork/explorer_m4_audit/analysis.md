# Technical Analysis: M4 Forensic Integrity Audit Remediation

## Executive Summary
During the Forensic Integrity Audit of Milestone M4 (LiveKit Voice/Video E2EE Calls), the auditor triggered a **Binary Veto Integrity Violation on Check 5 (Test Authenticity & Assertion Rigor)**. While client-side cryptography (`client/src/crypto/callKeys.ts`, `client/src/lib/livekitE2EE.ts`, and `client/scripts/test-livekit-m4.ts`) was confirmed 100% genuine with 26/26 authentic assertions, `backend/internal/handlers/e2ee_m4_test.go` was found to contain 3 tests that asserted against local closures and inline dummy map literals created exclusively inside the test bodies. If the production metadata generation or `e2ee_enabled` fields were removed from production handlers, those tests would continue to pass green.

This analysis provides the complete architectural and technical remediation blueprint to eliminate all self-certifying tests by extracting genuine production helpers and exported response structs in `backend/internal/handlers` and wiring them to both production endpoints and genuine unit tests.

---

## 1. Forensic Dissection of Current Deficiencies

### 1.1 In `backend/internal/handlers/e2ee_m4_test.go`
- **`TestE2EEM4_LiveKitParticipantMetadata` (Lines 13–58)**:
  - *Current implementation*: Declares a local closure `buildMetadata := func(isE2EE bool) []byte` inside the test function and checks the output of this closure.
  - *Flaw*: It never calls backend production code. If `channel_handlers.go`, `dm_handlers.go`, or `dm_group_handlers.go` stop injecting `e2ee_required` or `user_id`, this test remains green.
- **`TestE2EEM4_DMCallResponses` (Lines 99–130)**:
  - *Current implementation*: Declares inline maps `invitePayload := map[string]any{ ... "e2ee_enabled": true }` and `acceptPayload := map[string]any{ ... "e2ee_enabled": true }`.
  - *Flaw*: Marshals and unmarshals local maps declared within the test body. Zero production structs or endpoints are exercised.
- **`TestE2EEM4_DMGroupVoiceResponse` (Lines 133–149)**:
  - *Current implementation*: Declares an inline map `groupPayload := map[string]any{ ... "e2ee_enabled": true }`.
  - *Flaw*: Marshals and unmarshals a local map. Zero production structs or endpoints are exercised.

### 1.2 In Backend Production Handlers
Currently, LiveKit token participant metadata and call JSON responses are generated via copy-pasted inline map literals across 3 handler files:
- **`channel_handlers.go` (Lines 592–603)**:
  ```go
  metaMap := map[string]any{
      "avatar_url":    user.AvatarURL,
      "display_name":  user.DisplayName,
      "username":      user.Username,
      "custom_status": user.CustomStatus,
  }
  if isE2EE {
      metaMap["e2ee_required"] = true
      metaMap["user_id"] = userID.String()
  }
  metaJSON, _ := json.Marshal(metaMap)
  ```
- **`dm_handlers.go` (Lines 973–993)**: Duplicates `metaMap` twice for `currentMetaMap` and `otherMetaMap`.
- **`dm_group_handlers.go` (Lines 1030–1040)**: Duplicates `metaMap` for group voice tokens.
- **`dm_handlers.go` (Line 934 & Line 1032)**: Encodes anonymous maps `map[string]any{"success": true, ...}` instead of typed structs.
- **`dm_group_handlers.go` (Line 1055)**: Encodes anonymous map `map[string]any{"token": ..., "e2ee_enabled": isE2EE}` instead of a typed struct.

---

## 2. Technical Remediation Blueprint

### 2.1 Component 1: Exported Production Helper `BuildLiveKitParticipantMetadata`

**Target File**: `backend/internal/handlers/channel_handlers.go` (or shared in package `handlers`)  
**Position**: Immediately preceding `JoinVoiceResponse` (approx line 482).

```go
// BuildLiveKitParticipantMetadata creates the standard JSON metadata payload for LiveKit voice/video participants.
// If isE2EE is true, e2ee_required: true and user_id are strictly injected.
func BuildLiveKitParticipantMetadata(avatarURL, displayName, username, customStatus string, userID uuid.UUID, isE2EE bool) []byte {
	metaMap := map[string]any{
		"avatar_url":    avatarURL,
		"display_name":  displayName,
		"username":      username,
		"custom_status": customStatus,
	}
	if isE2EE {
		metaMap["e2ee_required"] = true
		metaMap["user_id"] = userID.String()
	}
	b, _ := json.Marshal(metaMap)
	return b
}
```

### 2.2 Component 2: Exported Production Response Structs

#### A. In `backend/internal/handlers/dm_handlers.go`:
```go
// DMCallInviteResponse represents the response payload for a DM call invitation.
type DMCallInviteResponse struct {
	Success     bool      `json:"success"`
	RoomID      uuid.UUID `json:"room_id"`
	E2EEEnabled bool      `json:"e2ee_enabled"`
}

// DMCallAcceptResponse represents the response payload for accepting a DM call.
type DMCallAcceptResponse struct {
	Success     bool      `json:"success"`
	RoomID      uuid.UUID `json:"room_id"`
	RoomName    string    `json:"room_name"`
	Token       string    `json:"token"`
	LiveKitURL  string    `json:"livekit_url"`
	E2EEEnabled bool      `json:"e2ee_enabled"`
}
```

#### B. In `backend/internal/handlers/dm_group_handlers.go`:
```go
// DMGroupVoiceTokenResponse represents the response payload for joining a DM group voice call.
type DMGroupVoiceTokenResponse struct {
	Token       string `json:"token"`
	LiveKitURL  string `json:"livekit_url"`
	RoomName    string `json:"room_name"`
	E2EEEnabled bool   `json:"e2ee_enabled"`
}
```

*(Note: `JoinVoiceResponse` already exists as an exported struct in `channel_handlers.go:483`).*

---

### 2.3 Component 3: Production Code Refactoring

1. **`backend/internal/handlers/channel_handlers.go` (`JoinVoice`)**:
   Replace lines 592–603 with:
   ```go
   roomName := channelID.String()
   metaJSON := BuildLiveKitParticipantMetadata(user.AvatarURL, user.DisplayName, user.Username, user.CustomStatus, userID, isE2EE)
   token, err := h.livekit.GenerateJoinToken(roomName, userID, user.Username, string(metaJSON), true)
   ```

2. **`backend/internal/handlers/dm_handlers.go` (`InviteCall`)**:
   Replace line 934 with:
   ```go
   w.Header().Set("Content-Type", "application/json")
   json.NewEncoder(w).Encode(DMCallInviteResponse{
       Success:     true,
       RoomID:      roomID,
       E2EEEnabled: isE2EE,
   })
   ```

3. **`backend/internal/handlers/dm_handlers.go` (`AcceptCall`)**:
   Replace lines 973–1004 with:
   ```go
   currentMetaJSON := BuildLiveKitParticipantMetadata(currentU.AvatarURL, currentU.DisplayName, currentU.Username, currentU.CustomStatus, userID, isE2EE)
   otherMetaJSON := BuildLiveKitParticipantMetadata(otherU.AvatarURL, otherU.DisplayName, otherU.Username, otherU.CustomStatus, otherUserID, isE2EE)
   ```
   And replace lines 1032–1040 with:
   ```go
   w.Header().Set("Content-Type", "application/json")
   json.NewEncoder(w).Encode(DMCallAcceptResponse{
       Success:     true,
       RoomID:      roomID,
       RoomName:    livekitRoomName,
       Token:       tokenAcceptor,
       LiveKitURL:  h.livekit.GetPublicURL(),
       E2EEEnabled: isE2EE,
   })
   ```

4. **`backend/internal/handlers/dm_group_handlers.go` (`GetVoiceToken`)**:
   Replace lines 1030–1040 with:
   ```go
   metaJSON := BuildLiveKitParticipantMetadata(u.AvatarURL, u.DisplayName, u.Username, u.CustomStatus, userID, isE2EE)
   ```
   And replace lines 1055–1061 with:
   ```go
   w.Header().Set("Content-Type", "application/json")
   json.NewEncoder(w).Encode(DMGroupVoiceTokenResponse{
       Token:       token,
       LiveKitURL:  h.livekit.GetPublicURL(),
       RoomName:    livekitRoomName,
       E2EEEnabled: isE2EE,
   })
   ```

---

### 2.4 Component 4: Complete Genuine Unit Test Suite (`backend/internal/handlers/e2ee_m4_test.go`)

Replace the entire contents of `backend/internal/handlers/e2ee_m4_test.go` with:

```go
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
```

---

### 2.5 Component 5: Challenger Test Alignment (`e2ee_m4_challenger_test.go`)

In addition to `e2ee_m4_test.go`, updating `e2ee_m4_challenger_test.go` to use the genuine production functions and structs provides deep consistency across the test suite:
1. In `TestChallengerM4_ParticipantMetadataEnforcement`:
   Replace lines 67–82 with:
   ```go
   rawJSON := handlers.BuildLiveKitParticipantMetadata(
       "https://avatar.test/pic.png",
       tc.displayName,
       tc.username,
       "Ready",
       tc.userID,
       tc.isE2EE,
   )
   ```
2. In `TestChallengerM4_ResponsePayloadSerialization`:
   Replace lines 290–316 with instances of `handlers.DMCallAcceptResponse` and `handlers.DMGroupVoiceTokenResponse`.

---

## 3. Invalidation & Verification Analysis

| Attack / Regression Scenario | Result with Current Code | Result with Remediated Code |
|------------------------------|--------------------------|-----------------------------|
| Remove `metaMap["e2ee_required"] = true` from `channel_handlers.go` | `TestE2EEM4` passes green (false pass) | `TestE2EEM4_LiveKitParticipantMetadata` fails with assertion error |
| Change `json:"e2ee_enabled"` tag in `DMCallInviteResponse` | `TestE2EEM4` passes green (false pass) | `TestE2EEM4_DMCallResponses` fails with missing field |
| Delete `E2EEEnabled` field from `DMGroupVoiceTokenResponse` | `TestE2EEM4` passes green (false pass) | Build fails at compile time (`unknown field E2EEEnabled`) |
| Plain room inadvertently sets `e2ee_required` | `TestE2EEM4` passes green (false pass) | `TestE2EEM4_LiveKitParticipantMetadata` fails with "Plain voice room metadata must not contain e2ee_required" |
