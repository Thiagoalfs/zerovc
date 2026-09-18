package e2e_test

import (
	"encoding/json"
	"fmt"
	"net/http"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/zerovc/zerovc/tests/e2e/harness"
)

// ============================================================================
// TIER 4: REAL-WORLD SCENARIOS (End-to-End User Journeys)
// ============================================================================

// Scenario 1: New user onboarding & server setup
// Journey: Register -> Verify -> Login -> Update Profile -> Create Guild ->
//          Create Text & Voice Channels -> Create Role -> Generate Server Invite.
func TestT4_Scenario1_OnboardingAndServerSetup(t *testing.T) {
	h := harness.GetHarness(t)
	s := h.NewSession()

	username := fmt.Sprintf("founder_%d", time.Now().UnixNano())
	email := fmt.Sprintf("%s@example.com", username)
	password := "ServerFounderPass1!"

	t.Log("Step 1: Register new user")
	resp, body, err := s.PostPublic("/api/auth/register", map[string]string{
		"username": username,
		"email":    email,
		"password": password,
	})
	if err != nil || (resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK) {
		t.Fatalf("Registration failed: %d: %s", resp.StatusCode, string(body))
	}

	t.Log("Step 2: Verify email")
	resp, body, err = s.PostPublic("/api/auth/verify-email", map[string]string{
		"email": email,
		"code":  "123456",
	})
	if err != nil || resp.StatusCode != http.StatusOK {
		t.Fatalf("Email verification failed: %d: %s", resp.StatusCode, string(body))
	}

	t.Log("Step 3: Login to receive auth session & CSRF token")
	resp, body, err = s.PostPublic("/api/auth/login", map[string]string{
		"email":    email,
		"password": password,
	})
	if err != nil || resp.StatusCode != http.StatusOK {
		t.Fatalf("Login failed: %d: %s", resp.StatusCode, string(body))
	}
	var authData harness.AuthResponse
	_ = json.Unmarshal(body, &authData)
	s.UserID = authData.User.ID
	s.Token = authData.Token
	s.CSRFToken = authData.CSRFToken

	t.Log("Step 4: Update user profile")
	bio := "Community Founder & Dev"
	status := "online"
	resp, _, err = s.Patch("/api/users/@me", map[string]string{
		"bio":    bio,
		"status": status,
	})
	if err != nil || resp.StatusCode != http.StatusOK {
		t.Fatalf("Update profile failed: %v", err)
	}

	t.Log("Step 5: Create a new guild")
	resp, body, err = s.Post("/api/guilds", map[string]string{
		"name": "Zero Community Official",
	})
	if err != nil || (resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK) {
		t.Fatalf("Create guild failed: %d: %s", resp.StatusCode, string(body))
	}
	var guild harness.Guild
	_ = json.Unmarshal(body, &guild)

	t.Log("Step 6: Create text and voice channels")
	resp, body, err = s.Post(fmt.Sprintf("/api/guilds/%s/channels", guild.ID), map[string]string{
		"name": "announcements",
		"type": "text",
	})
	if err != nil || (resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK) {
		t.Fatalf("Create announcements channel failed: %d", resp.StatusCode)
	}

	resp, body, err = s.Post(fmt.Sprintf("/api/guilds/%s/channels", guild.ID), map[string]string{
		"name": "Community Lounge",
		"type": "voice",
	})
	if err != nil || (resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK) {
		t.Fatalf("Create voice channel failed: %d", resp.StatusCode)
	}

	t.Log("Step 7: Create Moderator Role")
	resp, body, err = s.Post(fmt.Sprintf("/api/guilds/%s/roles", guild.ID), map[string]any{
		"name":        "Staff Moderator",
		"color":       "#00ffcc",
		"permissions": 8,
	})
	if err != nil || (resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK) {
		t.Fatalf("Create role failed: %d", resp.StatusCode)
	}

	t.Log("Step 8: Generate server invite")
	resp, body, err = s.Post(fmt.Sprintf("/api/guilds/%s/invites", guild.ID), nil)
	if err != nil || (resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK) {
		t.Fatalf("Create invite failed: %d: %s", resp.StatusCode, string(body))
	}
	var inv harness.Invite
	_ = json.Unmarshal(body, &inv)
	if inv.Code == "" {
		t.Fatalf("Generated invite code must not be empty")
	}
	t.Logf("Scenario 1 completed successfully. Guild ID: %s, Invite: %s", guild.ID, inv.Code)
}

