package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/zerovc/zerovc/backend/internal/audit"
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

type ReactionRequest struct {
	Emoji string `json:"emoji"`
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
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request payload"}`, http.StatusBadRequest)
		return
	}

	if len(req.Content) == 0 && len(req.Attachments) == 0 {
		http.Error(w, `{"error":"message content or attachment is required"}`, http.StatusBadRequest)
		return
	}

	if len(req.Content) > 2000 {
		http.Error(w, `{"error":"O limite de tamanho de mensagem é 2.000 caracteres"}`, http.StatusBadRequest)
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
	msg.Reactions = make([]models.MessageReaction, 0)

	// Fetch reply preview if exists
	if msg.ReplyToID != nil {
		var replyID uuid.UUID
		var replyAuthor models.UserPublic
		var replyContent string
		err := h.db.Pool.QueryRow(r.Context(), `
			SELECT m.id, m.content, u.id, u.username, u.display_name, u.avatar_url
			FROM messages m
			JOIN users u ON u.id = m.author_id
			WHERE m.id = $1
		`, *msg.ReplyToID).Scan(&replyID, &replyContent, &replyAuthor.ID, &replyAuthor.Username, &replyAuthor.DisplayName, &replyAuthor.AvatarURL)
		if err == nil {
			msg.ReplyTo = &models.MessageReplyInfo{
				ID:      *msg.ReplyToID,
				Author:  replyAuthor,
				Content: replyContent,
			}
		}
	}

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
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || len(req.Content) == 0 {
		http.Error(w, `{"error":"content is required"}`, http.StatusBadRequest)
		return
	}

	if len(req.Content) > 2000 {
		http.Error(w, `{"error":"O limite de tamanho de mensagem é 2.000 caracteres"}`, http.StatusBadRequest)
		return
	}

	// Check author & update
	var channelID, guildID uuid.UUID
	now := time.Now().UTC()
	query := `
		UPDATE messages m
		SET content = $1, is_edited = true, edited_at = $2, updated_at = $2
		FROM channels c
		WHERE m.id = $3 AND m.author_id = $4 AND c.id = m.channel_id
		RETURNING m.channel_id, c.guild_id
	`
	err = h.db.Pool.QueryRow(r.Context(), query, req.Content, now, messageID, userID).Scan(&channelID, &guildID)
	if err != nil {
		http.Error(w, `{"error":"message not found or you are not the author"}`, http.StatusForbidden)
		return
	}

	// Broadcast update event
	h.hub.BroadcastToGuild(guildID, models.WSEvent{
		Type: models.EventMessageUpdate,
		Data: map[string]any{
			"id":         messageID,
			"channel_id": channelID,
			"content":    req.Content,
			"is_edited":  true,
			"edited_at":  now,
		},
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"id":         messageID,
		"channel_id": channelID,
		"content":    req.Content,
		"is_edited":  true,
		"edited_at":  now,
	})
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

	if authorID != userID {
		audit.Log(r.Context(), h.db, h.hub, guildID, userID, "MESSAGE_DELETE_MODERATION", &authorID, map[string]any{
			"channel_id": channelID,
			"message_id": messageID,
		})
	}

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

	var guildID uuid.UUID
	var isPrivate bool
	err = h.db.Pool.QueryRow(r.Context(), "SELECT guild_id, is_private FROM channels WHERE id = $1", channelID).Scan(&guildID, &isPrivate)
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

	limit := 50
	if l := r.URL.Query().Get("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 && parsed <= 50 {
			limit = parsed
		}
	}

	var beforeTime *time.Time
	if b := r.URL.Query().Get("before"); b != "" {
		if t, err := time.Parse(time.RFC3339Nano, b); err == nil {
			beforeTime = &t
		} else if t, err := time.Parse(time.RFC3339, b); err == nil {
			beforeTime = &t
		} else if beforeUUID, err := uuid.Parse(b); err == nil {
			var t time.Time
			if h.db.Pool.QueryRow(r.Context(), "SELECT created_at FROM messages WHERE id = $1", beforeUUID).Scan(&t) == nil {
				beforeTime = &t
			}
		}
	}

	query := `
		SELECT m.id, m.channel_id, m.author_id, m.content, m.attachments, m.reply_to_id, m.is_pinned, m.is_edited, m.edited_at, m.created_at, m.updated_at,
		       u.username, u.display_name, u.avatar_url, u.banner_url, u.bio, u.status, u.custom_status,
		       rm.id, rm.content, ru.id, ru.username, ru.display_name, ru.avatar_url
		FROM messages m
		INNER JOIN users u ON u.id = m.author_id
		LEFT JOIN messages rm ON rm.id = m.reply_to_id
		LEFT JOIN users ru ON ru.id = rm.author_id
		WHERE m.channel_id = $1 AND ($3::timestamptz IS NULL OR m.created_at < $3)
		ORDER BY m.created_at DESC
		LIMIT $2
	`

	rows, err := h.db.Pool.Query(r.Context(), query, channelID, limit, beforeTime)
	if err != nil {
		http.Error(w, `{"error":"failed to query messages"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	messages := make([]models.Message, 0)
	msgIDs := make([]uuid.UUID, 0)

	for rows.Next() {
		var m models.Message
		var attachmentsJSON []byte
		var author models.UserPublic
		var rID, ruID *uuid.UUID
		var rContent, ruUsername, ruDisplayName, ruAvatar *string

		if err := rows.Scan(
			&m.ID, &m.ChannelID, &m.AuthorID, &m.Content, &attachmentsJSON, &m.ReplyToID, &m.IsPinned, &m.IsEdited, &m.EditedAt, &m.CreatedAt, &m.UpdatedAt,
			&author.Username, &author.DisplayName, &author.AvatarURL, &author.BannerURL, &author.Bio, &author.Status, &author.CustomStatus,
			&rID, &rContent, &ruID, &ruUsername, &ruDisplayName, &ruAvatar,
		); err != nil {
			continue
		}
		author.ID = m.AuthorID
		m.Author = author
		json.Unmarshal(attachmentsJSON, &m.Attachments)

		if rID != nil && ruID != nil {
			var dName, aUrl string
			if ruDisplayName != nil {
				dName = *ruDisplayName
			}
			if ruAvatar != nil {
				aUrl = *ruAvatar
			}
			var uName string
			if ruUsername != nil {
				uName = *ruUsername
			}
			var cnt string
			if rContent != nil {
				cnt = *rContent
			}
			m.ReplyTo = &models.MessageReplyInfo{
				ID: *rID,
				Author: models.UserPublic{
					ID:          *ruID,
					Username:    uName,
					DisplayName: dName,
					AvatarURL:   aUrl,
				},
				Content: cnt,
			}
		}

		m.Reactions = make([]models.MessageReaction, 0)
		messages = append(messages, m)
		msgIDs = append(msgIDs, m.ID)
	}

	// Fetch reactions for messages
	if len(msgIDs) > 0 {
		reactionsQuery := `
			SELECT message_id, emoji, user_id
			FROM message_reactions
			WHERE message_id = ANY($1)
		`
		rxRows, err := h.db.Pool.Query(r.Context(), reactionsQuery, msgIDs)
		if err == nil {
			defer rxRows.Close()
			rxMap := make(map[uuid.UUID]map[string][]uuid.UUID)
			for rxRows.Next() {
				var mID, uID uuid.UUID
				var emoji string
				if err := rxRows.Scan(&mID, &emoji, &uID); err == nil {
					if rxMap[mID] == nil {
						rxMap[mID] = make(map[string][]uuid.UUID)
					}
					rxMap[mID][emoji] = append(rxMap[mID][emoji], uID)
				}
			}

			for i := range messages {
				if emojis, ok := rxMap[messages[i].ID]; ok {
					for em, uids := range emojis {
						messages[i].Reactions = append(messages[i].Reactions, models.MessageReaction{
							Emoji:   em,
							Count:   len(uids),
							UserIDs: uids,
						})
					}
				}
			}
		}
	}

	// Chronological order
	for i, j := 0, len(messages)-1; i < j; i, j = i+1, j-1 {
		messages[i], messages[j] = messages[j], messages[i]
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(messages)
}

func (h *MessageHandler) AddReaction(w http.ResponseWriter, r *http.Request) {
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

	var req ReactionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || len(req.Emoji) == 0 {
		http.Error(w, `{"error":"emoji is required"}`, http.StatusBadRequest)
		return
	}

	var channelID, guildID uuid.UUID
	err = h.db.Pool.QueryRow(r.Context(), `
		SELECT m.channel_id, c.guild_id
		FROM messages m
		JOIN channels c ON c.id = m.channel_id
		WHERE m.id = $1
	`, messageID).Scan(&channelID, &guildID)
	if err != nil {
		http.Error(w, `{"error":"message not found"}`, http.StatusNotFound)
		return
	}

	var isMember bool
	checkQuery := `SELECT EXISTS(SELECT 1 FROM guild_members WHERE guild_id = $1 AND user_id = $2)`
	if err := h.db.Pool.QueryRow(r.Context(), checkQuery, guildID, userID).Scan(&isMember); err != nil || !isMember {
		http.Error(w, `{"error":"forbidden: you must be a member of this server to react"}`, http.StatusForbidden)
		return
	}

	_, err = h.db.Pool.Exec(r.Context(), `
		INSERT INTO message_reactions (message_id, user_id, emoji)
		VALUES ($1, $2, $3)
		ON CONFLICT DO NOTHING
	`, messageID, userID, req.Emoji)
	if err != nil {
		http.Error(w, `{"error":"failed to add reaction"}`, http.StatusInternalServerError)
		return
	}

	h.hub.BroadcastToGuild(guildID, models.WSEvent{
		Type: models.EventMessageReactionAdd,
		Data: map[string]any{
			"message_id": messageID,
			"channel_id": channelID,
			"user_id":    userID,
			"emoji":      req.Emoji,
		},
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"success": true, "emoji": req.Emoji})
}

func (h *MessageHandler) RemoveReaction(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	messageIDStr := chi.URLParam(r, "messageID")
	messageID, err := uuid.Parse(messageIDStr)
	emoji := chi.URLParam(r, "emoji")
	if err != nil || emoji == "" {
		http.Error(w, `{"error":"invalid message id or emoji"}`, http.StatusBadRequest)
		return
	}

	var channelID, guildID uuid.UUID
	err = h.db.Pool.QueryRow(r.Context(), `
		SELECT m.channel_id, c.guild_id
		FROM messages m
		JOIN channels c ON c.id = m.channel_id
		WHERE m.id = $1
	`, messageID).Scan(&channelID, &guildID)
	if err != nil {
		http.Error(w, `{"error":"message not found"}`, http.StatusNotFound)
		return
	}

	var isMember bool
	checkQuery := `SELECT EXISTS(SELECT 1 FROM guild_members WHERE guild_id = $1 AND user_id = $2)`
	if err := h.db.Pool.QueryRow(r.Context(), checkQuery, guildID, userID).Scan(&isMember); err != nil || !isMember {
		http.Error(w, `{"error":"forbidden: you must be a member of this server to react"}`, http.StatusForbidden)
		return
	}

	_, err = h.db.Pool.Exec(r.Context(), `
		DELETE FROM message_reactions
		WHERE message_id = $1 AND user_id = $2 AND emoji = $3
	`, messageID, userID, emoji)
	if err != nil {
		http.Error(w, `{"error":"failed to remove reaction"}`, http.StatusInternalServerError)
		return
	}

	h.hub.BroadcastToGuild(guildID, models.WSEvent{
		Type: models.EventMessageReactionRemove,
		Data: map[string]any{
			"message_id": messageID,
			"channel_id": channelID,
			"user_id":    userID,
			"emoji":      emoji,
		},
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"success": true})
}

func (h *MessageHandler) TogglePin(w http.ResponseWriter, r *http.Request) {
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

	var channelID, guildID uuid.UUID
	err = h.db.Pool.QueryRow(r.Context(), `
		SELECT m.channel_id, c.guild_id
		FROM messages m
		JOIN channels c ON c.id = m.channel_id
		WHERE m.id = $1
	`, messageID).Scan(&channelID, &guildID)
	if err != nil {
		http.Error(w, `{"error":"message not found"}`, http.StatusNotFound)
		return
	}

	var isMember bool
	checkQuery := `SELECT EXISTS(SELECT 1 FROM guild_members WHERE guild_id = $1 AND user_id = $2)`
	if err := h.db.Pool.QueryRow(r.Context(), checkQuery, guildID, userID).Scan(&isMember); err != nil || !isMember {
		http.Error(w, `{"error":"forbidden: you must be a member of this server to pin messages"}`, http.StatusForbidden)
		return
	}

	var isPinned bool
	err = h.db.Pool.QueryRow(r.Context(), `
		UPDATE messages
		SET is_pinned = NOT is_pinned
		WHERE id = $1
		RETURNING is_pinned
	`, messageID).Scan(&isPinned)
	if err != nil {
		http.Error(w, `{"error":"message not found"}`, http.StatusNotFound)
		return
	}

	eventType := models.EventMessagePin
	if !isPinned {
		eventType = models.EventMessageUnpin
	}

	h.hub.BroadcastToGuild(guildID, models.WSEvent{
		Type: eventType,
		Data: map[string]any{
			"message_id": messageID,
			"channel_id": channelID,
			"user_id":    userID,
			"is_pinned":  isPinned,
		},
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"success": true, "is_pinned": isPinned})
}

func (h *MessageHandler) ListPinned(w http.ResponseWriter, r *http.Request) {
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

	query := `
		SELECT m.id, m.channel_id, m.author_id, m.content, m.attachments, m.reply_to_id, m.is_pinned, m.is_edited, m.edited_at, m.created_at, m.updated_at,
		       u.username, u.display_name, u.avatar_url, u.banner_url, u.bio, u.status, u.custom_status,
		       rm.id, rm.content, ru.id, ru.username, ru.display_name, ru.avatar_url
		FROM messages m
		INNER JOIN users u ON u.id = m.author_id
		LEFT JOIN messages rm ON rm.id = m.reply_to_id
		LEFT JOIN users ru ON ru.id = rm.author_id
		WHERE m.channel_id = $1 AND m.is_pinned = true
		ORDER BY m.created_at DESC
		LIMIT 100
	`

	rows, err := h.db.Pool.Query(r.Context(), query, channelID)
	if err != nil {
		http.Error(w, `{"error":"failed to query pinned messages"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	messages := make([]models.Message, 0)
	msgIDs := make([]uuid.UUID, 0)

	for rows.Next() {
		var m models.Message
		var attachmentsJSON []byte
		var author models.UserPublic
		var rID, ruID *uuid.UUID
		var rContent, ruUsername, ruDisplayName, ruAvatar *string

		if err := rows.Scan(
			&m.ID, &m.ChannelID, &m.AuthorID, &m.Content, &attachmentsJSON, &m.ReplyToID, &m.IsPinned, &m.IsEdited, &m.EditedAt, &m.CreatedAt, &m.UpdatedAt,
			&author.Username, &author.DisplayName, &author.AvatarURL, &author.BannerURL, &author.Bio, &author.Status, &author.CustomStatus,
			&rID, &rContent, &ruID, &ruUsername, &ruDisplayName, &ruAvatar,
		); err != nil {
			continue
		}
		author.ID = m.AuthorID
		m.Author = author
		json.Unmarshal(attachmentsJSON, &m.Attachments)

		if rID != nil && ruID != nil {
			var dName, aUrl string
			if ruDisplayName != nil {
				dName = *ruDisplayName
			}
			if ruAvatar != nil {
				aUrl = *ruAvatar
			}
			var uName string
			if ruUsername != nil {
				uName = *ruUsername
			}
			var cnt string
			if rContent != nil {
				cnt = *rContent
			}
			m.ReplyTo = &models.MessageReplyInfo{
				ID: *rID,
				Author: models.UserPublic{
					ID:          *ruID,
					Username:    uName,
					DisplayName: dName,
					AvatarURL:   aUrl,
				},
				Content: cnt,
			}
		}

		m.Reactions = make([]models.MessageReaction, 0)
		messages = append(messages, m)
		msgIDs = append(msgIDs, m.ID)
	}

	// Fetch reactions for messages
	if len(msgIDs) > 0 {
		reactionsQuery := `
			SELECT message_id, emoji, user_id
			FROM message_reactions
			WHERE message_id = ANY($1)
		`
		rxRows, err := h.db.Pool.Query(r.Context(), reactionsQuery, msgIDs)
		if err == nil {
			defer rxRows.Close()
			rxMap := make(map[uuid.UUID]map[string][]uuid.UUID)
			for rxRows.Next() {
				var mID, uID uuid.UUID
				var emoji string
				if err := rxRows.Scan(&mID, &emoji, &uID); err == nil {
					if rxMap[mID] == nil {
						rxMap[mID] = make(map[string][]uuid.UUID)
					}
					rxMap[mID][emoji] = append(rxMap[mID][emoji], uID)
				}
			}

			for i := range messages {
				if emojis, ok := rxMap[messages[i].ID]; ok {
					for em, uids := range emojis {
						messages[i].Reactions = append(messages[i].Reactions, models.MessageReaction{
							Emoji:   em,
							Count:   len(uids),
							UserIDs: uids,
						})
					}
				}
			}
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(messages)
}

func (h *MessageHandler) Search(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	queryTerm := r.URL.Query().Get("q")
	if len(queryTerm) < 2 {
		http.Error(w, `{"error":"termo de busca muito curto"}`, http.StatusBadRequest)
		return
	}

	guildIDStr := chi.URLParam(r, "guildID")
	channelIDStr := chi.URLParam(r, "channelID")

	var guildID uuid.UUID
	var channelID *uuid.UUID

	if channelIDStr != "" {
		cID, err := uuid.Parse(channelIDStr)
		if err != nil {
			http.Error(w, `{"error":"invalid channel id"}`, http.StatusBadRequest)
			return
		}
		channelID = &cID
		// Get guild ID from channel
		err = h.db.Pool.QueryRow(r.Context(), `SELECT guild_id FROM channels WHERE id = $1`, cID).Scan(&guildID)
		if err != nil {
			http.Error(w, `{"error":"channel not found"}`, http.StatusNotFound)
			return
		}
	} else if guildIDStr != "" {
		gID, err := uuid.Parse(guildIDStr)
		if err != nil {
			http.Error(w, `{"error":"invalid guild id"}`, http.StatusBadRequest)
			return
		}
		guildID = gID
	} else {
		http.Error(w, `{"error":"guildID or channelID required"}`, http.StatusBadRequest)
		return
	}

	// Verify user is member of guild
	var isMember bool
	checkQuery := `SELECT EXISTS(SELECT 1 FROM guild_members WHERE guild_id = $1 AND user_id = $2)`
	if err := h.db.Pool.QueryRow(r.Context(), checkQuery, guildID, userID).Scan(&isMember); err != nil || !isMember {
		http.Error(w, `{"error":"forbidden: não é membro do servidor"}`, http.StatusForbidden)
		return
	}

	query := `
		SELECT 
			m.id, m.channel_id, m.author_id, m.content, m.attachments, m.reply_to_id, m.is_pinned, m.is_edited, m.edited_at, m.created_at,
			u.id, u.username, u.display_name, u.avatar_url, u.status
		FROM messages m
		INNER JOIN channels c ON c.id = m.channel_id
		INNER JOIN users u ON u.id = m.author_id
		WHERE c.guild_id = $1
		  AND (m.search_vector @@ plainto_tsquery('portuguese', $2) OR m.content ILIKE '%' || $2 || '%')
	`
	args := []any{guildID, queryTerm}

	if channelID != nil {
		query += ` AND m.channel_id = $3`
		args = append(args, *channelID)
	}

	query += ` ORDER BY m.created_at DESC LIMIT 50`

	rows, err := h.db.Pool.Query(r.Context(), query, args...)
	if err != nil {
		http.Error(w, `{"error":"failed to execute search"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	results := make([]models.Message, 0)
	for rows.Next() {
		var m models.Message
		var author models.UserPublic
		var attachmentsJSON []byte
		err := rows.Scan(
			&m.ID, &m.ChannelID, &m.AuthorID, &m.Content, &attachmentsJSON, &m.ReplyToID, &m.IsPinned, &m.IsEdited, &m.EditedAt, &m.CreatedAt,
			&author.ID, &author.Username, &author.DisplayName, &author.AvatarURL, &author.Status,
		)
		if err == nil {
			m.Author = author
			json.Unmarshal(attachmentsJSON, &m.Attachments)
			results = append(results, m)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(results)
}

type AckChannelRequest struct {
	MessageID *uuid.UUID `json:"message_id"`
}

func (h *MessageHandler) AckChannel(w http.ResponseWriter, r *http.Request) {
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

	var req AckChannelRequest
	_ = json.NewDecoder(r.Body).Decode(&req)

	var lastMsgID *uuid.UUID = req.MessageID
	if lastMsgID == nil {
		// Get newest message id in channel
		var newest uuid.UUID
		err := h.db.Pool.QueryRow(r.Context(), `SELECT id FROM messages WHERE channel_id = $1 ORDER BY created_at DESC LIMIT 1`, channelID).Scan(&newest)
		if err == nil {
			lastMsgID = &newest
		}
	}

	query := `
		INSERT INTO channel_read_states (user_id, channel_id, last_read_message_id, unread_count, updated_at)
		VALUES ($1, $2, $3, 0, CURRENT_TIMESTAMP)
		ON CONFLICT (user_id, channel_id) DO UPDATE
		SET last_read_message_id = EXCLUDED.last_read_message_id,
		    unread_count = 0,
		    updated_at = CURRENT_TIMESTAMP
	`
	_, err = h.db.Pool.Exec(r.Context(), query, userID, channelID, lastMsgID)
	if err != nil {
		http.Error(w, `{"error":"failed to ack channel"}`, http.StatusInternalServerError)
		return
	}

	h.hub.SendToUser(userID, models.WSEvent{
		Type: models.EventChannelAck,
		Data: map[string]any{
			"channel_id":           channelID,
			"last_read_message_id": lastMsgID,
		},
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"success": true, "channel_id": channelID, "last_read_message_id": lastMsgID})
}

func (h *MessageHandler) GetGuildReadStates(w http.ResponseWriter, r *http.Request) {
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

	query := `
		SELECT crs.channel_id, crs.last_read_message_id, crs.unread_count, crs.updated_at
		FROM channel_read_states crs
		INNER JOIN channels c ON c.id = crs.channel_id
		WHERE crs.user_id = $1 AND c.guild_id = $2
	`
	rows, err := h.db.Pool.Query(r.Context(), query, userID, guildID)
	if err != nil {
		http.Error(w, `{"error":"failed to fetch read states"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	states := make([]models.ChannelReadState, 0)
	for rows.Next() {
		var s models.ChannelReadState
		s.UserID = userID
		if err := rows.Scan(&s.ChannelID, &s.LastReadMessageID, &s.UnreadCount, &s.UpdatedAt); err == nil {
			states = append(states, s)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(states)
}


