package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/zerovc/zerovc/backend/internal/auth"
	"github.com/zerovc/zerovc/backend/internal/database"
	"github.com/zerovc/zerovc/backend/internal/gateway"
	"github.com/zerovc/zerovc/backend/internal/models"
	"github.com/zerovc/zerovc/backend/internal/voice"
)

type DMHandler struct {
	db      *database.DB
	hub     *gateway.Hub
	livekit *voice.LiveKitService
}

func NewDMHandler(db *database.DB, hub *gateway.Hub, livekit *voice.LiveKitService) *DMHandler {
	return &DMHandler{
		db:      db,
		hub:     hub,
		livekit: livekit,
	}
}

type CreateDMRoomRequest struct {
	RecipientID uuid.UUID `json:"recipient_id"`
}

type SendDMMessageRequest struct {
	Content     string              `json:"content"`
	Attachments []models.Attachment `json:"attachments"`
	ReplyToID   *uuid.UUID          `json:"reply_to_id,omitempty"`
}

func (h *DMHandler) ListRooms(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	query := `
		SELECT r.id, r.user1_id, r.user2_id, r.created_at,
		       u.id, u.username, u.display_name, u.avatar_url, u.banner_url, u.bio, u.status, u.custom_status
		FROM dm_rooms r
		INNER JOIN users u ON u.id = (CASE WHEN r.user1_id = $1 THEN r.user2_id ELSE r.user1_id END)
		WHERE r.user1_id = $1 OR r.user2_id = $1
		ORDER BY r.created_at DESC
	`
	rows, err := h.db.Pool.Query(r.Context(), query, userID)
	if err != nil {
		http.Error(w, `{"error":"failed to query dm rooms"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	rooms := make([]models.DMRoom, 0)
	for rows.Next() {
		var room models.DMRoom
		var recipient models.UserPublic
		if err := rows.Scan(
			&room.ID, &room.User1ID, &room.User2ID, &room.CreatedAt,
			&recipient.ID, &recipient.Username, &recipient.DisplayName, &recipient.AvatarURL, &recipient.BannerURL, &recipient.Bio, &recipient.Status, &recipient.CustomStatus,
		); err == nil {
			room.Recipient = recipient
			rooms = append(rooms, room)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(rooms)
}

func (h *DMHandler) CreateOrGetRoom(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var req CreateDMRoomRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.RecipientID == uuid.Nil {
		http.Error(w, `{"error":"recipient_id required"}`, http.StatusBadRequest)
		return
	}

	if req.RecipientID == userID {
		http.Error(w, `{"error":"cannot dm yourself"}`, http.StatusBadRequest)
		return
	}

	// Check if there is a block between users
	var isBlocked bool
	blockCheckQuery := `SELECT EXISTS(SELECT 1 FROM user_blocks WHERE (user_id = $1 AND blocked_user_id = $2) OR (user_id = $2 AND blocked_user_id = $1))`
	if err := h.db.Pool.QueryRow(r.Context(), blockCheckQuery, userID, req.RecipientID).Scan(&isBlocked); err == nil && isBlocked {
		http.Error(w, `{"error":"não é possível abrir conversa com este usuário"}`, http.StatusForbidden)
		return
	}

	// Order pair to satisfy constraint
	u1, u2 := userID, req.RecipientID
	if u1.String() > u2.String() {
		u1, u2 = u2, u1
	}

	var room models.DMRoom
	query := `
		INSERT INTO dm_rooms (user1_id, user2_id)
		VALUES ($1, $2)
		ON CONFLICT (user1_id, user2_id) DO UPDATE SET user1_id = EXCLUDED.user1_id
		RETURNING id, user1_id, user2_id, created_at
	`
	err := h.db.Pool.QueryRow(r.Context(), query, u1, u2).Scan(
		&room.ID, &room.User1ID, &room.User2ID, &room.CreatedAt,
	)
	if err != nil {
		http.Error(w, `{"error":"failed to create dm room"}`, http.StatusInternalServerError)
		return
	}

	var recipient models.UserPublic
	h.db.Pool.QueryRow(r.Context(), "SELECT id, username, display_name, avatar_url, banner_url, bio, status, custom_status FROM users WHERE id = $1", req.RecipientID).Scan(
		&recipient.ID, &recipient.Username, &recipient.DisplayName, &recipient.AvatarURL, &recipient.BannerURL, &recipient.Bio, &recipient.Status, &recipient.CustomStatus,
	)
	room.Recipient = recipient

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(room)
}

func (h *DMHandler) ListMessages(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	roomIDStr := chi.URLParam(r, "roomID")
	roomID, err := uuid.Parse(roomIDStr)
	if err != nil {
		http.Error(w, `{"error":"invalid room id"}`, http.StatusBadRequest)
		return
	}

	// Verify user is participant in this room
	var isParticipant bool
	checkQuery := `SELECT EXISTS(SELECT 1 FROM dm_rooms WHERE id = $1 AND (user1_id = $2 OR user2_id = $2))`
	if err := h.db.Pool.QueryRow(r.Context(), checkQuery, roomID, userID).Scan(&isParticipant); err != nil || !isParticipant {
		http.Error(w, `{"error":"forbidden: not a participant of this conversation"}`, http.StatusForbidden)
		return
	}

	limit := 50
	if l := r.URL.Query().Get("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 && parsed <= 100 {
			limit = parsed
		}
	}

	query := `
		SELECT m.id, m.dm_room_id, m.author_id, m.content, m.attachments, m.reply_to_id, m.is_pinned, m.is_edited, m.edited_at, m.created_at,
		       u.username, u.display_name, u.avatar_url, u.banner_url, u.bio, u.status, u.custom_status,
		       rm.id, rm.content, ru.id, ru.username, ru.display_name, ru.avatar_url
		FROM dm_messages m
		INNER JOIN users u ON u.id = m.author_id
		LEFT JOIN dm_messages rm ON rm.id = m.reply_to_id
		LEFT JOIN users ru ON ru.id = rm.author_id
		WHERE m.dm_room_id = $1
		ORDER BY m.created_at DESC
		LIMIT $2
	`
	rows, err := h.db.Pool.Query(r.Context(), query, roomID, limit)
	if err != nil {
		http.Error(w, `{"error":"failed to query dm messages"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	messages := make([]models.DMMessage, 0)
	msgIDs := make([]uuid.UUID, 0)

	for rows.Next() {
		var msg models.DMMessage
		var attachmentsJSON []byte
		var author models.UserPublic
		var rID, ruID *uuid.UUID
		var rContent, ruUsername, ruDisplayName, ruAvatar *string

		if err := rows.Scan(
			&msg.ID, &msg.DMRoomID, &msg.AuthorID, &msg.Content, &attachmentsJSON, &msg.ReplyToID, &msg.IsPinned, &msg.IsEdited, &msg.EditedAt, &msg.CreatedAt,
			&author.Username, &author.DisplayName, &author.AvatarURL, &author.BannerURL, &author.Bio, &author.Status, &author.CustomStatus,
			&rID, &rContent, &ruID, &ruUsername, &ruDisplayName, &ruAvatar,
		); err == nil {
			author.ID = msg.AuthorID
			msg.Author = author
			json.Unmarshal(attachmentsJSON, &msg.Attachments)

			if rID != nil && ruID != nil {
				var dName, aUrl, uName, cnt string
				if ruDisplayName != nil {
					dName = *ruDisplayName
				}
				if ruAvatar != nil {
					aUrl = *ruAvatar
				}
				if ruUsername != nil {
					uName = *ruUsername
				}
				if rContent != nil {
					cnt = *rContent
				}
				msg.ReplyTo = &models.MessageReplyInfo{
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

			msg.Reactions = make([]models.MessageReaction, 0)
			messages = append(messages, msg)
			msgIDs = append(msgIDs, msg.ID)
		}
	}

	// Fetch reactions for DM messages
	if len(msgIDs) > 0 {
		reactionsQuery := `
			SELECT dm_message_id, emoji, user_id
			FROM message_reactions
			WHERE dm_message_id = ANY($1)
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

func (h *DMHandler) SendMessage(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	roomIDStr := chi.URLParam(r, "roomID")
	roomID, err := uuid.Parse(roomIDStr)
	if err != nil {
		http.Error(w, `{"error":"invalid room id"}`, http.StatusBadRequest)
		return
	}

	var req SendDMMessageRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || (req.Content == "" && len(req.Attachments) == 0) {
		http.Error(w, `{"error":"message content cannot be empty"}`, http.StatusBadRequest)
		return
	}

	if len(req.Content) > 2000 {
		http.Error(w, `{"error":"O limite de tamanho de mensagem é 2.000 caracteres"}`, http.StatusBadRequest)
		return
	}

	// Verify participant and find other user
	var user1ID, user2ID uuid.UUID
	err = h.db.Pool.QueryRow(r.Context(), "SELECT user1_id, user2_id FROM dm_rooms WHERE id = $1", roomID).Scan(&user1ID, &user2ID)
	if err != nil || (user1ID != userID && user2ID != userID) {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}

	recipientID := user1ID
	if recipientID == userID {
		recipientID = user2ID
	}

	// Check if there is a block between users
	var isBlocked bool
	blockCheckQuery := `SELECT EXISTS(SELECT 1 FROM user_blocks WHERE (user_id = $1 AND blocked_user_id = $2) OR (user_id = $2 AND blocked_user_id = $1))`
	if err := h.db.Pool.QueryRow(r.Context(), blockCheckQuery, userID, recipientID).Scan(&isBlocked); err == nil && isBlocked {
		http.Error(w, `{"error":"você não pode enviar mensagens para este usuário"}`, http.StatusForbidden)
		return
	}

	// Fetch author details
	var author models.UserPublic
	h.db.Pool.QueryRow(r.Context(), "SELECT id, username, display_name, avatar_url, banner_url, bio, status, custom_status FROM users WHERE id = $1", userID).Scan(
		&author.ID, &author.Username, &author.DisplayName, &author.AvatarURL, &author.BannerURL, &author.Bio, &author.Status, &author.CustomStatus,
	)

	attachmentsJSON, _ := json.Marshal(req.Attachments)
	var msg models.DMMessage
	query := `
		INSERT INTO dm_messages (dm_room_id, author_id, content, attachments, reply_to_id)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, dm_room_id, author_id, content, reply_to_id, is_pinned, is_edited, edited_at, created_at
	`
	err = h.db.Pool.QueryRow(r.Context(), query, roomID, userID, req.Content, attachmentsJSON, req.ReplyToID).Scan(
		&msg.ID, &msg.DMRoomID, &msg.AuthorID, &msg.Content, &msg.ReplyToID, &msg.IsPinned, &msg.IsEdited, &msg.EditedAt, &msg.CreatedAt,
	)
	if err != nil {
		http.Error(w, `{"error":"failed to save dm message"}`, http.StatusInternalServerError)
		return
	}
	msg.Author = author
	msg.Attachments = req.Attachments
	msg.Reactions = make([]models.MessageReaction, 0)

	// Fetch reply preview if exists
	if msg.ReplyToID != nil {
		var replyAuthor models.UserPublic
		var replyContent string
		err := h.db.Pool.QueryRow(r.Context(), `
			SELECT m.id, m.content, u.id, u.username, u.display_name, u.avatar_url
			FROM dm_messages m
			JOIN users u ON u.id = m.author_id
			WHERE m.id = $1
		`, *msg.ReplyToID).Scan(&replyAuthor.ID, &replyContent, &replyAuthor.ID, &replyAuthor.Username, &replyAuthor.DisplayName, &replyAuthor.AvatarURL)
		if err == nil {
			msg.ReplyTo = &models.MessageReplyInfo{
				ID:      *msg.ReplyToID,
				Author:  replyAuthor,
				Content: replyContent,
			}
		}
	}

	// Broadcast to both participants
	h.hub.SendToUser(recipientID, models.WSEvent{
		Type: models.EventDMMessageCreate,
		Data: msg,
	})
	h.hub.SendToUser(userID, models.WSEvent{
		Type: models.EventDMMessageCreate,
		Data: msg,
	})

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(msg)
}

func (h *DMHandler) AddReaction(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	roomIDStr := chi.URLParam(r, "roomID")
	messageIDStr := chi.URLParam(r, "messageID")
	roomID, err1 := uuid.Parse(roomIDStr)
	messageID, err2 := uuid.Parse(messageIDStr)
	if err1 != nil || err2 != nil {
		http.Error(w, `{"error":"invalid id"}`, http.StatusBadRequest)
		return
	}

	var req ReactionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || len(req.Emoji) == 0 {
		http.Error(w, `{"error":"emoji is required"}`, http.StatusBadRequest)
		return
	}

	var user1ID, user2ID uuid.UUID
	err := h.db.Pool.QueryRow(r.Context(), "SELECT user1_id, user2_id FROM dm_rooms WHERE id = $1", roomID).Scan(&user1ID, &user2ID)
	if err != nil || (user1ID != userID && user2ID != userID) {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}

	recipientID := user1ID
	if recipientID == userID {
		recipientID = user2ID
	}

	_, err = h.db.Pool.Exec(r.Context(), `
		INSERT INTO message_reactions (dm_message_id, user_id, emoji)
		VALUES ($1, $2, $3)
		ON CONFLICT DO NOTHING
	`, messageID, userID, req.Emoji)
	if err != nil {
		http.Error(w, `{"error":"failed to add reaction"}`, http.StatusInternalServerError)
		return
	}

	eventData := map[string]any{
		"message_id": messageID,
		"dm_room_id": roomID,
		"user_id":    userID,
		"emoji":      req.Emoji,
	}

	h.hub.SendToUser(recipientID, models.WSEvent{
		Type: models.EventDMReactionAdd,
		Data: eventData,
	})
	h.hub.SendToUser(userID, models.WSEvent{
		Type: models.EventDMReactionAdd,
		Data: eventData,
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"success": true, "emoji": req.Emoji})
}

func (h *DMHandler) RemoveReaction(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	roomIDStr := chi.URLParam(r, "roomID")
	messageIDStr := chi.URLParam(r, "messageID")
	emoji := chi.URLParam(r, "emoji")
	roomID, err1 := uuid.Parse(roomIDStr)
	messageID, err2 := uuid.Parse(messageIDStr)
	if err1 != nil || err2 != nil || emoji == "" {
		http.Error(w, `{"error":"invalid id or emoji"}`, http.StatusBadRequest)
		return
	}

	var user1ID, user2ID uuid.UUID
	err := h.db.Pool.QueryRow(r.Context(), "SELECT user1_id, user2_id FROM dm_rooms WHERE id = $1", roomID).Scan(&user1ID, &user2ID)
	if err != nil || (user1ID != userID && user2ID != userID) {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}

	recipientID := user1ID
	if recipientID == userID {
		recipientID = user2ID
	}

	_, err = h.db.Pool.Exec(r.Context(), `
		DELETE FROM message_reactions
		WHERE dm_message_id = $1 AND user_id = $2 AND emoji = $3
	`, messageID, userID, emoji)
	if err != nil {
		http.Error(w, `{"error":"failed to remove reaction"}`, http.StatusInternalServerError)
		return
	}

	eventData := map[string]any{
		"message_id": messageID,
		"dm_room_id": roomID,
		"user_id":    userID,
		"emoji":      emoji,
	}

	h.hub.SendToUser(recipientID, models.WSEvent{
		Type: models.EventDMReactionRemove,
		Data: eventData,
	})
	h.hub.SendToUser(userID, models.WSEvent{
		Type: models.EventDMReactionRemove,
		Data: eventData,
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"success": true})
}

// 1x1 Call Endpoints

func (h *DMHandler) InviteCall(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	roomIDStr := chi.URLParam(r, "roomID")
	roomID, err := uuid.Parse(roomIDStr)
	if err != nil {
		http.Error(w, `{"error":"invalid room id"}`, http.StatusBadRequest)
		return
	}

	// Verify participant and find recipient
	var user1ID, user2ID uuid.UUID
	err = h.db.Pool.QueryRow(r.Context(), "SELECT user1_id, user2_id FROM dm_rooms WHERE id = $1", roomID).Scan(&user1ID, &user2ID)
	if err != nil || (user1ID != userID && user2ID != userID) {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}

	recipientID := user1ID
	if recipientID == userID {
		recipientID = user2ID
	}

	// Check if there is a block
	var isBlocked bool
	blockCheckQuery := `SELECT EXISTS(SELECT 1 FROM user_blocks WHERE (user_id = $1 AND blocked_user_id = $2) OR (user_id = $2 AND blocked_user_id = $1))`
	if err := h.db.Pool.QueryRow(r.Context(), blockCheckQuery, userID, recipientID).Scan(&isBlocked); err == nil && isBlocked {
		http.Error(w, `{"error":"não é possível iniciar chamada com este usuário"}`, http.StatusForbidden)
		return
	}

	// Fetch caller details
	var caller models.UserPublic
	h.db.Pool.QueryRow(r.Context(), "SELECT id, username, display_name, avatar_url, banner_url, bio, status, custom_status FROM users WHERE id = $1", userID).Scan(
		&caller.ID, &caller.Username, &caller.DisplayName, &caller.AvatarURL, &caller.BannerURL, &caller.Bio, &caller.Status, &caller.CustomStatus,
	)

	// Send CALL_INCOMING event to recipient
	h.hub.SendToUser(recipientID, models.WSEvent{
		Type: "CALL_INCOMING",
		Data: map[string]any{
			"room_id":   roomID,
			"caller":    caller,
			"call_type": "dm",
		},
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"success": true, "room_id": roomID})
}

func (h *DMHandler) AcceptCall(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	roomIDStr := chi.URLParam(r, "roomID")
	roomID, err := uuid.Parse(roomIDStr)
	if err != nil {
		http.Error(w, `{"error":"invalid room id"}`, http.StatusBadRequest)
		return
	}

	var user1ID, user2ID uuid.UUID
	err = h.db.Pool.QueryRow(r.Context(), "SELECT user1_id, user2_id FROM dm_rooms WHERE id = $1", roomID).Scan(&user1ID, &user2ID)
	if err != nil || (user1ID != userID && user2ID != userID) {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}

	otherUserID := user1ID
	if otherUserID == userID {
		otherUserID = user2ID
	}

	// Fetch user details for token generation
	var currentName, otherName string
	h.db.Pool.QueryRow(r.Context(), "SELECT COALESCE(display_name, username) FROM users WHERE id = $1", userID).Scan(&currentName)
	h.db.Pool.QueryRow(r.Context(), "SELECT COALESCE(display_name, username) FROM users WHERE id = $1", otherUserID).Scan(&otherName)

	livekitRoomName := "dm-" + roomID.String()

	// Generate LiveKit tokens
	tokenAcceptor, err := h.livekit.GenerateJoinToken(livekitRoomName, userID, currentName, "", true)
	if err != nil {
		http.Error(w, `{"error":"failed to generate voice token"}`, http.StatusInternalServerError)
		return
	}

	tokenCaller, err := h.livekit.GenerateJoinToken(livekitRoomName, otherUserID, otherName, "", true)
	if err != nil {
		http.Error(w, `{"error":"failed to generate voice token"}`, http.StatusInternalServerError)
		return
	}

	// Notify caller via WS with token and URL
	h.hub.SendToUser(otherUserID, models.WSEvent{
		Type: "CALL_ACCEPT",
		Data: map[string]any{
			"room_id":     roomID,
			"room_name":   livekitRoomName,
			"token":       tokenCaller,
			"livekit_url": h.livekit.GetPublicURL(),
		},
	})

	// Respond to acceptor with their token and URL
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"success":     true,
		"room_id":     roomID,
		"room_name":   livekitRoomName,
		"token":       tokenAcceptor,
		"livekit_url": h.livekit.GetPublicURL(),
	})
}

func (h *DMHandler) RejectCall(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	roomIDStr := chi.URLParam(r, "roomID")
	roomID, err := uuid.Parse(roomIDStr)
	if err != nil {
		http.Error(w, `{"error":"invalid room id"}`, http.StatusBadRequest)
		return
	}

	var user1ID, user2ID uuid.UUID
	err = h.db.Pool.QueryRow(r.Context(), "SELECT user1_id, user2_id FROM dm_rooms WHERE id = $1", roomID).Scan(&user1ID, &user2ID)
	if err != nil || (user1ID != userID && user2ID != userID) {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}

	otherUserID := user1ID
	if otherUserID == userID {
		otherUserID = user2ID
	}

	h.hub.SendToUser(otherUserID, models.WSEvent{
		Type: "CALL_REJECT",
		Data: map[string]any{
			"room_id": roomID,
			"user_id": userID,
		},
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"success": true})
}

func (h *DMHandler) LeaveCall(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	roomIDStr := chi.URLParam(r, "roomID")
	roomID, err := uuid.Parse(roomIDStr)
	if err != nil {
		http.Error(w, `{"error":"invalid room id"}`, http.StatusBadRequest)
		return
	}

	var user1ID, user2ID uuid.UUID
	err = h.db.Pool.QueryRow(r.Context(), "SELECT user1_id, user2_id FROM dm_rooms WHERE id = $1", roomID).Scan(&user1ID, &user2ID)
	if err != nil || (user1ID != userID && user2ID != userID) {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}

	otherUserID := user1ID
	if otherUserID == userID {
		otherUserID = user2ID
	}

	h.hub.SendToUser(otherUserID, models.WSEvent{
		Type: "CALL_LEAVE",
		Data: map[string]any{
			"room_id": roomID,
			"user_id": userID,
		},
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"success": true})
}
