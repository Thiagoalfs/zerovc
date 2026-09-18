# ZeroVC — Comprehensive Backend Architecture, Security & Contracts Survey Report

**Author:** Backend & Contracts Spec Miner (Antigravity Teamwork)  
**Date:** 2026-09-17  
**Scope:** Phase 0 Survey for Requirement R3 (Backend Architecture, Security & Rate Limiting in Go) and R4 (Contract & Backward Compatibility Preservation)  
**Target Codebase:** `backend/` (cmd, internal, migrations) & `client/` (lib, types, stores)

---

## Executive Summary

This survey provides an exhaustive architectural, security, database, and contract audit of the ZeroVC Go backend and its client consumers (Web, Electron Desktop, Capacitor Android).

### Key Architectural Findings:
1. **Router & Server Stack:** Go 1.23, `go-chi/chi/v5`, `jackc/pgx/v5` connection pool, `golang-jwt/jwt/v5`, `gorilla/websocket`, `livekit/protocol`, and `golang.org/x/crypto`.
2. **Current Rate Limiting:**
   - IP-level rate limiting via `httprate.LimitByIP` is applied to `/api/auth` (10/min), `/api/invites/{code}` (30/min), and `/api/link-preview` (20/min).
   - Custom in-memory Token Bucket rate limiting via `ratelimit.NewUserRateLimiter` is implemented for 15 specific authenticated actions.
   - **Crucial gap:** Critical mutation and moderation endpoints completely lack rate limiting (channel creation, role creation, role assignments, kick/ban/mute actions, channel ack, message edits and deletions). In addition, `/login` lacks per-account brute-force rate limiting (only IP-based and post-auth 2FA lockout exist).
3. **Authentication & Session Handling:**
   - Dual-mode auth: HttpOnly `token` cookie (`SameSite: Lax`, 30-day lifetime) used by Web browsers, plus `Authorization: Bearer <token>` header fallback used by Electron Desktop (loaded from `file://` or custom protocol), and `?token=` query parameter for WebSocket handshakes.
   - JWT tokens are stateless; no server-side token revocation or token version check exists on password changes or account logouts.
4. **CSRF Protection Status: CRITICALLY ABSENT.**
   - While `CORS` allows the header `X-CSRF-Token`, **no CSRF token is ever generated, stored in a session/cookie, or validated on state mutations**.
   - Mandatory Project Rule requires all state mutation actions (INSERT, UPDATE, DELETE, Toggle) to validate CSRF tokens with constant-time comparison (`subtle.ConstantTimeCompare`).
5. **HTTP Method Conventions:**
   - **Zero state changes occur via `GET`.** All state-altering endpoints utilize `POST`, `PATCH`, `PUT`, or `DELETE`.
   - To guarantee 100% backward compatibility across Web, Electron, and Mobile clients (Requirement R4), existing REST endpoints using `PATCH`, `PUT`, and `DELETE` must continue to be supported alongside CSRF validation.
6. **Database Access & PostgreSQL:**
   - Uses `pgxpool.Pool` tuned for 1 vCore / 2GB RAM (`MaxConns: 25`, `MinConns: 5`).
   - Several multi-step operations (Kick, Ban, Unban, Register, JoinByInvite) lack database transaction (`BEGIN...COMMIT`) wrapping, posing potential inconsistency risks during concurrent requests or network interruptions.
   - PostgreSQL Full-Text Search is configured via `to_tsvector('portuguese', coalesce(content, ''))` with a stored generated column and GIN index.
7. **WebSocket Gateway:**
   - Full duplex WebSocket at `/ws`.
   - 46 distinct event types and schemas documented below. Client-to-server messaging handles `TYPING_START` (with 2-second client debounce) and `PING`/`PONG` heartbeats.

---

## 1. Complete HTTP Route & Method Inventory

Below is the complete inventory of all routes exposed by `backend/cmd/server/main.go`, mapped by HTTP method, handler, state mutation classification, authorization requirement, rate limiting status, and CSRF protection status.

### 1.1 Public Endpoints

| # | Route | Method | Handler | Mutation Type | Auth | Current Rate Limit | CSRF Status | Notes |
|---|-------|--------|---------|---------------|------|--------------------|-------------|-------|
| 1 | `/health` | `GET` | Inline | None (Read) | None | None | N/A | Pings PostgreSQL; returns 200/503 |
| 2 | `/api/version` | `GET` | Inline | None (Read) | None | None | N/A | Returns server version & uptime |
| 3 | `/api/auth/register` | `POST` | `AuthHandler.Register` | **INSERT** (`users`, `email_verifications`) | Public | 10 req/min (IP) | Missing | Creates account, sends 6-digit email code |
| 4 | `/api/auth/verify-email` | `POST` | `AuthHandler.VerifyEmail` | **UPDATE** (`users`), **DELETE** (`email_verifications`) | Public | 10 req/min (IP) | Missing | Verifies 6-digit code, sets auth cookie |
| 5 | `/api/auth/resend-verification` | `POST` | `AuthHandler.ResendVerification` | **INSERT** (`email_verifications`) | Public | 10 req/min (IP) + 60s cooldown | Missing | Resends 6-digit code via email |
| 6 | `/api/auth/forgot-password` | `POST` | `AuthHandler.ForgotPassword` | **INSERT** (`password_resets`) | Public | 10 req/min (IP) + 60s cooldown | Missing | Sends 32-byte password reset token |
| 7 | `/api/auth/verify-reset-token` | `POST` | `AuthHandler.VerifyResetToken` | None (Read) | Public | 10 req/min (IP) | Missing | Checks if reset token is valid & if 2FA needed |
| 8 | `/api/auth/reset-password` | `POST` | `AuthHandler.ResetPassword` | **UPDATE** (`users`, `password_resets`) | Public | 10 req/min (IP) | Missing | Validates 2FA/backup code if enabled, updates password |
| 9 | `/api/auth/login` | `POST` | `AuthHandler.Login` | In-memory 2FA lock, **UPDATE** (`user_2fa_backup_codes`) | Public | 10 req/min (IP) + 5 2FA lock | Missing | Sets HttpOnly `token` cookie & returns JWT |
| 10 | `/api/auth/logout` | `POST` | `AuthHandler.Logout` | Cookie clear | Public | 10 req/min (IP) | Missing | Clears HttpOnly `token` cookie |
| 11 | `/api/invites/{code}` | `GET` | `InviteHandler.GetInvite` | None (Read) | Public | 30 req/min (IP) | N/A | In-memory 60s cached invite preview |
| 12 | `/api/link-preview` | `GET` | `LinkPreviewHandler.GetMetadata` | None (Read) | Public | 20 req/min (IP) | N/A | SSRF-safe OpenGraph fetcher, 2h cache |
| 13 | `/assets/user/*` | `GET` | FileServer | None (Read) | Public | None | N/A | Serves user assets; `att_` uses attachment disposition |
| 14 | `/assets/guild/*` | `GET` | FileServer | None (Read) | Public | None | N/A | Serves guild icons and banners |
| 15 | `/downloads/*` | `GET` | FileServer | None (Read) | Public | None | N/A | Serves desktop installers |
| 16 | `/*` | `GET` | FileServer / SPA | None (Read) | Public | None | N/A | SPA fallback with SSR OpenGraph tags for invites |

