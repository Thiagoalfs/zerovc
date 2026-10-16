package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/zerovc/zerovc/backend/internal/auth"
	"github.com/zerovc/zerovc/backend/internal/database"
	"github.com/zerovc/zerovc/backend/internal/gateway"
	"github.com/zerovc/zerovc/backend/internal/models"
	"github.com/zerovc/zerovc/backend/internal/voice"
)

type DMGroupHandler struct {
	db      *database.DB
	hub     *gateway.Hub
	livekit *voice.LiveKitService
}

func NewDMGroupHandler(db *database.DB, hub *gateway.Hub, livekit *voice.LiveKitService) *DMGroupHandler {
	return &DMGroupHandler{
		db:      db,
		hub:     hub,
		livekit: livekit,
	}
}

type CreateDMGroupRequest struct {
	Name      *string     `json:"name,omitempty"`
	MemberIDs []uuid.UUID `json:"member_ids"`
}

func (h *DMGroupHandler) CreateGroup(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var req CreateDMGroupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	// Unique members list including creator
	memberMap := make(map[uuid.UUID]bool)
	memberMap[userID] = true
	for _, mID := range req.MemberIDs {
		if mID != uuid.Nil {
			memberMap[mID] = true
		}
	}

	totalMembers := make([]uuid.UUID, 0, len(memberMap))
	for mID := range memberMap {
		totalMembers = append(totalMembers, mID)
	}

	// Enforce 15 members maximum limit
	if len(totalMembers) > 15 {
		http.Error(w, `{"error":"grupos de DM podem ter no máximo 15 membros"}`, http.StatusBadRequest)
		return
	}

	if len(totalMembers) < 2 {
		http.Error(w, `{"error":"selecione pelo menos 1 amigo para criar o grupo"}`, http.StatusBadRequest)
		return
	}

	// Check blocks between creator and any added member
	for _, mID := range totalMembers {
		if mID == userID {
			continue
		}
		var isBlocked bool
		h.db.Pool.QueryRow(r.Context(), `
			SELECT EXISTS(SELECT 1 FROM user_blocks WHERE (user_id = $1 AND blocked_user_id = $2) OR (user_id = $2 AND blocked_user_id = $1))
		`, userID, mID).Scan(&isBlocked)
		if isBlocked {
			http.Error(w, `{"error":"não é possível adicionar usuários com bloqueio ativo"}`, http.StatusForbidden)
			return
		}
	}

	// Begin Atomic Transaction
	tx, err := h.db.Pool.Begin(r.Context())
	if err != nil {
		http.Error(w, `{"error":"failed to start transaction"}`, http.StatusInternalServerError)
		return
	}
	defer tx.Rollback(r.Context())

	// Create Group
	var group models.DMGroup
	err = tx.QueryRow(r.Context(), `
		INSERT INTO dm_groups (name, owner_id)
		VALUES ($1, $2)
		RETURNING id, name, icon_url, owner_id, created_at
	`, req.Name, userID).Scan(&group.ID, &group.Name, &group.IconURL, &group.OwnerID, &group.CreatedAt)
	if err != nil {
		http.Error(w, `{"error":"failed to create dm group"}`, http.StatusInternalServerError)
		return
	}

	// Insert Members
	for _, mID := range totalMembers {
		if _, err := tx.Exec(r.Context(), `
			INSERT INTO dm_group_members (group_id, user_id)
			VALUES ($1, $2)
			ON CONFLICT DO NOTHING
		`, group.ID, mID); err != nil {
			http.Error(w, `{"error":"failed to add group members"}`, http.StatusInternalServerError)
			return
		}
	}

	if err := tx.Commit(r.Context()); err != nil {
		http.Error(w, `{"error":"failed to commit group creation"}`, http.StatusInternalServerError)
		return
	}

	// Fetch full member objects
	group.Members = h.getGroupMembers(r.Context(), group.ID)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(group)
}