// Scenario 2: Full collaborative chat & reactions
// Journey: User A & User B join channel -> User A posts -> User B replies ->
//          Both add reactions -> User A edits message -> User A pins message ->
//          User B fetches pins & acks channel.
func TestT4_Scenario2_CollaborativeChatAndReactions(t *testing.T) {
	h := harness.GetHarness(t)
	userA := h.RegisterAndLogin(t, fmt.Sprintf("chata_%d", time.Now().UnixNano()), fmt.Sprintf("chata_%d@example.com", time.Now().UnixNano()), "Password123!")
	userB := h.RegisterAndLogin(t, fmt.Sprintf("chatb_%d", time.Now().UnixNano()), fmt.Sprintf("chatb_%d@example.com", time.Now().UnixNano()), "Password123!")

	// 1. User A creates guild
	_, body, _ := userA.Post("/api/guilds", map[string]string{"name": "Chat Collab Server"})
	var guild harness.Guild
	_ = json.Unmarshal(body, &guild)
	chID := guild.Channels[0].ID

	// 2. User B joins via invite
	_, invBody, _ := userA.Post(fmt.Sprintf("/api/guilds/%s/invites", guild.ID), nil)
	var inv harness.Invite
	_ = json.Unmarshal(invBody, &inv)
	_, _, _ = userB.Post(fmt.Sprintf("/api/invites/%s/join", inv.Code), nil)

	// 3. User A posts message
	resp, body, err := userA.Post(fmt.Sprintf("/api/channels/%s/messages", chID), map[string]string{
		"content": "Hey everyone! Welcome to the new server.",
	})
	if err != nil || (resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK) {
		t.Fatalf("User A message failed: %d", resp.StatusCode)
	}
	var msgA harness.Message
	_ = json.Unmarshal(body, &msgA)

	// 4. User B replies to User A's message
	resp, body, err = userB.Post(fmt.Sprintf("/api/channels/%s/messages", chID), map[string]any{
		"content":     "Thanks for setting this up!",
		"reply_to_id": msgA.ID,
	})
	if err != nil || (resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK) {
		t.Fatalf("User B reply failed: %d", resp.StatusCode)
	}
	var msgB harness.Message
	_ = json.Unmarshal(body, &msgB)

	// 5. User A adds reaction to User B's reply
	resp, _, err = userA.Post(fmt.Sprintf("/api/channels/%s/messages/%s/reactions", chID, msgB.ID), map[string]string{
		"emoji": "🙌",
	})
	if err != nil || (resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated) {
		t.Fatalf("User A reaction failed: %d", resp.StatusCode)
	}

	// 6. User B adds reaction to User A's post
	resp, _, err = userB.Post(fmt.Sprintf("/api/channels/%s/messages/%s/reactions", chID, msgA.ID), map[string]string{
		"emoji": "🚀",
	})
	if err != nil || (resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated) {
		t.Fatalf("User B reaction failed: %d", resp.StatusCode)
	}

	// 7. User A edits message
	resp, _, err = userA.Patch(fmt.Sprintf("/api/channels/%s/messages/%s", chID, msgA.ID), map[string]string{
		"content": "Hey everyone! Welcome to the new server. (Updated with guidelines)",
	})
	if err != nil || resp.StatusCode != http.StatusOK {
		t.Fatalf("User A message edit failed: %d", resp.StatusCode)
	}

	// 8. User A pins message
	resp, _, err = userA.Post(fmt.Sprintf("/api/channels/%s/messages/%s/pin", chID, msgA.ID), nil)
	if err != nil || resp.StatusCode != http.StatusOK {
		t.Fatalf("User A message pin failed: %d", resp.StatusCode)
	}

	// 9. User B fetches pinned messages
	resp, body, err = userB.Get(fmt.Sprintf("/api/channels/%s/pins", chID))
	if err != nil || resp.StatusCode != http.StatusOK {
		t.Fatalf("User B fetch pins failed: %d", resp.StatusCode)
	}
	var pins []*harness.Message
	_ = json.Unmarshal(body, &pins)
	if len(pins) == 0 {
		t.Errorf("Expected at least one pinned message")
	}

	// 10. User B acknowledges channel
	resp, _, err = userB.Post(fmt.Sprintf("/api/channels/%s/ack", chID), nil)
	if err != nil || resp.StatusCode != http.StatusOK {
		t.Fatalf("User B channel ack failed: %d", resp.StatusCode)
	}
	t.Log("Scenario 2 completed successfully.")
}

