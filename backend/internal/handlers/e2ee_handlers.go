package handlers

import (
	"context"
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/zerovc/zerovc/backend/internal/auth"
	"github.com/zerovc/zerovc/backend/internal/database"
	"github.com/zerovc/zerovc/backend/internal/gateway"
	"github.com/zerovc/zerovc/backend/internal/middleware"
	"github.com/zerovc/zerovc/backend/internal/models"
)

type E2EEHandler struct {
	db        *database.DB
	hub       *gateway.Hub
	Debouncer *ChannelAudienceDebouncer
}

func NewE2EEHandler(db *database.DB, hub *gateway.Hub) *E2EEHandler {
	h := &E2EEHandler{
		db:  db,
		hub: hub,
	}
	h.Debouncer = NewChannelAudienceDebouncer(db, hub, 500*time.Millisecond, h.RecomputeAudience)
	return h
}

// decodeKeyOrSig attempts to decode standard base64, raw base64, or hex representations.
func decodeKeyOrSig(s string) ([]byte, error) {
	s = strings.TrimSpace(s)
	if b, err := base64.StdEncoding.DecodeString(s); err == nil {
		return b, nil
	}
	if b, err := base64.RawStdEncoding.DecodeString(s); err == nil {
		return b, nil
	}
	return hex.DecodeString(s)
}

// VerifyEd25519Signature verifies a signature using standard library crypto/ed25519.
func VerifyEd25519Signature(pubKeyStr string, messageBytes []byte, sigStr string) error {
	pubBytes, err := decodeKeyOrSig(pubKeyStr)
	if err != nil {
		return fmt.Errorf("failed to decode public key: %w", err)
	}
	if len(pubBytes) != ed25519.PublicKeySize {
		return fmt.Errorf("invalid ed25519 public key length: %d (expected %d)", len(pubBytes), ed25519.PublicKeySize)
	}

	sigBytes, err := decodeKeyOrSig(sigStr)
	if err != nil {
		return fmt.Errorf("failed to decode signature: %w", err)
	}
	if len(sigBytes) != ed25519.SignatureSize {
		return fmt.Errorf("invalid ed25519 signature length: %d (expected %d)", len(sigBytes), ed25519.SignatureSize)
	}

	if !ed25519.Verify(pubBytes, messageBytes, sigBytes) {
		return errors.New("ed25519 signature verification failed")
	}

	return nil
}

// CanonicalDeviceSigningPayload returns the canonical message that identity signs over device keys.
func CanonicalDeviceSigningPayload(userID uuid.UUID, curve25519Key, ed25519Key string) []byte {
	return []byte(fmt.Sprintf("zerovc-device-v1:%s:%s:%s", userID.String(), curve25519Key, ed25519Key))
}

// CanonicalRosterSigningPayload returns the canonical representation of a roster for signing.
func CanonicalRosterSigningPayload(
	convType models.ConversationType,
	convID uuid.UUID,
	version int64,
	epoch int64,
	prevRosterHash string,
	audienceHash string,
	signerUserID uuid.UUID,
	signerDeviceID uuid.UUID,
) []byte {
	return []byte(fmt.Sprintf(
		"zerovc-roster-v1:%s:%s:%d:%d:%s:%s:%s:%s",
		convType,
		convID.String(),
		version,
		epoch,
		prevRosterHash,
		audienceHash,
		signerUserID.String(),
		signerDeviceID.String(),
	))
}

// CanonicalJSONRosterSigningPayload serializes a roster into deterministic JSON for signing.
func CanonicalJSONRosterSigningPayload(
	convType models.ConversationType,
	convID uuid.UUID,
	version int64,
	epoch int64,
	prevRosterHash string,
	audienceHash string,
	signerUserID uuid.UUID,
	signerDeviceID uuid.UUID,
	membersJSON json.RawMessage,
	devicesJSON json.RawMessage,
) ([]byte, error) {
	if len(membersJSON) == 0 {
		membersJSON = json.RawMessage("[]")
	}
	if len(devicesJSON) == 0 {
		devicesJSON = json.RawMessage("[]")
	}

	// Canonical keys ordered alphabetically:
	// audience_hash, conversation_id, conversation_type, devices, epoch, members, prev_roster_hash, signer_device_id, signer_user_id, version
	res := fmt.Sprintf(
		`{"audience_hash":%q,"conversation_id":%q,"conversation_type":%q,"devices":%s,"epoch":%d,"members":%s,"prev_roster_hash":%q,"signer_device_id":%q,"signer_user_id":%q,"version":%d}`,
		audienceHash,
		convID.String(),
		string(convType),
		string(devicesJSON),
		epoch,
		string(membersJSON),
		prevRosterHash,
		signerDeviceID.String(),
		signerUserID.String(),
		version,
	)
	return []byte(res), nil
}

// ComputeRosterHash computes the SHA-256 digest of a roster for chaining (colon format).
func ComputeRosterHash(roster *models.E2EERoster) string {
	prevHash := ""
	if roster.PrevRosterHash != nil {
		prevHash = *roster.PrevRosterHash
	}
	payload := CanonicalRosterSigningPayload(
		roster.ConversationType,
		roster.ConversationID,
		roster.Version,
		roster.Epoch,
		prevHash,
		roster.AudienceHash,
		roster.SignerUserID,
		roster.SignerDeviceID,
	)
	h := sha256.Sum256(payload)
	return hex.EncodeToString(h[:])
}

// ComputeCanonicalJSONRosterHash computes the SHA-256 digest of a roster using canonical JSON.
func ComputeCanonicalJSONRosterHash(roster *models.E2EERoster) string {
	prevHash := ""
	if roster.PrevRosterHash != nil {
		prevHash = *roster.PrevRosterHash
	}
	payload, err := CanonicalJSONRosterSigningPayload(
		roster.ConversationType,
		roster.ConversationID,
		roster.Version,
		roster.Epoch,
		prevHash,
		roster.AudienceHash,
		roster.SignerUserID,
		roster.SignerDeviceID,
		roster.Members,
		roster.Devices,
	)
	if err != nil {
		return ""
	}
	h := sha256.Sum256(payload)
	return hex.EncodeToString(h[:])
}

// ComputeAudienceHash computes the deterministic canonical audience hash over members and devices.
func ComputeAudienceHash(members []uuid.UUID, devices []models.E2EERosterDeviceSnapshot) string {
	sortedMembers := make([]string, len(members))
	for i, m := range members {
		sortedMembers[i] = m.String()
	}
	sort.Strings(sortedMembers)

	sortedDevices := make([]string, len(devices))
	for i, d := range devices {
		sortedDevices[i] = fmt.Sprintf("%s:%s:%s:%s", d.UserID.String(), d.DeviceID.String(), d.Curve25519Key, d.Ed25519Key)
	}
	sort.Strings(sortedDevices)

	canonicalData := fmt.Sprintf(
		"members:%s|devices:%s",
		strings.Join(sortedMembers, ","),
		strings.Join(sortedDevices, ","),
	)
	h := sha256.Sum256([]byte(canonicalData))
	return hex.EncodeToString(h[:])
}

// ---------------------------------------------------------------------
// 1. Identities
// ---------------------------------------------------------------------

