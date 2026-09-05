package handlers

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/zerovc/zerovc/backend/internal/auth"
	"github.com/zerovc/zerovc/backend/internal/database"
	"github.com/zerovc/zerovc/backend/internal/models"
)

var validUsernameRegex = regexp.MustCompile(`^[a-zA-Z0-9]+$`)

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

	if len(req.Username) < 2 || len(req.Username) > 32 || !validUsernameRegex.MatchString(req.Username) {
		http.Error(w, `{"error":"O nome de usuário (@) deve conter apenas letras e números (2 a 32 caracteres), sem espaços ou símbolos"}`, http.StatusBadRequest)
		return
	}

	if len(req.Password) < 6 || req.Email == "" {
		http.Error(w, `{"error":"senha mínimo 6 caracteres, e-mail obrigatório"}`, http.StatusBadRequest)
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
		RETURNING id, username, email, COALESCE(phone_number, ''), display_name, avatar_url, banner_url, bio, status, custom_status, COALESCE(two_factor_secret, ''), created_at, updated_at
	`
	err = h.db.Pool.QueryRow(r.Context(), query, req.Username, req.Email, hash).Scan(
		&user.ID, &user.Username, &user.Email, &user.PhoneNumber, &user.DisplayName, &user.AvatarURL, &user.BannerURL, &user.Bio, &user.Status, &user.CustomStatus, &user.TwoFactorSecret, &user.CreatedAt, &user.UpdatedAt,
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

		cleanCode := strings.TrimSpace(req.Code)
		totpValid := auth.VerifyTOTPCode(user.TwoFactorSecret, cleanCode)
		if !totpValid {
			// Check if it's a valid unused backup code
			backupHash := auth.HashBackupCode(cleanCode)
			var backupID uuid.UUID
			err := h.db.Pool.QueryRow(r.Context(), `
				SELECT id FROM user_2fa_backup_codes
				WHERE user_id = $1 AND code_hash = $2 AND used_at IS NULL
			`, user.ID, backupHash).Scan(&backupID)

			if err == nil {
				// Mark backup code as used
				h.db.Pool.Exec(r.Context(), `UPDATE user_2fa_backup_codes SET used_at = CURRENT_TIMESTAMP WHERE id = $1`, backupID)
			} else {
				http.Error(w, `{"error":"código 2FA ou código de backup inválido"}`, http.StatusUnauthorized)
				return
			}
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
		SELECT id, username, email, COALESCE(phone_number, ''), display_name, avatar_url, banner_url, bio, status, custom_status, COALESCE(two_factor_secret, ''), created_at, updated_at
		FROM users
		WHERE id = $1
	`
	err := h.db.Pool.QueryRow(r.Context(), query, userID).Scan(
		&user.ID, &user.Username, &user.Email, &user.PhoneNumber, &user.DisplayName, &user.AvatarURL, &user.BannerURL, &user.Bio, &user.Status, &user.CustomStatus, &user.TwoFactorSecret, &user.CreatedAt, &user.UpdatedAt,
	)
	if err != nil {
		http.Error(w, `{"error":"user not found"}`, http.StatusNotFound)
		return
	}

	user.TwoFactorEnabled = user.TwoFactorSecret != ""

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(user)
}

func (h *AuthHandler) ChangePhone(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var req struct {
		Password    string `json:"password"`
		PhoneNumber string `json:"phone_number"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request"}`, http.StatusBadRequest)
		return
	}

	var passwordHash string
	err := h.db.Pool.QueryRow(r.Context(), "SELECT password_hash FROM users WHERE id = $1", userID).Scan(&passwordHash)
	if err != nil || !h.auth.CheckPassword(req.Password, passwordHash) {
		http.Error(w, `{"error":"senha atual incorreta"}`, http.StatusUnauthorized)
		return
	}

	phone := strings.TrimSpace(req.PhoneNumber)
	_, err = h.db.Pool.Exec(r.Context(), "UPDATE users SET phone_number = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2", phone, userID)
	if err != nil {
		http.Error(w, `{"error":"failed to update phone number"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"success": true, "phone_number": phone})
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

	codes, hashes, err := auth.GenerateBackupCodes(8)
	if err != nil {
		http.Error(w, `{"error":"falha ao gerar códigos de backup"}`, http.StatusInternalServerError)
		return
	}

	tx, err := h.db.Pool.Begin(r.Context())
	if err != nil {
		http.Error(w, `{"error":"failed to start transaction"}`, http.StatusInternalServerError)
		return
	}
	defer tx.Rollback(r.Context())

	_, err = tx.Exec(r.Context(), "UPDATE users SET two_factor_secret = $1 WHERE id = $2", req.Secret, userID)
	if err != nil {
		http.Error(w, `{"error":"failed to save 2fa"}`, http.StatusInternalServerError)
		return
	}

	_, _ = tx.Exec(r.Context(), "DELETE FROM user_2fa_backup_codes WHERE user_id = $1", userID)

	for _, hCode := range hashes {
		_, err := tx.Exec(r.Context(), "INSERT INTO user_2fa_backup_codes (user_id, code_hash) VALUES ($1, $2)", userID, hCode)
		if err != nil {
			http.Error(w, `{"error":"failed to store backup codes"}`, http.StatusInternalServerError)
			return
		}
	}

	if err := tx.Commit(r.Context()); err != nil {
		http.Error(w, `{"error":"failed to commit 2fa setup"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"success":            true,
		"two_factor_enabled": true,
		"backup_codes":       codes,
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

	// Delete backup codes on disable
	_, _ = h.db.Pool.Exec(r.Context(), "DELETE FROM user_2fa_backup_codes WHERE user_id = $1", userID)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"success":            true,
		"two_factor_enabled": false,
	})
}

