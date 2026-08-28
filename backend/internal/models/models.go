package models

import (
	"time"

	"github.com/google/uuid"
)

type User struct {
	ID               uuid.UUID `json:"id"`
	Username         string    `json:"username"`
	DisplayName      string    `json:"display_name"`
	Email            string    `json:"email,omitempty"`
	PasswordHash     string    `json:"-"`
	TwoFactorSecret  string    `json:"-"`
	TwoFactorEnabled bool      `json:"two_factor_enabled"`
	AvatarURL        string    `json:"avatar_url"`
	BannerURL        string    `json:"banner_url"`
	Bio              string    `json:"bio"`
	Status           string    `json:"status"` // online, idle, dnd, offline
	CustomStatus     string    `json:"custom_status"`
	CreatedAt        time.Time `json:"created_at"`
	UpdatedAt        time.Time `json:"updated_at"`
}

type UserPublic struct {
	ID               uuid.UUID `json:"id"`
	Username         string    `json:"username"`
	DisplayName      string    `json:"display_name"`
	AvatarURL        string    `json:"avatar_url"`
	BannerURL        string    `json:"banner_url"`
	Bio              string    `json:"bio"`
	Status           string    `json:"status"`
	CustomStatus     string    `json:"custom_status"`
	TwoFactorEnabled bool      `json:"two_factor_enabled"`
	Roles            []Role    `json:"roles,omitempty"`
}

func (u *User) ToPublic() UserPublic {
	return UserPublic{
		ID:               u.ID,
		Username:         u.Username,
		DisplayName:      u.DisplayName,
		AvatarURL:        u.AvatarURL,
		BannerURL:        u.BannerURL,
		Bio:              u.Bio,
		Status:           u.Status,
		CustomStatus:     u.CustomStatus,
		TwoFactorEnabled: u.TwoFactorSecret != "",
	}
}

type Role struct {
	ID          uuid.UUID `json:"id"`
	GuildID     uuid.UUID `json:"guild_id"`
	Name        string    `json:"name"`
	Color       string    `json:"color"`
	Position    int       `json:"position"`
	Permissions int64     `json:"permissions"`
	CreatedAt   time.Time `json:"created_at"`
}

type Guild struct {
	ID        uuid.UUID    `json:"id"`
	Name      string       `json:"name"`
	IconURL   string       `json:"icon_url"`
	BannerURL string       `json:"banner_url"`
	OwnerID   uuid.UUID    `json:"owner_id"`
	Channels  []Channel    `json:"channels,omitempty"`
	Members   []UserPublic `json:"members,omitempty"`
	Roles     []Role       `json:"roles,omitempty"`
	CreatedAt time.Time    `json:"created_at"`
	UpdatedAt time.Time    `json:"updated_at"`
}

type GuildMember struct {
	GuildID  uuid.UUID `json:"guild_id"`
	UserID   uuid.UUID `json:"user_id"`
	Nickname string    `json:"nickname"`
	Role     string    `json:"role"` // owner, admin, moderator, member
	JoinedAt time.Time `json:"joined_at"`
}

const (
	// Permissões Gerais
	PermAdministrator  int64 = 1 << 0  // 1: Administrador (Acesso Mestre)
	PermManageGuild    int64 = 1 << 1  // 2: Gerenciar Servidor
	PermManageRoles    int64 = 1 << 2  // 4: Gerenciar Cargos
	PermManageChannels int64 = 1 << 3  // 8: Gerenciar Canais e Categorias
	PermKickMembers    int64 = 1 << 4  // 16: Expulsar Membros
	PermBanMembers     int64 = 1 << 5  // 32: Banir Membros
	PermMuteMembers    int64 = 1 << 6  // 64: Silenciar Membros

	// Permissões de Mensagens & Chat
	PermSendMessages   int64 = 1 << 7  // 128: Enviar Mensagens
	PermManageMessages int64 = 1 << 8  // 256: Gerenciar Mensagens
	PermAttachFiles    int64 = 1 << 9  // 512: Anexar Arquivos

	// Permissões de Voz
	PermConnectVoice   int64 = 1 << 10 // 1024: Conectar em Canais de Voz
	PermSpeakVoice     int64 = 1 << 11 // 2048: Falar em Canais de Voz
	PermMuteVoice      int64 = 1 << 12 // 4096: Silenciar Membros em Voz
	PermDeafenVoice    int64 = 1 << 13 // 8192: Ensurdecer Membros em Voz
)