### 1.2 Protected Endpoints (Auth Middleware: Cookie / Bearer)

#### Authentication & User Profile Management
| # | Route | Method | Handler | Mutation Type | Rate Limit | CSRF Status | Notes |
|---|-------|--------|---------|---------------|------------|-------------|-------|
| 17 | `/api/auth/me` | `GET` | `AuthHandler.Me` | None (Read) | None | N/A | Returns current user profile |
| 18 | `/api/auth/export-data` | `GET` | `AuthHandler.ExportData` | None (Read) | 1 req / 10 min | N/A | LGPD/GDPR profile, guilds & friends dump |
| 19 | `/api/auth/delete-account` | `POST` | `AuthHandler.DeleteAccount` | **DELETE** (`users`) | 5 req / 5 min | Missing | Requires password + 2FA confirmation |
| 20 | `/api/auth/2fa/generate` | `POST` | `AuthHandler.Generate2FA` | None (Read/Generate) | 5 req / 5 min | Missing | Returns TOTP secret & otpauth URI |
| 21 | `/api/auth/2fa/enable` | `POST` | `AuthHandler.Enable2FA` | **UPDATE** (`users`), **INSERT** (`backup_codes`) | 5 req / 5 min | Missing | Verifies code, saves secret & 8 backup codes |
| 22 | `/api/auth/2fa/disable` | `POST` | `AuthHandler.Disable2FA` | **UPDATE** (`users`), **DELETE** (`backup_codes`) | 5 req / 5 min | Missing | Requires password + 2FA/backup code |
| 23 | `/api/auth/change-password` | `POST` | `AuthHandler.ChangePassword` | **UPDATE** (`users`) | 5 req / 5 min | Missing | Validates current password + 2FA |
| 24 | `/api/auth/change-email` | `POST` | `AuthHandler.ChangeEmail` | **UPDATE** (`users`), **INSERT** (`verifications`) | 5 req / 5 min | Missing | Sends notice to old & code to new email |
| 25 | `/api/auth/change-phone` | `POST` | `AuthHandler.ChangePhone` | **UPDATE** (`users`) | 5 req / 5 min | Missing | Validates password + 2FA |
| 26 | `/api/users/@me` | `PATCH` | `UserHandler.UpdateProfile` | **UPDATE** (`users`) | 10 req / min | Missing | Updates profile, status, activities, folders |
| 27 | `/api/users/me/blocks` | `GET` | `UserHandler.ListBlockedUsers` | None (Read) | None | N/A | Lists blocked users |
| 28 | `/api/users/{id}/block` | `POST` | `UserHandler.BlockUser` | **INSERT** (`user_blocks`), **DELETE** (`friendships`) | None | Missing | Blocks user and removes friendship |
| 29 | `/api/users/{id}/block` | `DELETE` | `UserHandler.UnblockUser` | **DELETE** (`user_blocks`) | None | Missing | Unblocks user |
| 30 | `/api/users/me/favorite-gifs` | `GET` | `UserHandler.GetFavoriteGIFs` | None (Read) | None | N/A | Lists favorite GIFs |
| 31 | `/api/users/me/favorite-gifs` | `POST` | `UserHandler.AddFavoriteGIF` | **INSERT** (`user_favorite_gifs`) | None | Missing | Upserts favorite GIF |
| 32 | `/api/users/me/favorite-gifs` | `DELETE` | `UserHandler.RemoveFavoriteGIF` | **DELETE** (`user_favorite_gifs`) | None | Missing | Deletes favorite GIF |

