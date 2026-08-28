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

	// 1. Verify channel & get guild ID
	var guildID uuid.UUID
	err = h.db.Pool.QueryRow(r.Context(), "SELECT guild_id FROM channels WHERE id = $1", channelID).Scan(&guildID)
	if err != nil {
		http.Error(w, `{"error":"channel not found"}`, http.StatusNotFound)
		return
	}

	// 2. Fetch author details
	var author models.UserPublic
	err = h.db.Pool.QueryRow(r.Context(), "SELECT id, username, avatar_url, status, custom_status FROM users WHERE id = $1", userID).Scan(
		&author.ID, &author.Username, &author.AvatarURL, &author.Status, &author.CustomStatus,
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
		RETURNING id, channel_id, author_id, content, reply_to_id, is_pinned, created_at, updated_at
	`
	err = h.db.Pool.QueryRow(r.Context(), query, channelID, userID, req.Content, attachmentsJSON, req.ReplyToID).Scan(
		&msg.ID, &msg.ChannelID, &msg.AuthorID, &msg.Content, &msg.ReplyToID, &msg.IsPinned, &msg.CreatedAt, &msg.UpdatedAt,
	)
	if err != nil {
		http.Error(w, `{"error":"failed to save message"}`, http.StatusInternalServerError)
		return
	}
	msg.Author = author
	msg.Attachments = req.Attachments

	// 4. Broadcast via WebSocket Gateway
	h.hub.BroadcastToGuild(guildID, models.WSEvent{
		Type: models.EventMessageCreate,
		Data: msg,
	})

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(msg)
}

func (h *MessageHandler) List(w http.ResponseWriter, r *http.Request) {
	_, ok := auth.GetUserIDFromContext(r.Context())
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
			SELECT m.id, m.channel_id, m.author_id, m.content, m.attachments, m.reply_to_id, m.is_pinned, m.created_at, m.updated_at,
			       u.username, u.avatar_url, u.status, u.custom_status
			FROM messages m
			INNER JOIN users u ON u.id = m.author_id
			WHERE m.channel_id = $1 AND m.created_at < $2
			ORDER BY m.created_at DESC
			LIMIT $3
		`
		rowsArgs = []any{channelID, beforeTime, limit}
	} else {
		query = `
			SELECT m.id, m.channel_id, m.author_id, m.content, m.attachments, m.reply_to_id, m.is_pinned, m.created_at, m.updated_at,
			       u.username, u.avatar_url, u.status, u.custom_status
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
			&m.ID, &m.ChannelID, &m.AuthorID, &m.Content, &attachmentsJSON, &m.ReplyToID, &m.IsPinned, &m.CreatedAt, &m.UpdatedAt,
			&author.Username, &author.AvatarURL, &author.Status, &author.CustomStatus,
		); err != nil {
			continue
		}
		author.ID = m.AuthorID
		m.Author = author
		json.Unmarshal(attachmentsJSON, &m.Attachments)
		messages = append(messages, m)
	}

	// Invert so client receives in chronological order (oldest to newest)
	for i, j := 0, len(messages)-1; i < j; i, j = i+1, j-1 {
		messages[i], messages[j] = messages[j], messages[i]
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(messages)
}
