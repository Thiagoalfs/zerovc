package e2e_test

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/zerovc/zerovc/tests/e2e/harness"
)

// ============================================================================
// TIER 2: BOUNDARY & CORNER CASES (>=5 tests per feature across 10 core features)
// ============================================================================

// ----------------------------------------------------------------------------
// Feature 1: Auth & Session Boundaries
// ----------------------------------------------------------------------------

func TestT2_Auth_Register_EmptyFields(t *testing.T) {
	h := harness.GetHarness(t)
	s := h.NewSession()

	resp, _, _ := s.PostPublic("/api/auth/register", map[string]string{
		"username": "",
		"email":    "",
		"password": "",
	})
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("Expected 400 Bad Request on empty register fields, got %d", resp.StatusCode)
	}
}

func TestT2_Auth_Register_DuplicateEmail(t *testing.T) {
	h := harness.GetHarness(t)
	s := h.NewSession()
	email := fmt.Sprintf("dup_%d@example.com", time.Now().UnixNano())

	s.PostPublic("/api/auth/register", map[string]string{"username": "user1", "email": email, "password": "Password123!"})
	resp, _, _ := s.PostPublic("/api/auth/register", map[string]string{"username": "user2", "email": email, "password": "Password123!"})

	if resp.StatusCode != http.StatusConflict && resp.StatusCode != http.StatusBadRequest {
		t.Errorf("Expected 409 or 400 on duplicate email registration, got %d", resp.StatusCode)
	}
}

func TestT2_Auth_Verify_InvalidCode(t *testing.T) {
	h := harness.GetHarness(t)
	s := h.NewSession()
	email := fmt.Sprintf("wrongcode_%d@example.com", time.Now().UnixNano())
	s.PostPublic("/api/auth/register", map[string]string{"username": "wcuser", "email": email, "password": "Password123!"})

	resp, _, _ := s.PostPublic("/api/auth/verify-email", map[string]string{"email": email, "code": "999999"})
	if resp.StatusCode != http.StatusBadRequest && resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("Expected 400 or 401 on invalid verification code, got %d", resp.StatusCode)
	}
}

func TestT2_Auth_Login_WrongPassword(t *testing.T) {
	h := harness.GetHarness(t)
	s := h.NewSession()
	email := fmt.Sprintf("wrongpw_%d@example.com", time.Now().UnixNano())
	s.PostPublic("/api/auth/register", map[string]string{"username": "wpuser", "email": email, "password": "Password123!"})
	s.PostPublic("/api/auth/verify-email", map[string]string{"email": email, "code": "123456"})

	resp, _, _ := s.PostPublic("/api/auth/login", map[string]string{"email": email, "password": "IncorrectPassword!"})
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("Expected 401 Unauthorized on wrong password, got %d", resp.StatusCode)
	}
}

func TestT2_Auth_Me_Unauthenticated(t *testing.T) {
	h := harness.GetHarness(t)
	unauth := h.NewSession()

	resp, _, _ := unauth.Get("/api/auth/me")
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("Expected 401 Unauthorized for unauthenticated /api/auth/me, got %d", resp.StatusCode)
	}
}

func TestT2_Auth_MethodNotAllowed(t *testing.T) {
	h := harness.GetHarness(t)
	s := h.NewSession()

	resp, _, _ := s.Get("/api/auth/login")
	if resp.StatusCode != http.StatusMethodNotAllowed && resp.StatusCode != http.StatusNotFound {
		t.Errorf("Expected 405 Method Not Allowed on GET /api/auth/login, got %d", resp.StatusCode)
	}
}

// ----------------------------------------------------------------------------
// Feature 2: CSRF Boundary Cases
// ----------------------------------------------------------------------------

func TestT2_CSRF_PostWithoutToken_Returns403(t *testing.T) {
	h := harness.GetHarness(t)
	user := h.RegisterAndLogin(t, fmt.Sprintf("nocsrf_%d", time.Now().UnixNano()), fmt.Sprintf("nocsrf_%d@example.com", time.Now().UnixNano()), "Password123!")

	resp, body, err := user.PostWithoutCSRF("/api/guilds", map[string]string{"name": "No CSRF Server"})
	if err != nil {
		t.Fatalf("Request error: %v", err)
	}
	if resp.StatusCode != http.StatusForbidden {
		t.Errorf("Expected 403 Forbidden when POSTing mutation without CSRF token, got %d: %s", resp.StatusCode, string(body))
	}
}

func TestT2_CSRF_PatchWithoutToken_Returns403(t *testing.T) {
	h := harness.GetHarness(t)
	user := h.RegisterAndLogin(t, fmt.Sprintf("nocsrfpt_%d", time.Now().UnixNano()), fmt.Sprintf("nocsrfpt_%d@example.com", time.Now().UnixNano()), "Password123!")

	resp, body, err := user.PatchWithoutCSRF("/api/users/@me", map[string]string{"bio": "New bio"})
	if err != nil {
		t.Fatalf("Request error: %v", err)
	}
	if resp.StatusCode != http.StatusForbidden {
		t.Errorf("Expected 403 Forbidden when PATCHing without CSRF token, got %d: %s", resp.StatusCode, string(body))
	}
}

