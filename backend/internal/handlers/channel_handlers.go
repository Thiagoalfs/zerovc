package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/zerovc/zerovc/backend/internal/audit"
	"github.com/zerovc/zerovc/backend/internal/auth"
	"github.com/zerovc/zerovc/backend/internal/database"
	"github.com/zerovc/zerovc/backend/internal/gateway"
	"github.com/zerovc/zerovc/backend/internal/models"
	"github.com/zerovc/zerovc/backend/internal/voice"
)

type ChannelHandler struct {
	db      *database.DB
	hub     *gateway.Hub
	livekit *voice.LiveKitService
}

func NewChannelHandler(db *database.DB, hub *gateway.Hub, livekit *voice.LiveKitService) *ChannelHandler {
	return &ChannelHandler{
		db:      db,
		hub:     hub,
		livekit: livekit,
	}
}

type CreateChannelRequest struct {
	Name       string             `json:"name"`
	Type       models.ChannelType `json:"type"` // "text", "voice", "category"
	CategoryID *uuid.UUID         `json:"category_id,omitempty"`
	Topic      string             `json:"topic"`
	IsPrivate  bool               `json:"is_private"`
	RoleIDs    []uuid.UUID        `json:"role_ids,omitempty"`
}

type UpdateChannelRequest struct {
	Name          *string     `json:"name,omitempty"`
	Topic         *string     `json:"topic,omitempty"`
	Position      *int        `json:"position,omitempty"`
	CategoryID    *uuid.UUID  `json:"category_id,omitempty"`
	ClearCategory *bool       `json:"clear_category,omitempty"`
	IsPrivate     *bool       `json:"is_private,omitempty"`
	RoleIDs       []uuid.UUID `json:"role_ids,omitempty"`
}

type ReorderChannelItem struct {
	ID            uuid.UUID  `json:"id"`
	Position      int        `json:"position"`
	CategoryID    *uuid.UUID `json:"category_id,omitempty"`
	ClearCategory bool       `json:"clear_category,omitempty"`
}

type ReorderChannelsRequest struct {
	Channels   []ReorderChannelItem `json:"channels,omitempty"`
	ChannelIDs []uuid.UUID          `json:"channel_ids,omitempty"`
}

func (h *ChannelHandler) Create(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	guildIDStr := chi.URLParam(r, "guildID")
	guildID, err := uuid.Parse(guildIDStr)
	if err != nil {
		http.Error(w, `{"error":"invalid guild id"}`, http.StatusBadRequest)
		return
	}

	var isMember bool
	checkQuery := `SELECT EXISTS(SELECT 1 FROM guild_members WHERE guild_id = $1 AND user_id = $2)`
	if err := h.db.Pool.QueryRow(r.Context(), checkQuery, guildID, userID).Scan(&isMember); err != nil || !isMember {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}

	var req CreateChannelRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Name == "" {
		http.Error(w, `{"error":"channel name required"}`, http.StatusBadRequest)
		return
	}

	if req.Type != models.ChannelTypeText && req.Type != models.ChannelTypeVoice && req.Type != models.ChannelTypeCategory {
		req.Type = models.ChannelTypeText
	}

	// Categories cannot have a parent category
	if req.Type == models.ChannelTypeCategory {
		req.CategoryID = nil
	}

	var channel models.Channel
	query := `
		INSERT INTO channels (guild_id, name, type, category_id, topic, is_private)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id, guild_id, name, type, category_id, topic, position, is_private, created_at
	`
	err = h.db.Pool.QueryRow(r.Context(), query, guildID, req.Name, req.Type, req.CategoryID, req.Topic, req.IsPrivate).Scan(
		&channel.ID, &channel.GuildID, &channel.Name, &channel.Type, &channel.CategoryID, &channel.Topic, &channel.Position, &channel.IsPrivate, &channel.CreatedAt,
	)
	if err != nil {
		http.Error(w, `{"error":"failed to create channel"}`, http.StatusInternalServerError)
		return
	}

	// Insert role access if private
	if req.IsPrivate && len(req.RoleIDs) > 0 {
		for _, roleID := range req.RoleIDs {
			h.db.Pool.Exec(r.Context(), "INSERT INTO channel_role_access (channel_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", channel.ID, roleID)
		}
		channel.RoleIDs = req.RoleIDs
	}

	h.hub.BroadcastToGuild(guildID, models.WSEvent{
		Type: models.EventChannelCreate,
		Data: channel,
	})

	audit.Log(r.Context(), h.db, h.hub, guildID, userID, "CHANNEL_CREATE", &channel.ID, map[string]any{
		"name": channel.Name,
		"type": channel.Type,
	})

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(channel)
}

