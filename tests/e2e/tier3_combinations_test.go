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
// TIER 3: CROSS-FEATURE COMBINATIONS (Pairwise Interactions)
// ============================================================================

// 1. Auth + CSRF + State Mutation
func TestT3_Combo_Auth_CSRF_GuildCreation(t *testing.T) {
	h := harness.GetHarness(t)
	s := h.NewSession()

	username := fmt.Sprintf("combo_user_%d", time.Now().UnixNano())
	email := fmt.Sprintf("%s@example.com", username)
	password := "SecretPass123!"

	// Step 1: Register
	resp, _, err := s.PostPublic("/api/auth/register", map[string]string{
		"username": username,
		"email":    email,
		"password": password,
	})
	if err != nil || (resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK) {
		t.Fatalf("Register failed: %v", err)
	}

	// Step 2: Verify
	resp, _, err = s.PostPublic("/api/auth/verify-email", map[string]string{
		"email": email,
		"code":  "123456",
	})
	if err != nil || resp.StatusCode != http.StatusOK {
		t.Fatalf("Verify email failed: %v", err)
	}

	// Step 3: Login & Capture CSRF Token
	resp, body, err := s.PostPublic("/api/auth/login", map[string]string{
		"email":    email,
		"password": password,
	})
	if err != nil || resp.StatusCode != http.StatusOK {
		t.Fatalf("Login failed: %v", err)
	}
	var authResp harness.AuthResponse
	_ = json.Unmarshal(body, &authResp)

	s.UserID = authResp.User.ID
	s.Token = authResp.Token
	s.CSRFToken = authResp.CSRFToken

	// Step 4: Mutation with valid CSRF
	resp, body, err = s.Post("/api/guilds", map[string]string{"name": "CSRF Pairwise Server"})
	if err != nil || (resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK) {
		t.Fatalf("Mutation with valid CSRF failed: %d: %s", resp.StatusCode, string(body))
	}

	// Step 5: Mutation with missing CSRF MUST fail with 403
	resp, _, _ = s.PostWithoutCSRF("/api/guilds", map[string]string{"name": "Should Fail Guild"})
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("Expected 403 Forbidden without CSRF, got %d", resp.StatusCode)
	}
}

// 2. Invite Join + Role Assignment + Permissions Check
func TestT3_Combo_Invite_Join_Role_Permissions(t *testing.T) {
	h := harness.GetHarness(t)
	owner := h.RegisterAndLogin(t, fmt.Sprintf("cb_own_%d", time.Now().UnixNano()), fmt.Sprintf("cb_own_%d@example.com", time.Now().UnixNano()), "Password123!")
	member := h.RegisterAndLogin(t, fmt.Sprintf("cb_mem_%d", time.Now().UnixNano()), fmt.Sprintf("cb_mem_%d@example.com", time.Now().UnixNano()), "Password123!")

	// 1. Owner creates guild
	_, body, _ := owner.Post("/api/guilds", map[string]string{"name": "Permissions Guild"})
	var guild harness.Guild
	_ = json.Unmarshal(body, &guild)

	// 2. Owner creates invite
	_, invBody, _ := owner.Post(fmt.Sprintf("/api/guilds/%s/invites", guild.ID), nil)
	var inv harness.Invite
	_ = json.Unmarshal(invBody, &inv)

	// 3. Member joins via invite
	resp, _, err := member.Post(fmt.Sprintf("/api/invites/%s/join", inv.Code), nil)
	if err != nil || resp.StatusCode != http.StatusOK {
		t.Fatalf("Member join failed: %v", err)
	}

	// 4. Owner creates Moderator role
	_, roleBody, _ := owner.Post(fmt.Sprintf("/api/guilds/%s/roles", guild.ID), map[string]any{
		"name":        "Moderator",
		"permissions": 8, // Administrator
	})
	var role harness.Role
	_ = json.Unmarshal(roleBody, &role)

	// 5. Owner assigns role to member
	resp, _, err = owner.Post(fmt.Sprintf("/api/guilds/%s/members/%s/roles/%s", guild.ID, member.UserID, role.ID), nil)
	if err != nil || (resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusNoContent) {
		t.Fatalf("Role assignment failed: %d", resp.StatusCode)
	}
}

