package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

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
		INSERT INTO guilds (name, icon_url, banner_url, owner_id)
		VALUES ($1, $2, '', $3)
		RETURNING id, name, icon_url, COALESCE(banner_url, ''), owner_id, created_at, updated_at
	`
	err = tx.QueryRow(r.Context(), guildQuery, req.Name, req.IconURL, userID).Scan(
		&guild.ID, &guild.Name, &guild.IconURL, &guild.BannerURL, &guild.OwnerID, &guild.CreatedAt, &guild.UpdatedAt,
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
		SELECT g.id, g.name, g.icon_url, COALESCE(g.banner_url, ''), g.owner_id, g.created_at, g.updated_at
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
		if err := rows.Scan(&g.ID, &g.Name, &g.IconURL, &g.BannerURL, &g.OwnerID, &g.CreatedAt, &g.UpdatedAt); err != nil {
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
	guildQuery := `SELECT id, name, icon_url, COALESCE(banner_url, ''), owner_id, created_at, updated_at FROM guilds WHERE id = $1`
	err = h.db.Pool.QueryRow(r.Context(), guildQuery, guildID).Scan(
		&guild.ID, &guild.Name, &guild.IconURL, &guild.BannerURL, &guild.OwnerID, &guild.CreatedAt, &guild.UpdatedAt,
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

	// 4. Get User's Role IDs and Check Admin
	userRoleMap := make(map[uuid.UUID]bool)
	hasAdminPerm := (guild.OwnerID == userID)
	if !hasAdminPerm {
		uRolesQuery := `
			SELECT gr.id, gr.permissions
			FROM guild_roles gr
			INNER JOIN guild_member_roles gmr ON gmr.role_id = gr.id
			WHERE gmr.guild_id = $1 AND gmr.user_id = $2
		`
		urRows, urErr := h.db.Pool.Query(r.Context(), uRolesQuery, guildID, userID)
		if urErr == nil {
			for urRows.Next() {
				var rID uuid.UUID
				var perms int64
				if urRows.Scan(&rID, &perms) == nil {
					userRoleMap[rID] = true
					if (perms & models.PermAdministrator) != 0 {
						hasAdminPerm = true
					}
				}
			}
			urRows.Close()
		}
	}

	// 5. Get Channels
	chanQuery := `SELECT id, guild_id, name, type, category_id, topic, position, is_private, created_at FROM channels WHERE guild_id = $1 ORDER BY position ASC, name ASC`
	cRows, err := h.db.Pool.Query(r.Context(), chanQuery, guildID)
	if err == nil {
		defer cRows.Close()
		for cRows.Next() {
			var ch models.Channel
			if err := cRows.Scan(&ch.ID, &ch.GuildID, &ch.Name, &ch.Type, &ch.CategoryID, &ch.Topic, &ch.Position, &ch.IsPrivate, &ch.CreatedAt); err == nil {
				// If private, load allowed role IDs and check access
				if ch.IsPrivate {
					accessQuery := `SELECT role_id FROM channel_role_access WHERE channel_id = $1`
					aRows, aErr := h.db.Pool.Query(r.Context(), accessQuery, ch.ID)
					hasChannelAccess := hasAdminPerm
					if aErr == nil {
						for aRows.Next() {
							var allowedRoleID uuid.UUID
							if aRows.Scan(&allowedRoleID) == nil {
								ch.RoleIDs = append(ch.RoleIDs, allowedRoleID)
								if userRoleMap[allowedRoleID] {
									hasChannelAccess = true
								}
							}
						}
						aRows.Close()
					}

					// If user does not have access to this private channel, skip it
					if !hasChannelAccess {
						continue
					}
				}

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

	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"success":true}`))
}

