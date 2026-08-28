package handlers

import (
	"encoding/json"
	"net/http"

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