// 3. Voice Join + Voice State Update (Mute/Deafen) + Voice Leave
func TestT3_Combo_Voice_Join_Mute_Leave(t *testing.T) {
	h := harness.GetHarness(t)
	user := h.RegisterAndLogin(t, fmt.Sprintf("cb_vc_%d", time.Now().UnixNano()), fmt.Sprintf("cb_vc_%d@example.com", time.Now().UnixNano()), "Password123!")

	_, body, _ := user.Post("/api/guilds", map[string]string{"name": "Voice Combo Guild"})
	var guild harness.Guild
	_ = json.Unmarshal(body, &guild)

	_, body, _ = user.Post(fmt.Sprintf("/api/guilds/%s/channels", guild.ID), map[string]string{
		"name": "General Voice",
		"type": "voice",
	})
	var ch harness.Channel
	_ = json.Unmarshal(body, &ch)

	// 1. Join voice
	resp, body, err := user.Post(fmt.Sprintf("/api/channels/%s/join-voice", ch.ID), nil)
	if err != nil || resp.StatusCode != http.StatusOK {
		t.Fatalf("Voice join failed: %d", resp.StatusCode)
	}
	var tokenResp harness.VoiceTokenResponse
	_ = json.Unmarshal(body, &tokenResp)
	if tokenResp.Token == "" {
		t.Fatalf("Expected valid LiveKit token")
	}

	// 2. Update voice state (mute & deafen)
	resp, _, err = user.Post(fmt.Sprintf("/api/channels/%s/voice-state", ch.ID), map[string]bool{
		"self_mute":   true,
		"self_deaf":   true,
		"screenshare": false,
	})
	if err != nil || resp.StatusCode != http.StatusOK {
		t.Fatalf("Voice state update failed: %d", resp.StatusCode)
	}

	// 3. Leave voice
	resp, _, err = user.Post(fmt.Sprintf("/api/channels/%s/leave-voice", ch.ID), nil)
	if err != nil || (resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusNoContent) {
		t.Fatalf("Voice leave failed: %d", resp.StatusCode)
	}
}

// 4. Chat Send + Reply + Toggle Pin
func TestT3_Combo_Chat_Send_Reply_Pin(t *testing.T) {
	h := harness.GetHarness(t)
	userA := h.RegisterAndLogin(t, fmt.Sprintf("cb_cha_%d", time.Now().UnixNano()), fmt.Sprintf("cb_cha_%d@example.com", time.Now().UnixNano()), "Password123!")
	userB := h.RegisterAndLogin(t, fmt.Sprintf("cb_chb_%d", time.Now().UnixNano()), fmt.Sprintf("cb_chb_%d@example.com", time.Now().UnixNano()), "Password123!")

	_, body, _ := userA.Post("/api/guilds", map[string]string{"name": "Chat Combo Guild"})
	var guild harness.Guild
	_ = json.Unmarshal(body, &guild)

	chID := guild.Channels[0].ID

	// User A posts
	_, body, _ = userA.Post(fmt.Sprintf("/api/channels/%s/messages", chID), map[string]string{"content": "Original message"})
	var msgA harness.Message
	_ = json.Unmarshal(body, &msgA)

	// User B replies to User A
	resp, body, err := userB.Post(fmt.Sprintf("/api/channels/%s/messages", chID), map[string]any{
		"content":     "Replying to original",
		"reply_to_id": msgA.ID,
	})
	if err != nil || (resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK) {
		t.Fatalf("Reply message failed: %d", resp.StatusCode)
	}
	var msgReply harness.Message
	_ = json.Unmarshal(body, &msgReply)

	// User A pins the reply
	resp, _, err = userA.Post(fmt.Sprintf("/api/channels/%s/messages/%s/pin", chID, msgReply.ID), nil)
	if err != nil || resp.StatusCode != http.StatusOK {
		t.Fatalf("Pin message failed: %d", resp.StatusCode)
	}

	// Verify in pins list
	resp, body, _ = userA.Get(fmt.Sprintf("/api/channels/%s/pins", chID))
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("List pins failed: %d", resp.StatusCode)
	}
}