// Moderation Helper
func (h *GuildHandler) checkModerationHierarchy(ctx context.Context, guildID, actorID, targetUserID uuid.UUID, requiredPerm int64) (bool, string) {
	var ownerID uuid.UUID
	err := h.db.Pool.QueryRow(ctx, "SELECT owner_id FROM guilds WHERE id = $1", guildID).Scan(&ownerID)
	if err != nil {
		return false, "servidor não encontrado"
	}

	if actorID == targetUserID {
		if requiredPerm == models.PermKickMembers || requiredPerm == models.PermBanMembers {
			return false, "você não pode expulsar ou banir a si mesmo"
		}
	} else if targetUserID == ownerID {
		return false, "você não pode moderar o dono do servidor"
	}

	if actorID == ownerID {
		return true, ""
	}

	var actorMaxPos int = 999999
	var actorPerms int64 = 0
	actorRows, err := h.db.Pool.Query(ctx, `
		SELECT gr.position, gr.permissions
		FROM guild_roles gr
		INNER JOIN guild_member_roles gmr ON gmr.role_id = gr.id
		WHERE gmr.guild_id = $1 AND gmr.user_id = $2
	`, guildID, actorID)
	if err == nil {
		for actorRows.Next() {
			var pos int
			var p int64
			if actorRows.Scan(&pos, &p) == nil {
				actorPerms |= p
				if pos < actorMaxPos {
					actorMaxPos = pos
				}
			}
		}
		actorRows.Close()
	}

	hasPerm := (actorPerms&models.PermAdministrator) != 0 || (actorPerms&requiredPerm) != 0
	if !hasPerm {
		return false, "você não tem permissão para realizar esta ação"
	}

	var targetMaxPos int = 999999
	targetRows, err := h.db.Pool.Query(ctx, `
		SELECT gr.position
		FROM guild_roles gr
		INNER JOIN guild_member_roles gmr ON gmr.role_id = gr.id
		WHERE gmr.guild_id = $1 AND gmr.user_id = $2
	`, guildID, targetUserID)
	if err == nil {
		for targetRows.Next() {
			var pos int
			if targetRows.Scan(&pos) == nil {
				if pos < targetMaxPos {
					targetMaxPos = pos
				}
			}
		}
		targetRows.Close()
	}

	if actorID != targetUserID && actorMaxPos >= targetMaxPos {
		return false, "você não pode moderar um membro com cargo igual ou superior ao seu"
	}

	return true, ""
}

type BanMemberRequest struct {
	UserID uuid.UUID `json:"user_id"`
	Reason string    `json:"reason"`
}

type MuteMemberRequest struct {
	DurationSeconds int `json:"duration_seconds"` // -1: permanente, 0: desmutar, >0: segundos
}

func (h *GuildHandler) KickMember(w http.ResponseWriter, r *http.Request) {
	actorID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	guildIDStr := chi.URLParam(r, "id")
	targetUserIDStr := chi.URLParam(r, "userID")
	guildID, _ := uuid.Parse(guildIDStr)
	targetUserID, _ := uuid.Parse(targetUserIDStr)

	allowed, msg := h.checkModerationHierarchy(r.Context(), guildID, actorID, targetUserID, models.PermKickMembers)
	if !allowed {
		http.Error(w, `{"error":"`+msg+`"}`, http.StatusForbidden)
		return
	}

	// Remove from guild_members, member_roles, voice_sessions
	h.db.Pool.Exec(r.Context(), "DELETE FROM guild_member_roles WHERE guild_id = $1 AND user_id = $2", guildID, targetUserID)
	h.db.Pool.Exec(r.Context(), "DELETE FROM voice_sessions WHERE user_id = $1", targetUserID)
	h.db.Pool.Exec(r.Context(), "DELETE FROM guild_members WHERE guild_id = $1 AND user_id = $2", guildID, targetUserID)

	h.hub.RemoveGuildMember(guildID, targetUserID)
	h.hub.BroadcastToGuild(guildID, models.WSEvent{
		Type: "GUILD_MEMBER_REMOVE",
		Data: map[string]any{
			"guild_id": guildID,
			"user_id":  targetUserID,
		},
	})

	h.LogAudit(r.Context(), guildID, actorID, "MEMBER_KICK", &targetUserID, map[string]any{"reason": "Expulso por moderador"})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"success": true, "user_id": targetUserID})
}

