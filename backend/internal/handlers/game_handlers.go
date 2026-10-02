package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

type GameSearchResult struct {
	ID              int      `json:"id"`
	Name            string   `json:"name"`
	Slug            string   `json:"slug"`
	BackgroundImage string   `json:"background_image,omitempty"`
	IconURL         string   `json:"icon_url,omitempty"`
	Genres          []string `json:"genres,omitempty"`
	Platforms       []string `json:"platforms,omitempty"`
	Released        string   `json:"released,omitempty"`
	Rating          float64  `json:"rating,omitempty"`
}

type rawgSearchResponse struct {
	Count   int `json:"count"`
	Results []struct {
		ID              int     `json:"id"`
		Name            string  `json:"name"`
		Slug            string  `json:"slug"`
		BackgroundImage string  `json:"background_image"`
		Rating          float64 `json:"rating"`
		Released        string  `json:"released"`
		Genres          []struct {
			Name string `json:"name"`
		} `json:"genres"`
		Platforms []struct {
			Platform struct {
				Name string `json:"name"`
			} `json:"platform"`
		} `json:"platforms"`
	} `json:"results"`
}

type cachedGameSearch struct {
	results   []GameSearchResult
	expiresAt time.Time
}

type GameHandler struct {
	apiKey string
	client *http.Client
	cache  map[string]cachedGameSearch
	mu     sync.RWMutex
}

func NewGameHandler(apiKey string) *GameHandler {
	return &GameHandler{
		apiKey: strings.TrimSpace(apiKey),
		client: &http.Client{
			Timeout: 6 * time.Second,
		},
		cache: make(map[string]cachedGameSearch),
	}
}

func (h *GameHandler) SearchGames(w http.ResponseWriter, r *http.Request) {
	query := strings.TrimSpace(r.URL.Query().Get("q"))
	if query == "" {
		query = strings.TrimSpace(r.URL.Query().Get("search"))
	}

	w.Header().Set("Content-Type", "application/json")

	if query == "" {
		_ = json.NewEncoder(w).Encode([]GameSearchResult{})
		return
	}

	normQuery := strings.ToLower(query)

	// 1. Check in-memory cache
	h.mu.RLock()
	cached, found := h.cache[normQuery]
	h.mu.RUnlock()

	if found && time.Now().Before(cached.expiresAt) {
		_ = json.NewEncoder(w).Encode(cached.results)
		return
	}

	// 2. If API Key is missing, log warning and return empty array gracefully
	if h.apiKey == "" {
		log.Printf("[GameHandler] RAWG_API_KEY not configured, returning empty search results")
		_ = json.NewEncoder(w).Encode([]GameSearchResult{})
		return
	}

	// 3. Call RAWG API
	rawgURL := fmt.Sprintf("https://api.rawg.io/api/games?key=%s&search=%s&page_size=10",
		url.QueryEscape(h.apiKey),
		url.QueryEscape(query),
	)

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawgURL, nil)
	if err != nil {
		log.Printf("[GameHandler] Failed to create RAWG request: %v", err)
		_ = json.NewEncoder(w).Encode([]GameSearchResult{})
		return
	}
	req.Header.Set("User-Agent", "ZeroVC-App/1.0 (+https://zerovc.safiroko.xyz)")

	resp, err := h.client.Do(req)
	if err != nil {
		log.Printf("[GameHandler] RAWG request failed: %v", err)
		_ = json.NewEncoder(w).Encode([]GameSearchResult{})
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		log.Printf("[GameHandler] RAWG returned status: %d", resp.StatusCode)
		_ = json.NewEncoder(w).Encode([]GameSearchResult{})
		return
	}

	bodyBytes, err := io.ReadAll(io.LimitReader(resp.Body, 512*1024))
	if err != nil {
		log.Printf("[GameHandler] Failed to read RAWG body: %v", err)
		_ = json.NewEncoder(w).Encode([]GameSearchResult{})
		return
	}

	var rawgResp rawgSearchResponse
	if err := json.Unmarshal(bodyBytes, &rawgResp); err != nil {
		log.Printf("[GameHandler] Failed to decode RAWG response: %v", err)
		_ = json.NewEncoder(w).Encode([]GameSearchResult{})
		return
	}

	results := make([]GameSearchResult, 0, len(rawgResp.Results))
	for _, item := range rawgResp.Results {
		var genres []string
		for _, g := range item.Genres {
			if g.Name != "" {
				genres = append(genres, g.Name)
			}
		}

		var platforms []string
		for _, p := range item.Platforms {
			if p.Platform.Name != "" {
				platforms = append(platforms, p.Platform.Name)
			}
		}

		results = append(results, GameSearchResult{
			ID:              item.ID,
			Name:            item.Name,
			Slug:            item.Slug,
			BackgroundImage: item.BackgroundImage,
			IconURL:         item.BackgroundImage,
			Genres:          genres,
			Platforms:       platforms,
			Released:        item.Released,
			Rating:          item.Rating,
		})
	}

	// 4. Save in cache (24 hours TTL, limit cache to 1000 items)
	h.mu.Lock()
	if len(h.cache) > 1000 {
		// Flush expired
		now := time.Now()
		for k, v := range h.cache {
			if now.After(v.expiresAt) {
				delete(h.cache, k)
			}
		}
	}
	h.cache[normQuery] = cachedGameSearch{
		results:   results,
		expiresAt: time.Now().Add(24 * time.Hour),
	}
	h.mu.Unlock()

	_ = json.NewEncoder(w).Encode(results)
}
