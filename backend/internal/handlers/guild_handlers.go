package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/zerovc/zerovc/backend/internal/auth"
	"github.com/zerovc/zerovc/backend/internal/database"
	"github.com/zerovc/zerovc/backend/internal/gateway"
	"github.com/zerovc/zerovc/backend/internal/models"
)

type GuildHandler struct {
	db  *database.DB
	hub *gateway.Hub
}

func NewGuildHandler(db *database.DB, hub *gateway.Hub) *GuildHandler {
	return &GuildHandler{
		db:  db,
		hub: hub,
	}
}

type CreateGuildRequest struct {
	Name    string `json:"name"`
	IconURL string `json:"icon_url"`
}

func (h *GuildHandler) Create(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var req CreateGuildRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Name == "" {
		http.Error(w, `{"error":"guild name required"}`, http.StatusBadRequest)
		return
	}

	tx, err := h.db.Pool.Begin(r.Context())
	if err != nil {
		http.Error(w, `{"error":"failed to start transaction"}`, http.StatusInternalServerError)
		return
	}
	defer tx.Rollback(r.Context())

	// 1. Create Guild
	var guild models.Guild
	guildQuery := `
		INSERT INTO guilds (name, icon_url, owner_id)
		VALUES ($1, $2, $3)
		RETURNING id, name, icon_url, owner_id, created_at, updated_at
	`
	err = tx.QueryRow(r.Context(), guildQuery, req.Name, req.IconURL, userID).Scan(
		&guild.ID, &guild.Name, &guild.IconURL, &guild.OwnerID, &guild.CreatedAt, &guild.UpdatedAt,
	)
	if err != nil {
		http.Error(w, `{"error":"failed to create guild"}`, http.StatusInternalServerError)
		return
	}

	// 2. Add owner to guild_members
	memberQuery := `
		INSERT INTO guild_members (guild_id, user_id, role)
		VALUES ($1, $2, 'owner')
	`
	if _, err := tx.Exec(r.Context(), memberQuery, guild.ID, userID); err != nil {
		http.Error(w, `{"error":"failed to add member"}`, http.StatusInternalServerError)
		return
	}

	// 3. Create default Text Channel (#geral)
	textChannelQuery := `
		INSERT INTO channels (guild_id, name, type, position)
		VALUES ($1, 'geral', 'text', 0)
		RETURNING id, guild_id, name, type, topic, position, created_at
	`
	var textChan models.Channel
	err = tx.QueryRow(r.Context(), textChannelQuery, guild.ID).Scan(
		&textChan.ID, &textChan.GuildID, &textChan.Name, &textChan.Type, &textChan.Topic, &textChan.Position, &textChan.CreatedAt,
	)
	if err != nil {
		http.Error(w, `{"error":"failed to create default text channel"}`, http.StatusInternalServerError)
		return
	}

	// 4. Create default Voice Channel (Geral)
	voiceChannelQuery := `
		INSERT INTO channels (guild_id, name, type, position)
		VALUES ($1, 'Geral', 'voice', 1)
		RETURNING id, guild_id, name, type, topic, position, created_at
	`
	var voiceChan models.Channel
	err = tx.QueryRow(r.Context(), voiceChannelQuery, guild.ID).Scan(
		&voiceChan.ID, &voiceChan.GuildID, &voiceChan.Name, &voiceChan.Type, &voiceChan.Topic, &voiceChan.Position, &voiceChan.CreatedAt,
	)
	if err != nil {
		http.Error(w, `{"error":"failed to create default voice channel"}`, http.StatusInternalServerError)
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		http.Error(w, `{"error":"failed to commit transaction"}`, http.StatusInternalServerError)
		return
	}

	guild.Channels = []models.Channel{textChan, voiceChan}
	h.hub.AddGuildMember(guild.ID, userID)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(guild)
}

