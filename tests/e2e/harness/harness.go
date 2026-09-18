package harness

import (
	"bytes"
	"crypto/tls"
	"encoding/json"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
)

// TestHarness manages the test environment and test sessions.
type TestHarness struct {
	BaseURL     string
	Server      *ContractServer
	IsLive      bool
	client      *http.Client
	globalMutex sync.Mutex
}

// Global default harness instance for test runs.
var (
	defaultHarness *TestHarness
	harnessOnce    sync.Once
)

// GetHarness returns or initializes a singleton test harness.
func GetHarness(t *testing.T) *TestHarness {
	harnessOnce.Do(func() {
		baseURL := os.Getenv("ZEROVC_API_URL")
		if baseURL == "" {
			baseURL = "http://localhost:8080"
		}

		jar, _ := cookiejar.New(nil)
		probeClient := &http.Client{
			Timeout: 2 * time.Second,
			Jar:     jar,
			Transport: &http.Transport{
				TLSClientConfig: &tls.Config{InsecureSkipVerify: false}, // rule: keep TLS verified
			},
		}

		resp, err := probeClient.Get(baseURL + "/health")
		if err == nil && resp.StatusCode == http.StatusOK {
			// Live server is reachable
			defaultHarness = &TestHarness{
				BaseURL: strings.TrimRight(baseURL, "/"),
				IsLive:  true,
				client:  probeClient,
			}
		} else {
			// Start embedded contract server
			cs := NewContractServer()
			defaultHarness = &TestHarness{
				BaseURL: strings.TrimRight(cs.URL, "/"),
				Server:  cs,
				IsLive:  false,
				client:  probeClient,
			}
		}
	})

	return defaultHarness
}

// Close cleans up test server resources.
func (h *TestHarness) Close() {
	if h.Server != nil {
		h.Server.Close()
	}
}

// UserSession encapsulates an authenticated user acting upon the API.
type UserSession struct {
	Harness   *TestHarness
	UserID    uuid.UUID
	Username  string
	Email     string
	Token     string
	CSRFToken string
	Client    *http.Client
}

// NewSession creates an unauthenticated session with isolated cookie jar.
func (h *TestHarness) NewSession() *UserSession {
	jar, _ := cookiejar.New(nil)
	return &UserSession{
		Harness: h,
		Client: &http.Client{
			Timeout: 10 * time.Second,
			Jar:     jar,
			Transport: &http.Transport{
				TLSClientConfig: &tls.Config{InsecureSkipVerify: false},
			},
		},
	}
}

// RegisterAndLogin creates a new user, verifies email, and logs in, returning an active session with CSRF token.
func (h *TestHarness) RegisterAndLogin(t *testing.T, username, email, password string) *UserSession {
	s := h.NewSession()
	s.Username = username
	s.Email = email

	// 1. Register
	regBody := map[string]string{
		"username": username,
		"email":    email,
		"password": password,
	}
	resp, body, err := s.PostPublic("/api/auth/register", regBody)
	if err != nil {
		t.Fatalf("Failed to register user: %v", err)
	}
	if resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK {
		t.Fatalf("Register returned %d: %s", resp.StatusCode, string(body))
	}

	// 2. Verify Email (default code 123456 or 000000 in dev/mock)
	verifyBody := map[string]string{
		"email": email,
		"code":  "123456",
	}
	resp, body, err = s.PostPublic("/api/auth/verify-email", verifyBody)
	if err != nil {
		t.Fatalf("Failed to verify email: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("Verify-email returned %d: %s", resp.StatusCode, string(body))
	}

	// Extract token / user from verify if returned, or proceed to login
	var authResp AuthResponse
	_ = json.Unmarshal(body, &authResp)

	// 3. Login
	loginBody := map[string]string{
		"email":    email,
		"password": password,
	}
	resp, body, err = s.PostPublic("/api/auth/login", loginBody)
	if err != nil {
		t.Fatalf("Failed to login user: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("Login returned %d: %s", resp.StatusCode, string(body))
	}

	var loginData AuthResponse
	if err := json.Unmarshal(body, &loginData); err != nil {
		t.Fatalf("Failed to parse login response: %v", err)
	}

	s.UserID = loginData.User.ID
	s.Token = loginData.Token
	s.CSRFToken = loginData.CSRFToken

	// Also check cookies for csrf_token if not in payload
	u, _ := url.Parse(h.BaseURL)
	for _, cookie := range s.Client.Jar.Cookies(u) {
		if cookie.Name == "csrf_token" && s.CSRFToken == "" {
			s.CSRFToken = cookie.Value
		}
	}

	// Fallback to fetch /api/auth/me to guarantee CSRF token & user profile
	if s.CSRFToken == "" {
		_, meBody, meErr := s.Get("/api/auth/me")
		if meErr == nil {
			var meData map[string]any
			if err := json.Unmarshal(meBody, &meData); err == nil {
				if ct, ok := meData["csrf_token"].(string); ok {
					s.CSRFToken = ct
				}
			}
			for _, cookie := range s.Client.Jar.Cookies(u) {
				if cookie.Name == "csrf_token" && s.CSRFToken == "" {
					s.CSRFToken = cookie.Value
				}
			}
		}
	}

	return s
}

// Do executes an HTTP request, applying Bearer header and CSRF token when appropriate.
func (s *UserSession) Do(req *http.Request) (*http.Response, []byte, error) {
	// Set JSON Content-Type by default if not set
	if req.Header.Get("Content-Type") == "" && req.Body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	// Attach Bearer token if session authenticated
	if s.Token != "" && req.Header.Get("Authorization") == "" {
		req.Header.Set("Authorization", "Bearer "+s.Token)
	}

	resp, err := s.Client.Do(req)
	if err != nil {
		return nil, nil, err
	}
	defer resp.Body.Close()

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return resp, nil, err
	}

	// Update CSRF token if sent in cookie
	u, _ := url.Parse(s.Harness.BaseURL)
	for _, c := range s.Client.Jar.Cookies(u) {
		if c.Name == "csrf_token" && c.Value != "" {
			s.CSRFToken = c.Value
		}
	}

	return resp, bodyBytes, nil
}

// Request helpers

func (s *UserSession) buildURL(path string) string {
	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}
	return s.Harness.BaseURL + path
}