#### Guild Management & Moderation
| # | Route | Method | Handler | Mutation Type | Rate Limit | CSRF Status | Notes |
|---|-------|--------|---------|---------------|------------|-------------|-------|
| 33 | `/api/guilds` | `GET` | `GuildHandler.List` | None (Read) | None | N/A | Lists servers joined by user |
| 34 | `/api/guilds` | `POST` | `GuildHandler.Create` | **INSERT** (`guilds`, `members`, `roles`, `channels`) | 5 req / hour | Missing | Transactional creation of guild |
| 35 | `/api/guilds/{id}` | `GET` | `GuildHandler.GetDetails` | None (Read) | None | N/A | Membership check, batch loads metadata |
| 36 | `/api/guilds/{id}` | `PATCH` | `GuildHandler.Update` | **UPDATE** (`guilds`) | None | Missing | PermManageGuild or Admin required |
| 37 | `/api/guilds/{id}` | `DELETE` | `GuildHandler.Delete` | **DELETE** (`guilds`) | None | Missing | Owner only; 2FA check enforced |
| 38 | `/api/guilds/{id}/leave` | `POST` | `GuildHandler.Leave` | **DELETE** (`guild_members`) | None | Missing | Non-owner member departure |
| 39 | `/api/guilds/{id}/mute` | `POST` | `GuildHandler.ToggleMute` | **UPDATE** (`guild_members.is_muted`) | None | Missing | Toggles server notification mute |
| 40 | `/api/guilds/{id}/invites` | `GET` | `InviteHandler.ListGuildInvites` | None (Read) | None | N/A | PermManageGuild or PermCreateInstantInvite |
| 41 | `/api/guilds/{id}/invites` | `POST` | `InviteHandler.CreateInvite` | **INSERT** (`guild_invites`) | None | Missing | Generates 10-char invite code |
| 42 | `/api/guilds/{id}/invites/{code}` | `DELETE` | `InviteHandler.DeleteInvite` | **DELETE** (`guild_invites`) | None | Missing | Revokes invite |
| 43 | `/api/guilds/{id}/transfer-ownership` | `POST` | `GuildHandler.TransferOwnership` | **UPDATE** (`guilds.owner_id`, `guild_members`) | None | Missing | Owner transfer; logs to audit log |
| 44 | `/api/guilds/{id}/emojis` | `GET` | `GuildHandler.ListEmojis` | None (Read) | None | N/A | Lists custom emojis |
| 45 | `/api/guilds/{id}/emojis` | `POST` | `GuildHandler.CreateEmoji` | **INSERT** (`guild_emojis`) | 10 req / min | Missing | Adds custom emoji |
| 46 | `/api/guilds/{id}/emojis/{emojiID}` | `PATCH` | `GuildHandler.UpdateEmoji` | **UPDATE** (`guild_emojis`) | 10 req / min | Missing | Renames emoji |
| 47 | `/api/guilds/{id}/emojis/{emojiID}` | `DELETE` | `GuildHandler.DeleteEmoji` | **DELETE** (`guild_emojis`) | 10 req / min | Missing | Deletes emoji |
| 48 | `/api/guilds/{id}/audit-logs` | `GET` | `GuildHandler.ListAuditLogs` | None (Read) | None | N/A | Admin/PermManageGuild required |
| 49 | `/api/guilds/{guildID}/read-states` | `GET` | `MessageHandler.GetGuildReadStates` | None (Read) | None | N/A | Unread message counts per channel |
| 50 | `/api/guilds/{guildID}/messages/search` | `GET` | `MessageHandler.Search` | None (Read) | 10 req / min | N/A | Full-text search across guild channels |
| 51 | `/api/guilds/{id}/members/{userID}/kick` | `POST` | `GuildHandler.KickMember` | **DELETE** (`guild_members`, `roles`, `voice`) | None | Missing | Hierarchy check, audit log |
| 52 | `/api/guilds/{id}/bans` | `POST` | `GuildHandler.BanMember` | **INSERT** (`guild_bans`), **DELETE** (`members`) | None | Missing | Hierarchy check, audit log |
| 53 | `/api/guilds/{id}/bans/{userID}` | `DELETE` | `GuildHandler.UnbanMember` | **DELETE** (`guild_bans`) | None | Missing | PermBanMembers required |
| 54 | `/api/guilds/{id}/members/{userID}/mute` | `POST` | `GuildHandler.MuteMember` | **UPDATE** (`guild_members.muted_until`) | None | Missing | Timed or permanent mute |
| 55 | `/api/invites/{code}/join` | `POST` | `InviteHandler.JoinByInvite` | **INSERT** (`guild_members`), **UPDATE** (`invites.uses`) | 10 req / min | Missing | Enforces ban check & assigns @everyone |

#### Channels & Overwrites
| # | Route | Method | Handler | Mutation Type | Rate Limit | CSRF Status | Notes |
|---|-------|--------|---------|---------------|------------|-------------|-------|
| 56 | `/api/guilds/{guildID}/channels` | `POST` | `ChannelHandler.Create` | **INSERT** (`channels`, `channel_role_access`) | None | Missing | PermManageChannels required |
| 57 | `/api/channels/{id}` | `PATCH` | `ChannelHandler.Update` | **UPDATE** (`channels`, `overwrites`) | None | Missing | Topic, position, category, privacy |
| 58 | `/api/channels/{id}` | `DELETE` | `ChannelHandler.Delete` | **DELETE** (`channels`) | None | Missing | Deletes channel, reparents categories |
| 59 | `/api/channels/{id}/permissions/{roleID}` | `PUT` | `ChannelHandler.UpdatePermissionOverwrite` | **INSERT/UPDATE** (`channel_permission_overwrites`) | None | Missing | Sets allow/deny bitmask per role |
| 60 | `/api/channels/{id}/permissions/{roleID}` | `DELETE` | `ChannelHandler.DeletePermissionOverwrite` | **DELETE** (`channel_permission_overwrites`) | None | Missing | Removes overwrite |
| 61 | `/api/guilds/{guildID}/channels/positions` | `PUT` | `ChannelHandler.Reorder` | **UPDATE** (`channels.position`, `category_id`) | None | Missing | Granular or batch list reorder |
| 62 | `/api/channels/{channelID}/messages/search` | `GET` | `MessageHandler.Search` | None (Read) | 10 req / min | N/A | Channel-scoped full-text search |
| 63 | `/api/channels/{channelID}/ack` | `POST` | `MessageHandler.AckChannel` | **INSERT/UPDATE** (`channel_read_states`) | None | Missing | Updates last read message ID |

#### Roles
| # | Route | Method | Handler | Mutation Type | Rate Limit | CSRF Status | Notes |
|---|-------|--------|---------|---------------|------------|-------------|-------|
| 64 | `/api/guilds/{guildID}/roles` | `GET` | `RoleHandler.List` | None (Read) | None | N/A | Lists roles ordered by position ASC |
| 65 | `/api/guilds/{guildID}/roles` | `POST` | `RoleHandler.Create` | **INSERT** (`guild_roles`) | None | Missing | PermManageRoles required |
| 66 | `/api/guilds/{guildID}/roles/{roleID}` | `PATCH` | `RoleHandler.Update` | **UPDATE** (`guild_roles`) | None | Missing | Hierarchy check on position & perms |
| 67 | `/api/guilds/{guildID}/roles/positions` | `PUT` | `RoleHandler.Reorder` | **UPDATE** (`guild_roles.position`) | None | Missing | Hierarchy check |
| 68 | `/api/guilds/{guildID}/roles/{roleID}` | `DELETE` | `RoleHandler.Delete` | **DELETE** (`guild_roles`) | None | Missing | Cannot delete `@everyone` |
| 69 | `/api/guilds/{guildID}/members/{userID}/roles/{roleID}` | `POST` | `RoleHandler.AssignRole` | **INSERT** (`guild_member_roles`) | None | Missing | Hierarchy check |
| 70 | `/api/guilds/{guildID}/members/{userID}/roles/{roleID}` | `DELETE` | `RoleHandler.RemoveRole` | **DELETE** (`guild_member_roles`) | None | Missing | Cannot remove `@everyone` |

