package handlers

import (
	"encoding/json"
	"net/http"
	"regexp"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/zerovc/zerovc/backend/internal/auth"
	"github.com/zerovc/zerovc/backend/internal/database"
	"github.com/zerovc/zerovc/backend/internal/gateway"
	"github.com/zerovc/zerovc/backend/internal/models"
)

var validProfileUsernameRegex = regexp.MustCompile(`^[a-zA-Z0-9]+$`)

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
	Username     *string `json:"username,omitempty"`
	PhoneNumber  *string `json:"phone_number,omitempty"`
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

	// Validate username if provided
	if req.Username != nil {
		un := strings.TrimSpace(*req.Username)
		if len(un) < 2 || len(un) > 32 || !validProfileUsernameRegex.MatchString(un) {
			http.Error(w, `{"error":"O nome de usuário (@) deve conter apenas letras e números (2 a 32 caracteres), sem espaços ou símbolos"}`, http.StatusBadRequest)
			return
		}
		*req.Username = un

		// Check if username is already taken by another account
		var exists bool
		err := h.db.Pool.QueryRow(r.Context(), "SELECT EXISTS(SELECT 1 FROM users WHERE LOWER(username) = LOWER($1) AND id != $2)", un, userID).Scan(&exists)
		if err != nil {
			http.Error(w, `{"error":"erro ao verificar disponibilidade do nome de usuário"}`, http.StatusInternalServerError)
			return
		}
		if exists {
			http.Error(w, `{"error":"Este nome de usuário (@) já está em uso por outra conta"}`, http.StatusConflict)
			return
		}
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
		SET username = COALESCE($1, username),
		    phone_number = COALESCE($2, phone_number),
		    display_name = COALESCE($3, display_name),
		    avatar_url = COALESCE($4, avatar_url),
		    banner_url = COALESCE($5, banner_url),
		    bio = COALESCE($6, bio),
		    status = COALESCE($7, status),
		    custom_status = COALESCE($8, custom_status),
		    updated_at = CURRENT_TIMESTAMP
		WHERE id = $9
		RETURNING id, username, email, COALESCE(phone_number, ''), display_name, avatar_url, banner_url, bio, status, custom_status, created_at, updated_at
	`
	var user models.User
	err := h.db.Pool.QueryRow(r.Context(), query,
		req.Username, req.PhoneNumber, req.DisplayName, req.AvatarURL, req.BannerURL, req.Bio, req.Status, req.CustomStatus, userID,
	).Scan(
		&user.ID, &user.Username, &user.Email, &user.PhoneNumber, &user.DisplayName, &user.AvatarURL, &user.BannerURL,
		&user.Bio, &user.Status, &user.CustomStatus, &user.CreatedAt, &user.UpdatedAt,
	)
	if err != nil {
		http.Error(w, `{"error":"falha ao atualizar perfil"}`, http.StatusInternalServerError)
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

func (h *UserHandler) GetFavoriteGIFs(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	query := `
		SELECT id, user_id, gif_url, preview_url, title, created_at
		FROM user_favorite_gifs
		WHERE user_id = $1
		ORDER BY created_at DESC
	`
	rows, err := h.db.Pool.Query(r.Context(), query, userID)
	if err != nil {
		http.Error(w, `{"error":"failed to query favorite gifs"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	favorites := make([]models.FavoriteGIF, 0)
	for rows.Next() {
		var g models.FavoriteGIF
		if err := rows.Scan(&g.ID, &g.UserID, &g.GIFURL, &g.PreviewURL, &g.Title, &g.CreatedAt); err == nil {
			favorites = append(favorites, g)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(favorites)
}

func (h *UserHandler) AddFavoriteGIF(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var req struct {
		GIFURL     string `json:"gif_url"`
		PreviewURL string `json:"preview_url,omitempty"`
		Title      string `json:"title,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || strings.TrimSpace(req.GIFURL) == "" {
		http.Error(w, `{"error":"gif_url is required"}`, http.StatusBadRequest)
		return
	}

	var g models.FavoriteGIF
	query := `
		INSERT INTO user_favorite_gifs (user_id, gif_url, preview_url, title)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (user_id, gif_url) DO UPDATE
		SET created_at = CURRENT_TIMESTAMP
		RETURNING id, user_id, gif_url, preview_url, title, created_at
	`
	err := h.db.Pool.QueryRow(r.Context(), query, userID, strings.TrimSpace(req.GIFURL), strings.TrimSpace(req.PreviewURL), strings.TrimSpace(req.Title)).Scan(
		&g.ID, &g.UserID, &g.GIFURL, &g.PreviewURL, &g.Title, &g.CreatedAt,
	)
	if err != nil {
		http.Error(w, `{"error":"failed to save favorite gif"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(g)
}

func (h *UserHandler) RemoveFavoriteGIF(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var req struct {
		GIFURL string `json:"gif_url"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || strings.TrimSpace(req.GIFURL) == "" {
		http.Error(w, `{"error":"gif_url is required"}`, http.StatusBadRequest)
		return
	}

	_, err := h.db.Pool.Exec(r.Context(), "DELETE FROM user_favorite_gifs WHERE user_id = $1 AND gif_url = $2", userID, strings.TrimSpace(req.GIFURL))
	if err != nil {
		http.Error(w, `{"error":"failed to remove favorite gif"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"success": true})
}

func (h *UserHandler) BlockUser(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	targetIDStr := chi.URLParam(r, "id")
	targetID, err := uuid.Parse(targetIDStr)
	if err != nil {
		http.Error(w, `{"error":"invalid user id"}`, http.StatusBadRequest)
		return
	}

	if userID == targetID {
		http.Error(w, `{"error":"cannot block yourself"}`, http.StatusBadRequest)
		return
	}

	tx, err := h.db.Pool.Begin(r.Context())
	if err != nil {
		http.Error(w, `{"error":"failed to start transaction"}`, http.StatusInternalServerError)
		return
	}
	defer tx.Rollback(r.Context())

	// 1. Insert block
	_, err = tx.Exec(r.Context(), `
		INSERT INTO user_blocks (user_id, blocked_user_id)
		VALUES ($1, $2)
		ON CONFLICT (user_id, blocked_user_id) DO NOTHING
	`, userID, targetID)
	if err != nil {
		http.Error(w, `{"error":"failed to block user"}`, http.StatusInternalServerError)
		return
	}

	// 2. Remove any friendship between both
	_, _ = tx.Exec(r.Context(), `
		DELETE FROM friendships
		WHERE (user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)
	`, userID, targetID)

	if err := tx.Commit(r.Context()); err != nil {
		http.Error(w, `{"error":"failed to commit"}`, http.StatusInternalServerError)
		return
	}

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
		http.Error(w, `{"error":"invalid user id"}`, http.StatusBadRequest)
		return
	}

	_, err = h.db.Pool.Exec(r.Context(), `
		DELETE FROM user_blocks
		WHERE user_id = $1 AND blocked_user_id = $2
	`, userID, targetID)
	if err != nil {
		http.Error(w, `{"error":"failed to unblock user"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"success": true, "unblocked_user_id": targetID})
}