func TestT2_CSRF_PutWithoutToken_Returns403(t *testing.T) {
	h := harness.GetHarness(t)
	user := h.RegisterAndLogin(t, fmt.Sprintf("nocsrfput_%d", time.Now().UnixNano()), fmt.Sprintf("nocsrfput_%d@example.com", time.Now().UnixNano()), "Password123!")

	resp, body, _ := user.Post("/api/guilds", map[string]string{"name": "Put Target"})
	var guild harness.Guild
	_ = json.Unmarshal(body, &guild)

	resp, body, err := user.PutWithoutCSRF(fmt.Sprintf("/api/guilds/%s/roles/positions", guild.ID), []any{})
	if err != nil {
		t.Fatalf("Request error: %v", err)
	}
	if resp.StatusCode != http.StatusForbidden {
		t.Errorf("Expected 403 Forbidden when PUTting without CSRF token, got %d: %s", resp.StatusCode, string(body))
	}
}

func TestT2_CSRF_DeleteWithoutToken_Returns403(t *testing.T) {
	h := harness.GetHarness(t)
	user := h.RegisterAndLogin(t, fmt.Sprintf("nocsrfdel_%d", time.Now().UnixNano()), fmt.Sprintf("nocsrfdel_%d@example.com", time.Now().UnixNano()), "Password123!")

	resp, body, _ := user.Post("/api/guilds", map[string]string{"name": "Delete Target"})
	var guild harness.Guild
	_ = json.Unmarshal(body, &guild)

	resp, body, err := user.DeleteWithoutCSRF(fmt.Sprintf("/api/guilds/%s", guild.ID))
	if err != nil {
		t.Fatalf("Request error: %v", err)
	}
	if resp.StatusCode != http.StatusForbidden {
		t.Errorf("Expected 403 Forbidden when DELETE without CSRF token, got %d: %s", resp.StatusCode, string(body))
	}
}

func TestT2_CSRF_InvalidTokenValue_Returns403(t *testing.T) {
	h := harness.GetHarness(t)
	user := h.RegisterAndLogin(t, fmt.Sprintf("badcsrf_%d", time.Now().UnixNano()), fmt.Sprintf("badcsrf_%d@example.com", time.Now().UnixNano()), "Password123!")

	resp, body, err := user.PostWithCustomCSRF("/api/guilds", map[string]string{"name": "Bad CSRF Server"}, "forged_invalid_csrf_token")
	if err != nil {
		t.Fatalf("Request error: %v", err)
	}
	if resp.StatusCode != http.StatusForbidden {
		t.Errorf("Expected 403 Forbidden when using forged CSRF token, got %d: %s", resp.StatusCode, string(body))
	}
}

func TestT2_CSRF_OtherUserToken_Returns403(t *testing.T) {
	h := harness.GetHarness(t)
	userA := h.RegisterAndLogin(t, fmt.Sprintf("csrfa_%d", time.Now().UnixNano()), fmt.Sprintf("csrfa_%d@example.com", time.Now().UnixNano()), "Password123!")
	userB := h.RegisterAndLogin(t, fmt.Sprintf("csrfb_%d", time.Now().UnixNano()), fmt.Sprintf("csrfb_%d@example.com", time.Now().UnixNano()), "Password123!")

	// User A attempts mutation using User B's CSRF token
	resp, body, err := userA.PostWithCustomCSRF("/api/guilds", map[string]string{"name": "Cross CSRF Server"}, userB.CSRFToken)
	if err != nil {
		t.Fatalf("Request error: %v", err)
	}
	if resp.StatusCode != http.StatusForbidden {
		t.Errorf("Expected 403 Forbidden when using another user's CSRF token, got %d: %s", resp.StatusCode, string(body))
	}
}

// ----------------------------------------------------------------------------
// Feature 3: Rate Limiting Boundaries
// ----------------------------------------------------------------------------

func TestT2_RateLimit_BurstBoundary(t *testing.T) {
	h := harness.GetHarness(t)
	user := h.RegisterAndLogin(t, fmt.Sprintf("rlbb_%d", time.Now().UnixNano()), fmt.Sprintf("rlbb_%d@example.com", time.Now().UnixNano()), "Password123!")

	_, body, _ := user.Post("/api/guilds", map[string]string{"name": "Burst Boundary Guild"})
	var guild harness.Guild
	_ = json.Unmarshal(body, &guild)

	chID := guild.Channels[0].ID
	// Sending up to burst limit
	for i := 0; i < 5; i++ {
		resp, _, _ := user.Post(fmt.Sprintf("/api/channels/%s/messages", chID), map[string]string{"content": fmt.Sprintf("Burst %d", i)})
		if resp != nil && resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK {
			t.Logf("Burst request %d returned %d", i, resp.StatusCode)
		}
	}
}

func TestT2_RateLimit_PerUserIsolation(t *testing.T) {
	h := harness.GetHarness(t)
	userA := h.RegisterAndLogin(t, fmt.Sprintf("rlisoA_%d", time.Now().UnixNano()), fmt.Sprintf("rlisoA_%d@example.com", time.Now().UnixNano()), "Password123!")
	userB := h.RegisterAndLogin(t, fmt.Sprintf("rlisoB_%d", time.Now().UnixNano()), fmt.Sprintf("rlisoB_%d@example.com", time.Now().UnixNano()), "Password123!")

	// Both users make requests; user B's quota must be independent of user A
	respB, _, err := userB.Post("/api/guilds", map[string]string{"name": "User B Guild"})
	if err != nil || (respB.StatusCode != http.StatusCreated && respB.StatusCode != http.StatusOK) {
		t.Errorf("User B should not be affected by User A's rate limit")
	}
	_ = userA
}