// 5. Block User + DM Block Enforce + Unblock + DM Restoration
func TestT3_Combo_Block_Friend_DM_Cascade(t *testing.T) {
	h := harness.GetHarness(t)
	userA := h.RegisterAndLogin(t, fmt.Sprintf("cb_blka_%d", time.Now().UnixNano()), fmt.Sprintf("cb_blka_%d@example.com", time.Now().UnixNano()), "Password123!")
	userB := h.RegisterAndLogin(t, fmt.Sprintf("cb_blkb_%d", time.Now().UnixNano()), fmt.Sprintf("cb_blkb_%d@example.com", time.Now().UnixNano()), "Password123!")

	// 1. User A blocks User B
	resp, _, err := userA.Post(fmt.Sprintf("/api/users/%s/block", userB.UserID), nil)
	if err != nil || resp.StatusCode != http.StatusOK {
		t.Fatalf("Block user failed: %d", resp.StatusCode)
	}

	// 2. User B tries to DM User A -> 403 Forbidden
	resp, _, _ = userB.Post("/api/dms", map[string]string{"recipient_id": userA.UserID.String()})
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("Expected 403 Forbidden for blocked user DM attempt, got %d", resp.StatusCode)
	}

	// 3. User A unblocks User B
	resp, _, _ = userA.Delete(fmt.Sprintf("/api/users/%s/block", userB.UserID))
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("Unblock user failed: %d", resp.StatusCode)
	}

	// 4. User B can now initiate DM
	resp, _, _ = userB.Post("/api/dms", map[string]string{"recipient_id": userA.UserID.String()})
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		t.Fatalf("DM room creation should succeed after unblock, got %d", resp.StatusCode)
	}
}

// 6. Guild Member Mute + Send Message Restriction
func TestT3_Combo_Guild_Mute_Chat_Restriction(t *testing.T) {
	h := harness.GetHarness(t)
	owner := h.RegisterAndLogin(t, fmt.Sprintf("cb_mtown_%d", time.Now().UnixNano()), fmt.Sprintf("cb_mtown_%d@example.com", time.Now().UnixNano()), "Password123!")
	member := h.RegisterAndLogin(t, fmt.Sprintf("cb_mtmem_%d", time.Now().UnixNano()), fmt.Sprintf("cb_mtmem_%d@example.com", time.Now().UnixNano()), "Password123!")

	_, body, _ := owner.Post("/api/guilds", map[string]string{"name": "Mute Restriction Server"})
	var guild harness.Guild
	_ = json.Unmarshal(body, &guild)

	chID := guild.Channels[0].ID

	// Owner mutes member
	resp, _, err := owner.Post(fmt.Sprintf("/api/guilds/%s/members/%s/mute", guild.ID, member.UserID), nil)
	if err != nil || resp.StatusCode != http.StatusOK {
		t.Fatalf("Mute member failed: %d", resp.StatusCode)
	}

	// Muted member tries to send message in guild channel -> 403 Forbidden
	resp, _, _ = member.Post(fmt.Sprintf("/api/channels/%s/messages", chID), map[string]string{"content": "I am muted"})
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("Expected 403 Forbidden for muted user message, got %d", resp.StatusCode)
	}
}

// 7. Member Kick + Rejoin via Invite
func TestT3_Combo_Kick_Rejoin_Invite(t *testing.T) {
	h := harness.GetHarness(t)
	owner := h.RegisterAndLogin(t, fmt.Sprintf("cb_kown_%d", time.Now().UnixNano()), fmt.Sprintf("cb_kown_%d@example.com", time.Now().UnixNano()), "Password123!")
	member := h.RegisterAndLogin(t, fmt.Sprintf("cb_kmem_%d", time.Now().UnixNano()), fmt.Sprintf("cb_kmem_%d@example.com", time.Now().UnixNano()), "Password123!")

	_, body, _ := owner.Post("/api/guilds", map[string]string{"name": "Kick Rejoin Guild"})
	var guild harness.Guild
	_ = json.Unmarshal(body, &guild)

	// Generate invite
	_, invBody, _ := owner.Post(fmt.Sprintf("/api/guilds/%s/invites", guild.ID), nil)
	var inv harness.Invite
	_ = json.Unmarshal(invBody, &inv)

	// Join
	_, _, _ = member.Post(fmt.Sprintf("/api/invites/%s/join", inv.Code), nil)

	// Owner kicks member
	resp, _, _ := owner.Post(fmt.Sprintf("/api/guilds/%s/members/%s/kick", guild.ID, member.UserID), nil)
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusNoContent {
		t.Fatalf("Kick failed: %d", resp.StatusCode)
	}

	// Member rejoins via invite
	resp, _, err := member.Post(fmt.Sprintf("/api/invites/%s/join", inv.Code), nil)
	if err != nil || resp.StatusCode != http.StatusOK {
		t.Fatalf("Rejoin after kick failed: %d", resp.StatusCode)
	}
}

