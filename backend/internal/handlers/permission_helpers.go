package handlers

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
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
	ac.IsOwner = (ownerID == actorID)
	if ac.IsOwner {
		ac.MaxPos = -1
	} else {
		ac.MaxPos = 999999
	}

	// Verify member status if not owner
	if !ac.IsOwner {
		var isMember bool
		_ = db.Pool.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM guild_members WHERE guild_id = $1 AND user_id = $2)", guildID, actorID).Scan(&isMember)
		if !isMember {
			return ac, errors.New("user is not a member of guild")
		}
	}

	rows, err := db.Pool.Query(ctx, `
		SELECT gr.name, gr.position, gr.permissions
		FROM guild_roles gr
		WHERE gr.guild_id = $1 AND (
			gr.name = '@everyone'
			OR gr.id IN (
				SELECT role_id FROM guild_member_roles
				WHERE guild_id = $1 AND user_id = $2
			)
		)
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

// canManageRoleOverwrite checa se o autor pode alterar/remover sobrescritas de permissão para um cargo.
// Regras:
// 1. Dono do servidor sempre pode.
// 2. Precisa de PermAdministrator, PermManageRoles ou PermManageChannels no canal (canManageChannel).
// 3. Não pode alterar cargos diferentes de @everyone com posição igual ou superior à sua na hierarquia.
// 4. Sem PermAdministrator, não pode conceder ou negar bits de permissão que não possui.
func (ac actorGuildContext) canManageRoleOverwrite(roleName string, rolePosition int, canManageChannel bool, addedAllow int64, addedDeny int64) (bool, string) {
	if ac.IsOwner {
		return true, ""
	}
	if !ac.HasAdmin && (ac.Perms&models.PermManageRoles) == 0 && !canManageChannel {
		return false, "você não tem permissão para gerenciar permissões deste canal"
	}
	if roleName != "@everyone" && ac.MaxPos >= rolePosition {
		return false, "você não pode alterar permissões de um cargo igual ou superior ao seu na hierarquia"
	}
	if !ac.HasAdmin && (((addedAllow & ^ac.Perms) != 0) || ((addedDeny & ^ac.Perms) != 0)) {
		return false, "você não pode conceder ou negar permissões que você não possui"
	}
	return true, ""
}

type roleOverwrite struct {
	Allow int64
	Deny  int64
}

func loadOverwritesMap(ctx context.Context, db *database.DB, channelID uuid.UUID) (map[uuid.UUID]roleOverwrite, error) {
	overwrites := make(map[uuid.UUID]roleOverwrite)
	rows, err := db.Pool.Query(ctx, "SELECT role_id, allow, deny FROM channel_permission_overwrites WHERE channel_id = $1", channelID)
	if err != nil {
		return overwrites, err
	}
	defer rows.Close()

	for rows.Next() {
		var rid uuid.UUID
		var allow, deny int64
		if rows.Scan(&rid, &allow, &deny) == nil {
			overwrites[rid] = roleOverwrite{Allow: allow, Deny: deny}
		}
	}
	return overwrites, rows.Err()
}

func evalRoleOverwrites(overwrites map[uuid.UUID]roleOverwrite, everyoneRoleID uuid.UUID, userRoleIDs []uuid.UUID, permFlag int64, currentPerm bool) bool {
	if everyoneRoleID != uuid.Nil {
		if ow, ok := overwrites[everyoneRoleID]; ok {
			if (ow.Deny & permFlag) != 0 {
				currentPerm = false
			}
			if (ow.Allow & permFlag) != 0 {
				currentPerm = true
			}
		}
	}

	var roleAllow, roleDeny bool
	for _, rid := range userRoleIDs {
		if rid == everyoneRoleID {
			continue
		}
		if ow, ok := overwrites[rid]; ok {
			if (ow.Deny & permFlag) != 0 {
				roleDeny = true
			}
			if (ow.Allow & permFlag) != 0 {
				roleAllow = true
			}
		}
	}

	if roleDeny {
		currentPerm = false
	}
	if roleAllow {
		currentPerm = true
	}
	return currentPerm
}

// applyChannelOverwrites aplica as sobrescritas de permissão de um canal ou categoria ao estado atual de permFlag.
func applyChannelOverwrites(ctx context.Context, db *database.DB, guildID, targetChannelID, userID uuid.UUID, permFlag int64, currentPerm bool) (bool, error) {
	rows, err := db.Pool.Query(ctx, `
		SELECT cpo.role_id, cpo.allow, cpo.deny, gr.name,
		       EXISTS(SELECT 1 FROM guild_member_roles gmr WHERE gmr.guild_id = $1 AND gmr.user_id = $2 AND gmr.role_id = cpo.role_id) as is_member_role
		FROM channel_permission_overwrites cpo
		INNER JOIN guild_roles gr ON gr.id = cpo.role_id
		WHERE cpo.channel_id = $3
	`, guildID, userID, targetChannelID)
	if err != nil {
		return currentPerm, err
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
				if (deny & permFlag) != 0 {
					currentPerm = false
				}
				if (allow & permFlag) != 0 {
					currentPerm = true
				}
			} else if isMemberRole {
				if (deny & permFlag) != 0 {
					roleDeny = true
				}
				if (allow & permFlag) != 0 {
					roleAllow = true
				}
			}
		}
	}
	if err := rows.Err(); err != nil {
		return currentPerm, err
	}

	if roleDeny {
		currentPerm = false
	}
	if roleAllow {
		currentPerm = true
	}

	return currentPerm, nil
}

// canUserPerformInChannel avalia uma permissão específica em um canal, combinando
// hierarquia, bypass de Admin/Owner, permissões dos cargos do membro e sobrescritas da categoria e do canal.
func canUserPerformInChannel(ctx context.Context, db *database.DB, guildID, channelID, userID uuid.UUID, permFlag int64) (bool, error) {
	actorCtx, err := loadActorGuildContext(ctx, db, guildID, userID)
	if err != nil {
		return false, err
	}
	if actorCtx.IsOwner || actorCtx.HasAdmin {
		return true, nil
	}

	// 1. Permissão base vinda dos cargos do membro (inclui @everyone)
	hasPerm := (actorCtx.Perms & permFlag) != 0

	// 2. Sobrescritas herdadas da categoria (se houver)
	var categoryID *uuid.UUID
	_ = db.Pool.QueryRow(ctx, "SELECT category_id FROM channels WHERE id = $1 AND guild_id = $2", channelID, guildID).Scan(&categoryID)
	if categoryID != nil {
		hasPerm, _ = applyChannelOverwrites(ctx, db, guildID, *categoryID, userID, permFlag, hasPerm)
	}

	// 3. Sobrescritas de permissão no próprio canal
	hasPerm, err = applyChannelOverwrites(ctx, db, guildID, channelID, userID, permFlag, hasPerm)
	if err != nil {
		return false, err
	}
	return hasPerm, nil
}

// canUserManageChannel checa se o usuário tem permissão para gerenciar o canal considerando sobrescritas.
func canUserManageChannel(ctx context.Context, db *database.DB, guildID, channelID, userID uuid.UUID) (bool, error) {
	return canUserPerformInChannel(ctx, db, guildID, channelID, userID, models.PermManageChannels)
}

// canUserSendTTS checa se o usuário tem permissão para enviar TTS em um canal específico.
func canUserSendTTS(ctx context.Context, db *database.DB, guildID, channelID, userID uuid.UUID) (bool, error) {
	return canUserPerformInChannel(ctx, db, guildID, channelID, userID, models.PermSendTTS)
}

// canUserUseCommands checa se o usuário tem permissão para usar comandos slash em um canal específico.
func canUserUseCommands(ctx context.Context, db *database.DB, guildID, channelID, userID uuid.UUID) (bool, error) {
	return canUserPerformInChannel(ctx, db, guildID, channelID, userID, models.PermUseCommands)
}

// canUserManageMessages checa se o usuário tem permissão para gerenciar mensagens em um canal específico.
func canUserManageMessages(ctx context.Context, db *database.DB, guildID, channelID, userID uuid.UUID) (bool, error) {
	return canUserPerformInChannel(ctx, db, guildID, channelID, userID, models.PermManageMessages)
}

// canUserSendMessages checa se o usuário tem permissão para enviar mensagens normais em um canal específico.
func canUserSendMessages(ctx context.Context, db *database.DB, guildID, channelID, userID uuid.UUID) (bool, error) {
	return canUserPerformInChannel(ctx, db, guildID, channelID, userID, models.PermSendMessages)
}

// canUserAttachFiles checa se o usuário tem permissão para anexar arquivos em um canal específico.
func canUserAttachFiles(ctx context.Context, db *database.DB, guildID, channelID, userID uuid.UUID) (bool, error) {
	return canUserPerformInChannel(ctx, db, guildID, channelID, userID, models.PermAttachFiles)
}

// canUserAccessChannel checa se o usuário tem permissão de ver/acessar um canal.
// Avalia bypass de Admin/Owner, acesso base (channel_role_access em canais privados ou PermViewChannel em públicos)
// e sobrescritas de PermViewChannel na categoria e no canal.
func canUserAccessChannel(ctx context.Context, db *database.DB, guildID, channelID, userID uuid.UUID) (bool, error) {
	actorCtx, err := loadActorGuildContext(ctx, db, guildID, userID)
	if err != nil {
		return false, err
	}
	if actorCtx.IsOwner || actorCtx.HasAdmin {
		return true, nil
	}

	var isPrivate bool
	var categoryID *uuid.UUID
	err = db.Pool.QueryRow(ctx, "SELECT is_private, category_id FROM channels WHERE id = $1 AND guild_id = $2", channelID, guildID).Scan(&isPrivate, &categoryID)
	if err != nil {
		return false, err
	}

	var hasAccess bool
	if isPrivate {
		err = db.Pool.QueryRow(ctx, `
			SELECT EXISTS(
				SELECT 1 FROM channel_role_access cra
				INNER JOIN guild_member_roles gmr ON gmr.role_id = cra.role_id
				WHERE cra.channel_id = $1 AND gmr.guild_id = $2 AND gmr.user_id = $3
			)
		`, channelID, guildID, userID).Scan(&hasAccess)
		if err != nil {
			return false, err
		}
	} else {
		hasAccess = (actorCtx.Perms & models.PermViewChannel) != 0
	}

	if categoryID != nil {
		hasAccess, _ = applyChannelOverwrites(ctx, db, guildID, *categoryID, userID, models.PermViewChannel, hasAccess)
	}

	hasAccess, err = applyChannelOverwrites(ctx, db, guildID, channelID, userID, models.PermViewChannel, hasAccess)
	if err != nil {
		return false, err
	}
	return hasAccess, nil
}

// channelHasViewRestrictions indica se a visibilidade do canal possui restrições
// (canal privado, @everyone sem PermViewChannel ou sobrescritas de PermViewChannel no canal/categoria).
func channelHasViewRestrictions(ctx context.Context, db *database.DB, guildID, channelID uuid.UUID, isPrivate bool) bool {
	if isPrivate {
		return true
	}

	var everyonePerms int64
	err := db.Pool.QueryRow(ctx, "SELECT permissions FROM guild_roles WHERE guild_id = $1 AND name = '@everyone'", guildID).Scan(&everyonePerms)
	if err != nil || (everyonePerms&models.PermViewChannel) == 0 {
		return true
	}

	var categoryID *uuid.UUID
	_ = db.Pool.QueryRow(ctx, "SELECT category_id FROM channels WHERE id = $1 AND guild_id = $2", channelID, guildID).Scan(&categoryID)

	var hasOverwrite bool
	if categoryID != nil {
		err = db.Pool.QueryRow(ctx, `
			SELECT EXISTS(
				SELECT 1 FROM channel_permission_overwrites
				WHERE (channel_id = $1 OR channel_id = $2)
				  AND ((allow | deny) & $3) != 0
			)
		`, channelID, *categoryID, models.PermViewChannel).Scan(&hasOverwrite)
	} else {
		err = db.Pool.QueryRow(ctx, `
			SELECT EXISTS(
				SELECT 1 FROM channel_permission_overwrites
				WHERE channel_id = $1
				  AND ((allow | deny) & $2) != 0
			)
		`, channelID, models.PermViewChannel).Scan(&hasOverwrite)
	}
	if err != nil {
		return true
	}
	return hasOverwrite
}

// GetPrivateChannelAllowedUserIDs returns all user IDs authorized to access a restricted channel,
// matching canUserAccessChannel semantics (owner/admin, channel_role_access, category & channel overwrites).
func GetPrivateChannelAllowedUserIDs(ctx context.Context, db *database.DB, guildID, channelID uuid.UUID) ([]uuid.UUID, error) {
	var ownerID uuid.UUID
	if err := db.Pool.QueryRow(ctx, "SELECT owner_id FROM guilds WHERE id = $1", guildID).Scan(&ownerID); err != nil {
		return nil, err
	}

	var isPrivate bool
	var categoryID *uuid.UUID
	channelErr := db.Pool.QueryRow(ctx, "SELECT is_private, category_id FROM channels WHERE id = $1 AND guild_id = $2", channelID, guildID).Scan(&isPrivate, &categoryID)
	if channelErr != nil && !errors.Is(channelErr, pgx.ErrNoRows) {
		return nil, channelErr
	}
	channelExists := channelErr == nil

	memberRows, err := db.Pool.Query(ctx, "SELECT user_id FROM guild_members WHERE guild_id = $1", guildID)
	if err != nil {
		return nil, err
	}
	var memberIDs []uuid.UUID
	for memberRows.Next() {
		var uid uuid.UUID
		if memberRows.Scan(&uid) == nil {
			memberIDs = append(memberIDs, uid)
		}
	}
	memberRows.Close()

	rolePerms := make(map[uuid.UUID]int64)
	var everyoneRoleID uuid.UUID
	var everyonePerms int64
	roleRows, err := db.Pool.Query(ctx, "SELECT id, name, permissions FROM guild_roles WHERE guild_id = $1", guildID)
	if err != nil {
		return nil, err
	}
	for roleRows.Next() {
		var rid uuid.UUID
		var name string
		var perms int64
		if roleRows.Scan(&rid, &name, &perms) == nil {
			rolePerms[rid] = perms
			if name == "@everyone" {
				everyoneRoleID = rid
				everyonePerms = perms
			}
		}
	}
	roleRows.Close()

	memberRoles := make(map[uuid.UUID][]uuid.UUID)
	mrRows, err := db.Pool.Query(ctx, "SELECT user_id, role_id FROM guild_member_roles WHERE guild_id = $1", guildID)
	if err != nil {
		return nil, err
	}
	for mrRows.Next() {
		var uid, rid uuid.UUID
		if mrRows.Scan(&uid, &rid) == nil {
			memberRoles[uid] = append(memberRoles[uid], rid)
		}
	}
	mrRows.Close()

	var channelRoleAccess map[uuid.UUID]bool
	var categoryOverwrites map[uuid.UUID]roleOverwrite
	var channelOverwrites map[uuid.UUID]roleOverwrite

	if channelExists {
		if isPrivate {
			channelRoleAccess = make(map[uuid.UUID]bool)
			craRows, err := db.Pool.Query(ctx, "SELECT role_id FROM channel_role_access WHERE channel_id = $1", channelID)
			if err != nil {
				return nil, err
			}
			for craRows.Next() {
				var rid uuid.UUID
				if craRows.Scan(&rid) == nil {
					channelRoleAccess[rid] = true
				}
			}
			craRows.Close()
		}

		if categoryID != nil {
			categoryOverwrites, _ = loadOverwritesMap(ctx, db, *categoryID)
		}
		channelOverwrites, err = loadOverwritesMap(ctx, db, channelID)
		if err != nil {
			return nil, err
		}
	}

	var uids []uuid.UUID
	for _, uid := range memberIDs {
		if uid == ownerID {
			uids = append(uids, uid)
			continue
		}

		userRoles := memberRoles[uid]
		combinedPerms := everyonePerms
		for _, rid := range userRoles {
			combinedPerms |= rolePerms[rid]
		}
		if (combinedPerms & models.PermAdministrator) != 0 {
			uids = append(uids, uid)
			continue
		}

		if !channelExists {
			continue
		}

		var hasAccess bool
		if isPrivate {
			for _, rid := range userRoles {
				if channelRoleAccess[rid] {
					hasAccess = true
					break
				}
			}
		} else {
			hasAccess = (combinedPerms & models.PermViewChannel) != 0
		}

		if categoryID != nil {
			hasAccess = evalRoleOverwrites(categoryOverwrites, everyoneRoleID, userRoles, models.PermViewChannel, hasAccess)
		}
		hasAccess = evalRoleOverwrites(channelOverwrites, everyoneRoleID, userRoles, models.PermViewChannel, hasAccess)

		if hasAccess {
			uids = append(uids, uid)
		}
	}

	return uids, nil
}
