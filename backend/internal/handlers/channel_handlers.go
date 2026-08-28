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
	Name  string             `json:"name"`
	Type  models.ChannelType `json:"type"` // "text" or "voice"
	Topic string             `json:"topic"`
}

type UpdateChannelRequest struct {
	Name     *string `json:"name,omitempty"`
	Topic    *string `json:"topic,omitempty"`
	Position *int    `json:"position,omitempty"`
}

type ReorderChannelsRequest struct {
	ChannelIDs []uuid.UUID `json:"channel_ids"`
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

	if req.Type != models.ChannelTypeText && req.Type != models.ChannelTypeVoice {
		req.Type = models.ChannelTypeText
	}

	var channel models.Channel
	query := `
		INSERT INTO channels (guild_id, name, type, topic)
		VALUES ($1, $2, $3, $4)
		RETURNING id, guild_id, name, type, topic, position, created_at
	`
	err = h.db.Pool.QueryRow(r.Context(), query, guildID, req.Name, req.Type, req.Topic).Scan(
		&channel.ID, &channel.GuildID, &channel.Name, &channel.Type, &channel.Topic, &channel.Position, &channel.CreatedAt,
	)
	if err != nil {
		http.Error(w, `{"error":"failed to create channel"}`, http.StatusInternalServerError)
		return
	}

	h.hub.BroadcastToGuild(guildID, models.WSEvent{
		Type: models.EventChannelCreate,
		Data: channel,
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
	query := `
		UPDATE channels
		SET name = COALESCE($1, name),
		    topic = COALESCE($2, topic),
		    position = COALESCE($3, position)
		WHERE id = $4
		RETURNING id, guild_id, name, type, topic, position, created_at
	`
	err = h.db.Pool.QueryRow(r.Context(), query, req.Name, req.Topic, req.Position, channelID).Scan(
		&channel.ID, &channel.GuildID, &channel.Name, &channel.Type, &channel.Topic, &channel.Position, &channel.CreatedAt,
	)
	if err != nil {
		http.Error(w, `{"error":"failed to update channel"}`, http.StatusInternalServerError)
		return
	}

	h.hub.BroadcastToGuild(guildID, models.WSEvent{
		Type: models.EventChannelUpdate,
		Data: channel,
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
	err = h.db.Pool.QueryRow(r.Context(), "SELECT c.guild_id, g.owner_id FROM channels c INNER JOIN guilds g ON g.id = c.guild_id WHERE c.id = $1", channelID).Scan(&guildID, &ownerID)
	if err != nil || ownerID != userID {
		http.Error(w, `{"error":"forbidden: only server owner can delete channels"}`, http.StatusForbidden)
		return
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

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"success": true, "id": channelID})
}

func (h *ChannelHandler) Reorder(w http.ResponseWriter, r *http.Request) {
	guildIDStr := chi.URLParam(r, "guildID")
	guildID, err := uuid.Parse(guildIDStr)
	if err != nil {
		http.Error(w, `{"error":"invalid guild id"}`, http.StatusBadRequest)
		return
	}

	var req ReorderChannelsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request"}`, http.StatusBadRequest)
		return
	}

	for idx, id := range req.ChannelIDs {
		h.db.Pool.Exec(r.Context(), "UPDATE channels SET position = $1 WHERE id = $2 AND guild_id = $3", idx, id, guildID)
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
	err = h.db.Pool.QueryRow(r.Context(), "SELECT guild_id, type FROM channels WHERE id = $1", channelID).Scan(&guildID, &channelType)
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