func (h *GuildHandler) BanMember(w http.ResponseWriter, r *http.Request) {
	actorID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	guildIDStr := chi.URLParam(r, "id")
	guildID, _ := uuid.Parse(guildIDStr)

	var req BanMemberRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.UserID == uuid.Nil {
		http.Error(w, `{"error":"user_id required"}`, http.StatusBadRequest)
		return
	}

	allowed, msg := h.checkModerationHierarchy(r.Context(), guildID, actorID, req.UserID, models.PermBanMembers)
	if !allowed {
		http.Error(w, `{"error":"`+msg+`"}`, http.StatusForbidden)
		return
	}

	// Insert into guild_bans
	banQuery := `
		INSERT INTO guild_bans (guild_id, user_id, reason, banned_by)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (guild_id, user_id) DO UPDATE SET reason = EXCLUDED.reason, banned_by = EXCLUDED.banned_by
	`
	_, err := h.db.Pool.Exec(r.Context(), banQuery, guildID, req.UserID, req.Reason, actorID)
	if err != nil {
		http.Error(w, `{"error":"failed to ban user"}`, http.StatusInternalServerError)
		return
	}

	// Remove member
	h.db.Pool.Exec(r.Context(), "DELETE FROM guild_member_roles WHERE guild_id = $1 AND user_id = $2", guildID, req.UserID)
	h.db.Pool.Exec(r.Context(), "DELETE FROM voice_sessions WHERE user_id = $1", req.UserID)
	h.db.Pool.Exec(r.Context(), "DELETE FROM guild_members WHERE guild_id = $1 AND user_id = $2", guildID, req.UserID)

	h.hub.RemoveGuildMember(guildID, req.UserID)
	h.hub.BroadcastToGuild(guildID, models.WSEvent{
		Type: "GUILD_BAN_ADD",
		Data: map[string]any{
			"guild_id": guildID,
			"user_id":  req.UserID,
			"reason":   req.Reason,
		},
	})

	h.LogAudit(r.Context(), guildID, actorID, "MEMBER_BAN", &req.UserID, map[string]any{"reason": req.Reason})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"success": true, "user_id": req.UserID})
}

func (h *GuildHandler) UnbanMember(w http.ResponseWriter, r *http.Request) {
	actorID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	guildIDStr := chi.URLParam(r, "id")
	targetUserIDStr := chi.URLParam(r, "userID")
	guildID, _ := uuid.Parse(guildIDStr)
	targetUserID, _ := uuid.Parse(targetUserIDStr)

	// Check if actor is owner or has PermBanMembers
	var ownerID uuid.UUID
	h.db.Pool.QueryRow(r.Context(), "SELECT owner_id FROM guilds WHERE id = $1", guildID).Scan(&ownerID)

	if actorID != ownerID {
		var actorPerms int64
		rows, err := h.db.Pool.Query(r.Context(), `
			SELECT gr.permissions
			FROM guild_roles gr
			INNER JOIN guild_member_roles gmr ON gmr.role_id = gr.id
			WHERE gmr.guild_id = $1 AND gmr.user_id = $2
		`, guildID, actorID)
		if err == nil {
			for rows.Next() {
				var p int64
				if rows.Scan(&p) == nil {
					actorPerms |= p
				}
			}
			rows.Close()
		}
		if (actorPerms&models.PermAdministrator) == 0 && (actorPerms&models.PermBanMembers) == 0 {
			http.Error(w, `{"error":"sem permissão para desbanir membros"}`, http.StatusForbidden)
			return
		}
	}

	h.db.Pool.Exec(r.Context(), "DELETE FROM guild_bans WHERE guild_id = $1 AND user_id = $2", guildID, targetUserID)

	h.hub.BroadcastToGuild(guildID, models.WSEvent{
		Type: "GUILD_BAN_REMOVE",
		Data: map[string]any{
			"guild_id": guildID,
			"user_id":  targetUserID,
		},
	})

	h.LogAudit(r.Context(), guildID, actorID, "MEMBER_UNBAN", &targetUserID, nil)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"success": true, "user_id": targetUserID})
}

