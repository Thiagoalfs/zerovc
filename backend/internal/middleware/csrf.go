package middleware

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/zerovc/zerovc/backend/internal/auth"
)

const (
	// CSRFCookieName is the standard cookie name for CSRF tokens.
	CSRFCookieName = "csrf_token"

	// CSRFHeaderName is the HTTP request header expected on state mutations.
	CSRFHeaderName = "X-CSRF-Token"

	// CSRFTokenTTL defines the maximum validity period for a CSRF token (30 days).
	CSRFTokenTTL = 30 * 24 * time.Hour
)

// CSRFService provides cryptographic CSRF token generation, delivery, and validation.
type CSRFService struct {
	key []byte
}

// NewCSRFService initializes the CSRF service with a secret key derived from the master JWT secret.
func NewCSRFService(jwtSecret string) *CSRFService {
	// Derive dedicated 256-bit CSRF key using domain separation
	h := sha256.New()
	h.Write([]byte("zerovc-csrf-key-derivation-v1:"))
	h.Write([]byte(jwtSecret))
	derivedKey := h.Sum(nil)

	return &CSRFService{
		key: derivedKey,
	}
}

// GenerateToken creates a cryptographically secure, user-bound HMAC CSRF token.
// Format: <16-byte-salt-hex>.<timestamp-unix>.<hmac-sha256-hex>
func (s *CSRFService) GenerateToken(userID uuid.UUID) (string, error) {
	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		return "", fmt.Errorf("failed to generate csrf entropy: %w", err)
	}

	saltHex := hex.EncodeToString(salt)
	timestamp := time.Now().Unix()

	sig := s.computeHMAC(userID, saltHex, timestamp)
	return fmt.Sprintf("%s.%d.%s", saltHex, timestamp, sig), nil
}

// ValidateToken verifies the format, expiration, and HMAC signature of a CSRF token in constant time.
func (s *CSRFService) ValidateToken(tokenString string, userID uuid.UUID) bool {
	parts := strings.Split(tokenString, ".")
	if len(parts) != 3 {
		return false
	}

	saltHex := parts[0]
	tsStr := parts[1]
	providedSig := parts[2]

	// Salt must be exactly 32 hex chars (16 bytes)
	if len(saltHex) != 32 {
		return false
	}

	// Verify salt hex decoding
	if _, err := hex.DecodeString(saltHex); err != nil {
		return false
	}

	// Signature must be exactly 64 hex chars (32 bytes HMAC-SHA256)
	if len(providedSig) != 64 {
		return false
	}

	// Verify signature hex decoding
	if _, err := hex.DecodeString(providedSig); err != nil {
		return false
	}

	// Parse and check timestamp
	ts, err := strconv.ParseInt(tsStr, 10, 64)
	if err != nil {
		return false
	}

	issuedAt := time.Unix(ts, 0)
	now := time.Now()

	// Check if token has expired or is from the future beyond 5 minutes (clock skew tolerance)
	if now.Sub(issuedAt) > CSRFTokenTTL || issuedAt.After(now.Add(5*time.Minute)) {
		return false
	}

	// Compute expected HMAC signature
	expectedSig := s.computeHMAC(userID, saltHex, ts)

	// Constant-time comparison of HMAC signatures
	return subtle.ConstantTimeCompare([]byte(providedSig), []byte(expectedSig)) == 1
}

// computeHMAC generates the hex-encoded HMAC-SHA256 signature for a user and salt.
func (s *CSRFService) computeHMAC(userID uuid.UUID, saltHex string, timestamp int64) string {
	mac := hmac.New(sha256.New, s.key)
	message := fmt.Sprintf("csrf:%s:%s:%d", userID.String(), saltHex, timestamp)
	mac.Write([]byte(message))
	return hex.EncodeToString(mac.Sum(nil))
}

// SetCookie sets the readable csrf_token cookie on the response.
func (s *CSRFService) SetCookie(w http.ResponseWriter, token string, isSecure bool) {
	http.SetCookie(w, &http.Cookie{
		Name:     CSRFCookieName,
		Value:    token,
		Path:     "/",
		MaxAge:   int(CSRFTokenTTL.Seconds()),
		HttpOnly: false, // Must be readable by client-side JavaScript
		Secure:   isSecure,
		SameSite: http.SameSiteLaxMode,
	})
}

// ClearCookie removes the csrf_token cookie from the client.
func (s *CSRFService) ClearCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     CSRFCookieName,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: false,
		SameSite: http.SameSiteLaxMode,
	})
}

// RequireCSRF returns an HTTP middleware that verifies X-CSRF-Token on all state-altering requests.
// Safe methods (GET, HEAD, OPTIONS) bypass verification.
// On failure, immediately responds with HTTP 403 Forbidden without database calls.
func (s *CSRFService) RequireCSRF(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// 1. Safe HTTP methods bypass CSRF verification
		if isSafeMethod(r.Method) {
			next.ServeHTTP(w, r)
			return
		}

		// 2. Extract authenticated user ID from context (injected by authService.Middleware)
		userID, ok := auth.GetUserIDFromContext(r.Context())
		if !ok || userID == uuid.Nil {
			rejectCSRF(w, "CSRF token missing or invalid")
			return
		}

		// 3. Extract X-CSRF-Token header
		headerToken := strings.TrimSpace(r.Header.Get(CSRFHeaderName))
		if headerToken == "" {
			rejectCSRF(w, "CSRF token missing or invalid")
			return
		}

		// 4. Double-Submit validation: if csrf_token cookie is present, it must match in constant time
		if cookie, err := r.Cookie(CSRFCookieName); err == nil && cookie.Value != "" {
			if subtle.ConstantTimeCompare([]byte(headerToken), []byte(cookie.Value)) != 1 {
				rejectCSRF(w, "CSRF token missing or invalid")
				return
			}
		}

		// 5. Cryptographic signature validation bound to the authenticated user ID
		if !s.ValidateToken(headerToken, userID) {
			rejectCSRF(w, "CSRF token missing or invalid")
			return
		}

		// 6. Token is valid; proceed to next handler
		next.ServeHTTP(w, r)
	})
}

// isSafeMethod checks if the HTTP method is read-only / safe per RFC 7231.
func isSafeMethod(method string) bool {
	switch method {
	case http.MethodGet, http.MethodHead, http.MethodOptions:
		return true
	default:
		return false
	}
}

// rejectCSRF writes an immediate HTTP 403 Forbidden response with zero database calls.
func rejectCSRF(w http.ResponseWriter, errorMsg string) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(http.StatusForbidden)
	// Body matches exact project specification: {"error": "CSRF token missing or invalid"}
	w.Write([]byte(fmt.Sprintf(`{"error":%q}`, errorMsg)))
}
