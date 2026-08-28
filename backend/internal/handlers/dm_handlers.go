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
)

type DMHandler struct {
	db  *database.DB
	hub *gateway.Hub
}

func NewDMHandler(db *database.DB, hub *gateway.Hub) *DMHandler {
	return &DMHandler{
		db:  db,
		hub: hub,
	}
}

type CreateDMRoomRequest struct {
	RecipientID uuid.UUID `json:"recipient_id"`
}

type SendDMMessageRequest struct {
	Content     string              `json:"content"`
	Attachments []models.Attachment `json:"attachments"`
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
	err := h.db.Pool.QueryRow(r.Context(), query, u1, u2).Scan(&room.ID, &room.User1ID, &room.User2ID, &room.CreatedAt)
	if err != nil {
		http.Error(w, `{"error":"failed to create dm room"}`, http.StatusInternalServerError)
		return
	}

	// Fetch recipient details
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
		SELECT m.id, m.dm_room_id, m.author_id, m.content, m.attachments, m.is_edited, m.edited_at, m.created_at,
		       u.username, u.display_name, u.avatar_url, u.banner_url, u.bio, u.status, u.custom_status
		FROM dm_messages m
		INNER JOIN users u ON u.id = m.author_id
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
	for rows.Next() {
		var msg models.DMMessage
		var attachmentsJSON []byte
		var author models.UserPublic

		if err := rows.Scan(
			&msg.ID, &msg.DMRoomID, &msg.AuthorID, &msg.Content, &attachmentsJSON, &msg.IsEdited, &msg.EditedAt, &msg.CreatedAt,
			&author.Username, &author.DisplayName, &author.AvatarURL, &author.BannerURL, &author.Bio, &author.Status, &author.CustomStatus,
		); err == nil {
			author.ID = msg.AuthorID
			msg.Author = author
			json.Unmarshal(attachmentsJSON, &msg.Attachments)
			messages = append(messages, msg)
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

	// Fetch author details
	var author models.UserPublic
	h.db.Pool.QueryRow(r.Context(), "SELECT id, username, display_name, avatar_url, banner_url, bio, status, custom_status FROM users WHERE id = $1", userID).Scan(
		&author.ID, &author.Username, &author.DisplayName, &author.AvatarURL, &author.BannerURL, &author.Bio, &author.Status, &author.CustomStatus,
	)

	attachmentsJSON, _ := json.Marshal(req.Attachments)
	var msg models.DMMessage
	query := `
		INSERT INTO dm_messages (dm_room_id, author_id, content, attachments)
		VALUES ($1, $2, $3, $4)
		RETURNING id, dm_room_id, author_id, content, is_edited, edited_at, created_at
	`
	err = h.db.Pool.QueryRow(r.Context(), query, roomID, userID, req.Content, attachmentsJSON).Scan(
		&msg.ID, &msg.DMRoomID, &msg.AuthorID, &msg.Content, &msg.IsEdited, &msg.EditedAt, &msg.CreatedAt,
	)
	if err != nil {
		http.Error(w, `{"error":"failed to save dm message"}`, http.StatusInternalServerError)
		return
	}
	msg.Author = author
	msg.Attachments = req.Attachments

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