#### Friends & Direct Messages (1x1)
| # | Route | Method | Handler | Mutation Type | Rate Limit | CSRF Status | Notes |
|---|-------|--------|---------|---------------|------------|-------------|-------|
| 71 | `/api/friends` | `GET` | `FriendHandler.ListFriends` | None (Read) | None | N/A | Returns friends, pending, incoming |
| 72 | `/api/friends/request` | `POST` | `FriendHandler.SendRequest` | **INSERT/UPDATE** (`friendships`) | 5 req / min | Missing | Auto-accepts if reverse request exists |
| 73 | `/api/friends/{id}/accept` | `POST` | `FriendHandler.AcceptRequest` | **UPDATE** (`friendships.status`) | None | Missing | Marks friendship accepted |
| 74 | `/api/friends/{id}/reject` | `POST` | `FriendHandler.RemoveFriend` | **DELETE** (`friendships`) | None | Missing | Removes friendship / rejects request |
| 75 | `/api/dms` | `GET` | `DMHandler.ListRooms` | None (Read) | None | N/A | Lists 1x1 conversation rooms |
| 76 | `/api/dms` | `POST` | `DMHandler.CreateOrGetRoom` | **INSERT** (`dm_rooms`) | None | Missing | Idempotent room creation |
| 77 | `/api/dms/{roomID}/messages` | `GET` | `DMHandler.ListMessages` | None (Read) | None | N/A | Paginated by `before` and `limit` |
| 78 | `/api/dms/{roomID}/pins` | `GET` | `DMHandler.ListPinned` | None (Read) | None | N/A | Lists pinned DM messages |
| 79 | `/api/dms/{roomID}/messages` | `POST` | `DMHandler.SendMessage` | **INSERT** (`dm_messages`) | 10 burst, 5/s | Missing | Enforces block check & max 2000 chars |
| 80 | `/api/dms/{roomID}/messages/{messageID}` | `PATCH` | `DMHandler.UpdateMessage` | **UPDATE** (`dm_messages`) | None | Missing | Author only |
| 81 | `/api/dms/{roomID}/messages/{messageID}` | `DELETE` | `DMHandler.DeleteMessage` | **DELETE** (`dm_messages`, `reactions`) | None | Missing | Author only |
| 82 | `/api/dms/{roomID}/messages/{messageID}/reactions` | `POST` | `DMHandler.AddReaction` | **INSERT** (`message_reactions`) | 30 req / min | Missing | Adds emoji reaction |
| 83 | `/api/dms/{roomID}/messages/{messageID}/reactions/{emoji}` | `DELETE` | `DMHandler.RemoveReaction` | **DELETE** (`message_reactions`) | 30 req / min | Missing | Removes emoji reaction |
| 84 | `/api/dms/{roomID}/messages/{messageID}/pin` | `POST` | `DMHandler.TogglePin` | **UPDATE** (`dm_messages.is_pinned`) | 10 req / min | Missing | Toggles pin |
| 85 | `/api/dms/{roomID}/call/invite` & `/api/dm/rooms/{roomID}/call/invite` | `POST` | `DMHandler.InviteCall` | State notification (WS) | 6 req / min | Missing | Triggers incoming call overlay |
| 86 | `/api/dms/{roomID}/call/accept` & `/api/dm/rooms/{roomID}/call/accept` | `POST` | `DMHandler.AcceptCall` | LiveKit token generation | None | Missing | Returns LiveKit tokens to both sides |
| 87 | `/api/dms/{roomID}/call/reject` & `/api/dm/rooms/{roomID}/call/reject` | `POST` | `DMHandler.RejectCall` | State notification (WS) | None | Missing | Cancels incoming call |
| 88 | `/api/dms/{roomID}/call/leave` & `/api/dm/rooms/{roomID}/call/leave` | `POST` | `DMHandler.LeaveCall` | State notification (WS) | None | Missing | Ends 1x1 call |

#### DM Groups (Up to 15 Members)
| # | Route | Method | Handler | Mutation Type | Rate Limit | CSRF Status | Notes |
|---|-------|--------|---------|---------------|------------|-------------|-------|
| 89 | `/api/dm/groups` | `GET` | `DMGroupHandler.ListGroups` | None (Read) | None | N/A | Lists joined groups |
| 90 | `/api/dm/groups` | `POST` | `DMGroupHandler.CreateGroup` | **INSERT** (`dm_groups`, `members`) | 3 req / min | Missing | Validates 2..15 members & blocks |
| 91 | `/api/dm/groups/{id}` | `GET` | `DMGroupHandler.GetGroup` | None (Read) | None | N/A | Returns group details & members |
| 92 | `/api/dm/groups/{id}` | `PATCH` | `DMGroupHandler.UpdateGroup` | **UPDATE** (`dm_groups`) | None | Missing | Name and icon update |
| 93 | `/api/dm/groups/{id}/members` | `POST` | `DMGroupHandler.AddMembers` | **INSERT** (`dm_group_members`) | None | Missing | Enforces 15 member cap |
| 94 | `/api/dm/groups/{id}/members/{userID}` | `DELETE` | `DMGroupHandler.RemoveMember` | **DELETE** (`dm_group_members`) | None | Missing | Self-leave or owner kick; reparents |
| 95 | `/api/dm/groups/{id}/messages` | `GET` | `DMGroupHandler.ListMessages` | None (Read) | None | N/A | Paginated messages |
| 96 | `/api/dm/groups/{id}/messages` | `POST` | `DMGroupHandler.SendMessage` | **INSERT** (`dm_group_messages`) | 10 burst, 5/s | Missing | Max 2000 chars |
| 97 | `/api/dm/groups/{id}/messages/{messageID}` | `PATCH` | `DMGroupHandler.UpdateMessage` | **UPDATE** (`dm_group_messages`) | None | Missing | Author only |
| 98 | `/api/dm/groups/{id}/messages/{messageID}` | `DELETE` | `DMGroupHandler.DeleteMessage` | **DELETE** (`dm_group_messages`) | None | Missing | Author or owner |
| 99 | `/api/dm/groups/{id}/voice-token` | `POST` | `DMGroupHandler.JoinVoice` | LiveKit token generation | 15 req / min | Missing | Returns LiveKit voice token |

