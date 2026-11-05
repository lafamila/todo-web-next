'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { downloadMemoAttachments } from '@/lib/api';
import type { MemoAttachmentInterface } from '@/lib/types';
import {
  attachmentDeleteEligibility,
  downloadableMemoAttachments,
} from '@/lib/attachmentUploadPolicy';

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
  canUpload: boolean;
  currentUserId: string | null;
  readOnly: boolean;
  disabled?: boolean;
  onFiles: (files: File[]) => void;
  onRetry: (attachmentId: string) => void;
  onCancel: (attachmentId: string) => void;
  onDelete: (attachmentIds: string[]) => Promise<unknown>;
  onRefresh: () => Promise<void>;
}

export function MemoAttachments({
  memoId,
  readyAttachments,
  uploads,
  canUpload,
  currentUserId,
  readOnly,
  disabled = false,
  onFiles,
  onRetry,
  onCancel,
  onDelete,
  onRefresh,
}: MemoAttachmentsProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const downloadableAttachments = useMemo(
    () => downloadableMemoAttachments(readyAttachments),
    [readyAttachments],
  );
  const failed = useMemo(
    () => uploads.filter((upload) => upload.status === 'failed'),
    [uploads],
  );
  useEffect(() => setPortalTarget(document.body), []);
  const uploadingCount = uploads.filter((upload) => upload.status === 'uploading').length;
  const busy = downloading || deleting;
  const deleteEligibility = attachmentDeleteEligibility(
    downloadableAttachments,
    selectedIds,
    currentUserId,
    readOnly,
  );

  const openDownloads = () => {
    setSelectedIds(downloadableAttachments.map((attachment) => attachment.id));
    setDownloadError(null);
    setDeleteError(null);
    setDownloadOpen(true);
    void onRefresh().catch((error) => {
      setDownloadError(
        error instanceof Error ? error.message : '첨부파일 목록을 새로 고치지 못했습니다.',
      );
    });
  };

  useEffect(() => {
    if (busy) return;
    const available = new Set(downloadableAttachments.map((attachment) => attachment.id));
    setSelectedIds((current) => current.filter((id) => available.has(id)));
    if (downloadableAttachments.length === 0) setDownloadOpen(false);
  }, [busy, downloadableAttachments]);

  const downloadSelected = async () => {
    if (busy || selectedIds.length === 0) return;
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

  const deleteSelected = async () => {
    if (
      selectedIds.length === 0 ||
      !deleteEligibility.allowed ||
      busy
    ) return;
    const attachmentIds = [...selectedIds];
    if (!window.confirm(
      `선택한 첨부파일 ${attachmentIds.length}개를 삭제하시겠습니까?\n목록에서 삭제되며 원본 저장소 객체는 보존됩니다.`,
    )) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await onDelete(attachmentIds);
      setSelectedIds([]);
    } catch (error) {
      setDeleteError(
        error instanceof Error ? error.message : '첨부파일을 삭제하지 못했습니다.',
      );
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      {canUpload && <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? []);
          event.currentTarget.value = '';
          if (files.length > 0) onFiles(files);
        }}
      />}
      {canUpload && <button
        type="button"
        className="todo-action-button todo-action-button--secondary"
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
        title="파일을 메모 영역에 끌어 놓아도 첨부할 수 있습니다."
      >
        첨부
      </button>}
      {downloadableAttachments.length > 0 && (
        <button
          type="button"
          className="todo-action-button"
          onClick={openDownloads}
        >
          다운로드({downloadableAttachments.length})
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
            disabled={disabled || !canUpload}
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
        onClose={() => !busy && setDownloadOpen(false)}
        title={`첨부파일 다운로드 (${downloadableAttachments.length})`}
        size="md"
      >
        <div className="space-y-4">
          <label className="flex items-center gap-2 text-sm font-medium text-gray-800">
            <input
              type="checkbox"
              disabled={busy}
              checked={
                downloadableAttachments.length > 0 && selectedIds.length === downloadableAttachments.length
              }
              onChange={(event) => {
                if (busy) return;
                setSelectedIds(
                  event.target.checked
                    ? downloadableAttachments.map((attachment) => attachment.id)
                    : [],
                );
              }}
            />
            전체 선택
          </label>
          <div className="max-h-64 space-y-2 overflow-y-auto rounded border border-gray-200 p-2">
            {downloadableAttachments.map((attachment) => (
              <label key={attachment.id} className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  disabled={busy}
                  checked={selectedIds.includes(attachment.id)}
                  onChange={(event) => {
                    if (busy) return;
                    setSelectedIds((current) =>
                      event.target.checked
                        ? [...current, attachment.id]
                        : current.filter((id) => id !== attachment.id),
                    );
                  }}
                />
                <span className="min-w-0 flex-1 truncate">{attachment.fileName}</span>
                {attachment.createdBy === currentUserId && (
                  <span className="shrink-0 text-xs text-gray-500">내 파일</span>
                )}
                <span className="text-xs text-gray-400">
                  {Math.max(1, Math.ceil(attachment.byteSize / 1024))} KB
                </span>
              </label>
            ))}
          </div>
          <p className="text-xs text-gray-500">
            한 파일은 원본으로, 여러 파일은 ZIP 하나로 다운로드합니다.
          </p>
          {deleteEligibility.show && deleteEligibility.includesOtherOwner && (
            <p className="text-sm text-red-600">
              다른 사용자가 올린 파일이 포함되어 있어 삭제할 수 없습니다. 내 파일만 선택하세요.
            </p>
          )}
          {downloadError && <p className="text-sm text-red-600">{downloadError}</p>}
          {deleteError && <p className="text-sm text-red-600">{deleteError}</p>}
          <div className="flex justify-end gap-2">
            <Button
              onClick={() => void downloadSelected()}
              disabled={busy || selectedIds.length === 0}
            >
              {downloading ? '다운로드 중...' : '다운로드'}
            </Button>
            {deleteEligibility.show && (
              <Button
                variant="danger"
                onClick={() => void deleteSelected()}
                disabled={
                  busy ||
                  selectedIds.length === 0 ||
                  !deleteEligibility.allowed
                }
              >
                {deleting ? '삭제 중...' : '삭제'}
              </Button>
            )}
            <Button
              variant="secondary"
              onClick={() => {
                if (!busy) setDownloadOpen(false);
              }}
              disabled={busy}
            >
              취소
            </Button>
          </div>
        </div>
      </Modal>, portalTarget)}
    </>
  );
}