// RegisterIdentity handles POST /api/e2ee/identities
func (h *E2EEHandler) RegisterIdentity(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var req models.RegisterIdentityRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid_request"}`, http.StatusBadRequest)
		return
	}

	pubBytes, err := decodeKeyOrSig(req.IdentityPublicKey)
	if err != nil || len(pubBytes) != ed25519.PublicKeySize {
		http.Error(w, `{"error":"invalid_identity_public_key"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	var existingKey string
	err = h.db.Pool.QueryRow(ctx, "SELECT identity_public_key FROM e2ee_identities WHERE user_id = $1", userID).Scan(&existingKey)
	if err == nil {
		if existingKey == req.IdentityPublicKey {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
			json.NewEncoder(w).Encode(map[string]any{"status": "ok", "user_id": userID})
			return
		}
		http.Error(w, `{"error":"identity_already_exists"}`, http.StatusConflict)
		return
	} else if !errors.Is(err, pgx.ErrNoRows) {
		http.Error(w, `{"error":"internal_error"}`, http.StatusInternalServerError)
		return
	}

	_, err = h.db.Pool.Exec(ctx, `
		INSERT INTO e2ee_identities (user_id, identity_public_key, created_at)
		VALUES ($1, $2, CURRENT_TIMESTAMP)
	`, userID, req.IdentityPublicKey)
	if err != nil {
		http.Error(w, `{"error":"failed_to_save_identity"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]any{
		"status":  "created",
		"user_id": userID,
	})
}