#### Channel Messages & Voice
| # | Route | Method | Handler | Mutation Type | Rate Limit | CSRF Status | Notes |
|---|-------|--------|---------|---------------|------------|-------------|-------|
| 100 | `/api/channels/{channelID}/messages` | `GET` | `MessageHandler.List` | None (Read) | None | N/A | Channel message history |
| 101 | `/api/channels/{channelID}/pins` | `GET` | `MessageHandler.ListPinned` | None (Read) | None | N/A | Channel pinned messages |
| 102 | `/api/channels/{channelID}/messages` | `POST` | `MessageHandler.Send` | **INSERT** (`messages`) | 10 burst, 5/s | Missing | PermSendMessages & membership check |
| 103 | `/api/channels/{channelID}/messages/{messageID}` | `PATCH` | `MessageHandler.Update` | **UPDATE** (`messages`) | None | Missing | Author only |
| 104 | `/api/channels/{channelID}/messages/{messageID}` | `DELETE` | `MessageHandler.Delete` | **DELETE** (`messages`) | None | Missing | Author or Admin/PermManageMessages |
| 105 | `/api/channels/{channelID}/messages/{messageID}/reactions` | `POST` | `MessageHandler.AddReaction` | **INSERT** (`message_reactions`) | 30 req / min | Missing | Adds reaction |
| 106 | `/api/channels/{channelID}/messages/{messageID}/reactions/{emoji}` | `DELETE` | `MessageHandler.RemoveReaction` | **DELETE** (`message_reactions`) | 30 req / min | Missing | Removes reaction |
| 107 | `/api/channels/{channelID}/messages/{messageID}/pin` | `POST` | `MessageHandler.TogglePin` | **UPDATE** (`messages.is_pinned`) | 10 req / min | Missing | Admin or PermManageMessages |
| 108 | `/api/channels/{id}/join-voice` | `POST` | `ChannelHandler.JoinVoice` | **INSERT/UPDATE** (`voice_sessions`) | 15 req / min | Missing | WebRTC/LiveKit voice connect |
| 109 | `/api/channels/{id}/leave-voice` | `POST` | `ChannelHandler.LeaveVoice` | **DELETE** (`voice_sessions`) | None | Missing | WebRTC voice disconnect |
| 110 | `/api/channels/{id}/voice-state` | `POST` | `ChannelHandler.UpdateVoiceState` | **UPDATE** (`voice_sessions`) | None | Missing | Self mute, deafen, screenshare |
| 111 | `/api/channels/{channelID}/members/{userID}/voice-state` | `POST` | `ChannelHandler.AdminUpdateVoiceState` | **UPDATE/DELETE** (`voice_sessions`) | None | Missing | Admin server-mute/deafen/disconnect |

#### Media Uploads
| # | Route | Method | Handler | Mutation Type | Rate Limit | CSRF Status | Notes |
|---|-------|--------|---------|---------------|------------|-------------|-------|
| 112 | `/api/upload/avatar` | `POST` | `UploadHandler.UploadAvatar` | File write | 15 req / min | Missing | Max 20MB, JPG/PNG/WEBP/GIF only |
| 113 | `/api/upload/guild-icon` | `POST` | `UploadHandler.UploadGuildIcon` | File write | 15 req / min | Missing | Max 20MB, image only |
| 114 | `/api/upload/guild-banner` | `POST` | `UploadHandler.UploadGuildBanner` | File write | 15 req / min | Missing | Max 20MB, image only |
| 115 | `/api/upload/banner` | `POST` | `UploadHandler.UploadBanner` | File write | 15 req / min | Missing | Max 20MB, image only |
| 116 | `/api/upload/attachment` | `POST` | `UploadHandler.UploadAttachment` | File write | 15 req / min | Missing | Max 20MB, dangerous extensions blocked |

#### Real-time Gateway
| # | Route | Method | Handler | Mutation Type | Rate Limit | CSRF Status | Notes |
|---|-------|--------|---------|---------------|------------|-------------|-------|
| 117 | `/ws` | `GET` | `gateway.ServeWs` | Connection / Status | None | N/A | Upgrades HTTP to WebSocket |

---

## 2. Security Audit & Vulnerability Analysis

### 2.1 CSRF Protection Status: Critical Finding
- **Current State:** The backend does **not** generate CSRF tokens or validate incoming CSRF tokens on any mutation endpoint. In `backend/cmd/server/main.go` line 184, `X-CSRF-Token` is merely whitelisted in `cors.Options.AllowedHeaders`.
- **Vulnerability:** Web browser clients use `credentials: 'include'`, storing the JWT in an HttpOnly cookie named `token` with `SameSite: Lax`. While `SameSite: Lax` blocks third-party cross-site subrequests (e.g. `<img>` or background `fetch`), top-level navigations and some cross-origin scenarios can bypass it if cookies are relied upon without explicit token verification.
- **Mandatory Requirement (Project Rule):**
  - All state mutation actions (INSERT, UPDATE, DELETE, Toggle) must require a valid CSRF token.
  - The token comparison must be constant-time (`subtle.ConstantTimeCompare([]byte(expected), []byte(actual)) == 1`).
  - Missing or invalid tokens must immediately terminate the request with HTTP `403 Forbidden` or `405 Method Not Allowed`, executing no database queries.
  - The client must include the CSRF token in an `X-CSRF-Token` request header (or form body).
  - Implementation strategy: On login / session check (`/api/auth/me`), provide a CSRF token in a non-HttpOnly cookie (e.g., `csrf_token`) or in the response payload. The client attaches this token to the `X-CSRF-Token` header on all mutation requests. The backend CSRF middleware verifies that the header value matches the signed/HMAC session token in constant time.

### 2.2 Rate Limiting Coverage & Gaps
The backend combines IP-based limiter `httprate` and an in-memory `UserRateLimiter` (token bucket):
- **Covered endpoints:**
  - `/api/auth/*` (10/min/IP)
  - `/api/invites/{code}` (30/min/IP)
  - `/api/link-preview` (20/min/IP)
  - Messages sending (10 burst, 5/s/user)
  - Guild creation (5/hour/user)
  - Uploads (15/min/user)
  - Sensitive auth actions (5/5min/user)
  - Join server (10/min/user)
  - Voice connect (15/min/user)
  - Reactions & Pins (30/min & 10/min)
