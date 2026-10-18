package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"
)

type GIFItem struct {
	ID      string `json:"id"`
	Title   string `json:"title"`
	URL     string `json:"url"`
	Preview string `json:"preview"`
}

type klipyFileVariant struct {
	URL    string `json:"url"`
	Width  int    `json:"width"`
	Height int    `json:"height"`
	Size   int    `json:"size"`
}

type klipyFileResolution struct {
	GIF  klipyFileVariant `json:"gif"`
	WebP klipyFileVariant `json:"webp"`
	JPG  klipyFileVariant `json:"jpg"`
	MP4  klipyFileVariant `json:"mp4"`
	WebM klipyFileVariant `json:"webm"`
}

type klipyGIFItem struct {
	ID    json.RawMessage `json:"id"`
	Slug  string          `json:"slug"`
	Title string          `json:"title"`
	File  struct {
		HD klipyFileResolution `json:"hd"`
		MD klipyFileResolution `json:"md"`
		SM klipyFileResolution `json:"sm"`
		XS klipyFileResolution `json:"xs"`
	} `json:"file"`
}

type klipyResponse struct {
	Result bool            `json:"result"`
	Data   json.RawMessage `json:"data"`
}

type cachedGIFSearch struct {
	items     []GIFItem
	expiresAt time.Time
}

type GIFHandler struct {
	apiKey string
	client *http.Client
	cache  map[string]cachedGIFSearch
	mu     sync.RWMutex
}

func NewGIFHandler(apiKey string) *GIFHandler {
	return &GIFHandler{
		apiKey: strings.TrimSpace(apiKey),
		client: &http.Client{
			Timeout: 8 * time.Second,
		},
		cache: make(map[string]cachedGIFSearch),
	}
}

func (h *GIFHandler) normalizeKlipyItem(item klipyGIFItem) GIFItem {
	idStr := strings.Trim(string(item.ID), `"`)
	title := strings.TrimSpace(item.Title)
	if title == "" {
		title = strings.TrimSpace(item.Slug)
	}
	if title == "" {
		title = "GIF"
	}

	// Priority for high/medium quality animation URL
	var gifURL string
	switch {
	case item.File.HD.GIF.URL != "":
		gifURL = item.File.HD.GIF.URL
	case item.File.MD.GIF.URL != "":
		gifURL = item.File.MD.GIF.URL
	case item.File.SM.GIF.URL != "":
		gifURL = item.File.SM.GIF.URL
	case item.File.HD.WebP.URL != "":
		gifURL = item.File.HD.WebP.URL
	default:
		gifURL = item.File.MD.WebP.URL
	}

	// Priority for lightweight preview thumbnail
	var previewURL string
	switch {
	case item.File.SM.WebP.URL != "":
		previewURL = item.File.SM.WebP.URL
	case item.File.SM.GIF.URL != "":
		previewURL = item.File.SM.GIF.URL
	case item.File.XS.WebP.URL != "":
		previewURL = item.File.XS.WebP.URL
	case item.File.XS.GIF.URL != "":
		previewURL = item.File.XS.GIF.URL
	case item.File.MD.WebP.URL != "":
		previewURL = item.File.MD.WebP.URL
	default:
		previewURL = gifURL
	}

	return GIFItem{
		ID:      idStr,
		Title:   title,
		URL:     gifURL,
		Preview: previewURL,
	}
}

