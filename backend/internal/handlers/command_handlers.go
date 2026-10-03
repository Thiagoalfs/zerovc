package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/zerovc/zerovc/backend/internal/auth"
	"github.com/zerovc/zerovc/backend/internal/database"
	"github.com/zerovc/zerovc/backend/internal/gateway"
	"github.com/zerovc/zerovc/backend/internal/models"
	"github.com/zerovc/zerovc/backend/internal/services"
)

var GorkUserID = uuid.MustParse("00000000-0000-0000-0000-000000000001")

type CommandHandler struct {
	db        *database.DB
	hub       *gateway.Hub
	riot      *services.RiotService
	uploadDir string
}

func NewCommandHandler(db *database.DB, hub *gateway.Hub, riot *services.RiotService, uploadDir string) *CommandHandler {
	return &CommandHandler{
		db:        db,
		hub:       hub,
		riot:      riot,
		uploadDir: uploadDir,
	}
}

func (h *CommandHandler) trackBotTempFiles(ctx context.Context, msgID uuid.UUID, channelID *uuid.UUID, dmRoomID *uuid.UUID, dmGroupID *uuid.UUID, attachments []models.Attachment) {
	for _, att := range attachments {
		if att.URL == "" {
			continue
		}
		// ONLY track temporary bot downloads (i.e. inside bot_temp)
		if !strings.Contains(att.URL, "bot_temp") {
			continue
		}
		relPath := att.URL
		if idx := strings.Index(relPath, "assets/"); idx != -1 {
			relPath = strings.TrimPrefix(relPath[idx:], "assets/")
		}
		diskPath := filepath.Join(h.uploadDir, filepath.Clean(relPath))
		_, _ = h.db.Pool.Exec(ctx, `
			INSERT INTO bot_temp_files (file_url, file_path, message_id, channel_id, dm_room_id, dm_group_id, expires_at)
			VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP + INTERVAL '1 day')
		`, att.URL, diskPath, msgID, channelID, dmRoomID, dmGroupID)
	}
}

type ExecuteCommandRequest struct {
	Command     string              `json:"command"`
	Subcommand  string              `json:"subcommand,omitempty"`
	Args        map[string]any      `json:"args,omitempty"`
	Attachments []models.Attachment `json:"attachments,omitempty"`
}

type CommandResult struct {
	Content     string                `json:"content"`
	Embeds      []models.MessageEmbed `json:"embeds"`
	Attachments []models.Attachment   `json:"attachments"`
}

func (h *CommandHandler) getGorkAuthor(ctx context.Context) models.UserPublic {
	var gork models.UserPublic
	err := h.db.Pool.QueryRow(ctx, `
		SELECT id, username, display_name, avatar_url, banner_url, bio, status, is_bot
		FROM users
		WHERE id = $1
	`, GorkUserID).Scan(
		&gork.ID,
		&gork.Username,
		&gork.DisplayName,
		&gork.AvatarURL,
		&gork.BannerURL,
		&gork.Bio,
		&gork.Status,
		&gork.IsBot,
	)
	if err != nil {
		return models.UserPublic{
			ID:          GorkUserID,
			Username:    "gork",
			DisplayName: "gork",
			AvatarURL:   "/assets/gork.jpg",
			IsBot:       true,
			Status:      "online",
		}
	}
	return gork
}

func (h *CommandHandler) resolveTargetUser(ctx context.Context, raw string) (uuid.UUID, models.User, error) {
	var target models.User
	clean := strings.TrimSpace(raw)
	clean = strings.TrimPrefix(clean, "<@")
	clean = strings.TrimPrefix(clean, "@")
	clean = strings.TrimSuffix(clean, ">")
	clean = strings.TrimSpace(clean)

	if clean == "" {
		return uuid.Nil, target, fmt.Errorf("usuário não informado")
	}

	if parsedID, err := uuid.Parse(clean); err == nil {
		err = h.db.Pool.QueryRow(ctx, `
			SELECT id, username, display_name, COALESCE(avatar_url, '')
			FROM users
			WHERE id = $1
		`, parsedID).Scan(&target.ID, &target.Username, &target.DisplayName, &target.AvatarURL)
		if err == nil {
			return target.ID, target, nil
		}
	}

	err := h.db.Pool.QueryRow(ctx, `
		SELECT id, username, display_name, COALESCE(avatar_url, '')
		FROM users
		WHERE LOWER(username) = LOWER($1) OR LOWER(display_name) = LOWER($1)
		LIMIT 1
	`, clean).Scan(&target.ID, &target.Username, &target.DisplayName, &target.AvatarURL)
	if err != nil {
		return uuid.Nil, target, fmt.Errorf("usuário não encontrado")
	}

	return target.ID, target, nil
}

