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

func (h *UploadHandler) UploadAvatar(w http.ResponseWriter, r *http.Request) {
	_, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	h.handleUpload(w, r, "user", "avatar")
}

func (h *UploadHandler) UploadGuildIcon(w http.ResponseWriter, r *http.Request) {
	_, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	h.handleUpload(w, r, "guild", "icon")
}

func (h *UploadHandler) UploadBanner(w http.ResponseWriter, r *http.Request) {
	_, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	h.handleUpload(w, r, "user", "banner")
}

func (h *UploadHandler) handleUpload(w http.ResponseWriter, r *http.Request, folder string, prefix string) {
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
	if ext == "" {
		ext = ".jpg"
	}

	// Validate allowed image extensions
	allowed := map[string]bool{
		".jpg":  true,
		".jpeg": true,
		".png":  true,
		".webp": true,
		".gif":  true,
	}
	if !allowed[ext] {
		http.Error(w, `{"error":"Formato de imagem inválido. Use JPG, PNG, WEBP ou GIF."}`, http.StatusBadRequest)
		return
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

	publicURL := fmt.Sprintf("/assets/%s/%s", folder, filename)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]any{
		"url":      publicURL,
		"filename": filename,
		"size":     header.Size,
	})
}