// Trending returns trending GIFs from Klipy
func (h *GIFHandler) Trending(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, `{"error":"Method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	perPage := 24
	if p := r.URL.Query().Get("per_page"); p != "" {
		if val, err := strconv.Atoi(p); err == nil && val > 0 && val <= 50 {
			perPage = val
		}
	}

	page := 1
	if p := r.URL.Query().Get("page"); p != "" {
		if val, err := strconv.Atoi(p); err == nil && val > 0 {
			page = val
		}
	}

	cacheKey := fmt.Sprintf("trending_%d_%d", page, perPage)

	h.mu.RLock()
	cached, found := h.cache[cacheKey]
	h.mu.RUnlock()

	if found && time.Now().Before(cached.expiresAt) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("X-Cache", "HIT")
		_ = json.NewEncoder(w).Encode(cached.items)
		return
	}

	if h.apiKey == "" {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode([]GIFItem{})
		return
	}

	reqURL := fmt.Sprintf("https://api.klipy.com/api/v1/%s/gifs/trending?per_page=%d&page=%d",
		url.PathEscape(h.apiKey), perPage, page)

	items, err := h.fetchFromKlipy(r.Context(), reqURL)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode([]GIFItem{})
		return
	}

	h.mu.Lock()
	if len(h.cache) > 1000 {
		now := time.Now()
		for k, v := range h.cache {
			if now.After(v.expiresAt) {
				delete(h.cache, k)
			}
		}
		if len(h.cache) > 1000 {
			h.cache = make(map[string]cachedGIFSearch)
		}
	}
	h.cache[cacheKey] = cachedGIFSearch{
		items:     items,
		expiresAt: time.Now().Add(10 * time.Minute),
	}
	h.mu.Unlock()

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("X-Cache", "MISS")
	_ = json.NewEncoder(w).Encode(items)
}

// Search searches GIFs in Klipy by query
func (h *GIFHandler) Search(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, `{"error":"Method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	query := strings.TrimSpace(r.URL.Query().Get("q"))
	if query == "" {
		h.Trending(w, r)
		return
	}

	perPage := 24
	if p := r.URL.Query().Get("per_page"); p != "" {
		if val, err := strconv.Atoi(p); err == nil && val > 0 && val <= 50 {
			perPage = val
		}
	}

	page := 1
	if p := r.URL.Query().Get("page"); p != "" {
		if val, err := strconv.Atoi(p); err == nil && val > 0 {
			page = val
		}
	}

	cacheKey := fmt.Sprintf("search_%s_%d_%d", strings.ToLower(query), page, perPage)

	h.mu.RLock()
	cached, found := h.cache[cacheKey]
	h.mu.RUnlock()

	if found && time.Now().Before(cached.expiresAt) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("X-Cache", "HIT")
		_ = json.NewEncoder(w).Encode(cached.items)
		return
	}

	if h.apiKey == "" {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode([]GIFItem{})
		return
	}

	reqURL := fmt.Sprintf("https://api.klipy.com/api/v1/%s/gifs/search?q=%s&per_page=%d&page=%d",
		url.PathEscape(h.apiKey), url.QueryEscape(query), perPage, page)

	items, err := h.fetchFromKlipy(r.Context(), reqURL)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode([]GIFItem{})
		return
	}

	h.mu.Lock()
	if len(h.cache) > 1000 {
		now := time.Now()
		for k, v := range h.cache {
			if now.After(v.expiresAt) {
				delete(h.cache, k)
			}
		}
		if len(h.cache) > 1000 {
			h.cache = make(map[string]cachedGIFSearch)
		}
	}
	h.cache[cacheKey] = cachedGIFSearch{
		items:     items,
		expiresAt: time.Now().Add(5 * time.Minute),
	}
	h.mu.Unlock()

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("X-Cache", "MISS")
	_ = json.NewEncoder(w).Encode(items)
}

func (h *GIFHandler) fetchFromKlipy(ctx context.Context, reqURL string) ([]GIFItem, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, reqURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "ZeroVC-Server/1.0")

	resp, err := h.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("klipy returned status %d", resp.StatusCode)
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, 5*1024*1024))
	if err != nil {
		return nil, err
	}

	var klipyRes klipyResponse
	if err := json.Unmarshal(body, &klipyRes); err != nil {
		return nil, err
	}

	var rawList []klipyGIFItem
	trimmed := strings.TrimSpace(string(klipyRes.Data))
	if strings.HasPrefix(trimmed, "[") {
		_ = json.Unmarshal(klipyRes.Data, &rawList)
	} else if strings.HasPrefix(trimmed, "{") {
		var wrapper struct {
			Data []klipyGIFItem `json:"data"`
		}
		if err := json.Unmarshal(klipyRes.Data, &wrapper); err == nil {
			rawList = wrapper.Data
		}
	}

	items := make([]GIFItem, 0, len(rawList))
	for _, raw := range rawList {
		normalized := h.normalizeKlipyItem(raw)
		if normalized.URL != "" {
			items = append(items, normalized)
		}
	}

	return items, nil
}
