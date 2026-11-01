package handlers

import (
	"testing"

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
