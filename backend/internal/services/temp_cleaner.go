package services

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/zerovc/zerovc/backend/internal/database"
	"github.com/zerovc/zerovc/backend/internal/gateway"
	"github.com/zerovc/zerovc/backend/internal/models"
)

var GorkBotUserID = uuid.MustParse("00000000-0000-0000-0000-000000000001")

type TempCleaner struct {
	db        *database.DB
	uploadDir string
	hub       *gateway.Hub
}

func NewTempCleaner(db *database.DB, uploadDir string, hub *gateway.Hub) *TempCleaner {
	return &TempCleaner{
		db:        db,
		uploadDir: uploadDir,
		hub:       hub,
	}
}

// resolveLocalPath resolves a public URL or asset path to the absolute disk path
func (tc *TempCleaner) resolveLocalPath(fileURL string) string {
	if fileURL == "" {
		return ""
	}

	rawPath := fileURL
	if parsed, err := url.Parse(fileURL); err == nil && parsed.Path != "" {
		rawPath = parsed.Path
	}

	idx := strings.Index(rawPath, "assets/")
	if idx != -1 {
		rel := strings.TrimPrefix(rawPath[idx:], "assets/")
		rel = strings.TrimPrefix(rel, "/")
		return filepath.Join(tc.uploadDir, filepath.Clean(rel))
	}

	// Fallback to filename search in bot_temp
	baseName := filepath.Base(rawPath)
	candidateBot := filepath.Join(tc.uploadDir, "bot_temp", baseName)
	if _, err := os.Stat(candidateBot); err == nil {
		return candidateBot
	}

	return ""
}

// CleanupExpiredFiles deletes files recorded in bot_temp_files that are older than 24 hours (1 day)
func (tc *TempCleaner) CleanupExpiredFiles(ctx context.Context) error {
	rows, err := tc.db.Pool.Query(ctx, `
		SELECT id, file_url, file_path, message_id, channel_id, dm_room_id, dm_group_id
		FROM bot_temp_files
		WHERE expires_at <= CURRENT_TIMESTAMP
	`)
	if err != nil {
		return fmt.Errorf("failed to query expired bot files: %w", err)
	}

	type tempRecord struct {
		id        uuid.UUID
		fileURL   string
		filePath  string
		messageID *uuid.UUID
		channelID *uuid.UUID
		dmRoomID  *uuid.UUID
		dmGroupID *uuid.UUID
	}

	var expiredList []tempRecord
	for rows.Next() {
		var rec tempRecord
		if err := rows.Scan(&rec.id, &rec.fileURL, &rec.filePath, &rec.messageID, &rec.channelID, &rec.dmRoomID, &rec.dmGroupID); err == nil {
			expiredList = append(expiredList, rec)
		}
	}
	rows.Close()

	if len(expiredList) == 0 {
		return nil
	}

	log.Printf("[TempCleaner] Found %d expired bot temporary files to clean up.\n", len(expiredList))

	for _, item := range expiredList {
		// 1. Remove physical file from disk
		diskPath := item.filePath
		if diskPath == "" {
			diskPath = tc.resolveLocalPath(item.fileURL)
		}
		if diskPath != "" {
			_ = os.Remove(diskPath)
		}

		// 2. Update message in DB ONLY if it has an associated message
		if item.messageID != nil {
			if item.channelID != nil {
				var content string
				var attBytes []byte
				if err := tc.db.Pool.QueryRow(ctx, "SELECT content, attachments FROM messages WHERE id = $1", *item.messageID).Scan(&content, &attBytes); err == nil {
					var atts []models.Attachment
					_ = json.Unmarshal(attBytes, &atts)
					// Only update content if there were actual attachments to expire
					if len(atts) > 0 || strings.Contains(content, "[") {
						newContent := formatExpiredContent(content)
						_, _ = tc.db.Pool.Exec(ctx, "UPDATE messages SET attachments = '[]'::jsonb, content = $1 WHERE id = $2", newContent, *item.messageID)
					}
				}
			} else if item.dmRoomID != nil {
				var content string
				var attBytes []byte
				if err := tc.db.Pool.QueryRow(ctx, "SELECT content, attachments FROM dm_messages WHERE id = $1", *item.messageID).Scan(&content, &attBytes); err == nil {
					var atts []models.Attachment
					_ = json.Unmarshal(attBytes, &atts)
					if len(atts) > 0 || strings.Contains(content, "[") {
						newContent := formatExpiredContent(content)
						_, _ = tc.db.Pool.Exec(ctx, "UPDATE dm_messages SET attachments = '[]'::jsonb, content = $1 WHERE id = $2", newContent, *item.messageID)
					}
				}
			} else if item.dmGroupID != nil {
				var content string
				var attBytes []byte
				if err := tc.db.Pool.QueryRow(ctx, "SELECT content, attachments FROM dm_group_messages WHERE id = $1", *item.messageID).Scan(&content, &attBytes); err == nil {
					var atts []models.Attachment
					_ = json.Unmarshal(attBytes, &atts)
					if len(atts) > 0 || strings.Contains(content, "[") {
						newContent := formatExpiredContent(content)
						_, _ = tc.db.Pool.Exec(ctx, "UPDATE dm_group_messages SET attachments = '[]'::jsonb, content = $1 WHERE id = $2", newContent, *item.messageID)
					}
				}
			}
		}

		// 3. Delete from bot_temp_files
		_, _ = tc.db.Pool.Exec(ctx, "DELETE FROM bot_temp_files WHERE id = $1", item.id)
	}

	// 4. File-system sweep: remove orphaned files in bot_temp modified more than 24h ago
	botTempDir := filepath.Join(tc.uploadDir, "bot_temp")
	if entries, err := os.ReadDir(botTempDir); err == nil {
		cutoff := time.Now().Add(-24 * time.Hour)
		for _, e := range entries {
			if !e.IsDir() {
				info, err := e.Info()
				if err == nil && info.ModTime().Before(cutoff) {
					_ = os.Remove(filepath.Join(botTempDir, e.Name()))
				}
			}
		}
	}

	return nil
}

// Start launches the background cleaner with interval checks
func (tc *TempCleaner) Start(ctx context.Context) {
	// 1. Run initial cleanup of expired records only (NO global purge of valid bot messages)
	if err := tc.CleanupExpiredFiles(ctx); err != nil {
		log.Printf("[TempCleaner] Error during initial expired files check: %v\n", err)
	}

	// 2. Schedule recurring cleanup every 15 minutes
	ticker := time.NewTicker(15 * time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			log.Println("[TempCleaner] Stopping temporary cleaner worker...")
			return
		case <-ticker.C:
			if err := tc.CleanupExpiredFiles(ctx); err != nil {
				log.Printf("[TempCleaner] Error running periodic cleanup: %v\n", err)
			}
		}
	}
}

func formatExpiredContent(oldContent string) string {
	if strings.Contains(oldContent, "expirada") {
		return oldContent
	}

	// Extract title from markdown link if present: [Title](URL)
	title := "Mídia"
	if start := strings.Index(oldContent, "["); start != -1 {
		if end := strings.Index(oldContent, "]"); end > start {
			title = oldContent[start+1 : end]
		}
	}

	return fmt.Sprintf("🎵 **Mídia expirada:** %s *(Arquivo temporário excluído após 24h para economia de espaço)*", title)
}
