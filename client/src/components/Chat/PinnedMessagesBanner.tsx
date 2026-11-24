import React from 'react';

export interface PinnedMessagesBannerProps {
  count: number;
  onClear: () => void;
  contextSuffix?: string;
}

export const PinnedMessagesBanner: React.FC<PinnedMessagesBannerProps> = ({
  count,
  onClear,
  contextSuffix,
}) => (
  <div className="bg-background-darkest/90 border-b border-white/5 px-4 py-2 flex items-center justify-between text-xs text-gray-300 flex-shrink-0">
    <span>
      Exibindo <strong className="text-white font-semibold">{count}</strong> mensagens fixadas
      {contextSuffix ? ` ${contextSuffix}` : ''}
    </span>
    <button
      type="button"
      onClick={onClear}
      className="text-brand-400 hover:underline font-semibold cursor-pointer ml-2 flex-shrink-0"
    >
      Limpar filtro
    </button>
  </div>
);
