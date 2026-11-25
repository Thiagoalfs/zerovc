package handlers

import (
	"crypto/tls"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"

	"github.com/zerovc/zerovc/backend/internal/middleware"
)

func TestIsSecureRequest(t *testing.T) {
	t.Setenv("APP_ENV", "")
	t.Setenv("APP_URL", "")

	plainReq := httptest.NewRequest(http.MethodGet, "http://localhost:8080/", nil)
	if isSecureRequest(plainReq) {
		t.Fatal("expected plain HTTP request without proxy/prod env to return false")
	}

	tlsReq := httptest.NewRequest(http.MethodGet, "https://localhost:8080/", nil)
	tlsReq.TLS = &tls.ConnectionState{}
	if !isSecureRequest(tlsReq) {
		t.Fatal("expected TLS request to return true")
	}

	proxyReq := httptest.NewRequest(http.MethodGet, "http://localhost:8080/", nil)
	proxyReq.Header.Set("X-Forwarded-Proto", "HTTPS")
	if !isSecureRequest(proxyReq) {
		t.Fatal("expected X-Forwarded-Proto: HTTPS request to return true")
	}

	t.Setenv("APP_ENV", "production")
	if !isSecureRequest(plainReq) {
		t.Fatal("expected APP_ENV=production to return true")
	}

	t.Setenv("APP_ENV", "")
	t.Setenv("APP_URL", "https://zerovc.safiroko.xyz")
	if !isSecureRequest(plainReq) {
		t.Fatal("expected APP_URL=https://... to return true")
	}
}

func TestLogout_OriginCheckAndSecureCookies(t *testing.T) {
	t.Setenv("APP_ENV", "")
	t.Setenv("APP_URL", "https://custom.zerovc.example/")

	csrfSvc := middleware.NewCSRFService("0123456789abcdef0123456789abcdef")
	h := &AuthHandler{csrf: csrfSvc}

	// 1. Disallowed origin must be rejected with 403
	reqBad := httptest.NewRequest(http.MethodPost, "/api/auth/logout", nil)
	reqBad.Header.Set("Origin", "https://evil.attacker")
	recBad := httptest.NewRecorder()
	h.Logout(recBad, reqBad)
	if recBad.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for disallowed origin, got %d (%s)", recBad.Code, recBad.Body.String())
	}

	// 2. Allowed origin (production, localhost, APP_URL, or empty) must succeed and set Secure cookies behind HTTPS proxy
	allowedOrigins := []string{
		"",
		"https://zerovc.safiroko.xyz",
		"http://localhost:5173",
		"https://custom.zerovc.example",
	}
	for _, orig := range allowedOrigins {
		req := httptest.NewRequest(http.MethodPost, "/api/auth/logout", nil)
		if orig != "" {
			req.Header.Set("Origin", orig)
		}
		req.Header.Set("X-Forwarded-Proto", "https")
		rec := httptest.NewRecorder()
		h.Logout(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200 for origin %q, got %d (%s)", orig, rec.Code, rec.Body.String())
		}

		cookies := rec.Result().Cookies()
		var gotAuth, gotCSRF bool
		for _, c := range cookies {
			if c.Name == "token" && c.MaxAge < 0 && c.Secure && c.HttpOnly {
				gotAuth = true
			}
			if c.Name == middleware.CSRFCookieName && c.MaxAge < 0 && c.Secure && !c.HttpOnly {
				gotCSRF = true
			}
		}
		if !gotAuth || !gotCSRF {
			t.Fatalf("expected both token and csrf_token cleared with Secure=true for origin %q (gotAuth=%v gotCSRF=%v)", orig, gotAuth, gotCSRF)
		}
	}
}

func TestResolveAbsoluteURL_SanitizesSchemes(t *testing.T) {
	base, err := url.Parse("https://example.com/articles/post")
	if err != nil {
		t.Fatalf("base parse failed: %v", err)
	}

	cases := []struct {
		target string
		want   string
	}{
		{"https://cdn.example.com/img.png", "https://cdn.example.com/img.png"},
		{"http://cdn.example.com/vid.mp4", "http://cdn.example.com/vid.mp4"},
		{"HTTPS://cdn.example.com/upper.png", "https://cdn.example.com/upper.png"},
		{"/static/og.png", "https://example.com/static/og.png"},
		{"//cdn.example.com/proto-rel.png", "https://cdn.example.com/proto-rel.png"},
		{"javascript:alert(1)", ""},
		{"JAVASCRIPT:alert(document.cookie)", ""},
		{"data:text/html,<script>alert(1)</script>", ""},
		{"file:///etc/passwd", ""},
		{"vbscript:msgbox(1)", ""},
		{"://invalid-url", ""},
		{"", ""},
	}

	for _, tc := range cases {
		got := resolveAbsoluteURL(base, tc.target)
		if got != tc.want {
			t.Errorf("resolveAbsoluteURL(%q) = %q, want %q", tc.target, got, tc.want)
		}
	}
}
