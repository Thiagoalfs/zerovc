package models

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

// ConversationType represents the canonical conversation scope for E2EE.
type ConversationType string

const (
	ConversationTypeDM      ConversationType = "dm"
	ConversationTypeDMGroup ConversationType = "dm_group"
	ConversationTypeChannel ConversationType = "channel"
)

func (c ConversationType) IsValid() bool {
	switch c {
	case ConversationTypeDM, ConversationTypeDMGroup, ConversationTypeChannel:
		return true
	default:
		return false
	}
}

// E2EEIdentity represents a user's master Ed25519 identity key.
type E2EEIdentity struct {
	UserID            uuid.UUID `json:"user_id"`
	IdentityPublicKey string    `json:"identity_public_key"`
	CreatedAt         time.Time `json:"created_at"`
}

// E2EEDevice represents an Olm device registered by a user identity.
type E2EEDevice struct {
	ID                uuid.UUID  `json:"id"`
	UserID            uuid.UUID  `json:"user_id"`
	SessionID         *uuid.UUID `json:"session_id,omitempty"`
	Curve25519Key     string     `json:"curve25519_key"`
	Ed25519Key        string     `json:"ed25519_key"`
	IdentitySignature string     `json:"identity_signature"`
	FallbackKey       *string    `json:"fallback_key,omitempty"`
	RevokedAt         *time.Time `json:"revoked_at,omitempty"`
	CreatedAt         time.Time  `json:"created_at"`
}

// E2EEOneTimeKey represents an Olm pre-key for establishing 1:1 sessions.
type E2EEOneTimeKey struct {
	ID        uuid.UUID  `json:"id"`
	DeviceID  uuid.UUID  `json:"device_id"`
	KeyID     string     `json:"key_id"`
	PublicKey string     `json:"public_key"`
	ClaimedAt *time.Time `json:"claimed_at,omitempty"`
}

// E2EEToDeviceMessage represents an ephemeral to-device message in the delivery queue.
type E2EEToDeviceMessage struct {
	ID                uuid.UUID `json:"id"`
	RecipientDeviceID uuid.UUID `json:"recipient_device_id"`
	SenderDeviceID    uuid.UUID `json:"sender_device_id"`
	MsgType           string    `json:"msg_type"` // "room_key", "call_key", "key_request"
	Payload           string    `json:"payload"`
	CreatedAt         time.Time `json:"created_at"`
}

// E2EEKeyBackup stores a user's cloud-backed session recovery envelope.
type E2EEKeyBackup struct {
	UserID            uuid.UUID `json:"user_id"`
	BackupPublicKey   string    `json:"backup_public_key"`
	WrappedPrivateKey string    `json:"wrapped_private_key"`
	Version           int64     `json:"version"`
	CreatedAt         time.Time `json:"created_at"`
	UpdatedAt         time.Time `json:"updated_at"`
}

// E2EEBackupSession stores an encrypted Megolm inbound session key in cloud backup.
type E2EEBackupSession struct {
	UserID           uuid.UUID        `json:"user_id"`
	ConversationType ConversationType `json:"conversation_type"`
	ConversationID   uuid.UUID        `json:"conversation_id"`
	MegolmSessionID  string           `json:"megolm_session_id"`
	SessionData      string           `json:"session_data"`
	CreatedAt        time.Time        `json:"created_at"`
}

// E2EERosterDeviceSnapshot represents a device snapshot in a signed roster.
type E2EERosterDeviceSnapshot struct {
	UserID        uuid.UUID `json:"user_id"`
	DeviceID      uuid.UUID `json:"device_id"`
	Curve25519Key string    `json:"curve25519_key"`
	Ed25519Key    string    `json:"ed25519_key"`
}

// E2EERoster represents a cryptographically signed roster snapshot for an E2EE conversation.
type E2EERoster struct {
	ConversationType ConversationType `json:"conversation_type"`
	ConversationID   uuid.UUID        `json:"conversation_id"`
	Version          int64            `json:"version"`
	Epoch            int64            `json:"epoch"`
	Members          json.RawMessage  `json:"members"` // canonical array of user IDs
	Devices          json.RawMessage  `json:"devices"` // canonical array of E2EERosterDeviceSnapshot
	SignerUserID     uuid.UUID        `json:"signer_user_id"`
	SignerDeviceID   uuid.UUID        `json:"signer_device_id"`
	PrevRosterHash   *string          `json:"prev_roster_hash,omitempty"`
	AudienceHash     string           `json:"audience_hash"`
	Signature        string           `json:"signature"`
	CreatedAt        time.Time        `json:"created_at"`
}

// Request and Response DTOs

type RegisterIdentityRequest struct {
	IdentityPublicKey string `json:"identity_public_key"`
}

type OneTimeKeyUpload struct {
	KeyID     string `json:"key_id"`
	PublicKey string `json:"public_key"`
}

type RegisterDeviceRequest struct {
	Curve25519Key     string             `json:"curve25519_key"`
	Ed25519Key        string             `json:"ed25519_key"`
	IdentitySignature string             `json:"identity_signature"`
	FallbackKey       *string            `json:"fallback_key,omitempty"`
	OneTimeKeys       []OneTimeKeyUpload `json:"one_time_keys,omitempty"`
}

type ReplenishOTKsRequest struct {
	OneTimeKeys []OneTimeKeyUpload `json:"one_time_keys"`
}

type DevicePublicInfo struct {
	ID                uuid.UUID  `json:"id"`
	UserID            uuid.UUID  `json:"user_id"`
	Curve25519Key     string     `json:"curve25519_key"`
	Ed25519Key        string     `json:"ed25519_key"`
	IdentitySignature string     `json:"identity_signature"`
	FallbackKey       *string    `json:"fallback_key,omitempty"`
	UnclaimedOTKCount int        `json:"unclaimed_otk_count"`
	CreatedAt         time.Time  `json:"created_at"`
}

type ClaimKeysRequest struct {
	DeviceIDs []uuid.UUID `json:"device_ids"`
}

type ClaimedKeyInfo struct {
	KeyID      string `json:"key_id"`
	PublicKey  string `json:"public_key"`
	IsFallback bool   `json:"is_fallback"`
}

type ClaimKeysResponse struct {
	ClaimedKeys map[string]ClaimedKeyInfo `json:"claimed_keys"` // device_id -> ClaimedKeyInfo
}

type SendToDeviceItem struct {
	RecipientDeviceID uuid.UUID `json:"recipient_device_id"`
	MsgType           string    `json:"msg_type"`
	Payload           string    `json:"payload"`
}

type SendToDeviceRequest struct {
	Messages []SendToDeviceItem `json:"messages"`
}

type AckToDeviceRequest struct {
	MessageIDs []uuid.UUID `json:"message_ids"`
}

type SubmitRosterRequest struct {
	ConversationType ConversationType `json:"conversation_type"`
	ConversationID   uuid.UUID        `json:"conversation_id"`
	Version          int64            `json:"version"`
	Epoch            int64            `json:"epoch"`
	Members          json.RawMessage  `json:"members"`
	Devices          json.RawMessage  `json:"devices"`
	SignerDeviceID   uuid.UUID        `json:"signer_device_id"`
	PrevRosterHash   *string          `json:"prev_roster_hash,omitempty"`
	AudienceHash     string           `json:"audience_hash"`
	Signature        string           `json:"signature"`
}

type E2EEConfigResponse struct {
	MinVersion         int             `json:"min_version"`
	RecommendedVersion int             `json:"recommended_version"`
	Features           map[string]bool `json:"features"`
}
