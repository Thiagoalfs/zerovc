package handlers

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/google/uuid"
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
	Code     string `json:"code,omitempty"` // Optional 2FA TOTP code
}

type AuthResponse struct {
	Token       string            `json:"token,omitempty"`
	Requires2FA bool              `json:"requires_2fa,omitempty"`
	User        models.UserPublic `json:"user,omitempty"`
}

func setAuthCookie(w http.ResponseWriter, token string) {
	http.SetCookie(w, &http.Cookie{
		Name:     "token",
		Value:    token,
		Path:     "/",
		MaxAge:   30 * 24 * 3600, // 30 days
		HttpOnly: true,
		Secure:   false, // Allows HTTP and HTTPS without breaking local/VPS setups
		SameSite: http.SameSiteLaxMode,
	})
}

func clearAuthCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     "token",
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	})
}

func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	var req RegisterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request payload"}`, http.StatusBadRequest)
		return
	}

	req.Username = strings.TrimSpace(req.Username)
	req.Email = strings.TrimSpace(strings.ToLower(req.Email))

	if len(req.Username) < 2 || len(req.Password) < 6 || req.Email == "" {
		http.Error(w, `{"error":"usuário mínimo 2 caracteres, senha mínimo 6 caracteres, e-mail obrigatório"}`, http.StatusBadRequest)
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
		RETURNING id, username, email, display_name, avatar_url, banner_url, bio, status, custom_status, COALESCE(two_factor_secret, ''), created_at, updated_at
	`
	err = h.db.Pool.QueryRow(r.Context(), query, req.Username, req.Email, hash).Scan(
		&user.ID, &user.Username, &user.Email, &user.DisplayName, &user.AvatarURL, &user.BannerURL, &user.Bio, &user.Status, &user.CustomStatus, &user.TwoFactorSecret, &user.CreatedAt, &user.UpdatedAt,
	)
	if err != nil {
		http.Error(w, `{"error":"nome de usuário ou e-mail já cadastrado"}`, http.StatusConflict)
		return
	}

	user.TwoFactorEnabled = user.TwoFactorSecret != ""

	token, err := h.auth.GenerateToken(user.ID, user.Username)
	if err != nil {
		http.Error(w, `{"error":"failed to generate token"}`, http.StatusInternalServerError)
		return
	}

	// Set HttpOnly session cookie
	setAuthCookie(w, token)

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

	req.Email = strings.TrimSpace(strings.ToLower(req.Email))

	var user models.User
	query := `
		SELECT id, username, email, password_hash, display_name, avatar_url, banner_url, bio, status, custom_status, COALESCE(two_factor_secret, ''), created_at, updated_at
		FROM users
		WHERE email = $1 OR username = $1
	`
	err := h.db.Pool.QueryRow(r.Context(), query, req.Email).Scan(
		&user.ID, &user.Username, &user.Email, &user.PasswordHash, &user.DisplayName, &user.AvatarURL, &user.BannerURL, &user.Bio, &user.Status, &user.CustomStatus, &user.TwoFactorSecret, &user.CreatedAt, &user.UpdatedAt,
	)
	if err != nil || !h.auth.CheckPassword(req.Password, user.PasswordHash) {
		http.Error(w, `{"error":"e-mail ou senha incorretos"}`, http.StatusUnauthorized)
		return
	}

	// Check 2FA requirement
	if user.TwoFactorSecret != "" {
		if req.Code == "" {
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(AuthResponse{
				Requires2FA: true,
			})
			return
		}

		if !auth.VerifyTOTPCode(user.TwoFactorSecret, req.Code) {
			http.Error(w, `{"error":"código de autenticação de dois fatores inválido"}`, http.StatusUnauthorized)
			return
		}
	}

	user.TwoFactorEnabled = user.TwoFactorSecret != ""

	token, err := h.auth.GenerateToken(user.ID, user.Username)
	if err != nil {
		http.Error(w, `{"error":"failed to generate token"}`, http.StatusInternalServerError)
		return
	}

	// Set HttpOnly session cookie
	setAuthCookie(w, token)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(AuthResponse{
		Token: token,
		User:  user.ToPublic(),
	})
}

func (h *AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	clearAuthCookie(w)
	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(`{"message":"logged out successfully"}`))
}

func (h *AuthHandler) Me(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var user models.User
	query := `
		SELECT id, username, email, display_name, avatar_url, banner_url, bio, status, custom_status, COALESCE(two_factor_secret, ''), created_at, updated_at
		FROM users
		WHERE id = $1
	`
	err := h.db.Pool.QueryRow(r.Context(), query, userID).Scan(
		&user.ID, &user.Username, &user.Email, &user.DisplayName, &user.AvatarURL, &user.BannerURL, &user.Bio, &user.Status, &user.CustomStatus, &user.TwoFactorSecret, &user.CreatedAt, &user.UpdatedAt,
	)
	if err != nil {
		http.Error(w, `{"error":"user not found"}`, http.StatusNotFound)
		return
	}

	user.TwoFactorEnabled = user.TwoFactorSecret != ""

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(user)
}

// 2FA Endpoints

func (h *AuthHandler) Generate2FA(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var username, email string
	err := h.db.Pool.QueryRow(r.Context(), "SELECT username, email FROM users WHERE id = $1", userID).Scan(&username, &email)
	if err != nil {
		http.Error(w, `{"error":"user not found"}`, http.StatusNotFound)
		return
	}

	secret, err := auth.GenerateTOTPSecret()
	if err != nil {
		http.Error(w, `{"error":"failed to generate 2fa secret"}`, http.StatusInternalServerError)
		return
	}

	otpauthURI := auth.GetTOTPAuthURI(username, "ZeroVC", secret)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"secret":      secret,
		"otpauth_uri": otpauthURI,
	})
}

func (h *AuthHandler) Enable2FA(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var req struct {
		Secret string `json:"secret"`
		Code   string `json:"code"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Secret == "" || req.Code == "" {
		http.Error(w, `{"error":"secret e código de 6 dígitos são obrigatórios"}`, http.StatusBadRequest)
		return
	}

	if !auth.VerifyTOTPCode(req.Secret, req.Code) {
		http.Error(w, `{"error":"código de verificação inválido"}`, http.StatusBadRequest)
		return
	}

	_, err := h.db.Pool.Exec(r.Context(), "UPDATE users SET two_factor_secret = $1 WHERE id = $2", req.Secret, userID)
	if err != nil {
		http.Error(w, `{"error":"failed to save 2fa"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"success":            true,
		"two_factor_enabled": true,
	})
}

func (h *AuthHandler) Disable2FA(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var req struct {
		Password string `json:"password"`
		Code     string `json:"code"`
	}
	json.NewDecoder(r.Body).Decode(&req)

	var passwordHash, secret string
	err := h.db.Pool.QueryRow(r.Context(), "SELECT password_hash, COALESCE(two_factor_secret, '') FROM users WHERE id = $1", userID).Scan(&passwordHash, &secret)
	if err != nil {
		http.Error(w, `{"error":"user not found"}`, http.StatusNotFound)
		return
	}

	valid := false
	if req.Password != "" && h.auth.CheckPassword(req.Password, passwordHash) {
		valid = true
	} else if req.Code != "" && secret != "" && auth.VerifyTOTPCode(secret, req.Code) {
		valid = true
	}

	if !valid {
		http.Error(w, `{"error":"senha ou código 2FA incorreto"}`, http.StatusUnauthorized)
		return
	}

	_, err = h.db.Pool.Exec(r.Context(), "UPDATE users SET two_factor_secret = '' WHERE id = $1", userID)
	if err != nil {
		http.Error(w, `{"error":"failed to disable 2fa"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"success":            true,
		"two_factor_enabled": false,
	})
}

func (h *AuthHandler) ChangePassword(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var req struct {
		CurrentPassword string `json:"current_password"`
		NewPassword     string `json:"new_password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request"}`, http.StatusBadRequest)
		return
	}

	if len(req.NewPassword) < 6 {
		http.Error(w, `{"error":"a nova senha deve ter pelo menos 6 caracteres"}`, http.StatusBadRequest)
		return
	}

	var currentHash string
	err := h.db.Pool.QueryRow(r.Context(), "SELECT password_hash FROM users WHERE id = $1", userID).Scan(&currentHash)
	if err != nil || !h.auth.CheckPassword(req.CurrentPassword, currentHash) {
		http.Error(w, `{"error":"senha atual incorreta"}`, http.StatusUnauthorized)
		return
	}

	newHash, err := h.auth.HashPassword(req.NewPassword)
	if err != nil {
		http.Error(w, `{"error":"failed to hash new password"}`, http.StatusInternalServerError)
		return
	}

	_, err = h.db.Pool.Exec(r.Context(), "UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2", newHash, userID)
	if err != nil {
		http.Error(w, `{"error":"failed to update password"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"success": true, "message": "senha alterada com sucesso"})
}

func (h *AuthHandler) ChangeEmail(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var req struct {
		Password string `json:"password"`
		NewEmail string `json:"new_email"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request"}`, http.StatusBadRequest)
		return
	}

	newEmail := strings.TrimSpace(strings.ToLower(req.NewEmail))
	if newEmail == "" || !strings.Contains(newEmail, "@") {
		http.Error(w, `{"error":"e-mail inválido"}`, http.StatusBadRequest)
		return
	}

	var currentHash string
	err := h.db.Pool.QueryRow(r.Context(), "SELECT password_hash FROM users WHERE id = $1", userID).Scan(&currentHash)
	if err != nil || !h.auth.CheckPassword(req.Password, currentHash) {
		http.Error(w, `{"error":"senha incorreta"}`, http.StatusUnauthorized)
		return
	}

	var exists bool
	h.db.Pool.QueryRow(r.Context(), "SELECT EXISTS(SELECT 1 FROM users WHERE email = $1 AND id != $2)", newEmail, userID).Scan(&exists)
	if exists {
		http.Error(w, `{"error":"este e-mail já está sendo utilizado por outra conta"}`, http.StatusConflict)
		return
	}

	_, err = h.db.Pool.Exec(r.Context(), "UPDATE users SET email = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2", newEmail, userID)
	if err != nil {
		http.Error(w, `{"error":"failed to update email"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"success": true, "email": newEmail})
}