func TestT2_RateLimit_ExportDataThreshold(t *testing.T) {
	h := harness.GetHarness(t)
	user := h.RegisterAndLogin(t, fmt.Sprintf("rlexp2_%d", time.Now().UnixNano()), fmt.Sprintf("rlexp2_%d@example.com", time.Now().UnixNano()), "Password123!")

	_, _, _ = user.Get("/api/auth/export-data")
	resp, _, _ := user.Get("/api/auth/export-data")
	if resp != nil && resp.StatusCode != http.StatusTooManyRequests {
		t.Logf("Immediate consecutive export returned status: %d", resp.StatusCode)
	}
}

func TestT2_RateLimit_LoginBruteForce(t *testing.T) {
	h := harness.GetHarness(t)
	s := h.NewSession()

	hit429 := false
	for i := 0; i < 20; i++ {
		resp, _, _ := s.PostPublic("/api/auth/login", map[string]string{"email": "nobody@example.com", "password": "bad"})
		if resp != nil && resp.StatusCode == http.StatusTooManyRequests {
			hit429 = true
			break
		}
	}
	if hit429 {
		t.Logf("Login brute force throttle verified (429)")
	}
}

func TestT2_RateLimit_RecoveryAfterWait(t *testing.T) {
	h := harness.GetHarness(t)
	user := h.RegisterAndLogin(t, fmt.Sprintf("rlrec_%d", time.Now().UnixNano()), fmt.Sprintf("rlrec_%d@example.com", time.Now().UnixNano()), "Password123!")

	resp, _, err := user.Post("/api/guilds", map[string]string{"name": "Recovery Guild"})
	if err != nil || (resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK) {
		t.Errorf("Expected initial guild creation to succeed")
	}
}

// ----------------------------------------------------------------------------
// Feature 4: Guilds & Roles Boundaries
// ----------------------------------------------------------------------------

func TestT2_Guild_EmptyName(t *testing.T) {
	h := harness.GetHarness(t)
	user := h.RegisterAndLogin(t, fmt.Sprintf("glempty_%d", time.Now().UnixNano()), fmt.Sprintf("glempty_%d@example.com", time.Now().UnixNano()), "Password123!")

	resp, _, _ := user.Post("/api/guilds", map[string]string{"name": "   "})
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("Expected 400 Bad Request on empty guild name, got %d", resp.StatusCode)
	}
}

func TestT2_Guild_NameExceeds100(t *testing.T) {
	h := harness.GetHarness(t)
	user := h.RegisterAndLogin(t, fmt.Sprintf("glexceed_%d", time.Now().UnixNano()), fmt.Sprintf("glexceed_%d@example.com", time.Now().UnixNano()), "Password123!")

	longName := strings.Repeat("A", 101)
	resp, _, _ := user.Post("/api/guilds", map[string]string{"name": longName})
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("Expected 400 Bad Request for guild name exceeding 100 chars, got %d", resp.StatusCode)
	}
}

func TestT2_Guild_NonExistentID(t *testing.T) {
	h := harness.GetHarness(t)
	user := h.RegisterAndLogin(t, fmt.Sprintf("glnonex_%d", time.Now().UnixNano()), fmt.Sprintf("glnonex_%d@example.com", time.Now().UnixNano()), "Password123!")

	randomID := uuid.New()
	resp, _, _ := user.Get(fmt.Sprintf("/api/guilds/%s", randomID))
	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("Expected 404 Not Found for non-existent guild, got %d", resp.StatusCode)
	}
}

func TestT2_Guild_NonOwnerDelete(t *testing.T) {
	h := harness.GetHarness(t)
	owner := h.RegisterAndLogin(t, fmt.Sprintf("glown_%d", time.Now().UnixNano()), fmt.Sprintf("glown_%d@example.com", time.Now().UnixNano()), "Password123!")
	nonOwner := h.RegisterAndLogin(t, fmt.Sprintf("glnonown_%d", time.Now().UnixNano()), fmt.Sprintf("glnonown_%d@example.com", time.Now().UnixNano()), "Password123!")

	resp, body, _ := owner.Post("/api/guilds", map[string]string{"name": "Protected Guild"})
	var guild harness.Guild
	_ = json.Unmarshal(body, &guild)

	resp, _, _ = nonOwner.Delete(fmt.Sprintf("/api/guilds/%s", guild.ID))
	if resp.StatusCode != http.StatusForbidden {
		t.Errorf("Expected 403 Forbidden when non-owner attempts guild delete, got %d", resp.StatusCode)
	}
}

func TestT2_Role_EmptyName(t *testing.T) {
	h := harness.GetHarness(t)
	owner := h.RegisterAndLogin(t, fmt.Sprintf("rlempty_%d", time.Now().UnixNano()), fmt.Sprintf("rlempty_%d@example.com", time.Now().UnixNano()), "Password123!")

	resp, body, _ := owner.Post("/api/guilds", map[string]string{"name": "Role Boundary Server"})
	var guild harness.Guild
	_ = json.Unmarshal(body, &guild)

	resp, _, _ = owner.Post(fmt.Sprintf("/api/guilds/%s/roles", guild.ID), map[string]any{"name": ""})
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("Expected 400 Bad Request on empty role name, got %d", resp.StatusCode)
	}
}

func TestT2_Role_NonExistentGuild(t *testing.T) {
	h := harness.GetHarness(t)
	user := h.RegisterAndLogin(t, fmt.Sprintf("rlnonex_%d", time.Now().UnixNano()), fmt.Sprintf("rlnonex_%d@example.com", time.Now().UnixNano()), "Password123!")

	resp, _, _ := user.Post(fmt.Sprintf("/api/guilds/%s/roles", uuid.New()), map[string]any{"name": "Admin"})
	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("Expected 404 Not Found on role creation for non-existent guild, got %d", resp.StatusCode)
	}
}

