package handlers

import (
	"encoding/json"
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

type MessageHandler struct {
	db  *database.DB
	hub *gateway.Hub
}

func NewMessageHandler(db *database.DB, hub *gateway.Hub) *MessageHandler {
	return &MessageHandler{
		db:  db,
		hub: hub,
	}
}

type SendMessageRequest struct {
	Content     string              `json:"content"`
	Attachments []models.Attachment `json:"attachments"`
	ReplyToID   *uuid.UUID          `json:"reply_to_id,omitempty"`
}

type UpdateMessageRequest struct {
	Content string `json:"content"`
}

func (h *MessageHandler) Send(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
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

	var req SendMessageRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Content == "" {
		http.Error(w, `{"error":"message content cannot be empty"}`, http.StatusBadRequest)
		return
	}

	// 1. Verify channel & membership
	var guildID uuid.UUID
	err = h.db.Pool.QueryRow(r.Context(), "SELECT guild_id FROM channels WHERE id = $1", channelID).Scan(&guildID)
	if err != nil {
		http.Error(w, `{"error":"channel not found"}`, http.StatusNotFound)
		return
	}

	var isMember bool
	checkQuery := `SELECT EXISTS(SELECT 1 FROM guild_members WHERE guild_id = $1 AND user_id = $2)`
	if err := h.db.Pool.QueryRow(r.Context(), checkQuery, guildID, userID).Scan(&isMember); err != nil || !isMember {
		http.Error(w, `{"error":"forbidden: you must be a member of this server to post messages"}`, http.StatusForbidden)
		return
	}

	// 2. Fetch author details
	var author models.UserPublic
	err = h.db.Pool.QueryRow(r.Context(), "SELECT id, username, display_name, avatar_url, banner_url, bio, status, custom_status FROM users WHERE id = $1", userID).Scan(
		&author.ID, &author.Username, &author.DisplayName, &author.AvatarURL, &author.BannerURL, &author.Bio, &author.Status, &author.CustomStatus,
	)
	if err != nil {
		http.Error(w, `{"error":"author not found"}`, http.StatusNotFound)
		return
	}

	// 3. Insert message
	attachmentsJSON, _ := json.Marshal(req.Attachments)
	var msg models.Message
	query := `
		INSERT INTO messages (channel_id, author_id, content, attachments, reply_to_id)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, channel_id, author_id, content, reply_to_id, is_pinned, is_edited, edited_at, created_at, updated_at
	`
	err = h.db.Pool.QueryRow(r.Context(), query, channelID, userID, req.Content, attachmentsJSON, req.ReplyToID).Scan(
		&msg.ID, &msg.ChannelID, &msg.AuthorID, &msg.Content, &msg.ReplyToID, &msg.IsPinned, &msg.IsEdited, &msg.EditedAt, &msg.CreatedAt, &msg.UpdatedAt,
	)
	if err != nil {
		http.Error(w, `{"error":"failed to save message"}`, http.StatusInternalServerError)
		return
	}
	msg.Author = author
	msg.Attachments = req.Attachments

	// 4. Broadcast via WebSocket
	h.hub.BroadcastToGuild(guildID, models.WSEvent{
		Type: models.EventMessageCreate,
		Data: msg,
	})

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(msg)
}

func (h *MessageHandler) Update(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	messageIDStr := chi.URLParam(r, "messageID")
	messageID, err := uuid.Parse(messageIDStr)
	if err != nil {
		http.Error(w, `{"error":"invalid message id"}`, http.StatusBadRequest)
		return
	}

	var req UpdateMessageRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Content == "" {
		http.Error(w, `{"error":"content cannot be empty"}`, http.StatusBadRequest)
		return
	}

	// Fetch message and verify author
	var msg models.Message
	var guildID uuid.UUID
	var attachmentsJSON []byte
	checkQuery := `
		SELECT m.id, m.channel_id, m.author_id, m.reply_to_id, m.is_pinned, m.created_at, c.guild_id, m.attachments
		FROM messages m
		INNER JOIN channels c ON c.id = m.channel_id
		WHERE m.id = $1
	`
	err = h.db.Pool.QueryRow(r.Context(), checkQuery, messageID).Scan(
		&msg.ID, &msg.ChannelID, &msg.AuthorID, &msg.ReplyToID, &msg.IsPinned, &msg.CreatedAt, &guildID, &attachmentsJSON,
	)
	if err != nil {
		http.Error(w, `{"error":"message not found"}`, http.StatusNotFound)
		return
	}

	if msg.AuthorID != userID {
		http.Error(w, `{"error":"forbidden: only the author can edit this message"}`, http.StatusForbidden)
		return
	}

	// Update message
	now := time.Now().UTC()
	updateQuery := `
		UPDATE messages
		SET content = $1, is_edited = TRUE, edited_at = $2, updated_at = $2
		WHERE id = $3
		RETURNING content, is_edited, edited_at, updated_at
	`
	err = h.db.Pool.QueryRow(r.Context(), updateQuery, req.Content, now, messageID).Scan(
		&msg.Content, &msg.IsEdited, &msg.EditedAt, &msg.UpdatedAt,
	)
	if err != nil {
		http.Error(w, `{"error":"failed to update message"}`, http.StatusInternalServerError)
		return
	}

	// Author info
	var author models.UserPublic
	h.db.Pool.QueryRow(r.Context(), "SELECT id, username, display_name, avatar_url, banner_url, bio, status, custom_status FROM users WHERE id = $1", userID).Scan(
		&author.ID, &author.Username, &author.DisplayName, &author.AvatarURL, &author.BannerURL, &author.Bio, &author.Status, &author.CustomStatus,
	)
	msg.Author = author
	json.Unmarshal(attachmentsJSON, &msg.Attachments)

	// Broadcast update
	h.hub.BroadcastToGuild(guildID, models.WSEvent{
		Type: models.EventMessageUpdate,
		Data: msg,
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(msg)
}

func (h *MessageHandler) Delete(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	messageIDStr := chi.URLParam(r, "messageID")
	messageID, err := uuid.Parse(messageIDStr)
	if err != nil {
		http.Error(w, `{"error":"invalid message id"}`, http.StatusBadRequest)
		return
	}

	// Check author or guild owner
	var authorID, guildID, channelID uuid.UUID
	var ownerID uuid.UUID
	query := `
		SELECT m.author_id, m.channel_id, c.guild_id, g.owner_id
		FROM messages m
		INNER JOIN channels c ON c.id = m.channel_id
		INNER JOIN guilds g ON g.id = c.guild_id
		WHERE m.id = $1
	`
	err = h.db.Pool.QueryRow(r.Context(), query, messageID).Scan(&authorID, &channelID, &guildID, &ownerID)
	if err != nil {
		http.Error(w, `{"error":"message not found"}`, http.StatusNotFound)
		return
	}

	if authorID != userID && ownerID != userID {
		http.Error(w, `{"error":"forbidden: you do not have permission to delete this message"}`, http.StatusForbidden)
		return
	}

	_, err = h.db.Pool.Exec(r.Context(), "DELETE FROM messages WHERE id = $1", messageID)
	if err != nil {
		http.Error(w, `{"error":"failed to delete message"}`, http.StatusInternalServerError)
		return
	}

	// Broadcast delete event
	h.hub.BroadcastToGuild(guildID, models.WSEvent{
		Type: models.EventMessageDelete,
		Data: map[string]any{
			"id":         messageID,
			"channel_id": channelID,
		},
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"success": true, "id": messageID})
}

func (h *MessageHandler) List(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
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

	// Verify channel & membership
	var guildID uuid.UUID
	err = h.db.Pool.QueryRow(r.Context(), "SELECT guild_id FROM channels WHERE id = $1", channelID).Scan(&guildID)
	if err != nil {
		http.Error(w, `{"error":"channel not found"}`, http.StatusNotFound)
		return
	}

	var isMember bool
	checkQuery := `SELECT EXISTS(SELECT 1 FROM guild_members WHERE guild_id = $1 AND user_id = $2)`
	if err := h.db.Pool.QueryRow(r.Context(), checkQuery, guildID, userID).Scan(&isMember); err != nil || !isMember {
		http.Error(w, `{"error":"forbidden: you must be a member of this server to view messages"}`, http.StatusForbidden)
		return
	}

	limit := 50
	if l := r.URL.Query().Get("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 && parsed <= 100 {
			limit = parsed
		}
	}

	var beforeTime time.Time
	if b := r.URL.Query().Get("before"); b != "" {
		if parsedTime, err := time.Parse(time.RFC3339, b); err == nil {
			beforeTime = parsedTime
		}
	}

	var query string
	var rowsArgs []any

	if !beforeTime.IsZero() {
		query = `
			SELECT m.id, m.channel_id, m.author_id, m.content, m.attachments, m.reply_to_id, m.is_pinned, m.is_edited, m.edited_at, m.created_at, m.updated_at,
			       u.username, u.display_name, u.avatar_url, u.banner_url, u.bio, u.status, u.custom_status
			FROM messages m
			INNER JOIN users u ON u.id = m.author_id
			WHERE m.channel_id = $1 AND m.created_at < $2
			ORDER BY m.created_at DESC
			LIMIT $3
		`
		rowsArgs = []any{channelID, beforeTime, limit}
	} else {
		query = `
			SELECT m.id, m.channel_id, m.author_id, m.content, m.attachments, m.reply_to_id, m.is_pinned, m.is_edited, m.edited_at, m.created_at, m.updated_at,
			       u.username, u.display_name, u.avatar_url, u.banner_url, u.bio, u.status, u.custom_status
			FROM messages m
			INNER JOIN users u ON u.id = m.author_id
			WHERE m.channel_id = $1
			ORDER BY m.created_at DESC
			LIMIT $2
		`
		rowsArgs = []any{channelID, limit}
	}

	rows, err := h.db.Pool.Query(r.Context(), query, rowsArgs...)
	if err != nil {
		http.Error(w, `{"error":"failed to query messages"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	messages := make([]models.Message, 0)
	for rows.Next() {
		var m models.Message
		var attachmentsJSON []byte
		var author models.UserPublic

		if err := rows.Scan(
			&m.ID, &m.ChannelID, &m.AuthorID, &m.Content, &attachmentsJSON, &m.ReplyToID, &m.IsPinned, &m.IsEdited, &m.EditedAt, &m.CreatedAt, &m.UpdatedAt,
			&author.Username, &author.DisplayName, &author.AvatarURL, &author.BannerURL, &author.Bio, &author.Status, &author.CustomStatus,
		); err != nil {
			continue
		}
		author.ID = m.AuthorID
		m.Author = author
		json.Unmarshal(attachmentsJSON, &m.Attachments)
		messages = append(messages, m)
	}

	// Chronological order
	for i, j := 0, len(messages)-1; i < j; i, j = i+1, j-1 {
		messages[i], messages[j] = messages[j], messages[i]
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(messages)
}
