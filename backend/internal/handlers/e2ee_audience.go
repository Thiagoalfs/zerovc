package handlers

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/zerovc/zerovc/backend/internal/auth"
	"github.com/zerovc/zerovc/backend/internal/database"
	"github.com/zerovc/zerovc/backend/internal/gateway"
	"github.com/zerovc/zerovc/backend/internal/models"
)

// AudienceLimitExceededError is returned when an E2EE channel audience exceeds its configured limit.
type AudienceLimitExceededError struct {
	CurrentMembers int
	Limit          int
}

func (e *AudienceLimitExceededError) Error() string {
	return fmt.Sprintf("audience_limit_exceeded: current %d, limit %d", e.CurrentMembers, e.Limit)
}

// ChannelAudienceDebouncer provides thread-safe debouncing of channel audience recomputations.
type ChannelAudienceDebouncer struct {
	mu          sync.Mutex
	timers      map[uuid.UUID]*time.Timer
	duration    time.Duration
	db          *database.DB
	hub         *gateway.Hub
	recomputeFn func(ctx context.Context, channelID uuid.UUID) (*models.ChannelAudienceResponse, error)
}

// NewChannelAudienceDebouncer creates a new debouncer for channel audience recomputations.
func NewChannelAudienceDebouncer(
	db *database.DB,
	hub *gateway.Hub,
	duration time.Duration,
	recomputeFn func(ctx context.Context, channelID uuid.UUID) (*models.ChannelAudienceResponse, error),
) *ChannelAudienceDebouncer {
	if duration <= 0 {
		duration = 500 * time.Millisecond
	}
	return &ChannelAudienceDebouncer{
		timers:      make(map[uuid.UUID]*time.Timer),
		duration:    duration,
		db:          db,
		hub:         hub,
		recomputeFn: recomputeFn,
	}
}

// Trigger schedules a debounced audience recomputation for the specified channel.
func (d *ChannelAudienceDebouncer) Trigger(channelID uuid.UUID) {
	if d == nil {
		return
	}
	d.mu.Lock()
	defer d.mu.Unlock()

	if timer, exists := d.timers[channelID]; exists {
		timer.Stop()
	}

	d.timers[channelID] = time.AfterFunc(d.duration, func() {
		d.mu.Lock()
		delete(d.timers, channelID)
		d.mu.Unlock()

		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()

		if d.recomputeFn != nil {
			if _, err := d.recomputeFn(ctx, channelID); err != nil {
				log.Printf("[AudienceDebouncer] recomputation error for channel %s: %v", channelID, err)
			}
		}
	})
}

// TriggerGuildChannels triggers debounced recomputation for all E2EE channels in a guild.
func (d *ChannelAudienceDebouncer) TriggerGuildChannels(ctx context.Context, guildID uuid.UUID) {
	if d == nil || d.db == nil {
		return
	}
	rows, err := d.db.Pool.Query(ctx, "SELECT id FROM channels WHERE guild_id = $1 AND e2ee_enabled = TRUE", guildID)
	if err != nil {
		return
	}
	defer rows.Close()

	for rows.Next() {
		var chID uuid.UUID
		if err := rows.Scan(&chID); err == nil {
			d.Trigger(chID)
		}
	}
}

// TriggerUserChannels triggers debounced recomputation for all E2EE channels a user belongs to.
func (d *ChannelAudienceDebouncer) TriggerUserChannels(ctx context.Context, userID uuid.UUID) {
	if d == nil || d.db == nil {
		return
	}
	query := `
		SELECT DISTINCT c.id
		FROM channels c
		INNER JOIN guild_members gm ON gm.guild_id = c.guild_id
		WHERE gm.user_id = $1 AND c.e2ee_enabled = TRUE
	`
	rows, err := d.db.Pool.Query(ctx, query, userID)
	if err != nil {
		return
	}
	defer rows.Close()

	for rows.Next() {
		var chID uuid.UUID
		if err := rows.Scan(&chID); err == nil {
			d.Trigger(chID)
		}
	}
}

// Stop cancels any pending recomputation timers.
func (d *ChannelAudienceDebouncer) Stop() {
	if d == nil {
		return
	}
	d.mu.Lock()
	defer d.mu.Unlock()
	for id, timer := range d.timers {
		timer.Stop()
		delete(d.timers, id)
	}
}

// RecomputeAudience resolves channel authorized members, evaluates permissions & overwrites,
// queries active devices, calculates the canonical SHA-256 audience hash, and increments rotation_epoch
// if the audience hash changed.
func (h *E2EEHandler) RecomputeAudience(ctx context.Context, channelID uuid.UUID) (*models.ChannelAudienceResponse, error) {
	return RecomputeAudience(ctx, h.db, h.hub, channelID)
}

