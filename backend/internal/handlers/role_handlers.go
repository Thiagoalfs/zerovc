package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/zerovc/zerovc/backend/internal/auth"
	"github.com/zerovc/zerovc/backend/internal/database"
	"github.com/zerovc/zerovc/backend/internal/gateway"
	"github.com/zerovc/zerovc/backend/internal/models"
)

type RoleHandler struct {
	db  *database.DB
	hub *gateway.Hub
}

func NewRoleHandler(db *database.DB, hub *gateway.Hub) *RoleHandler {
	return &RoleHandler{
		db:  db,
		hub: hub,
	}
}

type CreateRoleRequest struct {
	Name        string `json:"name"`
	Color       string `json:"color"`
	Permissions int64  `json:"permissions"`
}

type UpdateRoleRequest struct {
	Name        *string `json:"name,omitempty"`
	Color       *string `json:"color,omitempty"`
	Position    *int    `json:"position,omitempty"`
	Permissions *int64  `json:"permissions,omitempty"`
}

func (h *RoleHandler) List(w http.ResponseWriter, r *http.Request) {
	guildIDStr := chi.URLParam(r, "guildID")
	guildID, err := uuid.Parse(guildIDStr)
	if err != nil {
		http.Error(w, `{"error":"invalid guild id"}`, http.StatusBadRequest)
		return
	}

	query := `SELECT id, guild_id, name, color, position, permissions, created_at FROM guild_roles WHERE guild_id = $1 ORDER BY position ASC, created_at ASC`
	rows, err := h.db.Pool.Query(r.Context(), query, guildID)
	if err != nil {
		http.Error(w, `{"error":"failed to list roles"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	roles := make([]models.Role, 0)
	for rows.Next() {
		var role models.Role
		if err := rows.Scan(&role.ID, &role.GuildID, &role.Name, &role.Color, &role.Position, &role.Permissions, &role.CreatedAt); err == nil {
			roles = append(roles, role)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(roles)
}

func (h *RoleHandler) Create(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	guildIDStr := chi.URLParam(r, "guildID")
	guildID, err := uuid.Parse(guildIDStr)
	if err != nil {
		http.Error(w, `{"error":"invalid guild id"}`, http.StatusBadRequest)
		return
	}

	// Verify owner or admin
	var ownerID uuid.UUID
	err = h.db.Pool.QueryRow(r.Context(), "SELECT owner_id FROM guilds WHERE id = $1", guildID).Scan(&ownerID)
	if err != nil || ownerID != userID {
		http.Error(w, `{"error":"forbidden: only server owner can create roles"}`, http.StatusForbidden)
		return
	}

	var req CreateRoleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Name == "" {
		req.Name = "Novo Cargo"
	}
	if req.Color == "" {
		req.Color = "#5865F2"
	}

	var role models.Role
	query := `
		INSERT INTO guild_roles (guild_id, name, color, permissions)
		VALUES ($1, $2, $3, $4)
		RETURNING id, guild_id, name, color, position, permissions, created_at
	`
	err = h.db.Pool.QueryRow(r.Context(), query, guildID, req.Name, req.Color, req.Permissions).Scan(
		&role.ID, &role.GuildID, &role.Name, &role.Color, &role.Position, &role.Permissions, &role.CreatedAt,
	)
	if err != nil {
		http.Error(w, `{"error":"failed to create role"}`, http.StatusInternalServerError)
		return
	}

	h.hub.BroadcastToGuild(guildID, models.WSEvent{
		Type: models.EventRoleCreate,
		Data: role,
	})

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(role)
}

func (h *RoleHandler) Update(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	roleIDStr := chi.URLParam(r, "roleID")
	roleID, err := uuid.Parse(roleIDStr)
	if err != nil {
		http.Error(w, `{"error":"invalid role id"}`, http.StatusBadRequest)
		return
	}

	var guildID, ownerID uuid.UUID
	err = h.db.Pool.QueryRow(r.Context(), "SELECT r.guild_id, g.owner_id FROM guild_roles r INNER JOIN guilds g ON g.id = r.guild_id WHERE r.id = $1", roleID).Scan(&guildID, &ownerID)
	if err != nil || ownerID != userID {
		http.Error(w, `{"error":"forbidden: only owner can edit roles"}`, http.StatusForbidden)
		return
	}

	var req UpdateRoleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request"}`, http.StatusBadRequest)
		return
	}

	var role models.Role
	query := `
		UPDATE guild_roles
		SET name = COALESCE($1, name),
		    color = COALESCE($2, color),
		    position = COALESCE($3, position),
		    permissions = COALESCE($4, permissions)
		WHERE id = $5
		RETURNING id, guild_id, name, color, position, permissions, created_at
	`
	err = h.db.Pool.QueryRow(r.Context(), query, req.Name, req.Color, req.Position, req.Permissions, roleID).Scan(
		&role.ID, &role.GuildID, &role.Name, &role.Color, &role.Position, &role.Permissions, &role.CreatedAt,
	)
	if err != nil {
		http.Error(w, `{"error":"failed to update role"}`, http.StatusInternalServerError)
		return
	}

	h.hub.BroadcastToGuild(guildID, models.WSEvent{
		Type: models.EventRoleUpdate,
		Data: role,
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(role)
}

func (h *RoleHandler) Delete(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	roleIDStr := chi.URLParam(r, "roleID")
	roleID, err := uuid.Parse(roleIDStr)
	if err != nil {
		http.Error(w, `{"error":"invalid role id"}`, http.StatusBadRequest)
		return
	}

	var guildID, ownerID uuid.UUID
	err = h.db.Pool.QueryRow(r.Context(), "SELECT r.guild_id, g.owner_id FROM guild_roles r INNER JOIN guilds g ON g.id = r.guild_id WHERE r.id = $1", roleID).Scan(&guildID, &ownerID)
	if err != nil || ownerID != userID {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}

	h.db.Pool.Exec(r.Context(), "DELETE FROM guild_roles WHERE id = $1", roleID)

	h.hub.BroadcastToGuild(guildID, models.WSEvent{
		Type: models.EventRoleDelete,
		Data: map[string]any{"id": roleID, "guild_id": guildID},
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"success": true})
}

func (h *RoleHandler) AssignRole(w http.ResponseWriter, r *http.Request) {
	guildIDStr := chi.URLParam(r, "guildID")
	userIDStr := chi.URLParam(r, "userID")
	roleIDStr := chi.URLParam(r, "roleID")

	guildID, _ := uuid.Parse(guildIDStr)
	targetUserID, _ := uuid.Parse(userIDStr)
	roleID, _ := uuid.Parse(roleIDStr)

	_, err := h.db.Pool.Exec(r.Context(), "INSERT INTO guild_member_roles (guild_id, user_id, role_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING", guildID, targetUserID, roleID)
	if err != nil {
		http.Error(w, `{"error":"failed to assign role"}`, http.StatusInternalServerError)
		return
	}

	// Fetch updated roles for member and broadcast
	var updatedRoles []models.Role
	rRows, rErr := h.db.Pool.Query(r.Context(), `
		SELECT gr.id, gr.guild_id, gr.name, gr.color, gr.position, gr.permissions, gr.created_at
		FROM guild_roles gr
		INNER JOIN guild_member_roles gmr ON gmr.role_id = gr.id
		WHERE gmr.guild_id = $1 AND gmr.user_id = $2
		ORDER BY gr.position ASC
	`, guildID, targetUserID)
	if rErr == nil {
		for rRows.Next() {
			var r models.Role
			if rRows.Scan(&r.ID, &r.GuildID, &r.Name, &r.Color, &r.Position, &r.Permissions, &r.CreatedAt) == nil {
				updatedRoles = append(updatedRoles, r)
			}
		}
		rRows.Close()
	}

	h.hub.BroadcastToGuild(guildID, models.WSEvent{
		Type: "GUILD_MEMBER_UPDATE",
		Data: map[string]any{
			"guild_id": guildID,
			"user_id":  targetUserID,
			"roles":    updatedRoles,
		},
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"success": true, "roles": updatedRoles})
}

func (h *RoleHandler) RemoveRole(w http.ResponseWriter, r *http.Request) {
	guildIDStr := chi.URLParam(r, "guildID")
	userIDStr := chi.URLParam(r, "userID")
	roleIDStr := chi.URLParam(r, "roleID")

	guildID, _ := uuid.Parse(guildIDStr)
	targetUserID, _ := uuid.Parse(userIDStr)
	roleID, _ := uuid.Parse(roleIDStr)

	_, err := h.db.Pool.Exec(r.Context(), "DELETE FROM guild_member_roles WHERE guild_id = $1 AND user_id = $2 AND role_id = $3", guildID, targetUserID, roleID)
	if err != nil {
		http.Error(w, `{"error":"failed to remove role"}`, http.StatusInternalServerError)
		return
	}

	// Fetch updated roles for member and broadcast
	var updatedRoles []models.Role
	rRows, rErr := h.db.Pool.Query(r.Context(), `
		SELECT gr.id, gr.guild_id, gr.name, gr.color, gr.position, gr.permissions, gr.created_at
		FROM guild_roles gr
		INNER JOIN guild_member_roles gmr ON gmr.role_id = gr.id
		WHERE gmr.guild_id = $1 AND gmr.user_id = $2
		ORDER BY gr.position ASC
	`, guildID, targetUserID)
	if rErr == nil {
		for rRows.Next() {
			var r models.Role
			if rRows.Scan(&r.ID, &r.GuildID, &r.Name, &r.Color, &r.Position, &r.Permissions, &r.CreatedAt) == nil {
				updatedRoles = append(updatedRoles, r)
			}
		}
		rRows.Close()
	}

	h.hub.BroadcastToGuild(guildID, models.WSEvent{
		Type: "GUILD_MEMBER_UPDATE",
		Data: map[string]any{
			"guild_id": guildID,
			"user_id":  targetUserID,
			"roles":    updatedRoles,
		},
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"success": true, "roles": updatedRoles})
}