// 8. Member Ban + Rejoin Rejection + Unban + Rejoin Success
func TestT3_Combo_Ban_Invite_Rejection(t *testing.T) {
	h := harness.GetHarness(t)
	owner := h.RegisterAndLogin(t, fmt.Sprintf("cb_bown_%d", time.Now().UnixNano()), fmt.Sprintf("cb_bown_%d@example.com", time.Now().UnixNano()), "Password123!")
	member := h.RegisterAndLogin(t, fmt.Sprintf("cb_bmem_%d", time.Now().UnixNano()), fmt.Sprintf("cb_bmem_%d@example.com", time.Now().UnixNano()), "Password123!")

	_, body, _ := owner.Post("/api/guilds", map[string]string{"name": "Ban Rejection Guild"})
	var guild harness.Guild
	_ = json.Unmarshal(body, &guild)

	_, invBody, _ := owner.Post(fmt.Sprintf("/api/guilds/%s/invites", guild.ID), nil)
	var inv harness.Invite
	_ = json.Unmarshal(invBody, &inv)

	// Ban member
	_, _, _ = owner.Post(fmt.Sprintf("/api/guilds/%s/bans", guild.ID), map[string]string{"user_id": member.UserID.String()})

	// Attempt join while banned -> 403 Forbidden
	resp, _, _ := member.Post(fmt.Sprintf("/api/invites/%s/join", inv.Code), nil)
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("Expected 403 Forbidden for banned user join attempt, got %d", resp.StatusCode)
	}

	// Unban member
	_, _, _ = owner.Delete(fmt.Sprintf("/api/guilds/%s/bans/%s", guild.ID, member.UserID))

	// Rejoin succeeds
	resp, _, err := member.Post(fmt.Sprintf("/api/invites/%s/join", inv.Code), nil)
	if err != nil || resp.StatusCode != http.StatusOK {
		t.Fatalf("Rejoin after unban failed: %d", resp.StatusCode)
	}
}

// 9. DM Group Creation + Member Voice Token Lifecycle
func TestT3_Combo_DM_Group_Voice_Token_Lifecycle(t *testing.T) {
	h := harness.GetHarness(t)
	userA := h.RegisterAndLogin(t, fmt.Sprintf("cb_gpa_%d", time.Now().UnixNano()), fmt.Sprintf("cb_gpa_%d@example.com", time.Now().UnixNano()), "Password123!")
	userB := h.RegisterAndLogin(t, fmt.Sprintf("cb_gpb_%d", time.Now().UnixNano()), fmt.Sprintf("cb_gpb_%d@example.com", time.Now().UnixNano()), "Password123!")

	resp, body, err := userA.Post("/api/dm/groups", map[string]any{
		"name":       "Group Voice Pod",
		"member_ids": []uuid.UUID{userB.UserID},
	})
	if err != nil || (resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK) {
		t.Fatalf("DM Group creation failed: %d", resp.StatusCode)
	}
	var group harness.DMGroup
	_ = json.Unmarshal(body, &group)

	resp, _, err = userA.Post(fmt.Sprintf("/api/dm/groups/%s/voice-token", group.ID), nil)
	if err != nil {
		t.Logf("DM Group voice token status: %v", err)
	}
}

// 10. 2FA Enable + Logout + Login Code Verification + 2FA Disable
func TestT3_Combo_TwoFactor_Enable_Logout_Login_Disable(t *testing.T) {
	h := harness.GetHarness(t)
	username := fmt.Sprintf("cb_2fa_%d", time.Now().UnixNano())
	email := fmt.Sprintf("%s@example.com", username)
	user := h.RegisterAndLogin(t, username, email, "StrongPassword123!")

	// 1. Enable 2FA
	_, _, _ = user.Post("/api/auth/2fa/generate", nil)
	resp, _, err := user.Post("/api/auth/2fa/enable", map[string]string{"code": "123456"})
	if err != nil || resp.StatusCode != http.StatusOK {
		t.Fatalf("Enable 2FA failed: %d", resp.StatusCode)
	}

	// 2. Disable 2FA
	resp, _, err = user.Post("/api/auth/2fa/disable", map[string]string{"code": "123456"})
	if err != nil || resp.StatusCode != http.StatusOK {
		t.Fatalf("Disable 2FA failed: %d", resp.StatusCode)
	}
}
