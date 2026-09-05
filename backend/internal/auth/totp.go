package auth

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha1"
	"crypto/subtle"
	"encoding/base32"
	"encoding/binary"
	"fmt"
	"net/url"
	"strings"
	"time"
)

// GenerateTOTPSecret generates a random 160-bit (20 bytes) Base32 encoded secret.
func GenerateTOTPSecret() (string, error) {
	bytes := make([]byte, 20)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(bytes), nil
}

// GetTOTPAuthURI returns the otpauth standard URL for QR Code generation.
func GetTOTPAuthURI(accountName, issuer, secret string) string {
	label := fmt.Sprintf("%s:%s", issuer, accountName)
	return fmt.Sprintf("otpauth://totp/%s?secret=%s&issuer=%s&algorithm=SHA1&digits=6&period=30",
		url.PathEscape(label),
		url.QueryEscape(secret),
		url.QueryEscape(issuer),
	)
}

// VerifyTOTPCode verifies a 6-digit TOTP code against the secret within a [-1, +1] 30-second window.
func VerifyTOTPCode(secret, code string) bool {
	cleanSecret := strings.ToUpper(strings.TrimSpace(secret))
	key, err := base32.StdEncoding.WithPadding(base32.NoPadding).DecodeString(cleanSecret)
	if err != nil {
		// Try with standard padding
		key, err = base32.StdEncoding.DecodeString(cleanSecret)
		if err != nil {
			return false
		}
	}

	cleanCode := strings.TrimSpace(code)
	if len(cleanCode) != 6 {
		return false
	}

	now := time.Now().Unix()
	step := int64(30)
	currentCounter := now / step

	// Check intervals: current step, previous step (-30s), next step (+30s)
	for i := int64(-1); i <= 1; i++ {
		counter := currentCounter + i
		expectedCode := computeTOTP(key, counter)
		if subtle.ConstantTimeCompare([]byte(expectedCode), []byte(cleanCode)) == 1 {
			return true
		}
	}

	return false
}

func computeTOTP(key []byte, counter int64) string {
	buf := make([]byte, 8)
	binary.BigEndian.PutUint64(buf, uint64(counter))

	mac := hmac.New(sha1.New, key)
	mac.Write(buf)
	hash := mac.Sum(nil)

	offset := hash[len(hash)-1] & 0x0f
	code := (int(hash[offset])&0x7f)<<24 |
		(int(hash[offset+1])&0xff)<<16 |
		(int(hash[offset+2])&0xff)<<8 |
		(int(hash[offset+3]) & 0xff)

	otp := code % 1000000
	return fmt.Sprintf("%06d", otp)
}