func (h *GuildHandler) List(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	query := `
		SELECT g.id, g.name, g.icon_url, g.owner_id, g.created_at, g.updated_at
		FROM guilds g
		INNER JOIN guild_members gm ON gm.guild_id = g.id
		WHERE gm.user_id = $1
		ORDER BY g.created_at ASC
	`
	rows, err := h.db.Pool.Query(r.Context(), query, userID)
	if err != nil {
		http.Error(w, `{"error":"failed to query guilds"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	guilds := make([]models.Guild, 0)
	for rows.Next() {
		var g models.Guild
		if err := rows.Scan(&g.ID, &g.Name, &g.IconURL, &g.OwnerID, &g.CreatedAt, &g.UpdatedAt); err != nil {
			continue
		}
		guilds = append(guilds, g)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(guilds)
}

func (h *GuildHandler) GetDetails(w http.ResponseWriter, r *http.Request) {
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

	// 1. Enforce Guild Membership Authorization
	var isMember bool
	checkQuery := `SELECT EXISTS(SELECT 1 FROM guild_members WHERE guild_id = $1 AND user_id = $2)`
	if err := h.db.Pool.QueryRow(r.Context(), checkQuery, guildID, userID).Scan(&isMember); err != nil || !isMember {
		http.Error(w, `{"error":"forbidden: you are not a member of this server"}`, http.StatusForbidden)
		return
	}

	// 2. Get Guild
	var guild models.Guild
	guildQuery := `SELECT id, name, icon_url, owner_id, created_at, updated_at FROM guilds WHERE id = $1`
	err = h.db.Pool.QueryRow(r.Context(), guildQuery, guildID).Scan(
		&guild.ID, &guild.Name, &guild.IconURL, &guild.OwnerID, &guild.CreatedAt, &guild.UpdatedAt,
	)
	if err != nil {
		http.Error(w, `{"error":"guild not found"}`, http.StatusNotFound)
		return
	}

	// 3. Get Roles
	rQuery := `SELECT id, guild_id, name, color, position, permissions, created_at FROM guild_roles WHERE guild_id = $1 ORDER BY position ASC, created_at ASC`
	rRows, err := h.db.Pool.Query(r.Context(), rQuery, guildID)
	if err == nil {
		for rRows.Next() {
			var role models.Role
			if scanErr := rRows.Scan(&role.ID, &role.GuildID, &role.Name, &role.Color, &role.Position, &role.Permissions, &role.CreatedAt); scanErr == nil {
				guild.Roles = append(guild.Roles, role)
			}
		}
		rRows.Close()
	}

	// 4. Get Channels
	chanQuery := `SELECT id, guild_id, name, type, topic, position, created_at FROM channels WHERE guild_id = $1 ORDER BY position ASC, name ASC`
	cRows, err := h.db.Pool.Query(r.Context(), chanQuery, guildID)
	if err == nil {
		defer cRows.Close()
		for cRows.Next() {
			var ch models.Channel
			if err := cRows.Scan(&ch.ID, &ch.GuildID, &ch.Name, &ch.Type, &ch.Topic, &ch.Position, &ch.CreatedAt); err == nil {
				if ch.Type == models.ChannelTypeVoice {
					vQuery := `
						SELECT vs.id, vs.channel_id, vs.user_id, vs.is_muted, vs.is_deafened, vs.is_screensharing, vs.joined_at,
						       u.username, u.display_name, u.avatar_url, u.banner_url, u.bio, u.status, u.custom_status
						FROM voice_sessions vs
						INNER JOIN users u ON u.id = vs.user_id
						WHERE vs.channel_id = $1
					`
					vRows, vErr := h.db.Pool.Query(r.Context(), vQuery, ch.ID)
					if vErr == nil {
						for vRows.Next() {
							var vs models.VoiceSession
							if scanErr := vRows.Scan(
								&vs.ID, &vs.ChannelID, &vs.UserID, &vs.IsMuted, &vs.IsDeafened, &vs.IsScreensharing, &vs.JoinedAt,
								&vs.User.Username, &vs.User.DisplayName, &vs.User.AvatarURL, &vs.User.BannerURL, &vs.User.Bio, &vs.User.Status, &vs.User.CustomStatus,
							); scanErr == nil {
								vs.User.ID = vs.UserID
								ch.VoiceSessions = append(ch.VoiceSessions, vs)
							}
						}
						vRows.Close()
					}
				}
				guild.Channels = append(guild.Channels, ch)
			}
		}
	}

	// 5. Get Members with Roles
	memQuery := `
		SELECT u.id, u.username, u.display_name, u.avatar_url, u.banner_url, u.bio, u.status, u.custom_status
		FROM users u
		INNER JOIN guild_members gm ON gm.user_id = u.id
		WHERE gm.guild_id = $1
		ORDER BY u.username ASC
	`
	mRows, err := h.db.Pool.Query(r.Context(), memQuery, guildID)
	if err == nil {
		defer mRows.Close()
		for mRows.Next() {
			var u models.UserPublic
			if err := mRows.Scan(&u.ID, &u.Username, &u.DisplayName, &u.AvatarURL, &u.BannerURL, &u.Bio, &u.Status, &u.CustomStatus); err == nil {
				// If user is not currently active on WebSocket, mark as offline
				if !h.hub.IsUserOnline(u.ID) {
					u.Status = "offline"
				}

				// Query roles for member
				roleQuery := `
					SELECT gr.id, gr.guild_id, gr.name, gr.color, gr.position, gr.permissions, gr.created_at
					FROM guild_roles gr
					INNER JOIN guild_member_roles gmr ON gmr.role_id = gr.id
					WHERE gmr.guild_id = $1 AND gmr.user_id = $2
					ORDER BY gr.position ASC
				`
				mrRows, mrErr := h.db.Pool.Query(r.Context(), roleQuery, guildID, u.ID)
				if mrErr == nil {
					for mrRows.Next() {
						var mr models.Role
						if mrScan := mrRows.Scan(&mr.ID, &mr.GuildID, &mr.Name, &mr.Color, &mr.Position, &mr.Permissions, &mr.CreatedAt); mrScan == nil {
							u.Roles = append(u.Roles, mr)
						}
					}
					mrRows.Close()
				}
				guild.Members = append(guild.Members, u)
			}
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(guild)
}

func (h *GuildHandler) Join(w http.ResponseWriter, r *http.Request) {
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

	query := `
		INSERT INTO guild_members (guild_id, user_id, role)
		VALUES ($1, $2, 'member')
		ON CONFLICT (guild_id, user_id) DO NOTHING
	`
	if _, err := h.db.Pool.Exec(r.Context(), query, guildID, userID); err != nil {
		http.Error(w, `{"error":"failed to join guild"}`, http.StatusInternalServerError)
		return
	}

	h.hub.AddGuildMember(guildID, userID)

	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"success":true}`))
}
