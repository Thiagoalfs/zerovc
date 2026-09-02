package audit

import (
	"context"
	"encoding/json"

	"github.com/google/uuid"
	"github.com/zerovc/zerovc/backend/internal/database"
	"github.com/zerovc/zerovc/backend/internal/gateway"
	"github.com/zerovc/zerovc/backend/internal/models"
)

func Log(ctx context.Context, db *database.DB, hub *gateway.Hub, guildID, actorID uuid.UUID, actionType string, targetID *uuid.UUID, details map[string]any) {
	if details == nil {
		details = make(map[string]any)
	}
	detailsJSON, err := json.Marshal(details)
	if err != nil {
		detailsJSON = []byte("{}")
	}

	var entry models.AuditLog
	entry.GuildID = guildID
	entry.ActorID = actorID
	entry.ActionType = actionType
	entry.TargetID = targetID
	entry.Details = details

	query := `
		INSERT INTO audit_logs (guild_id, actor_id, action_type, target_id, details)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, created_at
	`
	err = db.Pool.QueryRow(ctx, query, guildID, actorID, actionType, targetID, detailsJSON).Scan(&entry.ID, &entry.CreatedAt)
	if err != nil {
		return
	}

	// Fetch actor details
	var actor models.UserPublic
	_ = db.Pool.QueryRow(ctx, "SELECT id, username, display_name, avatar_url, banner_url, bio, status, custom_status FROM users WHERE id = $1", actorID).Scan(
		&actor.ID, &actor.Username, &actor.DisplayName, &actor.AvatarURL, &actor.BannerURL, &actor.Bio, &actor.Status, &actor.CustomStatus,
	)
	entry.Actor = &actor

	// If target is a user, fetch target user details
	if targetID != nil {
		var tu models.UserPublic
		err = db.Pool.QueryRow(ctx, "SELECT id, username, display_name, avatar_url, banner_url, bio, status, custom_status FROM users WHERE id = $1", *targetID).Scan(
			&tu.ID, &tu.Username, &tu.DisplayName, &tu.AvatarURL, &tu.BannerURL, &tu.Bio, &tu.Status, &tu.CustomStatus,
		)
		if err == nil {
			entry.TargetUser = &tu
		}
	}

	if hub != nil {
		hub.BroadcastToGuild(guildID, models.WSEvent{
			Type: models.EventAuditLogCreate,
			Data: entry,
		})
	}
}