// RecomputeAudience is the standalone core implementation.
func RecomputeAudience(ctx context.Context, db *database.DB, hub *gateway.Hub, channelID uuid.UUID) (*models.ChannelAudienceResponse, error) {
	if db == nil {
		return nil, errors.New("database connection is required")
	}

	// 1. Fetch channel context and guild owner
	var guildID uuid.UUID
	var isPrivate bool
	var e2eeEnabled bool
	var rotationEpoch int
	var audienceLimit int
	var existingAudienceHash sql.NullString
	var ownerID uuid.UUID

	queryChannel := `
		SELECT c.guild_id, c.is_private, COALESCE(c.e2ee_enabled, false),
		       COALESCE(c.rotation_epoch, 1), COALESCE(c.audience_limit, 15), c.audience_hash,
		       g.owner_id
		FROM channels c
		INNER JOIN guilds g ON g.id = c.guild_id
		WHERE c.id = $1
	`
	err := db.Pool.QueryRow(ctx, queryChannel, channelID).Scan(
		&guildID, &isPrivate, &e2eeEnabled,
		&rotationEpoch, &audienceLimit, &existingAudienceHash,
		&ownerID,
	)
	if err != nil {
		return nil, fmt.Errorf("channel not found: %w", err)
	}

	// 2. Query all unbanned members of this guild
	queryMembers := `
		SELECT gm.user_id
		FROM guild_members gm
		WHERE gm.guild_id = $1
		  AND NOT EXISTS (
		      SELECT 1 FROM guild_bans gb
		      WHERE gb.guild_id = gm.guild_id AND gb.user_id = gm.user_id
		  )
		ORDER BY gm.user_id ASC
	`
	memberRows, err := db.Pool.Query(ctx, queryMembers, guildID)
	if err != nil {
		return nil, fmt.Errorf("failed to query guild members: %w", err)
	}
	defer memberRows.Close()

	candidates := make([]uuid.UUID, 0)
	for memberRows.Next() {
		var uid uuid.UUID
		if err := memberRows.Scan(&uid); err == nil {
			candidates = append(candidates, uid)
		}
	}

	// 3. Query all roles for this guild
	type roleInfo struct {
		ID          uuid.UUID
		Name        string
		Permissions int64
	}
	guildRoles := make(map[uuid.UUID]roleInfo)
	var everyoneRoleID uuid.UUID
	var everyonePerms int64

	roleRows, err := db.Pool.Query(ctx, "SELECT id, name, permissions FROM guild_roles WHERE guild_id = $1", guildID)
	if err == nil {
		for roleRows.Next() {
			var r roleInfo
			if err := roleRows.Scan(&r.ID, &r.Name, &r.Permissions); err == nil {
				guildRoles[r.ID] = r
				if r.Name == "@everyone" {
					everyoneRoleID = r.ID
					everyonePerms = r.Permissions
				}
			}
		}
		roleRows.Close()
	}

	// 4. Query all member-role assignments for this guild
	memberRoleMap := make(map[uuid.UUID][]uuid.UUID)
	mrRows, err := db.Pool.Query(ctx, "SELECT user_id, role_id FROM guild_member_roles WHERE guild_id = $1", guildID)
	if err == nil {
		for mrRows.Next() {
			var uid, rid uuid.UUID
			if err := mrRows.Scan(&uid, &rid); err == nil {
				memberRoleMap[uid] = append(memberRoleMap[uid], rid)
			}
		}
		mrRows.Close()
	}

	// 5. Query channel role access (for private channels)
	channelRoleAccess := make(map[uuid.UUID]bool)
	if isPrivate {
		craRows, err := db.Pool.Query(ctx, "SELECT role_id FROM channel_role_access WHERE channel_id = $1", channelID)
		if err == nil {
			for craRows.Next() {
				var rid uuid.UUID
				if err := craRows.Scan(&rid); err == nil {
					channelRoleAccess[rid] = true
				}
			}
			craRows.Close()
		}
	}

	// 6. Query channel permission overwrites
	type overwriteInfo struct {
		Allow int64
		Deny  int64
	}
	channelOverwrites := make(map[uuid.UUID]overwriteInfo)
	owRows, err := db.Pool.Query(ctx, "SELECT role_id, allow, deny FROM channel_permission_overwrites WHERE channel_id = $1", channelID)
	if err == nil {
		for owRows.Next() {
			var rid uuid.UUID
			var allow, deny int64
			if err := owRows.Scan(&rid, &allow, &deny); err == nil {
				channelOverwrites[rid] = overwriteInfo{Allow: allow, Deny: deny}
			}
		}
		owRows.Close()
	}

	// 7. Evaluate PermViewChannel (1 << 14) for each candidate
	authorizedMembers := make([]uuid.UUID, 0, len(candidates))
	for _, uid := range candidates {
		// Owner bypasses all restrictions
		if uid == ownerID {
			authorizedMembers = append(authorizedMembers, uid)
			continue
		}

		userRoles := memberRoleMap[uid]
		var combinedPerms int64 = everyonePerms
		hasAdmin := false

		for _, rid := range userRoles {
			if r, ok := guildRoles[rid]; ok {
				combinedPerms |= r.Permissions
				if (r.Permissions & models.PermAdministrator) != 0 {
					hasAdmin = true
				}
			}
		}

		// Administrator bypasses all overwrites
		if hasAdmin || (combinedPerms&models.PermAdministrator) != 0 {
			authorizedMembers = append(authorizedMembers, uid)
			continue
		}

		// Base view permission
		canView := false
		if isPrivate {
			// Private channel: requires explicit role in channel_role_access
			for _, rid := range userRoles {
				if channelRoleAccess[rid] {
					canView = true
					break
				}
			}
		} else {
			// Public channel: check base PermViewChannel
			canView = (combinedPerms & models.PermViewChannel) != 0
		}

		// Overwrite evaluation:
		// 1. @everyone overwrite
		if ow, ok := channelOverwrites[everyoneRoleID]; ok {
			if (ow.Deny & models.PermViewChannel) != 0 {
				canView = false
			}
			if (ow.Allow & models.PermViewChannel) != 0 {
				canView = true
			}
		}

		// 2. Member specific role overwrites
		roleAllow := false
		roleDeny := false
		for _, rid := range userRoles {
			if rid == everyoneRoleID {
				continue
			}
			if ow, ok := channelOverwrites[rid]; ok {
				if (ow.Deny & models.PermViewChannel) != 0 {
					roleDeny = true
				}
				if (ow.Allow & models.PermViewChannel) != 0 {
					roleAllow = true
				}
			}
		}

		if roleDeny {
			canView = false
		}
		if roleAllow {
			canView = true
		}

		if canView {
			authorizedMembers = append(authorizedMembers, uid)
		}
	}

	// 8. Query active non-revoked E2EE devices for authorized members
	devices := make([]models.E2EERosterDeviceSnapshot, 0)
	if len(authorizedMembers) > 0 {
		queryDevices := `
			SELECT user_id, id, curve25519_key, ed25519_key
			FROM e2ee_devices
			WHERE user_id = ANY($1) AND revoked_at IS NULL
			ORDER BY user_id ASC, id ASC
		`
		devRows, err := db.Pool.Query(ctx, queryDevices, authorizedMembers)
		if err == nil {
			for devRows.Next() {
				var dev models.E2EERosterDeviceSnapshot
				if err := devRows.Scan(&dev.UserID, &dev.DeviceID, &dev.Curve25519Key, &dev.Ed25519Key); err == nil {
					devices = append(devices, dev)
				}
			}
			devRows.Close()
		}
	}

	// 9. Compute deterministic canonical audience hash
	newHash := ComputeAudienceHash(authorizedMembers, devices)

	// 10. Check stepped audience limit
	var limitExceededErr error
	if len(authorizedMembers) > audienceLimit {
		limitExceededErr = &AudienceLimitExceededError{
			CurrentMembers: len(authorizedMembers),
			Limit:          audienceLimit,
		}
	}

	// 11. Hash comparison and state transition
	currentHash := ""
	if existingAudienceHash.Valid {
		currentHash = existingAudienceHash.String
	}

	newEpoch := rotationEpoch
	if currentHash == "" || newHash != currentHash {
		// Audience changed
		if currentHash != "" {
			newEpoch++
		}
		if newEpoch < 1 {
			newEpoch = 1
		}

		// Update database
		_, _ = db.Pool.Exec(ctx, `
			UPDATE channels
			SET rotation_epoch = $1, audience_hash = $2
			WHERE id = $3
		`, newEpoch, newHash, channelID)

		// Broadcast E2EE_ROTATION_REQUIRED if channel has E2EE enabled
		if e2eeEnabled && hub != nil && len(authorizedMembers) > 0 {
			hub.BroadcastToUsers(authorizedMembers, models.WSEvent{
				Type: models.EventE2EERotationRequired,
				Data: map[string]any{
					"channel_id":        channelID,
					"conversation_id":   channelID,
					"conversation_type": "channel",
					"epoch":             newEpoch,
					"new_epoch":         newEpoch,
					"audience_hash":     newHash,
				},
			})
		}
	}

	resp := &models.ChannelAudienceResponse{
		ChannelID:     channelID,
		AudienceHash:  newHash,
		RotationEpoch: newEpoch,
		Epoch:         newEpoch,
		AudienceLimit: audienceLimit,
		MemberCount:   len(authorizedMembers),
		Members:       authorizedMembers,
		Devices:       devices,
	}

	if limitExceededErr != nil {
		return resp, limitExceededErr
	}

	return resp, nil
}

