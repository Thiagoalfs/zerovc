package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
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

type steamSearchItem struct {
	AppID json.RawMessage `json:"appid"`
	Name  string          `json:"name"`
	Icon  string          `json:"icon"`
	Logo  string          `json:"logo"`
}

func findSteamIcon(name string, steamMatches map[string]string) string {
	clean := strings.ToLower(strings.TrimSpace(name))
	if icon, ok := steamMatches[clean]; ok && icon != "" {
		return icon
	}
	for k, v := range steamMatches {
		if strings.Contains(clean, k) || strings.Contains(k, clean) {
			return v
		}
	}
	return ""
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

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	// 2. Query Steam Search dynamically for real-time game icons
	steamMatches := make(map[string]string)
	steamResults := make([]GameSearchResult, 0)

	steamReq, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://steamcommunity.com/actions/SearchApps/"+url.PathEscape(query), nil)
	if err == nil {
		steamReq.Header.Set("User-Agent", "ZeroVC-App/1.0 (+https://zerovc.safiroko.xyz)")
		if sResp, sErr := h.client.Do(steamReq); sErr == nil && sResp.StatusCode == http.StatusOK {
			defer sResp.Body.Close()
			var sItems []steamSearchItem
			if body, rErr := io.ReadAll(io.LimitReader(sResp.Body, 256*1024)); rErr == nil {
				if err := json.Unmarshal(body, &sItems); err == nil {
					for idx, item := range sItems {
						if item.Name != "" && item.Icon != "" {
							cleanName := strings.ToLower(strings.TrimSpace(item.Name))
							steamMatches[cleanName] = item.Icon
							if idx < 10 {
								steamResults = append(steamResults, GameSearchResult{
									ID:              1000000 + idx,
									Name:            item.Name,
									Slug:            strings.ReplaceAll(cleanName, " ", "-"),
									BackgroundImage: item.Logo,
									IconURL:         item.Icon,
								})
							}
						}
					}
				}
			}
		}
	}

	results := make([]GameSearchResult, 0)

	// 4. Call RAWG API if key is present
	if h.apiKey != "" {
		rawgURL := fmt.Sprintf("https://api.rawg.io/api/games?key=%s&search=%s&page_size=10",
			url.QueryEscape(h.apiKey),
			url.QueryEscape(query),
		)

		req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawgURL, nil)
		if err == nil {
			req.Header.Set("User-Agent", "ZeroVC-App/1.0 (+https://zerovc.safiroko.xyz)")
			resp, err := h.client.Do(req)
			if err == nil && resp.StatusCode == http.StatusOK {
				defer resp.Body.Close()
				bodyBytes, err := io.ReadAll(io.LimitReader(resp.Body, 512*1024))
				if err == nil {
					var rawgResp rawgSearchResponse
					if err := json.Unmarshal(bodyBytes, &rawgResp); err == nil {
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

							// Resolve square icon dynamically from Steam match if available, fallback to RAWG background
							resolvedIcon := findSteamIcon(item.Name, steamMatches)
							if resolvedIcon == "" {
								resolvedIcon = item.BackgroundImage
							}

							// Check if already in results
							exists := false
							for _, existing := range results {
								if strings.EqualFold(existing.Name, item.Name) {
									exists = true
									break
								}
							}

							if !exists {
								results = append(results, GameSearchResult{
									ID:              item.ID,
									Name:            item.Name,
									Slug:            item.Slug,
									BackgroundImage: item.BackgroundImage,
									IconURL:         resolvedIcon,
									Genres:          genres,
									Platforms:       platforms,
									Released:        item.Released,
									Rating:          item.Rating,
								})
							}
						}
					}
				}
			}
		}
	}

	// 5. If RAWG gave no results, append Steam search results
	if len(results) == 0 {
		results = steamResults
	}

	// 6. Save in cache (24 hours TTL, limit cache to 1000 items)
	h.mu.Lock()
	if len(h.cache) > 1000 {
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
