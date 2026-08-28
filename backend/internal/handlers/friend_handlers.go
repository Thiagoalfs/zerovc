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

type FriendHandler struct {
	db  *database.DB
	hub *gateway.Hub
}

func NewFriendHandler(db *database.DB, hub *gateway.Hub) *FriendHandler {
	return &FriendHandler{
		db:  db,
		hub: hub,
	}
}

type SendFriendRequestBody struct {
	Username string `json:"username"`
}

type FriendsListResponse struct {
	Friends  []models.Friendship `json:"friends"`
	Pending  []models.Friendship `json:"pending"`
	Incoming []models.Friendship `json:"incoming"`
}

func (h *FriendHandler) ListFriends(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	query := `
		SELECT f.id, f.user_id, f.friend_id, f.status, f.created_at, f.updated_at,
		       u.id, u.username, u.avatar_url, u.status, u.custom_status,
		       fr.id, fr.username, fr.avatar_url, fr.status, fr.custom_status
		FROM friendships f
		INNER JOIN users u ON u.id = f.user_id
		INNER JOIN users fr ON fr.id = f.friend_id
		WHERE f.user_id = $1 OR f.friend_id = $1
		ORDER BY f.updated_at DESC
	`
	rows, err := h.db.Pool.Query(r.Context(), query, userID)
	if err != nil {
		http.Error(w, `{"error":"failed to query friendships"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	response := FriendsListResponse{
		Friends:  make([]models.Friendship, 0),
		Pending:  make([]models.Friendship, 0),
		Incoming: make([]models.Friendship, 0),
	}

	for rows.Next() {
		var f models.Friendship
		var u, fr models.UserPublic
		if err := rows.Scan(
			&f.ID, &f.UserID, &f.FriendID, &f.Status, &f.CreatedAt, &f.UpdatedAt,
			&u.ID, &u.Username, &u.AvatarURL, &u.Status, &u.CustomStatus,
			&fr.ID, &fr.Username, &fr.AvatarURL, &fr.Status, &fr.CustomStatus,
		); err != nil {
			continue
		}

		f.User = u
		f.Friend = fr

		if f.Status == "accepted" {
			response.Friends = append(response.Friends, f)
		} else if f.Status == "pending" {
			if f.UserID == userID {
				// Sent by current user (pending)
				response.Pending = append(response.Pending, f)
			} else {
				// Received by current user (incoming)
				response.Incoming = append(response.Incoming, f)
			}
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func (h *FriendHandler) SendRequest(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var req SendFriendRequestBody
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Username == "" {
		http.Error(w, `{"error":"username is required"}`, http.StatusBadRequest)
		return
	}

	// 1. Find target user by username
	var target models.UserPublic
	userQuery := `SELECT id, username, avatar_url, status, custom_status FROM users WHERE LOWER(username) = LOWER($1)`
	err := h.db.Pool.QueryRow(r.Context(), userQuery, req.Username).Scan(
		&target.ID, &target.Username, &target.AvatarURL, &target.Status, &target.CustomStatus,
	)
	if err != nil {
		http.Error(w, `{"error":"user not found with this username"}`, http.StatusNotFound)
		return
	}

	if target.ID == userID {
		http.Error(w, `{"error":"you cannot add yourself as a friend"}`, http.StatusBadRequest)
		return
	}

	// 2. Check if reverse request exists (if other user already sent a request, auto-accept!)
	var reverseID uuid.UUID
	var reverseStatus string
	reverseQuery := `SELECT id, status FROM friendships WHERE user_id = $1 AND friend_id = $2`
	err = h.db.Pool.QueryRow(r.Context(), reverseQuery, target.ID, userID).Scan(&reverseID, &reverseStatus)
	if err == nil {
		if reverseStatus == "pending" {
			// Auto accept
			h.db.Pool.Exec(r.Context(), "UPDATE friendships SET status = 'accepted', updated_at = CURRENT_TIMESTAMP WHERE id = $1", reverseID)
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(`{"success":true,"status":"accepted"}`))
			return
		} else if reverseStatus == "accepted" {
			http.Error(w, `{"error":"you are already friends with this user"}`, http.StatusBadRequest)
			return
		}
	}

	// 3. Insert friendship request
	var friendship models.Friendship
	insertQuery := `
		INSERT INTO friendships (user_id, friend_id, status)
		VALUES ($1, $2, 'pending')
		ON CONFLICT (user_id, friend_id) DO UPDATE SET status = 'pending', updated_at = CURRENT_TIMESTAMP
		RETURNING id, user_id, friend_id, status, created_at, updated_at
	`
	err = h.db.Pool.QueryRow(r.Context(), insertQuery, userID, target.ID).Scan(
		&friendship.ID, &friendship.UserID, &friendship.FriendID, &friendship.Status, &friendship.CreatedAt, &friendship.UpdatedAt,
	)
	if err != nil {
		http.Error(w, `{"error":"failed to send friend request"}`, http.StatusInternalServerError)
		return
	}

	// 4. Send real-time notification to target user
	h.hub.SendToUser(target.ID, models.WSEvent{
		Type: models.EventFriendRequestCreate,
		Data: friendship,
	})

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(friendship)
}

func (h *FriendHandler) AcceptRequest(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	friendshipIDStr := chi.URLParam(r, "id")
	friendshipID, err := uuid.Parse(friendshipIDStr)
	if err != nil {
		http.Error(w, `{"error":"invalid friendship id"}`, http.StatusBadRequest)
		return
	}

	var senderID uuid.UUID
	query := `
		UPDATE friendships
		SET status = 'accepted', updated_at = CURRENT_TIMESTAMP
		WHERE id = $1 AND (friend_id = $2 OR user_id = $2)
		RETURNING user_id
	`
	err = h.db.Pool.QueryRow(r.Context(), query, friendshipID, userID).Scan(&senderID)
	if err != nil {
		http.Error(w, `{"error":"request not found"}`, http.StatusNotFound)
		return
	}

	// Real-time update event
	h.hub.SendToUser(senderID, models.WSEvent{
		Type: models.EventFriendRequestUpdate,
		Data: map[string]any{
			"id":     friendshipID,
			"status": "accepted",
		},
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"success": true})
}

func (h *FriendHandler) RemoveFriend(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	friendshipIDStr := chi.URLParam(r, "id")
	friendshipID, err := uuid.Parse(friendshipIDStr)
	if err != nil {
		http.Error(w, `{"error":"invalid friendship id"}`, http.StatusBadRequest)
		return
	}

	_, err = h.db.Pool.Exec(r.Context(), "DELETE FROM friendships WHERE id = $1 AND (user_id = $2 OR friend_id = $2)", friendshipID, userID)
	if err != nil {
		http.Error(w, `{"error":"failed to remove friend"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"success": true})
}