func (h *ChannelHandler) Update(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	channelIDStr := chi.URLParam(r, "id")
	channelID, err := uuid.Parse(channelIDStr)
	if err != nil {
		http.Error(w, `{"error":"invalid channel id"}`, http.StatusBadRequest)
		return
	}

	var guildID, ownerID uuid.UUID
	err = h.db.Pool.QueryRow(r.Context(), "SELECT c.guild_id, g.owner_id FROM channels c INNER JOIN guilds g ON g.id = c.guild_id WHERE c.id = $1", channelID).Scan(&guildID, &ownerID)
	if err != nil || ownerID != userID {
		http.Error(w, `{"error":"forbidden: only server owner can edit channels"}`, http.StatusForbidden)
		return
	}

	var req UpdateChannelRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request"}`, http.StatusBadRequest)
		return
	}

	var channel models.Channel
	var query string

	if req.ClearCategory != nil && *req.ClearCategory {
		query = `
			UPDATE channels
			SET name = COALESCE($1, name),
			    topic = COALESCE($2, topic),
			    position = COALESCE($3, position),
			    is_private = COALESCE($4, is_private),
			    category_id = NULL
			WHERE id = $5
			RETURNING id, guild_id, name, type, category_id, topic, position, is_private, created_at
		`
		err = h.db.Pool.QueryRow(r.Context(), query, req.Name, req.Topic, req.Position, req.IsPrivate, channelID).Scan(
			&channel.ID, &channel.GuildID, &channel.Name, &channel.Type, &channel.CategoryID, &channel.Topic, &channel.Position, &channel.IsPrivate, &channel.CreatedAt,
		)
	} else if req.CategoryID != nil {
		query = `
			UPDATE channels
			SET name = COALESCE($1, name),
			    topic = COALESCE($2, topic),
			    position = COALESCE($3, position),
			    is_private = COALESCE($4, is_private),
			    category_id = $5
			WHERE id = $6
			RETURNING id, guild_id, name, type, category_id, topic, position, is_private, created_at
		`
		err = h.db.Pool.QueryRow(r.Context(), query, req.Name, req.Topic, req.Position, req.IsPrivate, req.CategoryID, channelID).Scan(
			&channel.ID, &channel.GuildID, &channel.Name, &channel.Type, &channel.CategoryID, &channel.Topic, &channel.Position, &channel.IsPrivate, &channel.CreatedAt,
		)
	} else {
		query = `
			UPDATE channels
			SET name = COALESCE($1, name),
			    topic = COALESCE($2, topic),
			    position = COALESCE($3, position),
			    is_private = COALESCE($4, is_private)
			WHERE id = $5
			RETURNING id, guild_id, name, type, category_id, topic, position, is_private, created_at
		`
		err = h.db.Pool.QueryRow(r.Context(), query, req.Name, req.Topic, req.Position, req.IsPrivate, channelID).Scan(
			&channel.ID, &channel.GuildID, &channel.Name, &channel.Type, &channel.CategoryID, &channel.Topic, &channel.Position, &channel.IsPrivate, &channel.CreatedAt,
		)
	}

	if err != nil {
		http.Error(w, `{"error":"failed to update channel"}`, http.StatusInternalServerError)
		return
	}

	// Update role access if provided
	if req.RoleIDs != nil {
		h.db.Pool.Exec(r.Context(), "DELETE FROM channel_role_access WHERE channel_id = $1", channelID)
		for _, roleID := range req.RoleIDs {
			h.db.Pool.Exec(r.Context(), "INSERT INTO channel_role_access (channel_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", channelID, roleID)
		}
		channel.RoleIDs = req.RoleIDs
	}

	h.hub.BroadcastToGuild(guildID, models.WSEvent{
		Type: models.EventChannelUpdate,
		Data: channel,
	})

	audit.Log(r.Context(), h.db, h.hub, guildID, userID, "CHANNEL_UPDATE", &channel.ID, map[string]any{
		"name":  channel.Name,
		"topic": channel.Topic,
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(channel)
}

func (h *ChannelHandler) Delete(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	channelIDStr := chi.URLParam(r, "id")
	channelID, err := uuid.Parse(channelIDStr)
	if err != nil {
		http.Error(w, `{"error":"invalid channel id"}`, http.StatusBadRequest)
		return
	}

	var guildID, ownerID uuid.UUID
	var channelType models.ChannelType
	err = h.db.Pool.QueryRow(r.Context(), "SELECT c.guild_id, g.owner_id, c.type FROM channels c INNER JOIN guilds g ON g.id = c.guild_id WHERE c.id = $1", channelID).Scan(&guildID, &ownerID, &channelType)
	if err != nil || ownerID != userID {
		http.Error(w, `{"error":"forbidden: only server owner can delete channels"}`, http.StatusForbidden)
		return
	}

	// If category is being deleted, move child channels to root (category_id = NULL)
	if channelType == models.ChannelTypeCategory {
		h.db.Pool.Exec(r.Context(), "UPDATE channels SET category_id = NULL WHERE category_id = $1", channelID)
	}

	_, err = h.db.Pool.Exec(r.Context(), "DELETE FROM channels WHERE id = $1", channelID)
	if err != nil {
		http.Error(w, `{"error":"failed to delete channel"}`, http.StatusInternalServerError)
		return
	}

	h.hub.BroadcastToGuild(guildID, models.WSEvent{
		Type: models.EventChannelDelete,
		Data: map[string]any{"id": channelID, "guild_id": guildID},
	})

	audit.Log(r.Context(), h.db, h.hub, guildID, userID, "CHANNEL_DELETE", &channelID, map[string]any{
		"type": channelType,
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"success": true, "id": channelID})
}

func (h *ChannelHandler) Reorder(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	guildIDStr := chi.URLParam(r, "guildID")
	guildID, err := uuid.Parse(guildIDStr)
	if err != nil {
		http.Error(w, `{"error":"invalid guild id"}`, http.StatusBadRequest)
		return
	}

	var isMember bool
	checkQuery := `SELECT EXISTS(SELECT 1 FROM guild_members WHERE guild_id = $1 AND user_id = $2)`
	if err := h.db.Pool.QueryRow(r.Context(), checkQuery, guildID, userID).Scan(&isMember); err != nil || !isMember {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}

	var req ReorderChannelsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request"}`, http.StatusBadRequest)
		return
	}

	// Granular reorder with category_id and position
	if len(req.Channels) > 0 {
		for _, item := range req.Channels {
			if item.ClearCategory {
				h.db.Pool.Exec(r.Context(), "UPDATE channels SET position = $1, category_id = NULL WHERE id = $2 AND guild_id = $3", item.Position, item.ID, guildID)
			} else if item.CategoryID != nil {
				h.db.Pool.Exec(r.Context(), "UPDATE channels SET position = $1, category_id = $2 WHERE id = $3 AND guild_id = $4", item.Position, item.CategoryID, item.ID, guildID)
			} else {
				h.db.Pool.Exec(r.Context(), "UPDATE channels SET position = $1 WHERE id = $2 AND guild_id = $3", item.Position, item.ID, guildID)
			}
		}
	} else if len(req.ChannelIDs) > 0 {
		// Fallback simple reorder
		for idx, id := range req.ChannelIDs {
			h.db.Pool.Exec(r.Context(), "UPDATE channels SET position = $1 WHERE id = $2 AND guild_id = $3", idx, id, guildID)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"success": true})
}