- **Critical Unprotected Endpoints (Gaps):**
  1. **Login Brute-Force Vulnerability:** `/api/auth/login` is limited only by IP (10 req/min for the entire subnet). A distributed botnet can brute-force passwords without hitting the 10/min IP limit. *Recommendation:* Add per-account/username rate limiting.
  2. **Moderation Flood:** `/api/guilds/{id}/members/{userID}/kick`, `/bans`, `/bans/{userID}`, and `/mute` have NO rate limit. A compromised moderator account or malicious actor with kick/ban permissions can dump hundreds of bans in seconds.
  3. **Channel & Role Spammers:** `POST /api/guilds/{guildID}/channels` and `POST /api/guilds/{guildID}/roles` have no rate limit, allowing malicious admins to create thousands of channels/roles and DOS the database.
  4. **Message Edit & Delete Spammers:** While message sending is throttled to 5/s, `PATCH` and `DELETE` on messages (channels, DMs, DM groups) have no limiter.
  5. **Channel Read Receipt (`/ack`) Flood:** `POST /api/channels/{channelID}/ack` performs an upsert on `channel_read_states` and pushes a WebSocket event with zero rate limiting.
  6. **LiveKit Token Generation on Call Join:** `POST /api/channels/{id}/leave-voice` and `POST /api/channels/{id}/voice-state` have no rate limits.

### 2.3 SSRF & External Network Calls
- In `backend/internal/handlers/link_preview_handlers.go`, SSRF protection is well implemented:
  - Custom `http.Transport` pre-resolves hostnames before connecting.
  - Validates all resolved IPs against `isDisallowedIP`: blocks IPv4 loopback (`127.0.0.0/8`), RFC 1918 private subnets (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), Cloud Metadata (`169.254.169.254`), IPv6 unique local, and link-local.
  - Connects directly to the validated IP to prevent DNS rebinding attacks.
  - Enforces `MaxRedirects: 5` with host validation on each redirect.
  - Limits read size to 256 KB (`io.LimitReader`).
- External Email Service (`backend/internal/email/email.go`):
  - Uses `https://api.resend.com/emails`.
  - Go's `http.Client` default transport verifies TLS/SSL certificates (`InsecureSkipVerify: false`). No disabled TLS verification found.

---

## 3. Database Architecture & PostgreSQL Optimization Analysis

### 3.1 Connection Pool Settings
Configured in `backend/internal/database/db.go`:
```go
config.MaxConns = 25
config.MinConns = 5
config.MaxConnLifetime = 1 * time.Hour
config.MaxConnIdleTime = 15 * time.Minute
```
- Fits a 1 vCore / 2GB RAM container.
- Healthcheck ping timeout: 2 seconds.

### 3.2 Transaction Integrity Audit
- **Transactions Used Correctly:**
  - `GuildHandler.Create`: Guild + owner membership + `@everyone` role + role assignment + `#geral` text + `Geral` voice channel.
  - `AuthHandler.Enable2FA`: Secret update + backup codes clearing + 8 backup code inserts.
  - `UserHandler.BlockUser`: Insert `user_blocks` + delete reciprocal `friendships`.
  - `GuildHandler.TransferOwnership`: Update guild owner + update member roles.
- **Transactions Missing (Integrity Risks):**
  - `GuildHandler.BanMember`:
    ```sql
    INSERT INTO guild_bans ...
    DELETE FROM guild_member_roles ...
    DELETE FROM voice_sessions ...
    DELETE FROM guild_members ...
    ```
    Executed as 4 discrete pool statements. If the network or process dies midway, the banned member may retain roles or stay in voice sessions. *Recommendation: Wrap in `tx.Begin(ctx)`.*
  - `GuildHandler.KickMember`:
    Executed as 3 discrete `DELETE` statements (`guild_member_roles`, `voice_sessions`, `guild_members`). *Recommendation: Wrap in `tx.Begin(ctx)`.*
  - `InviteHandler.JoinByInvite`:
    Executed as 3 separate statements (`INSERT guild_members`, `INSERT guild_member_roles`, `UPDATE guild_invites.uses`). *Recommendation: Wrap in `tx.Begin(ctx)`.*
  - `ChannelHandler.Delete`:
    When deleting a category, sets child channels `category_id = NULL` in one query, then deletes category channel in a second query. *Recommendation: Wrap in transaction.*

### 3.3 Full-Text Search
- Portuguese language dictionary configuration:
  ```sql
  ALTER TABLE messages ADD COLUMN IF NOT EXISTS search_vector tsvector
    GENERATED ALWAYS AS (to_tsvector('portuguese', coalesce(content, ''))) STORED;
  CREATE INDEX IF NOT EXISTS idx_messages_search_vector ON messages USING gin(search_vector);
  ```
- Fast search query uses both GIN index and ILIKE fallback:
  ```sql
  WHERE (m.search_vector @@ plainto_tsquery('portuguese', $2) OR m.content ILIKE '%' || $2 || '%')
  ```

### 3.4 Missing Indexes Identified
1. `dm_messages (reply_to_id)`: Missing index. When searching replies or cascading deletes, a table scan is triggered.
2. `dm_group_messages (reply_to_id)`: Missing index.
3. `channel_read_states (channel_id)`: Primary key is `(user_id, channel_id)`. Querying read states by `channel_id` (e.g. channel purge or channel stats) lacks a leading index.

---

## 4. WebSocket (`WS_EVENT`) Specification & JSON Contract Inventory

ZeroVC uses a bidirectional WebSocket protocol running at `/ws`.
The message envelope format is strictly:
```json
{
  "type": "EVENT_NAME",
  "data": { ... }
}
```

### 4.1 Complete Inventory of WebSocket Events

