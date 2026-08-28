package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/zerovc/zerovc/backend/internal/auth"
	"github.com/zerovc/zerovc/backend/internal/database"
	"github.com/zerovc/zerovc/backend/internal/models"
)

type AuthHandler struct {
	db   *database.DB
	auth *auth.Service
}

func NewAuthHandler(db *database.DB, authService *auth.Service) *AuthHandler {
	return &AuthHandler{
		db:   db,
		auth: authService,
	}
}

type RegisterRequest struct {
	Username string `json:"username"`
	Email    string `json:"email"`
	Password string `json:"password"`
}

type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type AuthResponse struct {
	Token string            `json:"token"`
	User  models.UserPublic `json:"user"`
}

func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	var req RegisterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request payload"}`, http.StatusBadRequest)
		return
	}

	if len(req.Username) < 2 || len(req.Password) < 6 || req.Email == "" {
		http.Error(w, `{"error":"username min 2 chars, password min 6 chars, email required"}`, http.StatusBadRequest)
		return
	}

	hash, err := h.auth.HashPassword(req.Password)
	if err != nil {
		http.Error(w, `{"error":"failed to hash password"}`, http.StatusInternalServerError)
		return
	}

	var user models.User
	query := `
		INSERT INTO users (username, email, password_hash, status)
		VALUES ($1, $2, $3, 'online')
		RETURNING id, username, email, avatar_url, status, custom_status, created_at, updated_at
	`
	err = h.db.Pool.QueryRow(r.Context(), query, req.Username, req.Email, hash).Scan(
		&user.ID, &user.Username, &user.Email, &user.AvatarURL, &user.Status, &user.CustomStatus, &user.CreatedAt, &user.UpdatedAt,
	)
	if err != nil {
		http.Error(w, `{"error":"username or email already registered"}`, http.StatusConflict)
		return
	}

	token, err := h.auth.GenerateToken(user.ID, user.Username)
	if err != nil {
		http.Error(w, `{"error":"failed to generate token"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(AuthResponse{
		Token: token,
		User:  user.ToPublic(),
	})
}

func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var req LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request payload"}`, http.StatusBadRequest)
		return
	}

	var user models.User
	query := `
		SELECT id, username, email, password_hash, avatar_url, status, custom_status, created_at, updated_at
		FROM users
		WHERE email = $1
	`
	err := h.db.Pool.QueryRow(r.Context(), query, req.Email).Scan(
		&user.ID, &user.Username, &user.Email, &user.PasswordHash, &user.AvatarURL, &user.Status, &user.CustomStatus, &user.CreatedAt, &user.UpdatedAt,
	)
	if err != nil || !h.auth.CheckPassword(req.Password, user.PasswordHash) {
		http.Error(w, `{"error":"invalid email or password"}`, http.StatusUnauthorized)
		return
	}

	token, err := h.auth.GenerateToken(user.ID, user.Username)
	if err != nil {
		http.Error(w, `{"error":"failed to generate token"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(AuthResponse{
		Token: token,
		User:  user.ToPublic(),
	})
}

func (h *AuthHandler) Me(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var user models.User
	query := `
		SELECT id, username, email, avatar_url, status, custom_status, created_at, updated_at
		FROM users
		WHERE id = $1
	`
	err := h.db.Pool.QueryRow(r.Context(), query, userID).Scan(
		&user.ID, &user.Username, &user.Email, &user.AvatarURL, &user.Status, &user.CustomStatus, &user.CreatedAt, &user.UpdatedAt,
	)
	if err != nil {
		http.Error(w, `{"error":"user not found"}`, http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(user)
}
