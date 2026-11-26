package middleware

import (
	"os"
	"strings"
)

// IsAllowedOrigin validates HTTP/WebSocket Origin headers across CORS, Gateway, and Logout.
func IsAllowedOrigin(origin string) bool {
	origin = strings.TrimSpace(origin)
	if origin == "" {
		return true
	}

	switch origin {
	case "https://zerovc.safiroko.xyz",
		"http://tauri.localhost",
		"https://tauri.localhost",
		"tauri://localhost":
		return true
	case "http://localhost:5173":
		return strings.TrimSpace(os.Getenv("APP_ENV")) != "production"
	}

	if appURL := strings.TrimRight(strings.TrimSpace(os.Getenv("APP_URL")), "/"); appURL != "" {
		if origin == appURL {
			return true
		}
	}

	return false
}
