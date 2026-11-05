'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { downloadMemoAttachments } from '@/lib/api';
import type { MemoAttachmentInterface } from '@/lib/types';

interface UploadView {
  id: string;
  status: 'uploading' | 'ready' | 'failed';
  fileName?: string;
  error?: string;
}

interface MemoAttachmentsProps {
  memoId: string;
  readyAttachments: MemoAttachmentInterface[];
  uploads: UploadView[];
  disabled?: boolean;
  onFiles: (files: File[]) => void;
  onRetry: (attachmentId: string) => void;
  onCancel: (attachmentId: string) => void;
}

export function MemoAttachments({
  memoId,
  readyAttachments,
  uploads,
  disabled = false,
  onFiles,
  onRetry,
  onCancel,
}: MemoAttachmentsProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const failed = useMemo(
    () => uploads.filter((upload) => upload.status === 'failed'),
    [uploads],
  );
  useEffect(() => setPortalTarget(document.body), []);
  const uploadingCount = uploads.filter((upload) => upload.status === 'uploading').length;

  const openDownloads = () => {
    setSelectedIds(readyAttachments.map((attachment) => attachment.id));
    setDownloadError(null);
    setDownloadOpen(true);
  };

  const downloadSelected = async () => {
    if (selectedIds.length === 0) return;
    setDownloading(true);
    setDownloadError(null);
    try {
      const result = await downloadMemoAttachments(memoId, selectedIds);
      const url = URL.createObjectURL(result.blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = result.fileName;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      setDownloadOpen(false);
    } catch (error) {
      setDownloadError(
        error instanceof Error ? error.message : '첨부파일을 다운로드하지 못했습니다.',
      );
    } finally {
      setDownloading(false);
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? []);
          event.currentTarget.value = '';
          if (files.length > 0) onFiles(files);
        }}
      />
      <button
        type="button"
        className="todo-action-button todo-action-button--secondary"
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
      >
        첨부
      </button>
      {readyAttachments.length > 0 && (
        <button
          type="button"
          className="todo-action-button"
          onClick={openDownloads}
        >
          다운로드({readyAttachments.length})
        </button>
      )}
      {uploadingCount > 0 && (
        <span className="text-xs text-gray-500" aria-live="polite">
          업로드 중({uploadingCount})
        </span>
      )}
      {failed.map((upload) => (
        <span key={upload.id} className="inline-flex max-w-full flex-wrap items-center gap-1">
          <span className="max-w-48 truncate text-xs text-red-600" title={upload.error}>
            {upload.fileName ?? '첨부'} · {upload.error ?? '업로드 실패'}
          </span>
          <button
            type="button"
            className="todo-action-button todo-action-button--secondary"
            title={upload.error}
            onClick={() => onRetry(upload.id)}
            disabled={disabled}
          >
            재시도
          </button>
          <button
            type="button"
            className="todo-action-button todo-action-button--secondary"
            onClick={() => onCancel(upload.id)}
            disabled={disabled}
          >
            취소
          </button>
        </span>
      ))}

      {portalTarget && createPortal(<Modal
        isOpen={downloadOpen}
        onClose={() => !downloading && setDownloadOpen(false)}
        title={`첨부파일 다운로드 (${readyAttachments.length})`}
        size="md"
      >
        <div className="space-y-4">
          <label className="flex items-center gap-2 text-sm font-medium text-gray-800">
            <input
              type="checkbox"
              checked={
                readyAttachments.length > 0 && selectedIds.length === readyAttachments.length
              }
              onChange={(event) => setSelectedIds(
                event.target.checked
                  ? readyAttachments.map((attachment) => attachment.id)
                  : [],
              )}
            />
            전체 선택
          </label>
          <div className="max-h-64 space-y-2 overflow-y-auto rounded border border-gray-200 p-2">
            {readyAttachments.map((attachment) => (
              <label key={attachment.id} className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(attachment.id)}
                  onChange={(event) => setSelectedIds((current) =>
                    event.target.checked
                      ? [...current, attachment.id]
                      : current.filter((id) => id !== attachment.id),
                  )}
                />
                <span className="min-w-0 flex-1 truncate">{attachment.fileName}</span>
                <span className="text-xs text-gray-400">
                  {Math.max(1, Math.ceil(attachment.byteSize / 1024))} KB
                </span>
              </label>
            ))}
          </div>
          <p className="text-xs text-gray-500">
            한 파일은 원본으로, 여러 파일은 ZIP 하나로 다운로드합니다.
          </p>
          {downloadError && <p className="text-sm text-red-600">{downloadError}</p>}
          <div className="flex justify-end gap-2">
            <Button
              onClick={() => void downloadSelected()}
              disabled={downloading || selectedIds.length === 0}
            >
              {downloading ? '다운로드 중...' : '다운로드'}
            </Button>
            <Button
              variant="secondary"
              onClick={() => setDownloadOpen(false)}
              disabled={downloading}
            >
              취소
            </Button>
          </div>
        </div>
      </Modal>, portalTarget)}
    </>
  );
}
