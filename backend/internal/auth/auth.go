package auth

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
)

type contextKey string

const (
	UserContextKey contextKey = "user_id"
)

type Claims struct {
	UserID   uuid.UUID `json:"user_id"`
	Username string    `json:"username"`
	jwt.RegisteredClaims
}

type Service struct {
	jwtSecret        []byte
	mu               sync.RWMutex
	revokedTokens    map[string]time.Time
	revokedAllBefore map[uuid.UUID]time.Time
	SessionValidator func(ctx context.Context, userID uuid.UUID, tokenHash string) bool
}

func NewService(secret string) *Service {
	return &Service{
		jwtSecret:        []byte(secret),
		revokedTokens:    make(map[string]time.Time),
		revokedAllBefore: make(map[uuid.UUID]time.Time),
	}
}

// HashToken returns the SHA-256 hex digest of a token.
func HashToken(token string) string {
	if token == "" {
		return ""
	}
	h := sha256.Sum256([]byte(token))
	return hex.EncodeToString(h[:])
}

// RevokeTokenHash marks a token hash as revoked in memory.
func (s *Service) RevokeTokenHash(tokenHash string) {
	if tokenHash == "" {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.revokedTokens == nil {
		s.revokedTokens = make(map[string]time.Time)
	}
	s.revokedTokens[tokenHash] = time.Now()
}

// RevokeToken marks a plain token as revoked in memory.
func (s *Service) RevokeToken(token string) {
	if token == "" {
		return
	}
	s.RevokeTokenHash(HashToken(token))
}

// RevokeAllUserTokens marks all tokens issued for a user up to now as revoked.
func (s *Service) RevokeAllUserTokens(userID uuid.UUID) {
	if userID == uuid.Nil {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.revokedAllBefore == nil {
		s.revokedAllBefore = make(map[uuid.UUID]time.Time)
	}
	s.revokedAllBefore[userID] = time.Now()
}

// IsTokenRevoked checks if a token or user session is revoked in memory.
func (s *Service) IsTokenRevoked(userID uuid.UUID, tokenHash string, issuedAt time.Time) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if s.revokedTokens != nil && tokenHash != "" {
		if _, ok := s.revokedTokens[tokenHash]; ok {
			return true
		}
	}
	if s.revokedAllBefore != nil && userID != uuid.Nil {
		if cutoff, ok := s.revokedAllBefore[userID]; ok {
			if !issuedAt.IsZero() && (issuedAt.Before(cutoff) || issuedAt.Equal(cutoff)) {
				return true
			}
		}
	}
	return false
}

func (s *Service) HashPassword(password string) (string, error) {
	bytes, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	return string(bytes), err
}

func (s *Service) CheckPassword(password, hash string) bool {
	err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(password))
	return err == nil
}

func (s *Service) GenerateToken(userID uuid.UUID, username string) (string, error) {
	expirationTime := time.Now().Add(30 * 24 * time.Hour) // 30 days
	claims := &Claims{
		UserID:   userID,
		Username: username,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(expirationTime),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Subject:   userID.String(),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(s.jwtSecret)
}

func (s *Service) ValidateToken(tokenString string) (*Claims, error) {
	claims := &Claims{}
	token, err := jwt.ParseWithClaims(tokenString, claims, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("unexpected signing method")
		}
		return s.jwtSecret, nil
	})

	if err != nil || !token.Valid {
		return nil, errors.New("invalid or expired token")
	}

	return claims, nil
}

func (s *Service) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var tokenString string

		// 1. Check HttpOnly Cookie first ("token" or "auth_token")
		if cookie, err := r.Cookie("token"); err == nil && cookie.Value != "" {
			tokenString = cookie.Value
		} else if cookie, err := r.Cookie("auth_token"); err == nil && cookie.Value != "" {
			tokenString = cookie.Value
		}

		// 2. Fallback to Authorization Header (Bearer <token>)
		if tokenString == "" {
			authHeader := r.Header.Get("Authorization")
			if authHeader != "" {
				parts := strings.Split(authHeader, " ")
				if len(parts) == 2 && strings.ToLower(parts[0]) == "bearer" {
					tokenString = parts[1]
				}
			}
		}

		// 3. Fallback to Query param ONLY for WebSocket connections (?token=...)
		if tokenString == "" && (r.Header.Get("Upgrade") == "websocket" || r.URL.Path == "/ws") {
			tokenString = r.URL.Query().Get("token")
		}

		if tokenString == "" {
			http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
			return
		}

		claims, err := s.ValidateToken(tokenString)
		if err != nil {
			http.Error(w, `{"error":"invalid token"}`, http.StatusUnauthorized)
			return
		}

		tokenHash := HashToken(tokenString)
		var issuedAt time.Time
		if claims.IssuedAt != nil {
			issuedAt = claims.IssuedAt.Time
		}

		if s.IsTokenRevoked(claims.UserID, tokenHash, issuedAt) {
			http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
			return
		}

		if s.SessionValidator != nil && !s.SessionValidator(r.Context(), claims.UserID, tokenHash) {
			http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
			return
		}

		ctx := context.WithValue(r.Context(), UserContextKey, claims.UserID)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func GetUserIDFromContext(ctx context.Context) (uuid.UUID, bool) {
	userID, ok := ctx.Value(UserContextKey).(uuid.UUID)
	return userID, ok
}

// ContextWithUserID injects a user ID into the context.
func ContextWithUserID(ctx context.Context, userID uuid.UUID) context.Context {
	return context.WithValue(ctx, UserContextKey, userID)
}

// SetUserIDInContext is an alias for ContextWithUserID for backward/testing compatibility.
func SetUserIDInContext(ctx context.Context, userID uuid.UUID) context.Context {
	return context.WithValue(ctx, UserContextKey, userID)
}

