import React from 'react';
import { X } from 'lucide-react';
import { useUploadStore } from '../../stores/uploadStore';

interface UploadProgressCardProps {
  messageId: string;
  fileName: string;
  fileSize: number;
  onCancel?: () => void;
}

export const formatFileSize = (bytes: number): string => {
  if (!bytes || isNaN(bytes)) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

export const UploadProgressCard: React.FC<UploadProgressCardProps> = ({
  messageId,
  fileName,
  fileSize,
  onCancel,
}) => {
  const uploadInfo = useUploadStore((state) => state.uploads[messageId]);
  const cancelUpload = useUploadStore((state) => state.cancelUpload);

  const progress = uploadInfo ? uploadInfo.progress : 0;

  const handleCancel = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (onCancel) {
      onCancel();
    } else {
      cancelUpload(messageId);
    }
  };

  return (
    <div className="mt-1.5 flex items-center gap-3 bg-[#2b2d31] border border-[#383a40]/70 rounded-lg px-3.5 py-3 max-w-md w-full select-none shadow-sm transition-all">
      {/* Discord-style Lavender File Icon with folded corner */}
      <div className="relative w-8 h-10 flex-shrink-0 flex items-center justify-center">
        <svg viewBox="0 0 24 30" fill="none" className="w-full h-full drop-shadow-sm">
          <path
            d="M2 0C0.895431 0 0 0.895431 0 2V28C0 29.1046 0.895431 30 2 30H22C23.1046 30 24 29.1046 24 28V8L16 0H2Z"
            fill="#D5D8FF"
          />
          <path
            d="M16 0V6C16 7.10457 16.8954 8 18 8H24L16 0Z"
            fill="#A4ABFA"
          />
        </svg>
      </div>

      {/* File Name & Size on Top, Animated Progress Bar on Bottom */}
      <div className="flex-1 min-w-0 flex flex-col justify-center">
        <div className="flex items-center gap-1.5 text-sm font-medium text-gray-200 leading-tight">
          <span className="truncate text-gray-100 font-semibold" title={fileName}>
            {fileName}
          </span>
          <span className="text-gray-400 font-normal flex-shrink-0">—</span>
          <span className="text-gray-400 text-xs sm:text-sm font-normal flex-shrink-0">
            {formatFileSize(fileSize)}
          </span>
        </div>

        {/* Progress Bar Track */}
        <div className="w-full h-1.5 bg-[#383a40] rounded-full overflow-hidden mt-2 relative">
          <div
            className="h-full bg-brand-500 rounded-full transition-all duration-150 ease-out"
            style={{ width: `${Math.max(2, Math.min(100, progress))}%` }}
          />
        </div>
      </div>

      {/* Cancel X Button */}
      <button
        type="button"
        onClick={handleCancel}
        title="Cancelar envio"
        className="p-1 text-gray-400 hover:text-white transition-colors cursor-pointer flex-shrink-0 ml-1 rounded hover:bg-white/10"
      >
        <X className="w-5 h-5" />
      </button>
    </div>
  );
};