func (h *CommandHandler) processCommand(
	ctx context.Context,
	req ExecuteCommandRequest,
	invoker models.UserPublic,
	guildID *uuid.UUID,
	channelID *uuid.UUID,
) (CommandResult, error) {
	cmd := strings.ToLower(strings.TrimSpace(req.Command))
	sub := strings.ToLower(strings.TrimSpace(req.Subcommand))

	now := time.Now()

	switch cmd {
	case "clear", "purge", "limpar":
		if guildID == nil || channelID == nil {
			return CommandResult{
				Embeds: []models.MessageEmbed{
					{
						Title:       "❌ Comando Indisponível",
						Description: "O comando `/clear` só pode ser utilizado dentro de um canal de texto de um servidor.",
						Color:       "#f43f5e",
						Timestamp:   &now,
					},
				},
			}, nil
		}

		actorCtx, err := loadActorGuildContext(ctx, h.db, *guildID, invoker.ID)
		if err != nil {
			return CommandResult{}, fmt.Errorf("erro ao verificar permissões: %w", err)
		}

		if !actorCtx.IsOwner && !actorCtx.HasAdmin && (actorCtx.Perms&models.PermManageMessages) == 0 {
			return CommandResult{
				Embeds: []models.MessageEmbed{
					{
						Title:       "❌ Permissão Negada",
						Description: "Você precisa de um cargo com a permissão **Gerenciar Mensagens** para usar `/clear`.",
						Color:       "#f43f5e",
						Timestamp:   &now,
					},
				},
			}, nil
		}

		amount := 10
		if amtVal, ok := req.Args["amount"]; ok {
			switch v := amtVal.(type) {
			case float64:
				amount = int(v)
			case int:
				amount = v
			case string:
				fmt.Sscanf(strings.TrimSpace(v), "%d", &amount)
			}
		}
		if amount < 1 {
			amount = 1
		}
		if amount > 100 {
			amount = 100
		}

		var targetUserID *uuid.UUID
		var targetUser models.User
		if uVal, ok := req.Args["user"]; ok && uVal != nil {
			if uStr, ok := uVal.(string); ok && strings.TrimSpace(uStr) != "" {
				tID, tU, err := h.resolveTargetUser(ctx, uStr)
				if err == nil && tID != uuid.Nil {
					targetUserID = &tID
					targetUser = tU
				}
			}
		}

		var messageIDs []uuid.UUID
		if targetUserID != nil {
			rows, qErr := h.db.Pool.Query(ctx, `
				SELECT id FROM messages
				WHERE channel_id = $1 AND (author_id = $2 OR invoker_id = $2)
				ORDER BY created_at DESC
				LIMIT $3
			`, *channelID, *targetUserID, amount)
			if qErr == nil {
				for rows.Next() {
					var mID uuid.UUID
					if rows.Scan(&mID) == nil {
						messageIDs = append(messageIDs, mID)
					}
				}
				rows.Close()
			}
		} else {
			rows, qErr := h.db.Pool.Query(ctx, `
				SELECT id FROM messages
				WHERE channel_id = $1
				ORDER BY created_at DESC
				LIMIT $2
			`, *channelID, amount)
			if qErr == nil {
				for rows.Next() {
					var mID uuid.UUID
					if rows.Scan(&mID) == nil {
						messageIDs = append(messageIDs, mID)
					}
				}
				rows.Close()
			}
		}

		if len(messageIDs) > 0 {
			_, _ = h.db.Pool.Exec(ctx, "DELETE FROM messages WHERE id = ANY($1)", messageIDs)

			for _, delID := range messageIDs {
				h.hub.BroadcastToGuild(*guildID, models.WSEvent{
					Type: models.EventMessageDelete,
					Data: map[string]any{
						"id":         delID,
						"channel_id": *channelID,
						"guild_id":   *guildID,
					},
				})
			}
		}

		desc := fmt.Sprintf("🧹 **%d** mensagens foram apagadas por **@%s**.", len(messageIDs), invoker.Username)
		if len(messageIDs) == 1 {
			desc = fmt.Sprintf("🧹 **1** mensagem foi apagada por **@%s**.", invoker.Username)
		}
		if targetUserID != nil {
			desc = fmt.Sprintf("🧹 **%d** mensagens de **@%s** foram apagadas por **@%s**.", len(messageIDs), targetUser.Username, invoker.Username)
		}

		return CommandResult{
			Embeds: []models.MessageEmbed{
				{
					Title:       "Limpeza de Chat Concluída",
					Description: desc,
					Color:       "#10b981",
					Footer: &models.EmbedFooter{
						Text: fmt.Sprintf("Solicitado por @%s", invoker.Username),
					},
					Timestamp: &now,
				},
			},
		}, nil

	case "kick":
		if guildID == nil {
			return CommandResult{
				Embeds: []models.MessageEmbed{
					{
						Title:       "❌ Comando Indisponível",
						Description: "O comando `/kick` só pode ser utilizado dentro de um servidor.",
						Color:       "#f43f5e",
						Timestamp:   &now,
					},
				},
			}, nil
		}

		actorCtx, err := loadActorGuildContext(ctx, h.db, *guildID, invoker.ID)
		if err != nil {
			return CommandResult{}, fmt.Errorf("erro ao verificar permissões: %w", err)
		}

		if !actorCtx.IsOwner && !actorCtx.HasAdmin && (actorCtx.Perms&models.PermKickMembers) == 0 {
			return CommandResult{
				Embeds: []models.MessageEmbed{
					{
						Title:       "❌ Permissão Negada",
						Description: "Você precisa de um cargo com a permissão **Expulsar Membros** para usar `/kick`.",
						Color:       "#f43f5e",
						Timestamp:   &now,
					},
				},
			}, nil
		}

		userRaw, _ := req.Args["user"].(string)
		if strings.TrimSpace(userRaw) == "" {
			return CommandResult{
				Embeds: []models.MessageEmbed{
					{
						Title:       "❌ Parâmetro Faltando",
						Description: "Por favor, mencione ou informe o usuário que deseja expulsar.",
						Color:       "#f43f5e",
						Timestamp:   &now,
					},
				},
			}, nil
		}

		targetID, targetUser, err := h.resolveTargetUser(ctx, userRaw)
		if err != nil {
			return CommandResult{
				Embeds: []models.MessageEmbed{
					{
						Title:       "❌ Usuário Não Encontrado",
						Description: fmt.Sprintf("Não foi possível localizar o usuário `%s`.", userRaw),
						Color:       "#f43f5e",
						Timestamp:   &now,
					},
				},
			}, nil
		}

		var isMember bool
		_ = h.db.Pool.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM guild_members WHERE guild_id = $1 AND user_id = $2)", *guildID, targetID).Scan(&isMember)
		if !isMember {
			return CommandResult{
				Embeds: []models.MessageEmbed{
					{
						Title:       "❌ Membro Não Presente",
						Description: fmt.Sprintf("O usuário **@%s** não faz parte deste servidor.", targetUser.Username),
						Color:       "#f43f5e",
						Timestamp:   &now,
					},
				},
			}, nil
		}

		allowed, reasonMsg := actorCtx.canModerateTarget(ctx, h.db, *guildID, invoker.ID, targetID, models.PermKickMembers)
		if !allowed {
			return CommandResult{
				Embeds: []models.MessageEmbed{
					{
						Title:       "❌ Ação Bloqueada",
						Description: reasonMsg,
						Color:       "#f43f5e",
						Timestamp:   &now,
					},
				},
			}, nil
		}

		reason, _ := req.Args["reason"].(string)
		if strings.TrimSpace(reason) == "" {
			reason = "Nenhum motivo especificado."
		}

		_, _ = h.db.Pool.Exec(ctx, "DELETE FROM guild_member_roles WHERE guild_id = $1 AND user_id = $2", *guildID, targetID)
		_, _ = h.db.Pool.Exec(ctx, "DELETE FROM voice_sessions WHERE user_id = $1", targetID)
		_, _ = h.db.Pool.Exec(ctx, "DELETE FROM guild_members WHERE guild_id = $1 AND user_id = $2", *guildID, targetID)

		h.hub.RemoveGuildMember(*guildID, targetID)
		h.hub.BroadcastToGuild(*guildID, models.WSEvent{
			Type: "GUILD_MEMBER_REMOVE",
			Data: map[string]any{
				"guild_id": *guildID,
				"user_id":  targetID,
			},
		})

		return CommandResult{
			Embeds: []models.MessageEmbed{
				{
					Title:       "👢 Membro Expulso",
					Description: fmt.Sprintf("**@%s** (%s) foi expulso do servidor por **@%s**.\n\n**Motivo:** %s", targetUser.DisplayName, targetUser.Username, invoker.Username, reason),
					Color:       "#f59e0b",
					Thumbnail: func() *models.EmbedMedia {
						if targetUser.AvatarURL != "" {
							return &models.EmbedMedia{URL: targetUser.AvatarURL}
						}
						return nil
					}(),
					Footer: &models.EmbedFooter{
						Text: fmt.Sprintf("ID: %s • Moderador: @%s", targetID, invoker.Username),
					},
					Timestamp: &now,
				},
			},
		}, nil

	case "ban":
		if guildID == nil {
			return CommandResult{
				Embeds: []models.MessageEmbed{
					{
						Title:       "❌ Comando Indisponível",
						Description: "O comando `/ban` só pode ser utilizado dentro de um servidor.",
						Color:       "#f43f5e",
						Timestamp:   &now,
					},
				},
			}, nil
		}

		actorCtx, err := loadActorGuildContext(ctx, h.db, *guildID, invoker.ID)
		if err != nil {
			return CommandResult{}, fmt.Errorf("erro ao verificar permissões: %w", err)
		}

		if !actorCtx.IsOwner && !actorCtx.HasAdmin && (actorCtx.Perms&models.PermBanMembers) == 0 {
			return CommandResult{
				Embeds: []models.MessageEmbed{
					{
						Title:       "❌ Permissão Negada",
						Description: "Você precisa de um cargo com a permissão **Banir Membros** para usar `/ban`.",
						Color:       "#f43f5e",
						Timestamp:   &now,
					},
				},
			}, nil
		}

		userRaw, _ := req.Args["user"].(string)
		if strings.TrimSpace(userRaw) == "" {
			return CommandResult{
				Embeds: []models.MessageEmbed{
					{
						Title:       "❌ Parâmetro Faltando",
						Description: "Por favor, mencione ou informe o usuário que deseja banir.",
						Color:       "#f43f5e",
						Timestamp:   &now,
					},
				},
			}, nil
		}

		targetID, targetUser, err := h.resolveTargetUser(ctx, userRaw)
		if err != nil {
			return CommandResult{
				Embeds: []models.MessageEmbed{
					{
						Title:       "❌ Usuário Não Encontrado",
						Description: fmt.Sprintf("Não foi possível localizar o usuário `%s`.", userRaw),
						Color:       "#f43f5e",
						Timestamp:   &now,
					},
				},
			}, nil
		}

		allowed, reasonMsg := actorCtx.canModerateTarget(ctx, h.db, *guildID, invoker.ID, targetID, models.PermBanMembers)
		if !allowed {
			return CommandResult{
				Embeds: []models.MessageEmbed{
					{
						Title:       "❌ Ação Bloqueada",
						Description: reasonMsg,
						Color:       "#f43f5e",
						Timestamp:   &now,
					},
				},
			}, nil
		}

		reason, _ := req.Args["reason"].(string)
		if strings.TrimSpace(reason) == "" {
			reason = "Nenhum motivo especificado."
		}

		_, err = h.db.Pool.Exec(ctx, `
			INSERT INTO guild_bans (guild_id, user_id, reason, banned_by)
			VALUES ($1, $2, $3, $4)
			ON CONFLICT (guild_id, user_id) DO UPDATE SET reason = EXCLUDED.reason, banned_by = EXCLUDED.banned_by
		`, *guildID, targetID, reason, invoker.ID)
		if err != nil {
			return CommandResult{}, fmt.Errorf("falha ao registrar banimento: %w", err)
		}

		_, _ = h.db.Pool.Exec(ctx, "DELETE FROM guild_member_roles WHERE guild_id = $1 AND user_id = $2", *guildID, targetID)
		_, _ = h.db.Pool.Exec(ctx, "DELETE FROM voice_sessions WHERE user_id = $1", targetID)
		_, _ = h.db.Pool.Exec(ctx, "DELETE FROM guild_members WHERE guild_id = $1 AND user_id = $2", *guildID, targetID)

		h.hub.RemoveGuildMember(*guildID, targetID)
		h.hub.BroadcastToGuild(*guildID, models.WSEvent{
			Type: "GUILD_MEMBER_REMOVE",
			Data: map[string]any{
				"guild_id": *guildID,
				"user_id":  targetID,
			},
		})

		return CommandResult{
			Embeds: []models.MessageEmbed{
				{
					Title:       "🔨 Membro Banido",
					Description: fmt.Sprintf("**@%s** (%s) foi banido do servidor por **@%s**.\n\n**Motivo:** %s", targetUser.DisplayName, targetUser.Username, invoker.Username, reason),
					Color:       "#ef4444",
					Thumbnail: func() *models.EmbedMedia {
						if targetUser.AvatarURL != "" {
							return &models.EmbedMedia{URL: targetUser.AvatarURL}
						}
						return nil
					}(),
					Footer: &models.EmbedFooter{
						Text: fmt.Sprintf("ID: %s • Moderador: @%s", targetID, invoker.Username),
					},
					Timestamp: &now,
				},
			},
		}, nil

	case "tts":
		if guildID == nil {
			return CommandResult{
				Embeds: []models.MessageEmbed{
					{
						Title:       "❌ Comando Indisponível",
						Description: "O comando `/tts` só pode ser utilizado dentro de um canal de texto de um servidor.",
						Color:       "#f43f5e",
						Timestamp:   &now,
					},
				},
			}, nil
		}

		actorCtx, err := loadActorGuildContext(ctx, h.db, *guildID, invoker.ID)
		if err != nil {
			return CommandResult{}, fmt.Errorf("erro ao verificar permissões: %w", err)
		}

		if !actorCtx.IsOwner && !actorCtx.HasAdmin && (actorCtx.Perms&models.PermManageMessages) == 0 {
			return CommandResult{
				Embeds: []models.MessageEmbed{
					{
						Title:       "❌ Permissão Negada",
						Description: "Você precisa de um cargo com a permissão **Gerenciar Mensagens** para usar `/tts`.",
						Color:       "#f43f5e",
						Timestamp:   &now,
					},
				},
			}, nil
		}

		msgText, _ := req.Args["message"].(string)
		if strings.TrimSpace(msgText) == "" {
			if rawArgs, ok := req.Args["raw_args"].([]any); ok && len(rawArgs) > 0 {
				var strParts []string
				for _, p := range rawArgs {
					strParts = append(strParts, fmt.Sprint(p))
				}
				msgText = strings.Join(strParts, " ")
			}
		}

		if strings.TrimSpace(msgText) == "" {
			return CommandResult{
				Embeds: []models.MessageEmbed{
					{
						Title:       "❌ Mensagem Vazia",
						Description: "Por favor, informe o texto que o TTS deve narrar.",
						Color:       "#f43f5e",
						Timestamp:   &now,
					},
				},
			}, nil
		}

		return CommandResult{
			Content: fmt.Sprintf("📢 **TTS (%s):** %s", invoker.DisplayName, msgText),
		}, nil
	case "server":
		if guildID == nil {
			return CommandResult{
				Embeds: []models.MessageEmbed{
					{
						Title:       "❌ Comando indisponível",
						Description: "O comando `/server` só pode ser utilizado dentro de um servidor.",
						Color:       "#f43f5e",
						Timestamp:   &now,
					},
				},
			}, nil
		}

		var guild models.Guild
		var owner models.UserPublic
		var memberCount, textCount, voiceCount, roleCount int

		err := h.db.Pool.QueryRow(ctx, `
			SELECT g.id, g.name, COALESCE(g.icon_url, ''), COALESCE(g.banner_url, ''), g.owner_id, g.created_at,
			       u.id, u.username, u.display_name, COALESCE(u.avatar_url, '')
			FROM guilds g
			JOIN users u ON u.id = g.owner_id
			WHERE g.id = $1
		`, *guildID).Scan(
			&guild.ID, &guild.Name, &guild.IconURL, &guild.BannerURL, &guild.OwnerID, &guild.CreatedAt,
			&owner.ID, &owner.Username, &owner.DisplayName, &owner.AvatarURL,
		)
		if err != nil {
			return CommandResult{}, fmt.Errorf("servidor não encontrado")
		}

		_ = h.db.Pool.QueryRow(ctx, "SELECT COUNT(*) FROM guild_members WHERE guild_id = $1", *guildID).Scan(&memberCount)
		_ = h.db.Pool.QueryRow(ctx, "SELECT COUNT(*) FROM channels WHERE guild_id = $1 AND type = 'text'", *guildID).Scan(&textCount)
		_ = h.db.Pool.QueryRow(ctx, "SELECT COUNT(*) FROM channels WHERE guild_id = $1 AND type = 'voice'", *guildID).Scan(&voiceCount)
		_ = h.db.Pool.QueryRow(ctx, "SELECT COUNT(*) FROM guild_roles WHERE guild_id = $1", *guildID).Scan(&roleCount)

		if sub == "icon" {
			if guild.IconURL == "" {
				return CommandResult{
					Embeds: []models.MessageEmbed{
						{
							Title:       fmt.Sprintf("Ícone de %s", guild.Name),
							Description: "Este servidor não possui um ícone personalizado configurado.",
							Color:       "#6366f1",
							Timestamp:   &now,
						},
					},
				}, nil
			}

			return CommandResult{
				Embeds: []models.MessageEmbed{
					{
						Title: fmt.Sprintf("Ícone de %s", guild.Name),
						URL:   guild.IconURL,
						Color: "#6366f1",
						Image: &models.EmbedMedia{
							URL: guild.IconURL,
						},
						Footer: &models.EmbedFooter{
							Text: fmt.Sprintf("Solicitado por @%s", invoker.Username),
						},
						Timestamp: &now,
					},
				},
			}, nil
		}

		// server info
		return CommandResult{
			Embeds: []models.MessageEmbed{
				{
					Title: fmt.Sprintf("📊 Informações do Servidor: %s", guild.Name),
					Color: "#6366f1",
					Thumbnail: func() *models.EmbedMedia {
						if guild.IconURL != "" {
							return &models.EmbedMedia{URL: guild.IconURL}
						}
						return nil
					}(),
					Fields: []models.EmbedField{
						{Name: "👑 Dono", Value: fmt.Sprintf("@%s (%s)", owner.Username, owner.DisplayName), Inline: true},
						{Name: "👥 Membros", Value: fmt.Sprintf("%d membros", memberCount), Inline: true},
						{Name: "💬 Canais de Texto", Value: fmt.Sprintf("%d canais", textCount), Inline: true},
						{Name: "🔊 Canais de Voz", Value: fmt.Sprintf("%d canais", voiceCount), Inline: true},
						{Name: "🛡️ Cargos", Value: fmt.Sprintf("%d cargos", roleCount), Inline: true},
						{Name: "📅 Criado em", Value: guild.CreatedAt.Format("02/01/2006"), Inline: true},
					},
					Footer: &models.EmbedFooter{
						Text: fmt.Sprintf("ID: %s • Solicitado por @%s", guild.ID, invoker.Username),
					},
					Timestamp: &now,
				},
			},
		}, nil

	case "user":
		targetUserID := invoker.ID
		if uVal, ok := req.Args["user"]; ok && uVal != nil {
			if uStr, ok := uVal.(string); ok && uStr != "" {
				uClean := strings.TrimPrefix(uStr, "@")
				if parsedUUID, err := uuid.Parse(uClean); err == nil {
					targetUserID = parsedUUID
				} else {
					var foundID uuid.UUID
					err := h.db.Pool.QueryRow(ctx, "SELECT id FROM users WHERE LOWER(username) = LOWER($1) OR LOWER(display_name) = LOWER($1)", uClean).Scan(&foundID)
					if err == nil {
						targetUserID = foundID
					}
				}
			}
		}

		var target models.User
		err := h.db.Pool.QueryRow(ctx, `
			SELECT id, username, display_name, COALESCE(avatar_url, ''), COALESCE(banner_url, ''),
			       COALESCE(bio, ''), status, created_at, is_bot, COALESCE(riot_game_name, ''), COALESCE(riot_tag_line, ''), COALESCE(riot_region, '')
			FROM users
			WHERE id = $1
		`, targetUserID).Scan(
			&target.ID, &target.Username, &target.DisplayName, &target.AvatarURL, &target.BannerURL,
			&target.Bio, &target.Status, &target.CreatedAt, &target.IsBot, &target.RiotGameName, &target.RiotTagLine, &target.RiotRegion,
		)
		if err != nil {
			return CommandResult{
				Embeds: []models.MessageEmbed{
					{
						Title:       "❌ Usuário não encontrado",
						Description: "Não foi possível localizar o usuário especificado.",
						Color:       "#f43f5e",
						Timestamp:   &now,
					},
				},
			}, nil
		}

		if sub == "icon" {
			if target.AvatarURL == "" {
				return CommandResult{
					Embeds: []models.MessageEmbed{
						{
							Title:       fmt.Sprintf("Foto de Perfil de @%s", target.Username),
							Description: "Este usuário utiliza a foto de perfil padrão.",
							Color:       "#6366f1",
							Timestamp:   &now,
						},
					},
				}, nil
			}

			return CommandResult{
				Embeds: []models.MessageEmbed{
					{
						Title: fmt.Sprintf("Foto de Perfil de @%s", target.Username),
						URL:   target.AvatarURL,
						Color: "#6366f1",
						Image: &models.EmbedMedia{
							URL: target.AvatarURL,
						},
						Footer: &models.EmbedFooter{
							Text: fmt.Sprintf("Solicitado por @%s", invoker.Username),
						},
						Timestamp: &now,
					},
				},
			}, nil
		}

		// user info
		riotField := "Não vinculada"
		if target.RiotGameName != "" && target.RiotTagLine != "" {
			riotField = fmt.Sprintf("%s#%s (%s)", target.RiotGameName, target.RiotTagLine, strings.ToUpper(target.RiotRegion))
		}

		return CommandResult{
			Embeds: []models.MessageEmbed{
				{
					Title: fmt.Sprintf("👤 Informações do Usuário: %s", target.DisplayName),
					Color: "#6366f1",
					Thumbnail: func() *models.EmbedMedia {
						if target.AvatarURL != "" {
							return &models.EmbedMedia{URL: target.AvatarURL}
						}
						return nil
					}(),
					Fields: []models.EmbedField{
						{Name: "🏷️ Tag de Usuário", Value: fmt.Sprintf("@%s", target.Username), Inline: true},
						{Name: "🟢 Status", Value: strings.ToUpper(target.Status), Inline: true},
						{Name: "🎮 Conta Riot", Value: riotField, Inline: true},
						{Name: "📅 Conta Criada", Value: target.CreatedAt.Format("02/01/2006"), Inline: true},
					},
					Footer: &models.EmbedFooter{
						Text: fmt.Sprintf("ID: %s • Solicitado por @%s", target.ID, invoker.Username),
					},
					Timestamp: &now,
				},
			},
		}, nil

	case "league":
		if sub == "link" {
			riotIDRaw, _ := req.Args["riot_id"].(string)
			regionRaw, _ := req.Args["region"].(string)

			if strings.TrimSpace(riotIDRaw) == "" {
				return CommandResult{
					Embeds: []models.MessageEmbed{
						{
							Title:       "❌ Uso incorreto do comando",
							Description: "Por favor, informe seu Riot ID no formato `Nome#Tag` (Ex: `/league link riot_id: tani otoshi#fate region: BR`).",
							Color:       "#f43f5e",
							Timestamp:   &now,
						},
					},
				}, nil
			}

			parts := strings.Split(riotIDRaw, "#")
			if len(parts) != 2 || strings.TrimSpace(parts[0]) == "" || strings.TrimSpace(parts[1]) == "" {
				return CommandResult{
					Embeds: []models.MessageEmbed{
						{
							Title:       "❌ Formato de Riot ID Inválido",
							Description: "O Riot ID deve conter o nome e a hashtag (exemplo: `tani otoshi#fate`).",
							Color:       "#f43f5e",
							Timestamp:   &now,
						},
					},
				}, nil
			}

			gameName := strings.TrimSpace(parts[0])
			tagLine := strings.TrimSpace(parts[1])
			if regionRaw == "" {
				regionRaw = "BR"
			}

			acc, err := h.riot.GetAccount(gameName, tagLine, regionRaw)
			if err != nil {
				return CommandResult{
					Embeds: []models.MessageEmbed{
						{
							Title:       "❌ Erro ao Vincular Conta Riot",
							Description: fmt.Sprintf("Não foi possível validar o Riot ID **%s#%s** na região **%s**:\n%s", gameName, tagLine, strings.ToUpper(regionRaw), err.Error()),
							Color:       "#f43f5e",
							Timestamp:   &now,
						},
					},
				}, nil
			}

			// Update user database row
			_, err = h.db.Pool.Exec(ctx, `
				UPDATE users
				SET riot_game_name = $1,
				    riot_tag_line = $2,
				    riot_region = $3,
				    riot_puuid = $4
				WHERE id = $5
			`, acc.GameName, acc.TagLine, strings.ToLower(services.NormalizeRegion(regionRaw)), acc.PUUID, invoker.ID)

			if err != nil {
				return CommandResult{}, fmt.Errorf("erro ao salvar dados no banco: %w", err)
			}

			return CommandResult{
				Embeds: []models.MessageEmbed{
					{
						Title:       "✅ Conta Riot Vinculada com Sucesso!",
						Description: fmt.Sprintf("A conta Riot **%s#%s** (%s) foi vinculada com sucesso ao seu perfil do ZeroVC!", acc.GameName, acc.TagLine, strings.ToUpper(regionRaw)),
						Color:       "#10b981",
						Footer: &models.EmbedFooter{
							Text: fmt.Sprintf("Vinculado por @%s", invoker.Username),
						},
						Timestamp: &now,
					},
				},
			}, nil
		}

		// league profile
		var targetGameName, targetTagLine, targetRegion string

		// 1. Direct riot_id argument
		if riotVal, ok := req.Args["riot_id"].(string); ok && strings.TrimSpace(riotVal) != "" {
			parts := strings.Split(riotVal, "#")
			if len(parts) == 2 {
				targetGameName = strings.TrimSpace(parts[0])
				targetTagLine = strings.TrimSpace(parts[1])
			}
		}

		if regVal, ok := req.Args["region"].(string); ok && regVal != "" {
			targetRegion = regVal
		}

		// 2. Target user argument or Self
		if targetGameName == "" {
			lookupUserID := invoker.ID
			if uVal, ok := req.Args["user"].(string); ok && strings.TrimSpace(uVal) != "" {
				uClean := strings.TrimPrefix(strings.TrimSpace(uVal), "@")
				if parsedUUID, err := uuid.Parse(uClean); err == nil {
					lookupUserID = parsedUUID
				} else {
					var foundID uuid.UUID
					if err := h.db.Pool.QueryRow(ctx, "SELECT id FROM users WHERE LOWER(username) = LOWER($1) OR LOWER(display_name) = LOWER($1)", uClean).Scan(&foundID); err == nil {
						lookupUserID = foundID
					} else {
						return CommandResult{
							Embeds: []models.MessageEmbed{
								{
									Title:       "❌ Usuário não encontrado",
									Description: fmt.Sprintf("Não foi possível localizar o usuário **@%s**.", uClean),
									Color:       "#f43f5e",
									Timestamp:   &now,
								},
							},
						}, nil
					}
				}
			}

			var uGameName, uTagLine, uRegion string
			err := h.db.Pool.QueryRow(ctx, `
				SELECT COALESCE(riot_game_name, ''), COALESCE(riot_tag_line, ''), COALESCE(riot_region, '')
				FROM users
				WHERE id = $1
			`, lookupUserID).Scan(&uGameName, &uTagLine, &uRegion)

			if err != nil || uGameName == "" || uTagLine == "" {
				isSelf := lookupUserID == invoker.ID
				msg := "Você ainda não vinculou sua conta Riot! Use `/league link` para vincular."
				if !isSelf {
					msg = "Este usuário ainda não vinculou uma conta Riot no ZeroVC."
				}

				return CommandResult{
					Embeds: []models.MessageEmbed{
						{
							Title:       "❌ Conta Riot Não Vinculada",
							Description: msg,
							Color:       "#f43f5e",
							Timestamp:   &now,
						},
					},
				}, nil
			}

			targetGameName = uGameName
			targetTagLine = uTagLine
			if targetRegion == "" {
				targetRegion = uRegion
			}
		}

		if targetRegion == "" {
			targetRegion = "br1"
		}

		prof, err := h.riot.FetchFullProfile(targetGameName, targetTagLine, targetRegion)
		if err != nil {
			return CommandResult{
				Embeds: []models.MessageEmbed{
					{
						Title:       "❌ Erro ao Carregar Perfil do LoL",
						Description: fmt.Sprintf("Não foi possível carregar os dados de **%s#%s** (%s):\n%s", targetGameName, targetTagLine, strings.ToUpper(targetRegion), err.Error()),
						Color:       "#f43f5e",
						Timestamp:   &now,
					},
				},
			}, nil
		}

		// Build exact Discord-like Rich Embed matching reference
		soloText := "Unranked"
		if prof.SoloTier != "" {
			soloText = fmt.Sprintf("%s %s (%d LP)", prof.SoloTier, prof.SoloRank, prof.SoloLP)
		}

		flexText := "Unranked"
		if prof.FlexTier != "" {
			flexText = fmt.Sprintf("%s %s (%d LP)", prof.FlexTier, prof.FlexRank, prof.FlexLP)
		}

		medals := []string{"🥇", "🥈", "🥉"}
		var masteryLines []string
		for i, c := range prof.TopChampions {
			medal := medals[i]
			masteryLines = append(masteryLines, fmt.Sprintf("%s **%s** (M%d) — `%s pts`", medal, c.ChampionName, c.Level, c.FormattedPts))
		}

		masteryContent := "Nenhum campeão registrado."
		if len(masteryLines) > 0 {
			masteryContent = strings.Join(masteryLines, "\n")
		}

		var thumb *models.EmbedMedia
		if len(prof.TopChampions) > 0 && prof.TopChampions[0].SplashURL != "" {
			thumb = &models.EmbedMedia{URL: prof.TopChampions[0].SplashURL}
		}

		embed := models.MessageEmbed{
			Color: "#0ea5e9", // Sky blue bar
			Author: &models.EmbedAuthor{
				Name:    fmt.Sprintf("%s#%s (Nível %d)", prof.GameName, prof.TagLine, prof.SummonerLevel),
				IconURL: prof.ProfileIconURL,
				URL:     prof.OpggURL,
			},
			Title:     "📊 Perfil de League of Legends",
			Thumbnail: thumb,
			Fields: []models.EmbedField{
				{Name: "🏆 Solo/Duo", Value: soloText, Inline: true},
				{Name: "👥 Flex", Value: flexText, Inline: true},
				{Name: "🔥 Top 3 Campeões Mais Jogados", Value: masteryContent, Inline: false},
				{Name: "🔗 Links Úteis", Value: fmt.Sprintf("[Ver estatísticas no OP.GG](%s)", prof.OpggURL), Inline: false},
			},
			Footer: &models.EmbedFooter{
				Text: fmt.Sprintf("Patch %s • Solicitado por %s", prof.PatchVersion, invoker.Username),
			},
			Timestamp: &now,
		}

		return CommandResult{
			Embeds: []models.MessageEmbed{embed},
		}, nil

	case "ytdlp_progress":
		progressVal, _ := req.Args["progress"].(float64)
		statusText, _ := req.Args["text"].(string)
		if statusText == "" {
			statusText = "Iniciando download..."
		}
		content := fmt.Sprintf("⏳ **Baixando mídia com yt-dlp...** (%.0f%%)\n`%s`", progressVal, statusText)
		if progressVal <= 0 {
			content = fmt.Sprintf("⏳ **Baixando mídia com yt-dlp...**\n`%s`", statusText)
		}
		return CommandResult{
			Content: content,
		}, nil

	case "ytdlp_publish":
		title, _ := req.Args["title"].(string)
		urlStr, _ := req.Args["url"].(string)
		formatType, _ := req.Args["format"].(string)

		if strings.TrimSpace(title) == "" {
			title = "Download"
		}

		var desc string
		if strings.ToLower(formatType) == "mp3" {
			desc = fmt.Sprintf("🎵 **Audio pronto:** [%s](%s)", title, urlStr)
		} else {
			desc = fmt.Sprintf("🎬 **Vídeo pronto:** [%s](%s)", title, urlStr)
		}

		return CommandResult{
			Content:     desc,
			Attachments: req.Attachments,
		}, nil

	case "ytdlp_error":
		errMsg, _ := req.Args["error"].(string)
		if errMsg == "" {
			errMsg = "Falha ao processar o download do vídeo."
		}

		return CommandResult{
			Embeds: []models.MessageEmbed{
				{
					Title:       "❌ Erro no YT-DLP",
					Description: errMsg,
					Color:       "#f43f5e",
					Footer: &models.EmbedFooter{
						Text: fmt.Sprintf("Solicitado por @%s", invoker.Username),
					},
					Timestamp: &now,
				},
			},
		}, nil

	default:
		return CommandResult{
			Embeds: []models.MessageEmbed{
				{
					Title:       "❌ Comando Desconhecido",
					Description: fmt.Sprintf("O comando `/%s` não foi reconhecido.", cmd),
					Color:       "#f43f5e",
					Timestamp:   &now,
				},
			},
		}, nil
	}
}

