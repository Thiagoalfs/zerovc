package handlers

import (
	"context"

	"github.com/google/uuid"
	"github.com/zerovc/zerovc/backend/internal/database"
	"github.com/zerovc/zerovc/backend/internal/models"
)

// actorGuildContext resume o que sabemos sobre o autor de uma ação dentro de um guild:
// se é o dono, sua posição hierárquica mais alta (menor "position" = mais alto) e seu bitmask de permissões.
type actorGuildContext struct {
	IsOwner    bool
	MaxPos     int
	Perms      int64
	HasAdmin   bool
}

// loadActorGuildContext busca owner_id do guild e a hierarquia/permissões do actorID dentro dele.
func loadActorGuildContext(ctx context.Context, db *database.DB, guildID, actorID uuid.UUID) (actorGuildContext, error) {
	var ac actorGuildContext
	var ownerID uuid.UUID
	if err := db.Pool.QueryRow(ctx, "SELECT owner_id FROM guilds WHERE id = $1", guildID).Scan(&ownerID); err != nil {
		return ac, err
	}
	ac.IsOwner = ownerID == actorID
	ac.MaxPos = 999999

	rows, err := db.Pool.Query(ctx, `
		SELECT gr.position, gr.permissions
		FROM guild_roles gr
		INNER JOIN guild_member_roles gmr ON gmr.role_id = gr.id
		WHERE gmr.guild_id = $1 AND gmr.user_id = $2
	`, guildID, actorID)
	if err == nil {
		for rows.Next() {
			var pos int
			var p int64
			if rows.Scan(&pos, &p) == nil {
				ac.Perms |= p
				if pos < ac.MaxPos {
					ac.MaxPos = pos
				}
			}
		}
		rows.Close()
	}
	ac.HasAdmin = (ac.Perms & models.PermAdministrator) != 0
	return ac, nil
}

// canAssignRolePosition checa se o autor pode atribuir/remover um cargo de uma dada posição.
// Regra: precisa ser owner, ou ter PermAdministrator/PermManageRoles E ter posição hierárquica
// estritamente acima do cargo sendo atribuído (menor position = mais alto na hierarquia).
func (ac actorGuildContext) canAssignRolePosition(rolePosition int) (bool, string) {
	if ac.IsOwner {
		return true, ""
	}
	if !ac.HasAdmin && (ac.Perms&models.PermManageRoles) == 0 {
		return false, "você não tem permissão para gerenciar cargos"
	}
	if ac.MaxPos >= rolePosition {
		return false, "você não pode atribuir um cargo igual ou superior ao seu"
	}
	return true, ""
}