type JoinVoiceResponse struct {
	Token      string `json:"token"`
	LiveKitURL string `json:"livekit_url"`
	RoomName   string `json:"room_name"`
}

func (h *ChannelHandler) JoinVoice(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	channelIDStr := chi.URLParam(r, "id")
	channelID, err := uuid.Parse(channelIDStr)
	if err != nil {
		http.Error(w, `{"error":"invalid channel id"}`, http.StatusBadRequest)
		return
	}

	var guildID uuid.UUID
	var channelType models.ChannelType
	var isPrivate bool
	err = h.db.Pool.QueryRow(r.Context(), "SELECT guild_id, type, is_private FROM channels WHERE id = $1", channelID).Scan(&guildID, &channelType, &isPrivate)
	if err != nil || channelType != models.ChannelTypeVoice {
		http.Error(w, `{"error":"voice channel not found"}`, http.StatusNotFound)
		return
	}

	var isMember bool
	checkQuery := `SELECT EXISTS(SELECT 1 FROM guild_members WHERE guild_id = $1 AND user_id = $2)`
	if err := h.db.Pool.QueryRow(r.Context(), checkQuery, guildID, userID).Scan(&isMember); err != nil || !isMember {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}

	if isPrivate {
		var hasAccess bool
		privateCheckQuery := `
			SELECT EXISTS(
				SELECT 1 FROM guilds WHERE id = $1 AND owner_id = $2
				UNION
				SELECT 1 FROM channel_role_access cra
				INNER JOIN guild_member_roles gmr ON gmr.role_id = cra.role_id
				WHERE cra.channel_id = $3 AND gmr.guild_id = $1 AND gmr.user_id = $2
			)
		`
		if err := h.db.Pool.QueryRow(r.Context(), privateCheckQuery, guildID, userID, channelID).Scan(&hasAccess); err != nil || !hasAccess {
			http.Error(w, `{"error":"forbidden: you do not have access to this private channel"}`, http.StatusForbidden)
			return
		}
	}

	var user models.User
	err = h.db.Pool.QueryRow(r.Context(), "SELECT id, username, display_name, avatar_url, banner_url, bio, status, custom_status FROM users WHERE id = $1", userID).Scan(
		&user.ID, &user.Username, &user.DisplayName, &user.AvatarURL, &user.BannerURL, &user.Bio, &user.Status, &user.CustomStatus,
	)
	if err != nil {
		http.Error(w, `{"error":"user not found"}`, http.StatusNotFound)
		return
	}

	voiceSessionQuery := `
		INSERT INTO voice_sessions (channel_id, user_id)
		VALUES ($1, $2)
		ON CONFLICT (user_id) DO UPDATE
		SET channel_id = EXCLUDED.channel_id, joined_at = CURRENT_TIMESTAMP
		RETURNING id, channel_id, user_id, is_muted, is_deafened, is_screensharing, joined_at
	`
	var session models.VoiceSession
	err = h.db.Pool.QueryRow(r.Context(), voiceSessionQuery, channelID, userID).Scan(
		&session.ID, &session.ChannelID, &session.UserID, &session.IsMuted, &session.IsDeafened, &session.IsScreensharing, &session.JoinedAt,
	)
	if err != nil {
		http.Error(w, `{"error":"failed to save voice session"}`, http.StatusInternalServerError)
		return
	}
	session.User = user.ToPublic()

	roomName := channelID.String()
	metaJSON, _ := json.Marshal(map[string]any{
		"avatar_url":    user.AvatarURL,
		"display_name":  user.DisplayName,
		"username":      user.Username,
		"custom_status": user.CustomStatus,
	})
	token, err := h.livekit.GenerateJoinToken(roomName, userID, user.Username, string(metaJSON), true)
	if err != nil {
		http.Error(w, `{"error":"failed to generate voice token"}`, http.StatusInternalServerError)
		return
	}

	h.hub.BroadcastToGuild(guildID, models.WSEvent{
		Type: models.EventVoiceStateUpdate,
		Data: map[string]any{
			"action":  "join",
			"session": session,
		},
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(JoinVoiceResponse{
		Token:      token,
		LiveKitURL: h.livekit.GetPublicURL(),
		RoomName:   roomName,
	})
}

func (h *ChannelHandler) LeaveVoice(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	channelIDStr := chi.URLParam(r, "id")
	channelID, err := uuid.Parse(channelIDStr)
	if err != nil {
		http.Error(w, `{"error":"invalid channel id"}`, http.StatusBadRequest)
		return
	}

	var guildID uuid.UUID
	h.db.Pool.QueryRow(r.Context(), "SELECT guild_id FROM channels WHERE id = $1", channelID).Scan(&guildID)

	_, err = h.db.Pool.Exec(r.Context(), "DELETE FROM voice_sessions WHERE user_id = $1", userID)
	if err != nil {
		http.Error(w, `{"error":"failed to leave voice"}`, http.StatusInternalServerError)
		return
	}

	if guildID != uuid.Nil {
		h.hub.BroadcastToGuild(guildID, models.WSEvent{
			Type: models.EventVoiceStateUpdate,
			Data: map[string]any{
				"action":     "leave",
				"channel_id": channelID,
				"user_id":    userID,
			},
		})
	}

	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"success":true}`))
}

type UpdateVoiceStateRequest struct {
	IsMuted         *bool `json:"is_muted,omitempty"`
	IsDeafened      *bool `json:"is_deafened,omitempty"`
	IsScreensharing *bool `json:"is_screensharing,omitempty"`
}

func (h *ChannelHandler) UpdateVoiceState(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	channelIDStr := chi.URLParam(r, "id")
	channelID, err := uuid.Parse(channelIDStr)
	if err != nil {
		http.Error(w, `{"error":"invalid channel id"}`, http.StatusBadRequest)
		return
	}

	var req UpdateVoiceStateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request"}`, http.StatusBadRequest)
		return
	}

	var guildID uuid.UUID
	h.db.Pool.QueryRow(r.Context(), "SELECT guild_id FROM channels WHERE id = $1", channelID).Scan(&guildID)

	query := `
		UPDATE voice_sessions
		SET is_muted = COALESCE($1, is_muted),
		    is_deafened = COALESCE($2, is_deafened),
		    is_screensharing = COALESCE($3, is_screensharing)
		WHERE user_id = $4 AND channel_id = $5
		RETURNING id, channel_id, user_id, is_muted, is_deafened, is_screensharing, joined_at
	`
	var session models.VoiceSession
	err = h.db.Pool.QueryRow(r.Context(), query, req.IsMuted, req.IsDeafened, req.IsScreensharing, userID, channelID).Scan(
		&session.ID, &session.ChannelID, &session.UserID, &session.IsMuted, &session.IsDeafened, &session.IsScreensharing, &session.JoinedAt,
	)
	if err != nil {
		http.Error(w, `{"error":"session not found"}`, http.StatusNotFound)
		return
	}

	h.hub.BroadcastToGuild(guildID, models.WSEvent{
		Type: models.EventVoiceStateUpdate,
		Data: map[string]any{
			"action":  "update",
			"session": session,
		},
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(session)
}

type AdminUpdateVoiceStateRequest struct {
	IsMuted    *bool `json:"is_muted,omitempty"`
	IsDeafened *bool `json:"is_deafened,omitempty"`
	Disconnect *bool `json:"disconnect,omitempty"`
}

func (h *ChannelHandler) AdminUpdateVoiceState(w http.ResponseWriter, r *http.Request) {
	adminID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	channelIDStr := chi.URLParam(r, "channelID")
	channelID, err := uuid.Parse(channelIDStr)
	if err != nil {
		http.Error(w, `{"error":"invalid channel id"}`, http.StatusBadRequest)
		return
	}

	targetUserIDStr := chi.URLParam(r, "userID")
	targetUserID, err := uuid.Parse(targetUserIDStr)
	if err != nil {
		http.Error(w, `{"error":"invalid user id"}`, http.StatusBadRequest)
		return
	}

	var guildID uuid.UUID
	var ownerID uuid.UUID
	err = h.db.Pool.QueryRow(r.Context(), `
		SELECT c.guild_id, g.owner_id 
		FROM channels c 
		JOIN guilds g ON g.id = c.guild_id 
		WHERE c.id = $1
	`, channelID).Scan(&guildID, &ownerID)
	if err != nil {
		http.Error(w, `{"error":"channel or guild not found"}`, http.StatusNotFound)
		return
	}

	isOwner := adminID == ownerID
	if !isOwner && adminID != targetUserID {
		var perms int64
		h.db.Pool.QueryRow(r.Context(), `
			SELECT COALESCE(BIT_OR(r.permissions), 0)
			FROM guild_members gm
			JOIN guild_member_roles gmr ON gmr.guild_id = gm.guild_id AND gmr.user_id = gm.user_id
			JOIN guild_roles r ON r.id = gmr.role_id
			WHERE gm.guild_id = $1 AND gm.user_id = $2
		`, guildID, adminID).Scan(&perms)

		hasAdmin := (perms & models.PermAdministrator) != 0
		hasMute := (perms & models.PermMuteVoice) != 0 || (perms & models.PermMuteMembers) != 0

		if !hasAdmin && !hasMute {
			http.Error(w, `{"error":"forbidden: insufficient voice moderation permissions"}`, http.StatusForbidden)
			return
		}
	}

	var req AdminUpdateVoiceStateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request payload"}`, http.StatusBadRequest)
		return
	}

	if req.Disconnect != nil && *req.Disconnect {
		h.db.Pool.Exec(r.Context(), "DELETE FROM voice_sessions WHERE user_id = $1 AND channel_id = $2", targetUserID, channelID)
		h.hub.BroadcastToGuild(guildID, models.WSEvent{
			Type: models.EventVoiceStateUpdate,
			Data: map[string]any{
				"action":     "leave",
				"channel_id": channelID,
				"user_id":    targetUserID,
				"forced":     true,
			},
		})
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success":true,"action":"disconnect"}`))
		return
	}

	query := `
		UPDATE voice_sessions
		SET is_muted = COALESCE($1, is_muted),
		    is_deafened = COALESCE($2, is_deafened)
		WHERE user_id = $3 AND channel_id = $4
		RETURNING id, channel_id, user_id, is_muted, is_deafened, is_screensharing, joined_at
	`
	var session models.VoiceSession
	err = h.db.Pool.QueryRow(r.Context(), query, req.IsMuted, req.IsDeafened, targetUserID, channelID).Scan(
		&session.ID, &session.ChannelID, &session.UserID, &session.IsMuted, &session.IsDeafened, &session.IsScreensharing, &session.JoinedAt,
	)
	if err != nil {
		http.Error(w, `{"error":"participant is not in this voice channel"}`, http.StatusNotFound)
		return
	}

	h.hub.BroadcastToGuild(guildID, models.WSEvent{
		Type: models.EventVoiceStateUpdate,
		Data: map[string]any{
			"action":  "update",
			"session": session,
			"forced":  true,
		},
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(session)
}