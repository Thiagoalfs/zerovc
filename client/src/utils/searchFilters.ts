import { BaseMessage, User, Channel } from '../types';

export interface ParsedSearchQuery {
  fromAuthors: string[]; // usernames or display names (lowercased)
  inChannels: string[]; // channel names (lowercased)
  hasTypes: string[]; // 'image', 'video', 'file', 'link', 'audio', 'reaction'
  mentionsUsers: string[]; // usernames (lowercased)
  isPinned: boolean | null; // true, false, or null if not filtered
  beforeDate: Date | null;
  afterDate: Date | null;
  duringDate: string | null; // 'YYYY-MM-DD'
  freeText: string; // Remaining text query
  rawQuery: string;
}

/**
 * Parses search query string containing Discord-like filter tags.
 * Supports both Portuguese and English syntax (e.g. `de:` / `from:`, `tem:` / `has:`).
 */
export function parseSearchQuery(query: string): ParsedSearchQuery {
  const result: ParsedSearchQuery = {
    fromAuthors: [],
    inChannels: [],
    hasTypes: [],
    mentionsUsers: [],
    isPinned: null,
    beforeDate: null,
    afterDate: null,
    duringDate: null,
    freeText: '',
    rawQuery: query,
  };

  if (!query || !query.trim()) {
    return result;
  }

  // Tokenize query keeping quoted strings intact
  const tokens: string[] = [];
  const regex = /(?:[^\s"']+|"[^"]*"|'[^']*')+/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(query)) !== null) {
    tokens.push(match[0]);
  }

  const freeTextWords: string[] = [];

  for (const token of tokens) {
    const lower = token.toLowerCase();

    // 1. Author filter: `de:` or `from:`
    if (lower.startsWith('de:') || lower.startsWith('from:')) {
      const val = cleanTagValue(token.slice(token.indexOf(':') + 1));
      if (val) result.fromAuthors.push(val.toLowerCase().replace(/^@/, ''));
      continue;
    }

    // 2. Channel filter: `em:` or `in:`
    if (lower.startsWith('em:') || lower.startsWith('in:')) {
      const val = cleanTagValue(token.slice(token.indexOf(':') + 1));
      if (val) result.inChannels.push(val.toLowerCase().replace(/^#/, ''));
      continue;
    }

    // 3. Mentions filter: `menciona:` or `mentions:`
    if (lower.startsWith('menciona:') || lower.startsWith('mentions:')) {
      const val = cleanTagValue(token.slice(token.indexOf(':') + 1));
      if (val) result.mentionsUsers.push(val.toLowerCase().replace(/^@/, ''));
      continue;
    }

    // 4. Has attachment / media filter: `tem:` or `has:`
    if (lower.startsWith('tem:') || lower.startsWith('has:')) {
      const rawVal = cleanTagValue(token.slice(token.indexOf(':') + 1)).toLowerCase();
      const normalized = normalizeHasType(rawVal);
      if (normalized) result.hasTypes.push(normalized);
      continue;
    }

    // 5. Pinned filter: `fixado:` or `pinned:`
    if (lower.startsWith('fixado:') || lower.startsWith('pinned:')) {
      const val = cleanTagValue(token.slice(token.indexOf(':') + 1)).toLowerCase();
      if (['sim', 'true', '1', 'yes'].includes(val)) {
        result.isPinned = true;
      } else if (['nao', 'não', 'false', '0', 'no'].includes(val)) {
        result.isPinned = false;
      }
      continue;
    }

    // 6. Before date filter: `antes:` or `before:`
    if (lower.startsWith('antes:') || lower.startsWith('before:')) {
      const val = cleanTagValue(token.slice(token.indexOf(':') + 1));
      const parsed = new Date(val);
      if (!isNaN(parsed.getTime())) {
        result.beforeDate = parsed;
      }
      continue;
    }

    // 7. After date filter: `depois:` or `after:`
    if (lower.startsWith('depois:') || lower.startsWith('after:')) {
      const val = cleanTagValue(token.slice(token.indexOf(':') + 1));
      const parsed = new Date(val);
      if (!isNaN(parsed.getTime())) {
        result.afterDate = parsed;
      }
      continue;
    }

    // 8. During date filter: `durante:` or `during:`
    if (lower.startsWith('durante:') || lower.startsWith('during:')) {
      const val = cleanTagValue(token.slice(token.indexOf(':') + 1));
      if (val) result.duringDate = val;
      continue;
    }

    // Regular free text word
    freeTextWords.push(cleanTagValue(token));
  }

  result.freeText = freeTextWords.join(' ').trim();
  return result;
}

function cleanTagValue(val: string): string {
  if (!val) return '';
  return val.replace(/^["']|["']$/g, '').trim();
}

function normalizeHasType(type: string): string | null {
  if (['imagem', 'image', 'foto', 'photo', 'img'].includes(type)) return 'image';
  if (['video', 'vídeo', 'vid'].includes(type)) return 'video';
  if (['audio', 'áudio', 'voz', 'sound', 'som', 'voice'].includes(type)) return 'audio';
  if (['arquivo', 'file', 'documento', 'doc', 'anexo', 'attachment'].includes(type)) return 'file';
  if (['link', 'url', 'site'].includes(type)) return 'link';
  if (['reacao', 'reação', 'reaction', 'react'].includes(type)) return 'reaction';
  if (['fixado', 'pinned', 'pin'].includes(type)) return 'pinned';
  return type;
}

/**
 * Filters a list of messages based on the parsed search query.
 */
export function filterMessages<T extends BaseMessage>(messages: T[], parsed: ParsedSearchQuery): T[] {
  if (!messages || messages.length === 0) return [];

  const hasAnyFilter =
    parsed.fromAuthors.length > 0 ||
    parsed.hasTypes.length > 0 ||
    parsed.mentionsUsers.length > 0 ||
    parsed.isPinned !== null ||
    parsed.beforeDate !== null ||
    parsed.afterDate !== null ||
    parsed.duringDate !== null ||
    parsed.freeText.length > 0;

  if (!hasAnyFilter) {
    return messages;
  }

  const freeTextLower = parsed.freeText.toLowerCase();

  return messages.filter((msg) => {
    // 1. Author Filter
    if (parsed.fromAuthors.length > 0) {
      const authorUsername = (msg.author?.username || '').toLowerCase();
      const authorDisplayName = (msg.author?.display_name || '').toLowerCase();
      const matchesAuthor = parsed.fromAuthors.some(
        (target) => authorUsername.includes(target) || authorDisplayName.includes(target)
      );
      if (!matchesAuthor) return false;
    }

    // 2. Mentions Filter
    if (parsed.mentionsUsers.length > 0) {
      const contentLower = (msg.content || '').toLowerCase();
      const matchesMention = parsed.mentionsUsers.some((target) => {
        return contentLower.includes(`@${target}`) || contentLower.includes(target);
      });
      if (!matchesMention) return false;
    }

    // 3. Has Attachment / Media Filter
    if (parsed.hasTypes.length > 0) {
      const attachments = msg.attachments || [];
      const content = msg.content || '';
      const reactions = msg.reactions || [];

      for (const hasType of parsed.hasTypes) {
        if (hasType === 'image') {
          const hasImgAttachment = attachments.some(
            (a) =>
              a.type?.startsWith('image/') ||
              /\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i.test(a.url || a.filename || '')
          );
          const hasImgMarkdown = /!\[.*?\]\(.*?\)/i.test(content) || /https?:\/\/.*\.(png|jpe?g|gif|webp)(\?.*)?/i.test(content);
          if (!hasImgAttachment && !hasImgMarkdown) return false;
        } else if (hasType === 'video') {
          const hasVidAttachment = attachments.some(
            (a) =>
              a.type?.startsWith('video/') ||
              /\.(mp4|webm|mov|m4v)(\?.*)?$/i.test(a.url || a.filename || '')
          );
          const hasVidUrl = /https?:\/\/.*\.(mp4|webm|mov)(\?.*)?/i.test(content) || /youtube\.com|youtu\.be/i.test(content);
          if (!hasVidAttachment && !hasVidUrl) return false;
        } else if (hasType === 'audio') {
          const hasAudio =
            attachments.some((a) => a.type?.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|webm)(\?.*)?$/i.test(a.filename || '')) ||
            content.startsWith('[Áudio]');
          if (!hasAudio) return false;
        } else if (hasType === 'file') {
          if (attachments.length === 0) return false;
        } else if (hasType === 'link') {
          if (!/https?:\/\/[^\s]+/i.test(content)) return false;
        } else if (hasType === 'reaction') {
          if (reactions.length === 0) return false;
        } else if (hasType === 'pinned') {
          if (!msg.is_pinned) return false;
        }
      }
    }

    // 4. Pinned Filter
    if (parsed.isPinned !== null) {
      if (Boolean(msg.is_pinned) !== parsed.isPinned) return false;
    }

    // 5. Date Filters
    if (msg.created_at) {
      const msgDate = new Date(msg.created_at);
      if (!isNaN(msgDate.getTime())) {
        if (parsed.beforeDate && msgDate >= parsed.beforeDate) return false;
        if (parsed.afterDate && msgDate <= parsed.afterDate) return false;
        if (parsed.duringDate) {
          const iso = msgDate.toISOString().slice(0, 10);
          if (iso !== parsed.duringDate) return false;
        }
      }
    }

    // 6. Free text query
    if (freeTextLower) {
      const contentLower = (msg.content || '').toLowerCase();
      const authorDisplayName = (msg.author?.display_name || '').toLowerCase();
      const authorUsername = (msg.author?.username || '').toLowerCase();
      const matchContent = contentLower.includes(freeTextLower);
      const matchAuthor = authorDisplayName.includes(freeTextLower) || authorUsername.includes(freeTextLower);
      if (!matchContent && !matchAuthor) return false;
    }

    return true;
  });
}