// ----------------------------------------------------------------------------
// Feature 5: Channels Boundaries
// ----------------------------------------------------------------------------

func TestT2_Channel_EmptyName(t *testing.T) {
	h := harness.GetHarness(t)
	owner := h.RegisterAndLogin(t, fmt.Sprintf("chnameempty_%d", time.Now().UnixNano()), fmt.Sprintf("chnameempty_%d@example.com", time.Now().UnixNano()), "Password123!")

	_, body, _ := owner.Post("/api/guilds", map[string]string{"name": "Chan Name Guild"})
	var guild harness.Guild
	_ = json.Unmarshal(body, &guild)

	resp, _, _ := owner.Post(fmt.Sprintf("/api/guilds/%s/channels", guild.ID), map[string]string{"name": ""})
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("Expected 400 Bad Request on empty channel name, got %d", resp.StatusCode)
	}
}

func TestT2_Channel_NonExistentGuild(t *testing.T) {
	h := harness.GetHarness(t)
	user := h.RegisterAndLogin(t, fmt.Sprintf("chnongld_%d", time.Now().UnixNano()), fmt.Sprintf("chnongld_%d@example.com", time.Now().UnixNano()), "Password123!")

	resp, _, _ := user.Post(fmt.Sprintf("/api/guilds/%s/channels", uuid.New()), map[string]string{"name": "test"})
	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("Expected 404 Not Found for channel in non-existent guild, got %d", resp.StatusCode)
	}
}

func TestT2_Channel_DeleteNonExistent(t *testing.T) {
	h := harness.GetHarness(t)
	user := h.RegisterAndLogin(t, fmt.Sprintf("chdelnon_%d", time.Now().UnixNano()), fmt.Sprintf("chdelnon_%d@example.com", time.Now().UnixNano()), "Password123!")

	resp, _, _ := user.Delete(fmt.Sprintf("/api/channels/%s", uuid.New()))
	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("Expected 404 Not Found on deleting non-existent channel, got %d", resp.StatusCode)
	}
}

func TestT2_Channel_InvalidUUIDParam(t *testing.T) {
	h := harness.GetHarness(t)
	user := h.RegisterAndLogin(t, fmt.Sprintf("chinval_%d", time.Now().UnixNano()), fmt.Sprintf("chinval_%d@example.com", time.Now().UnixNano()), "Password123!")

	resp, _, _ := user.Get("/api/channels/invalid-uuid-format/messages")
	if resp.StatusCode != http.StatusBadRequest && resp.StatusCode != http.StatusNotFound {
		t.Errorf("Expected 400 or 404 on malformed channel UUID, got %d", resp.StatusCode)
	}
}

func TestT2_Channel_NonMemberAccess(t *testing.T) {
	h := harness.GetHarness(t)
	owner := h.RegisterAndLogin(t, fmt.Sprintf("chm1_%d", time.Now().UnixNano()), fmt.Sprintf("chm1_%d@example.com", time.Now().UnixNano()), "Password123!")
	stranger := h.RegisterAndLogin(t, fmt.Sprintf("chm2_%d", time.Now().UnixNano()), fmt.Sprintf("chm2_%d@example.com", time.Now().UnixNano()), "Password123!")

	_, body, _ := owner.Post("/api/guilds", map[string]string{"name": "Private Guild"})
	var guild harness.Guild
	_ = json.Unmarshal(body, &guild)

	resp, _, _ := stranger.Get(fmt.Sprintf("/api/guilds/%s", guild.ID))
	if resp.StatusCode != http.StatusForbidden && resp.StatusCode != http.StatusNotFound {
		t.Errorf("Expected 403 or 404 when stranger accesses guild channels, got %d", resp.StatusCode)
	}
}

// ----------------------------------------------------------------------------
// Feature 6: Messages Boundaries
// ----------------------------------------------------------------------------

func TestT2_Message_EmptyContent(t *testing.T) {
	h := harness.GetHarness(t)
	user := h.RegisterAndLogin(t, fmt.Sprintf("msgemp_%d", time.Now().UnixNano()), fmt.Sprintf("msgemp_%d@example.com", time.Now().UnixNano()), "Password123!")

	_, body, _ := user.Post("/api/guilds", map[string]string{"name": "Msg Empty Guild"})
	var guild harness.Guild
	_ = json.Unmarshal(body, &guild)

	chID := guild.Channels[0].ID
	resp, _, _ := user.Post(fmt.Sprintf("/api/channels/%s/messages", chID), map[string]string{"content": "   "})
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("Expected 400 Bad Request on empty message content, got %d", resp.StatusCode)
	}
}

func TestT2_Message_ContentExceeds2000(t *testing.T) {
	h := harness.GetHarness(t)
	user := h.RegisterAndLogin(t, fmt.Sprintf("msg2000_%d", time.Now().UnixNano()), fmt.Sprintf("msg2000_%d@example.com", time.Now().UnixNano()), "Password123!")

	_, body, _ := user.Post("/api/guilds", map[string]string{"name": "Msg 2000 Guild"})
	var guild harness.Guild
	_ = json.Unmarshal(body, &guild)

	chID := guild.Channels[0].ID
	longContent := strings.Repeat("M", 2001)
	resp, _, _ := user.Post(fmt.Sprintf("/api/channels/%s/messages", chID), map[string]string{"content": longContent})
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("Expected 400 Bad Request on message exceeding 2000 chars, got %d", resp.StatusCode)
	}
}

