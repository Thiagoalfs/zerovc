import React, { useState, useMemo } from 'react';
import { Star } from 'lucide-react';
import { useFavoriteGifStore } from '../../stores/favoriteGifStore';
import { formatAssetUrl } from '../../lib/api';
import { GifEmbed } from './GifEmbed';
import { LinkEmbed } from './LinkEmbed';

import { useGuildStore } from '../../stores/guildStore';
import { useAuthStore } from '../../stores/authStore';
import { useDMStore } from '../../stores/dmStore';
import { User, Permissions, GuildEmoji } from '../../types';
import { isPureEmojiMessage, replaceEmojiShortcodes, SHORTCODE_TO_UNICODE } from '../../utils/emojis';

interface FormattedMessageProps {
  content: string;
  className?: string;
  textClassName?: string;
  onPreviewImage?: (url: string) => void;
  onImageLoad?: () => void;
  onOpenUserProfile?: (user: User, position?: { x: number; y: number }) => void;
  onOpenUserContextMenu?: (e: React.MouseEvent, user: User) => void;
}

const isMediaUrl = (url: string) => {
  const clean = url.split('?')[0].toLowerCase();
  const isImg =
    clean.endsWith('.png') ||
    clean.endsWith('.jpg') ||
    clean.endsWith('.jpeg') ||
    clean.endsWith('.gif') ||
    clean.endsWith('.webp') ||
    clean.endsWith('.svg') ||
    clean.endsWith('.bmp') ||
    clean.endsWith('.avif') ||
    url.includes('/assets/user/') ||
    url.includes('/assets/guild/') ||
    url.includes('tenor.com/view/') ||
    url.includes('giphy.com/gifs/') ||
    url.includes('media.tenor.com') ||
    url.includes('c.tenor.com') ||
    url.includes('media.giphy.com') ||
    url.includes('i.giphy.com') ||
    url.includes('klipy') ||
    url.startsWith('data:image/');

  const isVid =
    clean.endsWith('.mp4') ||
    clean.endsWith('.webm') ||
    clean.endsWith('.ogg') ||
    clean.endsWith('.mov') ||
    clean.endsWith('.mkv');

  const isAud =
    clean.endsWith('.mp3') ||
    clean.endsWith('.wav') ||
    clean.endsWith('.ogg') ||
    clean.endsWith('.m4a') ||
    clean.endsWith('.aac') ||
    clean.endsWith('.flac');

  return { isMedia: isImg || isVid || isAud, isImage: isImg, isVideo: isVid, isAudio: isAud };
};

const SpoilerText: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [revealed, setRevealed] = useState(false);

  return (
    <span
      onClick={(e) => {
        e.stopPropagation();
        setRevealed(!revealed);
      }}
      className={`transition-all rounded px-1.5 py-0.5 cursor-pointer select-none inline-block ${
        revealed
          ? 'bg-white/10 text-gray-100'
          : 'bg-background-darkest text-transparent hover:bg-background-darker select-none filter blur-[4px] hover:blur-[2px]'
      }`}
      title={revealed ? 'Clique para ocultar' : 'Clique para revelar spoiler'}
    >
      {children}
    </span>
  );
};

