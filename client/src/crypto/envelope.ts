/**
 * ZeroVC Opt-in E2EE - Canonical Envelopes (RFC 8785 Compatible)
 *
 * Implements Milestone M3 (Requirement R3 §8, §10.1):
 *  - Canonical JSON serialization of message payloads
 *  - Envelope V1 schema for text, attachments, mentions, reactions, and edits
 *  - Strict version gating and schema validation
 */

export interface EnvelopeAttachment {
  url: string;        // Opaque blob URL (/api/e2ee/attachments/...)
  id?: string;        // UUID of the attachment
  name: string;       // Original filename
  mime: string;       // Sanitized MIME type
  size: number;       // Size in bytes
  key: string;        // AES-256-GCM key (Base64)
  iv: string;         // AES-GCM IV (Base64, 96-bit / 12 bytes)
  sha256: string;     // Hex digest SHA-256 of encrypted ciphertext
  w?: number;
  h?: number;
  thumbnail?: {
    url: string;
    key: string;
    iv: string;
    sha256: string;
    width?: number;
    height?: number;
  };
}

export interface EnvelopeEdit {
  target_message_id: string;
  original_created_at?: string;
}

export interface EnvelopeReaction {
  target_message_id: string;
  emoji: string;
  action: 'add' | 'remove';
}

export interface EnvelopeV1 {
  v: 1;
  body: string;
  reply_to?: string;
  attachments?: EnvelopeAttachment[];
  mentions?: string[];
  link_previews?: any[];
  edit?: EnvelopeEdit;
  reaction?: EnvelopeReaction;
}

/**
 * Deterministically serializes values to canonical JSON according to RFC 8785 rules:
 * - Object keys are sorted lexicographically by UTF-16 code units.
 * - Undefined values in objects are omitted.
 * - No whitespace between tokens.
 */
export function canonicalJsonStringify(obj: any): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map((item) => (item === undefined ? 'null' : canonicalJsonStringify(item))).join(',') + ']';
  }
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return '{' + keys.map((k) => `${JSON.stringify(k)}:${canonicalJsonStringify(obj[k])}`).join(',') + '}';
}

/**
 * Serializes an EnvelopeV1 into deterministic, canonical JSON.
 */
export function serializeEnvelope(env: EnvelopeV1): string {
  if (!env || env.v !== 1) {
    throw new Error('UNSUPPORTED_ENVELOPE_VERSION: Only envelope v:1 is supported');
  }
  if (typeof env.body !== 'string') {
    throw new Error('INVALID_ENVELOPE: body must be a string');
  }

  // Construct a sanitized representation omitting undefined properties
  const sanitized: Record<string, any> = {
    v: 1,
    body: env.body,
  };

  if (env.reply_to !== undefined && env.reply_to !== null) {
    sanitized.reply_to = String(env.reply_to);
  }

  if (Array.isArray(env.attachments) && env.attachments.length > 0) {
    sanitized.attachments = env.attachments.map((att) => ({
      url: att.url,
      name: att.name,
      mime: att.mime,
      size: Number(att.size),
      key: att.key,
      iv: att.iv,
      sha256: att.sha256.toLowerCase(),
      ...(att.id ? { id: att.id } : {}),
      ...(att.w !== undefined ? { w: att.w } : {}),
      ...(att.h !== undefined ? { h: att.h } : {}),
      ...(att.thumbnail ? { thumbnail: att.thumbnail } : {}),
    }));
  }

  if (Array.isArray(env.mentions) && env.mentions.length > 0) {
    sanitized.mentions = [...env.mentions].sort();
  }

  if (Array.isArray(env.link_previews) && env.link_previews.length > 0) {
    sanitized.link_previews = env.link_previews;
  }

  if (env.edit) {
    sanitized.edit = {
      target_message_id: env.edit.target_message_id,
      ...(env.edit.original_created_at ? { original_created_at: env.edit.original_created_at } : {}),
    };
  }

  if (env.reaction) {
    sanitized.reaction = {
      target_message_id: env.reaction.target_message_id,
      emoji: env.reaction.emoji,
      action: env.reaction.action === 'remove' ? 'remove' : 'add',
    };
  }

  return canonicalJsonStringify(sanitized);
}

/**
 * Parses and strictly validates a canonical or serialized envelope JSON string.
 */
export function parseEnvelope(serialized: string): EnvelopeV1 {
  let parsed: any;
  try {
    parsed = JSON.parse(serialized);
  } catch (err: any) {
    throw new Error(`MALFORMED_ENVELOPE_JSON: ${err.message}`);
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('MALFORMED_ENVELOPE: Root value must be an object');
  }

  if (parsed.v !== 1) {
    throw new Error(`UNSUPPORTED_ENVELOPE_VERSION: Received version ${parsed.v}, expected 1`);
  }

  if (typeof parsed.body !== 'string') {
    throw new Error('INVALID_ENVELOPE: body must be a string');
  }

  const envelope: EnvelopeV1 = {
    v: 1,
    body: parsed.body,
  };

  if (parsed.reply_to) {
    envelope.reply_to = String(parsed.reply_to);
  }

  if (Array.isArray(parsed.attachments)) {
    envelope.attachments = parsed.attachments.map((att: any) => ({
      url: String(att.url || ''),
      name: String(att.name || ''),
      mime: String(att.mime || 'application/octet-stream'),
      size: Number(att.size || 0),
      key: String(att.key || ''),
      iv: String(att.iv || ''),
      sha256: String(att.sha256 || '').toLowerCase(),
      ...(att.id ? { id: String(att.id) } : {}),
      ...(att.w !== undefined ? { w: Number(att.w) } : {}),
      ...(att.h !== undefined ? { h: Number(att.h) } : {}),
      ...(att.thumbnail ? { thumbnail: att.thumbnail } : {}),
    }));
  }

  if (Array.isArray(parsed.mentions)) {
    envelope.mentions = parsed.mentions.map((m: any) => String(m));
  }

  if (Array.isArray(parsed.link_previews)) {
    envelope.link_previews = parsed.link_previews;
  }

  if (parsed.edit && typeof parsed.edit === 'object') {
    envelope.edit = {
      target_message_id: String(parsed.edit.target_message_id),
      ...(parsed.edit.original_created_at ? { original_created_at: String(parsed.edit.original_created_at) } : {}),
    };
  }

  if (parsed.reaction && typeof parsed.reaction === 'object') {
    envelope.reaction = {
      target_message_id: String(parsed.reaction.target_message_id),
      emoji: String(parsed.reaction.emoji),
      action: parsed.reaction.action === 'remove' ? 'remove' : 'add',
    };
  }

  return envelope;
}