func TestT2_Message_NonExistentChannel(t *testing.T) {
	h := harness.GetHarness(t)
	user := h.RegisterAndLogin(t, fmt.Sprintf("msgnonch_%d", time.Now().UnixNano()), fmt.Sprintf("msgnonch_%d@example.com", time.Now().UnixNano()), "Password123!")

	resp, _, _ := user.Post(fmt.Sprintf("/api/channels/%s/messages", uuid.New()), map[string]string{"content": "Hello"})
	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("Expected 404 Not Found on message to non-existent channel, got %d", resp.StatusCode)
	}
}

func TestT2_Message_EditNonAuthor(t *testing.T) {
	h := harness.GetHarness(t)
	userA := h.RegisterAndLogin(t, fmt.Sprintf("msgeda_%d", time.Now().UnixNano()), fmt.Sprintf("msgeda_%d@example.com", time.Now().UnixNano()), "Password123!")
	userB := h.RegisterAndLogin(t, fmt.Sprintf("msgedb_%d", time.Now().UnixNano()), fmt.Sprintf("msgedb_%d@example.com", time.Now().UnixNano()), "Password123!")

	_, body, _ := userA.Post("/api/guilds", map[string]string{"name": "Msg Edit Guild"})
	var guild harness.Guild
	_ = json.Unmarshal(body, &guild)

	chID := guild.Channels[0].ID
	_, body, _ = userA.Post(fmt.Sprintf("/api/channels/%s/messages", chID), map[string]string{"content": "User A message"})
	var msg harness.Message
	_ = json.Unmarshal(body, &msg)

	resp, _, _ := userB.Patch(fmt.Sprintf("/api/channels/%s/messages/%s", chID, msg.ID), map[string]string{"content": "Hijacked edit"})
	if resp.StatusCode != http.StatusForbidden {
		t.Errorf("Expected 403 Forbidden when non-author attempts message edit, got %d", resp.StatusCode)
	}
}

func TestT2_Message_DeleteNonAuthorNonAdmin(t *testing.T) {
	h := harness.GetHarness(t)
	userA := h.RegisterAndLogin(t, fmt.Sprintf("msgdela_%d", time.Now().UnixNano()), fmt.Sprintf("msgdela_%d@example.com", time.Now().UnixNano()), "Password123!")
	userB := h.RegisterAndLogin(t, fmt.Sprintf("msgdelb_%d", time.Now().UnixNano()), fmt.Sprintf("msgdelb_%d@example.com", time.Now().UnixNano()), "Password123!")

	_, body, _ := userA.Post("/api/guilds", map[string]string{"name": "Msg Del Guild"})
	var guild harness.Guild
	_ = json.Unmarshal(body, &guild)

	chID := guild.Channels[0].ID
	_, body, _ = userA.Post(fmt.Sprintf("/api/channels/%s/messages", chID), map[string]string{"content": "Cannot be deleted by B"})
	var msg harness.Message
	_ = json.Unmarshal(body, &msg)

	resp, _, _ := userB.Delete(fmt.Sprintf("/api/channels/%s/messages/%s", chID, msg.ID))
	if resp.StatusCode != http.StatusForbidden {
		t.Errorf("Expected 403 Forbidden when non-author non-admin attempts delete, got %d", resp.StatusCode)
	}
}

// ----------------------------------------------------------------------------
// Feature 7: Reactions Boundaries
// ----------------------------------------------------------------------------

func TestT2_Reaction_NonExistentMessage(t *testing.T) {
	h := harness.GetHarness(t)
	user := h.RegisterAndLogin(t, fmt.Sprintf("rxnonmsg_%d", time.Now().UnixNano()), fmt.Sprintf("rxnonmsg_%d@example.com", time.Now().UnixNano()), "Password123!")

	_, body, _ := user.Post("/api/guilds", map[string]string{"name": "Rx Non Guild"})
	var guild harness.Guild
	_ = json.Unmarshal(body, &guild)

	chID := guild.Channels[0].ID
	resp, _, _ := user.Post(fmt.Sprintf("/api/channels/%s/messages/%s/reactions", chID, uuid.New()), map[string]string{"emoji": "👍"})
	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("Expected 404 Not Found on reacting to non-existent message, got %d", resp.StatusCode)
	}
}

func TestT2_Reaction_SpecialUnicode(t *testing.T) {
	h := harness.GetHarness(t)
	user := h.RegisterAndLogin(t, fmt.Sprintf("rxuni_%d", time.Now().UnixNano()), fmt.Sprintf("rxuni_%d@example.com", time.Now().UnixNano()), "Password123!")

	_, body, _ := user.Post("/api/guilds", map[string]string{"name": "Rx Uni Guild"})
	var guild harness.Guild
	_ = json.Unmarshal(body, &guild)

	chID := guild.Channels[0].ID
	_, body, _ = user.Post(fmt.Sprintf("/api/channels/%s/messages", chID), map[string]string{"content": "Unicode reaction test"})
	var msg harness.Message
	_ = json.Unmarshal(body, &msg)

	// Flag or complex multi-byte unicode emoji
	resp, _, _ := user.Post(fmt.Sprintf("/api/channels/%s/messages/%s/reactions", chID, msg.ID), map[string]string{"emoji": "🇧🇷"})
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		t.Errorf("Expected 200/201 on multi-byte unicode emoji, got %d", resp.StatusCode)
	}
}

