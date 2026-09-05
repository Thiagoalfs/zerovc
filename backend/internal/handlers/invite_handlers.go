package handlers

import (
	"crypto/rand"
	"encoding/json"
	"math/big"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/zerovc/zerovc/backend/internal/auth"
	"github.com/zerovc/zerovc/backend/internal/database"
	"github.com/zerovc/zerovc/backend/internal/gateway"
	"github.com/zerovc/zerovc/backend/internal/models"
)

type InviteHandler struct {
	db  *database.DB
	hub *gateway.Hub
}

func NewInviteHandler(db *database.DB, hub *gateway.Hub) *InviteHandler {
	return &InviteHandler{
		db:  db,
		hub: hub,
	}
}

const inviteCharset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"

func generateInviteCode(length int) (string, error) {
	bytes := make([]byte, length)
	charsetLen := big.NewInt(int64(len(inviteCharset)))
	for i := 0; i < length; i++ {
		num, err := rand.Int(rand.Reader, charsetLen)
		if err != nil {
			return "", err
		}
		bytes[i] = inviteCharset[num.Int64()]
	}
	return string(bytes), nil
}

// Create or get existing invite for a guild (10-character hash)
func (h *InviteHandler) CreateInvite(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	guildIDStr := chi.URLParam(r, "id")
	guildID, err := uuid.Parse(guildIDStr)
	if err != nil {
		http.Error(w, `{"error":"invalid guild id"}`, http.StatusBadRequest)
		return
	}

	// 1. Verify user is a member of the guild
	var isMember bool
	err = h.db.Pool.QueryRow(r.Context(), "SELECT EXISTS(SELECT 1 FROM guild_members WHERE guild_id = $1 AND user_id = $2)", guildID, userID).Scan(&isMember)
	if err != nil || !isMember {
		http.Error(w, `{"error":"forbidden: not a member of this server"}`, http.StatusForbidden)
		return
	}

	// 2. Check if an active invite already exists for this guild
	var invite models.GuildInvite
	existingQuery := `SELECT code, guild_id, creator_id, uses, created_at FROM guild_invites WHERE guild_id = $1 ORDER BY created_at DESC LIMIT 1`
	err = h.db.Pool.QueryRow(r.Context(), existingQuery, guildID).Scan(&invite.Code, &invite.GuildID, &invite.CreatorID, &invite.Uses, &invite.CreatedAt)
	if err == nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(invite)
		return
	}

	// 3. Generate exactly 10-character hash code
	code, err := generateInviteCode(10)
	if err != nil {
		http.Error(w, `{"error":"failed to generate invite code"}`, http.StatusInternalServerError)
		return
	}

	insertQuery := `
		INSERT INTO guild_invites (code, guild_id, creator_id)
		VALUES ($1, $2, $3)
		RETURNING code, guild_id, creator_id, uses, created_at
	`
	err = h.db.Pool.QueryRow(r.Context(), insertQuery, code, guildID, userID).Scan(
		&invite.Code, &invite.GuildID, &invite.CreatorID, &invite.Uses, &invite.CreatedAt,
	)
	if err != nil {
		http.Error(w, `{"error":"failed to save invite"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(invite)
}

// Get invite details preview by 10-character code
func (h *InviteHandler) GetInvite(w http.ResponseWriter, r *http.Request) {
	code := chi.URLParam(r, "code")
	if len(code) != 10 {
		http.Error(w, `{"error":"invalid invite code format"}`, http.StatusBadRequest)
		return
	}

	var invite models.GuildInvite
	var guild models.Guild
	var memberCount int

	query := `
		SELECT gi.code, gi.guild_id, gi.creator_id, gi.uses, gi.created_at,
		       g.id, g.name, g.icon_url, g.owner_id,
		       (SELECT COUNT(*) FROM guild_members gm WHERE gm.guild_id = g.id) as member_count
		FROM guild_invites gi
		INNER JOIN guilds g ON g.id = gi.guild_id
		WHERE gi.code = $1
	`
	err := h.db.Pool.QueryRow(r.Context(), query, code).Scan(
		&invite.Code, &invite.GuildID, &invite.CreatorID, &invite.Uses, &invite.CreatedAt,
		&guild.ID, &guild.Name, &guild.IconURL, &guild.OwnerID, &memberCount,
	)
	if err != nil {
		http.Error(w, `{"error":"invite not found or expired"}`, http.StatusNotFound)
		return
	}

	invite.Guild = &guild

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"invite":       invite,
		"member_count": memberCount,
	})
}

// Join guild using 10-character invite hash
func (h *InviteHandler) JoinByInvite(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	code := chi.URLParam(r, "code")
	if len(code) != 10 {
		http.Error(w, `{"error":"invalid invite code"}`, http.StatusBadRequest)
		return
	}

	var guildID uuid.UUID
	err := h.db.Pool.QueryRow(r.Context(), "SELECT guild_id FROM guild_invites WHERE code = $1", code).Scan(&guildID)
	if err != nil {
		http.Error(w, `{"error":"invalid or expired invite code"}`, http.StatusNotFound)
		return
	}

	// 0. Check if user is banned from this guild
	var isBanned bool
	banCheckQuery := `SELECT EXISTS(SELECT 1 FROM guild_bans WHERE guild_id = $1 AND user_id = $2)`
	if err := h.db.Pool.QueryRow(r.Context(), banCheckQuery, guildID, userID).Scan(&isBanned); err == nil && isBanned {
		http.Error(w, `{"error":"Você está banido deste servidor"}`, http.StatusForbidden)
		return
	}

	// 1. Add user to guild_members
	joinQuery := `
		INSERT INTO guild_members (guild_id, user_id, role)
		VALUES ($1, $2, 'member')
		ON CONFLICT (guild_id, user_id) DO NOTHING
	`
	if _, err := h.db.Pool.Exec(r.Context(), joinQuery, guildID, userID); err != nil {
		http.Error(w, `{"error":"failed to join server"}`, http.StatusInternalServerError)
		return
	}

	// 2. Increment invite uses count
	h.db.Pool.Exec(r.Context(), "UPDATE guild_invites SET uses = uses + 1 WHERE code = $1", code)

	// 3. Register user in hub for real-time events
	h.hub.AddGuildMember(guildID, userID)

	// Fetch new member data and broadcast to guild
	var newMem models.UserPublic
	h.db.Pool.QueryRow(r.Context(), `
		SELECT id, username, display_name, avatar_url, banner_url, bio, status, custom_status
		FROM users
		WHERE id = $1
	`, userID).Scan(
		&newMem.ID, &newMem.Username, &newMem.DisplayName, &newMem.AvatarURL, &newMem.BannerURL, &newMem.Bio, &newMem.Status, &newMem.CustomStatus,
	)
	if h.hub.IsUserOnline(newMem.ID) {
		newMem.Status = "online"
	}

	h.hub.BroadcastToGuild(guildID, models.WSEvent{
		Type: "GUILD_MEMBER_ADD",
		Data: map[string]any{
			"guild_id": guildID,
			"member":   newMem,
		},
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"success":  true,
		"guild_id": guildID,
	})
}
