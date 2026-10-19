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
	"net"
	"net/http"
	"net/mail"
	"net/url"
	"os"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/zerovc/zerovc/backend/internal/auth"
	"github.com/zerovc/zerovc/backend/internal/database"
	"github.com/zerovc/zerovc/backend/internal/email"
	"github.com/zerovc/zerovc/backend/internal/gateway"
	"github.com/zerovc/zerovc/backend/internal/middleware"
	"github.com/zerovc/zerovc/backend/internal/models"
)

var validUsernameRegex = regexp.MustCompile(`^[a-z0-9_]+$`)

type failed2FAAttempt struct {
	count    int
	lockedAt time.Time
}

type AuthHandler struct {
	db            *database.DB
	auth          *auth.Service
	email         *email.Service
	csrf          *middleware.CSRFService
	hub           *gateway.Hub
	twoFAMutex    sync.Mutex
	twoFAAttempts map[uuid.UUID]*failed2FAAttempt
}

func NewAuthHandler(db *database.DB, authService *auth.Service, emailService *email.Service, csrfService *middleware.CSRFService, hub *gateway.Hub) *AuthHandler {
	handler := &AuthHandler{
		db:            db,
		auth:          authService,
		email:         emailService,
		csrf:          csrfService,
		hub:           hub,
		twoFAAttempts: make(map[uuid.UUID]*failed2FAAttempt),
	}

	// Periodic cleanup of stale 2FA lockout entries every 15 minutes
	go func() {
		ticker := time.NewTicker(15 * time.Minute)
		for range ticker.C {
			handler.twoFAMutex.Lock()
			now := time.Now()
			for id, att := range handler.twoFAAttempts {
				if now.Sub(att.lockedAt) > 30*time.Minute {
					delete(handler.twoFAAttempts, id)
				}
			}
			handler.twoFAMutex.Unlock()
		}
	}()

	return handler
}

// ContextWithUserID injects a user ID into the context (helper function).
func ContextWithUserID(ctx context.Context, userID uuid.UUID) context.Context {
	return auth.ContextWithUserID(ctx, userID)
}

type RegisterRequest struct {
	Username       string `json:"username"`
	Email          string `json:"email"`
	Password       string `json:"password"`
	TurnstileToken string `json:"turnstile_token,omitempty"`
}

type LoginRequest struct {
	Email          string `json:"email"`
	Password       string `json:"password"`
	Code           string `json:"code,omitempty"` // Optional 2FA TOTP code
	TurnstileToken string `json:"turnstile_token,omitempty"`
}

type TurnstileVerifyResponse struct {
	Success     bool      `json:"success"`
	ChallengeTS time.Time `json:"challenge_ts,omitempty"`
	Hostname    string    `json:"hostname,omitempty"`
	ErrorCodes  []string  `json:"error-codes,omitempty"`
	Action      string    `json:"action,omitempty"`
	CData       string    `json:"cdata,omitempty"`
}

func (h *AuthHandler) GetTurnstileConfig(w http.ResponseWriter, r *http.Request) {
	secretKey := strings.TrimSpace(os.Getenv("TURNSTILE_SECRET_KEY"))
	siteKey := strings.TrimSpace(os.Getenv("TURNSTILE_SITE_KEY"))

	isConfigured := secretKey != "" &&
		secretKey != "sua_turnstile_secret_key_aqui" &&
		secretKey != "your_turnstile_secret_key_here" &&
		!strings.HasPrefix(secretKey, "sua_") &&
		!strings.HasPrefix(secretKey, "your_") &&
		siteKey != "" &&
		siteKey != "sua_turnstile_site_key_aqui" &&
		!strings.HasPrefix(siteKey, "sua_")

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"enabled":  isConfigured,
		"site_key": siteKey,
	})
}