type ChannelType string

const (
	ChannelTypeText     ChannelType = "text"
	ChannelTypeVoice    ChannelType = "voice"
	ChannelTypeCategory ChannelType = "category"
)

type Channel struct {
	ID            uuid.UUID      `json:"id"`
	GuildID       uuid.UUID      `json:"guild_id"`
	Name          string         `json:"name"`
	Type          ChannelType    `json:"type"`
	CategoryID    *uuid.UUID     `json:"category_id,omitempty"`
	Topic         string         `json:"topic"`
	Position      int            `json:"position"`
	IsPrivate     bool           `json:"is_private"`
	RoleIDs       []uuid.UUID    `json:"role_ids,omitempty"`
	VoiceSessions []VoiceSession `json:"voice_sessions,omitempty"`
	CreatedAt     time.Time      `json:"created_at"`
}

type Attachment struct {
	URL      string `json:"url"`
	Filename string `json:"filename"`
	Size     int64  `json:"size"`
	Type     string `json:"type"`
}

type MessageReaction struct {
	Emoji   string      `json:"emoji"`
	Count   int         `json:"count"`
	UserIDs []uuid.UUID `json:"user_ids"`
}

type MessageReplyInfo struct {
	ID      uuid.UUID  `json:"id"`
	Author  UserPublic `json:"author"`
	Content string     `json:"content"`
}

type Message struct {
	ID          uuid.UUID         `json:"id"`
	ChannelID   uuid.UUID         `json:"channel_id"`
	AuthorID    uuid.UUID         `json:"author_id"`
	Author      UserPublic        `json:"author"`
	Content     string            `json:"content"`
	Attachments []Attachment      `json:"attachments"`
	ReplyToID   *uuid.UUID        `json:"reply_to_id,omitempty"`
	ReplyTo     *MessageReplyInfo `json:"reply_to,omitempty"`
	Reactions   []MessageReaction `json:"reactions,omitempty"`
	IsPinned    bool              `json:"is_pinned"`
	IsEdited    bool              `json:"is_edited"`
	EditedAt    *time.Time        `json:"edited_at,omitempty"`
	CreatedAt   time.Time         `json:"created_at"`
	UpdatedAt   time.Time         `json:"updated_at"`
}

type VoiceSession struct {
	ID              uuid.UUID  `json:"id"`
	ChannelID       uuid.UUID  `json:"channel_id"`
	UserID          uuid.UUID  `json:"user_id"`
	User            UserPublic `json:"user"`
	IsMuted         bool       `json:"is_muted"`
	IsDeafened      bool       `json:"is_deafened"`
	IsScreensharing bool       `json:"is_screensharing"`
	JoinedAt        time.Time  `json:"joined_at"`
}

type GuildInvite struct {
	Code      string      `json:"code"`
	GuildID   uuid.UUID   `json:"guild_id"`
	Guild     *Guild      `json:"guild,omitempty"`
	CreatorID uuid.UUID   `json:"creator_id"`
	Creator   *UserPublic `json:"creator,omitempty"`
	Uses      int         `json:"uses"`
	CreatedAt time.Time   `json:"created_at"`
}

type Friendship struct {
	ID        uuid.UUID  `json:"id"`
	UserID    uuid.UUID  `json:"user_id"`
	FriendID  uuid.UUID  `json:"friend_id"`
	Status    string     `json:"status"` // pending, accepted, blocked
	User      UserPublic `json:"user,omitempty"`
	Friend    UserPublic `json:"friend,omitempty"`
	CreatedAt time.Time  `json:"created_at"`
	UpdatedAt time.Time  `json:"updated_at"`
}

// Direct Message Room
type DMRoom struct {
	ID          uuid.UUID    `json:"id"`
	User1ID     uuid.UUID    `json:"user1_id"`
	User2ID     uuid.UUID    `json:"user2_id"`
	Recipient   UserPublic   `json:"recipient"`
	LastMessage *DMMessage   `json:"last_message,omitempty"`
	CreatedAt   time.Time    `json:"created_at"`
}

