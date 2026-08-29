package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/google/uuid"
	"github.com/zerovc/zerovc/backend/internal/auth"
)

type UploadHandler struct {
	baseDir string
}

func NewUploadHandler(baseDir string) *UploadHandler {
	// Ensure directories exist
	userDir := filepath.Join(baseDir, "user")
	guildDir := filepath.Join(baseDir, "guild")

	os.MkdirAll(userDir, 0755)
	os.MkdirAll(guildDir, 0755)

	return &UploadHandler{
		baseDir: baseDir,
	}
}

var dangerousExtensions = map[string]bool{
	".exe":   true,
	".bat":   true,
	".cmd":   true,
	".sh":    true,
	".ps1":   true,
	".vbs":   true,
	".msi":   true,
	".scr":   true,
	".jar":   true,
	".pif":   true,
	".com":   true,
	".hta":   true,
	".cpl":   true,
	".wsf":   true,
	".msc":   true,
	".html":  true,
	".htm":   true,
	".svg":   true,
	".xhtml": true,
	".shtml": true,
}

var allowedImageExtensions = map[string]bool{
	".jpg":  true,
	".jpeg": true,
	".png":  true,
	".webp": true,
	".gif":  true,
}

func (h *UploadHandler) UploadAvatar(w http.ResponseWriter, r *http.Request) {
	_, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	h.handleUpload(w, r, "user", "avatar", true)
}

func (h *UploadHandler) UploadGuildIcon(w http.ResponseWriter, r *http.Request) {
	_, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	h.handleUpload(w, r, "guild", "icon", true)
}

func (h *UploadHandler) UploadGuildBanner(w http.ResponseWriter, r *http.Request) {
	_, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	h.handleUpload(w, r, "guild", "banner", true)
}

func (h *UploadHandler) UploadBanner(w http.ResponseWriter, r *http.Request) {
	_, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	h.handleUpload(w, r, "user", "banner", true)
}

func (h *UploadHandler) UploadAttachment(w http.ResponseWriter, r *http.Request) {
	_, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	h.handleUpload(w, r, "user", "att", false)
}

func (h *UploadHandler) handleUpload(w http.ResponseWriter, r *http.Request, folder string, prefix string, imageOnly bool) {
	// Max 20 MB
	if err := r.ParseMultipartForm(20 << 20); err != nil {
		http.Error(w, `{"error":"O limite de arquivos é 20MB"}`, http.StatusBadRequest)
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		http.Error(w, `{"error":"file is required"}`, http.StatusBadRequest)
		return
	}
	defer file.Close()

	ext := strings.ToLower(filepath.Ext(header.Filename))

	// If imageOnly (avatar, banner, icon)
	if imageOnly {
		if ext == "" {
			ext = ".jpg"
		}
		if !allowedImageExtensions[ext] {
			http.Error(w, `{"error":"Formato de imagem inválido. Use JPG, PNG, WEBP ou GIF."}`, http.StatusBadRequest)
			return
		}
	} else {
		// Generic attachment: check dangerous extensions
		if dangerousExtensions[ext] {
			http.Error(w, `{"error":"Tipo de arquivo não permitido por motivos de segurança."}`, http.StatusBadRequest)
			return
		}
	}

	filename := fmt.Sprintf("%s_%s%s", prefix, uuid.New().String(), ext)
	targetDir := filepath.Join(h.baseDir, folder)
	os.MkdirAll(targetDir, 0755)

	targetPath := filepath.Join(targetDir, filename)
	dst, err := os.Create(targetPath)
	if err != nil {
		http.Error(w, `{"error":"failed to save file"}`, http.StatusInternalServerError)
		return
	}
	defer dst.Close()

	if _, err := io.Copy(dst, file); err != nil {
		http.Error(w, `{"error":"failed to write file"}`, http.StatusInternalServerError)
		return
	}

	baseURL := getPublicBaseURL(r)
	publicURL := fmt.Sprintf("%s/assets/%s/%s", baseURL, folder, filename)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]any{
		"url":      publicURL,
		"filename": header.Filename,
		"size":     header.Size,
	})
}

func getPublicBaseURL(r *http.Request) string {
	cdn := os.Getenv("CDN_BASE_URL")
	if cdn != "" {
		return strings.TrimRight(cdn, "/")
	}
	scheme := "https"
	if r.TLS == nil && r.Header.Get("X-Forwarded-Proto") != "https" {
		if r.Header.Get("X-Forwarded-Proto") != "" {
			scheme = r.Header.Get("X-Forwarded-Proto")
		} else if strings.HasPrefix(r.Host, "localhost") {
			scheme = "http"
		}
	}
	if r.Host != "" && !strings.HasPrefix(r.Host, "127.0.0.1") && !strings.HasPrefix(r.Host, "localhost") {
		return fmt.Sprintf("%s://%s", scheme, r.Host)
	}
	return "https://zerovc.safiroko.xyz"
}