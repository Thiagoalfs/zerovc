import React from 'react';
import { XIcon } from 'lucide-react';
import { useUploadStore } from '../../stores/uploadStore';
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
} from '@/components/ui/attachment';
import { Spinner } from '@/components/ui/spinner';

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
    <Attachment state="uploading" className="mt-1.5 w-full max-w-sm select-none">
      <AttachmentMedia>
        <Spinner />
      </AttachmentMedia>
      <AttachmentContent>
        <AttachmentTitle title={fileName}>{fileName}</AttachmentTitle>
        <AttachmentDescription>
          Enviando · {Math.max(0, Math.min(100, progress))}% · {formatFileSize(fileSize)}
        </AttachmentDescription>
      </AttachmentContent>
      <AttachmentActions>
        <AttachmentAction
          type="button"
          onClick={handleCancel}
          aria-label="Cancelar envio"
          title="Cancelar envio"
        >
          <XIcon />
        </AttachmentAction>
      </AttachmentActions>
    </Attachment>
  );
};
