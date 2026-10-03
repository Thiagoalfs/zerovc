import React from 'react';
import { MessageEmbed } from '../../types';
import { formatAssetUrl } from '../../lib/api';

interface MessageEmbedCardProps {
  embed: MessageEmbed;
  onPreviewImage?: (url: string) => void;
}

export const MessageEmbedCard: React.FC<MessageEmbedCardProps> = ({
  embed,
  onPreviewImage,
}) => {
  const borderColor = embed.color || '#6366f1';

  const isSafeUrl = (u?: string): boolean => {
    if (!u) return false;
    const trimmed = u.trim().toLowerCase();
    return trimmed.startsWith('http://') || trimmed.startsWith('https://');
  };

  // Helper to parse markdown links [Text](url) and bold **text** in values
  const renderFormattedText = (text: string) => {
    if (!text) return null;

    const parts = text.split(/(\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|`[^`]+`|\n)/g);

    return parts.map((part, index) => {
      if (part === '\n') {
        return <br key={index} />;
      }

      // Link [label](url)
      const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (linkMatch) {
        const targetUrl = linkMatch[2].trim();
        if (!isSafeUrl(targetUrl)) {
          return <span key={index}>{linkMatch[1]}</span>;
        }
        return (
          <a
            key={index}
            href={targetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-400 hover:text-brand-300 underline font-medium"
            onClick={(e) => e.stopPropagation()}
          >
            {linkMatch[1]}
          </a>
        );
      }

      // Bold **text**
      const boldMatch = part.match(/^\*\*([^*]+)\*\*$/);
      if (boldMatch) {
        return <strong key={index} className="font-bold text-white">{boldMatch[1]}</strong>;
      }

      // Inline code `code`
      const codeMatch = part.match(/^`([^`]+)`$/);
      if (codeMatch) {
        return (
          <code
            key={index}
            className="bg-black/40 border border-white/10 px-1.5 py-0.5 rounded text-[11px] font-mono text-gray-200"
          >
            {codeMatch[1]}
          </code>
        );
      }

      return <span key={index}>{part}</span>;
    });
  };

  return (
    <div
      style={{ borderLeftColor: borderColor }}
      className="inline-flex flex-col w-fit max-w-[95%] sm:max-w-[480px] min-w-[240px] bg-background-dark/90 backdrop-blur-sm border border-white/5 border-l-4 rounded-xl p-3.5 sm:p-4 my-1.5 shadow-md gap-2.5 text-xs text-gray-200 select-text"
    >
      {/* Author */}
      {embed.author && (
        <div className="flex items-center gap-2">
          {embed.author.icon_url && isSafeUrl(embed.author.icon_url) && (
            <img
              src={formatAssetUrl(embed.author.icon_url)}
              alt=""
              className="w-5 h-5 rounded-full object-cover flex-shrink-0"
            />
          )}
          {embed.author.url && isSafeUrl(embed.author.url) ? (
            <a
              href={embed.author.url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-gray-200 hover:text-white hover:underline text-xs"
              onClick={(e) => e.stopPropagation()}
            >
              {embed.author.name}
            </a>
          ) : (
            <span className="font-semibold text-gray-200 text-xs">{embed.author.name}</span>
          )}
        </div>
      )}

      {/* Main Content Layout with optional Thumbnail */}
      <div className="flex gap-4 items-start justify-between">
        <div className="flex-1 min-w-0 space-y-2">
          {/* Title */}
          {embed.title && (
            <h4 className="font-bold text-white text-sm sm:text-base leading-snug break-words">
              {embed.url && isSafeUrl(embed.url) ? (
                <a
                  href={embed.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline text-brand-300"
                  onClick={(e) => e.stopPropagation()}
                >
                  {embed.title}
                </a>
              ) : (
                embed.title
              )}
            </h4>
          )}

          {/* Description */}
          {embed.description && (
            <div className="text-xs text-gray-300 leading-relaxed break-words">
              {renderFormattedText(embed.description)}
            </div>
          )}

          {/* Fields */}
          {embed.fields && embed.fields.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
              {embed.fields.map((field, idx) => (
                <div
                  key={idx}
                  className={`flex flex-col min-w-0 ${
                    field.inline ? 'col-span-1' : 'col-span-1 sm:col-span-2'
                  }`}
                >
                  <span className="font-bold text-gray-300 text-[11.5px] mb-0.5">
                    {field.name}
                  </span>
                  <div className="text-xs text-gray-400 break-words leading-relaxed">
                    {renderFormattedText(field.value)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Thumbnail on the right (like Champion Splash Art / Profile) */}
        {embed.thumbnail && embed.thumbnail.url && (
          <div
            onClick={() => onPreviewImage && onPreviewImage(formatAssetUrl(embed.thumbnail!.url))}
            className="flex-shrink-0 cursor-pointer overflow-hidden rounded-lg border border-white/10 shadow-lg group/thumb max-w-[80px] max-h-[80px] w-20 h-20 bg-black/40"
          >
            <img
              src={formatAssetUrl(embed.thumbnail.url)}
              alt=""
              className="w-full h-full object-cover transition-transform group-hover/thumb:scale-105"
            />
          </div>
        )}
      </div>

      {/* Large Image (if any) with natural aspect ratio */}
      {embed.image && embed.image.url && (
        <div
          onClick={() => onPreviewImage && onPreviewImage(formatAssetUrl(embed.image!.url))}
          className="mt-1 cursor-pointer overflow-hidden rounded-xl border border-white/10 shadow-lg w-fit max-w-full bg-black/30 group/img flex items-center justify-center"
        >
          <img
            src={formatAssetUrl(embed.image.url)}
            alt=""
            className="max-h-[320px] sm:max-h-[360px] max-w-full w-auto h-auto object-contain block rounded-xl transition-transform group-hover/img:scale-[1.01]"
          />
        </div>
      )}

      {/* Footer */}
      {embed.footer && (
        <div className="flex items-center gap-2 pt-1 border-t border-white/5 text-[10.5px] text-gray-400">
          {embed.footer.icon_url && (
            <img
              src={formatAssetUrl(embed.footer.icon_url)}
              alt=""
              className="w-3.5 h-3.5 rounded-full object-cover"
            />
          )}
          <span>{embed.footer.text}</span>
          {embed.timestamp && (
            <>
              <span>•</span>
              <span>{new Date(embed.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </>
          )}
        </div>
      )}
    </div>
  );
};
