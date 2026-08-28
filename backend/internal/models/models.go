package models

import (
	"time"

	"github.com/google/uuid"
)

type User struct {
	ID           uuid.UUID `json:"id"`
	Username     string    `json:"username"`
	DisplayName  string    `json:"display_name"`
	Email        string    `json:"email,omitempty"`
	PasswordHash string    `json:"-"`
	AvatarURL    string    `json:"avatar_url"`
	BannerURL    string    `json:"banner_url"`
	Bio          string    `json:"bio"`
	Status       string    `json:"status"` // online, idle, dnd, offline
	CustomStatus string    `json:"custom_status"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

type UserPublic struct {
	ID           uuid.UUID `json:"id"`
	Username     string    `json:"username"`
	DisplayName  string    `json:"display_name"`
	AvatarURL    string    `json:"avatar_url"`
	BannerURL    string    `json:"banner_url"`
	Bio          string    `json:"bio"`
	Status       string    `json:"status"`
	CustomStatus string    `json:"custom_status"`
	Roles        []Role    `json:"roles,omitempty"`
}

func (u *User) ToPublic() UserPublic {
	return UserPublic{
		ID:           u.ID,
		Username:     u.Username,
		DisplayName:  u.DisplayName,
		AvatarURL:    u.AvatarURL,
		BannerURL:    u.BannerURL,
		Bio:          u.Bio,
		Status:       u.Status,
		CustomStatus: u.CustomStatus,
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

type ChannelType string

const (
	ChannelTypeText  ChannelType = "text"
	ChannelTypeVoice ChannelType = "voice"
)

type Channel struct {
	ID            uuid.UUID      `json:"id"`
	GuildID       uuid.UUID      `json:"guild_id"`
	Name          string         `json:"name"`
	Type          ChannelType    `json:"type"`
	Topic         string         `json:"topic"`
	Position      int            `json:"position"`
	VoiceSessions []VoiceSession `json:"voice_sessions,omitempty"`
	CreatedAt     time.Time      `json:"created_at"`
}

type Attachment struct {
	URL      string `json:"url"`
	Filename string `json:"filename"`
	Size     int64  `json:"size"`
	Type     string `json:"type"`
}

type Message struct {
	ID          uuid.UUID    `json:"id"`
	ChannelID   uuid.UUID    `json:"channel_id"`
	AuthorID    uuid.UUID    `json:"author_id"`
	Author      UserPublic   `json:"author"`
	Content     string       `json:"content"`
	Attachments []Attachment `json:"attachments"`
	ReplyToID   *uuid.UUID   `json:"reply_to_id,omitempty"`
	IsPinned    bool         `json:"is_pinned"`
	IsEdited    bool         `json:"is_edited"`
	EditedAt    *time.Time   `json:"edited_at,omitempty"`
	CreatedAt   time.Time    `json:"created_at"`
	UpdatedAt   time.Time    `json:"updated_at"`
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
	ID          uuid.UUID    `json:"id"`
	DMRoomID    uuid.UUID    `json:"dm_room_id"`
	AuthorID    uuid.UUID    `json:"author_id"`
	Author      UserPublic   `json:"author"`
	Content     string       `json:"content"`
	Attachments []Attachment `json:"attachments"`
	IsEdited    bool         `json:"is_edited"`
	EditedAt    *time.Time   `json:"edited_at,omitempty"`
	CreatedAt   time.Time    `json:"created_at"`
}

// WebSocket Event Types
type WSEventType string

const (
	EventReady               WSEventType = "READY"
	EventMessageCreate       WSEventType = "MESSAGE_CREATE"
	EventMessageUpdate       WSEventType = "MESSAGE_UPDATE"
	EventMessageDelete       WSEventType = "MESSAGE_DELETE"
	EventTypingStart         WSEventType = "TYPING_START"
	EventPresenceUpdate      WSEventType = "PRESENCE_UPDATE"
	EventVoiceStateUpdate    WSEventType = "VOICE_STATE_UPDATE"
	EventGuildCreate         WSEventType = "GUILD_CREATE"
	EventChannelCreate       WSEventType = "CHANNEL_CREATE"
	EventChannelUpdate       WSEventType = "CHANNEL_UPDATE"
	EventChannelDelete       WSEventType = "CHANNEL_DELETE"
	EventFriendRequestCreate WSEventType = "FRIEND_REQUEST_CREATE"
	EventFriendRequestUpdate WSEventType = "FRIEND_REQUEST_UPDATE"
	EventDMMessageCreate     WSEventType = "DM_MESSAGE_CREATE"
	EventDMMessageUpdate     WSEventType = "DM_MESSAGE_UPDATE"
	EventDMMessageDelete     WSEventType = "DM_MESSAGE_DELETE"
	EventRoleCreate          WSEventType = "ROLE_CREATE"
	EventRoleUpdate          WSEventType = "ROLE_UPDATE"
	EventRoleDelete          WSEventType = "ROLE_DELETE"
	EventUserUpdate          WSEventType = "USER_UPDATE"
)

type WSEvent struct {
	Type WSEventType `json:"type"`
	Data any         `json:"data"`
}
