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

type UserHandler struct {
	db  *database.DB
	hub *gateway.Hub
}

func NewUserHandler(db *database.DB, hub *gateway.Hub) *UserHandler {
	return &UserHandler{
		db:  db,
		hub: hub,
	}
}

type UpdateProfileRequest struct {
	DisplayName  *string `json:"display_name,omitempty"`
	AvatarURL    *string `json:"avatar_url,omitempty"`
	BannerURL    *string `json:"banner_url,omitempty"`
	Bio          *string `json:"bio,omitempty"`
	Status       *string `json:"status,omitempty"` // online, idle, dnd, offline
	CustomStatus *string `json:"custom_status,omitempty"`
}

func (h *UserHandler) UpdateProfile(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var req UpdateProfileRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	// Validate status enum if provided
	if req.Status != nil {
		s := *req.Status
		if s != "online" && s != "idle" && s != "dnd" && s != "offline" {
			http.Error(w, `{"error":"invalid status"}`, http.StatusBadRequest)
			return
		}
	}

	query := `
		UPDATE users
		SET display_name = COALESCE($1, display_name),
		    avatar_url = COALESCE($2, avatar_url),
		    banner_url = COALESCE($3, banner_url),
		    bio = COALESCE($4, bio),
		    status = COALESCE($5, status),
		    custom_status = COALESCE($6, custom_status),
		    updated_at = CURRENT_TIMESTAMP
		WHERE id = $7
		RETURNING id, username, email, display_name, avatar_url, banner_url, bio, status, custom_status, created_at, updated_at
	`
	var user models.User
	err := h.db.Pool.QueryRow(r.Context(), query,
		req.DisplayName, req.AvatarURL, req.BannerURL, req.Bio, req.Status, req.CustomStatus, userID,
	).Scan(
		&user.ID, &user.Username, &user.Email, &user.DisplayName, &user.AvatarURL, &user.BannerURL,
		&user.Bio, &user.Status, &user.CustomStatus, &user.CreatedAt, &user.UpdatedAt,
	)
	if err != nil {
		http.Error(w, `{"error":"failed to update profile"}`, http.StatusInternalServerError)
		return
	}

	publicUser := user.ToPublic()

	// Broadcast user profile update globally or to guilds
	h.hub.BroadcastGlobal(models.WSEvent{
		Type: models.EventUserUpdate,
		Data: publicUser,
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(user)
}

func (h *UserHandler) BlockUser(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	targetIDStr := chi.URLParam(r, "id")
	targetID, err := uuid.Parse(targetIDStr)
	if err != nil || targetID == userID {
		http.Error(w, `{"error":"invalid target user id"}`, http.StatusBadRequest)
		return
	}

	// 1. Insert into user_blocks
	_, err = h.db.Pool.Exec(r.Context(), `
		INSERT INTO user_blocks (user_id, blocked_user_id)
		VALUES ($1, $2)
		ON CONFLICT (user_id, blocked_user_id) DO NOTHING
	`, userID, targetID)
	if err != nil {
		http.Error(w, `{"error":"failed to block user"}`, http.StatusInternalServerError)
		return
	}

	// 2. Remove any friendship between them
	h.db.Pool.Exec(r.Context(), `
		DELETE FROM friendships
		WHERE (user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)
	`, userID, targetID)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"success": true, "blocked_user_id": targetID})
}

func (h *UserHandler) UnblockUser(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	targetIDStr := chi.URLParam(r, "id")
	targetID, err := uuid.Parse(targetIDStr)
	if err != nil {
		http.Error(w, `{"error":"invalid target user id"}`, http.StatusBadRequest)
		return
	}

	_, err = h.db.Pool.Exec(r.Context(), "DELETE FROM user_blocks WHERE user_id = $1 AND blocked_user_id = $2", userID, targetID)
	if err != nil {
		http.Error(w, `{"error":"failed to unblock user"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"success": true, "unblocked_user_id": targetID})
}

func (h *UserHandler) ListBlockedUsers(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	query := `
		SELECT u.id, u.username, u.display_name, u.avatar_url, u.banner_url, u.bio, u.status, u.custom_status, ub.created_at
		FROM user_blocks ub
		INNER JOIN users u ON u.id = ub.blocked_user_id
		WHERE ub.user_id = $1
		ORDER BY ub.created_at DESC
	`
	rows, err := h.db.Pool.Query(r.Context(), query, userID)
	if err != nil {
		http.Error(w, `{"error":"failed to list blocked users"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	blocked := make([]models.UserPublic, 0)
	for rows.Next() {
		var u models.UserPublic
		var createdAt any
		if err := rows.Scan(&u.ID, &u.Username, &u.DisplayName, &u.AvatarURL, &u.BannerURL, &u.Bio, &u.Status, &u.CustomStatus, &createdAt); err == nil {
			blocked = append(blocked, u)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(blocked)
}