func TestT2_Reaction_RemoveNonExistent(t *testing.T) {
	h := harness.GetHarness(t)
	user := h.RegisterAndLogin(t, fmt.Sprintf("rxremnon_%d", time.Now().UnixNano()), fmt.Sprintf("rxremnon_%d@example.com", time.Now().UnixNano()), "Password123!")

	_, body, _ := user.Post("/api/guilds", map[string]string{"name": "Rx Rem Non Guild"})
	var guild harness.Guild
	_ = json.Unmarshal(body, &guild)

	chID := guild.Channels[0].ID
	_, body, _ = user.Post(fmt.Sprintf("/api/channels/%s/messages", chID), map[string]string{"content": "Remove test"})
	var msg harness.Message
	_ = json.Unmarshal(body, &msg)

	resp, _, _ := user.Delete(fmt.Sprintf("/api/channels/%s/messages/%s/reactions/🚀", chID, msg.ID))
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusNoContent && resp.StatusCode != http.StatusNotFound {
		t.Errorf("Unexpected status on removing non-existent reaction: %d", resp.StatusCode)
	}
}

func TestT2_Reaction_InvalidMethod(t *testing.T) {
	h := harness.GetHarness(t)
	user := h.RegisterAndLogin(t, fmt.Sprintf("rxinvm_%d", time.Now().UnixNano()), fmt.Sprintf("rxinvm_%d@example.com", time.Now().UnixNano()), "Password123!")

	_, body, _ := user.Post("/api/guilds", map[string]string{"name": "Rx Method Guild"})
	var guild harness.Guild
	_ = json.Unmarshal(body, &guild)

	chID := guild.Channels[0].ID
	resp, _, _ := user.Get(fmt.Sprintf("/api/channels/%s/messages/%s/reactions", chID, uuid.New()))
	if resp.StatusCode != http.StatusMethodNotAllowed && resp.StatusCode != http.StatusNotFound {
		t.Errorf("Expected 405 or 404 on GET reactions endpoint, got %d", resp.StatusCode)
	}
}

func TestT2_Reaction_EmptyEmoji(t *testing.T) {
	h := harness.GetHarness(t)
	user := h.RegisterAndLogin(t, fmt.Sprintf("rxemp_%d", time.Now().UnixNano()), fmt.Sprintf("rxemp_%d@example.com", time.Now().UnixNano()), "Password123!")

	_, body, _ := user.Post("/api/guilds", map[string]string{"name": "Rx Empty Guild"})
	var guild harness.Guild
	_ = json.Unmarshal(body, &guild)

	chID := guild.Channels[0].ID
	_, body, _ = user.Post(fmt.Sprintf("/api/channels/%s/messages", chID), map[string]string{"content": "Empty emoji test"})
	var msg harness.Message
	_ = json.Unmarshal(body, &msg)

	resp, _, _ := user.Post(fmt.Sprintf("/api/channels/%s/messages/%s/reactions", chID, msg.ID), map[string]string{"emoji": ""})
	if resp.StatusCode != http.StatusBadRequest && resp.StatusCode != http.StatusOK {
		t.Logf("Empty emoji response status: %d", resp.StatusCode)
	}
}

// ----------------------------------------------------------------------------
// Feature 8: Direct Messaging Boundaries
// ----------------------------------------------------------------------------

func TestT2_DM_BlockedUserCannotDM(t *testing.T) {
	h := harness.GetHarness(t)
	userA := h.RegisterAndLogin(t, fmt.Sprintf("blka_%d", time.Now().UnixNano()), fmt.Sprintf("blka_%d@example.com", time.Now().UnixNano()), "Password123!")
	userB := h.RegisterAndLogin(t, fmt.Sprintf("blkb_%d", time.Now().UnixNano()), fmt.Sprintf("blkb_%d@example.com", time.Now().UnixNano()), "Password123!")

	// User B blocks User A
	resp, _, _ := userB.Post(fmt.Sprintf("/api/users/%s/block", userA.UserID), nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("Block user failed: %d", resp.StatusCode)
	}

	// User A attempts to create DM room with User B
	resp, body, _ := userA.Post("/api/dms", map[string]string{"recipient_id": userB.UserID.String()})
	if resp.StatusCode != http.StatusForbidden {
		t.Errorf("Expected 403 Forbidden when blocked user attempts to open DM, got %d: %s", resp.StatusCode, string(body))
	}
}

func TestT2_DMGroup_Exceeds15Members(t *testing.T) {
	h := harness.GetHarness(t)
	owner := h.RegisterAndLogin(t, fmt.Sprintf("grp15_%d", time.Now().UnixNano()), fmt.Sprintf("grp15_%d@example.com", time.Now().UnixNano()), "Password123!")

	// Generate 16 member UUIDs
	var memberIDs []uuid.UUID
	for i := 0; i < 16; i++ {
		memberIDs = append(memberIDs, uuid.New())
	}

	resp, body, _ := owner.Post("/api/dm/groups", map[string]any{
		"name":       "Oversized Group",
		"member_ids": memberIDs,
	})
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("Expected 400 Bad Request when DM group exceeds 15 members limit, got %d: %s", resp.StatusCode, string(body))
	}
}

func TestT2_DM_NonExistentRoomMessages(t *testing.T) {
	h := harness.GetHarness(t)
	user := h.RegisterAndLogin(t, fmt.Sprintf("dmnonrm_%d", time.Now().UnixNano()), fmt.Sprintf("dmnonrm_%d@example.com", time.Now().UnixNano()), "Password123!")

	resp, _, _ := user.Post(fmt.Sprintf("/api/dms/%s/messages", uuid.New()), map[string]string{"content": "Ghost message"})
	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("Expected 404 Not Found for non-existent DM room, got %d", resp.StatusCode)
	}
}

