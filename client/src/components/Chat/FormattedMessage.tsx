import React, { useState } from 'react';
import { Star } from 'lucide-react';
import { useFavoriteGifStore } from '../../stores/favoriteGifStore';
import { formatAssetUrl } from '../../lib/api';

interface FormattedMessageProps {
  content: string;
  className?: string;
  onPreviewImage?: (url: string) => void;
  onImageLoad?: () => void;
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
    url.includes('/assets/user/') ||
    url.includes('/assets/guild/') ||
    url.includes('tenor.com/view/') ||
    url.includes('giphy.com/gifs/') ||
    url.includes('media.tenor.com') ||
    url.includes('media.giphy.com') ||
    url.includes('klipy') ||
    url.startsWith('data:image/');

  const isVid =
    clean.endsWith('.mp4') ||
    clean.endsWith('.webm') ||
    clean.endsWith('.ogg') ||
    clean.endsWith('.mov');

  const isAud =
    clean.endsWith('.mp3') ||
    clean.endsWith('.wav') ||
    clean.endsWith('.ogg') ||
    clean.endsWith('.m4a');

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
  onPreviewImage,
  onImageLoad,
}) => {
  if (!content) return null;

  const { isFavorited, toggleFavorite } = useFavoriteGifStore();

  // Extract all media links for Discord-like embeds below the text
  const urlRegex = /(https?:\/\/[^\s<]+[^<.,:;"')\]\s]|\/assets\/user\/[^\s]+|\/assets\/guild\/[^\s]+|data:image\/[^\s]+)/g;
  const mediaEmbeds: { url: string; isImage: boolean; isVideo: boolean; isAudio: boolean }[] = [];
  const foundUrls = new Set<string>();

  let matchUrl: RegExpExecArray | null;
  while ((matchUrl = urlRegex.exec(content)) !== null) {
    const rawUrl = matchUrl[0];
    if (!foundUrls.has(rawUrl)) {
      foundUrls.add(rawUrl);
      const mediaInfo = isMediaUrl(rawUrl);
      if (mediaInfo.isMedia) {
        mediaEmbeds.push({ url: rawUrl, ...mediaInfo });
      }
    }
  }

  // 1. Process Code blocks first (```code```)
  const codeBlockRegex = /```([a-zA-Z0-9_-]*)\n?([\s\S]*?)```/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push(renderInlineFormatting(content.substring(lastIndex, match.index), `text-${lastIndex}`));
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

  if (lastIndex < content.length) {
    parts.push(renderInlineFormatting(content.substring(lastIndex), `text-${lastIndex}`));
  }

  return (
    <div className={`leading-relaxed break-words ${className}`}>
      <div>{parts}</div>

      {/* Discord-like Rich Embeds / Image / GIF / Video Previews */}
      {mediaEmbeds.length > 0 && (
        <div className="mt-2 space-y-2 flex flex-col items-start select-none">
          {mediaEmbeds.map((media, idx) => {
            const resolvedSrc = formatAssetUrl(media.url);
            const isGif =
              resolvedSrc.includes('.gif') ||
              resolvedSrc.includes('.webp') ||
              resolvedSrc.includes('klipy') ||
              resolvedSrc.includes('giphy') ||
              resolvedSrc.includes('tenor');
            const favorited = isFavorited(resolvedSrc);

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
              <div
                key={idx}
                className="w-fit max-w-sm sm:max-w-md md:max-w-lg rounded-2xl overflow-hidden border border-white/10 relative group/media shadow-md bg-black/40"
              >
                <img
                  src={resolvedSrc}
                  alt="Mídia enviada"
                  onLoad={() => onImageLoad?.()}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onPreviewImage) {
                      onPreviewImage(resolvedSrc);
                    } else {
                      window.open(resolvedSrc, '_blank');
                    }
                  }}
                  className="max-h-[350px] max-w-full w-auto h-auto object-contain rounded-2xl cursor-pointer hover:opacity-95 transition-opacity block"
                />

                {isGif && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFavorite(resolvedSrc);
                    }}
                    className={`absolute top-2 right-2 p-1.5 rounded-xl backdrop-blur-md transition-all shadow-md cursor-pointer ${
                      favorited
                        ? 'bg-amber-500 text-white opacity-100'
                        : 'bg-black/60 text-white/70 hover:text-white hover:bg-black/90 opacity-0 group-hover/media:opacity-100'
                    }`}
                    title={favorited ? 'Remover dos favoritos' : 'Favoritar GIF'}
                  >
                    <Star className={`w-4 h-4 ${favorited ? 'fill-current' : ''}`} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// Helper for inline tokens: Spoiler, Bold, Italic, Strikethrough, Inline Code, Links
function renderInlineFormatting(text: string, keyPrefix: string): React.ReactNode {
  // Regex parsing hierarchy:
  // 1. ||spoiler||
  // 2. `inline code`
  // 3. **bold**
  // 4. ~~strike~~
  // 5. *italic* or _italic_
  // 6. URLs (https?://...)
  const tokenRegex = /(\|\|[\s\S]+?\|\||`[^`\n]+`|\*\*[^*]+?\*\*|~~[^~]+?~~|\*[^*\n]+?\*|_[^_\n]+?_|https?:\/\/[^\s<]+[^<.,:;"')\]\s])/g;

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

    if (token.startsWith('||') && token.endsWith('||') && token.length >= 4) {
      const inner = token.substring(2, token.length - 2);
      elements.push(<SpoilerText key={k}>{renderInlineFormatting(inner, `${k}-sp`)}</SpoilerText>);
    } else if (token.startsWith('`') && token.endsWith('`') && token.length >= 2) {
      const inner = token.substring(1, token.length - 1);
      elements.push(
        <code key={k} className="px-1.5 py-0.5 rounded-md bg-background-darkest border border-white/10 font-mono text-[12px] text-brand-300">
          {inner}
        </code>
      );
    } else if (token.startsWith('**') && token.endsWith('**') && token.length >= 4) {
      const inner = token.substring(2, token.length - 2);
      elements.push(<strong key={k} className="font-bold text-white">{renderInlineFormatting(inner, `${k}-b`)}</strong>);
    } else if (token.startsWith('~~') && token.endsWith('~~') && token.length >= 4) {
      const inner = token.substring(2, token.length - 2);
      elements.push(<del key={k} className="line-through text-gray-400">{renderInlineFormatting(inner, `${k}-s`)}</del>);
    } else if ((token.startsWith('*') && token.endsWith('*') && token.length >= 2) || (token.startsWith('_') && token.endsWith('_') && token.length >= 2)) {
      const inner = token.substring(1, token.length - 1);
      elements.push(<em key={k} className="italic text-gray-200">{renderInlineFormatting(inner, `${k}-i`)}</em>);
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
