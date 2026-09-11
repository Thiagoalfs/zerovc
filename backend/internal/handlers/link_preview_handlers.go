package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"html"
	"io"
	"net"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"sync"
	"time"
)

type LinkMetadata struct {
	URL         string `json:"url"`
	Title       string `json:"title,omitempty"`
	Description string `json:"description,omitempty"`
	SiteName    string `json:"site_name,omitempty"`
	ImageURL    string `json:"image_url,omitempty"`
	Favicon     string `json:"favicon,omitempty"`
	ThemeColor  string `json:"theme_color,omitempty"`
	MediaType   string `json:"media_type,omitempty"`
}

type LinkPreviewHandler struct {
	client *http.Client
	cache  map[string]cachedMetadata
	mu     sync.RWMutex
}

type cachedMetadata struct {
	meta      LinkMetadata
	expiresAt time.Time
}

func NewLinkPreviewHandler() *LinkPreviewHandler {
	resolver := &net.Resolver{}
	dialer := &net.Dialer{
		Timeout:   5 * time.Second,
		KeepAlive: 30 * time.Second,
	}

	transport := &http.Transport{
		DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
			host, port, err := net.SplitHostPort(addr)
			if err != nil {
				return nil, fmt.Errorf("invalid address %q: %w", addr, err)
			}

			// Pre-resolve host to IPs
			ips, err := resolver.LookupIPAddr(ctx, host)
			if err != nil {
				return nil, fmt.Errorf("failed to resolve host %q: %w", host, err)
			}

			if len(ips) == 0 {
				return nil, fmt.Errorf("no IP addresses resolved for host %q", host)
			}

			// Validate all resolved IPs
			for _, ipAddr := range ips {
				if isDisallowedIP(ipAddr.IP) {
					return nil, fmt.Errorf("SSRF protection: connection to restricted IP %s blocked", ipAddr.IP.String())
				}
			}

			// Connect directly to the validated IP to prevent DNS rebinding
			targetAddr := net.JoinHostPort(ips[0].IP.String(), port)
			return dialer.DialContext(ctx, network, targetAddr)
		},
		TLSHandshakeTimeout:   5 * time.Second,
		ResponseHeaderTimeout: 5 * time.Second,
		ExpectContinueTimeout: 1 * time.Second,
	}

	return &LinkPreviewHandler{
		client: &http.Client{
			Transport: transport,
			Timeout:   8 * time.Second,
			CheckRedirect: func(req *http.Request, via []*http.Request) error {
				if len(via) >= 5 {
					return fmt.Errorf("too many redirects")
				}

				// Re-validate host on redirect
				host := req.URL.Hostname()
				if isPrivateOrLocalHost(host) {
					return fmt.Errorf("SSRF protection: redirect to private/local host %q blocked", host)
				}

				// Resolve target IP on redirect and validate
				ips, err := net.LookupIP(host)
				if err == nil {
					for _, ip := range ips {
						if isDisallowedIP(ip) {
							return fmt.Errorf("SSRF protection: redirect to restricted IP %s blocked", ip.String())
						}
					}
				}

				return nil
			},
		},
		cache: make(map[string]cachedMetadata),
	}
}

