package middleware

import (
	"encoding/json"
	"net/http"
	"os"
	"strconv"
)

const (
	// ClientE2EEVersionHeader is the standard header required on E2EE requests.
	ClientE2EEVersionHeader = "X-Client-E2EE-Version"

	// DefaultE2EEMinClientVersion is the baseline version when not overridden by env.
	DefaultE2EEMinClientVersion = 1
)

// GetMinE2EEClientVersion reads E2EE_MIN_CLIENT_VERSION from environment or defaults to 1.
func GetMinE2EEClientVersion() int {
	if val := os.Getenv("E2EE_MIN_CLIENT_VERSION"); val != "" {
		if ver, err := strconv.Atoi(val); err == nil && ver >= 0 {
			return ver
		}
	}
	return DefaultE2EEMinClientVersion
}

// RequireE2EEClientVersion enforces that incoming requests provide a supported X-Client-E2EE-Version header.
// If the version is missing or below the required minimum, it returns HTTP 426 Upgrade Required.
func RequireE2EEClientVersion(minVersion int) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			rawVer := r.Header.Get(ClientE2EEVersionHeader)
			clientVer, err := strconv.Atoi(rawVer)
			if err != nil || clientVer < minVersion {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusUpgradeRequired) // 426
				_ = json.NewEncoder(w).Encode(map[string]any{
					"error":       "e2ee_client_outdated",
					"min_version": minVersion,
				})
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