func (s *UserSession) Get(path string) (*http.Response, []byte, error) {
	req, err := http.NewRequest(http.MethodGet, s.buildURL(path), nil)
	if err != nil {
		return nil, nil, err
	}
	return s.Do(req)
}

func (s *UserSession) Post(path string, body any) (*http.Response, []byte, error) {
	var bodyReader io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return nil, nil, err
		}
		bodyReader = bytes.NewReader(data)
	}

	req, err := http.NewRequest(http.MethodPost, s.buildURL(path), bodyReader)
	if err != nil {
		return nil, nil, err
	}

	// Mandatory: Attach CSRF Token on state mutations
	if s.CSRFToken != "" {
		req.Header.Set("X-CSRF-Token", s.CSRFToken)
	}

	return s.Do(req)
}

func (s *UserSession) PostPublic(path string, body any) (*http.Response, []byte, error) {
	var bodyReader io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return nil, nil, err
		}
		bodyReader = bytes.NewReader(data)
	}

	req, err := http.NewRequest(http.MethodPost, s.buildURL(path), bodyReader)
	if err != nil {
		return nil, nil, err
	}
	return s.Do(req)
}

func (s *UserSession) PostWithoutCSRF(path string, body any) (*http.Response, []byte, error) {
	var bodyReader io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return nil, nil, err
		}
		bodyReader = bytes.NewReader(data)
	}

	req, err := http.NewRequest(http.MethodPost, s.buildURL(path), bodyReader)
	if err != nil {
		return nil, nil, err
	}
	// Explicitly omit X-CSRF-Token
	return s.Do(req)
}

func (s *UserSession) PostWithCustomCSRF(path string, body any, csrfToken string) (*http.Response, []byte, error) {
	var bodyReader io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return nil, nil, err
		}
		bodyReader = bytes.NewReader(data)
	}

	req, err := http.NewRequest(http.MethodPost, s.buildURL(path), bodyReader)
	if err != nil {
		return nil, nil, err
	}
	req.Header.Set("X-CSRF-Token", csrfToken)
	return s.Do(req)
}

func (s *UserSession) Patch(path string, body any) (*http.Response, []byte, error) {
	var bodyReader io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return nil, nil, err
		}
		bodyReader = bytes.NewReader(data)
	}

	req, err := http.NewRequest(http.MethodPatch, s.buildURL(path), bodyReader)
	if err != nil {
		return nil, nil, err
	}
	if s.CSRFToken != "" {
		req.Header.Set("X-CSRF-Token", s.CSRFToken)
	}
	return s.Do(req)
}

func (s *UserSession) PatchWithoutCSRF(path string, body any) (*http.Response, []byte, error) {
	var bodyReader io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return nil, nil, err
		}
		bodyReader = bytes.NewReader(data)
	}

	req, err := http.NewRequest(http.MethodPatch, s.buildURL(path), bodyReader)
	if err != nil {
		return nil, nil, err
	}
	return s.Do(req)
}

func (s *UserSession) Put(path string, body any) (*http.Response, []byte, error) {
	var bodyReader io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return nil, nil, err
		}
		bodyReader = bytes.NewReader(data)
	}

	req, err := http.NewRequest(http.MethodPut, s.buildURL(path), bodyReader)
	if err != nil {
		return nil, nil, err
	}
	if s.CSRFToken != "" {
		req.Header.Set("X-CSRF-Token", s.CSRFToken)
	}
	return s.Do(req)
}

func (s *UserSession) PutWithoutCSRF(path string, body any) (*http.Response, []byte, error) {
	var bodyReader io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return nil, nil, err
		}
		bodyReader = bytes.NewReader(data)
	}

	req, err := http.NewRequest(http.MethodPut, s.buildURL(path), bodyReader)
	if err != nil {
		return nil, nil, err
	}
	return s.Do(req)
}

func (s *UserSession) Delete(path string) (*http.Response, []byte, error) {
	req, err := http.NewRequest(http.MethodDelete, s.buildURL(path), nil)
	if err != nil {
		return nil, nil, err
	}
	if s.CSRFToken != "" {
		req.Header.Set("X-CSRF-Token", s.CSRFToken)
	}
	return s.Do(req)
}

func (s *UserSession) DeleteWithoutCSRF(path string) (*http.Response, []byte, error) {
	req, err := http.NewRequest(http.MethodDelete, s.buildURL(path), nil)
	if err != nil {
		return nil, nil, err
	}
	return s.Do(req)
}