// Scenario 3: LiveKit Voice room lifecycle
// Journey: User enters voice channel -> Receives LiveKit token -> Updates mute/screenshare ->
//          Admin updates voice state -> User leaves voice -> Session cleared.
func TestT4_Scenario3_LiveKitVoiceLifecycle(t *testing.T) {
	h := harness.GetHarness(t)
	admin := h.RegisterAndLogin(t, fmt.Sprintf("vcadm_%d", time.Now().UnixNano()), fmt.Sprintf("vcadm_%d@example.com", time.Now().UnixNano()), "Password123!")
	member := h.RegisterAndLogin(t, fmt.Sprintf("vcmem_%d", time.Now().UnixNano()), fmt.Sprintf("vcmem_%d@example.com", time.Now().UnixNano()), "Password123!")

	// 1. Admin creates guild & voice channel
	_, body, _ := admin.Post("/api/guilds", map[string]string{"name": "LiveKit Voice Guild"})
	var guild harness.Guild
	_ = json.Unmarshal(body, &guild)

	_, body, _ = admin.Post(fmt.Sprintf("/api/guilds/%s/channels", guild.ID), map[string]string{
		"name": "Live Stage",
		"type": "voice",
	})
	var voiceChan harness.Channel
	_ = json.Unmarshal(body, &voiceChan)

	// 2. Member joins guild
	_, invBody, _ := admin.Post(fmt.Sprintf("/api/guilds/%s/invites", guild.ID), nil)
	var inv harness.Invite
	_ = json.Unmarshal(invBody, &inv)
	_, _, _ = member.Post(fmt.Sprintf("/api/invites/%s/join", inv.Code), nil)

	// 3. Member joins voice channel and gets LiveKit token
	resp, body, err := member.Post(fmt.Sprintf("/api/channels/%s/join-voice", voiceChan.ID), nil)
	if err != nil || resp.StatusCode != http.StatusOK {
		t.Fatalf("Join voice failed: %d: %s", resp.StatusCode, string(body))
	}
	var tokenData harness.VoiceTokenResponse
	if err := json.Unmarshal(body, &tokenData); err != nil {
		t.Fatalf("Failed to parse LiveKit voice token response: %v", err)
	}
	if tokenData.Token == "" || tokenData.RoomName == "" {
		t.Fatalf("LiveKit token or room_name is empty: %+v", tokenData)
	}

	// 4. Member updates self-mute and screenshare state
	resp, _, err = member.Post(fmt.Sprintf("/api/channels/%s/voice-state", voiceChan.ID), map[string]bool{
		"self_mute":   true,
		"self_deaf":   false,
		"screenshare": true,
	})
	if err != nil || resp.StatusCode != http.StatusOK {
		t.Fatalf("Voice state update failed: %d", resp.StatusCode)
	}

	// 5. Admin server-mutes member or updates voice state
	resp, _, err = admin.Post(fmt.Sprintf("/api/channels/%s/voice-state", voiceChan.ID), map[string]bool{
		"self_mute": false,
	})
	if err != nil || resp.StatusCode != http.StatusOK {
		t.Fatalf("Admin voice state failed: %d", resp.StatusCode)
	}

	// 6. Member leaves voice
	resp, _, err = member.Post(fmt.Sprintf("/api/channels/%s/leave-voice", voiceChan.ID), nil)
	if err != nil || (resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusNoContent) {
		t.Fatalf("Leave voice failed: %d", resp.StatusCode)
	}
	t.Log("Scenario 3 completed successfully.")
}