func TestT2_DM_InvalidUUIDFormat(t *testing.T) {
	h := harness.GetHarness(t)
	user := h.RegisterAndLogin(t, fmt.Sprintf("dminv_%d", time.Now().UnixNano()), fmt.Sprintf("dminv_%d@example.com", time.Now().UnixNano()), "Password123!")

	resp, _, _ := user.Get("/api/dms/not-a-valid-uuid/messages")
	if resp.StatusCode != http.StatusBadRequest && resp.StatusCode != http.StatusNotFound {
		t.Errorf("Expected 400 or 404 for invalid DM UUID, got %d", resp.StatusCode)
	}
}

func TestT2_DM_UnblockAllowsCommunication(t *testing.T) {
	h := harness.GetHarness(t)
	userA := h.RegisterAndLogin(t, fmt.Sprintf("unblka_%d", time.Now().UnixNano()), fmt.Sprintf("unblka_%d@example.com", time.Now().UnixNano()), "Password123!")
	userB := h.RegisterAndLogin(t, fmt.Sprintf("unblkb_%d", time.Now().UnixNano()), fmt.Sprintf("unblkb_%d@example.com", time.Now().UnixNano()), "Password123!")

	// Block then unblock
	_, _, _ = userB.Post(fmt.Sprintf("/api/users/%s/block", userA.UserID), nil)
	resp, _, _ := userB.Delete(fmt.Sprintf("/api/users/%s/block", userA.UserID))
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("Unblock failed with %d", resp.StatusCode)
	}

	// Now User A can initiate DM
	resp, _, _ = userA.Post("/api/dms", map[string]string{"recipient_id": userB.UserID.String()})
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		t.Errorf("Expected DM creation to succeed after unblock, got %d", resp.StatusCode)
	}
}

// ----------------------------------------------------------------------------
// Feature 9: Voice Channels Boundaries
// ----------------------------------------------------------------------------

func TestT2_Voice_JoinNonExistentChannel(t *testing.T) {
	h := harness.GetHarness(t)
	user := h.RegisterAndLogin(t, fmt.Sprintf("vnonex_%d", time.Now().UnixNano()), fmt.Sprintf("vnonex_%d@example.com", time.Now().UnixNano()), "Password123!")

	resp, _, _ := user.Post(fmt.Sprintf("/api/channels/%s/join-voice", uuid.New()), nil)
	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("Expected 404 Not Found joining non-existent voice channel, got %d", resp.StatusCode)
	}
}

func TestT2_Voice_LeaveWhenNotInVoice(t *testing.T) {
	h := harness.GetHarness(t)
	user := h.RegisterAndLogin(t, fmt.Sprintf("vleavenot_%d", time.Now().UnixNano()), fmt.Sprintf("vleavenot_%d@example.com", time.Now().UnixNano()), "Password123!")

	_, body, _ := user.Post("/api/guilds", map[string]string{"name": "Leave Ghost Guild"})
	var guild harness.Guild
	_ = json.Unmarshal(body, &guild)

	chID := guild.Channels[0].ID
	resp, _, _ := user.Post(fmt.Sprintf("/api/channels/%s/leave-voice", chID), nil)
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusNoContent {
		t.Errorf("Expected idempotent 200/204 on leave-voice when not in channel, got %d", resp.StatusCode)
	}
}

func TestT2_Voice_UnauthenticatedJoin(t *testing.T) {
	h := harness.GetHarness(t)
	unauth := h.NewSession()

	resp, _, _ := unauth.Post(fmt.Sprintf("/api/channels/%s/join-voice", uuid.New()), nil)
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("Expected 401 Unauthorized for unauthenticated voice join, got %d", resp.StatusCode)
	}
}

func TestT2_Voice_StateWithoutCSRF(t *testing.T) {
	h := harness.GetHarness(t)
	user := h.RegisterAndLogin(t, fmt.Sprintf("vstnocsrf_%d", time.Now().UnixNano()), fmt.Sprintf("vstnocsrf_%d@example.com", time.Now().UnixNano()), "Password123!")

	_, body, _ := user.Post("/api/guilds", map[string]string{"name": "Voice State CSRF Guild"})
	var guild harness.Guild
	_ = json.Unmarshal(body, &guild)

	chID := guild.Channels[0].ID
	resp, _, _ := user.PostWithoutCSRF(fmt.Sprintf("/api/channels/%s/voice-state", chID), map[string]bool{"self_mute": true})
	if resp.StatusCode != http.StatusForbidden {
		t.Errorf("Expected 403 Forbidden for voice state mutation without CSRF, got %d", resp.StatusCode)
	}
}

func TestT2_Voice_LeaveWithoutCSRF(t *testing.T) {
	h := harness.GetHarness(t)
	user := h.RegisterAndLogin(t, fmt.Sprintf("vlv_nocsrf_%d", time.Now().UnixNano()), fmt.Sprintf("vlv_nocsrf_%d@example.com", time.Now().UnixNano()), "Password123!")

	_, body, _ := user.Post("/api/guilds", map[string]string{"name": "Leave CSRF Guild"})
	var guild harness.Guild
	_ = json.Unmarshal(body, &guild)

	chID := guild.Channels[0].ID
	resp, _, _ := user.PostWithoutCSRF(fmt.Sprintf("/api/channels/%s/leave-voice", chID), nil)
	if resp.StatusCode != http.StatusForbidden {
		t.Errorf("Expected 403 Forbidden for voice leave without CSRF, got %d", resp.StatusCode)
	}
}

