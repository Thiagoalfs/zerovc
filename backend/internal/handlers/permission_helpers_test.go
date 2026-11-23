package handlers

import (
	"testing"

	"github.com/google/uuid"
	"github.com/zerovc/zerovc/backend/internal/models"
)

func TestCanAssignRolePosition(t *testing.T) {
	tests := []struct {
		name         string
		actor        actorGuildContext
		rolePosition int
		wantAllowed  bool
	}{
		{
			name: "Owner can assign any position",
			actor: actorGuildContext{
				IsOwner:  true,
				HasAdmin: true,
				MaxPos:   -1,
			},
			rolePosition: 0,
			wantAllowed:  true,
		},
		{
			name: "Admin cannot manage role equal to their own position",
			actor: actorGuildContext{
				IsOwner:  false,
				HasAdmin: true,
				MaxPos:   5,
			},
			rolePosition: 5,
			wantAllowed:  false,
		},
		{
			name: "Admin cannot manage role higher (lower number) than their own",
			actor: actorGuildContext{
				IsOwner:  false,
				HasAdmin: true,
				MaxPos:   5,
			},
			rolePosition: 3,
			wantAllowed:  false,
		},
		{
			name: "Admin can manage role strictly lower (higher number) than their own",
			actor: actorGuildContext{
				IsOwner:  false,
				HasAdmin: true,
				MaxPos:   5,
			},
			rolePosition: 6,
			wantAllowed:  true,
		},
		{
			name: "User without PermManageRoles cannot assign role",
			actor: actorGuildContext{
				IsOwner:  false,
				HasAdmin: false,
				Perms:    models.PermSendMessages,
				MaxPos:   5,
			},
			rolePosition: 10,
			wantAllowed:  false,
		},
		{
			name: "User with PermManageRoles can assign subordinate role",
			actor: actorGuildContext{
				IsOwner:  false,
				HasAdmin: false,
				Perms:    models.PermManageRoles,
				MaxPos:   8,
			},
			rolePosition: 9,
			wantAllowed:  true,
		},
		{
			name: "User with PermManageRoles cannot assign equal position role",
			actor: actorGuildContext{
				IsOwner:  false,
				HasAdmin: false,
				Perms:    models.PermManageRoles,
				MaxPos:   8,
			},
			rolePosition: 8,
			wantAllowed:  false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			allowed, _ := tt.actor.canAssignRolePosition(tt.rolePosition)
			if allowed != tt.wantAllowed {
				t.Errorf("canAssignRolePosition() allowed = %v, want %v", allowed, tt.wantAllowed)
			}
		})
	}
}