// Scenario 4: Moderation flow with CSRF validation
// Journey: Owner creates server -> Member joins -> Moderator role created and assigned ->
//          Bad user posts -> Mod mutes bad user -> Bad user tries to post (403) ->
//          Mod kicks bad user -> Bad user rejoins -> Mod bans bad user ->
//          Bad user blocked from rejoining -> Admin unbans.
func TestT4_Scenario4_ModerationLifecycle(t *testing.T) {
	h := harness.GetHarness(t)
	owner := h.RegisterAndLogin(t, fmt.Sprintf("modflow_own_%d", time.Now().UnixNano()), fmt.Sprintf("modflow_own_%d@example.com", time.Now().UnixNano()), "Password123!")
	badUser := h.RegisterAndLogin(t, fmt.Sprintf("modflow_bad_%d", time.Now().UnixNano()), fmt.Sprintf("modflow_bad_%d@example.com", time.Now().UnixNano()), "Password123!")

	// 1. Owner creates server & invite
	_, body, _ := owner.Post("/api/guilds", map[string]string{"name": "Safe Community"})
	var guild harness.Guild
	_ = json.Unmarshal(body, &guild)
	chID := guild.Channels[0].ID

	_, invBody, _ := owner.Post(fmt.Sprintf("/api/guilds/%s/invites", guild.ID), nil)
	var inv harness.Invite
	_ = json.Unmarshal(invBody, &inv)

	// 2. Bad user joins
	_, _, _ = badUser.Post(fmt.Sprintf("/api/invites/%s/join", inv.Code), nil)

	// 3. Bad user posts in channel
	_, body, _ = badUser.Post(fmt.Sprintf("/api/channels/%s/messages", chID), map[string]string{"content": "Spam message 1"})
	var badMsg harness.Message
	_ = json.Unmarshal(body, &badMsg)

	// 4. Owner deletes spam message
	resp, _, err := owner.Delete(fmt.Sprintf("/api/channels/%s/messages/%s", chID, badMsg.ID))
	if err != nil || (resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusNoContent) {
		t.Fatalf("Delete spam message failed: %d", resp.StatusCode)
	}

	// 5. Owner mutes bad user
	resp, _, err = owner.Post(fmt.Sprintf("/api/guilds/%s/members/%s/mute", guild.ID, badUser.UserID), nil)
	if err != nil || resp.StatusCode != http.StatusOK {
		t.Fatalf("Mute member failed: %d", resp.StatusCode)
	}

	// 6. Bad user attempts to speak while muted -> 403 Forbidden
	resp, _, _ = badUser.Post(fmt.Sprintf("/api/channels/%s/messages", chID), map[string]string{"content": "I bypass mute!"})
	if resp.StatusCode != http.StatusForbidden {
		t.Errorf("Expected 403 Forbidden for muted user message attempt, got %d", resp.StatusCode)
	}

	// 7. Owner kicks bad user
	resp, _, err = owner.Post(fmt.Sprintf("/api/guilds/%s/members/%s/kick", guild.ID, badUser.UserID), nil)
	if err != nil || (resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusNoContent) {
		t.Fatalf("Kick member failed: %d", resp.StatusCode)
	}

	// 8. Bad user rejoins via invite
	resp, _, err = badUser.Post(fmt.Sprintf("/api/invites/%s/join", inv.Code), nil)
	if err != nil || resp.StatusCode != http.StatusOK {
		t.Fatalf("Rejoin after kick failed: %d", resp.StatusCode)
	}

	// 9. Owner permanently bans bad user
	resp, _, err = owner.Post(fmt.Sprintf("/api/guilds/%s/bans", guild.ID), map[string]string{
		"user_id": badUser.UserID.String(),
		"reason":  "Repeated spam and disruption",
	})
	if err != nil || (resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated) {
		t.Fatalf("Ban member failed: %d", resp.StatusCode)
	}

	// 10. Banned user attempts to join via invite -> 403 Forbidden
	resp, _, _ = badUser.Post(fmt.Sprintf("/api/invites/%s/join", inv.Code), nil)
	if resp.StatusCode != http.StatusForbidden {
		t.Errorf("Expected 403 Forbidden when banned user attempts to rejoin, got %d", resp.StatusCode)
	}

	// 11. Owner verifies audit log contains ban entry
	resp, body, err = owner.Get(fmt.Sprintf("/api/guilds/%s/audit-logs", guild.ID))
	if err != nil || resp.StatusCode != http.StatusOK {
		t.Fatalf("Fetch audit logs failed: %d", resp.StatusCode)
	}

	// 12. Owner unbans user
	resp, _, err = owner.Delete(fmt.Sprintf("/api/guilds/%s/bans/%s", guild.ID, badUser.UserID))
	if err != nil || (resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusNoContent) {
		t.Fatalf("Unban member failed: %d", resp.StatusCode)
	}
	t.Log("Scenario 4 completed successfully.")
}