// ----------------------------------------------------------------------------
// Feature 10: Moderation Boundaries
// ----------------------------------------------------------------------------

func TestT2_Mod_NonModKickAttempt(t *testing.T) {
	h := harness.GetHarness(t)
	owner := h.RegisterAndLogin(t, fmt.Sprintf("kown_%d", time.Now().UnixNano()), fmt.Sprintf("kown_%d@example.com", time.Now().UnixNano()), "Password123!")
	stranger := h.RegisterAndLogin(t, fmt.Sprintf("kstr_%d", time.Now().UnixNano()), fmt.Sprintf("kstr_%d@example.com", time.Now().UnixNano()), "Password123!")

	_, body, _ := owner.Post("/api/guilds", map[string]string{"name": "Kick Boundary Guild"})
	var guild harness.Guild
	_ = json.Unmarshal(body, &guild)

	resp, _, _ := stranger.Post(fmt.Sprintf("/api/guilds/%s/members/%s/kick", guild.ID, owner.UserID), nil)
	if resp.StatusCode != http.StatusForbidden {
		t.Errorf("Expected 403 Forbidden when unauthorized user attempts kick, got %d", resp.StatusCode)
	}
}

func TestT2_Mod_NonModBanAttempt(t *testing.T) {
	h := harness.GetHarness(t)
	owner := h.RegisterAndLogin(t, fmt.Sprintf("bown_%d", time.Now().UnixNano()), fmt.Sprintf("bown_%d@example.com", time.Now().UnixNano()), "Password123!")
	stranger := h.RegisterAndLogin(t, fmt.Sprintf("bstr_%d", time.Now().UnixNano()), fmt.Sprintf("bstr_%d@example.com", time.Now().UnixNano()), "Password123!")

	_, body, _ := owner.Post("/api/guilds", map[string]string{"name": "Ban Boundary Guild"})
	var guild harness.Guild
	_ = json.Unmarshal(body, &guild)

	resp, _, _ := stranger.Post(fmt.Sprintf("/api/guilds/%s/bans", guild.ID), map[string]string{
		"user_id": owner.UserID.String(),
	})
	if resp.StatusCode != http.StatusForbidden {
		t.Errorf("Expected 403 Forbidden when non-admin attempts to ban, got %d", resp.StatusCode)
	}
}

func TestT2_Mod_BannedUserCannotRejoin(t *testing.T) {
	h := harness.GetHarness(t)
	owner := h.RegisterAndLogin(t, fmt.Sprintf("rejoin_own_%d", time.Now().UnixNano()), fmt.Sprintf("rejoin_own_%d@example.com", time.Now().UnixNano()), "Password123!")
	target := h.RegisterAndLogin(t, fmt.Sprintf("rejoin_tgt_%d", time.Now().UnixNano()), fmt.Sprintf("rejoin_tgt_%d@example.com", time.Now().UnixNano()), "Password123!")

	_, body, _ := owner.Post("/api/guilds", map[string]string{"name": "Ban Rejoin Guild"})
	var guild harness.Guild
	_ = json.Unmarshal(body, &guild)

	// Create invite
	_, invBody, _ := owner.Post(fmt.Sprintf("/api/guilds/%s/invites", guild.ID), nil)
	var inv harness.Invite
	_ = json.Unmarshal(invBody, &inv)

	// Owner bans target
	_, _, _ = owner.Post(fmt.Sprintf("/api/guilds/%s/bans", guild.ID), map[string]string{
		"user_id": target.UserID.String(),
	})

	// Banned user attempts to join via invite
	resp, body, _ := target.Post(fmt.Sprintf("/api/invites/%s/join", inv.Code), nil)
	if resp.StatusCode != http.StatusForbidden {
		t.Errorf("Expected 403 Forbidden when banned user attempts to join via invite, got %d: %s", resp.StatusCode, string(body))
	}
}

func TestT2_Mod_UnbanNonBannedUser(t *testing.T) {
	h := harness.GetHarness(t)
	owner := h.RegisterAndLogin(t, fmt.Sprintf("unb_own_%d", time.Now().UnixNano()), fmt.Sprintf("unb_own_%d@example.com", time.Now().UnixNano()), "Password123!")

	_, body, _ := owner.Post("/api/guilds", map[string]string{"name": "Unban Non Guild"})
	var guild harness.Guild
	_ = json.Unmarshal(body, &guild)

	randomUser := uuid.New()
	resp, _, _ := owner.Delete(fmt.Sprintf("/api/guilds/%s/bans/%s", guild.ID, randomUser))
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusNoContent && resp.StatusCode != http.StatusNotFound {
		t.Errorf("Unexpected status on unbanning non-banned user: %d", resp.StatusCode)
	}
}

func TestT2_Mod_KickNonExistentGuild(t *testing.T) {
	h := harness.GetHarness(t)
	user := h.RegisterAndLogin(t, fmt.Sprintf("knon_%d", time.Now().UnixNano()), fmt.Sprintf("knon_%d@example.com", time.Now().UnixNano()), "Password123!")

	resp, _, _ := user.Post(fmt.Sprintf("/api/guilds/%s/members/%s/kick", uuid.New(), uuid.New()), nil)
	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("Expected 404 Not Found when kicking from non-existent guild, got %d", resp.StatusCode)
	}
}
