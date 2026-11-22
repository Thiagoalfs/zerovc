package handlers

import (
	"context"
	"net/http"
	"strings"

	"github.com/google/uuid"
	"github.com/zerovc/zerovc/backend/internal/auth"
	"github.com/zerovc/zerovc/backend/internal/database"
)

type twoFAError struct {
	Status  int
	Payload string
}

func (e *twoFAError) Error() string { return e.Payload }

// verifyUser2FA checks TOTP or single-use backup code when the user has 2FA enabled.
func verifyUser2FA(ctx context.Context, db *database.DB, userID uuid.UUID, rawCode string) *twoFAError {
	var twoFactorSecret string
	if err := db.Pool.QueryRow(ctx, "SELECT COALESCE(two_factor_secret, '') FROM users WHERE id = $1", userID).Scan(&twoFactorSecret); err != nil {
		return &twoFAError{Status: http.StatusUnauthorized, Payload: `{"error":"unauthorized"}`}
	}
	if twoFactorSecret == "" {
		return nil
	}

	cleanCode := strings.TrimSpace(rawCode)
	if cleanCode == "" {
		return &twoFAError{
			Status:  http.StatusPreconditionRequired,
			Payload: `{"error":"código 2FA obrigatório para confirmar esta ação","requires_2fa":true}`,
		}
	}

	if auth.VerifyTOTPCode(twoFactorSecret, cleanCode) {
		return nil
	}

	backupHash := auth.HashBackupCode(cleanCode)
	var backupID uuid.UUID
	err := db.Pool.QueryRow(ctx, `
		SELECT id FROM user_2fa_backup_codes
		WHERE user_id = $1 AND code_hash = $2 AND used_at IS NULL
	`, userID, backupHash).Scan(&backupID)
	if err != nil {
		return &twoFAError{Status: http.StatusUnauthorized, Payload: `{"error":"código 2FA ou backup incorreto"}`}
	}

	_, _ = db.Pool.Exec(ctx, `UPDATE user_2fa_backup_codes SET used_at = CURRENT_TIMESTAMP WHERE id = $1`, backupID)
	return nil
}
