import React, { useState } from 'react';

interface FormattedMessageProps {
  content: string;
  className?: string;
}

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

export const FormattedMessage: React.FC<FormattedMessageProps> = ({ content, className = '' }) => {
  if (!content) return null;

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

  return <div className={`leading-relaxed break-words ${className}`}>{parts}</div>;
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