| Event Name (`type`) | Trigger / Origin | Recipient Scope | Payload Schema (`data`) |
|---------------------|------------------|-----------------|-------------------------|
| `READY` | Connection established | Connecting client | Initial connection handshake payload |
| `MESSAGE_CREATE` | Channel message posted | Guild members with channel access | `Message` object (see Schema below) |
| `MESSAGE_UPDATE` | Channel message edited | Guild members with channel access | `{"id": UUID, "channel_id": UUID, "content": string, "is_edited": true, "edited_at": ISO8601}` |
| `MESSAGE_DELETE` | Channel message deleted | Guild members with channel access | `{"id": UUID, "channel_id": UUID}` |
| `MESSAGE_REACTION_ADD` | Reaction added to message | Guild members with channel access | `{"message_id": UUID, "channel_id": UUID, "user_id": UUID, "emoji": string}` |
| `MESSAGE_REACTION_REMOVE`| Reaction removed | Guild members with channel access | `{"message_id": UUID, "channel_id": UUID, "user_id": UUID, "emoji": string}` |
| `MESSAGE_PIN` | Message pinned | Guild members with channel access | `{"message_id": UUID, "channel_id": UUID, "user_id": UUID, "is_pinned": true}` |
| `MESSAGE_UNPIN` | Message unpinned | Guild members with channel access | `{"message_id": UUID, "channel_id": UUID, "user_id": UUID, "is_pinned": false}` |
| `TYPING_START` | User typing in channel | Guild members in guild | `{"channel_id": UUID, "user_id": UUID}` |
| `PRESENCE_UPDATE` | User status changed | Subscribed users / Global | `{"user_id": UUID, "status": "online"\|"idle"\|"dnd"\|"offline"}` |
| `VOICE_STATE_UPDATE` | User joins/leaves/updates voice | Guild members in guild | `{"action": "join"\|"update"\|"leave", "session"?: VoiceSession, "channel_id"?: UUID, "user_id"?: UUID, "forced"?: bool}` |
| `GUILD_CREATE` | Guild created | Creator (or invitees) | `Guild` object |
| `GUILD_UPDATE` | Guild settings edited | Guild members in guild | `Guild` object OR `{"id": UUID, "owner_id": UUID}` |
| `GUILD_DELETE` | Guild deleted or member left | Guild members / leaving user | `{"guild_id": UUID}` |
| `GUILD_MEMBER_ADD` | New member joins server | Guild members in guild | `{"guild_id": UUID, "member": UserPublic}` |
| `GUILD_MEMBER_REMOVE` | Member kicked or leaves | Guild members in guild | `{"guild_id": UUID, "user_id": UUID}` |
| `GUILD_BAN_ADD` | Member banned | Guild members in guild | `{"guild_id": UUID, "user_id": UUID, "reason": string}` |
| `GUILD_BAN_REMOVE` | Member unbanned | Guild members in guild | `{"guild_id": UUID, "user_id": UUID}` |
| `GUILD_MEMBER_UPDATE` | Member muted or roles changed | Guild members in guild | `{"guild_id": UUID, "user_id": UUID, "muted_until"?: string\|null, "roles"?: Role[]}` |
| `GUILD_ROLES_REORDER` | Roles order changed | Guild members in guild | `{"guild_id": UUID, "roles": Role[]}` |
| `GUILD_EMOJI_CREATE` | Custom emoji uploaded | Guild members in guild | `GuildEmoji` object |
| `GUILD_EMOJI_UPDATE` | Custom emoji renamed | Guild members in guild | `GuildEmoji` object |
| `GUILD_EMOJI_DELETE` | Custom emoji deleted | Guild members in guild | `{"guild_id": UUID, "id": UUID}` |
| `CHANNEL_CREATE` | Channel/Category created | Guild members with channel access | `Channel` object |
| `CHANNEL_UPDATE` | Channel updated | Guild members with channel access | `Channel` object |
| `CHANNEL_DELETE` | Channel deleted | Guild members with channel access | `{"id": UUID, "guild_id": UUID}` |
| `CHANNEL_ACK` | Channel read acked | Calling user only | `{"channel_id": UUID, "last_read_message_id": UUID\|null}` |
| `ROLE_CREATE` | Role created in server | Guild members in guild | `Role` object |
| `ROLE_UPDATE` | Role updated in server | Guild members in guild | `Role` object |
| `ROLE_DELETE` | Role deleted in server | Guild members in guild | `{"id": UUID, "guild_id": UUID}` |
| `USER_UPDATE` | User profile or status updated | Global broadcast | `UserPublic` object OR `{"id": UUID, "status": string}` |
| `CALL_INCOMING` | 1x1 call initiated | Call recipient | `{"room_id": UUID, "caller": UserPublic, "call_type": "dm"}` |
| `CALL_ACCEPT` | 1x1 call accepted | Caller and Acceptor | `{"room_id": UUID, "room_name": string, "token": string, "livekit_url": string}` |
| `CALL_REJECT` | 1x1 call rejected | Other call participant | `{"room_id": UUID, "user_id": UUID}` |
| `CALL_LEAVE` | 1x1 call left | Other call participant | `{"room_id": UUID, "user_id": UUID}` |
| `DM_MESSAGE_CREATE` | 1x1 DM message sent | Both room participants | `DMMessage` object |
| `DM_MESSAGE_UPDATE` | 1x1 DM message edited | Both room participants | `DMMessage` object |
| `DM_MESSAGE_DELETE` | 1x1 DM message deleted | Both room participants | `{"id": UUID, "message_id": UUID, "room_id": UUID, "dm_room_id": UUID}` |
| `DM_REACTION_ADD` | Reaction added to DM | Both room participants | `{"message_id": UUID, "dm_room_id": UUID, "user_id": UUID, "emoji": string}` |
| `DM_REACTION_REMOVE` | Reaction removed from DM | Both room participants | `{"message_id": UUID, "dm_room_id": UUID, "user_id": UUID, "emoji": string}` |
| `GROUP_MESSAGE_CREATE`| DM Group message sent | All members in group | `DMGroupMessage` object |
| `GROUP_MESSAGE_UPDATE`| DM Group message edited | All members in group | `DMGroupMessage` object |
| `GROUP_MESSAGE_DELETE`| DM Group message deleted | All members in group | `{"id": UUID, "message_id": UUID, "group_id": UUID}` |
| `FRIEND_REQUEST_CREATE`| Friend request sent | Request recipient | `Friendship` object |
| `FRIEND_REQUEST_UPDATE`| Friend request accepted | Request sender | `{"id": UUID, "status": "accepted"}` |
| `AUDIT_LOG_CREATE` | Admin action logged | Guild admins and managers | `AuditLog` object |

### 4.2 Client-to-Server Inbound WebSocket Messages
- `TYPING_START`:
  ```json
  { "type": "TYPING_START", "data": { "channel_id": "UUID", "guild_id": "UUID" } }
  ```
