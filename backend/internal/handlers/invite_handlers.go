package handlers

import (
	"crypto/rand"
	"encoding/json"
	"math/big"
	"net/http"
	"strconv"
	"time"

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

	// 1. Verify user is a member of the guild and has invite permissions
	ac, err := loadActorGuildContext(r.Context(), h.db, guildID, userID)
	if err != nil {
		http.Error(w, `{"error":"servidor não encontrado"}`, http.StatusNotFound)
		return
	}

	canCreate := ac.IsOwner || ac.HasAdmin || (ac.Perms&models.PermCreateInstantInvite) != 0 || (ac.Perms&models.PermManageGuild) != 0
	if !canCreate {
		http.Error(w, `{"error":"você não tem permissão para criar convites neste servidor"}`, http.StatusForbidden)
		return
	}

	// 2. Check if an active, non-expired invite already exists for this user in this guild (unless ?new=true requested)
	var invite models.GuildInvite
	forceNew := r.URL.Query().Get("new") == "true"
	if !forceNew {
		existingQuery := `
			SELECT code, guild_id, creator_id, uses, max_uses, expires_at, created_at
			FROM guild_invites
			WHERE guild_id = $1 AND creator_id = $2
			  AND (expires_at IS NULL OR expires_at > NOW())
			  AND (max_uses = 0 OR uses < max_uses)
			ORDER BY created_at DESC
			LIMIT 1
		`
		err = h.db.Pool.QueryRow(r.Context(), existingQuery, guildID, userID).Scan(
			&invite.Code, &invite.GuildID, &invite.CreatorID, &invite.Uses, &invite.MaxUses, &invite.ExpiresAt, &invite.CreatedAt,
		)
		if err == nil {
			var creator models.UserPublic
			_ = h.db.Pool.QueryRow(r.Context(), `SELECT id, username, display_name, avatar_url, status FROM users WHERE id = $1`, invite.CreatorID).Scan(
				&creator.ID, &creator.Username, &creator.DisplayName, &creator.AvatarURL, &creator.Status,
			)
			invite.Creator = &creator
			invite.IsExisting = true
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(invite)
			return
		}
	}

	// 3. Parse options for new invite (max_age, max_uses)
	var req struct {
		MaxAge  int `json:"max_age"`  // in seconds (0 = never, 21600 = 6h, 86400 = 1d, 604800 = 7d, 2592000 = 30d)
		MaxUses int `json:"max_uses"` // 0 = unlimited, 1, 5, 10, 25, 50
	}
	_ = json.NewDecoder(r.Body).Decode(&req)

	if req.MaxAge == 0 && r.URL.Query().Get("max_age") != "" {
		if val, err := strconv.Atoi(r.URL.Query().Get("max_age")); err == nil {
			req.MaxAge = val
		}
	}
	if req.MaxUses == 0 && r.URL.Query().Get("max_uses") != "" {
		if val, err := strconv.Atoi(r.URL.Query().Get("max_uses")); err == nil {
			req.MaxUses = val
		}
	}

	var expiresAt *time.Time
	if req.MaxAge > 0 {
		exp := time.Now().Add(time.Duration(req.MaxAge) * time.Second)
		expiresAt = &exp
	}

	// 4. Generate exactly 10-character hash code
	code, err := generateInviteCode(10)
	if err != nil {
		http.Error(w, `{"error":"failed to generate invite code"}`, http.StatusInternalServerError)
		return
	}

	insertQuery := `
		INSERT INTO guild_invites (code, guild_id, creator_id, max_uses, expires_at)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING code, guild_id, creator_id, uses, max_uses, expires_at, created_at
	`
	err = h.db.Pool.QueryRow(r.Context(), insertQuery, code, guildID, userID, req.MaxUses, expiresAt).Scan(
		&invite.Code, &invite.GuildID, &invite.CreatorID, &invite.Uses, &invite.MaxUses, &invite.ExpiresAt, &invite.CreatedAt,
	)
	if err != nil {
		http.Error(w, `{"error":"failed to save invite"}`, http.StatusInternalServerError)
		return
	}

	var creator models.UserPublic
	_ = h.db.Pool.QueryRow(r.Context(), `SELECT id, username, display_name, avatar_url, status FROM users WHERE id = $1`, userID).Scan(
		&creator.ID, &creator.Username, &creator.DisplayName, &creator.AvatarURL, &creator.Status,
	)
	invite.Creator = &creator
	invite.IsExisting = false

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(invite)
}

