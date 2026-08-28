import React from 'react';
import { X, AlertTriangle } from 'lucide-react';

interface LimitAlertModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
  detail?: string;
}

export const LimitAlertModal: React.FC<LimitAlertModalProps> = ({
  isOpen,
  onClose,
  title,
  message,
  detail,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm select-none p-4 animate-in fade-in duration-150">
      <div className="bg-background-dark w-full max-w-md rounded-2xl overflow-hidden shadow-2xl border border-white/10 animate-in fade-in zoom-in-95 duration-150 flex flex-col">
        {/* Header */}
        <div className="p-6 pb-2 flex flex-col items-center text-center relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-200 p-1"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="w-14 h-14 rounded-2xl bg-yellow-500/15 text-yellow-400 flex items-center justify-center mb-3">
            <AlertTriangle className="w-8 h-8" />
          </div>

          <h2 className="text-xl font-bold text-white">{title}</h2>
          <p className="text-sm text-gray-300 mt-2 leading-relaxed">{message}</p>
          {detail && (
            <span className="mt-2 text-xs font-mono text-gray-400 bg-background-darkest px-3 py-1 rounded-lg border border-white/5">
              {detail}
            </span>
          )}
        </div>

        {/* Action Button */}
        <div className="p-6 pt-4 flex justify-center">
          <button
            type="button"
            onClick={onClose}
            className="w-full bg-brand-500 hover:bg-brand-600 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors shadow-lg shadow-brand-500/25"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
};