var (
	ogTitleRegex    = regexp.MustCompile(`(?i)<meta\s+[^>]*?(?:property|name)=["'](?:og:title|twitter:title)["'][^>]*?content=["']([^"']*)["']|<meta\s+[^>]*?content=["']([^"']*)["'][^>]*?(?:property|name)=["'](?:og:title|twitter:title)["']`)
	ogDescRegex     = regexp.MustCompile(`(?i)<meta\s+[^>]*?(?:property|name)=["'](?:og:description|twitter:description|description)["'][^>]*?content=["']([^"']*)["']|<meta\s+[^>]*?content=["']([^"']*)["'][^>]*?(?:property|name)=["'](?:og:description|twitter:description|description)["']`)
	ogSiteNameRegex = regexp.MustCompile(`(?i)<meta\s+[^>]*?(?:property|name)=["'](?:og:site_name|twitter:site)["'][^>]*?content=["']([^"']*)["']|<meta\s+[^>]*?content=["']([^"']*)["'][^>]*?(?:property|name)=["'](?:og:site_name|twitter:site)["']`)
	ogImageRegex    = regexp.MustCompile(`(?i)<meta\s+[^>]*?(?:property|name)=["'](?:og:image|og:image:url|twitter:image|twitter:image:src)["'][^>]*?content=["']([^"']*)["']|<meta\s+[^>]*?content=["']([^"']*)["'][^>]*?(?:property|name)=["'](?:og:image|og:image:url|twitter:image|twitter:image:src)["']`)
	ogTypeRegex     = regexp.MustCompile(`(?i)<meta\s+[^>]*?(?:property|name)=["'](?:og:type)["'][^>]*?content=["']([^"']*)["']|<meta\s+[^>]*?content=["']([^"']*)["'][^>]*?(?:property|name)=["'](?:og:type)["']`)
	themeColorRegex = regexp.MustCompile(`(?i)<meta\s+[^>]*?name=["']theme-color["'][^>]*?content=["']([^"']*)["']|<meta\s+[^>]*?content=["']([^"']*)["'][^>]*?name=["']theme-color["']`)
	htmlTitleRegex  = regexp.MustCompile(`(?i)<title[^>]*>([^<]+)</title>`)
	faviconRegex    = regexp.MustCompile(`(?i)<link\s+[^>]*?rel=["'](?:shortcut icon|icon|apple-touch-icon)["'][^>]*?href=["']([^"']*)["']|<link\s+[^>]*?href=["']([^"']*)["'][^>]*?rel=["'](?:shortcut icon|icon|apple-touch-icon)["']`)
)