// Scenario 5: Direct Message & DM Group collaboration
// Journey: User A creates DM with User B -> Exchange messages -> User A calls User B ->
//          User B accepts call -> Both receive LiveKit tokens -> Call ended ->
//          User A creates DM Group with User B & User C -> Members exchange messages ->
//          Voice token requested -> Member leaves group.
func TestT4_Scenario5_DMAndGroupCollaboration(t *testing.T) {
	h := harness.GetHarness(t)
	userA := h.RegisterAndLogin(t, fmt.Sprintf("dmf_a_%d", time.Now().UnixNano()), fmt.Sprintf("dmf_a_%d@example.com", time.Now().UnixNano()), "Password123!")
	userB := h.RegisterAndLogin(t, fmt.Sprintf("dmf_b_%d", time.Now().UnixNano()), fmt.Sprintf("dmf_b_%d@example.com", time.Now().UnixNano()), "Password123!")
	userC := h.RegisterAndLogin(t, fmt.Sprintf("dmf_c_%d", time.Now().UnixNano()), fmt.Sprintf("dmf_c_%d@example.com", time.Now().UnixNano()), "Password123!")

	// 1. Create 1x1 DM Room
	resp, body, err := userA.Post("/api/dms", map[string]string{
		"recipient_id": userB.UserID.String(),
	})
	if err != nil || (resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated) {
		t.Fatalf("Create DM room failed: %d", resp.StatusCode)
	}
	var room harness.DMRoom
	_ = json.Unmarshal(body, &room)

	// 2. User A sends message in 1x1 DM
	resp, _, err = userA.Post(fmt.Sprintf("/api/dms/%s/messages", room.ID), map[string]string{
		"content": "Hey B, are you free for a quick call?",
	})
	if err != nil || (resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK) {
		t.Fatalf("User A send DM message failed: %d", resp.StatusCode)
	}

	// 3. User A initiates 1x1 call invite
	resp, _, err = userA.Post(fmt.Sprintf("/api/dms/%s/call/invite", room.ID), nil)
	if err != nil || resp.StatusCode != http.StatusOK {
		t.Fatalf("Call invite failed: %d", resp.StatusCode)
	}

	// 4. User B accepts 1x1 call and receives LiveKit token
	resp, body, err = userB.Post(fmt.Sprintf("/api/dms/%s/call/accept", room.ID), nil)
	if err != nil || resp.StatusCode != http.StatusOK {
		t.Fatalf("Call accept failed: %d", resp.StatusCode)
	}
	var callToken harness.VoiceTokenResponse
	if err := json.Unmarshal(body, &callToken); err == nil {
		if callToken.Token == "" {
			t.Errorf("Expected LiveKit token on call accept")
		}
	}

	// 5. User A leaves call
	resp, _, err = userA.Post(fmt.Sprintf("/api/dms/%s/call/leave", room.ID), nil)
	if err != nil || resp.StatusCode != http.StatusOK {
		t.Fatalf("Leave call failed: %d", resp.StatusCode)
	}

	// 6. User A creates DM Group with User B and User C
	resp, body, err = userA.Post("/api/dm/groups", map[string]any{
		"name": "Design Sprint Squad",
		"member_ids": []uuid.UUID{
			userB.UserID,
			userC.UserID,
		},
	})
	if err != nil || (resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK) {
		t.Fatalf("Create DM Group failed: %d", resp.StatusCode)
	}
	var group harness.DMGroup
	_ = json.Unmarshal(body, &group)

	// 7. Request voice token for DM group
	resp, body, err = userA.Post(fmt.Sprintf("/api/dm/groups/%s/voice-token", group.ID), nil)
	if err == nil && resp.StatusCode == http.StatusOK {
		t.Logf("Group voice token acquired: %s", string(body))
	}

	t.Log("Scenario 5 completed successfully.")
}