// GetIdentity handles GET /api/e2ee/identities/{user_id}
func (h *E2EEHandler) GetIdentity(w http.ResponseWriter, r *http.Request) {
	targetIDStr := chi.URLParam(r, "user_id")
	targetID, err := uuid.Parse(targetIDStr)
	if err != nil {
		http.Error(w, `{"error":"invalid_user_id"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	var identity models.E2EEIdentity
	err = h.db.Pool.QueryRow(ctx, `
		SELECT user_id, identity_public_key, created_at
		FROM e2ee_identities
		WHERE user_id = $1
	`, targetID).Scan(&identity.UserID, &identity.IdentityPublicKey, &identity.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		http.Error(w, `{"error":"identity_not_found"}`, http.StatusNotFound)
		return
	} else if err != nil {
		http.Error(w, `{"error":"internal_error"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(identity)
}

// ---------------------------------------------------------------------
// 2. Devices
// ---------------------------------------------------------------------

// RegisterDevice handles POST /api/e2ee/devices
func (h *E2EEHandler) RegisterDevice(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var req models.RegisterDeviceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid_request"}`, http.StatusBadRequest)
		return
	}

	if req.Curve25519Key == "" || req.Ed25519Key == "" || req.IdentitySignature == "" {
		http.Error(w, `{"error":"missing_required_device_keys"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	// 1. Fetch user's registered identity key
	var identityPubKey string
	err := h.db.Pool.QueryRow(ctx, "SELECT identity_public_key FROM e2ee_identities WHERE user_id = $1", userID).Scan(&identityPubKey)
	if errors.Is(err, pgx.ErrNoRows) {
		http.Error(w, `{"error":"identity_not_registered"}`, http.StatusBadRequest)
		return
	} else if err != nil {
		http.Error(w, `{"error":"internal_error"}`, http.StatusInternalServerError)
		return
	}

	// 2. Cryptographic Verification: Verify identity signature using crypto/ed25519.Verify
	// Check standard formats:
	canonicalPayload1 := CanonicalDeviceSigningPayload(userID, req.Curve25519Key, req.Ed25519Key)
	canonicalPayload2 := []byte(fmt.Sprintf("zerovc:device:%s:%s", req.Curve25519Key, req.Ed25519Key))
	altPayload := []byte(fmt.Sprintf("%s:%s", req.Curve25519Key, req.Ed25519Key))

	if VerifyEd25519Signature(identityPubKey, canonicalPayload1, req.IdentitySignature) != nil &&
		VerifyEd25519Signature(identityPubKey, canonicalPayload2, req.IdentitySignature) != nil &&
		VerifyEd25519Signature(identityPubKey, altPayload, req.IdentitySignature) != nil {
		http.Error(w, `{"error":"invalid_device_identity_signature"}`, http.StatusBadRequest)
		return
	}

	// 3. Atomically insert device and initial OTKs
	tx, err := h.db.Pool.Begin(ctx)
	if err != nil {
		http.Error(w, `{"error":"transaction_start_failed"}`, http.StatusInternalServerError)
		return
	}
	defer tx.Rollback(ctx)

	var deviceID uuid.UUID
	var createdAt time.Time
	err = tx.QueryRow(ctx, `
		INSERT INTO e2ee_devices (user_id, curve25519_key, ed25519_key, identity_signature, fallback_key, created_at)
		VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
		RETURNING id, created_at
	`, userID, req.Curve25519Key, req.Ed25519Key, req.IdentitySignature, req.FallbackKey).Scan(&deviceID, &createdAt)
	if err != nil {
		http.Error(w, `{"error":"failed_to_insert_device"}`, http.StatusInternalServerError)
		return
	}

	// Insert OTKs if provided
	if len(req.OneTimeKeys) > 0 {
		for _, otk := range req.OneTimeKeys {
			if otk.KeyID != "" && otk.PublicKey != "" {
				_, err = tx.Exec(ctx, `
					INSERT INTO e2ee_one_time_keys (device_id, key_id, public_key)
					VALUES ($1, $2, $3)
				`, deviceID, otk.KeyID, otk.PublicKey)
				if err != nil {
					http.Error(w, `{"error":"failed_to_insert_otks"}`, http.StatusInternalServerError)
					return
				}
			}
		}
	}

	if err := tx.Commit(ctx); err != nil {
		http.Error(w, `{"error":"commit_failed"}`, http.StatusInternalServerError)
		return
	}

	// Broadcast device creation
	if h.hub != nil {
		h.hub.BroadcastGlobal(models.WSEvent{
			Type: models.EventE2EEDeviceListUpdate,
			Data: map[string]any{
				"action":    "create",
				"user_id":   userID,
				"device_id": deviceID,
			},
		})
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(models.E2EEDevice{
		ID:                deviceID,
		UserID:            userID,
		Curve25519Key:     req.Curve25519Key,
		Ed25519Key:        req.Ed25519Key,
		IdentitySignature: req.IdentitySignature,
		FallbackKey:       req.FallbackKey,
		CreatedAt:         createdAt,
	})
}

// ListUserDevices handles GET /api/e2ee/users/{user_id}/devices
func (h *E2EEHandler) ListUserDevices(w http.ResponseWriter, r *http.Request) {
	targetIDStr := chi.URLParam(r, "user_id")
	targetID, err := uuid.Parse(targetIDStr)
	if err != nil {
		http.Error(w, `{"error":"invalid_user_id"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	rows, err := h.db.Pool.Query(ctx, `
		SELECT d.id, d.user_id, d.curve25519_key, d.ed25519_key, d.identity_signature, d.fallback_key, d.created_at,
		       COALESCE(otk.otk_count, 0) as unclaimed_otk_count
		FROM e2ee_devices d
		LEFT JOIN (
			SELECT device_id, COUNT(*) as otk_count
			FROM e2ee_one_time_keys
			WHERE claimed_at IS NULL
			GROUP BY device_id
		) otk ON otk.device_id = d.id
		WHERE d.user_id = $1 AND d.revoked_at IS NULL
		ORDER BY d.created_at ASC
	`, targetID)
	if err != nil {
		http.Error(w, `{"error":"internal_error"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var devices []models.DevicePublicInfo
	for rows.Next() {
		var dev models.DevicePublicInfo
		if err := rows.Scan(
			&dev.ID,
			&dev.UserID,
			&dev.Curve25519Key,
			&dev.Ed25519Key,
			&dev.IdentitySignature,
			&dev.FallbackKey,
			&dev.CreatedAt,
			&dev.UnclaimedOTKCount,
		); err == nil {
			devices = append(devices, dev)
		}
	}

	if devices == nil {
		devices = []models.DevicePublicInfo{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(devices)
}

// RevokeDevice handles POST /api/e2ee/devices/{device_id}/revoke
func (h *E2EEHandler) RevokeDevice(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	deviceIDStr := chi.URLParam(r, "device_id")
	deviceID, err := uuid.Parse(deviceIDStr)
	if err != nil {
		http.Error(w, `{"error":"invalid_device_id"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	cmdTag, err := h.db.Pool.Exec(ctx, `
		UPDATE e2ee_devices
		SET revoked_at = CURRENT_TIMESTAMP
		WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL
	`, deviceID, userID)
	if err != nil {
		http.Error(w, `{"error":"internal_error"}`, http.StatusInternalServerError)
		return
	}

	if cmdTag.RowsAffected() == 0 {
		http.Error(w, `{"error":"device_not_found_or_already_revoked"}`, http.StatusNotFound)
		return
	}

	// Broadcast device revocation
	if h.hub != nil {
		h.hub.BroadcastGlobal(models.WSEvent{
			Type: models.EventE2EEDeviceListUpdate,
			Data: map[string]any{
				"action":    "revoke",
				"user_id":   userID,
				"device_id": deviceID,
			},
		})
	}

	if h.Debouncer != nil {
		h.Debouncer.TriggerUserChannels(context.Background(), userID)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"status":    "revoked",
		"device_id": deviceID,
		"message":   "device revoked successfully",
	})
}

// ReplenishOTKs handles POST /api/e2ee/devices/{device_id}/keys
func (h *E2EEHandler) ReplenishOTKs(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	deviceIDStr := chi.URLParam(r, "device_id")
	deviceID, err := uuid.Parse(deviceIDStr)
	if err != nil {
		http.Error(w, `{"error":"invalid_device_id"}`, http.StatusBadRequest)
		return
	}

	var req models.ReplenishOTKsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid_request"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	// Verify device belongs to user and is not revoked
	var exists bool
	err = h.db.Pool.QueryRow(ctx, `
		SELECT EXISTS(SELECT 1 FROM e2ee_devices WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL)
	`, deviceID, userID).Scan(&exists)
	if err != nil || !exists {
		http.Error(w, `{"error":"device_not_found"}`, http.StatusNotFound)
		return
	}

	tx, err := h.db.Pool.Begin(ctx)
	if err != nil {
		http.Error(w, `{"error":"transaction_failed"}`, http.StatusInternalServerError)
		return
	}
	defer tx.Rollback(ctx)

	inserted := 0
	for _, otk := range req.AllOTKs() {
		if otk.KeyID != "" && otk.PublicKey != "" {
			_, err = tx.Exec(ctx, `
				INSERT INTO e2ee_one_time_keys (device_id, key_id, public_key)
				VALUES ($1, $2, $3)
			`, deviceID, otk.KeyID, otk.PublicKey)
			if err == nil {
				inserted++
			}
		}
	}

	if err := tx.Commit(ctx); err != nil {
		http.Error(w, `{"error":"commit_failed"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"device_id": deviceID,
		"inserted":  inserted,
		"added":     inserted,
	})
}

// ClaimKeys handles POST /api/e2ee/devices/keys/claim
func (h *E2EEHandler) ClaimKeys(w http.ResponseWriter, r *http.Request) {
	_, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var req models.ClaimKeysRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid_request"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	claimed := make(map[string]models.ClaimedKeyInfo)

	for _, devID := range req.DeviceIDs {
		// Attempt to claim 1 unclaimed OTK atomically
		var keyID, pubKey string
		err := h.db.Pool.QueryRow(ctx, `
			UPDATE e2ee_one_time_keys
			SET claimed_at = CURRENT_TIMESTAMP
			WHERE id = (
				SELECT k.id FROM e2ee_one_time_keys k
				INNER JOIN e2ee_devices d ON d.id = k.device_id
				WHERE k.device_id = $1 AND k.claimed_at IS NULL AND d.revoked_at IS NULL
				LIMIT 1
				FOR UPDATE SKIP LOCKED
			)
			RETURNING key_id, public_key
		`, devID).Scan(&keyID, &pubKey)

		if err == nil {
			claimed[devID.String()] = models.ClaimedKeyInfo{
				KeyID:      keyID,
				PublicKey:  pubKey,
				IsFallback: false,
			}
		} else {
			// Fallback to device fallback key
			var fallbackKey *string
			errFallback := h.db.Pool.QueryRow(ctx, `
				SELECT fallback_key FROM e2ee_devices
				WHERE id = $1 AND revoked_at IS NULL
			`, devID).Scan(&fallbackKey)

			if errFallback == nil && fallbackKey != nil && *fallbackKey != "" {
				claimed[devID.String()] = models.ClaimedKeyInfo{
					KeyID:      "fallback",
					PublicKey:  *fallbackKey,
					IsFallback: true,
				}
			}
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(models.ClaimKeysResponse{
		ClaimedKeys: claimed,
	})
}

// ---------------------------------------------------------------------
// 3. To-Device Queue
// ---------------------------------------------------------------------

// SendToDevice handles POST /api/e2ee/to-device
func (h *E2EEHandler) SendToDevice(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var req models.SendToDeviceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid_request"}`, http.StatusBadRequest)
		return
	}

	if len(req.Messages) == 0 {
		http.Error(w, `{"error":"empty_messages"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	// Get sender's default active device if not provided in item
	var defaultSenderDeviceID uuid.UUID
	err := h.db.Pool.QueryRow(ctx, `
		SELECT id FROM e2ee_devices
		WHERE user_id = $1 AND revoked_at IS NULL
		ORDER BY created_at DESC
		LIMIT 1
	`, userID).Scan(&defaultSenderDeviceID)
	if err != nil {
		http.Error(w, `{"error":"sender_device_missing"}`, http.StatusBadRequest)
		return
	}

	delivered := 0
	queued := 0

	for _, m := range req.Messages {
		if m.RecipientDeviceID == uuid.Nil || m.Payload == "" {
			continue
		}

		senderID := defaultSenderDeviceID
		if m.SenderDeviceID != nil && *m.SenderDeviceID != uuid.Nil {
			senderID = *m.SenderDeviceID
		}

		var msgID uuid.UUID
		var createdAt time.Time
		err = h.db.Pool.QueryRow(ctx, `
			INSERT INTO e2ee_to_device (recipient_device_id, sender_device_id, msg_type, payload, created_at)
			VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
			RETURNING id, created_at
		`, m.RecipientDeviceID, senderID, m.MsgType, m.Payload).Scan(&msgID, &createdAt)

		if err != nil {
			log.Printf("[E2EE] Failed to queue to-device message: %v", err)
			continue
		}

		queued++

		// Push in real time if recipient device is online on WebSocket gateway
		if h.hub != nil && h.hub.IsDeviceOnline(m.RecipientDeviceID) {
			event := models.WSEvent{
				Type: models.EventE2EEToDevice,
				Data: models.E2EEToDeviceMessage{
					ID:                msgID,
					RecipientDeviceID: m.RecipientDeviceID,
					SenderDeviceID:    senderID,
					MsgType:           m.MsgType,
					Payload:           m.Payload,
					CreatedAt:         createdAt,
				},
			}
			if h.hub.SendToDevice(m.RecipientDeviceID, event) {
				delivered++
			}
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"queued":    queued,
		"delivered": delivered,
	})
}

// GetPendingToDevice handles GET /api/e2ee/to-device
func (h *E2EEHandler) GetPendingToDevice(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	deviceIDParam := r.URL.Query().Get("device_id")
	var targetDevID *uuid.UUID
	if deviceIDParam != "" {
		if devUUID, err := uuid.Parse(deviceIDParam); err == nil {
			targetDevID = &devUUID
		}
	}

	query := `
		SELECT m.id, m.recipient_device_id, m.sender_device_id, m.msg_type, m.payload, m.created_at
		FROM e2ee_to_device m
		INNER JOIN e2ee_devices d ON d.id = m.recipient_device_id
		WHERE d.user_id = $1 AND d.revoked_at IS NULL
		  AND ($2::uuid IS NULL OR m.recipient_device_id = $2)
		ORDER BY m.created_at ASC
		LIMIT 100
	`

	rows, err := h.db.Pool.Query(ctx, query, userID, targetDevID)
	if err != nil {
		http.Error(w, `{"error":"internal_error"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var messages []models.E2EEToDeviceMessage
	for rows.Next() {
		var msg models.E2EEToDeviceMessage
		if err := rows.Scan(
			&msg.ID,
			&msg.RecipientDeviceID,
			&msg.SenderDeviceID,
			&msg.MsgType,
			&msg.Payload,
			&msg.CreatedAt,
		); err == nil {
			messages = append(messages, msg)
		}
	}

	if messages == nil {
		messages = []models.E2EEToDeviceMessage{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(messages)
}

// AckToDevice handles POST /api/e2ee/to-device/ack
func (h *E2EEHandler) AckToDevice(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var req models.AckToDeviceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid_request"}`, http.StatusBadRequest)
		return
	}

	if len(req.MessageIDs) == 0 {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{"acknowledged": 0, "acked": 0})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	cmdTag, err := h.db.Pool.Exec(ctx, `
		DELETE FROM e2ee_to_device
		WHERE id = ANY($1)
		  AND recipient_device_id IN (
		      SELECT id FROM e2ee_devices WHERE user_id = $2
		  )
	`, req.MessageIDs, userID)
	if err != nil {
		http.Error(w, `{"error":"internal_error"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"acknowledged": cmdTag.RowsAffected(),
		"acked":        cmdTag.RowsAffected(),
	})
}

// ---------------------------------------------------------------------
// 4. Signed Rosters
// ---------------------------------------------------------------------

// SubmitRoster handles POST /api/e2ee/rosters
func (h *E2EEHandler) SubmitRoster(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var req models.SubmitRosterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid_request"}`, http.StatusBadRequest)
		return
	}

	if !req.ConversationType.IsValid() || req.ConversationID == uuid.Nil {
		http.Error(w, `{"error":"invalid_conversation"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	// 1. Verify signer has active E2EE device
	var devExists bool
	err := h.db.Pool.QueryRow(ctx, `
		SELECT EXISTS(
			SELECT 1 FROM e2ee_devices
			WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL
		)
	`, req.SignerDeviceID, userID).Scan(&devExists)
	if err != nil || !devExists {
		http.Error(w, `{"error":"e2ee_signer_device_missing"}`, http.StatusBadRequest)
		return
	}

	// 2. Verify signer authorization for conversation
	switch req.ConversationType {
	case models.ConversationTypeDM:
		var authorized bool
		err = h.db.Pool.QueryRow(ctx, `
			SELECT (user1_id = $1 OR user2_id = $1)
			FROM dm_rooms WHERE id = $2
		`, userID, req.ConversationID).Scan(&authorized)
		if err != nil || !authorized {
			http.Error(w, `{"error":"forbidden_dm_access"}`, http.StatusForbidden)
			return
		}

	case models.ConversationTypeDMGroup:
		var authorized bool
		err = h.db.Pool.QueryRow(ctx, `
			SELECT EXISTS(
				SELECT 1 FROM dm_group_members
				WHERE group_id = $1 AND user_id = $2
			)
		`, req.ConversationID, userID).Scan(&authorized)
		if err != nil || !authorized {
			http.Error(w, `{"error":"forbidden_group_access"}`, http.StatusForbidden)
			return
		}

	case models.ConversationTypeChannel:
		var guildID uuid.UUID
		err = h.db.Pool.QueryRow(ctx, "SELECT guild_id FROM channels WHERE id = $1", req.ConversationID).Scan(&guildID)
		if err != nil {
			http.Error(w, `{"error":"channel_not_found"}`, http.StatusNotFound)
			return
		}

		var isMember bool
		err = h.db.Pool.QueryRow(ctx, `
			SELECT EXISTS(SELECT 1 FROM guild_members WHERE guild_id = $1 AND user_id = $2)
		`, guildID, userID).Scan(&isMember)
		if err != nil || !isMember {
			http.Error(w, `{"error":"forbidden_channel_access"}`, http.StatusForbidden)
			return
		}
	}

	// 3. Fetch latest existing roster for version monotonicity & chaining
	var latest models.E2EERoster
	var prevHash *string
	err = h.db.Pool.QueryRow(ctx, `
		SELECT conversation_type, conversation_id, version, epoch, audience_hash, signer_user_id, signer_device_id, prev_roster_hash, members, devices
		FROM e2ee_rosters
		WHERE conversation_type = $1 AND conversation_id = $2
		ORDER BY version DESC
		LIMIT 1
	`, req.ConversationType, req.ConversationID).Scan(
		&latest.ConversationType,
		&latest.ConversationID,
		&latest.Version,
		&latest.Epoch,
		&latest.AudienceHash,
		&latest.SignerUserID,
		&latest.SignerDeviceID,
		&prevHash,
		&latest.Members,
		&latest.Devices,
	)

	var expectedVersion int64 = 1
	var expectedPrevHashColon string = ""
	var expectedPrevHashJSON string = ""

	if err == nil {
		latest.PrevRosterHash = prevHash
		expectedVersion = latest.Version + 1
		expectedPrevHashColon = ComputeRosterHash(&latest)
		expectedPrevHashJSON = ComputeCanonicalJSONRosterHash(&latest)
	} else if !errors.Is(err, pgx.ErrNoRows) {
		http.Error(w, `{"error":"internal_error"}`, http.StatusInternalServerError)
		return
	}

	// Monotonic version verification
	if req.Version != expectedVersion {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusConflict)
		json.NewEncoder(w).Encode(map[string]any{
			"error":            "e2ee_roster_conflict",
			"expected_version": expectedVersion,
		})
		return
	}

	// Monotonic epoch verification
	if err == nil && req.Epoch < latest.Epoch {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusConflict)
		json.NewEncoder(w).Encode(map[string]any{
			"error":              "e2ee_roster_epoch_rollback",
			"expected_min_epoch": latest.Epoch,
		})
		return
	}

	// Chaining hash verification: accepts either colon format or canonical JSON format
	reqPrevHash := ""
	if req.PrevRosterHash != nil {
		reqPrevHash = *req.PrevRosterHash
	}
	if (expectedPrevHashColon != "" || expectedPrevHashJSON != "") &&
		reqPrevHash != expectedPrevHashColon && reqPrevHash != expectedPrevHashJSON {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusConflict)
		json.NewEncoder(w).Encode(map[string]any{
			"error":              "e2ee_roster_hash_mismatch",
			"expected_prev_hash": expectedPrevHashJSON,
		})
		return
	}

	// 4. Verify Signer Ed25519 signature
	var signerIdentityPubKey string
	err = h.db.Pool.QueryRow(ctx, `
		SELECT identity_public_key FROM e2ee_identities WHERE user_id = $1
	`, userID).Scan(&signerIdentityPubKey)
	if err != nil {
		http.Error(w, `{"error":"signer_identity_missing"}`, http.StatusBadRequest)
		return
	}

	canonicalColonPayload := CanonicalRosterSigningPayload(
		req.ConversationType,
		req.ConversationID,
		req.Version,
		req.Epoch,
		reqPrevHash,
		req.AudienceHash,
		userID,
		req.SignerDeviceID,
	)

	canonicalJSONPayload, _ := CanonicalJSONRosterSigningPayload(
		req.ConversationType,
		req.ConversationID,
		req.Version,
		req.Epoch,
		reqPrevHash,
		req.AudienceHash,
		userID,
		req.SignerDeviceID,
		req.Members,
		req.Devices,
	)

	// Verify either format
	sigErrColon := VerifyEd25519Signature(signerIdentityPubKey, canonicalColonPayload, req.Signature)
	sigErrJSON := VerifyEd25519Signature(signerIdentityPubKey, canonicalJSONPayload, req.Signature)

	if sigErrColon != nil && sigErrJSON != nil {
		http.Error(w, `{"error":"invalid_roster_signature"}`, http.StatusBadRequest)
		return
	}

	membersJSON := req.Members
	if len(membersJSON) == 0 {
		membersJSON = json.RawMessage("[]")
	}
	devicesJSON := req.Devices
	if len(devicesJSON) == 0 {
		devicesJSON = json.RawMessage("[]")
	}

	// 5. Persist Roster and update epoch atomically
	tx, err := h.db.Pool.Begin(ctx)
	if err != nil {
		http.Error(w, `{"error":"transaction_failed"}`, http.StatusInternalServerError)
		return
	}
	defer tx.Rollback(ctx)

	var createdAt time.Time
	err = tx.QueryRow(ctx, `
		INSERT INTO e2ee_rosters (
			conversation_type, conversation_id, version, epoch,
			members, devices, signer_user_id, signer_device_id,
			prev_roster_hash, audience_hash, signature, created_at
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP)
		RETURNING created_at
	`, req.ConversationType, req.ConversationID, req.Version, req.Epoch,
		membersJSON, devicesJSON, userID, req.SignerDeviceID,
		req.PrevRosterHash, req.AudienceHash, req.Signature,
	).Scan(&createdAt)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusConflict)
			json.NewEncoder(w).Encode(map[string]any{
				"error": "e2ee_roster_conflict",
			})
			return
		}
		if strings.Contains(strings.ToLower(err.Error()), "unique") || strings.Contains(strings.ToLower(err.Error()), "conflict") || strings.Contains(strings.ToLower(err.Error()), "duplicate") {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusConflict)
			json.NewEncoder(w).Encode(map[string]any{
				"error": "e2ee_roster_conflict",
			})
			return
		}
		http.Error(w, `{"error":"failed_to_insert_roster"}`, http.StatusInternalServerError)
		return
	}

	// Update rotation_epoch on parent conversation
	switch req.ConversationType {
	case models.ConversationTypeDM:
		_, _ = tx.Exec(ctx, "UPDATE dm_rooms SET rotation_epoch = $1, e2ee_enabled = TRUE WHERE id = $2", req.Epoch, req.ConversationID)
	case models.ConversationTypeDMGroup:
		_, _ = tx.Exec(ctx, "UPDATE dm_groups SET rotation_epoch = $1, e2ee_enabled = TRUE WHERE id = $2", req.Epoch, req.ConversationID)
	case models.ConversationTypeChannel:
		_, _ = tx.Exec(ctx, "UPDATE channels SET rotation_epoch = $1, e2ee_enabled = TRUE WHERE id = $2", req.Epoch, req.ConversationID)
	}

	if err := tx.Commit(ctx); err != nil {
		http.Error(w, `{"error":"commit_failed"}`, http.StatusInternalServerError)
		return
	}

	// 6. Broadcast E2EE_ROSTER_UPDATE event
	rosterEvent := models.WSEvent{
		Type: models.EventE2EERosterUpdate,
		Data: map[string]any{
			"conversation_type": req.ConversationType,
			"conversation_id":   req.ConversationID,
			"version":           req.Version,
			"epoch":             req.Epoch,
			"audience_hash":     req.AudienceHash,
			"created_at":        createdAt,
		},
	}
	if h.hub != nil {
		h.hub.BroadcastGlobal(rosterEvent)
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]any{
		"conversation_type": req.ConversationType,
		"conversation_id":   req.ConversationID,
		"version":           req.Version,
		"epoch":             req.Epoch,
		"status":            "persisted",
		"created_at":        createdAt,
	})
}

// GetLatestRoster handles GET /api/e2ee/rosters/{conversation_id}
func (h *E2EEHandler) GetLatestRoster(w http.ResponseWriter, r *http.Request) {
	convIDStr := chi.URLParam(r, "conversation_id")
	convID, err := uuid.Parse(convIDStr)
	if err != nil {
		http.Error(w, `{"error":"invalid_conversation_id"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	var roster models.E2EERoster
	err = h.db.Pool.QueryRow(ctx, `
		SELECT conversation_type, conversation_id, version, epoch,
		       members, devices, signer_user_id, signer_device_id,
		       prev_roster_hash, audience_hash, signature, created_at
		FROM e2ee_rosters
		WHERE conversation_id = $1
		ORDER BY version DESC
		LIMIT 1
	`, convID).Scan(
		&roster.ConversationType,
		&roster.ConversationID,
		&roster.Version,
		&roster.Epoch,
		&roster.Members,
		&roster.Devices,
		&roster.SignerUserID,
		&roster.SignerDeviceID,
		&roster.PrevRosterHash,
		&roster.AudienceHash,
		&roster.Signature,
		&roster.CreatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		http.Error(w, `{"error":"roster_not_found"}`, http.StatusNotFound)
		return
	} else if err != nil {
		http.Error(w, `{"error":"internal_error"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(roster)
}

// ---------------------------------------------------------------------
// 5. Config
// ---------------------------------------------------------------------

// GetConfig handles GET /api/e2ee/config
func (h *E2EEHandler) GetConfig(w http.ResponseWriter, r *http.Request) {
	minVer := middleware.GetMinE2EEClientVersion()
	resp := models.E2EEConfigResponse{
		MinVersion:         minVer,
		RecommendedVersion: minVer,
		Features: map[string]bool{
			"dm":       true,
			"dm_group": true,
			"channel":  true,
			"backup":   true,
		},
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// ---------------------------------------------------------------------
// 6. Cloud Session Key Backup (Opt-in)
// ---------------------------------------------------------------------

// UploadBackup handles POST /api/e2ee/backup
func (h *E2EEHandler) UploadBackup(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"method_not_allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var req models.UploadBackupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid_request"}`, http.StatusBadRequest)
		return
	}

	if req.Ciphertext == "" && req.BackupCiphertext != "" {
		req.Ciphertext = req.BackupCiphertext
	}

	hasEnvelope := req.Ciphertext != "" && req.IV != ""
	hasMatrixKeys := req.BackupPublicKey != "" && req.WrappedPrivateKey != ""
	if !hasEnvelope && !hasMatrixKeys {
		http.Error(w, `{"error":"missing_backup_keys"}`, http.StatusBadRequest)
		return
	}

	if req.Version <= 0 {
		req.Version = 1
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	_, err := h.db.Pool.Exec(ctx, `
		INSERT INTO e2ee_key_backups (
			user_id, backup_public_key, wrapped_private_key, ciphertext, iv, salt, key_count, version, updated_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
		ON CONFLICT (user_id) DO UPDATE SET
			backup_public_key = CASE WHEN EXCLUDED.backup_public_key <> '' THEN EXCLUDED.backup_public_key ELSE e2ee_key_backups.backup_public_key END,
			wrapped_private_key = CASE WHEN EXCLUDED.wrapped_private_key <> '' THEN EXCLUDED.wrapped_private_key ELSE e2ee_key_backups.wrapped_private_key END,
			ciphertext = CASE WHEN EXCLUDED.ciphertext <> '' THEN EXCLUDED.ciphertext ELSE e2ee_key_backups.ciphertext END,
			iv = CASE WHEN EXCLUDED.iv <> '' THEN EXCLUDED.iv ELSE e2ee_key_backups.iv END,
			salt = CASE WHEN EXCLUDED.salt <> '' THEN EXCLUDED.salt ELSE e2ee_key_backups.salt END,
			key_count = CASE WHEN EXCLUDED.key_count > 0 THEN EXCLUDED.key_count ELSE e2ee_key_backups.key_count END,
			version = EXCLUDED.version,
			updated_at = CURRENT_TIMESTAMP
	`, userID, req.BackupPublicKey, req.WrappedPrivateKey, req.Ciphertext, req.IV, req.Salt, req.KeyCount, req.Version)
	if err != nil {
		http.Error(w, `{"error":"failed_to_save_backup"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"status": "saved", "version": req.Version})
}

// GetBackup handles GET /api/e2ee/backup
func (h *E2EEHandler) GetBackup(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, `{"error":"method_not_allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	var backup models.E2EEKeyBackup
	err := h.db.Pool.QueryRow(ctx, `
		SELECT user_id, COALESCE(backup_public_key, ''), COALESCE(wrapped_private_key, ''),
		       COALESCE(ciphertext, ''), COALESCE(iv, ''), COALESCE(salt, ''),
		       COALESCE(key_count, 0), version, created_at, updated_at
		FROM e2ee_key_backups
		WHERE user_id = $1
	`, userID).Scan(
		&backup.UserID,
		&backup.BackupPublicKey,
		&backup.WrappedPrivateKey,
		&backup.Ciphertext,
		&backup.IV,
		&backup.Salt,
		&backup.KeyCount,
		&backup.Version,
		&backup.CreatedAt,
		&backup.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		http.Error(w, `{"error":"backup_not_found"}`, http.StatusNotFound)
		return
	} else if err != nil {
		http.Error(w, `{"error":"internal_error"}`, http.StatusInternalServerError)
		return
	}

	resp := models.BackupResponse{
		Backup:     backup,
		Ciphertext: backup.Ciphertext,
		IV:         backup.IV,
		Version:    backup.Version,
		Status:     "ok",
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// DeleteBackup handles POST /api/e2ee/backup/delete and DELETE /api/e2ee/backup
func (h *E2EEHandler) DeleteBackup(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost && r.Method != http.MethodDelete {
		http.Error(w, `{"error":"method_not_allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	tx, err := h.db.Pool.Begin(ctx)
	if err != nil {
		http.Error(w, `{"error":"internal_error"}`, http.StatusInternalServerError)
		return
	}
	defer tx.Rollback(ctx)

	_, _ = tx.Exec(ctx, "DELETE FROM e2ee_backup_sessions WHERE user_id = $1", userID)
	_, _ = tx.Exec(ctx, "DELETE FROM e2ee_key_backups WHERE user_id = $1", userID)

	if err := tx.Commit(ctx); err != nil {
		http.Error(w, `{"error":"failed_to_delete_backup"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"status": "deleted"})
}

// UploadAttachment handles POST /api/e2ee/attachments
func (h *E2EEHandler) UploadAttachment(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	// 50 MB limit
	r.Body = http.MaxBytesReader(w, r.Body, 50<<20)

	data, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, `{"error":"file too large or failed to read"}`, http.StatusBadRequest)
		return
	}

	if len(data) == 0 {
		http.Error(w, `{"error":"attachment cannot be empty"}`, http.StatusBadRequest)
		return
	}

	attachmentID := uuid.New()
	uploadDir := filepath.Join("uploads", "e2ee_attachments")
	if err := os.MkdirAll(uploadDir, 0755); err != nil {
		http.Error(w, `{"error":"failed to create upload directory"}`, http.StatusInternalServerError)
		return
	}

	filePath := filepath.Join(uploadDir, attachmentID.String()+".bin")
	if err := os.WriteFile(filePath, data, 0644); err != nil {
		http.Error(w, `{"error":"failed to write attachment file"}`, http.StatusInternalServerError)
		return
	}

	fileSize := int64(len(data))
	_, err = h.db.Pool.Exec(r.Context(), `
		INSERT INTO e2ee_attachments (id, uploader_id, file_size)
		VALUES ($1, $2, $3)
	`, attachmentID, userID, fileSize)
	if err != nil {
		_ = os.Remove(filePath)
		http.Error(w, `{"error":"failed to save attachment metadata"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]any{
		"id":       attachmentID,
		"url":      "/api/e2ee/attachments/" + attachmentID.String(),
		"filename": "encrypted.bin",
		"size":     fileSize,
	})
}

// DownloadAttachment handles GET /api/e2ee/attachments/{id}
func (h *E2EEHandler) DownloadAttachment(w http.ResponseWriter, r *http.Request) {
	_, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	attachmentIDStr := chi.URLParam(r, "id")
	attachmentID, err := uuid.Parse(attachmentIDStr)
	if err != nil {
		http.Error(w, `{"error":"invalid attachment id"}`, http.StatusBadRequest)
		return
	}

	uploadDir := filepath.Join("uploads", "e2ee_attachments")
	filePath := filepath.Join(uploadDir, attachmentID.String()+".bin")

	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		http.Error(w, `{"error":"attachment not found"}`, http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Disposition", `attachment; filename="encrypted.bin"`)
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Cache-Control", "private, max-age=86400")

	http.ServeFile(w, r, filePath)
}

// SubmitKeyRequest handles POST /api/e2ee/key-requests
func (h *E2EEHandler) SubmitKeyRequest(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var req models.E2EEKeyRequestPayload
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request payload"}`, http.StatusBadRequest)
		return
	}

	if req.SessionID == "" || req.ConversationID == uuid.Nil || req.RequesterDeviceID == uuid.Nil {
		http.Error(w, `{"error":"missing required fields"}`, http.StatusBadRequest)
		return
	}

	// 1. Verify requester device belongs to authenticated user and is not revoked
	var devOwnerID uuid.UUID
	var revokedAt *time.Time
	err := h.db.Pool.QueryRow(r.Context(), "SELECT user_id, revoked_at FROM e2ee_devices WHERE id = $1", req.RequesterDeviceID).Scan(&devOwnerID, &revokedAt)
	if err != nil || devOwnerID != userID || revokedAt != nil {
		http.Error(w, `{"error":"invalid or revoked requester device"}`, http.StatusForbidden)
		return
	}

	// 2. Audience validation: verify requester belongs to conversation
	switch req.ConversationType {
	case models.ConversationTypeDM:
		var isParticipant bool
		h.db.Pool.QueryRow(r.Context(), "SELECT EXISTS(SELECT 1 FROM dm_rooms WHERE id = $1 AND (user1_id = $2 OR user2_id = $2))", req.ConversationID, userID).Scan(&isParticipant)
		if !isParticipant {
			http.Error(w, `{"error":"forbidden: not a participant of conversation"}`, http.StatusForbidden)
			return
		}
	case models.ConversationTypeDMGroup:
		var isMember bool
		h.db.Pool.QueryRow(r.Context(), "SELECT EXISTS(SELECT 1 FROM dm_group_members WHERE group_id = $1 AND user_id = $2)", req.ConversationID, userID).Scan(&isMember)
		if !isMember {
			http.Error(w, `{"error":"forbidden: not a member of dm group"}`, http.StatusForbidden)
			return
		}
	case models.ConversationTypeChannel:
		var guildID uuid.UUID
		var isPrivate bool
		err := h.db.Pool.QueryRow(r.Context(), "SELECT guild_id, is_private FROM channels WHERE id = $1", req.ConversationID).Scan(&guildID, &isPrivate)
		if err != nil {
			http.Error(w, `{"error":"channel not found"}`, http.StatusNotFound)
			return
		}
		var isMember bool
		h.db.Pool.QueryRow(r.Context(), "SELECT EXISTS(SELECT 1 FROM guild_members WHERE guild_id = $1 AND user_id = $2)", guildID, userID).Scan(&isMember)
		if !isMember {
			http.Error(w, `{"error":"forbidden: not a member of guild"}`, http.StatusForbidden)
			return
		}
	default:
		http.Error(w, `{"error":"invalid conversation type"}`, http.StatusBadRequest)
		return
	}

	// 3. Find recipient devices in this conversation (excluding requester's own device)
	var recipientDeviceIDs []uuid.UUID
	switch req.ConversationType {
	case models.ConversationTypeDM:
		query := `
			SELECT d.id
			FROM e2ee_devices d
			INNER JOIN dm_rooms r ON (r.user1_id = d.user_id OR r.user2_id = d.user_id)
			WHERE r.id = $1 AND d.revoked_at IS NULL AND d.id != $2
		`
		rows, err := h.db.Pool.Query(r.Context(), query, req.ConversationID, req.RequesterDeviceID)
		if err == nil {
			defer rows.Close()
			for rows.Next() {
				var devID uuid.UUID
				if err := rows.Scan(&devID); err == nil {
					recipientDeviceIDs = append(recipientDeviceIDs, devID)
				}
			}
		}
	case models.ConversationTypeDMGroup:
		query := `
			SELECT d.id
			FROM e2ee_devices d
			INNER JOIN dm_group_members gm ON gm.user_id = d.user_id
			WHERE gm.group_id = $1 AND d.revoked_at IS NULL AND d.id != $2
		`
		rows, err := h.db.Pool.Query(r.Context(), query, req.ConversationID, req.RequesterDeviceID)
		if err == nil {
			defer rows.Close()
			for rows.Next() {
				var devID uuid.UUID
				if err := rows.Scan(&devID); err == nil {
					recipientDeviceIDs = append(recipientDeviceIDs, devID)
				}
			}
		}
	case models.ConversationTypeChannel:
		query := `
			SELECT d.id
			FROM e2ee_devices d
			INNER JOIN channels c ON true
			INNER JOIN guild_members gm ON gm.guild_id = c.guild_id AND gm.user_id = d.user_id
			WHERE c.id = $1 AND d.revoked_at IS NULL AND d.id != $2
		`
		rows, err := h.db.Pool.Query(r.Context(), query, req.ConversationID, req.RequesterDeviceID)
		if err == nil {
			defer rows.Close()
			for rows.Next() {
				var devID uuid.UUID
				if err := rows.Scan(&devID); err == nil {
					recipientDeviceIDs = append(recipientDeviceIDs, devID)
				}
			}
		}
	}

	// 4. Queue to-device message for each recipient device and forward in real time
	payloadBytes, _ := json.Marshal(req)
	payloadStr := string(payloadBytes)

	notifiedCount := 0
	for _, targetDevID := range recipientDeviceIDs {
		var toDeviceID uuid.UUID
		qErr := h.db.Pool.QueryRow(r.Context(), `
			INSERT INTO e2ee_to_device (recipient_device_id, sender_device_id, msg_type, payload)
			VALUES ($1, $2, 'key_request', $3)
			RETURNING id
		`, targetDevID, req.RequesterDeviceID, payloadStr).Scan(&toDeviceID)
		if qErr == nil {
			notifiedCount++
			// Real-time dispatch via WebSocket to recipient device
			h.hub.SendToDevice(targetDevID, models.WSEvent{
				Type: models.EventE2EEToDevice,
				Data: map[string]any{
					"id":                  toDeviceID,
					"recipient_device_id": targetDevID,
					"sender_device_id":    req.RequesterDeviceID,
					"msg_type":            "key_request",
					"payload":             payloadStr,
					"created_at":          time.Now().UTC(),
				},
			})
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"status":           "queued",
		"session_id":       req.SessionID,
		"notified_devices": notifiedCount,
	})
}

// ---------------------------------------------------------------------
// 7. E2EE Room Keys
// ---------------------------------------------------------------------

func (h *E2EEHandler) verifyAndResolveConversationType(ctx context.Context, convID uuid.UUID, userID uuid.UUID) (string, bool) {
	var dummy int
	// DM
	if err := h.db.Pool.QueryRow(ctx, "SELECT 1 FROM dm_rooms WHERE id = $1 AND (user1_id = $2 OR user2_id = $2)", convID, userID).Scan(&dummy); err == nil {
		return string(models.ConversationTypeDM), true
	}
	// DM Group
	if err := h.db.Pool.QueryRow(ctx, "SELECT 1 FROM dm_group_members WHERE group_id = $1 AND user_id = $2", convID, userID).Scan(&dummy); err == nil {
		return string(models.ConversationTypeDMGroup), true
	}
	// Channel
	if err := h.db.Pool.QueryRow(ctx, `
		SELECT 1 FROM channels c
		INNER JOIN guild_members gm ON gm.guild_id = c.guild_id
		WHERE c.id = $1 AND gm.user_id = $2
	`, convID, userID).Scan(&dummy); err == nil {
		return string(models.ConversationTypeChannel), true
	}
	return "", false
}

// SaveRoomKey handles POST /api/e2ee/room-keys
func (h *E2EEHandler) SaveRoomKey(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"method_not_allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var req models.SaveRoomKeyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid_request"}`, http.StatusBadRequest)
		return
	}

	if req.ConversationID == uuid.Nil || strings.TrimSpace(req.SessionID) == "" || strings.TrimSpace(req.SessionKey) == "" {
		http.Error(w, `{"error":"invalid_room_key_payload"}`, http.StatusBadRequest)
		return
	}

	if req.Epoch < 1 {
		req.Epoch = 1
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	resolvedType, isMember := h.verifyAndResolveConversationType(ctx, req.ConversationID, userID)
	if !isMember {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}
	req.ConversationType = resolvedType

	query := `
		INSERT INTO e2ee_room_keys (conversation_type, conversation_id, session_id, session_key, sender_device_id, epoch, created_by)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		ON CONFLICT (conversation_id, session_id) DO UPDATE SET
			session_key = EXCLUDED.session_key,
			epoch = GREATEST(e2ee_room_keys.epoch, EXCLUDED.epoch)
	`
	_, err := h.db.Pool.Exec(ctx, query, req.ConversationType, req.ConversationID, req.SessionID, req.SessionKey, req.SenderDeviceID, req.Epoch, userID)
	if err != nil {
		log.Printf("[E2EE] Failed to save room key: %v", err)
		http.Error(w, `{"error":"failed_to_save_room_key"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]any{"status": "ok"})
}

// SaveRoomKeysBatch handles POST /api/e2ee/room-keys/batch
func (h *E2EEHandler) SaveRoomKeysBatch(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"method_not_allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var req models.BatchSaveRoomKeysRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid_request"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()

	savedCount := 0
	for _, k := range req.Keys {
		if k.ConversationID == uuid.Nil || strings.TrimSpace(k.SessionID) == "" || strings.TrimSpace(k.SessionKey) == "" {
			continue
		}
		if k.Epoch < 1 {
			k.Epoch = 1
		}

		resolvedType, isMember := h.verifyAndResolveConversationType(ctx, k.ConversationID, userID)
		if !isMember {
			continue
		}

		query := `
			INSERT INTO e2ee_room_keys (conversation_type, conversation_id, session_id, session_key, sender_device_id, epoch, created_by)
			VALUES ($1, $2, $3, $4, $5, $6, $7)
			ON CONFLICT (conversation_id, session_id) DO UPDATE SET
				session_key = EXCLUDED.session_key,
				epoch = GREATEST(e2ee_room_keys.epoch, EXCLUDED.epoch)
		`
		if _, err := h.db.Pool.Exec(ctx, query, resolvedType, k.ConversationID, k.SessionID, k.SessionKey, k.SenderDeviceID, k.Epoch, userID); err == nil {
			savedCount++
		}
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]any{"status": "ok", "saved_count": savedCount})
}

// GetMyRoomKeys handles GET /api/e2ee/my-room-keys
func (h *E2EEHandler) GetMyRoomKeys(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, `{"error":"method_not_allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	query := `
		SELECT rk.id, rk.conversation_type, rk.conversation_id, rk.session_id, rk.session_key, rk.sender_device_id, rk.epoch, rk.created_by, rk.created_at
		FROM e2ee_room_keys rk
		WHERE (
			rk.conversation_type = 'dm' AND rk.conversation_id IN (
				SELECT id FROM dm_rooms WHERE user1_id = $1 OR user2_id = $1
			)
		) OR (
			rk.conversation_type = 'dm_group' AND rk.conversation_id IN (
				SELECT group_id FROM dm_group_members WHERE user_id = $1
			)
		) OR (
			rk.conversation_type = 'channel' AND rk.conversation_id IN (
				SELECT c.id FROM channels c
				INNER JOIN guild_members gm ON gm.guild_id = c.guild_id
				WHERE gm.user_id = $1
			)
		)
		ORDER BY rk.created_at ASC
	`

	rows, err := h.db.Pool.Query(ctx, query, userID)
	if err != nil {
		log.Printf("[E2EE] Failed to query user room keys: %v", err)
		http.Error(w, `{"error":"failed_to_get_room_keys"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	keys := make([]models.E2EERoomKeyResponse, 0)
	for rows.Next() {
		var k models.E2EERoomKeyResponse
		if err := rows.Scan(
			&k.ID,
			&k.ConversationType,
			&k.ConversationID,
			&k.SessionID,
			&k.SessionKey,
			&k.SenderDeviceID,
			&k.Epoch,
			&k.CreatedBy,
			&k.CreatedAt,
		); err != nil {
			log.Printf("[E2EE] Failed to scan room key: %v", err)
			http.Error(w, `{"error":"internal_error"}`, http.StatusInternalServerError)
			return
		}
		keys = append(keys, k)
	}

	if err := rows.Err(); err != nil {
		log.Printf("[E2EE] Rows error on room keys: %v", err)
		http.Error(w, `{"error":"internal_error"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(keys)
}

// GetConversationRoomKeys handles GET /api/e2ee/conversations/{conversation_id}/keys
func (h *E2EEHandler) GetConversationRoomKeys(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, `{"error":"method_not_allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	convIDStr := chi.URLParam(r, "conversation_id")
	convID, err := uuid.Parse(convIDStr)
	if err != nil {
		http.Error(w, `{"error":"invalid_conversation_id"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	var authorized bool
	err = h.db.Pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM dm_rooms WHERE id = $1 AND (user1_id = $2 OR user2_id = $2)
			UNION ALL
			SELECT 1 FROM dm_group_members WHERE group_id = $1 AND user_id = $2
			UNION ALL
			SELECT 1 FROM channels c INNER JOIN guild_members gm ON gm.guild_id = c.guild_id WHERE c.id = $1 AND gm.user_id = $2
		)
	`, convID, userID).Scan(&authorized)
	if err != nil || !authorized {
		http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
		return
	}

	query := `
		SELECT id, conversation_type, conversation_id, session_id, session_key, sender_device_id, epoch, created_by, created_at
		FROM e2ee_room_keys
		WHERE conversation_id = $1
		ORDER BY created_at ASC
	`
	rows, err := h.db.Pool.Query(ctx, query, convID)
	if err != nil {
		log.Printf("[E2EE] Failed to query conversation room keys: %v", err)
		http.Error(w, `{"error":"failed_to_get_room_keys"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	keys := make([]models.E2EERoomKeyResponse, 0)
	for rows.Next() {
		var k models.E2EERoomKeyResponse
		if err := rows.Scan(
			&k.ID,
			&k.ConversationType,
			&k.ConversationID,
			&k.SessionID,
			&k.SessionKey,
			&k.SenderDeviceID,
			&k.Epoch,
			&k.CreatedBy,
			&k.CreatedAt,
		); err != nil {
			log.Printf("[E2EE] Failed to scan conversation room key: %v", err)
			http.Error(w, `{"error":"internal_error"}`, http.StatusInternalServerError)
			return
		}
		keys = append(keys, k)
	}

	if err := rows.Err(); err != nil {
		log.Printf("[E2EE] Rows error on conversation room keys: %v", err)
		http.Error(w, `{"error":"internal_error"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(keys)
}