func (h *LinkPreviewHandler) GetMetadata(w http.ResponseWriter, r *http.Request) {
	rawTargetURL := strings.TrimSpace(r.URL.Query().Get("url"))
	if rawTargetURL == "" {
		http.Error(w, `{"error":"url parameter is required"}`, http.StatusBadRequest)
		return
	}

	if !strings.HasPrefix(rawTargetURL, "http://") && !strings.HasPrefix(rawTargetURL, "https://") {
		rawTargetURL = "https://" + rawTargetURL
	}

	parsedURL, err := url.Parse(rawTargetURL)
	if err != nil || parsedURL.Host == "" {
		http.Error(w, `{"error":"invalid url"}`, http.StatusBadRequest)
		return
	}

	host := parsedURL.Hostname()
	if isPrivateOrLocalHost(host) {
		http.Error(w, `{"error":"forbidden target address"}`, http.StatusForbidden)
		return
	}

	h.mu.RLock()
	cached, exists := h.cache[rawTargetURL]
	h.mu.RUnlock()
	if exists && time.Now().Before(cached.expiresAt) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "public, max-age=3600")
		json.NewEncoder(w).Encode(cached.meta)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 6*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, "GET", parsedURL.String(), nil)
	if err != nil {
		http.Error(w, `{"error":"failed to create request"}`, http.StatusInternalServerError)
		return
	}

	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)")
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
	req.Header.Set("Accept-Language", "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7")

	resp, err := h.client.Do(req)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"failed to fetch url: %s"}`, err.Error()), http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	contentType := resp.Header.Get("Content-Type")
	if !strings.Contains(contentType, "text/html") && !strings.Contains(contentType, "application/xhtml+xml") {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(LinkMetadata{URL: rawTargetURL})
		return
	}

	limitReader := io.LimitReader(resp.Body, 256*1024)
	bodyBytes, err := io.ReadAll(limitReader)
	if err != nil {
		http.Error(w, `{"error":"failed to read html response"}`, http.StatusInternalServerError)
		return
	}

	htmlContent := string(bodyBytes)
	meta := LinkMetadata{
		URL: rawTargetURL,
	}

	if match := ogTitleRegex.FindStringSubmatch(htmlContent); len(match) > 0 {
		meta.Title = cleanMetaValue(match[1], match[2])
	} else if match := htmlTitleRegex.FindStringSubmatch(htmlContent); len(match) > 1 {
		meta.Title = strings.TrimSpace(html.UnescapeString(match[1]))
	}

	if match := ogDescRegex.FindStringSubmatch(htmlContent); len(match) > 0 {
		meta.Description = cleanMetaValue(match[1], match[2])
	}

	if match := ogSiteNameRegex.FindStringSubmatch(htmlContent); len(match) > 0 {
		meta.SiteName = cleanMetaValue(match[1], match[2])
	}
	if meta.SiteName == "" {
		meta.SiteName = parsedURL.Hostname()
	}

	if match := ogImageRegex.FindStringSubmatch(htmlContent); len(match) > 0 {
		rawImg := cleanMetaValue(match[1], match[2])
		if rawImg != "" {
			meta.ImageURL = resolveAbsoluteURL(parsedURL, rawImg)
		}
	}

	if match := themeColorRegex.FindStringSubmatch(htmlContent); len(match) > 0 {
		meta.ThemeColor = cleanMetaValue(match[1], match[2])
	}

	if match := ogTypeRegex.FindStringSubmatch(htmlContent); len(match) > 0 {
		meta.MediaType = cleanMetaValue(match[1], match[2])
	}

	if match := faviconRegex.FindStringSubmatch(htmlContent); len(match) > 0 {
		rawFavicon := cleanMetaValue(match[1], match[2])
		if rawFavicon != "" {
			meta.Favicon = resolveAbsoluteURL(parsedURL, rawFavicon)
		}
	}
	if meta.Favicon == "" {
		meta.Favicon = fmt.Sprintf("%s://%s/favicon.ico", parsedURL.Scheme, parsedURL.Host)
	}

	if len(meta.Title) > 300 {
		meta.Title = meta.Title[:300] + "..."
	}
	if len(meta.Description) > 500 {
		meta.Description = meta.Description[:500] + "..."
	}

	h.mu.Lock()
	if len(h.cache) > 2000 {
		h.cache = make(map[string]cachedMetadata)
	}
	h.cache[rawTargetURL] = cachedMetadata{
		meta:      meta,
		expiresAt: time.Now().Add(2 * time.Hour),
	}
	h.mu.Unlock()

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "public, max-age=3600")
	json.NewEncoder(w).Encode(meta)
}

func cleanMetaValue(v1, v2 string) string {
	val := strings.TrimSpace(v1)
	if val == "" {
		val = strings.TrimSpace(v2)
	}
	return html.UnescapeString(val)
}

func resolveAbsoluteURL(baseURL *url.URL, target string) string {
	if strings.HasPrefix(target, "http://") || strings.HasPrefix(target, "https://") {
		return target
	}
	parsedTarget, err := url.Parse(target)
	if err != nil {
		return target
	}
	return baseURL.ResolveReference(parsedTarget).String()
}

func isPrivateOrLocalHost(host string) bool {
	if host == "localhost" || host == "127.0.0.1" || host == "::1" || host == "0.0.0.0" {
		return true
	}
	ip := net.ParseIP(host)
	if ip != nil {
		return isDisallowedIP(ip)
	}
	return false
}

// isDisallowedIP verifies if an IP address belongs to loopback, private RFC 1918,
// cloud metadata (169.254.169.254), link-local, unspecified, or multicast ranges.
func isDisallowedIP(ip net.IP) bool {
	if ip == nil {
		return true
	}

	if ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() || ip.IsUnspecified() {
		return true
	}

	// Cloud metadata IP (AWS/GCP/Azure/OpenStack metadata service)
	metadataIP := net.ParseIP("169.254.169.254")
	if ip.Equal(metadataIP) {
		return true
	}

	// Explicit CIDR blocks check for defense in depth
	disallowedCIDRs := []string{
		"127.0.0.0/8",    // Loopback
		"10.0.0.0/8",     // RFC 1918 Private
		"172.16.0.0/12",  // RFC 1918 Private
		"192.168.0.0/16", // RFC 1918 Private
		"169.254.0.0/16", // Link-local / Cloud metadata
		"0.0.0.0/8",      // Current network
		"100.64.0.0/10",  // Carrier-grade NAT
		"198.18.0.0/15",  // Benchmark testing
		"224.0.0.0/4",    // Multicast
		"240.0.0.0/4",    // Reserved
		"::1/128",        // IPv6 loopback
		"fc00::/7",       // IPv6 Unique Local Address
		"fe80::/10",      // IPv6 Link-Local
	}

	for _, cidr := range disallowedCIDRs {
		_, block, err := net.ParseCIDR(cidr)
		if err == nil && block.Contains(ip) {
			return true
		}
	}

	return false
}