// POST /api/channels/{id}/bot/command
func (h *CommandHandler) ExecuteGuildCommand(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID, ok := auth.GetUserIDFromContext(ctx)
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

	var req ExecuteCommandRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	// Verify channel and get guild
	var guildID uuid.UUID
	var isPrivate bool
	err = h.db.Pool.QueryRow(ctx, "SELECT guild_id, is_private FROM channels WHERE id = $1", channelID).Scan(&guildID, &isPrivate)
	if err != nil {
		http.Error(w, `{"error":"channel not found"}`, http.StatusNotFound)
		return
	}

	// Verify user is member of guild
	var isMember bool
	err = h.db.Pool.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM guild_members WHERE guild_id = $1 AND user_id = $2)", guildID, userID).Scan(&isMember)
	if err != nil || !isMember {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}

	// Get invoker
	var invoker models.User
	err = h.db.Pool.QueryRow(ctx, "SELECT id, username, display_name, COALESCE(avatar_url, '') FROM users WHERE id = $1", userID).Scan(
		&invoker.ID, &invoker.Username, &invoker.DisplayName, &invoker.AvatarURL,
	)
	if err != nil {
		http.Error(w, `{"error":"user not found"}`, http.StatusNotFound)
		return
	}
	invokerPublic := invoker.ToPublic()

	result, err := h.processCommand(ctx, req, invokerPublic, &guildID, &channelID)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err.Error()), http.StatusInternalServerError)
		return
	}

	gorkAuthor := h.getGorkAuthor(ctx)
	embedsJSON, _ := json.Marshal(result.Embeds)
	attachmentsJSON, _ := json.Marshal(result.Attachments)

	var msg models.Message
	err = h.db.Pool.QueryRow(ctx, `
		INSERT INTO messages (channel_id, author_id, invoker_id, content, attachments, embeds)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id, channel_id, author_id, invoker_id, content, attachments, embeds, is_pinned, is_edited, created_at, updated_at
	`, channelID, GorkUserID, userID, result.Content, attachmentsJSON, embedsJSON).Scan(
		&msg.ID, &msg.ChannelID, &msg.AuthorID, &msg.InvokerID, &msg.Content, &attachmentsJSON, &embedsJSON,
		&msg.IsPinned, &msg.IsEdited, &msg.CreatedAt, &msg.UpdatedAt,
	)
	if err != nil {
		http.Error(w, `{"error":"failed to create message"}`, http.StatusInternalServerError)
		return
	}

	msg.GuildID = &guildID
	msg.Author = gorkAuthor
	msg.Invoker = &invokerPublic
	msg.Embeds = result.Embeds
	msg.Attachments = result.Attachments

	if len(result.Attachments) > 0 {
		h.trackBotTempFiles(ctx, msg.ID, &channelID, nil, nil, result.Attachments)
	}

	// Broadcast WS event
	wsEvent := models.WSEvent{
		Type: models.EventMessageCreate,
		Data: msg,
	}
	if !isPrivate {
		h.hub.BroadcastToGuild(guildID, wsEvent)
	} else {
		h.hub.BroadcastToGuild(guildID, wsEvent)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(msg)
}