func verifyTurnstileToken(token string, remoteIP string) bool {
	secretKey := strings.TrimSpace(os.Getenv("TURNSTILE_SECRET_KEY"))
	siteKey := strings.TrimSpace(os.Getenv("TURNSTILE_SITE_KEY"))

	// Se nenhuma chave secreta foi configurada no ambiente (.env) ou está com o placeholder de exemplo,
	// permite passar (modo de compatibilidade/desenvolvimento local).
	if secretKey == "" ||
		secretKey == "sua_turnstile_secret_key_aqui" ||
		secretKey == "your_turnstile_secret_key_here" ||
		strings.HasPrefix(secretKey, "sua_") ||
		strings.HasPrefix(secretKey, "your_") {
		return true
	}

	// Se a chave pública (site key) não foi configurada no servidor e o token veio em branco,
	// significa que o widget não pôde ser renderizado para o usuário; libera o acesso sem bloquear.
	if (siteKey == "" || siteKey == "sua_turnstile_site_key_aqui" || strings.HasPrefix(siteKey, "sua_")) && strings.TrimSpace(token) == "" {
		log.Printf("[Turnstile] TURNSTILE_SITE_KEY não configurada no servidor e token vazio; liberando autenticação.")
		return true
	}

	token = strings.TrimSpace(token)
	if token == "" {
		return false
	}

	formData := url.Values{}
	formData.Set("secret", secretKey)
	formData.Set("response", token)
	// Nota: não enviamos 'remoteip' pois em redes com Docker/Traefik/Cloudflare proxy
	// o IP interno pode divergir do IP do visitante e causar erro 'invalid-remoteip' na Cloudflare.

	client := &http.Client{
		Timeout: 6 * time.Second,
	}

	resp, err := client.PostForm("https://challenges.cloudflare.com/turnstile/v0/siteverify", formData)
	if err != nil {
		log.Printf("[Turnstile] Erro de rede ao validar token: %v", err)
		return false
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		log.Printf("[Turnstile] Cloudflare retornou status HTTP %d", resp.StatusCode)
		return false
	}

	var verifyRes TurnstileVerifyResponse
	if err := json.NewDecoder(resp.Body).Decode(&verifyRes); err != nil {
		log.Printf("[Turnstile] Erro ao decodificar JSON da Cloudflare: %v", err)
		return false
	}

	if !verifyRes.Success {
		log.Printf("[Turnstile] Validação falhou: error-codes=%v", verifyRes.ErrorCodes)
		return false
	}

	return true
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
	CSRFToken            string            `json:"csrf_token,omitempty"`
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

	clientIP := getClientIP(r)
	if !verifyTurnstileToken(req.TurnstileToken, clientIP) {
		http.Error(w, `{"error":"Falha na verificação de segurança (Turnstile). Por favor, tente novamente."}`, http.StatusBadRequest)
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

	// Update user as verified and clean verification records atomically
	tx, err := h.db.Pool.Begin(r.Context())
	if err != nil {
		http.Error(w, `{"error":"failed to start transaction"}`, http.StatusInternalServerError)
		return
	}
	defer tx.Rollback(r.Context())

	_, err = tx.Exec(r.Context(), "UPDATE users SET email_verified = TRUE, updated_at = CURRENT_TIMESTAMP WHERE id = $1", userID)
	if err != nil {
		http.Error(w, `{"error":"failed to update verification status"}`, http.StatusInternalServerError)
		return
	}

	// Clean used verification records
	if _, err := tx.Exec(r.Context(), "DELETE FROM email_verifications WHERE user_id = $1 OR LOWER(email) = $2", userID, req.Email); err != nil {
		http.Error(w, `{"error":"failed to clean verification records"}`, http.StatusInternalServerError)
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		http.Error(w, `{"error":"failed to commit verification transaction"}`, http.StatusInternalServerError)
		return
	}

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

	h.recordSession(r.Context(), user.ID, token, r)

	setAuthCookie(w, token)

	var csrfToken string
	if h.csrf != nil {
		csrfToken, _ = h.csrf.GenerateToken(user.ID)
		h.csrf.SetCookie(w, csrfToken, r.TLS != nil)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(AuthResponse{
		Token:     token,
		CSRFToken: csrfToken,
		User:      user.ToPublic(),
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
		// Rate limit: check if a reset was requested less than 60s ago
		var recentResetCount int
		_ = h.db.Pool.QueryRow(r.Context(), `
			SELECT COUNT(*) FROM password_resets
			WHERE user_id = $1 AND created_at > (CURRENT_TIMESTAMP - INTERVAL '60 seconds')
		`, user.ID).Scan(&recentResetCount)
		if recentResetCount > 0 {
			http.Error(w, `{"error":"Aguarde 60 segundos antes de solicitar uma nova redefinição de senha."}`, http.StatusTooManyRequests)
			return
		}

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

	// Invalidate all active sessions on password reset
	rowsDel, errDel := h.db.Pool.Query(r.Context(), "DELETE FROM user_sessions WHERE user_id = $1 RETURNING token_hash", userID)
	if errDel == nil {
		defer rowsDel.Close()
		if h.auth != nil {
			for rowsDel.Next() {
				var th string
				if err := rowsDel.Scan(&th); err == nil && th != "" {
					h.auth.RevokeTokenHash(th)
				}
			}
		}
	}
	if h.auth != nil {
		h.auth.RevokeAllUserTokens(userID)
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

	turnstileVerified := false
	if req.Code == "" || req.TurnstileToken != "" {
		clientIP := getClientIP(r)
		if !verifyTurnstileToken(req.TurnstileToken, clientIP) {
			http.Error(w, `{"error":"Falha na verificação de segurança (Turnstile). Por favor, tente novamente."}`, http.StatusBadRequest)
			return
		}
		turnstileVerified = true
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

	// ACHADO-10: Prevent Turnstile bypass when account does not have 2FA enabled
	if !turnstileVerified && user.TwoFactorSecret == "" {
		clientIP := getClientIP(r)
		if !verifyTurnstileToken(req.TurnstileToken, clientIP) {
			http.Error(w, `{"error":"Falha na verificação de segurança (Turnstile). Por favor, tente novamente."}`, http.StatusBadRequest)
			return
		}
		turnstileVerified = true
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

		// Check if user is currently locked out from 2FA
		h.twoFAMutex.Lock()
		attempt, exists := h.twoFAAttempts[user.ID]
		if exists && attempt.count >= 5 {
			lockoutDuration := 15 * time.Minute
			elapsed := time.Since(attempt.lockedAt)
			if elapsed < lockoutDuration {
				remainingMins := int((lockoutDuration - elapsed).Minutes()) + 1
				h.twoFAMutex.Unlock()
				http.Error(w, fmt.Sprintf(`{"error":"Muitas tentativas incorretas de 2FA. Conta temporariamente bloqueada. Tente novamente em %d minutos."}`, remainingMins), http.StatusTooManyRequests)
				return
			}
			// Lockout expired, reset attempts
			delete(h.twoFAAttempts, user.ID)
		}
		h.twoFAMutex.Unlock()

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
				// Increment failed attempt counter
				h.twoFAMutex.Lock()
				att, ok := h.twoFAAttempts[user.ID]
				if !ok {
					att = &failed2FAAttempt{count: 0, lockedAt: time.Now()}
					h.twoFAAttempts[user.ID] = att
				}
				att.count++
				att.lockedAt = time.Now()
				if att.count >= 5 {
					h.twoFAMutex.Unlock()
					http.Error(w, `{"error":"Muitas tentativas incorretas de 2FA. Sua conta foi temporariamente bloqueada por 15 minutos."}`, http.StatusTooManyRequests)
					return
				}
				remaining := 5 - att.count
				h.twoFAMutex.Unlock()

				http.Error(w, fmt.Sprintf(`{"error":"Código 2FA ou código de backup inválido. Restam %d tentativa(s)."}`, remaining), http.StatusUnauthorized)
				return
			}
		}

		// Successful 2FA verification: reset attempt counter
		h.twoFAMutex.Lock()
		delete(h.twoFAAttempts, user.ID)
		h.twoFAMutex.Unlock()
	}

	user.TwoFactorEnabled = user.TwoFactorSecret != ""

	token, err := h.auth.GenerateToken(user.ID, user.Username)
	if err != nil {
		http.Error(w, `{"error":"failed to generate token"}`, http.StatusInternalServerError)
		return
	}

	h.recordSession(r.Context(), user.ID, token, r)

	// Set HttpOnly session cookie
	setAuthCookie(w, token)

	var csrfToken string
	if h.csrf != nil {
		csrfToken, _ = h.csrf.GenerateToken(user.ID)
		h.csrf.SetCookie(w, csrfToken, r.TLS != nil)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(AuthResponse{
		Token:     token,
		CSRFToken: csrfToken,
		User:      user.ToPublic(),
	})
}

func (h *AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	currentToken := extractTokenFromRequest(r)
	if currentToken != "" {
		tokenHash := hashToken(currentToken)
		h.db.Pool.Exec(r.Context(), "DELETE FROM user_sessions WHERE token_hash = $1", tokenHash)
		if h.auth != nil {
			h.auth.RevokeTokenHash(tokenHash)
		}
	}
	clearAuthCookie(w)
	if h.csrf != nil {
		h.csrf.ClearCookie(w)
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(`{"message":"logged out successfully"}`))
}

func (h *AuthHandler) Me(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	currentToken := extractTokenFromRequest(r)
	if currentToken != "" {
		h.touchSession(r.Context(), userID, currentToken, r)
	}

	var user models.User
	query := `
		SELECT id, username, email, COALESCE(phone_number, ''), display_name, avatar_url, banner_url, bio, status, custom_status,
		       COALESCE(two_factor_secret, ''), email_verified,
		       COALESCE(custom_activity, 'null'::jsonb), COALESCE(show_activity_status, true), COALESCE(auto_detect_activity, true),
		       COALESCE(server_folders, '[]'::jsonb), COALESCE(guild_positions, '[]'::jsonb),
		       created_at, updated_at
		FROM users
		WHERE id = $1
	`
	err := h.db.Pool.QueryRow(r.Context(), query, userID).Scan(
		&user.ID, &user.Username, &user.Email, &user.PhoneNumber, &user.DisplayName, &user.AvatarURL, &user.BannerURL, &user.Bio, &user.Status, &user.CustomStatus,
		&user.TwoFactorSecret, &user.EmailVerified,
		&user.CustomActivity, &user.ShowActivityStatus, &user.AutoDetectActivity,
		&user.ServerFolders, &user.GuildPositions,
		&user.CreatedAt, &user.UpdatedAt,
	)
	if err != nil {
		http.Error(w, `{"error":"user not found"}`, http.StatusNotFound)
		return
	}

	user.TwoFactorEnabled = user.TwoFactorSecret != ""

	var csrfToken string
	if h.csrf != nil {
		csrfToken, _ = h.csrf.GenerateToken(userID)
		h.csrf.SetCookie(w, csrfToken, r.TLS != nil)
	}

	w.Header().Set("Content-Type", "application/json")
	if csrfToken != "" {
		w.Header().Set("X-CSRF-Token", csrfToken)
	}
	response := struct {
		models.User
		CSRFToken string `json:"csrf_token,omitempty"`
	}{
		User:      user,
		CSRFToken: csrfToken,
	}
	json.NewEncoder(w).Encode(response)
}

// Session Helpers and Handlers

func extractTokenFromRequest(r *http.Request) string {
	if cookie, err := r.Cookie("token"); err == nil && cookie.Value != "" {
		return cookie.Value
	}
	if cookie, err := r.Cookie("auth_token"); err == nil && cookie.Value != "" {
		return cookie.Value
	}
	authHeader := r.Header.Get("Authorization")
	if strings.HasPrefix(authHeader, "Bearer ") {
		return strings.TrimSpace(strings.TrimPrefix(authHeader, "Bearer "))
	}
	return ""
}

func hashToken(token string) string {
	if token == "" {
		return ""
	}
	h := sha256.Sum256([]byte(token))
	return hex.EncodeToString(h[:])
}

func cleanIP(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return ""
	}
	if host, _, err := net.SplitHostPort(s); err == nil {
		s = host
	}
	s = strings.Trim(s, "[]")
	parsed := net.ParseIP(s)
	if parsed == nil {
		return ""
	}
	return parsed.String()
}

func getClientIP(r *http.Request) string {
	if r == nil {
		return ""
	}

	// 1. Cloudflare / CDN headers (most accurate when behind reverse proxy / CDN)
	headers := []string{
		"CF-Connecting-IP",
		"True-Client-IP",
		"X-Real-IP",
		"X-Client-IP",
		"Fastly-Client-IP",
	}

	for _, h := range headers {
		if val := r.Header.Get(h); val != "" {
			if ip := cleanIP(val); ip != "" {
				return ip
			}
		}
	}

	// 2. X-Forwarded-For header (comma-separated list of client, proxy1, proxy2...)
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		parts := strings.Split(xff, ",")
		var firstValid string
		for _, part := range parts {
			if ip := cleanIP(part); ip != "" {
				parsed := net.ParseIP(ip)
				if parsed != nil && !parsed.IsLoopback() && !parsed.IsPrivate() && !parsed.IsUnspecified() {
					return ip
				}
				if firstValid == "" {
					firstValid = ip
				}
			}
		}
		if firstValid != "" {
			return firstValid
		}
	}

	// 3. Fallback to RemoteAddr
	if ip := cleanIP(r.RemoteAddr); ip != "" {
		return ip
	}

	return ""
}

func parseUserAgent(ua string) (deviceType, os, browser string) {
	if ua == "" {
		return "web", "Desconhecido", "Navegador Web"
	}
	uaLower := strings.ToLower(ua)

	// OS detection
	if strings.Contains(uaLower, "windows") {
		os = "Windows"
	} else if strings.Contains(uaLower, "android") {
		os = "Android"
	} else if strings.Contains(uaLower, "iphone") || strings.Contains(uaLower, "ipad") || strings.Contains(uaLower, "ipod") {
		os = "iOS"
	} else if strings.Contains(uaLower, "macintosh") || strings.Contains(uaLower, "mac os") {
		os = "macOS"
	} else if strings.Contains(uaLower, "linux") {
		os = "Linux"
	} else {
		os = "Desconhecido"
	}

	// Browser / App detection
	if strings.Contains(uaLower, "electron") || strings.Contains(uaLower, "zerovc-desktop") {
		browser = "ZeroVC Desktop"
		deviceType = "desktop"
	} else if strings.Contains(uaLower, "capacitor") || strings.Contains(uaLower, "zerovc-mobile") || (strings.Contains(uaLower, "android") && strings.Contains(uaLower, "version/")) {
		browser = "ZeroVC Mobile"
		deviceType = "mobile"
	} else if strings.Contains(uaLower, "edg/") || strings.Contains(uaLower, "edge/") {
		browser = "Microsoft Edge"
		deviceType = "web"
	} else if strings.Contains(uaLower, "opr/") || strings.Contains(uaLower, "opera") {
		browser = "Opera"
		deviceType = "web"
	} else if strings.Contains(uaLower, "chrome") || strings.Contains(uaLower, "crios") {
		browser = "Google Chrome"
		deviceType = "web"
	} else if strings.Contains(uaLower, "firefox") || strings.Contains(uaLower, "fxios") {
		browser = "Mozilla Firefox"
		deviceType = "web"
	} else if strings.Contains(uaLower, "safari") && !strings.Contains(uaLower, "chrome") {
		browser = "Apple Safari"
		deviceType = "web"
	} else {
		browser = "Navegador Web"
		deviceType = "web"
	}

	if (os == "Android" || os == "iOS") && deviceType != "mobile" {
		deviceType = "mobile"
	} else if (os == "Windows" || os == "macOS" || os == "Linux") && browser == "ZeroVC Desktop" {
		deviceType = "desktop"
	}

	return deviceType, os, browser
}

func (h *AuthHandler) recordSession(ctx context.Context, userID uuid.UUID, token string, r *http.Request) {
	if token == "" {
		return
	}
	tokenHash := hashToken(token)
	ip := getClientIP(r)
	ua := ""
	if r != nil {
		ua = r.UserAgent()
	}
	deviceType, os, browser := parseUserAgent(ua)

	query := `
		INSERT INTO user_sessions (user_id, token_hash, ip_address, user_agent, device_type, os, browser, last_active_at, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
		ON CONFLICT (token_hash) DO UPDATE
		SET last_active_at = CURRENT_TIMESTAMP,
		    ip_address = CASE WHEN EXCLUDED.ip_address <> '' THEN EXCLUDED.ip_address ELSE user_sessions.ip_address END,
		    user_agent = CASE WHEN EXCLUDED.user_agent <> '' THEN EXCLUDED.user_agent ELSE user_sessions.user_agent END,
		    device_type = EXCLUDED.device_type,
		    os = EXCLUDED.os,
		    browser = EXCLUDED.browser
	`
	_, _ = h.db.Pool.Exec(ctx, query, userID, tokenHash, ip, ua, deviceType, os, browser)
}

func (h *AuthHandler) touchSession(ctx context.Context, userID uuid.UUID, token string, r *http.Request) {
	if token == "" {
		return
	}
	tokenHash := hashToken(token)
	ip := getClientIP(r)

	if ip != "" {
		_, _ = h.db.Pool.Exec(ctx, "UPDATE user_sessions SET last_active_at = CURRENT_TIMESTAMP, ip_address = $1 WHERE token_hash = $2", ip, tokenHash)
	} else {
		_, _ = h.db.Pool.Exec(ctx, "UPDATE user_sessions SET last_active_at = CURRENT_TIMESTAMP WHERE token_hash = $1", tokenHash)
	}
}

func (h *AuthHandler) GetSessions(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	currentToken := extractTokenFromRequest(r)
	currentTokenHash := hashToken(currentToken)

	if currentTokenHash != "" {
		h.touchSession(r.Context(), userID, currentToken, r)
	}

	query := `
		SELECT id, user_id, token_hash, ip_address, user_agent, device_type, os, browser, last_active_at, created_at
		FROM user_sessions
		WHERE user_id = $1
		ORDER BY last_active_at DESC
	`
	rows, err := h.db.Pool.Query(r.Context(), query, userID)
	if err != nil {
		http.Error(w, `{"error":"failed to fetch sessions"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	sessions := make([]models.UserSession, 0)
	for rows.Next() {
		var s models.UserSession
		if err := rows.Scan(&s.ID, &s.UserID, &s.TokenHash, &s.IPAddress, &s.UserAgent, &s.DeviceType, &s.OS, &s.Browser, &s.LastActiveAt, &s.CreatedAt); err != nil {
			continue
		}
		s.IsCurrent = (s.TokenHash == currentTokenHash)
		sessions = append(sessions, s)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(sessions)
}

func (h *AuthHandler) RevokeSession(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	sessionIDStr := chi.URLParam(r, "id")
	sessionID, err := uuid.Parse(sessionIDStr)
	if err != nil {
		http.Error(w, `{"error":"invalid session id"}`, http.StatusBadRequest)
		return
	}

	var tokenHash string
	err = h.db.Pool.QueryRow(r.Context(), "DELETE FROM user_sessions WHERE id = $1 AND user_id = $2 RETURNING token_hash", sessionID, userID).Scan(&tokenHash)
	if err != nil {
		http.Error(w, `{"error":"sessão não encontrada ou já revogada"}`, http.StatusNotFound)
		return
	}

	if h.auth != nil {
		h.auth.RevokeTokenHash(tokenHash)
	}

	if h.hub != nil {
		h.hub.SendToUser(userID, models.WSEvent{
			Type: models.EventSessionRevoked,
			Data: map[string]any{
				"session_id": sessionID,
				"token_hash": tokenHash,
			},
		})
	}

	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(`{"message":"Sessão encerrada com sucesso."}`))
}

func (h *AuthHandler) RevokeOtherSessions(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	currentToken := extractTokenFromRequest(r)
	currentTokenHash := hashToken(currentToken)

	rows, err := h.db.Pool.Query(r.Context(), "DELETE FROM user_sessions WHERE user_id = $1 AND token_hash != $2 RETURNING token_hash", userID, currentTokenHash)
	if err != nil {
		http.Error(w, `{"error":"falha ao revogar outras sessões"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	if h.auth != nil {
		for rows.Next() {
			var th string
			if err := rows.Scan(&th); err == nil && th != "" {
				h.auth.RevokeTokenHash(th)
			}
		}
	}

	if h.hub != nil {
		h.hub.SendToUser(userID, models.WSEvent{
			Type: models.EventSessionRevoked,
			Data: map[string]any{
				"except_token_hash": currentTokenHash,
			},
		})
	}

	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(`{"message":"Todas as outras sessões foram encerradas com sucesso."}`))
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
	var twoFactorSecret string
	queryUser := `
		SELECT id, username, email, COALESCE(phone_number, ''), display_name, avatar_url, banner_url, bio,
		       status, custom_status, COALESCE(two_factor_secret, ''), email_verified,
		       COALESCE(riot_game_name, ''), COALESCE(riot_tag_line, ''), COALESCE(riot_region, ''),
		       created_at, updated_at
		FROM users WHERE id = $1
	`
	err := h.db.Pool.QueryRow(ctx, queryUser, userID).Scan(
		&user.ID, &user.Username, &user.Email, &user.PhoneNumber, &user.DisplayName, &user.AvatarURL, &user.BannerURL, &user.Bio,
		&user.Status, &user.CustomStatus, &twoFactorSecret, &user.EmailVerified,
		&user.RiotGameName, &user.RiotTagLine, &user.RiotRegion,
		&user.CreatedAt, &user.UpdatedAt,
	)
	if err != nil {
		http.Error(w, `{"error":"user not found"}`, http.StatusNotFound)
		return
	}
	user.TwoFactorEnabled = (twoFactorSecret != "")

	// 2. Guilds joined
	type GuildSummary struct {
		ID       uuid.UUID `json:"id"`
		Name     string    `json:"name"`
		Role     string    `json:"role"`
		Nickname string    `json:"nickname,omitempty"`
		JoinedAt time.Time `json:"joined_at"`
	}
	guilds := make([]GuildSummary, 0)
	gRows, err := h.db.Pool.Query(ctx, `
		SELECT g.id, g.name, gm.role, COALESCE(gm.nickname, ''), gm.joined_at
		FROM guilds g
		JOIN guild_members gm ON gm.guild_id = g.id
		WHERE gm.user_id = $1
		ORDER BY gm.joined_at DESC
	`, userID)
	if err == nil {
		defer gRows.Close()
		for gRows.Next() {
			var gs GuildSummary
			if err := gRows.Scan(&gs.ID, &gs.Name, &gs.Role, &gs.Nickname, &gs.JoinedAt); err == nil {
				guilds = append(guilds, gs)
			}
		}
	}

	// 3. DM Groups joined
	type DMGroupSummary struct {
		ID       uuid.UUID `json:"id"`
		Name     string    `json:"name"`
		IsOwner  bool      `json:"is_owner"`
		JoinedAt time.Time `json:"joined_at"`
	}
	dmGroups := make([]DMGroupSummary, 0)
	dmgRows, err := h.db.Pool.Query(ctx, `
		SELECT g.id, COALESCE(g.name, ''), (g.owner_id = $1), gm.joined_at
		FROM dm_groups g
		JOIN dm_group_members gm ON gm.group_id = g.id
		WHERE gm.user_id = $1
		ORDER BY gm.joined_at DESC
	`, userID)
	if err == nil {
		defer dmgRows.Close()
		for dmgRows.Next() {
			var dmg DMGroupSummary
			if err := dmgRows.Scan(&dmg.ID, &dmg.Name, &dmg.IsOwner, &dmg.JoinedAt); err == nil {
				dmGroups = append(dmGroups, dmg)
			}
		}
	}

	// 4. Friends & Relationships
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

	// 5. Blocked Users
	type BlockSummary struct {
		BlockedUserID uuid.UUID `json:"blocked_user_id"`
		Username      string    `json:"username"`
		BlockedAt     time.Time `json:"blocked_at"`
	}
	blocks := make([]BlockSummary, 0)
	bRows, err := h.db.Pool.Query(ctx, `
		SELECT ub.blocked_user_id, COALESCE(u.username, ''), ub.created_at
		FROM user_blocks ub
		LEFT JOIN users u ON u.id = ub.blocked_user_id
		WHERE ub.user_id = $1
		ORDER BY ub.created_at DESC
	`, userID)
	if err == nil {
		defer bRows.Close()
		for bRows.Next() {
			var bs BlockSummary
			if err := bRows.Scan(&bs.BlockedUserID, &bs.Username, &bs.BlockedAt); err == nil {
				blocks = append(blocks, bs)
			}
		}
	}

	// 6. Security Sessions & Device Logs
	type SessionSummary struct {
		ID           uuid.UUID `json:"id"`
		IPAddress    string    `json:"ip_address"`
		UserAgent    string    `json:"user_agent"`
		DeviceType   string    `json:"device_type"`
		OS           string    `json:"os"`
		Browser      string    `json:"browser"`
		LastActiveAt time.Time `json:"last_active_at"`
		CreatedAt    time.Time `json:"created_at"`
	}
	sessions := make([]SessionSummary, 0)
	sRows, err := h.db.Pool.Query(ctx, `
		SELECT id, COALESCE(ip_address, ''), COALESCE(user_agent, ''), COALESCE(device_type, ''), COALESCE(os, ''), COALESCE(browser, ''), last_active_at, created_at
		FROM user_sessions
		WHERE user_id = $1
		ORDER BY last_active_at DESC
	`, userID)
	if err == nil {
		defer sRows.Close()
		for sRows.Next() {
			var ss SessionSummary
			if err := sRows.Scan(&ss.ID, &ss.IPAddress, &ss.UserAgent, &ss.DeviceType, &ss.OS, &ss.Browser, &ss.LastActiveAt, &ss.CreatedAt); err == nil {
				sessions = append(sessions, ss)
			}
		}
	}

	// 7. Registered E2EE Devices
	type E2EEDeviceSummary struct {
		ID        uuid.UUID  `json:"id"`
		CreatedAt time.Time  `json:"created_at"`
		RevokedAt *time.Time `json:"revoked_at,omitempty"`
	}
	e2eeDevices := make([]E2EEDeviceSummary, 0)
	edRows, err := h.db.Pool.Query(ctx, `
		SELECT id, created_at, revoked_at
		FROM e2ee_devices
		WHERE user_id = $1
		ORDER BY created_at DESC
	`, userID)
	if err == nil {
		defer edRows.Close()
		for edRows.Next() {
			var ed E2EEDeviceSummary
			if err := edRows.Scan(&ed.ID, &ed.CreatedAt, &ed.RevokedAt); err == nil {
				e2eeDevices = append(e2eeDevices, ed)
			}
		}
	}

	// 8. Messages authored by user (Channel, Direct, and Group Messages)
	type ExportedMessage struct {
		ID        uuid.UUID `json:"id"`
		TargetID  uuid.UUID `json:"target_id"`
		Content   string    `json:"content"`
		Encrypted bool      `json:"encrypted"`
		CreatedAt time.Time `json:"created_at"`
	}

	channelMessages := make([]ExportedMessage, 0)
	cmRows, err := h.db.Pool.Query(ctx, `
		SELECT id, channel_id, content, COALESCE(encrypted, false), created_at
		FROM messages
		WHERE author_id = $1
		ORDER BY created_at DESC
		LIMIT 5000
	`, userID)
	if err == nil {
		defer cmRows.Close()
		for cmRows.Next() {
			var em ExportedMessage
			if err := cmRows.Scan(&em.ID, &em.TargetID, &em.Content, &em.Encrypted, &em.CreatedAt); err == nil {
				if em.Encrypted {
					em.Content = "[Mensagem Criptografada de Ponta a Ponta]"
				}
				channelMessages = append(channelMessages, em)
			}
		}
	}

	dmMessages := make([]ExportedMessage, 0)
	dmRows, err := h.db.Pool.Query(ctx, `
		SELECT id, dm_room_id, content, COALESCE(encrypted, false), created_at
		FROM dm_messages
		WHERE author_id = $1
		ORDER BY created_at DESC
		LIMIT 5000
	`, userID)
	if err == nil {
		defer dmRows.Close()
		for dmRows.Next() {
			var em ExportedMessage
			if err := dmRows.Scan(&em.ID, &em.TargetID, &em.Content, &em.Encrypted, &em.CreatedAt); err == nil {
				if em.Encrypted {
					em.Content = "[Mensagem Criptografada de Ponta a Ponta]"
				}
				dmMessages = append(dmMessages, em)
			}
		}
	}

	dmGroupMessages := make([]ExportedMessage, 0)
	dmgmRows, err := h.db.Pool.Query(ctx, `
		SELECT id, group_id, content, COALESCE(encrypted, false), created_at
		FROM dm_group_messages
		WHERE author_id = $1
		ORDER BY created_at DESC
		LIMIT 5000
	`, userID)
	if err == nil {
		defer dmgmRows.Close()
		for dmgmRows.Next() {
			var em ExportedMessage
			if err := dmgmRows.Scan(&em.ID, &em.TargetID, &em.Content, &em.Encrypted, &em.CreatedAt); err == nil {
				if em.Encrypted {
					em.Content = "[Mensagem Criptografada de Ponta a Ponta]"
				}
				dmGroupMessages = append(dmGroupMessages, em)
			}
		}
	}

	exportPayload := map[string]any{
		"exported_at":     time.Now().UTC(),
		"lgpd_compliance": "Lei Geral de Proteção de Dados (Lei nº 13.709/2018 - Art. 18)",
		"profile": map[string]any{
			"id":                 user.ID,
			"username":           user.Username,
			"email":              user.Email,
			"email_verified":     user.EmailVerified,
			"phone_number":       user.PhoneNumber,
			"display_name":       user.DisplayName,
			"avatar_url":         user.AvatarURL,
			"banner_url":         user.BannerURL,
			"bio":                user.Bio,
			"status":             user.Status,
			"custom_status":      user.CustomStatus,
			"two_factor_enabled": user.TwoFactorEnabled,
			"created_at":         user.CreatedAt,
			"updated_at":         user.UpdatedAt,
		},
		"riot_integration": map[string]any{
			"game_name": user.RiotGameName,
			"tag_line":  user.RiotTagLine,
			"region":    user.RiotRegion,
		},
		"guilds":        guilds,
		"dm_groups":     dmGroups,
		"friends":       friends,
		"blocked_users": blocks,
		"sessions":      sessions,
		"e2ee_devices":  e2eeDevices,
		"messages": map[string]any{
			"channel_messages":  channelMessages,
			"direct_messages":   dmMessages,
			"dm_group_messages": dmGroupMessages,
		},
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
			h.db.Pool.Exec(r.Context(), `UPDATE user_2fa_backup_codes SET used_at = CURRENT_TIMESTAMP WHERE id = $1`, backupID)
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

	// Revoke other active sessions for this user
	currentToken := extractTokenFromRequest(r)
	currentTokenHash := hashToken(currentToken)
	if currentTokenHash != "" {
		rowsDel, errDel := h.db.Pool.Query(r.Context(), "DELETE FROM user_sessions WHERE user_id = $1 AND token_hash != $2 RETURNING token_hash", userID, currentTokenHash)
		if errDel == nil {
			defer rowsDel.Close()
			if h.auth != nil {
				for rowsDel.Next() {
					var th string
					if err := rowsDel.Scan(&th); err == nil && th != "" {
						h.auth.RevokeTokenHash(th)
					}
				}
			}
		}
	} else {
		rowsDel, errDel := h.db.Pool.Query(r.Context(), "DELETE FROM user_sessions WHERE user_id = $1 RETURNING token_hash", userID)
		if errDel == nil {
			defer rowsDel.Close()
			if h.auth != nil {
				for rowsDel.Next() {
					var th string
					if err := rowsDel.Scan(&th); err == nil && th != "" {
						h.auth.RevokeTokenHash(th)
					}
				}
			}
		}
		if h.auth != nil {
			h.auth.RevokeAllUserTokens(userID)
		}
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
	parsed, err := mail.ParseAddress(newEmail)
	if err != nil || parsed.Address != newEmail || strings.ContainsAny(newEmail, `<>"'`) {
		http.Error(w, `{"error":"e-mail inválido"}`, http.StatusBadRequest)
		return
	}

	var currentHash, twoFactorSecret string
	var oldEmail string
	var username string
	err = h.db.Pool.QueryRow(r.Context(), "SELECT password_hash, email, username, COALESCE(two_factor_secret, '') FROM users WHERE id = $1", userID).Scan(&currentHash, &oldEmail, &username, &twoFactorSecret)
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
			h.db.Pool.Exec(r.Context(), `UPDATE user_2fa_backup_codes SET used_at = CURRENT_TIMESTAMP WHERE id = $1`, backupID)
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
