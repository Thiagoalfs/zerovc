package handlers

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"math/big"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/zerovc/zerovc/backend/internal/auth"
	"github.com/zerovc/zerovc/backend/internal/database"
	"github.com/zerovc/zerovc/backend/internal/email"
	"github.com/zerovc/zerovc/backend/internal/models"
)

var validUsernameRegex = regexp.MustCompile(`^[a-z0-9_]+$`)

type AuthHandler struct {
	db    *database.DB
	auth  *auth.Service
	email *email.Service
}

func NewAuthHandler(db *database.DB, authService *auth.Service, emailService *email.Service) *AuthHandler {
	return &AuthHandler{
		db:    db,
		auth:  authService,
		email: emailService,
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

type VerifyEmailRequest struct {
	Email string `json:"email"`
	Code  string `json:"code"`
}

type ResendVerificationRequest struct {
	Email string `json:"email"`
}

type ForgotPasswordRequest struct {
	Email string `json:"email"`
}

type VerifyResetTokenRequest struct {
	Token string `json:"token"`
}

type ResetPasswordRequest struct {
	Token       string `json:"token"`
	NewPassword string `json:"new_password"`
	Code        string `json:"code,omitempty"` // Optional 2FA TOTP or backup code
}

type AuthResponse struct {
	Token                string            `json:"token,omitempty"`
	Requires2FA          bool              `json:"requires_2fa,omitempty"`
	RequiresVerification bool              `json:"requires_verification,omitempty"`
	Email                string            `json:"email,omitempty"`
	User                 models.UserPublic `json:"user,omitempty"`
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

	req.Username = strings.TrimSpace(strings.ToLower(req.Username))
	req.Email = strings.TrimSpace(strings.ToLower(req.Email))

	if len(req.Username) < 2 || len(req.Username) > 32 || !validUsernameRegex.MatchString(req.Username) {
		http.Error(w, `{"error":"O nome de usuário (@) deve conter apenas letras minúsculas, números ou sublinhado (_) (2 a 32 caracteres), sem espaços, acentos, maiúsculas ou caracteres especiais"}`, http.StatusBadRequest)
		return
	}

	// Case-insensitive check if username already exists
	var usernameExists bool
	_ = h.db.Pool.QueryRow(r.Context(), "SELECT EXISTS(SELECT 1 FROM users WHERE LOWER(username) = LOWER($1))", req.Username).Scan(&usernameExists)
	if usernameExists {
		http.Error(w, `{"error":"Este nome de usuário (@) já está em uso por outra conta"}`, http.StatusConflict)
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
		INSERT INTO users (username, email, password_hash, status, email_verified)
		VALUES ($1, $2, $3, 'online', FALSE)
		RETURNING id, username, email, COALESCE(phone_number, ''), display_name, avatar_url, banner_url, bio, status, custom_status, COALESCE(two_factor_secret, ''), email_verified, created_at, updated_at
	`
	err = h.db.Pool.QueryRow(r.Context(), query, req.Username, req.Email, hash).Scan(
		&user.ID, &user.Username, &user.Email, &user.PhoneNumber, &user.DisplayName, &user.AvatarURL, &user.BannerURL, &user.Bio, &user.Status, &user.CustomStatus, &user.TwoFactorSecret, &user.EmailVerified, &user.CreatedAt, &user.UpdatedAt,
	)
	if err != nil {
		http.Error(w, `{"error":"nome de usuário ou e-mail já cadastrado"}`, http.StatusConflict)
		return
	}

	user.TwoFactorEnabled = user.TwoFactorSecret != ""

	// Generate 6-digit numeric verification code
	codeInt, err := rand.Int(rand.Reader, big.NewInt(900000))
	var code string
	if err != nil {
		code = fmt.Sprintf("%06d", time.Now().UnixNano()%900000+100000)
	} else {
		code = fmt.Sprintf("%06d", codeInt.Int64()+100000)
	}
	codeHash := fmt.Sprintf("%x", sha256.Sum256([]byte(code)))

	// Clean older verifications and insert new one
	h.db.Pool.Exec(r.Context(), "DELETE FROM email_verifications WHERE user_id = $1 OR LOWER(email) = $2", user.ID, user.Email)
	_, _ = h.db.Pool.Exec(r.Context(), `
		INSERT INTO email_verifications (user_id, email, code_hash, expires_at)
		VALUES ($1, $2, $3, CURRENT_TIMESTAMP + INTERVAL '15 minutes')
	`, user.ID, user.Email, codeHash)

	// Send verification email in background
	if h.email != nil {
		go func(toEmail, username, vCode string) {
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			if err := h.email.SendVerificationEmail(ctx, toEmail, username, vCode); err != nil {
				log.Printf("[Auth] Failed to send verification email to %s: %v", toEmail, err)
			}
		}(user.Email, user.Username, code)
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(AuthResponse{
		RequiresVerification: true,
		Email:                user.Email,
		User:                 user.ToPublic(),
	})
}

func (h *AuthHandler) VerifyEmail(w http.ResponseWriter, r *http.Request) {
	var req VerifyEmailRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request payload"}`, http.StatusBadRequest)
		return
	}

	req.Email = strings.TrimSpace(strings.ToLower(req.Email))
	req.Code = strings.TrimSpace(req.Code)

	if req.Email == "" || len(req.Code) != 6 {
		http.Error(w, `{"error":"código de verificação inválido (deve ter 6 dígitos)"}`, http.StatusBadRequest)
		return
	}

	var attempts int
	err := h.db.Pool.QueryRow(r.Context(), `
		UPDATE email_verifications
		SET attempts = attempts + 1
		WHERE LOWER(email) = $1 AND expires_at > CURRENT_TIMESTAMP
		RETURNING attempts
	`, req.Email).Scan(&attempts)

	if err == nil && attempts > 8 {
		h.db.Pool.Exec(r.Context(), "DELETE FROM email_verifications WHERE LOWER(email) = $1", req.Email)
		http.Error(w, `{"error":"Muitas tentativas. Solicite um novo código."}`, http.StatusTooManyRequests)
		return
	}

	codeHash := fmt.Sprintf("%x", sha256.Sum256([]byte(req.Code)))

	var userID uuid.UUID
	var username string
	query := `
		SELECT ev.user_id, u.username
		FROM email_verifications ev
		INNER JOIN users u ON u.id = ev.user_id
		WHERE LOWER(ev.email) = $1 AND ev.code_hash = $2 AND ev.expires_at > CURRENT_TIMESTAMP
		ORDER BY ev.created_at DESC
		LIMIT 1
	`
	err = h.db.Pool.QueryRow(r.Context(), query, req.Email, codeHash).Scan(&userID, &username)
	if err != nil {
		http.Error(w, `{"error":"Código de verificação inválido ou expirado."}`, http.StatusBadRequest)
		return
	}

	// Update user as verified
	_, err = h.db.Pool.Exec(r.Context(), "UPDATE users SET email_verified = TRUE, updated_at = CURRENT_TIMESTAMP WHERE id = $1", userID)
	if err != nil {
		http.Error(w, `{"error":"failed to update verification status"}`, http.StatusInternalServerError)
		return
	}

	// Clean used verification records
	h.db.Pool.Exec(r.Context(), "DELETE FROM email_verifications WHERE user_id = $1 OR LOWER(email) = $2", userID, req.Email)

	// Fetch updated user
	var user models.User
	userQuery := `
		SELECT id, username, email, COALESCE(phone_number, ''), display_name, avatar_url, banner_url, bio, status, custom_status, COALESCE(two_factor_secret, ''), email_verified, created_at, updated_at
		FROM users
		WHERE id = $1
	`
	_ = h.db.Pool.QueryRow(r.Context(), userQuery, userID).Scan(
		&user.ID, &user.Username, &user.Email, &user.PhoneNumber, &user.DisplayName, &user.AvatarURL, &user.BannerURL, &user.Bio, &user.Status, &user.CustomStatus, &user.TwoFactorSecret, &user.EmailVerified, &user.CreatedAt, &user.UpdatedAt,
	)

	user.TwoFactorEnabled = user.TwoFactorSecret != ""

	token, err := h.auth.GenerateToken(user.ID, user.Username)
	if err != nil {
		http.Error(w, `{"error":"failed to generate token"}`, http.StatusInternalServerError)
		return
	}

	setAuthCookie(w, token)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(AuthResponse{
		Token: token,
		User:  user.ToPublic(),
	})
}

func (h *AuthHandler) ResendVerification(w http.ResponseWriter, r *http.Request) {
	var req ResendVerificationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request payload"}`, http.StatusBadRequest)
		return
	}

	req.Email = strings.TrimSpace(strings.ToLower(req.Email))
	if req.Email == "" {
		http.Error(w, `{"error":"e-mail obrigatório"}`, http.StatusBadRequest)
		return
	}

	var user models.User
	query := `
		SELECT id, username, email, email_verified
		FROM users
		WHERE LOWER(email) = $1 OR LOWER(username) = $1
	`
	err := h.db.Pool.QueryRow(r.Context(), query, req.Email).Scan(&user.ID, &user.Username, &user.Email, &user.EmailVerified)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"message":"Se a conta existir, um novo código foi enviado."}`))
		return
	}

	if user.EmailVerified {
		http.Error(w, `{"error":"Este e-mail já foi verificado. Faça login diretamente."}`, http.StatusBadRequest)
		return
	}

	// Rate limit: check if a code was created less than 60s ago
	var recentCount int
	_ = h.db.Pool.QueryRow(r.Context(), `
		SELECT COUNT(*) FROM email_verifications
		WHERE user_id = $1 AND created_at > (CURRENT_TIMESTAMP - INTERVAL '60 seconds')
	`, user.ID).Scan(&recentCount)
	if recentCount > 0 {
		http.Error(w, `{"error":"Aguarde 60 segundos antes de solicitar um novo código."}`, http.StatusTooManyRequests)
		return
	}

	codeInt, err := rand.Int(rand.Reader, big.NewInt(900000))
	var code string
	if err != nil {
		code = fmt.Sprintf("%06d", time.Now().UnixNano()%900000+100000)
	} else {
		code = fmt.Sprintf("%06d", codeInt.Int64()+100000)
	}
	codeHash := fmt.Sprintf("%x", sha256.Sum256([]byte(code)))

	h.db.Pool.Exec(r.Context(), "DELETE FROM email_verifications WHERE user_id = $1 OR LOWER(email) = $2", user.ID, user.Email)
	_, _ = h.db.Pool.Exec(r.Context(), `
		INSERT INTO email_verifications (user_id, email, code_hash, expires_at)
		VALUES ($1, $2, $3, CURRENT_TIMESTAMP + INTERVAL '15 minutes')
	`, user.ID, user.Email, codeHash)

	if h.email != nil {
		go func(toEmail, username, vCode string) {
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			if err := h.email.SendVerificationEmail(ctx, toEmail, username, vCode); err != nil {
				log.Printf("[Auth] Failed to send verification email to %s: %v", toEmail, err)
			}
		}(user.Email, user.Username, code)
	}

	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(`{"message":"Código reenviado com sucesso para o seu e-mail."}`))
}

func (h *AuthHandler) ForgotPassword(w http.ResponseWriter, r *http.Request) {
	var req ForgotPasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request payload"}`, http.StatusBadRequest)
		return
	}

	req.Email = strings.TrimSpace(strings.ToLower(req.Email))
	if req.Email == "" {
		http.Error(w, `{"error":"e-mail obrigatório"}`, http.StatusBadRequest)
		return
	}

	var user models.User
	query := `
		SELECT id, username, email
		FROM users
		WHERE LOWER(email) = $1 OR LOWER(username) = $1
	`
	err := h.db.Pool.QueryRow(r.Context(), query, req.Email).Scan(&user.ID, &user.Username, &user.Email)
	if err == nil {
		// Generate random secure token of 32 bytes
		tokenBytes := make([]byte, 32)
		_, _ = rand.Read(tokenBytes)
		token := hex.EncodeToString(tokenBytes)
		tokenHash := fmt.Sprintf("%x", sha256.Sum256([]byte(token)))

		// Clean previous unused resets for user
		h.db.Pool.Exec(r.Context(), "DELETE FROM password_resets WHERE user_id = $1", user.ID)
		_, _ = h.db.Pool.Exec(r.Context(), `
			INSERT INTO password_resets (user_id, token_hash, expires_at)
			VALUES ($1, $2, CURRENT_TIMESTAMP + INTERVAL '15 minutes')
		`, user.ID, tokenHash)

		if h.email != nil {
			go func(toEmail, username, rToken string) {
				ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
				defer cancel()
				if err := h.email.SendPasswordResetEmail(ctx, toEmail, username, rToken); err != nil {
					log.Printf("[Auth] Failed to send password reset email to %s: %v", toEmail, err)
				}
			}(user.Email, user.Username, token)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(`{"message":"Se a conta informada existir, um e-mail com as instruções para redefinição de senha foi enviado."}`))
}