func TestCanManageRoleOverwrite(t *testing.T) {
	tests := []struct {
		name             string
		actor            actorGuildContext
		roleName         string
		rolePosition     int
		canManageChannel bool
		addedAllow       int64
		addedDeny        int64
		wantAllowed      bool
	}{
		{
			name: "Owner bypasses all checks",
			actor: actorGuildContext{
				IsOwner:  true,
				HasAdmin: true,
				MaxPos:   -1,
				Perms:    0,
			},
			roleName:         "Admin",
			rolePosition:     0,
			canManageChannel: false,
			addedAllow:       models.PermManageGuild,
			addedDeny:        models.PermBanMembers,
			wantAllowed:      true,
		},
		{
			name: "Missing PermManageRoles and !canManageChannel is blocked",
			actor: actorGuildContext{
				IsOwner:  false,
				HasAdmin: false,
				MaxPos:   1,
				Perms:    models.PermSendMessages | models.PermViewChannel,
			},
			roleName:         "Member",
			rolePosition:     5,
			canManageChannel: false,
			addedAllow:       models.PermSendMessages,
			addedDeny:        0,
			wantAllowed:      false,
		},
		{
			name: "Subordinate role allowed when holding PermManageRoles and target bits",
			actor: actorGuildContext{
				IsOwner:  false,
				HasAdmin: false,
				MaxPos:   3,
				Perms:    models.PermManageRoles | models.PermSendMessages | models.PermAttachFiles,
			},
			roleName:         "Helper",
			rolePosition:     5,
			canManageChannel: false,
			addedAllow:       models.PermSendMessages,
			addedDeny:        models.PermAttachFiles,
			wantAllowed:      true,
		},
		{
			name: "Subordinate role allowed via canManageChannel when holding target bits",
			actor: actorGuildContext{
				IsOwner:  false,
				HasAdmin: false,
				MaxPos:   3,
				Perms:    models.PermSendMessages,
			},
			roleName:         "Helper",
			rolePosition:     5,
			canManageChannel: true,
			addedAllow:       models.PermSendMessages,
			addedDeny:        0,
			wantAllowed:      true,
		},
		{
			name: "Equal role position blocked for non-owner",
			actor: actorGuildContext{
				IsOwner:  false,
				HasAdmin: true,
				MaxPos:   5,
				Perms:    models.PermAdministrator | models.PermManageRoles,
			},
			roleName:         "Moderator",
			rolePosition:     5,
			canManageChannel: true,
			addedAllow:       models.PermSendMessages,
			addedDeny:        0,
			wantAllowed:      false,
		},
		{
			name: "Higher role position (lower number) blocked for non-owner",
			actor: actorGuildContext{
				IsOwner:  false,
				HasAdmin: false,
				MaxPos:   5,
				Perms:    models.PermManageRoles | models.PermSendMessages,
			},
			roleName:         "SeniorMod",
			rolePosition:     2,
			canManageChannel: true,
			addedAllow:       models.PermSendMessages,
			addedDeny:        0,
			wantAllowed:      false,
		},
		{
			name: "@everyone allowed for manager with PermManageRoles",
			actor: actorGuildContext{
				IsOwner:  false,
				HasAdmin: false,
				MaxPos:   5,
				Perms:    models.PermManageRoles | models.PermSendMessages | models.PermViewChannel,
			},
			roleName:         "@everyone",
			rolePosition:     9999,
			canManageChannel: false,
			addedAllow:       models.PermViewChannel,
			addedDeny:        models.PermSendMessages,
			wantAllowed:      true,
		},
		{
			name: "@everyone allowed even if actor MaxPos >= @everyone position",
			actor: actorGuildContext{
				IsOwner:  false,
				HasAdmin: false,
				MaxPos:   999999,
				Perms:    models.PermManageRoles | models.PermSendMessages,
			},
			roleName:         "@everyone",
			rolePosition:     9999,
			canManageChannel: false,
			addedAllow:       models.PermSendMessages,
			addedDeny:        0,
			wantAllowed:      true,
		},
		{
			name: "Granting unheld allow permission blocked for non-admin",
			actor: actorGuildContext{
				IsOwner:  false,
				HasAdmin: false,
				MaxPos:   2,
				Perms:    models.PermManageRoles | models.PermSendMessages,
			},
			roleName:         "Helper",
			rolePosition:     5,
			canManageChannel: true,
			addedAllow:       models.PermManageMessages,
			addedDeny:        0,
			wantAllowed:      false,
		},
		{
			name: "Denying unheld permission blocked for non-admin",
			actor: actorGuildContext{
				IsOwner:  false,
				HasAdmin: false,
				MaxPos:   2,
				Perms:    models.PermManageRoles | models.PermSendMessages,
			},
			roleName:         "Helper",
			rolePosition:     5,
			canManageChannel: true,
			addedAllow:       0,
			addedDeny:        models.PermManageChannels,
			wantAllowed:      false,
		},
		{
			name: "Admin allowed even without specific bit on subordinate role",
			actor: actorGuildContext{
				IsOwner:  false,
				HasAdmin: true,
				MaxPos:   2,
				Perms:    models.PermAdministrator,
			},
			roleName:         "Helper",
			rolePosition:     5,
			canManageChannel: false,
			addedAllow:       models.PermSendMessages | models.PermManageGuild,
			addedDeny:        models.PermBanMembers,
			wantAllowed:      true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			allowed, msg := tt.actor.canManageRoleOverwrite(
				tt.roleName,
				tt.rolePosition,
				tt.canManageChannel,
				tt.addedAllow,
				tt.addedDeny,
			)
			if allowed != tt.wantAllowed {
				t.Errorf("canManageRoleOverwrite() allowed = %v (msg=%q), want %v", allowed, msg, tt.wantAllowed)
			}
			if !allowed && msg == "" {
				t.Errorf("canManageRoleOverwrite() expected non-empty error message when denied")
			}
		})
	}
}

func TestEvalRoleOverwrites(t *testing.T) {
	everyoneID := uuid.New()
	roleA := uuid.New()
	roleB := uuid.New()

	t.Run("category deny overridden by channel role allow", func(t *testing.T) {
		catOw := map[uuid.UUID]roleOverwrite{
			everyoneID: {Deny: models.PermViewChannel},
		}
		chanOw := map[uuid.UUID]roleOverwrite{
			roleA: {Allow: models.PermViewChannel},
		}
		hasView := evalRoleOverwrites(catOw, everyoneID, []uuid.UUID{everyoneID, roleA}, models.PermViewChannel, true)
		if hasView {
			t.Fatalf("expected category @everyone deny to hide channel")
		}
		hasView = evalRoleOverwrites(chanOw, everyoneID, []uuid.UUID{everyoneID, roleA}, models.PermViewChannel, hasView)
		if !hasView {
			t.Fatalf("expected channel roleA allow to restore view")
		}
	})

	t.Run("role allow overrides role deny at same level", func(t *testing.T) {
		ow := map[uuid.UUID]roleOverwrite{
			roleA: {Deny: models.PermSendMessages},
			roleB: {Allow: models.PermSendMessages},
		}
		if !evalRoleOverwrites(ow, everyoneID, []uuid.UUID{roleA, roleB}, models.PermSendMessages, true) {
			t.Fatalf("expected roleB allow to take precedence over roleA deny")
		}
	})
}