func (h *DMGroupHandler) ListGroups(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	query := `
		SELECT g.id, g.name, g.icon_url, g.owner_id, COALESCE(g.e2ee_enabled, false), COALESCE(g.rotation_epoch, 1), g.created_at,
		       lm.id, lm.content, COALESCE(lm.encrypted, false), lm.e2ee_ciphertext, lm.e2ee_meta, lm.created_at
		FROM dm_groups g
		INNER JOIN dm_group_members gm ON gm.group_id = g.id
		LEFT JOIN LATERAL (
			SELECT id, content, encrypted, e2ee_ciphertext, e2ee_meta, created_at
			FROM dm_group_messages
			WHERE group_id = g.id
			ORDER BY created_at DESC
			LIMIT 1
		) lm ON true
		WHERE gm.user_id = $1
		ORDER BY COALESCE(lm.created_at, g.created_at) DESC
	`
	rows, err := h.db.Pool.Query(r.Context(), query, userID)
	if err != nil {
		http.Error(w, `{"error":"failed to query dm groups"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	groups := make([]models.DMGroup, 0)
	for rows.Next() {
		var g models.DMGroup
		var lastMsgID *uuid.UUID
		var lastMsgContent *string
		var lastMsgEncrypted bool
		var lastMsgCiphertext *string
		var lastMsgMeta json.RawMessage
		var lastMsgCreatedAt *time.Time
		if err := rows.Scan(
			&g.ID, &g.Name, &g.IconURL, &g.OwnerID, &g.E2EEEnabled, &g.RotationEpoch, &g.CreatedAt,
			&lastMsgID, &lastMsgContent, &lastMsgEncrypted, &lastMsgCiphertext, &lastMsgMeta, &lastMsgCreatedAt,
		); err == nil {
			g.Members = h.getGroupMembers(r.Context(), g.ID)
			if lastMsgID != nil && lastMsgCreatedAt != nil {
				g.LastMessage = &models.DMGroupMessage{
					ID:             *lastMsgID,
					Content:        *lastMsgContent,
					Encrypted:      lastMsgEncrypted,
					E2EECiphertext: lastMsgCiphertext,
					E2EEMeta:       lastMsgMeta,
					CreatedAt:      *lastMsgCreatedAt,
				}
			}
			groups = append(groups, g)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(groups)
}

func (h *DMGroupHandler) GetGroup(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	groupIDStr := chi.URLParam(r, "id")
	groupID, err := uuid.Parse(groupIDStr)
	if err != nil {
		http.Error(w, `{"error":"invalid group id"}`, http.StatusBadRequest)
		return
	}

	// Verify membership
	var isMember bool
	h.db.Pool.QueryRow(r.Context(), "SELECT EXISTS(SELECT 1 FROM dm_group_members WHERE group_id = $1 AND user_id = $2)", groupID, userID).Scan(&isMember)
	if !isMember {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}

	var g models.DMGroup
	err = h.db.Pool.QueryRow(r.Context(), `
		SELECT id, name, icon_url, owner_id, COALESCE(e2ee_enabled, false), COALESCE(rotation_epoch, 1), created_at
		FROM dm_groups
		WHERE id = $1
	`, groupID).Scan(&g.ID, &g.Name, &g.IconURL, &g.OwnerID, &g.E2EEEnabled, &g.RotationEpoch, &g.CreatedAt)
	if err != nil {
		http.Error(w, `{"error":"group not found"}`, http.StatusNotFound)
		return
	}

	g.Members = h.getGroupMembers(r.Context(), g.ID)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(g)
}

func (h *DMGroupHandler) UpdateGroup(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	groupIDStr := chi.URLParam(r, "id")
	groupID, err := uuid.Parse(groupIDStr)
	if err != nil {
		http.Error(w, `{"error":"invalid group id"}`, http.StatusBadRequest)
		return
	}

	// Verify membership
	var isMember bool
	h.db.Pool.QueryRow(r.Context(), "SELECT EXISTS(SELECT 1 FROM dm_group_members WHERE group_id = $1 AND user_id = $2)", groupID, userID).Scan(&isMember)
	if !isMember {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}

	var req struct {
		Name    *string `json:"name,omitempty"`
		IconURL *string `json:"icon_url,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request"}`, http.StatusBadRequest)
		return
	}

	_, err = h.db.Pool.Exec(r.Context(), `
		UPDATE dm_groups
		SET name = COALESCE($1, name), icon_url = COALESCE($2, icon_url)
		WHERE id = $3
	`, req.Name, req.IconURL, groupID)
	if err != nil {
		http.Error(w, `{"error":"failed to update group"}`, http.StatusInternalServerError)
		return
	}

	var g models.DMGroup
	h.db.Pool.QueryRow(r.Context(), `
		SELECT id, name, icon_url, owner_id, created_at
		FROM dm_groups WHERE id = $1
	`, groupID).Scan(&g.ID, &g.Name, &g.IconURL, &g.OwnerID, &g.CreatedAt)
	g.Members = h.getGroupMembers(r.Context(), g.ID)

	for _, m := range g.Members {
		h.hub.SendToUser(m.ID, models.WSEvent{
			Type: "GROUP_UPDATE",
			Data: g,
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(g)
}

func (h *DMGroupHandler) AddMembers(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	groupIDStr := chi.URLParam(r, "id")
	groupID, err := uuid.Parse(groupIDStr)
	if err != nil {
		http.Error(w, `{"error":"invalid group id"}`, http.StatusBadRequest)
		return
	}

	var isMember bool
	h.db.Pool.QueryRow(r.Context(), "SELECT EXISTS(SELECT 1 FROM dm_group_members WHERE group_id = $1 AND user_id = $2)", groupID, userID).Scan(&isMember)
	if !isMember {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}

	var req struct {
		MemberIDs []uuid.UUID `json:"member_ids"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || len(req.MemberIDs) == 0 {
		http.Error(w, `{"error":"member_ids required"}`, http.StatusBadRequest)
		return
	}

	// Check current count
	var currentCount int
	h.db.Pool.QueryRow(r.Context(), "SELECT COUNT(*) FROM dm_group_members WHERE group_id = $1", groupID).Scan(&currentCount)

	if currentCount+len(req.MemberIDs) > 15 {
		http.Error(w, `{"error":"o grupo não pode ultrapassar 15 membros"}`, http.StatusBadRequest)
		return
	}

	// Check blocks between added users and existing members
	for _, mID := range req.MemberIDs {
		if mID == uuid.Nil {
			continue
		}
		var isBlocked bool
		h.db.Pool.QueryRow(r.Context(), `
			SELECT EXISTS(
				SELECT 1 FROM user_blocks ub
				INNER JOIN dm_group_members dgm ON dgm.group_id = $1
				WHERE (ub.user_id = $2 AND ub.blocked_user_id = dgm.user_id)
				   OR (ub.user_id = dgm.user_id AND ub.blocked_user_id = $2)
			)
		`, groupID, mID).Scan(&isBlocked)
		if isBlocked {
			http.Error(w, `{"error":"não é possível adicionar usuários com bloqueio ativo no grupo"}`, http.StatusForbidden)
			return
		}
	}

	for _, mID := range req.MemberIDs {
		if mID != uuid.Nil {
			h.db.Pool.Exec(r.Context(), "INSERT INTO dm_group_members (group_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", groupID, mID)
		}
	}

	var g models.DMGroup
	h.db.Pool.QueryRow(r.Context(), `
		SELECT id, name, icon_url, owner_id, COALESCE(e2ee_enabled, false), COALESCE(rotation_epoch, 1), created_at
		FROM dm_groups WHERE id = $1
	`, groupID).Scan(&g.ID, &g.Name, &g.IconURL, &g.OwnerID, &g.E2EEEnabled, &g.RotationEpoch, &g.CreatedAt)
	g.Members = h.getGroupMembers(r.Context(), groupID)

	if g.E2EEEnabled {
		g.RotationEpoch++
		h.db.Pool.Exec(r.Context(), "UPDATE dm_groups SET rotation_epoch = $1 WHERE id = $2", g.RotationEpoch, groupID)
		rotationEvent := models.WSEvent{
			Type: models.EventE2EERotationRequired,
			Data: map[string]any{
				"conversation_type": "dm_group",
				"conversation_id":   groupID,
				"rotation_epoch":    g.RotationEpoch,
			},
		}
		for _, m := range g.Members {
			h.hub.SendToUser(m.ID, rotationEvent)
		}
	}

	for _, m := range g.Members {
		h.hub.SendToUser(m.ID, models.WSEvent{
			Type: "GROUP_UPDATE",
			Data: g,
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(g.Members)
}

type TransferGroupOwnershipRequest struct {
	NewOwnerID uuid.UUID `json:"new_owner_id"`
}

func (h *DMGroupHandler) TransferOwnership(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	groupIDStr := chi.URLParam(r, "id")
	groupID, err := uuid.Parse(groupIDStr)
	if err != nil {
		http.Error(w, `{"error":"invalid group id"}`, http.StatusBadRequest)
		return
	}

	var req TransferGroupOwnershipRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.NewOwnerID == uuid.Nil {
		http.Error(w, `{"error":"new_owner_id required"}`, http.StatusBadRequest)
		return
	}

	// Verify requester is current group owner
	var currentOwnerID uuid.UUID
	err = h.db.Pool.QueryRow(r.Context(), "SELECT owner_id FROM dm_groups WHERE id = $1", groupID).Scan(&currentOwnerID)
	if err != nil {
		http.Error(w, `{"error":"group not found"}`, http.StatusNotFound)
		return
	}

	if currentOwnerID != userID {
		http.Error(w, `{"error":"apenas o dono atual pode transferir a posse do grupo"}`, http.StatusForbidden)
		return
	}

	// Verify new owner is a member of the group
	var isMember bool
	h.db.Pool.QueryRow(r.Context(), "SELECT EXISTS(SELECT 1 FROM dm_group_members WHERE group_id = $1 AND user_id = $2)", groupID, req.NewOwnerID).Scan(&isMember)
	if !isMember {
		http.Error(w, `{"error":"o novo dono precisa ser membro do grupo"}`, http.StatusBadRequest)
		return
	}

	// Update owner_id
	_, err = h.db.Pool.Exec(r.Context(), "UPDATE dm_groups SET owner_id = $1 WHERE id = $2", req.NewOwnerID, groupID)
	if err != nil {
		http.Error(w, `{"error":"failed to transfer group ownership"}`, http.StatusInternalServerError)
		return
	}

	var g models.DMGroup
	h.db.Pool.QueryRow(r.Context(), `
		SELECT id, name, icon_url, owner_id, created_at
		FROM dm_groups WHERE id = $1
	`, groupID).Scan(&g.ID, &g.Name, &g.IconURL, &g.OwnerID, &g.CreatedAt)
	g.Members = h.getGroupMembers(r.Context(), g.ID)

	// Broadcast updated group to all members
	for _, m := range g.Members {
		h.hub.SendToUser(m.ID, models.WSEvent{
			Type: "GROUP_UPDATE",
			Data: g,
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(g)
}

func (h *DMGroupHandler) RemoveMember(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	groupIDStr := chi.URLParam(r, "id")
	targetUserIDStr := chi.URLParam(r, "userID")
	groupID, _ := uuid.Parse(groupIDStr)
	targetUserID, _ := uuid.Parse(targetUserIDStr)

	// Can leave self or if owner can remove other
	var ownerID uuid.UUID
	err := h.db.Pool.QueryRow(r.Context(), "SELECT owner_id FROM dm_groups WHERE id = $1", groupID).Scan(&ownerID)
	if err != nil {
		http.Error(w, `{"error":"group not found"}`, http.StatusNotFound)
		return
	}

	if userID != targetUserID && userID != ownerID {
		http.Error(w, `{"error":"apenas o dono pode remover outros membros"}`, http.StatusForbidden)
		return
	}

	// Begin Atomic Transaction
	tx, err := h.db.Pool.Begin(r.Context())
	if err != nil {
		http.Error(w, `{"error":"failed to start transaction"}`, http.StatusInternalServerError)
		return
	}
	defer tx.Rollback(r.Context())

	// Remove member
	if _, err := tx.Exec(r.Context(), "DELETE FROM dm_group_members WHERE group_id = $1 AND user_id = $2", groupID, targetUserID); err != nil {
		http.Error(w, `{"error":"failed to remove member"}`, http.StatusInternalServerError)
		return
	}

	// Count remaining members
	var remainingCount int
	if err := tx.QueryRow(r.Context(), "SELECT COUNT(*) FROM dm_group_members WHERE group_id = $1", groupID).Scan(&remainingCount); err != nil {
		http.Error(w, `{"error":"failed to check remaining members"}`, http.StatusInternalServerError)
		return
	}

	var groupDeleted bool
	var newOwnerID uuid.UUID
	if remainingCount == 0 {
		// Delete group
		groupDeleted = true
		if _, err := tx.Exec(r.Context(), "DELETE FROM dm_groups WHERE id = $1", groupID); err != nil {
			http.Error(w, `{"error":"failed to delete group"}`, http.StatusInternalServerError)
			return
		}
	} else if targetUserID == ownerID {
		// Automatic random owner transfer
		if err := tx.QueryRow(r.Context(), "SELECT user_id FROM dm_group_members WHERE group_id = $1 ORDER BY RANDOM() LIMIT 1", groupID).Scan(&newOwnerID); err == nil && newOwnerID != uuid.Nil {
			if _, err := tx.Exec(r.Context(), "UPDATE dm_groups SET owner_id = $1 WHERE id = $2", newOwnerID, groupID); err != nil {
				http.Error(w, `{"error":"failed to transfer group ownership"}`, http.StatusInternalServerError)
				return
			}
		}
	}

	if err := tx.Commit(r.Context()); err != nil {
		http.Error(w, `{"error":"failed to commit member removal"}`, http.StatusInternalServerError)
		return
	}

	// Send GROUP_LEAVE event to target user who left / was removed
	h.hub.SendToUser(targetUserID, models.WSEvent{
		Type: "GROUP_LEAVE",
		Data: map[string]any{"group_id": groupID},
	})

	// If group still exists, broadcast updated group to all remaining members
	if !groupDeleted {
		var g models.DMGroup
		if err := h.db.Pool.QueryRow(r.Context(), "SELECT id, name, icon_url, owner_id, COALESCE(e2ee_enabled, false), COALESCE(rotation_epoch, 1), created_at FROM dm_groups WHERE id = $1", groupID).Scan(&g.ID, &g.Name, &g.IconURL, &g.OwnerID, &g.E2EEEnabled, &g.RotationEpoch, &g.CreatedAt); err == nil {
			g.Members = h.getGroupMembers(r.Context(), g.ID)
			if g.E2EEEnabled {
				g.RotationEpoch++
				h.db.Pool.Exec(r.Context(), "UPDATE dm_groups SET rotation_epoch = $1 WHERE id = $2", g.RotationEpoch, groupID)
				rotationEvent := models.WSEvent{
					Type: models.EventE2EERotationRequired,
					Data: map[string]any{
						"conversation_type": "dm_group",
						"conversation_id":   groupID,
						"rotation_epoch":    g.RotationEpoch,
					},
				}
				for _, m := range g.Members {
					h.hub.SendToUser(m.ID, rotationEvent)
				}
			}
			for _, m := range g.Members {
				h.hub.SendToUser(m.ID, models.WSEvent{
					Type: "GROUP_UPDATE",
					Data: g,
				})
			}
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"success": true})
}

func (h *DMGroupHandler) ListMessages(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	groupIDStr := chi.URLParam(r, "id")
	groupID, err := uuid.Parse(groupIDStr)
	if err != nil {
		http.Error(w, `{"error":"invalid group id"}`, http.StatusBadRequest)
		return
	}

	var isMember bool
	h.db.Pool.QueryRow(r.Context(), "SELECT EXISTS(SELECT 1 FROM dm_group_members WHERE group_id = $1 AND user_id = $2)", groupID, userID).Scan(&isMember)
	if !isMember {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}

	limit := 50
	if l := r.URL.Query().Get("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 && parsed <= 50 {
			limit = parsed
		}
	}

	var beforeTime *time.Time
	if b := r.URL.Query().Get("before"); b != "" {
		if t, err := time.Parse(time.RFC3339Nano, b); err == nil {
			beforeTime = &t
		} else if t, err := time.Parse(time.RFC3339, b); err == nil {
			beforeTime = &t
		} else if beforeUUID, err := uuid.Parse(b); err == nil {
			var t time.Time
			if h.db.Pool.QueryRow(r.Context(), "SELECT created_at FROM dm_group_messages WHERE id = $1", beforeUUID).Scan(&t) == nil {
				beforeTime = &t
			}
		}
	}

	query := `
		SELECT m.id, m.group_id, m.author_id, m.content, m.attachments, m.embeds, m.invoker_id, m.reply_to_id, m.is_pinned, m.is_edited, m.is_tts, m.edited_at, COALESCE(m.encrypted, false), m.e2ee_ciphertext, m.e2ee_meta, m.created_at,
		       u.username, u.display_name, u.avatar_url, u.banner_url, u.bio, u.status, u.custom_status,
		       iu.id, iu.username, iu.display_name, iu.avatar_url
		FROM dm_group_messages m
		INNER JOIN users u ON u.id = m.author_id
		LEFT JOIN users iu ON iu.id = m.invoker_id
		WHERE m.group_id = $1 AND ($3::timestamptz IS NULL OR m.created_at < $3)
		ORDER BY m.created_at DESC
		LIMIT $2
	`
	rows, err := h.db.Pool.Query(r.Context(), query, groupID, limit, beforeTime)
	if err != nil {
		http.Error(w, `{"error":"failed to query messages"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	messages := make([]models.DMGroupMessage, 0)
	for rows.Next() {
		var msg models.DMGroupMessage
		var attachBytes []byte
		var embedsBytes []byte
		var invID *uuid.UUID
		var invUsername, invDisplayName, invAvatar *string

		if err := rows.Scan(
			&msg.ID, &msg.GroupID, &msg.AuthorID, &msg.Content, &attachBytes, &embedsBytes, &msg.InvokerID, &msg.ReplyToID, &msg.IsPinned, &msg.IsEdited, &msg.IsTTS, &msg.EditedAt, &msg.Encrypted, &msg.E2EECiphertext, &msg.E2EEMeta, &msg.CreatedAt,
			&msg.Author.Username, &msg.Author.DisplayName, &msg.Author.AvatarURL, &msg.Author.BannerURL, &msg.Author.Bio, &msg.Author.Status, &msg.Author.CustomStatus,
			&invID, &invUsername, &invDisplayName, &invAvatar,
		); err == nil {
			msg.Author.ID = msg.AuthorID
			if len(attachBytes) > 0 {
				json.Unmarshal(attachBytes, &msg.Attachments)
			}
			if msg.Attachments == nil {
				msg.Attachments = make([]models.Attachment, 0)
			}
			if len(embedsBytes) > 0 {
				json.Unmarshal(embedsBytes, &msg.Embeds)
			}
			if msg.Embeds == nil {
				msg.Embeds = make([]models.MessageEmbed, 0)
			}
			if invID != nil {
				var dName, aUrl, uName string
				if invDisplayName != nil {
					dName = *invDisplayName
				}
				if invAvatar != nil {
					aUrl = *invAvatar
				}
				if invUsername != nil {
					uName = *invUsername
				}
				msg.Invoker = &models.UserPublic{
					ID:          *invID,
					Username:    uName,
					DisplayName: dName,
					AvatarURL:   aUrl,
				}
			}
			messages = append(messages, msg)
		}
	}

	// Reverse to chronological order
	for i, j := 0, len(messages)-1; i < j; i, j = i+1, j-1 {
		messages[i], messages[j] = messages[j], messages[i]
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(messages)
}

func (h *DMGroupHandler) SendMessage(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	groupIDStr := chi.URLParam(r, "id")
	groupID, err := uuid.Parse(groupIDStr)
	if err != nil {
		http.Error(w, `{"error":"invalid group id"}`, http.StatusBadRequest)
		return
	}

	var isMember bool
	h.db.Pool.QueryRow(r.Context(), "SELECT EXISTS(SELECT 1 FROM dm_group_members WHERE group_id = $1 AND user_id = $2)", groupID, userID).Scan(&isMember)
	if !isMember {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}

	var e2eeEnabled bool
	var rotationEpoch int
	err = h.db.Pool.QueryRow(r.Context(), "SELECT COALESCE(e2ee_enabled, false), COALESCE(rotation_epoch, 1) FROM dm_groups WHERE id = $1", groupID).Scan(&e2eeEnabled, &rotationEpoch)
	if err != nil {
		http.Error(w, `{"error":"group not found"}`, http.StatusNotFound)
		return
	}

	var req struct {
		ID             *uuid.UUID          `json:"id,omitempty"`
		Content        string              `json:"content"`
		Attachments    []models.Attachment `json:"attachments"`
		ReplyToID      *uuid.UUID          `json:"reply_to_id,omitempty"`
		IsTTS          bool                `json:"is_tts,omitempty"`
		Encrypted      *bool               `json:"encrypted,omitempty"`
		E2EECiphertext *string             `json:"e2ee_ciphertext,omitempty"`
		E2EEMeta       json.RawMessage     `json:"e2ee_meta,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	isEncrypted := req.Encrypted != nil && *req.Encrypted

	// Plaintext Gating State Machine:
	if e2eeEnabled {
		if !isEncrypted || req.E2EECiphertext == nil || *req.E2EECiphertext == "" {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusConflict)
			w.Write([]byte(`{"error":"e2ee_required"}`))
			return
		}
	} else {
		if isEncrypted || (req.E2EECiphertext != nil && *req.E2EECiphertext != "") {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusConflict)
			w.Write([]byte(`{"error":"e2ee_not_enabled"}`))
			return
		}
	}

	if !isEncrypted {
		if req.Content == "" && len(req.Attachments) == 0 {
			http.Error(w, `{"error":"content required"}`, http.StatusBadRequest)
			return
		}
		if len(req.Content) > 2000 {
			http.Error(w, `{"error":"O limite de tamanho de mensagem é 2.000 caracteres"}`, http.StatusBadRequest)
			return
		}
	} else {
		if req.E2EECiphertext == nil || *req.E2EECiphertext == "" {
			http.Error(w, `{"error":"ciphertext and metadata required for encrypted message"}`, http.StatusBadRequest)
			return
		}
	}

	// Fetch author details
	var author models.UserPublic
	h.db.Pool.QueryRow(r.Context(), "SELECT id, username, display_name, avatar_url, banner_url, bio, status, custom_status FROM users WHERE id = $1", userID).Scan(
		&author.ID, &author.Username, &author.DisplayName, &author.AvatarURL, &author.BannerURL, &author.Bio, &author.Status, &author.CustomStatus,
	)

	// Idempotency Contract Check
	if req.ID != nil && *req.ID != uuid.Nil {
		var existing models.DMGroupMessage
		var existAttach, existEmbeds []byte
		checkQuery := `
			SELECT id, group_id, author_id, content, attachments, embeds, reply_to_id, is_pinned, is_edited, is_tts, edited_at, COALESCE(encrypted, false), e2ee_ciphertext, e2ee_meta, created_at
			FROM dm_group_messages
			WHERE group_id = $1 AND id = $2
		`
		rowErr := h.db.Pool.QueryRow(r.Context(), checkQuery, groupID, *req.ID).Scan(
			&existing.ID, &existing.GroupID, &existing.AuthorID, &existing.Content, &existAttach, &existEmbeds, &existing.ReplyToID, &existing.IsPinned, &existing.IsEdited, &existing.IsTTS, &existing.EditedAt, &existing.Encrypted, &existing.E2EECiphertext, &existing.E2EEMeta, &existing.CreatedAt,
		)
		if rowErr == nil {
			if existing.AuthorID != userID {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusConflict)
				w.Write([]byte(`{"error":"idempotency_conflict"}`))
				return
			}

			payloadMatches := false
			if isEncrypted {
				if existing.Encrypted && existing.E2EECiphertext != nil && req.E2EECiphertext != nil && *existing.E2EECiphertext == *req.E2EECiphertext {
					payloadMatches = true
				}
			} else {
				if !existing.Encrypted && existing.Content == req.Content {
					payloadMatches = true
				}
			}

			if !payloadMatches {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusConflict)
				w.Write([]byte(`{"error":"idempotency_conflict"}`))
				return
			}

			existing.Author = author
			if len(existAttach) > 0 {
				_ = json.Unmarshal(existAttach, &existing.Attachments)
			}
			if existing.Attachments == nil {
				existing.Attachments = make([]models.Attachment, 0)
			}
			existing.Reactions = make([]models.MessageReaction, 0)

			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
			json.NewEncoder(w).Encode(existing)
			return
		}
	}

	// Zero plaintext storage
	contentToStore := req.Content
	if isEncrypted {
		contentToStore = ""
	}

	attachBytes, _ := json.Marshal(req.Attachments)
	messageID := uuid.New()
	if req.ID != nil && *req.ID != uuid.Nil {
		messageID = *req.ID
	}

	var msg models.DMGroupMessage
	insertQuery := `
		INSERT INTO dm_group_messages (id, group_id, author_id, content, attachments, reply_to_id, is_tts, encrypted, e2ee_ciphertext, e2ee_meta)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		RETURNING id, group_id, author_id, content, attachments, reply_to_id, is_pinned, is_edited, is_tts, edited_at, COALESCE(encrypted, false), e2ee_ciphertext, e2ee_meta, created_at
	`
	var rawAttach []byte
	err = h.db.Pool.QueryRow(r.Context(), insertQuery, messageID, groupID, userID, contentToStore, attachBytes, req.ReplyToID, req.IsTTS, isEncrypted, req.E2EECiphertext, req.E2EEMeta).Scan(
		&msg.ID, &msg.GroupID, &msg.AuthorID, &msg.Content, &rawAttach, &msg.ReplyToID, &msg.IsPinned, &msg.IsEdited, &msg.IsTTS, &msg.EditedAt, &msg.Encrypted, &msg.E2EECiphertext, &msg.E2EEMeta, &msg.CreatedAt,
	)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			var existing models.DMGroupMessage
			var existAttach, existEmbeds []byte
			checkQuery := `
				SELECT id, group_id, author_id, content, attachments, embeds, reply_to_id, is_pinned, is_edited, is_tts, edited_at, COALESCE(encrypted, false), e2ee_ciphertext, e2ee_meta, created_at
				FROM dm_group_messages
				WHERE group_id = $1 AND id = $2
			`
			if qErr := h.db.Pool.QueryRow(r.Context(), checkQuery, groupID, messageID).Scan(
				&existing.ID, &existing.GroupID, &existing.AuthorID, &existing.Content, &existAttach, &existEmbeds, &existing.ReplyToID, &existing.IsPinned, &existing.IsEdited, &existing.IsTTS, &existing.EditedAt, &existing.Encrypted, &existing.E2EECiphertext, &existing.E2EEMeta, &existing.CreatedAt,
			); qErr == nil {
				if existing.AuthorID != userID {
					w.Header().Set("Content-Type", "application/json")
					w.WriteHeader(http.StatusConflict)
					w.Write([]byte(`{"error":"idempotency_conflict"}`))
					return
				}
				payloadMatches := false
				if isEncrypted {
					if existing.Encrypted && existing.E2EECiphertext != nil && req.E2EECiphertext != nil && *existing.E2EECiphertext == *req.E2EECiphertext {
						payloadMatches = true
					}
				} else {
					if !existing.Encrypted && existing.Content == req.Content {
						payloadMatches = true
					}
				}
				if !payloadMatches {
					w.Header().Set("Content-Type", "application/json")
					w.WriteHeader(http.StatusConflict)
					w.Write([]byte(`{"error":"idempotency_conflict"}`))
					return
				}
				existing.Author = author
				if len(existAttach) > 0 {
					_ = json.Unmarshal(existAttach, &existing.Attachments)
				}
				if existing.Attachments == nil {
					existing.Attachments = make([]models.Attachment, 0)
				}
				existing.Reactions = make([]models.MessageReaction, 0)
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusOK)
				json.NewEncoder(w).Encode(existing)
				return
			}
		}
		http.Error(w, `{"error":"failed to insert message"}`, http.StatusInternalServerError)
		return
	}

	msg.Author = author
	msg.Attachments = req.Attachments
	msg.Reactions = make([]models.MessageReaction, 0)

	// Broadcast to all group members via WS
	members := h.getGroupMembers(r.Context(), groupID)
	for _, m := range members {
		h.hub.SendToUser(m.ID, models.WSEvent{
			Type: "GROUP_MESSAGE_CREATE",
			Data: msg,
		})
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(msg)
}

// EnableE2EE handles POST /api/dm/groups/{id}/e2ee/enable
func (h *DMGroupHandler) EnableE2EE(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	groupIDStr := chi.URLParam(r, "id")
	groupID, err := uuid.Parse(groupIDStr)
	if err != nil {
		http.Error(w, `{"error":"invalid group id"}`, http.StatusBadRequest)
		return
	}

	var ownerID uuid.UUID
	var currentE2EE bool
	var currentEpoch int
	err = h.db.Pool.QueryRow(r.Context(), "SELECT owner_id, COALESCE(e2ee_enabled, false), COALESCE(rotation_epoch, 1) FROM dm_groups WHERE id = $1", groupID).Scan(&ownerID, &currentE2EE, &currentEpoch)
	if err != nil {
		http.Error(w, `{"error":"group not found"}`, http.StatusNotFound)
		return
	}

	var isMember bool
	h.db.Pool.QueryRow(r.Context(), "SELECT EXISTS(SELECT 1 FROM dm_group_members WHERE group_id = $1 AND user_id = $2)", groupID, userID).Scan(&isMember)
	if !isMember {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}

	var memberCount int
	h.db.Pool.QueryRow(r.Context(), "SELECT COUNT(*) FROM dm_group_members WHERE group_id = $1", groupID).Scan(&memberCount)
	if memberCount > 15 {
		http.Error(w, `{"error":"grupos com mais de 15 membros não podem ativar E2EE"}`, http.StatusBadRequest)
		return
	}

	if !currentE2EE {
		currentEpoch = 1
		_, err = h.db.Pool.Exec(r.Context(), `
			UPDATE dm_groups
			SET e2ee_enabled = TRUE, rotation_epoch = 1
			WHERE id = $1
		`, groupID)
		if err != nil {
			http.Error(w, `{"error":"failed to enable e2ee"}`, http.StatusInternalServerError)
			return
		}
		currentE2EE = true

		members := h.getGroupMembers(r.Context(), groupID)
		rotationEvent := models.WSEvent{
			Type: models.EventE2EERotationRequired,
			Data: map[string]any{
				"conversation_type": "dm_group",
				"conversation_id":   groupID,
				"rotation_epoch":    1,
			},
		}
		for _, m := range members {
			h.hub.SendToUser(m.ID, rotationEvent)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"id":             groupID,
		"e2ee_enabled":   true,
		"rotation_epoch": currentEpoch,
	})
}


// DMGroupVoiceTokenResponse represents the response payload for joining a DM group voice call.
type DMGroupVoiceTokenResponse struct {
	Token       string `json:"token"`
	LiveKitURL  string `json:"livekit_url"`
	RoomName    string `json:"room_name"`
	E2EEEnabled bool   `json:"e2ee_enabled"`
}

func (h *DMGroupHandler) JoinVoice(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	groupIDStr := chi.URLParam(r, "id")
	groupID, err := uuid.Parse(groupIDStr)
	if err != nil {
		http.Error(w, `{"error":"invalid group id"}`, http.StatusBadRequest)
		return
	}

	var isMember bool
	var isE2EE bool
	err = h.db.Pool.QueryRow(r.Context(), `
		SELECT 
			EXISTS(SELECT 1 FROM dm_group_members WHERE group_id = $1 AND user_id = $2),
			COALESCE(g.e2ee_enabled, false)
		FROM dm_groups g
		WHERE g.id = $1
	`, groupID, userID).Scan(&isMember, &isE2EE)
	if err != nil || !isMember {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}

	var u models.UserPublic
	h.db.Pool.QueryRow(r.Context(), "SELECT id, username, COALESCE(display_name, ''), COALESCE(avatar_url, ''), COALESCE(banner_url, ''), COALESCE(bio, ''), COALESCE(status, 'offline'), COALESCE(custom_status, '') FROM users WHERE id = $1", userID).Scan(
		&u.ID, &u.Username, &u.DisplayName, &u.AvatarURL, &u.BannerURL, &u.Bio, &u.Status, &u.CustomStatus,
	)

	metaJSON := BuildLiveKitParticipantMetadata(u.AvatarURL, u.DisplayName, u.Username, u.CustomStatus, userID, isE2EE)

	userName := u.DisplayName
	if userName == "" {
		userName = u.Username
	}

	livekitRoomName := "dmgroup-" + groupID.String()
	token, err := h.livekit.GenerateJoinToken(livekitRoomName, userID, userName, string(metaJSON), true)
	if err != nil {
		http.Error(w, `{"error":"failed to generate voice token"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(DMGroupVoiceTokenResponse{
		Token:       token,
		LiveKitURL:  h.livekit.GetPublicURL(),
		RoomName:    livekitRoomName,
		E2EEEnabled: isE2EE,
	})
}

// Helpers
func (h *DMGroupHandler) getGroupMembers(ctx context.Context, groupID uuid.UUID) []models.UserPublic {
	query := `
		SELECT u.id, u.username, u.display_name, u.avatar_url, u.banner_url, u.bio, u.status, u.custom_status
		FROM dm_group_members gm
		INNER JOIN users u ON u.id = gm.user_id
		WHERE gm.group_id = $1
		ORDER BY gm.joined_at ASC
	`
	rows, err := h.db.Pool.Query(ctx, query, groupID)
	if err != nil {
		return []models.UserPublic{}
	}
	defer rows.Close()

	members := make([]models.UserPublic, 0)
	for rows.Next() {
		var u models.UserPublic
		if err := rows.Scan(&u.ID, &u.Username, &u.DisplayName, &u.AvatarURL, &u.BannerURL, &u.Bio, &u.Status, &u.CustomStatus); err == nil {
			if !h.hub.IsUserOnline(u.ID) {
				u.Status = "offline"
			}
			members = append(members, u)
		}
	}
	return members
}

func (h *DMGroupHandler) DeleteMessage(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	groupIDStr := chi.URLParam(r, "id")
	groupID, err := uuid.Parse(groupIDStr)
	if err != nil {
		http.Error(w, `{"error":"invalid group id"}`, http.StatusBadRequest)
		return
	}

	messageIDStr := chi.URLParam(r, "messageID")
	messageID, err := uuid.Parse(messageIDStr)
	if err != nil {
		http.Error(w, `{"error":"invalid message id"}`, http.StatusBadRequest)
		return
	}

	var isMember bool
	h.db.Pool.QueryRow(r.Context(), "SELECT EXISTS(SELECT 1 FROM dm_group_members WHERE group_id = $1 AND user_id = $2)", groupID, userID).Scan(&isMember)
	if !isMember {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}

	var authorID, ownerID uuid.UUID
	var invokerID *uuid.UUID
	err = h.db.Pool.QueryRow(r.Context(), `
		SELECT m.author_id, m.invoker_id, g.owner_id
		FROM dm_group_messages m
		INNER JOIN dm_groups g ON g.id = m.group_id
		WHERE m.id = $1 AND m.group_id = $2
	`, messageID, groupID).Scan(&authorID, &invokerID, &ownerID)
	if err != nil {
		http.Error(w, `{"error":"message not found"}`, http.StatusNotFound)
		return
	}

	isInvoker := invokerID != nil && *invokerID == userID
	if userID != authorID && userID != ownerID && !isInvoker {
		http.Error(w, `{"error":"forbidden: only message author or group owner can delete"}`, http.StatusForbidden)
		return
	}

	_, err = h.db.Pool.Exec(r.Context(), "DELETE FROM dm_group_messages WHERE id = $1 AND group_id = $2", messageID, groupID)
	if err != nil {
		http.Error(w, `{"error":"failed to delete message"}`, http.StatusInternalServerError)
		return
	}

	members := h.getGroupMembers(r.Context(), groupID)
	deletePayload := map[string]any{
		"id":         messageID,
		"message_id": messageID,
		"group_id":   groupID,
	}

	for _, m := range members {
		h.hub.SendToUser(m.ID, models.WSEvent{
			Type: "GROUP_MESSAGE_DELETE",
			Data: deletePayload,
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"success": true})
}

func (h *DMGroupHandler) UpdateMessage(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	groupIDStr := chi.URLParam(r, "id")
	groupID, err := uuid.Parse(groupIDStr)
	if err != nil {
		http.Error(w, `{"error":"invalid group id"}`, http.StatusBadRequest)
		return
	}

	messageIDStr := chi.URLParam(r, "messageID")
	messageID, err := uuid.Parse(messageIDStr)
	if err != nil {
		http.Error(w, `{"error":"invalid message id"}`, http.StatusBadRequest)
		return
	}

	var req struct {
		Content string `json:"content"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Content == "" {
		http.Error(w, `{"error":"content required"}`, http.StatusBadRequest)
		return
	}

	if len(req.Content) > 2000 {
		http.Error(w, `{"error":"O limite de tamanho de mensagem é 2.000 caracteres"}`, http.StatusBadRequest)
		return
	}

	var authorID uuid.UUID
	var invokerID *uuid.UUID
	err = h.db.Pool.QueryRow(r.Context(), "SELECT author_id, invoker_id FROM dm_group_messages WHERE id = $1 AND group_id = $2", messageID, groupID).Scan(&authorID, &invokerID)
	if err != nil {
		http.Error(w, `{"error":"message not found"}`, http.StatusNotFound)
		return
	}

	isInvoker := invokerID != nil && *invokerID == userID
	if userID != authorID && !isInvoker {
		http.Error(w, `{"error":"forbidden: only author can edit message"}`, http.StatusForbidden)
		return
	}

	now := time.Now().UTC()
	_, err = h.db.Pool.Exec(r.Context(), `
		UPDATE dm_group_messages
		SET content = $1, is_edited = true, edited_at = $2
		WHERE id = $3 AND group_id = $4
	`, req.Content, now, messageID, groupID)
	if err != nil {
		http.Error(w, `{"error":"failed to update message"}`, http.StatusInternalServerError)
		return
	}

	var msg models.DMGroupMessage
	var rawAttach []byte
	err = h.db.Pool.QueryRow(r.Context(), `
		SELECT id, group_id, author_id, content, attachments, reply_to_id, is_pinned, is_edited, edited_at, created_at
		FROM dm_group_messages
		WHERE id = $1
	`, messageID).Scan(
		&msg.ID, &msg.GroupID, &msg.AuthorID, &msg.Content, &rawAttach, &msg.ReplyToID, &msg.IsPinned, &msg.IsEdited, &msg.EditedAt, &msg.CreatedAt,
	)
	if err != nil {
		http.Error(w, `{"error":"failed to retrieve updated message"}`, http.StatusInternalServerError)
		return
	}

	if len(rawAttach) > 0 {
		json.Unmarshal(rawAttach, &msg.Attachments)
	}
	if msg.Attachments == nil {
		msg.Attachments = make([]models.Attachment, 0)
	}

	h.db.Pool.QueryRow(r.Context(), "SELECT id, username, display_name, avatar_url, banner_url, bio, status, custom_status FROM users WHERE id = $1", userID).Scan(
		&msg.Author.ID, &msg.Author.Username, &msg.Author.DisplayName, &msg.Author.AvatarURL, &msg.Author.BannerURL, &msg.Author.Bio, &msg.Author.Status, &msg.Author.CustomStatus,
	)

	members := h.getGroupMembers(r.Context(), groupID)
	for _, m := range members {
		h.hub.SendToUser(m.ID, models.WSEvent{
			Type: "GROUP_MESSAGE_UPDATE",
			Data: msg,
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(msg)
}

func (h *DMGroupHandler) ListPinned(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	groupIDStr := chi.URLParam(r, "id")
	groupID, err := uuid.Parse(groupIDStr)
	if err != nil {
		http.Error(w, `{"error":"invalid group id"}`, http.StatusBadRequest)
		return
	}

	var isMember bool
	h.db.Pool.QueryRow(r.Context(), "SELECT EXISTS(SELECT 1 FROM dm_group_members WHERE group_id = $1 AND user_id = $2)", groupID, userID).Scan(&isMember)
	if !isMember {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}

	query := `
		SELECT m.id, m.group_id, m.author_id, m.content, m.attachments, m.embeds, m.invoker_id, m.reply_to_id, m.is_pinned, m.is_edited, m.is_tts, m.edited_at, m.created_at,
		       u.username, u.display_name, u.avatar_url, u.banner_url, u.bio, u.status, u.custom_status,
		       iu.id, iu.username, iu.display_name, iu.avatar_url
		FROM dm_group_messages m
		INNER JOIN users u ON u.id = m.author_id
		LEFT JOIN users iu ON iu.id = m.invoker_id
		WHERE m.group_id = $1 AND m.is_pinned = true
		ORDER BY m.created_at DESC
		LIMIT 100
	`
	rows, err := h.db.Pool.Query(r.Context(), query, groupID)
	if err != nil {
		http.Error(w, `{"error":"failed to query pinned messages"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	messages := make([]models.DMGroupMessage, 0)
	for rows.Next() {
		var msg models.DMGroupMessage
		var attachBytes, embedsBytes []byte
		var invokerID, invokerUserID *uuid.UUID
		var invokerUsername, invokerDisplayName, invokerAvatarURL *string

		if err := rows.Scan(
			&msg.ID, &msg.GroupID, &msg.AuthorID, &msg.Content, &attachBytes, &embedsBytes, &invokerID, &msg.ReplyToID, &msg.IsPinned, &msg.IsEdited, &msg.IsTTS, &msg.EditedAt, &msg.CreatedAt,
			&msg.Author.Username, &msg.Author.DisplayName, &msg.Author.AvatarURL, &msg.Author.BannerURL, &msg.Author.Bio, &msg.Author.Status, &msg.Author.CustomStatus,
			&invokerUserID, &invokerUsername, &invokerDisplayName, &invokerAvatarURL,
		); err == nil {
			msg.Author.ID = msg.AuthorID
			msg.InvokerID = invokerID
			if invokerUserID != nil && invokerUsername != nil {
				var dName, aUrl string
				if invokerDisplayName != nil {
					dName = *invokerDisplayName
				}
				if invokerAvatarURL != nil {
					aUrl = *invokerAvatarURL
				}
				msg.Invoker = &models.UserPublic{
					ID:          *invokerUserID,
					Username:    *invokerUsername,
					DisplayName: dName,
					AvatarURL:   aUrl,
				}
			}
			if len(attachBytes) > 0 {
				json.Unmarshal(attachBytes, &msg.Attachments)
			}
			if msg.Attachments == nil {
				msg.Attachments = make([]models.Attachment, 0)
			}
			if len(embedsBytes) > 0 {
				json.Unmarshal(embedsBytes, &msg.Embeds)
			}
			messages = append(messages, msg)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(messages)
}

func (h *DMGroupHandler) TogglePin(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	groupIDStr := chi.URLParam(r, "id")
	groupID, err := uuid.Parse(groupIDStr)
	if err != nil {
		http.Error(w, `{"error":"invalid group id"}`, http.StatusBadRequest)
		return
	}

	messageIDStr := chi.URLParam(r, "messageID")
	messageID, err := uuid.Parse(messageIDStr)
	if err != nil {
		http.Error(w, `{"error":"invalid message id"}`, http.StatusBadRequest)
		return
	}

	var isMember bool
	h.db.Pool.QueryRow(r.Context(), "SELECT EXISTS(SELECT 1 FROM dm_group_members WHERE group_id = $1 AND user_id = $2)", groupID, userID).Scan(&isMember)
	if !isMember {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}

	var isPinned bool
	err = h.db.Pool.QueryRow(r.Context(), `
		UPDATE dm_group_messages
		SET is_pinned = NOT is_pinned
		WHERE id = $1 AND group_id = $2
		RETURNING is_pinned
	`, messageID, groupID).Scan(&isPinned)
	if err != nil {
		http.Error(w, `{"error":"message not found"}`, http.StatusNotFound)
		return
	}

	var msg models.DMGroupMessage
	var rawAttach []byte
	err = h.db.Pool.QueryRow(r.Context(), `
		SELECT id, group_id, author_id, content, attachments, reply_to_id, is_pinned, is_edited, edited_at, created_at
		FROM dm_group_messages
		WHERE id = $1
	`, messageID).Scan(
		&msg.ID, &msg.GroupID, &msg.AuthorID, &msg.Content, &rawAttach, &msg.ReplyToID, &msg.IsPinned, &msg.IsEdited, &msg.EditedAt, &msg.CreatedAt,
	)
	if err == nil {
		if len(rawAttach) > 0 {
			json.Unmarshal(rawAttach, &msg.Attachments)
		}
		if msg.Attachments == nil {
			msg.Attachments = make([]models.Attachment, 0)
		}

		h.db.Pool.QueryRow(r.Context(), "SELECT id, username, display_name, avatar_url, banner_url, bio, status, custom_status FROM users WHERE id = $1", msg.AuthorID).Scan(
			&msg.Author.ID, &msg.Author.Username, &msg.Author.DisplayName, &msg.Author.AvatarURL, &msg.Author.BannerURL, &msg.Author.Bio, &msg.Author.Status, &msg.Author.CustomStatus,
		)

		members := h.getGroupMembers(r.Context(), groupID)
		for _, m := range members {
			h.hub.SendToUser(m.ID, models.WSEvent{
				Type: "GROUP_MESSAGE_UPDATE",
				Data: msg,
			})
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"success": true, "is_pinned": isPinned})
}

