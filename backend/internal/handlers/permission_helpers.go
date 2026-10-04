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
	if ac.IsOwner {
		ac.MaxPos = -1
	} else {
		ac.MaxPos = 999999
	}

	rows, err := db.Pool.Query(ctx, `
		SELECT gr.name, gr.position, gr.permissions
		FROM guild_roles gr
		INNER JOIN guild_member_roles gmr ON gmr.role_id = gr.id
		WHERE gmr.guild_id = $1 AND gmr.user_id = $2
	`, guildID, actorID)
	if err == nil {
		for rows.Next() {
			var name string
			var pos int
			var p int64
			if rows.Scan(&name, &pos, &p) == nil {
				ac.Perms |= p
				if !ac.IsOwner && name != "@everyone" && pos < ac.MaxPos {
					ac.MaxPos = pos
				}
			}
		}
		rows.Close()
	}
	ac.HasAdmin = ac.IsOwner || (ac.Perms&models.PermAdministrator) != 0
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
		return false, "você não pode gerenciar ou atribuir um cargo igual ou superior ao seu na hierarquia"
	}
	return true, ""
}

// canModerateTarget checa se o autor pode moderar (kick, ban, mute) um targetUserID.
// Regra:
// 1. Não pode moderar a si mesmo.
// 2. Se for dono do servidor (IsOwner), pode moderar qualquer membro.
// 3. Ninguém pode moderar o dono do servidor.
// 4. Exige PermAdministrator ou a permissão específica (requiredPerm).
// 5. O executor deve ter cargo estritamente superior ao membro alvo (targetHighestPos > ac.MaxPos).
func (ac actorGuildContext) canModerateTarget(ctx context.Context, db *database.DB, guildID, actorID, targetUserID uuid.UUID, requiredPerm int64) (bool, string) {
	if actorID == targetUserID {
		return false, "você não pode realizar ações de moderação contra si mesmo"
	}
	if ac.IsOwner {
		return true, ""
	}

	var targetIsOwner bool
	if err := db.Pool.QueryRow(ctx, "SELECT owner_id = $1 FROM guilds WHERE id = $2", targetUserID, guildID).Scan(&targetIsOwner); err == nil && targetIsOwner {
		return false, "você não pode moderar o dono do servidor"
	}

	if !ac.HasAdmin && (ac.Perms&requiredPerm) == 0 {
		return false, "você não tem permissão para realizar esta ação"
	}

	var targetHighestPos int = 999999
	_ = db.Pool.QueryRow(ctx, `
		SELECT COALESCE(MIN(gr.position), 999999)
		FROM guild_roles gr
		INNER JOIN guild_member_roles gmr ON gmr.role_id = gr.id
		WHERE gmr.guild_id = $1 AND gmr.user_id = $2 AND gr.name != '@everyone'
	`, guildID, targetUserID).Scan(&targetHighestPos)

	if targetHighestPos <= ac.MaxPos {
		return false, "você não pode moderar um membro com cargo igual ou superior ao seu na hierarquia"
	}

	return true, ""
}

// canUserSendTTS checa se o usuário tem permissão para enviar TTS em um canal específico,
// combinando permissões de cargos no servidor, bypass de Admin/Owner e sobrescritas de canal.
func canUserSendTTS(ctx context.Context, db *database.DB, guildID, channelID, userID uuid.UUID) (bool, error) {
	actorCtx, err := loadActorGuildContext(ctx, db, guildID, userID)
	if err != nil {
		return false, err
	}
	if actorCtx.IsOwner || actorCtx.HasAdmin {
		return true, nil
	}

	// 1. Permissão base vinda dos cargos do membro
	hasPerm := (actorCtx.Perms & models.PermSendTTS) != 0

	// 2. Sobrescritas de permissão no canal
	rows, err := db.Pool.Query(ctx, `
		SELECT cpo.role_id, cpo.allow, cpo.deny, gr.name,
		       EXISTS(SELECT 1 FROM guild_member_roles gmr WHERE gmr.guild_id = $1 AND gmr.user_id = $2 AND gmr.role_id = cpo.role_id) as is_member_role
		FROM channel_permission_overwrites cpo
		INNER JOIN guild_roles gr ON gr.id = cpo.role_id
		WHERE cpo.channel_id = $3
	`, guildID, userID, channelID)
	if err != nil {
		return false, err
	}
	defer rows.Close()

	var roleAllow, roleDeny bool
	for rows.Next() {
		var roleID uuid.UUID
		var allow, deny int64
		var roleName string
		var isMemberRole bool
		if err := rows.Scan(&roleID, &allow, &deny, &roleName, &isMemberRole); err == nil {
			if roleName == "@everyone" {
				if (deny & models.PermSendTTS) != 0 {
					hasPerm = false
				}
				if (allow & models.PermSendTTS) != 0 {
					hasPerm = true
				}
			} else if isMemberRole {
				if (deny & models.PermSendTTS) != 0 {
					roleDeny = true
				}
				if (allow & models.PermSendTTS) != 0 {
					roleAllow = true
				}
			}
		}
	}

	if roleDeny {
		hasPerm = false
	}
	if roleAllow {
		hasPerm = true
	}

	return hasPerm, nil
}