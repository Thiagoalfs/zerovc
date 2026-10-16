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
	"log"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/zerovc/zerovc/backend/internal/auth"
	"github.com/zerovc/zerovc/backend/internal/database"
	"github.com/zerovc/zerovc/backend/internal/gateway"
	"github.com/zerovc/zerovc/backend/internal/middleware"
	"github.com/zerovc/zerovc/backend/internal/models"
)

type E2EEHandler struct {
	db  *database.DB
	hub *gateway.Hub
}

func NewE2EEHandler(db *database.DB, hub *gateway.Hub) *E2EEHandler {
	return &E2EEHandler{
		db:  db,
		hub: hub,
	}
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

// ComputeRosterHash computes the SHA-256 digest of a roster for chaining.
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

// ComputeAudienceHash computes the deterministic canonical audience hash over members and devices.
func ComputeAudienceHash(members []uuid.UUID, devices []models.E2EERosterDeviceSnapshot) string {
	sortedMembers := make([]string, len(members))
	for i, m := range members {
		sortedMembers[i] = m.String()
	}
	sort.Strings(sortedMembers)

	sortedDevices := make([]string, len(devices))
	for i, d := range devices {
		sortedDevices[i] = fmt.Sprintf("%s:%s", d.UserID.String(), d.DeviceID.String())
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
		"status":   "created",
		"user_id":  userID,
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
	// Check canonical format first
	canonicalPayload := CanonicalDeviceSigningPayload(userID, req.Curve25519Key, req.Ed25519Key)
	sigErr := VerifyEd25519Signature(identityPubKey, canonicalPayload, req.IdentitySignature)
	if sigErr != nil {
		// Fallback verification over simple concatenation curve25519:ed25519
		altPayload := []byte(fmt.Sprintf("%s:%s", req.Curve25519Key, req.Ed25519Key))
		if VerifyEd25519Signature(identityPubKey, altPayload, req.IdentitySignature) != nil {
			http.Error(w, `{"error":"invalid_device_identity_signature"}`, http.StatusBadRequest)
			return
		}
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
		http.Error(w, `{"error":"transaction_commit_failed"}`, http.StatusInternalServerError)
		return
	}

	// 4. Broadcast device list update event
	if h.hub != nil {
		h.hub.BroadcastGlobal(models.WSEvent{
			Type: models.EventE2EEDeviceListUpdate,
			Data: map[string]any{
				"action":    "add",
				"user_id":   userID,
				"device_id": deviceID,
			},
		})
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]any{
		"device_id":  deviceID,
		"created_at": createdAt,
		"status":     "registered",
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
	json.NewEncoder(w).Encode(map[string]any{
		"devices": devices,
	})
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

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"status":    "revoked",
		"device_id": deviceID,
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
	for _, otk := range req.OneTimeKeys {
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
				SELECT id FROM e2ee_one_time_keys
				WHERE device_id = $1 AND claimed_at IS NULL
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

	// Get sender's active device
	var senderDeviceID uuid.UUID
	err := h.db.Pool.QueryRow(ctx, `
		SELECT id FROM e2ee_devices
		WHERE user_id = $1 AND revoked_at IS NULL
		ORDER BY created_at DESC
		LIMIT 1
	`, userID).Scan(&senderDeviceID)
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

		var msgID uuid.UUID
		var createdAt time.Time
		err = h.db.Pool.QueryRow(ctx, `
			INSERT INTO e2ee_to_device (recipient_device_id, sender_device_id, msg_type, payload, created_at)
			VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
			RETURNING id, created_at
		`, m.RecipientDeviceID, senderDeviceID, m.MsgType, m.Payload).Scan(&msgID, &createdAt)

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
					SenderDeviceID:    senderDeviceID,
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
	json.NewEncoder(w).Encode(map[string]any{
		"messages": messages,
	})
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
		json.NewEncoder(w).Encode(map[string]any{"acknowledged": 0})
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
		SELECT conversation_type, conversation_id, version, epoch, audience_hash, signer_user_id, signer_device_id, prev_roster_hash
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
	)

	var expectedVersion int64 = 1
	var expectedPrevHash string = ""

	if err == nil {
		latest.PrevRosterHash = prevHash
		expectedVersion = latest.Version + 1
		expectedPrevHash = ComputeRosterHash(&latest)
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

	// Chaining hash verification
	reqPrevHash := ""
	if req.PrevRosterHash != nil {
		reqPrevHash = *req.PrevRosterHash
	}
	if expectedPrevHash != "" && reqPrevHash != expectedPrevHash {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusConflict)
		json.NewEncoder(w).Encode(map[string]any{
			"error":              "e2ee_roster_hash_mismatch",
			"expected_prev_hash": expectedPrevHash,
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

	canonicalPayload := CanonicalRosterSigningPayload(
		req.ConversationType,
		req.ConversationID,
		req.Version,
		req.Epoch,
		reqPrevHash,
		req.AudienceHash,
		userID,
		req.SignerDeviceID,
	)

	if err := VerifyEd25519Signature(signerIdentityPubKey, canonicalPayload, req.Signature); err != nil {
		http.Error(w, `{"error":"invalid_roster_signature"}`, http.StatusBadRequest)
		return
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
		req.Members, req.Devices, userID, req.SignerDeviceID,
		req.PrevRosterHash, req.AudienceHash, req.Signature,
	).Scan(&createdAt)
	if err != nil {
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

type UploadBackupRequest struct {
	BackupPublicKey   string `json:"backup_public_key"`
	WrappedPrivateKey string `json:"wrapped_private_key"`
	Version           int64  `json:"version"`
}

// UploadBackup handles POST /api/e2ee/backup
func (h *E2EEHandler) UploadBackup(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var req UploadBackupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid_request"}`, http.StatusBadRequest)
		return
	}

	if req.BackupPublicKey == "" || req.WrappedPrivateKey == "" {
		http.Error(w, `{"error":"missing_backup_keys"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	_, err := h.db.Pool.Exec(ctx, `
		INSERT INTO e2ee_key_backups (user_id, backup_public_key, wrapped_private_key, version, updated_at)
		VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
		ON CONFLICT (user_id) DO UPDATE SET
			backup_public_key = EXCLUDED.backup_public_key,
			wrapped_private_key = EXCLUDED.wrapped_private_key,
			version = EXCLUDED.version,
			updated_at = CURRENT_TIMESTAMP
	`, userID, req.BackupPublicKey, req.WrappedPrivateKey, req.Version)
	if err != nil {
		http.Error(w, `{"error":"failed_to_save_backup"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"status": "saved", "version": req.Version})
}

// GetBackup handles GET /api/e2ee/backup
func (h *E2EEHandler) GetBackup(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserIDFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	var backup models.E2EEKeyBackup
	err := h.db.Pool.QueryRow(ctx, `
		SELECT user_id, backup_public_key, wrapped_private_key, version, created_at, updated_at
		FROM e2ee_key_backups
		WHERE user_id = $1
	`, userID).Scan(
		&backup.UserID,
		&backup.BackupPublicKey,
		&backup.WrappedPrivateKey,
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

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(backup)
}

// DeleteBackup handles POST /api/e2ee/backup/delete
// (Strict POST method compliance per user global security rules)
func (h *E2EEHandler) DeleteBackup(w http.ResponseWriter, r *http.Request) {
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