// List all active invites for a guild
func (h *InviteHandler) ListGuildInvites(w http.ResponseWriter, r *http.Request) {
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

	ac, err := loadActorGuildContext(r.Context(), h.db, guildID, userID)
	if err != nil {
		http.Error(w, `{"error":"servidor não encontrado"}`, http.StatusNotFound)
		return
	}

	canList := ac.IsOwner || ac.HasAdmin || (ac.Perms&models.PermManageGuild) != 0 || (ac.Perms&models.PermCreateInstantInvite) != 0
	if !canList {
		http.Error(w, `{"error":"forbidden: você não tem permissão para listar convites deste servidor"}`, http.StatusForbidden)
		return
	}

	query := `
		SELECT gi.code, gi.guild_id, gi.creator_id, gi.uses, gi.max_uses, gi.expires_at, gi.created_at,
		       u.username, u.display_name, u.avatar_url, u.status
		FROM guild_invites gi
		LEFT JOIN users u ON u.id = gi.creator_id
		WHERE gi.guild_id = $1
		ORDER BY gi.created_at DESC
	`
	rows, err := h.db.Pool.Query(r.Context(), query, guildID)
	if err != nil {
		http.Error(w, `{"error":"failed to list invites"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	invites := make([]models.GuildInvite, 0)
	for rows.Next() {
		var inv models.GuildInvite
		var u models.UserPublic
		var uname, udisp, uav, ust *string
		if err := rows.Scan(&inv.Code, &inv.GuildID, &inv.CreatorID, &inv.Uses, &inv.MaxUses, &inv.ExpiresAt, &inv.CreatedAt, &uname, &udisp, &uav, &ust); err == nil {
			if uname != nil {
				u.ID = inv.CreatorID
				u.Username = *uname
				if udisp != nil {
					u.DisplayName = *udisp
				}
				if uav != nil {
					u.AvatarURL = *uav
				}
				if ust != nil {
					u.Status = *ust
				}
				inv.Creator = &u
			}
			invites = append(invites, inv)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(invites)
}

// Delete / Revoke invite
func (h *InviteHandler) DeleteInvite(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	guildIDStr := chi.URLParam(r, "id")
	code := chi.URLParam(r, "code")
	guildID, err := uuid.Parse(guildIDStr)
	if err != nil {
		http.Error(w, `{"error":"invalid guild id"}`, http.StatusBadRequest)
		return
	}

	ac, err := loadActorGuildContext(r.Context(), h.db, guildID, userID)
	if err != nil {
		http.Error(w, `{"error":"servidor não encontrado"}`, http.StatusNotFound)
		return
	}

	// Verify owner or admin or creator
	var creatorID, ownerID uuid.UUID
	err = h.db.Pool.QueryRow(r.Context(), `
		SELECT gi.creator_id, g.owner_id
		FROM guild_invites gi
		INNER JOIN guilds g ON g.id = gi.guild_id
		WHERE gi.code = $1 AND gi.guild_id = $2
	`, code, guildID).Scan(&creatorID, &ownerID)
	if err != nil {
		http.Error(w, `{"error":"convite não encontrado"}`, http.StatusNotFound)
		return
	}

	canDelete := ac.IsOwner || ac.HasAdmin || (ac.Perms&models.PermManageGuild) != 0 || userID == creatorID
	if !canDelete {
		http.Error(w, `{"error":"forbidden: sem permissão para revogar convite"}`, http.StatusForbidden)
		return
	}

	_, err = h.db.Pool.Exec(r.Context(), "DELETE FROM guild_invites WHERE code = $1 AND guild_id = $2", code, guildID)
	if err != nil {
		http.Error(w, `{"error":"failed to delete invite"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"success": true, "code": code})
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
		SELECT gi.code, gi.guild_id, gi.creator_id, gi.uses, gi.max_uses, gi.expires_at, gi.created_at,
		       g.id, g.name, g.icon_url, g.owner_id,
		       (SELECT COUNT(*) FROM guild_members gm WHERE gm.guild_id = g.id) as member_count
		FROM guild_invites gi
		INNER JOIN guilds g ON g.id = gi.guild_id
		WHERE gi.code = $1
	`
	err := h.db.Pool.QueryRow(r.Context(), query, code).Scan(
		&invite.Code, &invite.GuildID, &invite.CreatorID, &invite.Uses, &invite.MaxUses, &invite.ExpiresAt, &invite.CreatedAt,
		&guild.ID, &guild.Name, &guild.IconURL, &guild.OwnerID, &memberCount,
	)
	if err != nil {
		http.Error(w, `{"error":"invite not found or expired"}`, http.StatusNotFound)
		return
	}

	if invite.ExpiresAt != nil && invite.ExpiresAt.Before(time.Now()) {
		http.Error(w, `{"error":"Este convite expirou"}`, http.StatusGone)
		return
	}
	if invite.MaxUses > 0 && invite.Uses >= invite.MaxUses {
		http.Error(w, `{"error":"Este convite atingiu o limite máximo de utilizações"}`, http.StatusGone)
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
	var uses, maxUses int
	var expiresAt *time.Time
	err := h.db.Pool.QueryRow(r.Context(), "SELECT guild_id, uses, max_uses, expires_at FROM guild_invites WHERE code = $1", code).Scan(&guildID, &uses, &maxUses, &expiresAt)
	if err != nil {
		http.Error(w, `{"error":"invalid or expired invite code"}`, http.StatusNotFound)
		return
	}

	if expiresAt != nil && expiresAt.Before(time.Now()) {
		http.Error(w, `{"error":"Este convite expirou"}`, http.StatusForbidden)
		return
	}
	if maxUses > 0 && uses >= maxUses {
		http.Error(w, `{"error":"Este convite atingiu o limite máximo de utilizações"}`, http.StatusForbidden)
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

	// 1.1 Assign @everyone role to new member
	assignEveryoneQuery := `
		INSERT INTO guild_member_roles (guild_id, user_id, role_id)
		SELECT $1, $2, id
		FROM guild_roles
		WHERE guild_id = $1 AND name = '@everyone'
		ON CONFLICT DO NOTHING
	`
	h.db.Pool.Exec(r.Context(), assignEveryoneQuery, guildID, userID)

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