func (h *GuildHandler) MuteMember(w http.ResponseWriter, r *http.Request) {
	actorID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	guildIDStr := chi.URLParam(r, "id")
	targetUserIDStr := chi.URLParam(r, "userID")
	guildID, _ := uuid.Parse(guildIDStr)
	targetUserID, _ := uuid.Parse(targetUserIDStr)

	allowed, msg := h.checkModerationHierarchy(r.Context(), guildID, actorID, targetUserID, models.PermMuteMembers)
	if !allowed {
		http.Error(w, `{"error":"`+msg+`"}`, http.StatusForbidden)
		return
	}

	var req MuteMemberRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request"}`, http.StatusBadRequest)
		return
	}

	var mutedUntil *time.Time
	if req.DurationSeconds > 0 {
		t := time.Now().UTC().Add(time.Duration(req.DurationSeconds) * time.Second)
		mutedUntil = &t
	} else if req.DurationSeconds < 0 {
		// Permanent (year 2099)
		t := time.Date(2099, 12, 31, 23, 59, 59, 0, time.UTC)
		mutedUntil = &t
	} // if req.DurationSeconds == 0 -> unmute (mutedUntil = nil)

	_, err := h.db.Pool.Exec(r.Context(), "UPDATE guild_members SET muted_until = $1 WHERE guild_id = $2 AND user_id = $3", mutedUntil, guildID, targetUserID)
	if err != nil {
		http.Error(w, `{"error":"failed to update mute status"}`, http.StatusInternalServerError)
		return
	}

	h.hub.BroadcastToGuild(guildID, models.WSEvent{
		Type: "GUILD_MEMBER_UPDATE",
		Data: map[string]any{
			"guild_id":    guildID,
			"user_id":     targetUserID,
			"muted_until": mutedUntil,
		},
	})

	h.LogAudit(r.Context(), guildID, actorID, "MEMBER_MUTE", &targetUserID, map[string]any{"duration_seconds": req.DurationSeconds})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"success":     true,
		"user_id":     targetUserID,
		"muted_until": mutedUntil,
	})
}

type UpdateGuildRequest struct {
	Name      *string `json:"name,omitempty"`
	IconURL   *string `json:"icon_url,omitempty"`
	BannerURL *string `json:"banner_url,omitempty"`
}

