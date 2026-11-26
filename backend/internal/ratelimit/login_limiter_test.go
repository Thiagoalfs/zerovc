package ratelimit

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestExtractClientIP_XFFSpoofingPrevention(t *testing.T) {
	t.Setenv("TRUSTED_PROXY_CIDRS", "")

	cases := []struct {
		name       string
		remoteAddr string
		xff        string
		xri        string
		want       string
	}{
		{
			name:       "untrusted direct client cannot spoof XFF or X-Real-IP",
			remoteAddr: "203.0.113.50:43210",
			xff:        "1.2.3.4, 8.8.8.8",
			xri:        "9.9.9.9",
			want:       "203.0.113.50",
		},
		{
			name:       "trusted docker proxy ignores spoofed leftmost XFF",
			remoteAddr: "172.18.0.2:43210",
			xff:        "1.2.3.4, 198.51.100.7",
			want:       "198.51.100.7",
		},
		{
			name:       "trusted multi-hop skips trailing internal proxies right-to-left",
			remoteAddr: "127.0.0.1:8080",
			xff:        "1.2.3.4, 198.51.100.7, 10.0.0.5",
			want:       "198.51.100.7",
		},
		{
			name:       "no proxy headers returns RemoteAddr IP",
			remoteAddr: "192.168.1.10:1234",
			want:       "192.168.1.10",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, "/api/auth/login", nil)
			req.RemoteAddr = tc.remoteAddr
			if tc.xff != "" {
				req.Header.Set("X-Forwarded-For", tc.xff)
			}
			if tc.xri != "" {
				req.Header.Set("X-Real-IP", tc.xri)
			}

			got := ExtractClientIP(req)
			if got != tc.want {
				t.Fatalf("ExtractClientIP() = %q, want %q", got, tc.want)
			}
		})
	}

	t.Run("custom TRUSTED_PROXY_CIDRS honors proxy chain", func(t *testing.T) {
		t.Setenv("TRUSTED_PROXY_CIDRS", "198.51.100.0/24")
		req := httptest.NewRequest(http.MethodPost, "/api/auth/login", nil)
		req.RemoteAddr = "198.51.100.2:443"
		req.Header.Set("X-Forwarded-For", "1.2.3.4, 203.0.113.9, 198.51.100.1")

		if got := ExtractClientIP(req); got != "203.0.113.9" {
			t.Fatalf("ExtractClientIP() = %q, want %q", got, "203.0.113.9")
		}
	})
}
