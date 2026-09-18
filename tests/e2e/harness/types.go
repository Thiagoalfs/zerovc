package harness

import (
	"time"

	"github.com/google/uuid"
)

// UserPublic defines public user profile contract.
type UserPublic struct {
	ID                 uuid.UUID      `json:"id"`
	Username           string         `json:"username"`
	DisplayName        string         `json:"display_name"`
	AvatarURL          string         `json:"avatar_url"`
	BannerURL          string         `json:"banner_url"`
	Bio                string         `json:"bio"`
	Status             string         `json:"status"`
	CustomStatus       string         `json:"custom_status"`
	CustomActivity     map[string]any `json:"custom_activity"`
	ShowActivityStatus bool           `json:"show_activity_status"`
	AutoDetectActivity bool           `json:"auto_detect_activity"`
	TwoFactorEnabled   bool           `json:"two_factor_enabled"`
	EmailVerified      bool           `json:"email_verified"`
	Roles              []string       `json:"roles"`
}

// AuthResponse defines login/register response contract.
type AuthResponse struct {
	Token     string      `json:"token"`
	User      UserPublic  `json:"user"`
	CSRFToken string      `json:"csrf_token,omitempty"`
}

// Guild defines guild contract.
type Guild struct {
	ID          uuid.UUID   `json:"id"`
	Name        string      `json:"name"`
	IconURL     string      `json:"icon_url"`
	BannerURL   string      `json:"banner_url"`
	OwnerID     uuid.UUID   `json:"owner_id"`
	Description string      `json:"description"`
	Channels    []Channel   `json:"channels,omitempty"`
	Roles       []Role      `json:"roles,omitempty"`
	Members     []UserPublic `json:"members,omitempty"`
	MemberCount int         `json:"member_count,omitempty"`
}

// Channel defines channel contract.
type Channel struct {
	ID                   uuid.UUID              `json:"id"`
	GuildID              uuid.UUID              `json:"guild_id"`
	Name                 string                 `json:"name"`
	Type                 string                 `json:"type"` // "text", "voice", "category"
	CategoryID           *uuid.UUID             `json:"category_id"`
	Topic                string                 `json:"topic"`
	Position             int                    `json:"position"`
	IsPrivate            bool                   `json:"is_private"`
	RoleIDs              []uuid.UUID            `json:"role_ids"`
	PermissionOverwrites []PermissionOverwrite  `json:"permission_overwrites"`
	VoiceSessions        []VoiceSession         `json:"voice_sessions"`
	CreatedAt            time.Time              `json:"created_at"`
}

// PermissionOverwrite defines channel permission bitmask overwrite contract.
type PermissionOverwrite struct {
	ChannelID uuid.UUID `json:"channel_id"`
	RoleID    uuid.UUID `json:"role_id"`
	Allow     int64     `json:"allow"`
	Deny      int64     `json:"deny"`
}

// VoiceSession defines user active voice channel session contract.
type VoiceSession struct {
	UserID        uuid.UUID `json:"user_id"`
	ChannelID     uuid.UUID `json:"channel_id"`
	SelfMute      bool      `json:"self_mute"`
	SelfDeaf      bool      `json:"self_deaf"`
	SelfVideo     bool      `json:"self_video"`
	ScreenShare   bool      `json:"screenshare"`
	ServerMute    bool      `json:"server_mute"`
	ServerDeaf    bool      `json:"server_deaf"`
	ConnectedAt   time.Time `json:"connected_at"`
}

// Role defines guild role contract.
type Role struct {
	ID            uuid.UUID `json:"id"`
	GuildID       uuid.UUID `json:"guild_id"`
	Name          string    `json:"name"`
	Color         string    `json:"color"`
	Position      int       `json:"position"`
	Permissions   int64     `json:"permissions"`
	IsHoisted     bool      `json:"is_hoisted"`
	IsMentionable bool      `json:"is_mentionable"`
	IsDefault     bool      `json:"is_default"`
}

// MessageAttachment defines file attachment in message.
type MessageAttachment struct {
	URL      string `json:"url"`
	Filename string `json:"filename"`
	Size     int64  `json:"size"`
	Type     string `json:"type"`
}

// MessageReaction defines aggregated reactions.
type MessageReaction struct {
	Emoji   string      `json:"emoji"`
	Count   int         `json:"count"`
	UserIDs []uuid.UUID `json:"user_ids"`
}

// Message defines message contract.
type Message struct {
	ID          uuid.UUID           `json:"id"`
	ChannelID   uuid.UUID           `json:"channel_id"`
	AuthorID    uuid.UUID           `json:"author_id"`
	Author      UserPublic          `json:"author"`
	Content     string              `json:"content"`
	Attachments []MessageAttachment `json:"attachments"`
	ReplyToID   *uuid.UUID          `json:"reply_to_id"`
	ReplyTo     *Message            `json:"reply_to"`
	Reactions   []MessageReaction   `json:"reactions"`
	IsPinned    bool                `json:"is_pinned"`
	IsEdited    bool                `json:"is_edited"`
	EditedAt    *time.Time          `json:"edited_at"`
	CreatedAt   time.Time           `json:"created_at"`
	UpdatedAt   time.Time           `json:"updated_at"`
}

// Invite defines invite contract.
type Invite struct {
	Code       string     `json:"code"`
	GuildID    uuid.UUID  `json:"guild_id"`
	GuildName  string     `json:"guild_name"`
	GuildIcon  string     `json:"guild_icon"`
	ChannelID  uuid.UUID  `json:"channel_id"`
	InviterID  uuid.UUID  `json:"inviter_id"`
	Uses       int        `json:"uses"`
	MaxUses    int        `json:"max_uses"`
	ExpiresAt  *time.Time `json:"expires_at"`
	CreatedAt  time.Time  `json:"created_at"`
}

// DMRoom defines 1x1 direct message room contract.
type DMRoom struct {
	ID        uuid.UUID   `json:"id"`
	User1ID   uuid.UUID   `json:"user1_id"`
	User2ID   uuid.UUID   `json:"user2_id"`
	OtherUser UserPublic  `json:"other_user"`
	CreatedAt time.Time   `json:"created_at"`
	UpdatedAt time.Time   `json:"updated_at"`
}

// DMGroup defines group direct message contract.
type DMGroup struct {
	ID        uuid.UUID    `json:"id"`
	Name      string       `json:"name"`
	IconURL   string       `json:"icon_url"`
	OwnerID   uuid.UUID    `json:"owner_id"`
	Members   []UserPublic `json:"members"`
	CreatedAt time.Time    `json:"created_at"`
	UpdatedAt time.Time    `json:"updated_at"`
}

// VoiceTokenResponse defines LiveKit token response contract.
type VoiceTokenResponse struct {
	Token      string `json:"token"`
	LiveKitURL string `json:"livekit_url"`
	RoomName   string `json:"room_name"`
}

// ErrorResponse defines standard error payload.
type ErrorResponse struct {
	Error string `json:"error"`
}