- `PING`:
  ```json
  { "type": "PING" }
  ```
  (Server responds with `{"type":"PONG"}`)

---

## 5. Core Data Contracts (JSON Schemas)

All JSON schemas below must be preserved with **100% backward compatibility** (field naming, types, and nullability) to prevent breaking Web, Electron, and Mobile clients.

### 5.1 UserPublic Schema
```json
{
  "id": "c1f7b0f4-5f50-4cb5-8bc6-94678fa42661",
  "username": "usuario",
  "display_name": "Nome de Exibição",
  "avatar_url": "/assets/user/avatar_xxx.webp",
  "banner_url": "/assets/user/banner_xxx.webp",
  "bio": "Biografia do usuário",
  "status": "online",
  "custom_status": "Ouvindo música",
  "custom_activity": {
    "type": "listening",
    "name": "Spotify",
    "details": "Música Incrível",
    "state": "Artista Famoso",
    "start_time": 1718000000
  },
  "show_activity_status": true,
  "auto_detect_activity": true,
  "two_factor_enabled": true,
  "email_verified": true,
  "roles": []
}
```

### 5.2 Message Schema
```json
{
  "id": "a9d59218-c2a4-4f51-b851-d419a4a79c94",
  "channel_id": "936603a1-7c9d-473d-82d2-c4ad3cbf3a16",
  "author_id": "c1f7b0f4-5f50-4cb5-8bc6-94678fa42661",
  "author": { "$ref": "#/UserPublic" },
  "content": "Olá mundo!",
  "attachments": [
    {
      "url": "https://zerovc.safiroko.xyz/assets/user/att_xxx.pdf",
      "filename": "documento.pdf",
      "size": 1048576,
      "type": "application/pdf"
    }
  ],
  "reply_to_id": "b1f7b0f4-0000-0000-0000-000000000000",
  "reply_to": {
    "id": "b1f7b0f4-0000-0000-0000-000000000000",
    "author": { "$ref": "#/UserPublic" },
    "content": "Mensagem anterior"
  },
  "reactions": [
    {
      "emoji": "👍",
      "count": 2,
      "user_ids": ["c1f7b0f4-5f50-4cb5-8bc6-94678fa42661", "d2f7b0f4-1111-2222-3333-444455556666"]
    }
  ],
  "is_pinned": false,
  "is_edited": false,
  "edited_at": null,
  "created_at": "2026-09-17T17:00:00Z",
  "updated_at": "2026-09-17T17:00:00Z"
}
```

### 5.3 Channel Schema
```json
{
  "id": "936603a1-7c9d-473d-82d2-c4ad3cbf3a16",
  "guild_id": "42611e9a-4c28-44d4-9d56-7fa2c46fca0e",
  "name": "geral",
  "type": "text",
  "category_id": null,
  "topic": "Canal geral para conversas",
  "position": 0,
  "is_private": false,
  "role_ids": [],
  "permission_overwrites": [
    {
      "channel_id": "936603a1-7c9d-473d-82d2-c4ad3cbf3a16",
      "role_id": "51f7b0f4-2222-3333-4444-555566667777",
      "allow": 128,
      "deny": 0
    }
  ],
  "voice_sessions": [],
  "created_at": "2026-09-17T17:00:00Z"
}
```

### 5.4 LiveKit Join Token Response Schema
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "livekit_url": "wss://zerovc.safiroko.xyz/livekit",
  "room_name": "936603a1-7c9d-473d-82d2-c4ad3cbf3a16"
}
```

---

## 6. Cross-Platform Client Compatibility Matrix

| Client Platform | Protocol / Transport | Auth Session Storage | WS Handshake Auth | Audio / Video Pipeline | Deep Linking Support |
|-----------------|----------------------|----------------------|-------------------|------------------------|----------------------|
| **Web Browser** | HTTPS & WSS | HttpOnly Cookie `token` (`SameSite: Lax`) | Cookie transmitted automatically | LiveKit WebRTC via browser `navigator.mediaDevices` | Standard URL paths |
| **Electron Desktop** | Local `file://` or remote HTTPS | `localStorage.getItem('token')` sent via `Authorization: Bearer <token>` | Query string `?token=<token>` | LiveKit WebRTC + WASAPI C++ native process audio bridge (`zerovc-audio-capture.exe`) | `zerovc://` protocol & single instance lock |
| **Capacitor Mobile** | HTTPS (WebView scheme) | HttpOnly Cookie / `localStorage` Bearer fallback | Cookie & Bearer query fallback | LiveKit WebRTC (Android WebRTC permissions enabled in `capacitor.config.ts`) | App intent filters |

---

## 7. Concrete Action Plan for Implementation (Phase 1+)

To fulfill Requirements R3 and R4 while adhering strictly to the user-defined security directives:

1. **Implement Constant-Time CSRF Protection:**
   - Add a lightweight CSRF token generator creating a cryptographic random token per user session.
   - Deliver the CSRF token in a readable cookie (`csrf_token`) or in the response of `/api/auth/me` and `/api/auth/login`.
   - Build a Go middleware `RequireCSRF`: for all state-mutating requests (`POST`, `PATCH`, `PUT`, `DELETE`), extract the `X-CSRF-Token` header and compare against the expected session token using `subtle.ConstantTimeCompare([]byte(expected), []byte(actual)) == 1`.
   - If invalid or absent, abort immediately with HTTP 403 Forbidden without executing database queries.
2. **Close Rate Limiting Gaps:**
   - Extend `ratelimit.UserRateLimiter` to cover:
     - Moderation mutations (`kick`, `ban`, `unban`, `mute`): 10 req/min.
     - Structure mutations (`channel create/update/delete`, `role create/update/delete/assign`): 10 req/min.
     - Channel ack (`ack`): 30 req/min.
     - Message edits/deletions: 15 req/min.
   - Add per-account brute-force throttle on `/api/auth/login` (e.g., max 5 attempts per username/email per 5 minutes before locking).
3. **Wrap Multi-Statement Operations in Database Transactions:**
   - `BanMember`, `KickMember`, and `JoinByInvite` must execute within `tx.Begin(ctx)` blocks to prevent state discrepancies if a query fails midway.
4. **Preserve 100% Contract & Backward Compatibility:**
   - Maintain all 117 route paths, method signatures, JSON keys, and WebSocket event payloads verbatim.