// Direct Message
type DMMessage struct {
	ID          uuid.UUID         `json:"id"`
	DMRoomID    uuid.UUID         `json:"dm_room_id"`
	AuthorID    uuid.UUID         `json:"author_id"`
	Author      UserPublic        `json:"author"`
	Content     string            `json:"content"`
	Attachments []Attachment      `json:"attachments"`
	ReplyToID   *uuid.UUID        `json:"reply_to_id,omitempty"`
	ReplyTo     *MessageReplyInfo `json:"reply_to,omitempty"`
	IsPinned    bool              `json:"is_pinned"`
	IsEdited    bool              `json:"is_edited"`
	EditedAt    *time.Time        `json:"edited_at,omitempty"`
	Reactions   []MessageReaction `json:"reactions,omitempty"`
	CreatedAt   time.Time         `json:"created_at"`
}

// DM Group
type DMGroup struct {
	ID          uuid.UUID       `json:"id"`
	Name        *string         `json:"name"`
	IconURL     *string         `json:"icon_url"`
	OwnerID     uuid.UUID       `json:"owner_id"`
	Members     []UserPublic    `json:"members"`
	LastMessage *DMGroupMessage `json:"last_message,omitempty"`
	CreatedAt   time.Time       `json:"created_at"`
}

// DM Group Message
type DMGroupMessage struct {
	ID          uuid.UUID         `json:"id"`
	GroupID     uuid.UUID         `json:"group_id"`
	AuthorID    uuid.UUID         `json:"author_id"`
	Author      UserPublic        `json:"author"`
	Content     string            `json:"content"`
	Attachments []Attachment      `json:"attachments"`
	ReplyToID   *uuid.UUID        `json:"reply_to_id,omitempty"`
	ReplyTo     *MessageReplyInfo `json:"reply_to,omitempty"`
	IsPinned    bool              `json:"is_pinned"`
	IsEdited    bool              `json:"is_edited"`
	EditedAt    *time.Time        `json:"edited_at,omitempty"`
	Reactions   []MessageReaction `json:"reactions,omitempty"`
	CreatedAt   time.Time         `json:"created_at"`
}

// WebSocket Event Types
type WSEventType string

const (
	EventReady                  WSEventType = "READY"
	EventMessageCreate          WSEventType = "MESSAGE_CREATE"
	EventMessageUpdate          WSEventType = "MESSAGE_UPDATE"
	EventMessageDelete          WSEventType = "MESSAGE_DELETE"
	EventMessageReactionAdd     WSEventType = "MESSAGE_REACTION_ADD"
	EventMessageReactionRemove  WSEventType = "MESSAGE_REACTION_REMOVE"
	EventMessagePin             WSEventType = "MESSAGE_PIN"
	EventMessageUnpin           WSEventType = "MESSAGE_UNPIN"
	EventTypingStart            WSEventType = "TYPING_START"
	EventPresenceUpdate         WSEventType = "PRESENCE_UPDATE"
	EventVoiceStateUpdate       WSEventType = "VOICE_STATE_UPDATE"
	EventGuildCreate            WSEventType = "GUILD_CREATE"
	EventChannelCreate          WSEventType = "CHANNEL_CREATE"
	EventChannelUpdate          WSEventType = "CHANNEL_UPDATE"
	EventChannelDelete          WSEventType = "CHANNEL_DELETE"
	EventFriendRequestCreate    WSEventType = "FRIEND_REQUEST_CREATE"
	EventFriendRequestUpdate    WSEventType = "FRIEND_REQUEST_UPDATE"
	EventDMMessageCreate        WSEventType = "DM_MESSAGE_CREATE"
	EventDMMessageUpdate        WSEventType = "DM_MESSAGE_UPDATE"
	EventDMMessageDelete        WSEventType = "DM_MESSAGE_DELETE"
	EventDMReactionAdd          WSEventType = "DM_REACTION_ADD"
	EventDMReactionRemove       WSEventType = "DM_REACTION_REMOVE"
	EventRoleCreate             WSEventType = "ROLE_CREATE"
	EventRoleUpdate             WSEventType = "ROLE_UPDATE"
	EventRoleDelete             WSEventType = "ROLE_DELETE"
	EventUserUpdate             WSEventType = "USER_UPDATE"
	EventCallIncoming           WSEventType = "CALL_INCOMING"
	EventCallAccept             WSEventType = "CALL_ACCEPT"
	EventCallReject             WSEventType = "CALL_REJECT"
)

type WSEvent struct {
	Type WSEventType `json:"type"`
	Data any         `json:"data"`
}