func (h *GuildHandler) Update(w http.ResponseWriter, r *http.Request) {
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

	// Verify permissions (owner or PermAdministrator or PermManageGuild)
	var ownerID uuid.UUID
	err = h.db.Pool.QueryRow(r.Context(), "SELECT owner_id FROM guilds WHERE id = $1", guildID).Scan(&ownerID)
	if err != nil {
		http.Error(w, `{"error":"guild not found"}`, http.StatusNotFound)
		return
	}

	if userID != ownerID {
		var perms int64
		h.db.Pool.QueryRow(r.Context(), `
			SELECT COALESCE(BIT_OR(r.permissions), 0)
			FROM guild_members gm
			JOIN guild_member_roles gmr ON gmr.guild_id = gm.guild_id AND gmr.user_id = gm.user_id
			JOIN guild_roles r ON r.id = gmr.role_id
			WHERE gm.guild_id = $1 AND gm.user_id = $2
		`, guildID, userID).Scan(&perms)

		if (perms&models.PermAdministrator) == 0 && (perms&models.PermManageGuild) == 0 {
			http.Error(w, `{"error":"forbidden: sem permissão para gerenciar servidor"}`, http.StatusForbidden)
			return
		}
	}

	var req UpdateGuildRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	var guild models.Guild
	updateQuery := `
		UPDATE guilds
		SET name = COALESCE($1, name),
		    icon_url = COALESCE($2, icon_url),
		    banner_url = COALESCE($3, banner_url),
		    updated_at = CURRENT_TIMESTAMP
		WHERE id = $4
		RETURNING id, name, icon_url, COALESCE(banner_url, ''), owner_id, created_at, updated_at
	`
	err = h.db.Pool.QueryRow(r.Context(), updateQuery, req.Name, req.IconURL, req.BannerURL, guildID).Scan(
		&guild.ID, &guild.Name, &guild.IconURL, &guild.BannerURL, &guild.OwnerID, &guild.CreatedAt, &guild.UpdatedAt,
	)
	if err != nil {
		http.Error(w, `{"error":"failed to update guild"}`, http.StatusInternalServerError)
		return
	}

	// Broadcast update to all guild members
	h.hub.BroadcastToGuild(guildID, models.WSEvent{
		Type: "GUILD_UPDATE",
		Data: guild,
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(guild)
}

func (h *GuildHandler) Delete(w http.ResponseWriter, r *http.Request) {
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

	// Check if user is the Owner
	var ownerID uuid.UUID
	err = h.db.Pool.QueryRow(r.Context(), "SELECT owner_id FROM guilds WHERE id = $1", guildID).Scan(&ownerID)
	if err != nil {
		http.Error(w, `{"error":"guild not found"}`, http.StatusNotFound)
		return
	}

	if userID != ownerID {
		http.Error(w, `{"error":"forbidden: apenas o dono pode excluir o servidor"}`, http.StatusForbidden)
		return
	}

	// Broadcast GUILD_DELETE to all connected members before deleting
	h.hub.BroadcastToGuild(guildID, models.WSEvent{
		Type: "GUILD_DELETE",
		Data: map[string]any{
			"guild_id": guildID,
		},
	})

	// Delete guild (Cascades to channels, roles, members, etc.)
	_, err = h.db.Pool.Exec(r.Context(), "DELETE FROM guilds WHERE id = $1", guildID)
	if err != nil {
		http.Error(w, `{"error":"failed to delete guild"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"success":  true,
		"guild_id": guildID,
	})
}

func (h *GuildHandler) Leave(w http.ResponseWriter, r *http.Request) {
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

	var ownerID uuid.UUID
	err = h.db.Pool.QueryRow(r.Context(), "SELECT owner_id FROM guilds WHERE id = $1", guildID).Scan(&ownerID)
	if err != nil {
		http.Error(w, `{"error":"guild not found"}`, http.StatusNotFound)
		return
	}

	if userID == ownerID {
		http.Error(w, `{"error":"O dono do servidor não pode sair sem antes transferir a posse ou excluir o servidor"}`, http.StatusBadRequest)
		return
	}

	_, err = h.db.Pool.Exec(r.Context(), "DELETE FROM guild_members WHERE guild_id = $1 AND user_id = $2", guildID, userID)
	if err != nil {
		http.Error(w, `{"error":"failed to leave guild"}`, http.StatusInternalServerError)
		return
	}

	// Remove from hub and broadcast member remove
	h.hub.RemoveGuildMember(guildID, userID)
	h.hub.BroadcastToGuild(guildID, models.WSEvent{
		Type: "GUILD_MEMBER_REMOVE",
		Data: map[string]any{
			"guild_id": guildID,
			"user_id":  userID,
		},
	})

	// Also send GUILD_DELETE specifically to the user so their sidebar removes the server immediately
	h.hub.SendToUser(userID, models.WSEvent{
		Type: "GUILD_DELETE",
		Data: map[string]any{
			"guild_id": guildID,
		},
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"success": true, "guild_id": guildID})
}

func (h *GuildHandler) ToggleMute(w http.ResponseWriter, r *http.Request) {
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

	var isMuted bool
	err = h.db.Pool.QueryRow(r.Context(), `
		UPDATE guild_members
		SET is_muted = NOT COALESCE(is_muted, false)
		WHERE guild_id = $1 AND user_id = $2
		RETURNING COALESCE(is_muted, false)
	`, guildID, userID).Scan(&isMuted)
	if err != nil {
		http.Error(w, `{"error":"failed to toggle server mute or member not found"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"success": true, "guild_id": guildID, "is_muted": isMuted})
}

func (h *GuildHandler) LogAudit(ctx context.Context, guildID, actorID uuid.UUID, actionType string, targetID *uuid.UUID, details map[string]any) {
	if details == nil {
		details = make(map[string]any)
	}
	detailsJSON, err := json.Marshal(details)
	if err != nil {
		detailsJSON = []byte("{}")
	}

	var entry models.AuditLog
	entry.GuildID = guildID
	entry.ActorID = actorID
	entry.ActionType = actionType
	entry.TargetID = targetID
	entry.Details = details

	query := `
		INSERT INTO audit_logs (guild_id, actor_id, action_type, target_id, details)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, created_at
	`
	err = h.db.Pool.QueryRow(ctx, query, guildID, actorID, actionType, targetID, detailsJSON).Scan(&entry.ID, &entry.CreatedAt)
	if err != nil {
		return
	}

	// Fetch actor details
	var actor models.UserPublic
	_ = h.db.Pool.QueryRow(ctx, `SELECT id, username, display_name, avatar_url, banner_url, bio, status, custom_status FROM users WHERE id = $1`, actorID).Scan(
		&actor.ID, &actor.Username, &actor.DisplayName, &actor.AvatarURL, &actor.BannerURL, &actor.Bio, &actor.Status, &actor.CustomStatus,
	)
	entry.Actor = &actor

	// If target is a user, fetch target user details
	if targetID != nil {
		var tu models.UserPublic
		err = h.db.Pool.QueryRow(ctx, `SELECT id, username, display_name, avatar_url, banner_url, bio, status, custom_status FROM users WHERE id = $1`, *targetID).Scan(
			&tu.ID, &tu.Username, &tu.DisplayName, &tu.AvatarURL, &tu.BannerURL, &tu.Bio, &tu.Status, &tu.CustomStatus,
		)
		if err == nil {
			entry.TargetUser = &tu
		}
	}

	h.hub.BroadcastToGuild(guildID, models.WSEvent{
		Type: models.EventAuditLogCreate,
		Data: entry,
	})
}

func (h *GuildHandler) ListAuditLogs(w http.ResponseWriter, r *http.Request) {
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

	// Check if user has admin/view audit log permissions
	var ownerID uuid.UUID
	err = h.db.Pool.QueryRow(r.Context(), "SELECT owner_id FROM guilds WHERE id = $1", guildID).Scan(&ownerID)
	if err != nil {
		http.Error(w, `{"error":"guild not found"}`, http.StatusNotFound)
		return
	}

	if userID != ownerID {
		var userPerms int64 = 0
		rows, err := h.db.Pool.Query(r.Context(), `
			SELECT gr.permissions
			FROM guild_roles gr
			INNER JOIN guild_member_roles gmr ON gmr.role_id = gr.id
			WHERE gmr.guild_id = $1 AND gmr.user_id = $2
		`, guildID, userID)
		if err == nil {
			for rows.Next() {
				var p int64
				if rows.Scan(&p) == nil {
					userPerms |= p
				}
			}
			rows.Close()
		}

		hasAccess := (userPerms&models.PermAdministrator) != 0 || (userPerms&models.PermManageGuild) != 0
		if !hasAccess {
			http.Error(w, `{"error":"você não tem permissão para visualizar o registro de auditoria"}`, http.StatusForbidden)
			return
		}
	}

	// Parse query params
	actionFilter := r.URL.Query().Get("action")
	beforeStr := r.URL.Query().Get("before")

	query := `
		SELECT 
			a.id, a.guild_id, a.actor_id, a.action_type, a.target_id, a.details, a.created_at,
			u.username, u.display_name, u.avatar_url, u.status,
			tu.username, tu.display_name, tu.avatar_url, tu.status
		FROM audit_logs a
		INNER JOIN users u ON u.id = a.actor_id
		LEFT JOIN users tu ON tu.id = a.target_id
		WHERE a.guild_id = $1
	`
	args := []any{guildID}
	argIdx := 2

	if actionFilter != "" && actionFilter != "ALL" {
		query += ` AND a.action_type = $` + string(rune('0'+argIdx))
		args = append(args, actionFilter)
		argIdx++
	}

	if beforeStr != "" {
		if beforeTime, err := time.Parse(time.RFC3339, beforeStr); err == nil {
			query += ` AND a.created_at < $` + string(rune('0'+argIdx))
			args = append(args, beforeTime)
			argIdx++
		}
	}

	query += ` ORDER BY a.created_at DESC LIMIT 50`

	rows, err := h.db.Pool.Query(r.Context(), query, args...)
	if err != nil {
		http.Error(w, `{"error":"failed to fetch audit logs"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	logs := make([]models.AuditLog, 0)
	for rows.Next() {
		var l models.AuditLog
		var detailsJSON []byte
		var actor models.UserPublic
		var tuName, tuDisp, tuAv, tuSt *string

		err := rows.Scan(
			&l.ID, &l.GuildID, &l.ActorID, &l.ActionType, &l.TargetID, &detailsJSON, &l.CreatedAt,
			&actor.Username, &actor.DisplayName, &actor.AvatarURL, &actor.Status,
			&tuName, &tuDisp, &tuAv, &tuSt,
		)
		if err == nil {
			actor.ID = l.ActorID
			l.Actor = &actor
			if detailsJSON != nil {
				_ = json.Unmarshal(detailsJSON, &l.Details)
			}
			if l.TargetID != nil && tuName != nil {
				l.TargetUser = &models.UserPublic{
					ID:          *l.TargetID,
					Username:    *tuName,
					DisplayName: *tuDisp,
					AvatarURL:   *tuAv,
					Status:      *tuSt,
				}
			}
			logs = append(logs, l)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(logs)
}


