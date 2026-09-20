import React from 'react';
import { User } from '../../types';

interface TypingIndicatorProps {
  typingUserIds: string[];
  members?: User[];
}

export const TypingIndicator: React.FC<TypingIndicatorProps> = ({
  typingUserIds,
  members = [],
}) => {
  if (!typingUserIds || typingUserIds.length === 0) {
    return <div className="h-5 select-none" />;
  }

  const names = typingUserIds.map((id) => {
    const m = members.find((u) => u.id === id);
    return m?.display_name || m?.username || 'Alguém';
  });

  const renderText = () => {
    if (names.length === 1) {
      return (
        <span>
          <strong className="font-bold text-gray-200">{names[0]}</strong> está digitando...
        </span>
      );
    }
    if (names.length === 2) {
      return (
        <span>
          <strong className="font-bold text-gray-200">{names[0]}</strong> e {' '}
          <strong className="font-bold text-gray-200">{names[1]}</strong> estão digitando...
        </span>
      );
    }
    if (names.length === 3) {
      return (
        <span>
          <strong className="font-bold text-gray-200">{names[0]}</strong>,{' '}
          <strong className="font-bold text-gray-200">{names[1]}</strong> e{' '}
          <strong className="font-bold text-gray-200">{names[2]}</strong> estão digitando...
        </span>
      );
    }
    return (
      <span>
        <strong className="font-bold text-gray-200">Várias pessoas</strong> estão digitando...
      </span>
    );
  };

  return (
    <div className="h-5 px-3 md:px-4 text-[12px] text-gray-400 flex items-center gap-1.5 overflow-hidden animate-in fade-in duration-150 select-none">
      <span className="inline-flex items-center gap-0.5 mr-0.5">
        <span className="w-1.5 h-1.5 bg-brand-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
        <span className="w-1.5 h-1.5 bg-brand-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
        <span className="w-1.5 h-1.5 bg-brand-400 rounded-full animate-bounce" />
      </span>
      <span className="truncate">{renderText()}</span>
    </div>
  );
};
