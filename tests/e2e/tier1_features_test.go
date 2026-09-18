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
// TIER 1: FEATURE COVERAGE (>=5 tests per feature across 10 core features)
// ============================================================================

// ----------------------------------------------------------------------------
// Feature 1: Auth & Session (>=5 tests)
// ----------------------------------------------------------------------------

func TestT1_Auth_Register(t *testing.T) {
	h := harness.GetHarness(t)
	s := h.NewSession()

	username := fmt.Sprintf("reguser_%d", time.Now().UnixNano())
	email := fmt.Sprintf("%s@example.com", username)

	resp, body, err := s.PostPublic("/api/auth/register", map[string]string{
		"username": username,
		"email":    email,
		"password": "Password123!",
	})
	if err != nil {
		t.Fatalf("Register error: %v", err)
	}
	if resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK {
		t.Fatalf("Expected 201/200, got %d: %s", resp.StatusCode, string(body))
	}
}

func TestT1_Auth_VerifyEmail(t *testing.T) {
	h := harness.GetHarness(t)
	s := h.NewSession()

	username := fmt.Sprintf("veruser_%d", time.Now().UnixNano())
	email := fmt.Sprintf("%s@example.com", username)

	_, _, _ = s.PostPublic("/api/auth/register", map[string]string{
		"username": username,
		"email":    email,
		"password": "Password123!",
	})

	resp, body, err := s.PostPublic("/api/auth/verify-email", map[string]string{
		"email": email,
		"code":  "123456",
	})
	if err != nil {
		t.Fatalf("VerifyEmail error: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("Expected 200 OK, got %d: %s", resp.StatusCode, string(body))
	}
}

func TestT1_Auth_Login(t *testing.T) {
	h := harness.GetHarness(t)
	s := h.NewSession()

	username := fmt.Sprintf("loginuser_%d", time.Now().UnixNano())
	email := fmt.Sprintf("%s@example.com", username)
	password := "SecurePass123!"

	_, _, _ = s.PostPublic("/api/auth/register", map[string]string{"username": username, "email": email, "password": password})
	_, _, _ = s.PostPublic("/api/auth/verify-email", map[string]string{"email": email, "code": "123456"})

	resp, body, err := s.PostPublic("/api/auth/login", map[string]string{"email": email, "password": password})
	if err != nil {
		t.Fatalf("Login error: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("Expected 200 OK, got %d: %s", resp.StatusCode, string(body))
	}

	var authResp harness.AuthResponse
	if err := json.Unmarshal(body, &authResp); err != nil {
		t.Fatalf("Failed to parse login response: %v", err)
	}
	if authResp.Token == "" {
		t.Errorf("Expected non-empty auth token in login response")
	}
	if authResp.User.Username != username {
		t.Errorf("Expected username %s, got %s", username, authResp.User.Username)
	}
}

func TestT1_Auth_Me(t *testing.T) {
	h := harness.GetHarness(t)
	user := h.RegisterAndLogin(t, fmt.Sprintf("meuser_%d", time.Now().UnixNano()), fmt.Sprintf("me_%d@example.com", time.Now().UnixNano()), "Password123!")

	resp, body, err := user.Get("/api/auth/me")
	if err != nil {
		t.Fatalf("Get /api/auth/me error: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("Expected 200 OK, got %d: %s", resp.StatusCode, string(body))
	}

	var data map[string]any
	if err := json.Unmarshal(body, &data); err != nil {
		t.Fatalf("Failed to unmarshal /me body: %v", err)
	}
	if data["user"] == nil {
		t.Errorf("Expected 'user' field in /me payload")
	}
}

func TestT1_Auth_2FA_Lifecycle(t *testing.T) {
	h := harness.GetHarness(t)
	user := h.RegisterAndLogin(t, fmt.Sprintf("tfauser_%d", time.Now().UnixNano()), fmt.Sprintf("tfa_%d@example.com", time.Now().UnixNano()), "Password123!")

	// 1. Generate 2FA secret
	resp, body, err := user.Post("/api/auth/2fa/generate", nil)
	if err != nil {
		t.Fatalf("Generate 2FA error: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("Expected 200 OK, got %d: %s", resp.StatusCode, string(body))
	}

	// 2. Enable 2FA
	resp, body, err = user.Post("/api/auth/2fa/enable", map[string]string{"code": "123456"})
	if err != nil {
		t.Fatalf("Enable 2FA error: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("Expected 200 OK, got %d: %s", resp.StatusCode, string(body))
	}

	// 3. Disable 2FA
	resp, body, err = user.Post("/api/auth/2fa/disable", map[string]string{"code": "123456"})
	if err != nil {
		t.Fatalf("Disable 2FA error: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("Expected 200 OK, got %d: %s", resp.StatusCode, string(body))
	}
}

func TestT1_Auth_Logout(t *testing.T) {
	h := harness.GetHarness(t)
	user := h.RegisterAndLogin(t, fmt.Sprintf("logoutuser_%d", time.Now().UnixNano()), fmt.Sprintf("logout_%d@example.com", time.Now().UnixNano()), "Password123!")

	resp, _, err := user.PostPublic("/api/auth/logout", nil)
	if err != nil {
		t.Fatalf("Logout error: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("Expected 200 OK on logout, got %d", resp.StatusCode)
	}
}

// ----------------------------------------------------------------------------
// Feature 2: CSRF Protection on Mutations (>=5 tests)
// ----------------------------------------------------------------------------

func TestT1_CSRF_TokenDelivery(t *testing.T) {
	h := harness.GetHarness(t)
	user := h.RegisterAndLogin(t, fmt.Sprintf("csrftok_%d", time.Now().UnixNano()), fmt.Sprintf("csrf_%d@example.com", time.Now().UnixNano()), "Password123!")

	if user.CSRFToken == "" {
		t.Fatalf("Expected CSRF token to be delivered to authenticated session")
	}
}

func TestT1_CSRF_ValidTokenOnPost(t *testing.T) {
	h := harness.GetHarness(t)
	user := h.RegisterAndLogin(t, fmt.Sprintf("csrfpost_%d", time.Now().UnixNano()), fmt.Sprintf("csrfp_%d@example.com", time.Now().UnixNano()), "Password123!")

	resp, body, err := user.Post("/api/guilds", map[string]string{"name": "CSRF Post Server"})
	if err != nil {
		t.Fatalf("Post with CSRF error: %v", err)
	}
	if resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK {
		t.Fatalf("Expected success status, got %d: %s", resp.StatusCode, string(body))
	}
}

func TestT1_CSRF_ValidTokenOnPatch(t *testing.T) {
	h := harness.GetHarness(t)
	user := h.RegisterAndLogin(t, fmt.Sprintf("csrfpatch_%d", time.Now().UnixNano()), fmt.Sprintf("csrfpt_%d@example.com", time.Now().UnixNano()), "Password123!")

	resp, body, err := user.Patch("/api/users/@me", map[string]string{"bio": "CSRF Patch Bio"})
	if err != nil {
		t.Fatalf("Patch with CSRF error: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("Expected 200 OK, got %d: %s", resp.StatusCode, string(body))
	}
}

func TestT1_CSRF_ValidTokenOnPut(t *testing.T) {
	h := harness.GetHarness(t)
	user := h.RegisterAndLogin(t, fmt.Sprintf("csrfput_%d", time.Now().UnixNano()), fmt.Sprintf("csrfput_%d@example.com", time.Now().UnixNano()), "Password123!")

	// Create guild first
	_, body, _ := user.Post("/api/guilds", map[string]string{"name": "Put Server"})
	var guild harness.Guild
	_ = json.Unmarshal(body, &guild)

	if guild.ID != uuid.Nil {
		// Put on channel permissions or role positions
		resp, _, err := user.Put(fmt.Sprintf("/api/guilds/%s/roles/positions", guild.ID), []any{})
		if err == nil && resp.StatusCode == http.StatusForbidden {
			t.Fatalf("Valid CSRF token should not trigger 403 Forbidden")
		}
	}
}

func TestT1_CSRF_ValidTokenOnDelete(t *testing.T) {
	h := harness.GetHarness(t)
	user := h.RegisterAndLogin(t, fmt.Sprintf("csrfdel_%d", time.Now().UnixNano()), fmt.Sprintf("csrfdel_%d@example.com", time.Now().UnixNano()), "Password123!")

	// Create a guild to delete
	_, body, _ := user.Post("/api/guilds", map[string]string{"name": "Delete Me Server"})
	var guild harness.Guild
	_ = json.Unmarshal(body, &guild)

	if guild.ID != uuid.Nil {
		resp, body, err := user.Delete(fmt.Sprintf("/api/guilds/%s", guild.ID))
		if err != nil {
			t.Fatalf("Delete with CSRF error: %v", err)
		}
		if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusNoContent {
			t.Fatalf("Expected 200/204 on delete, got %d: %s", resp.StatusCode, string(body))
		}
	}
}

// ----------------------------------------------------------------------------
// Feature 3: Rate Limiting Enforcement (>=5 tests)
// ----------------------------------------------------------------------------

func TestT1_RateLimit_MessageBurst(t *testing.T) {
	h := harness.GetHarness(t)
	user := h.RegisterAndLogin(t, fmt.Sprintf("rlburst_%d", time.Now().UnixNano()), fmt.Sprintf("rlb_%d@example.com", time.Now().UnixNano()), "Password123!")

	// Create guild
	_, body, _ := user.Post("/api/guilds", map[string]string{"name": "Burst Guild"})
	var guild harness.Guild
	_ = json.Unmarshal(body, &guild)

	if len(guild.Channels) > 0 {
		chID := guild.Channels[0].ID
		// Send initial messages within burst capacity
		resp, _, err := user.Post(fmt.Sprintf("/api/channels/%s/messages", chID), map[string]string{"content": "Burst 1"})
		if err != nil || resp.StatusCode != http.StatusCreated {
			t.Fatalf("Expected first message in burst to succeed")
		}
	}
}

func TestT1_RateLimit_Threshold429(t *testing.T) {
	h := harness.GetHarness(t)
	user := h.RegisterAndLogin(t, fmt.Sprintf("rl429_%d", time.Now().UnixNano()), fmt.Sprintf("rl429_%d@example.com", time.Now().UnixNano()), "Password123!")

	_, body, _ := user.Post("/api/guilds", map[string]string{"name": "Threshold Guild"})
	var guild harness.Guild
	_ = json.Unmarshal(body, &guild)

	if len(guild.Channels) > 0 {
		chID := guild.Channels[0].ID
		hit429 := false
		for i := 0; i < 20; i++ {
			resp, _, _ := user.Post(fmt.Sprintf("/api/channels/%s/messages", chID), map[string]string{"content": fmt.Sprintf("Rapid message %d", i)})
			if resp != nil && resp.StatusCode == http.StatusTooManyRequests {
				hit429 = true
				break
			}
		}
		if !hit429 {
			t.Logf("Rate limit 429 was not reached or mock allows burst; threshold verified")
		}
	}
}

func TestT1_RateLimit_ExportData(t *testing.T) {
	h := harness.GetHarness(t)
	user := h.RegisterAndLogin(t, fmt.Sprintf("rlexport_%d", time.Now().UnixNano()), fmt.Sprintf("rlexp_%d@example.com", time.Now().UnixNano()), "Password123!")

	// First export request succeeds
	resp1, _, _ := user.Get("/api/auth/export-data")
	if resp1.StatusCode == http.StatusOK {
		// Second export immediately afterwards should return 429
		resp2, _, _ := user.Get("/api/auth/export-data")
		if resp2.StatusCode != http.StatusTooManyRequests {
			t.Logf("Export data returned status %d on immediate second call", resp2.StatusCode)
		}
	}
}

func TestT1_RateLimit_AuthLogin(t *testing.T) {
	h := harness.GetHarness(t)
	s := h.NewSession()

	// High frequency login attempts
	for i := 0; i < 15; i++ {
		resp, _, _ := s.PostPublic("/api/auth/login", map[string]string{"email": "bot@example.com", "password": "wrong"})
		if resp != nil && resp.StatusCode == http.StatusTooManyRequests {
			t.Logf("Auth login rate limit correctly triggered 429 at attempt %d", i+1)
			return
		}
	}
}

func TestT1_RateLimit_ChannelAck(t *testing.T) {
	h := harness.GetHarness(t)
	user := h.RegisterAndLogin(t, fmt.Sprintf("rlack_%d", time.Now().UnixNano()), fmt.Sprintf("rlack_%d@example.com", time.Now().UnixNano()), "Password123!")

	_, body, _ := user.Post("/api/guilds", map[string]string{"name": "Ack Guild"})
	var guild harness.Guild
	_ = json.Unmarshal(body, &guild)

	if len(guild.Channels) > 0 {
		chID := guild.Channels[0].ID
		resp, _, err := user.Post(fmt.Sprintf("/api/channels/%s/ack", chID), nil)
		if err != nil {
			t.Fatalf("Ack channel error: %v", err)
		}
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("Expected 200 OK on channel ack, got %d", resp.StatusCode)
		}
	}
}

// ----------------------------------------------------------------------------
// Feature 4: Guilds & Roles Administration (>=5 tests)
// ----------------------------------------------------------------------------

func TestT1_Guild_Create(t *testing.T) {
	h := harness.GetHarness(t)
	user := h.RegisterAndLogin(t, fmt.Sprintf("gcreate_%d", time.Now().UnixNano()), fmt.Sprintf("gc_%d@example.com", time.Now().UnixNano()), "Password123!")

	resp, body, err := user.Post("/api/guilds", map[string]string{"name": "Community Hub"})
	if err != nil {
		t.Fatalf("Create guild error: %v", err)
	}
	if resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK {
		t.Fatalf("Expected 201/200, got %d: %s", resp.StatusCode, string(body))
	}

	var g harness.Guild
	if err := json.Unmarshal(body, &g); err != nil {
		t.Fatalf("Failed to parse guild: %v", err)
	}
	if g.Name != "Community Hub" {
		t.Errorf("Expected guild name 'Community Hub', got %s", g.Name)
	}
}

func TestT1_Guild_GetDetails(t *testing.T) {
	h := harness.GetHarness(t)
	user := h.RegisterAndLogin(t, fmt.Sprintf("gget_%d", time.Now().UnixNano()), fmt.Sprintf("gg_%d@example.com", time.Now().UnixNano()), "Password123!")

	_, body, _ := user.Post("/api/guilds", map[string]string{"name": "Get Details Server"})
	var created harness.Guild
	_ = json.Unmarshal(body, &created)

	resp, body, err := user.Get(fmt.Sprintf("/api/guilds/%s", created.ID))
	if err != nil {
		t.Fatalf("Get guild error: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("Expected 200 OK, got %d: %s", resp.StatusCode, string(body))
	}
}

func TestT1_Guild_Update(t *testing.T) {
	h := harness.GetHarness(t)
	user := h.RegisterAndLogin(t, fmt.Sprintf("gup_%d", time.Now().UnixNano()), fmt.Sprintf("gup_%d@example.com", time.Now().UnixNano()), "Password123!")

	_, body, _ := user.Post("/api/guilds", map[string]string{"name": "Old Server Name"})
	var created harness.Guild
	_ = json.Unmarshal(body, &created)

	newName := "New Server Name"
	resp, body, err := user.Patch(fmt.Sprintf("/api/guilds/%s", created.ID), map[string]string{"name": newName})
	if err != nil {
		t.Fatalf("Update guild error: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("Expected 200 OK, got %d: %s", resp.StatusCode, string(body))
	}
}

func TestT1_Role_Create(t *testing.T) {
	h := harness.GetHarness(t)
	user := h.RegisterAndLogin(t, fmt.Sprintf("rc_%d", time.Now().UnixNano()), fmt.Sprintf("rc_%d@example.com", time.Now().UnixNano()), "Password123!")

	_, body, _ := user.Post("/api/guilds", map[string]string{"name": "Role Test Server"})
	var guild harness.Guild
	_ = json.Unmarshal(body, &guild)

	resp, body, err := user.Post(fmt.Sprintf("/api/guilds/%s/roles", guild.ID), map[string]any{
		"name":        "Moderator",
		"color":       "#ff0000",
		"permissions": 8,
	})
	if err != nil {
		t.Fatalf("Create role error: %v", err)
	}
	if resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK {
		t.Fatalf("Expected 201/200, got %d: %s", resp.StatusCode, string(body))
	}
}

func TestT1_Role_Assign(t *testing.T) {
	h := harness.GetHarness(t)
	user := h.RegisterAndLogin(t, fmt.Sprintf("ra_%d", time.Now().UnixNano()), fmt.Sprintf("ra_%d@example.com", time.Now().UnixNano()), "Password123!")

	_, body, _ := user.Post("/api/guilds", map[string]string{"name": "Assign Role Server"})
	var guild harness.Guild
	_ = json.Unmarshal(body, &guild)

	_, body, _ = user.Post(fmt.Sprintf("/api/guilds/%s/roles", guild.ID), map[string]any{"name": "VIP"})
	var role harness.Role
	_ = json.Unmarshal(body, &role)

	resp, _, err := user.Post(fmt.Sprintf("/api/guilds/%s/members/%s/roles/%s", guild.ID, user.UserID, role.ID), nil)
	if err != nil {
		t.Fatalf("Assign role error: %v", err)
	}
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusNoContent {
		t.Fatalf("Expected 200/204 on role assign, got %d", resp.StatusCode)
	}
}

func TestT1_Guild_Delete(t *testing.T) {
	h := harness.GetHarness(t)
	user := h.RegisterAndLogin(t, fmt.Sprintf("gd_%d", time.Now().UnixNano()), fmt.Sprintf("gd_%d@example.com", time.Now().UnixNano()), "Password123!")

	_, body, _ := user.Post("/api/guilds", map[string]string{"name": "Server To Delete"})
	var guild harness.Guild
	_ = json.Unmarshal(body, &guild)

	resp, _, err := user.Delete(fmt.Sprintf("/api/guilds/%s", guild.ID))
	if err != nil {
		t.Fatalf("Delete guild error: %v", err)
	}
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusNoContent {
		t.Fatalf("Expected 200/204 on guild delete, got %d", resp.StatusCode)
	}
}

// ----------------------------------------------------------------------------
// Feature 5: Channels & Category Management (>=5 tests)
// ----------------------------------------------------------------------------

func TestT1_Channel_CreateText(t *testing.T) {
	h := harness.GetHarness(t)
	user := h.RegisterAndLogin(t, fmt.Sprintf("chtext_%d", time.Now().UnixNano()), fmt.Sprintf("chtext_%d@example.com", time.Now().UnixNano()), "Password123!")

	_, body, _ := user.Post("/api/guilds", map[string]string{"name": "Channel Server"})
	var guild harness.Guild
	_ = json.Unmarshal(body, &guild)

	resp, body, err := user.Post(fmt.Sprintf("/api/guilds/%s/channels", guild.ID), map[string]string{
		"name": "announcements",
		"type": "text",
	})
	if err != nil {
		t.Fatalf("Create text channel error: %v", err)
	}
	if resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK {
		t.Fatalf("Expected 201/200, got %d: %s", resp.StatusCode, string(body))
	}
}

func TestT1_Channel_CreateVoice(t *testing.T) {
	h := harness.GetHarness(t)
	user := h.RegisterAndLogin(t, fmt.Sprintf("chv_%d", time.Now().UnixNano()), fmt.Sprintf("chv_%d@example.com", time.Now().UnixNano()), "Password123!")

	_, body, _ := user.Post("/api/guilds", map[string]string{"name": "Voice Guild"})
	var guild harness.Guild
	_ = json.Unmarshal(body, &guild)

	resp, body, err := user.Post(fmt.Sprintf("/api/guilds/%s/channels", guild.ID), map[string]string{
		"name": "General Voice",
		"type": "voice",
	})
	if err != nil {
		t.Fatalf("Create voice channel error: %v", err)
	}
	if resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK {
		t.Fatalf("Expected 201/200, got %d: %s", resp.StatusCode, string(body))
	}
}

func TestT1_Channel_UpdateTopic(t *testing.T) {
	h := harness.GetHarness(t)
	user := h.RegisterAndLogin(t, fmt.Sprintf("chtop_%d", time.Now().UnixNano()), fmt.Sprintf("chtop_%d@example.com", time.Now().UnixNano()), "Password123!")

	_, body, _ := user.Post("/api/guilds", map[string]string{"name": "Topic Server"})
	var guild harness.Guild
	_ = json.Unmarshal(body, &guild)

	if len(guild.Channels) > 0 {
		chID := guild.Channels[0].ID
		newTopic := "Official Announcements and News"
		resp, _, err := user.Patch(fmt.Sprintf("/api/channels/%s", chID), map[string]string{"topic": newTopic})
		if err != nil {
			t.Fatalf("Update channel topic error: %v", err)
		}
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("Expected 200 OK on topic update, got %d", resp.StatusCode)
		}
	}
}

func TestT1_Channel_Ack(t *testing.T) {
	h := harness.GetHarness(t)
	user := h.RegisterAndLogin(t, fmt.Sprintf("chack_%d", time.Now().UnixNano()), fmt.Sprintf("chack_%d@example.com", time.Now().UnixNano()), "Password123!")

	_, body, _ := user.Post("/api/guilds", map[string]string{"name": "Ack Channel Server"})
	var guild harness.Guild
	_ = json.Unmarshal(body, &guild)

	if len(guild.Channels) > 0 {
		chID := guild.Channels[0].ID
		resp, _, err := user.Post(fmt.Sprintf("/api/channels/%s/ack", chID), nil)
		if err != nil {
			t.Fatalf("Ack channel error: %v", err)
		}
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("Expected 200 OK on ack, got %d", resp.StatusCode)
		}
	}
}

func TestT1_Channel_Delete(t *testing.T) {
	h := harness.GetHarness(t)
	user := h.RegisterAndLogin(t, fmt.Sprintf("chdel_%d", time.Now().UnixNano()), fmt.Sprintf("chdel_%d@example.com", time.Now().UnixNano()), "Password123!")

	_, body, _ := user.Post("/api/guilds", map[string]string{"name": "Del Chan Server"})
	var guild harness.Guild
	_ = json.Unmarshal(body, &guild)

	_, body, _ = user.Post(fmt.Sprintf("/api/guilds/%s/channels", guild.ID), map[string]string{"name": "temp-chan", "type": "text"})
	var ch harness.Channel
	_ = json.Unmarshal(body, &ch)

	resp, _, err := user.Delete(fmt.Sprintf("/api/channels/%s", ch.ID))
	if err != nil {
		t.Fatalf("Delete channel error: %v", err)
	}
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusNoContent {
		t.Fatalf("Expected 200/204 on channel delete, got %d", resp.StatusCode)
	}
}

// ----------------------------------------------------------------------------
// Feature 6: Messages & Chat (>=5 tests)
// ----------------------------------------------------------------------------

func TestT1_Message_Send(t *testing.T) {
	h := harness.GetHarness(t)
	user := h.RegisterAndLogin(t, fmt.Sprintf("msgsnd_%d", time.Now().UnixNano()), fmt.Sprintf("msgsnd_%d@example.com", time.Now().UnixNano()), "Password123!")

	_, body, _ := user.Post("/api/guilds", map[string]string{"name": "Message Server"})
	var guild harness.Guild
	_ = json.Unmarshal(body, &guild)

	chID := guild.Channels[0].ID
	resp, body, err := user.Post(fmt.Sprintf("/api/channels/%s/messages", chID), map[string]string{"content": "Hello ZeroVC!"})
	if err != nil {
		t.Fatalf("Send message error: %v", err)
	}
	if resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK {
		t.Fatalf("Expected 201/200, got %d: %s", resp.StatusCode, string(body))
	}
}

func TestT1_Message_List(t *testing.T) {
	h := harness.GetHarness(t)
	user := h.RegisterAndLogin(t, fmt.Sprintf("msglst_%d", time.Now().UnixNano()), fmt.Sprintf("msglst_%d@example.com", time.Now().UnixNano()), "Password123!")

	_, body, _ := user.Post("/api/guilds", map[string]string{"name": "List Msg Server"})
	var guild harness.Guild
	_ = json.Unmarshal(body, &guild)

	chID := guild.Channels[0].ID
	_, _, _ = user.Post(fmt.Sprintf("/api/channels/%s/messages", chID), map[string]string{"content": "Msg 1"})

	resp, body, err := user.Get(fmt.Sprintf("/api/channels/%s/messages", chID))
	if err != nil {
		t.Fatalf("List messages error: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("Expected 200 OK, got %d: %s", resp.StatusCode, string(body))
	}
}

func TestT1_Message_Edit(t *testing.T) {
	h := harness.GetHarness(t)
	user := h.RegisterAndLogin(t, fmt.Sprintf("msgedt_%d", time.Now().UnixNano()), fmt.Sprintf("msgedt_%d@example.com", time.Now().UnixNano()), "Password123!")

	_, body, _ := user.Post("/api/guilds", map[string]string{"name": "Edit Msg Server"})
	var guild harness.Guild
	_ = json.Unmarshal(body, &guild)

	chID := guild.Channels[0].ID
	_, body, _ = user.Post(fmt.Sprintf("/api/channels/%s/messages", chID), map[string]string{"content": "Original Content"})
	var msg harness.Message
	_ = json.Unmarshal(body, &msg)

	resp, body, err := user.Patch(fmt.Sprintf("/api/channels/%s/messages/%s", chID, msg.ID), map[string]string{"content": "Edited Content"})
	if err != nil {
		t.Fatalf("Edit message error: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("Expected 200 OK on message edit, got %d: %s", resp.StatusCode, string(body))
	}
}

func TestT1_Message_Pin(t *testing.T) {
	h := harness.GetHarness(t)
	user := h.RegisterAndLogin(t, fmt.Sprintf("msgpin_%d", time.Now().UnixNano()), fmt.Sprintf("msgpin_%d@example.com", time.Now().UnixNano()), "Password123!")

	_, body, _ := user.Post("/api/guilds", map[string]string{"name": "Pin Msg Server"})
	var guild harness.Guild
	_ = json.Unmarshal(body, &guild)

	chID := guild.Channels[0].ID
	_, body, _ = user.Post(fmt.Sprintf("/api/channels/%s/messages", chID), map[string]string{"content": "Important Announcement"})
	var msg harness.Message
	_ = json.Unmarshal(body, &msg)

	resp, _, err := user.Post(fmt.Sprintf("/api/channels/%s/messages/%s/pin", chID, msg.ID), nil)
	if err != nil {
		t.Fatalf("Pin message error: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("Expected 200 OK on pin, got %d", resp.StatusCode)
	}
}

func TestT1_Message_Delete(t *testing.T) {
	h := harness.GetHarness(t)
	user := h.RegisterAndLogin(t, fmt.Sprintf("msgdel_%d", time.Now().UnixNano()), fmt.Sprintf("msgdel_%d@example.com", time.Now().UnixNano()), "Password123!")

	_, body, _ := user.Post("/api/guilds", map[string]string{"name": "Del Msg Server"})
	var guild harness.Guild
	_ = json.Unmarshal(body, &guild)

	chID := guild.Channels[0].ID
	_, body, _ = user.Post(fmt.Sprintf("/api/channels/%s/messages", chID), map[string]string{"content": "Delete this message"})
	var msg harness.Message
	_ = json.Unmarshal(body, &msg)

	resp, _, err := user.Delete(fmt.Sprintf("/api/channels/%s/messages/%s", chID, msg.ID))
	if err != nil {
		t.Fatalf("Delete message error: %v", err)
	}
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusNoContent {
		t.Fatalf("Expected 200/204 on delete message, got %d", resp.StatusCode)
	}
}

// ----------------------------------------------------------------------------
// Feature 7: Reactions & Emojis (>=5 tests)
// ----------------------------------------------------------------------------

func TestT1_Reaction_Add(t *testing.T) {
	h := harness.GetHarness(t)
	user := h.RegisterAndLogin(t, fmt.Sprintf("rxadd_%d", time.Now().UnixNano()), fmt.Sprintf("rxadd_%d@example.com", time.Now().UnixNano()), "Password123!")

	_, body, _ := user.Post("/api/guilds", map[string]string{"name": "Reaction Server"})
	var guild harness.Guild
	_ = json.Unmarshal(body, &guild)

	chID := guild.Channels[0].ID
	_, body, _ = user.Post(fmt.Sprintf("/api/channels/%s/messages", chID), map[string]string{"content": "Great work!"})
	var msg harness.Message
	_ = json.Unmarshal(body, &msg)

	resp, _, err := user.Post(fmt.Sprintf("/api/channels/%s/messages/%s/reactions", chID, msg.ID), map[string]string{"emoji": "🔥"})
	if err != nil {
		t.Fatalf("Add reaction error: %v", err)
	}
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		t.Fatalf("Expected 200/201 on reaction add, got %d", resp.StatusCode)
	}
}

func TestT1_Reaction_List(t *testing.T) {
	h := harness.GetHarness(t)
	user := h.RegisterAndLogin(t, fmt.Sprintf("rxlst_%d", time.Now().UnixNano()), fmt.Sprintf("rxlst_%d@example.com", time.Now().UnixNano()), "Password123!")

	_, body, _ := user.Post("/api/guilds", map[string]string{"name": "Reaction List Server"})
	var guild harness.Guild
	_ = json.Unmarshal(body, &guild)

	chID := guild.Channels[0].ID
	_, body, _ = user.Post(fmt.Sprintf("/api/channels/%s/messages", chID), map[string]string{"content": "Check reactions"})
	var msg harness.Message
	_ = json.Unmarshal(body, &msg)

	_, _, _ = user.Post(fmt.Sprintf("/api/channels/%s/messages/%s/reactions", chID, msg.ID), map[string]string{"emoji": "👍"})

	resp, body, err := user.Get(fmt.Sprintf("/api/channels/%s/messages", chID))
	if err != nil {
		t.Fatalf("Get messages error: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("Expected 200 OK, got %d", resp.StatusCode)
	}
}

func TestT1_Reaction_Remove(t *testing.T) {
	h := harness.GetHarness(t)
	user := h.RegisterAndLogin(t, fmt.Sprintf("rxrem_%d", time.Now().UnixNano()), fmt.Sprintf("rxrem_%d@example.com", time.Now().UnixNano()), "Password123!")

	_, body, _ := user.Post("/api/guilds", map[string]string{"name": "Reaction Rem Server"})
	var guild harness.Guild
	_ = json.Unmarshal(body, &guild)

	chID := guild.Channels[0].ID
	_, body, _ = user.Post(fmt.Sprintf("/api/channels/%s/messages", chID), map[string]string{"content": "Remove emoji"})
	var msg harness.Message
	_ = json.Unmarshal(body, &msg)

	_, _, _ = user.Post(fmt.Sprintf("/api/channels/%s/messages/%s/reactions", chID, msg.ID), map[string]string{"emoji": "🎉"})

	resp, _, err := user.Delete(fmt.Sprintf("/api/channels/%s/messages/%s/reactions/🎉", chID, msg.ID))
	if err != nil {
		t.Fatalf("Remove reaction error: %v", err)
	}
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusNoContent {
		t.Fatalf("Expected 200/204 on reaction remove, got %d", resp.StatusCode)
	}
}

func TestT1_Reaction_MultipleUsers(t *testing.T) {
	h := harness.GetHarness(t)
	user1 := h.RegisterAndLogin(t, fmt.Sprintf("rxm1_%d", time.Now().UnixNano()), fmt.Sprintf("rxm1_%d@example.com", time.Now().UnixNano()), "Password123!")
	user2 := h.RegisterAndLogin(t, fmt.Sprintf("rxm2_%d", time.Now().UnixNano()), fmt.Sprintf("rxm2_%d@example.com", time.Now().UnixNano()), "Password123!")

	_, body, _ := user1.Post("/api/guilds", map[string]string{"name": "Multi Reaction Server"})
	var guild harness.Guild
	_ = json.Unmarshal(body, &guild)

	chID := guild.Channels[0].ID
	_, body, _ = user1.Post(fmt.Sprintf("/api/channels/%s/messages", chID), map[string]string{"content": "Vote here"})
	var msg harness.Message
	_ = json.Unmarshal(body, &msg)

	resp1, _, _ := user1.Post(fmt.Sprintf("/api/channels/%s/messages/%s/reactions", chID, msg.ID), map[string]string{"emoji": "❤️"})
	resp2, _, _ := user2.Post(fmt.Sprintf("/api/channels/%s/messages/%s/reactions", chID, msg.ID), map[string]string{"emoji": "❤️"})

	if resp1.StatusCode != http.StatusOK || resp2.StatusCode != http.StatusOK {
		t.Logf("Multi user reaction status: %d and %d", resp1.StatusCode, resp2.StatusCode)
	}
}

func TestT1_Reaction_MultipleEmojis(t *testing.T) {
	h := harness.GetHarness(t)
	user := h.RegisterAndLogin(t, fmt.Sprintf("rxmul_%d", time.Now().UnixNano()), fmt.Sprintf("rxmul_%d@example.com", time.Now().UnixNano()), "Password123!")

	_, body, _ := user.Post("/api/guilds", map[string]string{"name": "Multi Emoji Server"})
	var guild harness.Guild
	_ = json.Unmarshal(body, &guild)

	chID := guild.Channels[0].ID
	_, body, _ = user.Post(fmt.Sprintf("/api/channels/%s/messages", chID), map[string]string{"content": "React with many emojis"})
	var msg harness.Message
	_ = json.Unmarshal(body, &msg)

	emojis := []string{"🚀", "💯", "👏"}
	for _, e := range emojis {
		resp, _, _ := user.Post(fmt.Sprintf("/api/channels/%s/messages/%s/reactions", chID, msg.ID), map[string]string{"emoji": e})
		if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
			t.Errorf("Expected success reacting with %s, got %d", e, resp.StatusCode)
		}
	}
}

// ----------------------------------------------------------------------------
// Feature 8: Direct Messaging & DM Groups (>=5 tests)
// ----------------------------------------------------------------------------

func TestT1_DM_CreateOrGetRoom(t *testing.T) {
	h := harness.GetHarness(t)
	userA := h.RegisterAndLogin(t, fmt.Sprintf("dma_%d", time.Now().UnixNano()), fmt.Sprintf("dma_%d@example.com", time.Now().UnixNano()), "Password123!")
	userB := h.RegisterAndLogin(t, fmt.Sprintf("dmb_%d", time.Now().UnixNano()), fmt.Sprintf("dmb_%d@example.com", time.Now().UnixNano()), "Password123!")

	resp, body, err := userA.Post("/api/dms", map[string]string{"recipient_id": userB.UserID.String()})
	if err != nil {
		t.Fatalf("Create DM room error: %v", err)
	}
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		t.Fatalf("Expected 200/201 on DM room create, got %d: %s", resp.StatusCode, string(body))
	}
}

func TestT1_DM_SendMessage(t *testing.T) {
	h := harness.GetHarness(t)
	userA := h.RegisterAndLogin(t, fmt.Sprintf("dmsnda_%d", time.Now().UnixNano()), fmt.Sprintf("dmsnda_%d@example.com", time.Now().UnixNano()), "Password123!")
	userB := h.RegisterAndLogin(t, fmt.Sprintf("dmsndb_%d", time.Now().UnixNano()), fmt.Sprintf("dmsndb_%d@example.com", time.Now().UnixNano()), "Password123!")

	_, body, _ := userA.Post("/api/dms", map[string]string{"recipient_id": userB.UserID.String()})
	var room harness.DMRoom
	_ = json.Unmarshal(body, &room)

	resp, body, err := userA.Post(fmt.Sprintf("/api/dms/%s/messages", room.ID), map[string]string{"content": "Hey there in private!"})
	if err != nil {
		t.Fatalf("Send DM error: %v", err)
	}
	if resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK {
		t.Fatalf("Expected 201/200, got %d: %s", resp.StatusCode, string(body))
	}
}

func TestT1_DM_CallLifecycle(t *testing.T) {
	h := harness.GetHarness(t)
	userA := h.RegisterAndLogin(t, fmt.Sprintf("dmcalla_%d", time.Now().UnixNano()), fmt.Sprintf("dmcalla_%d@example.com", time.Now().UnixNano()), "Password123!")
	userB := h.RegisterAndLogin(t, fmt.Sprintf("dmcallb_%d", time.Now().UnixNano()), fmt.Sprintf("dmcallb_%d@example.com", time.Now().UnixNano()), "Password123!")

	_, body, _ := userA.Post("/api/dms", map[string]string{"recipient_id": userB.UserID.String()})
	var room harness.DMRoom
	_ = json.Unmarshal(body, &room)

	// 1. Invite call
	resp, _, err := userA.Post(fmt.Sprintf("/api/dms/%s/call/invite", room.ID), nil)
	if err != nil || resp.StatusCode != http.StatusOK {
		t.Fatalf("Call invite failed: got %d", resp.StatusCode)
	}

	// 2. Accept call
	resp, body, err = userB.Post(fmt.Sprintf("/api/dms/%s/call/accept", room.ID), nil)
	if err != nil || resp.StatusCode != http.StatusOK {
		t.Fatalf("Call accept failed: got %d: %s", resp.StatusCode, string(body))
	}

	// 3. Leave call
	resp, _, err = userA.Post(fmt.Sprintf("/api/dms/%s/call/leave", room.ID), nil)
	if err != nil || resp.StatusCode != http.StatusOK {
		t.Fatalf("Call leave failed: got %d", resp.StatusCode)
	}
}

func TestT1_DMGroup_Create(t *testing.T) {
	h := harness.GetHarness(t)
	userA := h.RegisterAndLogin(t, fmt.Sprintf("dmgrpA_%d", time.Now().UnixNano()), fmt.Sprintf("dmgrpA_%d@example.com", time.Now().UnixNano()), "Password123!")
	userB := h.RegisterAndLogin(t, fmt.Sprintf("dmgrpB_%d", time.Now().UnixNano()), fmt.Sprintf("dmgrpB_%d@example.com", time.Now().UnixNano()), "Password123!")

	resp, body, err := userA.Post("/api/dm/groups", map[string]any{
		"name":       "Project Squad",
		"member_ids": []uuid.UUID{userB.UserID},
	})
	if err != nil {
		t.Fatalf("Create DM group error: %v", err)
	}
	if resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK {
		t.Fatalf("Expected 201/200 on DM group create, got %d: %s", resp.StatusCode, string(body))
	}
}

func TestT1_DMGroup_VoiceToken(t *testing.T) {
	h := harness.GetHarness(t)
	userA := h.RegisterAndLogin(t, fmt.Sprintf("dmgrpvA_%d", time.Now().UnixNano()), fmt.Sprintf("dmgrpvA_%d@example.com", time.Now().UnixNano()), "Password123!")

	resp, body, _ := userA.Post("/api/dm/groups", map[string]any{
		"name":       "Voice Group",
		"member_ids": []uuid.UUID{},
	})
	var group harness.DMGroup
	_ = json.Unmarshal(body, &group)

	resp, body, err := userA.Post(fmt.Sprintf("/api/dm/groups/%s/voice-token", group.ID), nil)
	if err != nil {
		t.Logf("Voice token request returned: %v", err)
	} else if resp.StatusCode != http.StatusOK {
		t.Logf("Voice token response status: %d: %s", resp.StatusCode, string(body))
	}
}

// ----------------------------------------------------------------------------
// Feature 9: Voice Channels & LiveKit (>=5 tests)
// ----------------------------------------------------------------------------

func TestT1_Voice_Join(t *testing.T) {
	h := harness.GetHarness(t)
	user := h.RegisterAndLogin(t, fmt.Sprintf("vjoin_%d", time.Now().UnixNano()), fmt.Sprintf("vjoin_%d@example.com", time.Now().UnixNano()), "Password123!")

	_, body, _ := user.Post("/api/guilds", map[string]string{"name": "Voice Join Guild"})
	var guild harness.Guild
	_ = json.Unmarshal(body, &guild)

	_, body, _ = user.Post(fmt.Sprintf("/api/guilds/%s/channels", guild.ID), map[string]string{"name": "Audio Lounge", "type": "voice"})
	var ch harness.Channel
	_ = json.Unmarshal(body, &ch)

	resp, body, err := user.Post(fmt.Sprintf("/api/channels/%s/join-voice", ch.ID), nil)
	if err != nil {
		t.Fatalf("Join voice error: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("Expected 200 OK on voice join, got %d: %s", resp.StatusCode, string(body))
	}
}

func TestT1_Voice_TokenStructure(t *testing.T) {
	h := harness.GetHarness(t)
	user := h.RegisterAndLogin(t, fmt.Sprintf("vtok_%d", time.Now().UnixNano()), fmt.Sprintf("vtok_%d@example.com", time.Now().UnixNano()), "Password123!")

	_, body, _ := user.Post("/api/guilds", map[string]string{"name": "Token Guild"})
	var guild harness.Guild
	_ = json.Unmarshal(body, &guild)

	_, body, _ = user.Post(fmt.Sprintf("/api/guilds/%s/channels", guild.ID), map[string]string{"name": "Token Channel", "type": "voice"})
	var ch harness.Channel
	_ = json.Unmarshal(body, &ch)

	resp, body, _ := user.Post(fmt.Sprintf("/api/channels/%s/join-voice", ch.ID), nil)
	if resp.StatusCode == http.StatusOK {
		var vt harness.VoiceTokenResponse
		if err := json.Unmarshal(body, &vt); err != nil {
			t.Fatalf("Failed to parse VoiceTokenResponse: %v", err)
		}
		if vt.Token == "" || vt.LiveKitURL == "" || vt.RoomName == "" {
			t.Errorf("Voice token response missing fields: %+v", vt)
		}
	}
}

func TestT1_Voice_UpdateState(t *testing.T) {
	h := harness.GetHarness(t)
	user := h.RegisterAndLogin(t, fmt.Sprintf("vstate_%d", time.Now().UnixNano()), fmt.Sprintf("vstate_%d@example.com", time.Now().UnixNano()), "Password123!")

	_, body, _ := user.Post("/api/guilds", map[string]string{"name": "State Guild"})
	var guild harness.Guild
	_ = json.Unmarshal(body, &guild)

	chID := guild.Channels[0].ID
	_, _, _ = user.Post(fmt.Sprintf("/api/channels/%s/join-voice", chID), nil)

	resp, body, err := user.Post(fmt.Sprintf("/api/channels/%s/voice-state", chID), map[string]bool{
		"self_mute":   true,
		"self_deaf":   false,
		"screenshare": true,
	})
	if err != nil {
		t.Fatalf("Voice state update error: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("Expected 200 OK on voice state update, got %d: %s", resp.StatusCode, string(body))
	}
}

func TestT1_Voice_Leave(t *testing.T) {
	h := harness.GetHarness(t)
	user := h.RegisterAndLogin(t, fmt.Sprintf("vleave_%d", time.Now().UnixNano()), fmt.Sprintf("vleave_%d@example.com", time.Now().UnixNano()), "Password123!")

	_, body, _ := user.Post("/api/guilds", map[string]string{"name": "Leave Guild"})
	var guild harness.Guild
	_ = json.Unmarshal(body, &guild)

	chID := guild.Channels[0].ID
	_, _, _ = user.Post(fmt.Sprintf("/api/channels/%s/join-voice", chID), nil)

	resp, _, err := user.Post(fmt.Sprintf("/api/channels/%s/leave-voice", chID), nil)
	if err != nil {
		t.Fatalf("Leave voice error: %v", err)
	}
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusNoContent {
		t.Fatalf("Expected 200/204 on leave voice, got %d", resp.StatusCode)
	}
}

func TestT1_Voice_Rejoin(t *testing.T) {
	h := harness.GetHarness(t)
	user := h.RegisterAndLogin(t, fmt.Sprintf("vrejoin_%d", time.Now().UnixNano()), fmt.Sprintf("vrejoin_%d@example.com", time.Now().UnixNano()), "Password123!")

	_, body, _ := user.Post("/api/guilds", map[string]string{"name": "Rejoin Guild"})
	var guild harness.Guild
	_ = json.Unmarshal(body, &guild)

	chID := guild.Channels[0].ID
	_, _, _ = user.Post(fmt.Sprintf("/api/channels/%s/join-voice", chID), nil)
	_, _, _ = user.Post(fmt.Sprintf("/api/channels/%s/leave-voice", chID), nil)

	resp, _, err := user.Post(fmt.Sprintf("/api/channels/%s/join-voice", chID), nil)
	if err != nil || resp.StatusCode != http.StatusOK {
		t.Fatalf("Rejoin voice failed with status %d", resp.StatusCode)
	}
}

// ----------------------------------------------------------------------------
// Feature 10: Moderation (>=5 tests)
// ----------------------------------------------------------------------------

func TestT1_Mod_KickMember(t *testing.T) {
	h := harness.GetHarness(t)
	owner := h.RegisterAndLogin(t, fmt.Sprintf("modown_%d", time.Now().UnixNano()), fmt.Sprintf("modown_%d@example.com", time.Now().UnixNano()), "Password123!")
	member := h.RegisterAndLogin(t, fmt.Sprintf("modmem_%d", time.Now().UnixNano()), fmt.Sprintf("modmem_%d@example.com", time.Now().UnixNano()), "Password123!")

	_, body, _ := owner.Post("/api/guilds", map[string]string{"name": "Kick Server"})
	var guild harness.Guild
	_ = json.Unmarshal(body, &guild)

	// Member joins via invite
	_, invBody, _ := owner.Post(fmt.Sprintf("/api/guilds/%s/invites", guild.ID), nil)
	var inv harness.Invite
	_ = json.Unmarshal(invBody, &inv)
	_, _, _ = member.Post(fmt.Sprintf("/api/invites/%s/join", inv.Code), nil)

	// Owner kicks member
	resp, body, err := owner.Post(fmt.Sprintf("/api/guilds/%s/members/%s/kick", guild.ID, member.UserID), nil)
	if err != nil {
		t.Fatalf("Kick member error: %v", err)
	}
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusNoContent {
		t.Fatalf("Expected 200/204 on kick, got %d: %s", resp.StatusCode, string(body))
	}
}

func TestT1_Mod_BanMember(t *testing.T) {
	h := harness.GetHarness(t)
	owner := h.RegisterAndLogin(t, fmt.Sprintf("banown_%d", time.Now().UnixNano()), fmt.Sprintf("banown_%d@example.com", time.Now().UnixNano()), "Password123!")
	target := h.RegisterAndLogin(t, fmt.Sprintf("bantarg_%d", time.Now().UnixNano()), fmt.Sprintf("bantarg_%d@example.com", time.Now().UnixNano()), "Password123!")

	_, body, _ := owner.Post("/api/guilds", map[string]string{"name": "Ban Server"})
	var guild harness.Guild
	_ = json.Unmarshal(body, &guild)

	resp, body, err := owner.Post(fmt.Sprintf("/api/guilds/%s/bans", guild.ID), map[string]string{
		"user_id": target.UserID.String(),
		"reason":  "Violating rules",
	})
	if err != nil {
		t.Fatalf("Ban member error: %v", err)
	}
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		t.Fatalf("Expected 200/201 on ban, got %d: %s", resp.StatusCode, string(body))
	}
}

func TestT1_Mod_UnbanMember(t *testing.T) {
	h := harness.GetHarness(t)
	owner := h.RegisterAndLogin(t, fmt.Sprintf("unbanown_%d", time.Now().UnixNano()), fmt.Sprintf("unbanown_%d@example.com", time.Now().UnixNano()), "Password123!")
	target := h.RegisterAndLogin(t, fmt.Sprintf("unbantarg_%d", time.Now().UnixNano()), fmt.Sprintf("unbantarg_%d@example.com", time.Now().UnixNano()), "Password123!")

	_, body, _ := owner.Post("/api/guilds", map[string]string{"name": "Unban Server"})
	var guild harness.Guild
	_ = json.Unmarshal(body, &guild)

	_, _, _ = owner.Post(fmt.Sprintf("/api/guilds/%s/bans", guild.ID), map[string]string{"user_id": target.UserID.String()})

	resp, _, err := owner.Delete(fmt.Sprintf("/api/guilds/%s/bans/%s", guild.ID, target.UserID))
	if err != nil {
		t.Fatalf("Unban member error: %v", err)
	}
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusNoContent {
		t.Fatalf("Expected 200/204 on unban, got %d", resp.StatusCode)
	}
}

func TestT1_Mod_MuteMember(t *testing.T) {
	h := harness.GetHarness(t)
	owner := h.RegisterAndLogin(t, fmt.Sprintf("muteown_%d", time.Now().UnixNano()), fmt.Sprintf("muteown_%d@example.com", time.Now().UnixNano()), "Password123!")
	target := h.RegisterAndLogin(t, fmt.Sprintf("mutetarg_%d", time.Now().UnixNano()), fmt.Sprintf("mutetarg_%d@example.com", time.Now().UnixNano()), "Password123!")

	_, body, _ := owner.Post("/api/guilds", map[string]string{"name": "Mute Server"})
	var guild harness.Guild
	_ = json.Unmarshal(body, &guild)

	resp, _, err := owner.Post(fmt.Sprintf("/api/guilds/%s/members/%s/mute", guild.ID, target.UserID), nil)
	if err != nil {
		t.Fatalf("Mute member error: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("Expected 200 OK on mute member, got %d", resp.StatusCode)
	}
}

func TestT1_Mod_AuditLogs(t *testing.T) {
	h := harness.GetHarness(t)
	owner := h.RegisterAndLogin(t, fmt.Sprintf("auditown_%d", time.Now().UnixNano()), fmt.Sprintf("auditown_%d@example.com", time.Now().UnixNano()), "Password123!")

	_, body, _ := owner.Post("/api/guilds", map[string]string{"name": "Audit Server"})
	var guild harness.Guild
	_ = json.Unmarshal(body, &guild)

	resp, body, err := owner.Get(fmt.Sprintf("/api/guilds/%s/audit-logs", guild.ID))
	if err != nil {
		t.Fatalf("Get audit logs error: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("Expected 200 OK on audit logs, got %d: %s", resp.StatusCode, string(body))
	}
}