// POST /api/dm/rooms/{id}/bot/command
func (h *CommandHandler) ExecuteDMRoomCommand(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID, ok := auth.GetUserIDFromContext(ctx)
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	roomIDStr := chi.URLParam(r, "id")
	roomID, err := uuid.Parse(roomIDStr)
	if err != nil {
		http.Error(w, `{"error":"invalid room id"}`, http.StatusBadRequest)
		return
	}

	var req ExecuteCommandRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	var user1ID, user2ID uuid.UUID
	err = h.db.Pool.QueryRow(ctx, "SELECT user1_id, user2_id FROM dm_rooms WHERE id = $1", roomID).Scan(&user1ID, &user2ID)
	if err != nil || (userID != user1ID && userID != user2ID) {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}

	var invoker models.User
	h.db.Pool.QueryRow(ctx, "SELECT id, username, display_name, COALESCE(avatar_url, '') FROM users WHERE id = $1", userID).Scan(
		&invoker.ID, &invoker.Username, &invoker.DisplayName, &invoker.AvatarURL,
	)
	invokerPublic := invoker.ToPublic()

	result, err := h.processCommand(ctx, req, invokerPublic, nil, nil)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err.Error()), http.StatusInternalServerError)
		return
	}

	gorkAuthor := h.getGorkAuthor(ctx)
	embedsJSON, _ := json.Marshal(result.Embeds)
	attachmentsJSON, _ := json.Marshal(result.Attachments)

	var msg models.DMMessage
	err = h.db.Pool.QueryRow(ctx, `
		INSERT INTO dm_messages (dm_room_id, author_id, invoker_id, content, attachments, embeds)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id, dm_room_id, author_id, invoker_id, content, attachments, embeds, is_pinned, is_edited, created_at
	`, roomID, GorkUserID, userID, result.Content, attachmentsJSON, embedsJSON).Scan(
		&msg.ID, &msg.DMRoomID, &msg.AuthorID, &msg.InvokerID, &msg.Content, &attachmentsJSON, &embedsJSON,
		&msg.IsPinned, &msg.IsEdited, &msg.CreatedAt,
	)
	if err != nil {
		http.Error(w, `{"error":"failed to create dm message"}`, http.StatusInternalServerError)
		return
	}

	msg.Author = gorkAuthor
	msg.Invoker = &invokerPublic
	msg.Embeds = result.Embeds
	msg.Attachments = result.Attachments

	if len(result.Attachments) > 0 {
		h.trackBotTempFiles(ctx, msg.ID, nil, &roomID, nil, result.Attachments)
	}

	wsEvent := models.WSEvent{
		Type: models.EventDMMessageCreate,
		Data: msg,
	}
	h.hub.BroadcastToUsers([]uuid.UUID{user1ID, user2ID}, wsEvent)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(msg)
}