// LGPD / GDPR Endpoints

func (h *AuthHandler) ExportData(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	ctx := r.Context()

	// 1. User profile
	var user models.User
	queryUser := `SELECT id, username, email, COALESCE(phone_number, ''), display_name, avatar_url, banner_url, bio, status, custom_status, created_at, updated_at FROM users WHERE id = $1`
	err := h.db.Pool.QueryRow(ctx, queryUser, userID).Scan(
		&user.ID, &user.Username, &user.Email, &user.PhoneNumber, &user.DisplayName, &user.AvatarURL, &user.BannerURL, &user.Bio, &user.Status, &user.CustomStatus, &user.CreatedAt, &user.UpdatedAt,
	)
	if err != nil {
		http.Error(w, `{"error":"user not found"}`, http.StatusNotFound)
		return
	}

	// 2. Guilds joined
	type GuildSummary struct {
		ID       uuid.UUID `json:"id"`
		Name     string    `json:"name"`
		Role     string    `json:"role"`
		JoinedAt time.Time `json:"joined_at"`
	}
	guilds := make([]GuildSummary, 0)
	gRows, err := h.db.Pool.Query(ctx, `
		SELECT g.id, g.name, gm.role, gm.joined_at
		FROM guilds g
		JOIN guild_members gm ON gm.guild_id = g.id
		WHERE gm.user_id = $1
	`, userID)
	if err == nil {
		defer gRows.Close()
		for gRows.Next() {
			var gs GuildSummary
			if err := gRows.Scan(&gs.ID, &gs.Name, &gs.Role, &gs.JoinedAt); err == nil {
				guilds = append(guilds, gs)
			}
		}
	}

	// 3. Friends
	type FriendSummary struct {
		FriendID uuid.UUID `json:"friend_id"`
		Username string    `json:"username"`
		Status   string    `json:"status"`
	}
	friends := make([]FriendSummary, 0)
	fRows, err := h.db.Pool.Query(ctx, `
		SELECT CASE WHEN f.user_id = $1 THEN f.friend_id ELSE f.user_id END,
		       u.username, f.status
		FROM friendships f
		JOIN users u ON u.id = (CASE WHEN f.user_id = $1 THEN f.friend_id ELSE f.user_id END)
		WHERE f.user_id = $1 OR f.friend_id = $1
	`, userID)
	if err == nil {
		defer fRows.Close()
		for fRows.Next() {
			var fs FriendSummary
			if err := fRows.Scan(&fs.FriendID, &fs.Username, &fs.Status); err == nil {
				friends = append(friends, fs)
			}
		}
	}

	exportPayload := map[string]any{
		"exported_at": time.Now().UTC(),
		"profile": map[string]any{
			"id":            user.ID,
			"username":      user.Username,
			"email":         user.Email,
			"phone_number":  user.PhoneNumber,
			"display_name":  user.DisplayName,
			"avatar_url":    user.AvatarURL,
			"banner_url":    user.BannerURL,
			"bio":           user.Bio,
			"custom_status": user.CustomStatus,
			"created_at":    user.CreatedAt,
		},
		"guilds":  guilds,
		"friends": friends,
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Content-Disposition", `attachment; filename="zerovc-data-export.json"`)
	json.NewEncoder(w).Encode(exportPayload)
}

func (h *AuthHandler) DeleteAccount(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var req struct {
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Password == "" {
		http.Error(w, `{"error":"senha é obrigatória para confirmar a exclusão da conta"}`, http.StatusBadRequest)
		return
	}

	var passwordHash string
	err := h.db.Pool.QueryRow(r.Context(), "SELECT password_hash FROM users WHERE id = $1", userID).Scan(&passwordHash)
	if err != nil || !h.auth.CheckPassword(req.Password, passwordHash) {
		http.Error(w, `{"error":"senha incorreta"}`, http.StatusUnauthorized)
		return
	}

	// Delete user (Cascades to guild_members, messages, voice_sessions, user_blocks, guilds owned)
	_, err = h.db.Pool.Exec(r.Context(), "DELETE FROM users WHERE id = $1", userID)
	if err != nil {
		http.Error(w, `{"error":"falha ao excluir conta"}`, http.StatusInternalServerError)
		return
	}

	clearAuthCookie(w)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"success": true,
		"message": "sua conta foi excluída permanentemente",
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
