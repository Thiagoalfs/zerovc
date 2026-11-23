import React from 'react';
import { Pencil } from 'lucide-react';

interface EditPencilOverlayProps {
  variant?: 'center' | 'top-right';
  roundedClass?: string;
}

/**
 * Unified hover edit overlay showing a centered or top-right pencil badge.
 */
export const EditPencilOverlay: React.FC<EditPencilOverlayProps> = ({
  variant = 'center',
  roundedClass = '',
}) => {
  return (
    <div
      aria-hidden="true"
      className={`absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none ${roundedClass} ${
        variant === 'center' ? 'flex items-center justify-center' : ''
      }`}
    >
      <span
        className={`w-8 h-8 rounded-full bg-black/60 backdrop-blur-xs flex items-center justify-center text-white shadow ${
          variant === 'top-right' ? 'absolute top-3 right-3' : ''
        }`}
      >
        <Pencil className="w-4 h-4" />
      </span>
    </div>
  );
};