// POST /api/dm/groups/{id}/bot/command
func (h *CommandHandler) ExecuteDMGroupCommand(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID, ok := auth.GetUserIDFromContext(ctx)
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

	var req ExecuteCommandRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	var isMember bool
	err = h.db.Pool.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM dm_group_members WHERE group_id = $1 AND user_id = $2)", groupID, userID).Scan(&isMember)
	if err != nil || !isMember {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}

	var invoker models.User
	h.db.Pool.QueryRow(ctx, "SELECT id, username, display_name, COALESCE(avatar_url, '') FROM users WHERE id = $1", userID).Scan(
		&invoker.ID, &invoker.Username, &invoker.DisplayName, &invoker.AvatarURL,
	)
	invokerPublic := invoker.ToPublic()

	result, err := h.processCommand(ctx, req, invokerPublic, nil, nil)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err.Error()), http.StatusInternalServerError)
		return
	}

	gorkAuthor := h.getGorkAuthor(ctx)
	embedsJSON, _ := json.Marshal(result.Embeds)
	attachmentsJSON, _ := json.Marshal(result.Attachments)

	var msg models.DMGroupMessage
	err = h.db.Pool.QueryRow(ctx, `
		INSERT INTO dm_group_messages (group_id, author_id, invoker_id, content, attachments, embeds)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id, group_id, author_id, invoker_id, content, attachments, embeds, is_pinned, is_edited, created_at
	`, groupID, GorkUserID, userID, result.Content, attachmentsJSON, embedsJSON).Scan(
		&msg.ID, &msg.GroupID, &msg.AuthorID, &msg.InvokerID, &msg.Content, &attachmentsJSON, &embedsJSON,
		&msg.IsPinned, &msg.IsEdited, &msg.CreatedAt,
	)
	if err != nil {
		http.Error(w, `{"error":"failed to create dm group message"}`, http.StatusInternalServerError)
		return
	}

	msg.Author = gorkAuthor
	msg.Invoker = &invokerPublic
	msg.Embeds = result.Embeds
	msg.Attachments = result.Attachments

	if len(result.Attachments) > 0 {
		h.trackBotTempFiles(ctx, msg.ID, nil, nil, &groupID, result.Attachments)
	}

	// Get all group members for broadcast
	rows, err := h.db.Pool.Query(ctx, "SELECT user_id FROM dm_group_members WHERE group_id = $1", groupID)
	if err == nil {
		defer rows.Close()
		var memberIDs []uuid.UUID
		for rows.Next() {
			var mUID uuid.UUID
			if err := rows.Scan(&mUID); err == nil {
				memberIDs = append(memberIDs, mUID)
			}
		}
		if len(memberIDs) > 0 {
			wsEvent := models.WSEvent{
				Type: "GROUP_MESSAGE_CREATE",
				Data: msg,
			}
			h.hub.BroadcastToUsers(memberIDs, wsEvent)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(msg)
}