// GetChannelAudience handles GET /api/channels/{id}/e2ee/audience.
func (h *E2EEHandler) GetChannelAudience(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	channelIDStr := chi.URLParam(r, "id")
	channelID, err := uuid.Parse(channelIDStr)
	if err != nil {
		http.Error(w, `{"error":"invalid channel id"}`, http.StatusBadRequest)
		return
	}

	resp, err := h.RecomputeAudience(r.Context(), channelID)

	var limitErr *AudienceLimitExceededError
	if errors.As(err, &limitErr) {
		// Verify caller is authorized
		callerAuthorized := false
		if resp != nil {
			for _, m := range resp.Members {
				if m == userID {
					callerAuthorized = true
					break
				}
			}
		}
		if !callerAuthorized {
			http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusForbidden)
		json.NewEncoder(w).Encode(map[string]any{
			"error":           "audience_limit_exceeded",
			"current_members": limitErr.CurrentMembers,
			"limit":           limitErr.Limit,
		})
		return
	}

	if err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusInternalServerError)
		return
	}

	// Verify that the caller is in the authorized members list
	callerAuthorized := false
	for _, m := range resp.Members {
		if m == userID {
			callerAuthorized = true
			break
		}
	}
	if !callerAuthorized {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(resp)
}

// EnableChannelE2EE handles POST /api/channels/{id}/e2ee/enable.
func (h *E2EEHandler) EnableChannelE2EE(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	channelIDStr := chi.URLParam(r, "id")
	channelID, err := uuid.Parse(channelIDStr)
	if err != nil {
		http.Error(w, `{"error":"invalid channel id"}`, http.StatusBadRequest)
		return
	}

	// Verify caller has PermManageChannels or is owner/admin
	var guildID uuid.UUID
	var ownerID uuid.UUID
	var audienceLimit int
	err = h.db.Pool.QueryRow(r.Context(), `
		SELECT c.guild_id, g.owner_id, COALESCE(c.audience_limit, 15)
		FROM channels c
		INNER JOIN guilds g ON g.id = c.guild_id
		WHERE c.id = $1
	`, channelID).Scan(&guildID, &ownerID, &audienceLimit)
	if err != nil {
		http.Error(w, `{"error":"channel not found"}`, http.StatusNotFound)
		return
	}

	if userID != ownerID {
		var perms int64
		_ = h.db.Pool.QueryRow(r.Context(), `
			SELECT COALESCE(BIT_OR(gr.permissions), 0)
			FROM guild_members gm
			JOIN guild_member_roles gmr ON gmr.guild_id = gm.guild_id AND gmr.user_id = gm.user_id
			JOIN guild_roles gr ON gr.id = gmr.role_id
			WHERE gm.guild_id = $1 AND gm.user_id = $2
		`, guildID, userID).Scan(&perms)

		if (perms&models.PermAdministrator) == 0 && (perms&models.PermManageChannels) == 0 {
			http.Error(w, `{"error":"forbidden: manage_channels permission required"}`, http.StatusForbidden)
			return
		}
	}

	// Compute audience to check limit
	resp, err := h.RecomputeAudience(r.Context(), channelID)
	var limitErr *AudienceLimitExceededError
	if errors.As(err, &limitErr) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusForbidden)
		json.NewEncoder(w).Encode(map[string]any{
			"error":           "audience_limit_exceeded",
			"current_members": limitErr.CurrentMembers,
			"limit":           limitErr.Limit,
		})
		return
	}
	if err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusInternalServerError)
		return
	}

	// Enable E2EE on channel
	_, err = h.db.Pool.Exec(r.Context(), `
		UPDATE channels
		SET e2ee_enabled = TRUE, rotation_epoch = 1, audience_hash = $1
		WHERE id = $2
	`, resp.AudienceHash, channelID)
	if err != nil {
		http.Error(w, `{"error":"failed to enable e2ee on channel"}`, http.StatusInternalServerError)
		return
	}

	// Broadcast channel update
	if h.hub != nil {
		h.hub.BroadcastToUsers(resp.Members, models.WSEvent{
			Type: models.EventE2EERotationRequired,
			Data: map[string]any{
				"channel_id":        channelID,
				"conversation_id":   channelID,
				"conversation_type": "channel",
				"epoch":             1,
				"new_epoch":         1,
				"audience_hash":     resp.AudienceHash,
			},
		})
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]any{
		"status":         "enabled",
		"channel_id":     channelID,
		"e2ee_enabled":   true,
		"rotation_epoch": 1,
		"audience_hash":  resp.AudienceHash,
	})
}