func (h *AuthHandler) VerifyResetToken(w http.ResponseWriter, r *http.Request) {
	var req VerifyResetTokenRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request payload"}`, http.StatusBadRequest)
		return
	}

	token := strings.TrimSpace(req.Token)
	if token == "" {
		http.Error(w, `{"error":"token obrigatório"}`, http.StatusBadRequest)
		return
	}

	tokenHash := fmt.Sprintf("%x", sha256.Sum256([]byte(token)))

	var userID uuid.UUID
	var username string
	var twoFactorSecret string
	query := `
		SELECT pr.user_id, u.username, COALESCE(u.two_factor_secret, '')
		FROM password_resets pr
		INNER JOIN users u ON u.id = pr.user_id
		WHERE pr.token_hash = $1 AND pr.used_at IS NULL AND pr.expires_at > CURRENT_TIMESTAMP
		LIMIT 1
	`
	err := h.db.Pool.QueryRow(r.Context(), query, tokenHash).Scan(&userID, &username, &twoFactorSecret)
	if err != nil {
		http.Error(w, `{"error":"Link de redefinição de senha inválido ou expirado."}`, http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"valid":        true,
		"username":     username,
		"requires_2fa": twoFactorSecret != "",
	})
}

func (h *AuthHandler) ResetPassword(w http.ResponseWriter, r *http.Request) {
	var req ResetPasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request payload"}`, http.StatusBadRequest)
		return
	}

	token := strings.TrimSpace(req.Token)
	if token == "" || len(req.NewPassword) < 6 {
		http.Error(w, `{"error":"Token obrigatório e nova senha com no mínimo 6 caracteres."}`, http.StatusBadRequest)
		return
	}

	tokenHash := fmt.Sprintf("%x", sha256.Sum256([]byte(token)))

	var resetID uuid.UUID
	var userID uuid.UUID
	var username string
	var twoFactorSecret string
	query := `
		SELECT pr.id, pr.user_id, u.username, COALESCE(u.two_factor_secret, '')
		FROM password_resets pr
		INNER JOIN users u ON u.id = pr.user_id
		WHERE pr.token_hash = $1 AND pr.used_at IS NULL AND pr.expires_at > CURRENT_TIMESTAMP
		LIMIT 1
	`
	err := h.db.Pool.QueryRow(r.Context(), query, tokenHash).Scan(&resetID, &userID, &username, &twoFactorSecret)
	if err != nil {
		http.Error(w, `{"error":"Link de redefinição de senha inválido ou expirado."}`, http.StatusBadRequest)
		return
	}

	// If account has 2FA enabled, validate TOTP or backup code
	if twoFactorSecret != "" {
		cleanCode := strings.TrimSpace(req.Code)
		if cleanCode == "" {
			http.Error(w, `{"error":"Esta conta possui Autenticação de 2 Fatores ativa. Informe o código 2FA ou backup para prosseguir."}`, http.StatusUnauthorized)
			return
		}

		totpValid := auth.VerifyTOTPCode(twoFactorSecret, cleanCode)
		if !totpValid {
			backupHash := auth.HashBackupCode(cleanCode)
			var backupID uuid.UUID
			err := h.db.Pool.QueryRow(r.Context(), `
				SELECT id FROM user_2fa_backup_codes
				WHERE user_id = $1 AND code_hash = $2 AND used_at IS NULL
			`, userID, backupHash).Scan(&backupID)

			if err == nil {
				h.db.Pool.Exec(r.Context(), "UPDATE user_2fa_backup_codes SET used_at = CURRENT_TIMESTAMP WHERE id = $1", backupID)
			} else {
				http.Error(w, `{"error":"Código 2FA ou código de backup incorreto."}`, http.StatusUnauthorized)
				return
			}
		}
	}

	newHash, err := h.auth.HashPassword(req.NewPassword)
	if err != nil {
		http.Error(w, `{"error":"Falha ao criptografar nova senha."}`, http.StatusInternalServerError)
		return
	}

	// Update user password and set email_verified = true
	_, err = h.db.Pool.Exec(r.Context(), `
		UPDATE users
		SET password_hash = $1, email_verified = TRUE, updated_at = CURRENT_TIMESTAMP
		WHERE id = $2
	`, newHash, userID)
	if err != nil {
		http.Error(w, `{"error":"Falha ao atualizar senha no banco."}`, http.StatusInternalServerError)
		return
	}

	// Mark token as used
	h.db.Pool.Exec(r.Context(), "UPDATE password_resets SET used_at = CURRENT_TIMESTAMP WHERE id = $1", resetID)

	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(`{"message":"Senha redefinida com sucesso! Você já pode fazer login com sua nova senha."}`))
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
		SELECT id, username, email, password_hash, display_name, avatar_url, banner_url, bio, status, custom_status, COALESCE(two_factor_secret, ''), email_verified, created_at, updated_at
		FROM users
		WHERE email = $1 OR username = $1
	`
	err := h.db.Pool.QueryRow(r.Context(), query, req.Email).Scan(
		&user.ID, &user.Username, &user.Email, &user.PasswordHash, &user.DisplayName, &user.AvatarURL, &user.BannerURL, &user.Bio, &user.Status, &user.CustomStatus, &user.TwoFactorSecret, &user.EmailVerified, &user.CreatedAt, &user.UpdatedAt,
	)
	if err != nil || !h.auth.CheckPassword(req.Password, user.PasswordHash) {
		http.Error(w, `{"error":"e-mail ou senha incorretos"}`, http.StatusUnauthorized)
		return
	}

	// Check if email is verified
	if !user.EmailVerified {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusForbidden)
		json.NewEncoder(w).Encode(AuthResponse{
			RequiresVerification: true,
			Email:                user.Email,
		})
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
		Code        string `json:"code,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request"}`, http.StatusBadRequest)
		return
	}

	var passwordHash, twoFactorSecret string
	err := h.db.Pool.QueryRow(r.Context(), "SELECT password_hash, COALESCE(two_factor_secret, '') FROM users WHERE id = $1", userID).Scan(&passwordHash, &twoFactorSecret)
	if err != nil || !h.auth.CheckPassword(req.Password, passwordHash) {
		http.Error(w, `{"error":"senha atual incorreta"}`, http.StatusUnauthorized)
		return
	}

	if twoFactorSecret != "" {
		cleanCode := strings.TrimSpace(req.Code)
		if cleanCode == "" {
			http.Error(w, `{"error":"código 2FA obrigatório para alterar o telefone"}`, http.StatusUnauthorized)
			return
		}
		if !auth.VerifyTOTPCode(twoFactorSecret, cleanCode) {
			backupHash := auth.HashBackupCode(cleanCode)
			var backupID uuid.UUID
			err := h.db.Pool.QueryRow(r.Context(), `
				SELECT id FROM user_2fa_backup_codes
				WHERE user_id = $1 AND code_hash = $2 AND used_at IS NULL
			`, userID, backupHash).Scan(&backupID)
			if err != nil {
				http.Error(w, `{"error":"código 2FA ou backup incorreto"}`, http.StatusUnauthorized)
				return
			}
		}
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
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Password == "" || req.Code == "" {
		http.Error(w, `{"error":"senha e código 2FA são obrigatórios para desativar a autenticação de dois fatores"}`, http.StatusBadRequest)
		return
	}

	var passwordHash, secret string
	err := h.db.Pool.QueryRow(r.Context(), "SELECT password_hash, COALESCE(two_factor_secret, '') FROM users WHERE id = $1", userID).Scan(&passwordHash, &secret)
	if err != nil {
		http.Error(w, `{"error":"user not found"}`, http.StatusNotFound)
		return
	}

	if !h.auth.CheckPassword(req.Password, passwordHash) {
		http.Error(w, `{"error":"senha incorreta"}`, http.StatusUnauthorized)
		return
	}

	cleanCode := strings.TrimSpace(req.Code)
	totpValid := secret != "" && auth.VerifyTOTPCode(secret, cleanCode)
	if !totpValid {
		backupHash := auth.HashBackupCode(cleanCode)
		var backupID uuid.UUID
		err := h.db.Pool.QueryRow(r.Context(), `
			SELECT id FROM user_2fa_backup_codes
			WHERE user_id = $1 AND code_hash = $2 AND used_at IS NULL
		`, userID, backupHash).Scan(&backupID)

		if err == nil {
			h.db.Pool.Exec(r.Context(), "UPDATE user_2fa_backup_codes SET used_at = CURRENT_TIMESTAMP WHERE id = $1", backupID)
		} else {
			http.Error(w, `{"error":"código 2FA ou de backup incorreto"}`, http.StatusUnauthorized)
			return
		}
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
		Code     string `json:"code,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Password == "" {
		http.Error(w, `{"error":"senha é obrigatória para confirmar a exclusão da conta"}`, http.StatusBadRequest)
		return
	}

	var passwordHash, twoFactorSecret string
	err := h.db.Pool.QueryRow(r.Context(), "SELECT password_hash, COALESCE(two_factor_secret, '') FROM users WHERE id = $1", userID).Scan(&passwordHash, &twoFactorSecret)
	if err != nil || !h.auth.CheckPassword(req.Password, passwordHash) {
		http.Error(w, `{"error":"senha incorreta"}`, http.StatusUnauthorized)
		return
	}

	if twoFactorSecret != "" {
		cleanCode := strings.TrimSpace(req.Code)
		if cleanCode == "" {
			http.Error(w, `{"error":"código 2FA obrigatório para confirmar exclusão"}`, http.StatusUnauthorized)
			return
		}
		if !auth.VerifyTOTPCode(twoFactorSecret, cleanCode) {
			backupHash := auth.HashBackupCode(cleanCode)
			var backupID uuid.UUID
			err := h.db.Pool.QueryRow(r.Context(), `
				SELECT id FROM user_2fa_backup_codes
				WHERE user_id = $1 AND code_hash = $2 AND used_at IS NULL
			`, userID, backupHash).Scan(&backupID)
			if err != nil {
				http.Error(w, `{"error":"código 2FA ou backup incorreto"}`, http.StatusUnauthorized)
				return
			}
		}
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
		Code            string `json:"code,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request"}`, http.StatusBadRequest)
		return
	}

	if len(req.NewPassword) < 6 {
		http.Error(w, `{"error":"a nova senha deve ter pelo menos 6 caracteres"}`, http.StatusBadRequest)
		return
	}

	var currentHash, twoFactorSecret string
	err := h.db.Pool.QueryRow(r.Context(), "SELECT password_hash, COALESCE(two_factor_secret, '') FROM users WHERE id = $1", userID).Scan(&currentHash, &twoFactorSecret)
	if err != nil || !h.auth.CheckPassword(req.CurrentPassword, currentHash) {
		http.Error(w, `{"error":"senha atual incorreta"}`, http.StatusUnauthorized)
		return
	}

	if twoFactorSecret != "" {
		cleanCode := strings.TrimSpace(req.Code)
		if cleanCode == "" {
			http.Error(w, `{"error":"código 2FA obrigatório para alterar a senha"}`, http.StatusUnauthorized)
			return
		}
		if !auth.VerifyTOTPCode(twoFactorSecret, cleanCode) {
			backupHash := auth.HashBackupCode(cleanCode)
			var backupID uuid.UUID
			err := h.db.Pool.QueryRow(r.Context(), `
				SELECT id FROM user_2fa_backup_codes
				WHERE user_id = $1 AND code_hash = $2 AND used_at IS NULL
			`, userID, backupHash).Scan(&backupID)
			if err != nil {
				http.Error(w, `{"error":"código 2FA ou backup incorreto"}`, http.StatusUnauthorized)
				return
			}
		}
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
		Code     string `json:"code,omitempty"`
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

	var currentHash, twoFactorSecret string
	var oldEmail string
	var username string
	err := h.db.Pool.QueryRow(r.Context(), "SELECT password_hash, email, username, COALESCE(two_factor_secret, '') FROM users WHERE id = $1", userID).Scan(&currentHash, &oldEmail, &username, &twoFactorSecret)
	if err != nil || !h.auth.CheckPassword(req.Password, currentHash) {
		http.Error(w, `{"error":"senha incorreta"}`, http.StatusUnauthorized)
		return
	}

	if twoFactorSecret != "" {
		cleanCode := strings.TrimSpace(req.Code)
		if cleanCode == "" {
			http.Error(w, `{"error":"código 2FA obrigatório para alterar o e-mail"}`, http.StatusUnauthorized)
			return
		}
		if !auth.VerifyTOTPCode(twoFactorSecret, cleanCode) {
			backupHash := auth.HashBackupCode(cleanCode)
			var backupID uuid.UUID
			err := h.db.Pool.QueryRow(r.Context(), `
				SELECT id FROM user_2fa_backup_codes
				WHERE user_id = $1 AND code_hash = $2 AND used_at IS NULL
			`, userID, backupHash).Scan(&backupID)
			if err != nil {
				http.Error(w, `{"error":"código 2FA ou backup incorreto"}`, http.StatusUnauthorized)
				return
			}
		}
	}

	if strings.EqualFold(oldEmail, newEmail) {
		http.Error(w, `{"error":"o novo e-mail deve ser diferente do e-mail atual"}`, http.StatusBadRequest)
		return
	}

	var exists bool
	h.db.Pool.QueryRow(r.Context(), "SELECT EXISTS(SELECT 1 FROM users WHERE email = $1 AND id != $2)", newEmail, userID).Scan(&exists)
	if exists {
		http.Error(w, `{"error":"este e-mail já está sendo utilizado por outra conta"}`, http.StatusConflict)
		return
	}

	_, err = h.db.Pool.Exec(r.Context(), "UPDATE users SET email = $1, email_verified = FALSE, updated_at = CURRENT_TIMESTAMP WHERE id = $2", newEmail, userID)
	if err != nil {
		http.Error(w, `{"error":"failed to update email"}`, http.StatusInternalServerError)
		return
	}

	// Generate 6-digit verification code for new email
	codeInt, err := rand.Int(rand.Reader, big.NewInt(900000))
	var code string
	if err != nil {
		code = fmt.Sprintf("%06d", time.Now().UnixNano()%900000+100000)
	} else {
		code = fmt.Sprintf("%06d", codeInt.Int64()+100000)
	}
	codeHash := fmt.Sprintf("%x", sha256.Sum256([]byte(code)))

	// Clean older verifications and insert new one for the new email
	h.db.Pool.Exec(r.Context(), "DELETE FROM email_verifications WHERE user_id = $1 OR LOWER(email) = $2", userID, newEmail)
	_, _ = h.db.Pool.Exec(r.Context(), `
		INSERT INTO email_verifications (user_id, email, code_hash, expires_at)
		VALUES ($1, $2, $3, CURRENT_TIMESTAMP + INTERVAL '15 minutes')
	`, userID, newEmail, codeHash)

	// Send notification to old email and verification code to new email asynchronously
	if h.email != nil {
		go func(oldE, newE, uName, vCode string) {
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			if oldE != "" {
				if err := h.email.SendEmailChangedNotice(ctx, oldE, uName, newE); err != nil {
					log.Printf("[Auth] Failed to send email changed notice to %s: %v", oldE, err)
				}
			}
			if err := h.email.SendVerificationEmail(ctx, newE, uName, vCode); err != nil {
				log.Printf("[Auth] Failed to send verification email to new email %s: %v", newE, err)
			}
		}(oldEmail, newEmail, username, code)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"success":               true,
		"email":                 newEmail,
		"requires_verification": true,
	})
}
