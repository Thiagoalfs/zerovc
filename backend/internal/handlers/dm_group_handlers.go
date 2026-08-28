package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
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

	// Enforce 10 members maximum limit
	if len(totalMembers) > 10 {
		http.Error(w, `{"error":"grupos de DM podem ter no máximo 10 membros"}`, http.StatusBadRequest)
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

	// Create Group
	var group models.DMGroup
	err := h.db.Pool.QueryRow(r.Context(), `
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
		h.db.Pool.Exec(r.Context(), `
			INSERT INTO dm_group_members (group_id, user_id)
			VALUES ($1, $2)
			ON CONFLICT DO NOTHING
		`, group.ID, mID)
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
		SELECT g.id, g.name, g.icon_url, g.owner_id, g.created_at
		FROM dm_groups g
		INNER JOIN dm_group_members gm ON gm.group_id = g.id
		WHERE gm.user_id = $1
		ORDER BY g.created_at DESC
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
		if err := rows.Scan(&g.ID, &g.Name, &g.IconURL, &g.OwnerID, &g.CreatedAt); err == nil {
			g.Members = h.getGroupMembers(r.Context(), g.ID)
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
		SELECT id, name, icon_url, owner_id, created_at
		FROM dm_groups
		WHERE id = $1
	`, groupID).Scan(&g.ID, &g.Name, &g.IconURL, &g.OwnerID, &g.CreatedAt)
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

	if currentCount+len(req.MemberIDs) > 10 {
		http.Error(w, `{"error":"o grupo não pode ultrapassar 10 membros"}`, http.StatusBadRequest)
		return
	}

	for _, mID := range req.MemberIDs {
		if mID != uuid.Nil {
			h.db.Pool.Exec(r.Context(), "INSERT INTO dm_group_members (group_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", groupID, mID)
		}
	}

	members := h.getGroupMembers(r.Context(), groupID)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(members)
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

	// Remove member
	h.db.Pool.Exec(r.Context(), "DELETE FROM dm_group_members WHERE group_id = $1 AND user_id = $2", groupID, targetUserID)

	// Count remaining members
	var remainingCount int
	h.db.Pool.QueryRow(r.Context(), "SELECT COUNT(*) FROM dm_group_members WHERE group_id = $1", groupID).Scan(&remainingCount)

	if remainingCount == 0 {
		// Delete group
		h.db.Pool.Exec(r.Context(), "DELETE FROM dm_groups WHERE id = $1", groupID)
	} else if targetUserID == ownerID {
		// Transfer ownership to oldest remaining member
		var newOwnerID uuid.UUID
		h.db.Pool.QueryRow(r.Context(), "SELECT user_id FROM dm_group_members WHERE group_id = $1 ORDER BY joined_at ASC LIMIT 1", groupID).Scan(&newOwnerID)
		if newOwnerID != uuid.Nil {
			h.db.Pool.Exec(r.Context(), "UPDATE dm_groups SET owner_id = $1 WHERE id = $2", newOwnerID, groupID)
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
		SELECT m.id, m.group_id, m.author_id, m.content, m.attachments, m.reply_to_id, m.is_pinned, m.is_edited, m.edited_at, m.created_at,
		       u.username, u.display_name, u.avatar_url, u.banner_url, u.bio, u.status, u.custom_status
		FROM dm_group_messages m
		INNER JOIN users u ON u.id = m.author_id
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
		if err := rows.Scan(
			&msg.ID, &msg.GroupID, &msg.AuthorID, &msg.Content, &attachBytes, &msg.ReplyToID, &msg.IsPinned, &msg.IsEdited, &msg.EditedAt, &msg.CreatedAt,
			&msg.Author.Username, &msg.Author.DisplayName, &msg.Author.AvatarURL, &msg.Author.BannerURL, &msg.Author.Bio, &msg.Author.Status, &msg.Author.CustomStatus,
		); err == nil {
			msg.Author.ID = msg.AuthorID
			if len(attachBytes) > 0 {
				json.Unmarshal(attachBytes, &msg.Attachments)
			}
			if msg.Attachments == nil {
				msg.Attachments = make([]models.Attachment, 0)
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

	var req struct {
		Content     string              `json:"content"`
		Attachments []models.Attachment `json:"attachments"`
		ReplyToID   *uuid.UUID          `json:"reply_to_id,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || (req.Content == "" && len(req.Attachments) == 0) {
		http.Error(w, `{"error":"content required"}`, http.StatusBadRequest)
		return
	}

	attachBytes, _ := json.Marshal(req.Attachments)

	var msg models.DMGroupMessage
	insertQuery := `
		INSERT INTO dm_group_messages (group_id, author_id, content, attachments, reply_to_id)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, group_id, author_id, content, attachments, reply_to_id, is_pinned, is_edited, edited_at, created_at
	`
	var rawAttach []byte
	err = h.db.Pool.QueryRow(r.Context(), insertQuery, groupID, userID, req.Content, attachBytes, req.ReplyToID).Scan(
		&msg.ID, &msg.GroupID, &msg.AuthorID, &msg.Content, &rawAttach, &msg.ReplyToID, &msg.IsPinned, &msg.IsEdited, &msg.EditedAt, &msg.CreatedAt,
	)
	if err != nil {
		http.Error(w, `{"error":"failed to insert message"}`, http.StatusInternalServerError)
		return
	}

	// Fetch author
	h.db.Pool.QueryRow(r.Context(), "SELECT id, username, display_name, avatar_url, banner_url, bio, status, custom_status FROM users WHERE id = $1", userID).Scan(
		&msg.Author.ID, &msg.Author.Username, &msg.Author.DisplayName, &msg.Author.AvatarURL, &msg.Author.BannerURL, &msg.Author.Bio, &msg.Author.Status, &msg.Author.CustomStatus,
	)
	msg.Attachments = req.Attachments

	// Broadcast to all group members via WS
	members := h.getGroupMembers(r.Context(), groupID)
	for _, m := range members {
		h.hub.SendToUser(m.ID, models.WSEvent{
			Type: "GROUP_MESSAGE_CREATE",
			Data: msg,
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(msg)
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
	h.db.Pool.QueryRow(r.Context(), "SELECT EXISTS(SELECT 1 FROM dm_group_members WHERE group_id = $1 AND user_id = $2)", groupID, userID).Scan(&isMember)
	if !isMember {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}

	var userName string
	h.db.Pool.QueryRow(r.Context(), "SELECT COALESCE(display_name, username) FROM users WHERE id = $1", userID).Scan(&userName)

	livekitRoomName := "dmgroup-" + groupID.String()
	token, err := h.livekit.GenerateJoinToken(livekitRoomName, userID, userName, "", true)
	if err != nil {
		http.Error(w, `{"error":"failed to generate voice token"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"token":       token,
		"livekit_url": h.livekit.GetPublicURL(),
		"room_name":   livekitRoomName,
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
