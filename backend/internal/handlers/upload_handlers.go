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

var GorkBotID = uuid.MustParse("00000000-0000-0000-0000-000000000001")

var dangerousExtensions = map[string]bool{
	".exe":   true,
	".bat":   true,
	".cmd":   true,
	".sh":    true,
	".bash":  true,
	".ps1":   true,
	".psm1":  true,
	".vbs":   true,
	".vbe":   true,
	".js":    true,
	".jse":   true,
	".wsf":   true,
	".wsh":   true,
	".msc":   true,
	".msi":   true,
	".msp":   true,
	".scr":   true,
	".jar":   true,
	".pif":   true,
	".com":   true,
	".hta":   true,
	".cpl":   true,
	".html":  true,
	".htm":   true,
	".svg":   true,
	".xhtml": true,
	".shtml": true,
	".php":   true,
	".php3":  true,
	".php4":  true,
	".php5":  true,
	".phtml": true,
	".asp":   true,
	".aspx":  true,
	".cer":   true,
	".asa":   true,
	".jsp":   true,
	".jspx":  true,
	".cgi":   true,
	".pl":    true,
	".py":    true,
	".dll":   true,
	".so":    true,
	".dylib": true,
	".iso":   true,
	".img":   true,
	".dmg":   true,
	".lnk":   true,
	".inf":   true,
	".reg":   true,
	".app":   true,
	".deb":   true,
	".rpm":   true,
}

var allowedImageExtensions = map[string]bool{
	".jpg":  true,
	".jpeg": true,
	".png":  true,
	".webp": true,
	".gif":  true,
}

func (h *UploadHandler) UploadAvatar(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	h.handleUpload(w, r, "user", "avatar", true, userID)
}

func (h *UploadHandler) UploadGuildIcon(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	h.handleUpload(w, r, "guild", "icon", true, userID)
}

func (h *UploadHandler) UploadGuildBanner(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	h.handleUpload(w, r, "guild", "banner", true, userID)
}

func (h *UploadHandler) UploadBanner(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	h.handleUpload(w, r, "user", "banner", true, userID)
}

func (h *UploadHandler) UploadAttachment(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	h.handleUpload(w, r, "user", "att", false, userID)
}

func (h *UploadHandler) handleUpload(w http.ResponseWriter, r *http.Request, folder string, prefix string, imageOnly bool, userID uuid.UUID) {
	maxSize := int64(20 << 20) // 20 MB padrão

	// Only verified Gork bot user ID gets 100MB limit
	isGork := userID == GorkBotID
	if isGork {
		maxSize = 100 << 20 // Permite até 100MB para o bot Gork
	}

	if err := r.ParseMultipartForm(maxSize); err != nil {
		if isGork {
			http.Error(w, `{"error":"O limite de arquivos para o bot Gork é 100MB"}`, http.StatusBadRequest)
		} else {
			http.Error(w, `{"error":"O limite de arquivos é 20MB"}`, http.StatusBadRequest)
		}
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

	// Sniff first 512 bytes for HTML/SVG disguises
	sniffBuf := make([]byte, 512)
	n, _ := file.Read(sniffBuf)
	if n > 0 {
		detectedType := http.DetectContentType(sniffBuf[:n])
		if strings.Contains(detectedType, "text/html") || strings.Contains(detectedType, "image/svg+xml") {
			if !imageOnly {
				http.Error(w, `{"error":"Tipo de conteúdo de arquivo não permitido."}`, http.StatusBadRequest)
				return
			}
		}
	}
	// Reset file read pointer after sniffing
	if seeker, ok := file.(io.Seeker); ok {
		_, _ = seeker.Seek(0, io.SeekStart)
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