export const FormattedMessage: React.FC<FormattedMessageProps> = ({
  content,
  className = '',
  textClassName = '',
  onPreviewImage,
  onImageLoad,
  onOpenUserProfile,
  onOpenUserContextMenu,
}) => {
  if (!content) return null;

  const { isFavorited } = useFavoriteGifStore();
  const { activeGuild, guilds } = useGuildStore();
  const { user: currentUser } = useAuthStore();
  const guildEmojis = useMemo(() => {
    const list: GuildEmoji[] = [];
    const seen = new Set<string>();
    if (activeGuild?.emojis) {
      for (const e of activeGuild.emojis) {
        if (!seen.has(e.name.toLowerCase())) {
          seen.add(e.name.toLowerCase());
          list.push(e);
        }
      }
    }
    for (const g of guilds) {
      if (g.emojis) {
        for (const e of g.emojis) {
          if (!seen.has(e.name.toLowerCase())) {
            seen.add(e.name.toLowerCase());
            list.push(e);
          }
        }
      }
    }
    return list;
  }, [activeGuild?.emojis, guilds]);
  const guildMembers = activeGuild?.members || [];
  const guildRoles = activeGuild?.roles || [];

  const isJumboji = isPureEmojiMessage(content, guildEmojis);

  // Extract all media links for Discord-like embeds below the text (ignoring code blocks / inline code / emoji tags)
  const contentWithoutCode = content
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`\n]+`/g, '')
    .replace(/<:[a-zA-Z0-9_+-]+:[^>]+>/g, '');

  const urlRegex = /(https?:\/\/[^\s<]+[^<.,:;"')\]\s]|\/assets\/user\/[^\s]+|\/assets\/guild\/[^\s]+|data:image\/[^\s]+)/g;
  const mediaEmbeds: { url: string; isImage: boolean; isVideo: boolean; isAudio: boolean }[] = [];
  const linkEmbedUrls: string[] = [];
  const foundUrls = new Set<string>();

  let matchUrl: RegExpExecArray | null;
  while ((matchUrl = urlRegex.exec(contentWithoutCode)) !== null) {
    const rawUrl = matchUrl[0];
    if (!foundUrls.has(rawUrl)) {
      foundUrls.add(rawUrl);
      const mediaInfo = isMediaUrl(rawUrl);
      if (mediaInfo.isMedia) {
        mediaEmbeds.push({ url: rawUrl, ...mediaInfo });
      } else if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) {
        // HTTP/HTTPS links eligible for OpenGraph embed preview (YouTube, Twitter, GitHub, news, blogs, etc.)
        linkEmbedUrls.push(rawUrl);
      }
    }
  }

  // Remove extracted media URLs from text to display so raw link is not shown alongside the embed
  let textToDisplay = content;
  if (mediaEmbeds.length > 0) {
    for (const media of mediaEmbeds) {
      textToDisplay = textToDisplay.split(media.url).join('');
    }
    textToDisplay = textToDisplay.trim();
  }

  // 1. Process Code blocks first (```code```)
  const codeBlockRegex = /```([a-zA-Z0-9_-]*)\n?([\s\S]*?)```/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  if (textToDisplay.length > 0) {
    while ((match = codeBlockRegex.exec(textToDisplay)) !== null) {
      if (match.index > lastIndex) {
        parts.push(
          renderInlineFormatting(
            textToDisplay.substring(lastIndex, match.index),
            `text-${lastIndex}`,
            isJumboji,
            guildEmojis,
            guildMembers,
            guildRoles,
            currentUser,
            onOpenUserProfile,
            onOpenUserContextMenu
          )
        );
      }
      const lang = match[1];
      const code = match[2];
      parts.push(
        <pre
          key={`code-block-${match.index}`}
          className="my-1.5 p-3 rounded-xl bg-background-darkest border border-white/10 text-xs font-mono text-gray-200 overflow-x-auto selection:bg-brand-500/30"
        >
          {lang && <div className="text-[10px] text-gray-500 uppercase font-bold mb-1 select-none">{lang}</div>}
          <code>{code}</code>
        </pre>
      );
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < textToDisplay.length) {
      parts.push(
        renderInlineFormatting(
          textToDisplay.substring(lastIndex),
          `text-${lastIndex}`,
          isJumboji,
          guildEmojis,
          guildMembers,
          guildRoles,
          currentUser,
          onOpenUserProfile,
          onOpenUserContextMenu
        )
      );
    }
  }

  const hasText = parts.length > 0;
  const hasEmbeds = mediaEmbeds.length > 0;
  const hasLinkEmbeds = linkEmbedUrls.length > 0;

  if (!hasText && !hasEmbeds && !hasLinkEmbeds) return null;

  return (
    <div className={`leading-relaxed break-words ${className}`}>
      {hasText && (
        <div className={`${textClassName} ${isJumboji ? 'text-3xl sm:text-4xl leading-normal' : ''}`}>
          {parts}
        </div>
      )}

      {/* Discord-like Rich Embeds / Image / GIF / Video Previews */}
      {hasEmbeds && (
        <div className={`${hasText ? 'mt-2' : ''} space-y-2 flex flex-col items-start select-none`}>
          {mediaEmbeds.map((media, idx) => {
            const resolvedSrc = formatAssetUrl(media.url);
            const isGif =
              resolvedSrc.includes('.gif') ||
              resolvedSrc.includes('.webp') ||
              resolvedSrc.includes('klipy') ||
              resolvedSrc.includes('giphy') ||
              resolvedSrc.includes('tenor');

            if (media.isVideo) {
              return (
                <div
                  key={idx}
                  className="rounded-2xl overflow-hidden border border-white/10 max-w-sm sm:max-w-md md:max-w-lg bg-black/50 shadow-md"
                >
                  <video
                    src={resolvedSrc}
                    controls
                    preload="metadata"
                    className="max-h-[350px] max-w-full w-auto h-auto rounded-2xl block"
                  />
                </div>
              );
            }

            if (media.isAudio) {
              return (
                <div
                  key={idx}
                  className="p-3 bg-background-darker rounded-2xl border border-white/10 max-w-md w-full shadow-md"
                >
                  <audio src={resolvedSrc} controls className="w-full h-8" />
                </div>
              );
            }

            // Image / GIF Preview
            return (
              <GifEmbed
                key={idx}
                src={resolvedSrc}
                isGif={isGif}
                onPreviewImage={onPreviewImage}
                onImageLoad={onImageLoad}
                className="mt-2 mb-1"
              />
            );
          })}
        </div>
      )}

      {/* Rich Link Previews / OpenGraph Cards (YouTube, Twitter, GitHub, etc.) */}
      {hasLinkEmbeds && (
        <div className={`${hasText || hasEmbeds ? 'mt-2' : ''} space-y-2 flex flex-col items-start`}>
          {linkEmbedUrls.slice(0, 3).map((linkUrl, idx) => (
            <LinkEmbed
              key={idx}
              url={linkUrl}
              onPreviewImage={onPreviewImage}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// Helper for inline tokens: Spoiler, Bold, Italic, Strikethrough, Inline Code, Custom Emojis, Shortcodes, Links, Mentions
function renderInlineFormatting(
  text: string,
  keyPrefix: string,
  isJumboji = false,
  guildEmojis?: GuildEmoji[],
  guildMembers?: User[],
  guildRoles?: any[],
  currentUser?: User | null,
  onOpenUserProfile?: (user: User, position?: { x: number; y: number }) => void,
  onOpenUserContextMenu?: (e: React.MouseEvent, user: User) => void
): React.ReactNode {
  const customMap = new Map<string, GuildEmoji>();
  if (guildEmojis) {
    for (const ge of guildEmojis) {
      customMap.set(ge.name.toLowerCase(), ge);
    }
  }

  const tokenRegex =
    /(\|\|[\s\S]+?\|\||`[^`\n]+`|\*\*[^*]+?\*\*|~~[^~]+?~~|\*[^*\n]+?\*|_[^_\n]+?_|<:[a-zA-Z0-9_+-]+:[^>]+>|:([a-zA-Z0-9_+-]+):|https?:\/\/[^\s<]+[^<.,:;"')\]\s]|@[a-zA-Z0-9_.-]+|@everyone|@here)/g;

  const elements: React.ReactNode[] = [];
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  let count = 0;

  while ((m = tokenRegex.exec(text)) !== null) {
    if (m.index > lastIdx) {
      elements.push(text.substring(lastIdx, m.index));
    }

    const token = m[0];
    const k = `${keyPrefix}-${count++}`;

    if (token.startsWith('<:') && token.endsWith('>')) {
      const matchCustom = token.match(/^<:([a-zA-Z0-9_+-]+):([^>]+)>$/);
      if (matchCustom) {
        const emojiName = matchCustom[1];
        const emojiUrl = matchCustom[2];
        elements.push(
          <img
            key={k}
            src={formatAssetUrl(emojiUrl)}
            alt={`:${emojiName}:`}
            title={`:${emojiName}:`}
            draggable={false}
            className={`${
              isJumboji ? 'h-12 w-12 inline-block' : 'h-6 w-6 inline-block'
            } align-middle object-contain mx-0.5 select-none`}
          />
        );
      } else {
        elements.push(token);
      }
    } else if (token.startsWith(':') && token.endsWith(':') && token.length > 2) {
      const cleanName = token.slice(1, -1).toLowerCase();
      const customEmoji = customMap.get(cleanName);
      if (customEmoji) {
        elements.push(
          <img
            key={k}
            src={formatAssetUrl(customEmoji.image_url)}
            alt={`:${customEmoji.name}:`}
            title={`:${customEmoji.name}:`}
            draggable={false}
            className={`${
              isJumboji ? 'h-12 w-12 inline-block' : 'h-6 w-6 inline-block'
            } align-middle object-contain mx-0.5 select-none`}
          />
        );
      } else {
        const unicode = SHORTCODE_TO_UNICODE.get(cleanName);
        if (unicode) {
          elements.push(unicode);
        } else {
          elements.push(token);
        }
      }
    } else if (token.startsWith('||') && token.endsWith('||') && token.length >= 4) {
      const inner = token.substring(2, token.length - 2);
      elements.push(
        <SpoilerText key={k}>
          {renderInlineFormatting(
            inner,
            `${k}-sp`,
            isJumboji,
            guildEmojis,
            guildMembers,
            guildRoles,
            currentUser,
            onOpenUserProfile,
            onOpenUserContextMenu
          )}
        </SpoilerText>
      );
    } else if (token.startsWith('`') && token.endsWith('`') && token.length >= 2) {
      const inner = token.substring(1, token.length - 1);
      elements.push(
        <code
          key={k}
          className="px-1.5 py-0.5 rounded-md bg-background-darkest border border-white/10 font-mono text-[12px] text-brand-300"
        >
          {inner}
        </code>
      );
    } else if (token.startsWith('**') && token.endsWith('**') && token.length >= 4) {
      const inner = token.substring(2, token.length - 2);
      elements.push(
        <strong key={k} className="font-bold text-white">
          {renderInlineFormatting(
            inner,
            `${k}-b`,
            isJumboji,
            guildEmojis,
            guildMembers,
            guildRoles,
            currentUser,
            onOpenUserProfile,
            onOpenUserContextMenu
          )}
        </strong>
      );
    } else if (token.startsWith('~~') && token.endsWith('~~') && token.length >= 4) {
      const inner = token.substring(2, token.length - 2);
      elements.push(
        <del key={k} className="line-through text-gray-400">
          {renderInlineFormatting(
            inner,
            `${k}-s`,
            isJumboji,
            guildEmojis,
            guildMembers,
            guildRoles,
            currentUser,
            onOpenUserProfile,
            onOpenUserContextMenu
          )}
        </del>
      );
    } else if (
      (token.startsWith('*') && token.endsWith('*') && token.length >= 2) ||
      (token.startsWith('_') && token.endsWith('_') && token.length >= 2)
    ) {
      const inner = token.substring(1, token.length - 1);
      elements.push(
        <em key={k} className="italic text-gray-200">
          {renderInlineFormatting(
            inner,
            `${k}-i`,
            isJumboji,
            guildEmojis,
            guildMembers,
            guildRoles,
            currentUser,
            onOpenUserProfile,
            onOpenUserContextMenu
          )}
        </em>
      );
    } else if (token.startsWith('http://') || token.startsWith('https://')) {
      elements.push(
        <a
          key={k}
          href={token}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-brand-400 hover:text-brand-300 hover:underline inline-flex items-center gap-0.5 break-all cursor-pointer"
        >
          {token}
        </a>
      );
    } else if (token.startsWith('@')) {
      const isGlobal = token === '@everyone' || token === '@here';
      const targetName = token.slice(1).toLowerCase();

      // Check for matching role
      const matchedRole = guildRoles?.find((r) => r.name.toLowerCase() === targetName);

      // Check for matching member
      const matchedMember = guildMembers?.find(
        (m) =>
          m.username.toLowerCase() === targetName ||
          (m.display_name && m.display_name.toLowerCase() === targetName)
      );

      const currentUserRoles = currentUser && guildMembers
        ? (guildMembers.find((m) => m.id === currentUser.id)?.roles || [])
        : [];

      const isUserInRole = matchedRole && currentUserRoles.some((r) => r.id === matchedRole.id);
      const isSelfMention =
        isUserInRole ||
        (currentUser &&
          (token.toLowerCase() === `@${currentUser.username.toLowerCase()}` ||
            (currentUser.display_name && token.toLowerCase() === `@${currentUser.display_name.toLowerCase()}`) ||
            token === '@everyone'));

      if (matchedRole) {
        elements.push(
          <span
            key={k}
            className="font-medium px-1.5 py-0.5 rounded-md text-[13px] inline-flex items-center gap-1 mx-0.5 cursor-pointer transition-all duration-150 select-none hover:brightness-110 active:scale-95"
            style={{
              backgroundColor: `${matchedRole.color || '#5865F2'}22`,
              color: matchedRole.color || '#8EA1E1',
              border: `1px solid ${matchedRole.color || '#5865F2'}44`,
            }}
            title={`Cargo @${matchedRole.name}`}
            onClick={(e) => e.stopPropagation()}
          >
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: matchedRole.color || '#5865F2' }}
            />
            <span>{token}</span>
          </span>
        );
      } else if (matchedMember || isGlobal) {
        const roleColor = matchedMember?.roles?.[0]?.color;
        elements.push(
          <span
            key={k}
            onClick={(e) => {
              e.stopPropagation();
              if (matchedMember) {
                onOpenUserProfile?.(matchedMember, { x: e.clientX, y: e.clientY });
              }
            }}
            onContextMenu={(e) => {
              if (matchedMember && onOpenUserContextMenu) {
                e.preventDefault();
                e.stopPropagation();
                onOpenUserContextMenu(e, matchedMember);
              }
            }}
            className={`font-semibold px-1.5 py-0.5 rounded-md text-[13px] inline-flex items-center gap-1 mx-0.5 transition-all duration-150 select-none ${
              matchedMember ? 'cursor-pointer active:scale-95' : 'cursor-default'
            } ${
              isSelfMention
                ? 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 hover:text-amber-200 border border-amber-500/30'
                : 'bg-brand-500/20 text-brand-300 hover:bg-brand-500/35 hover:text-white border border-brand-500/20'
            }`}
            title={matchedMember ? `Ver perfil de @${matchedMember.username}` : undefined}
          >
            <span>{token}</span>
          </span>
        );
      } else {
        elements.push(token);
      }
    } else {
      elements.push(token);
    }

    lastIdx = m.index + token.length;
  }

  if (lastIdx < text.length) {
    elements.push(text.substring(lastIdx));
  }

  return <React.Fragment key={keyPrefix}>{elements}</React.Fragment>;
}
