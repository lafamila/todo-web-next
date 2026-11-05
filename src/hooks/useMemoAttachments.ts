'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  getMemoAttachments,
  uploadMemoAttachment,
} from '@/lib/api';
import type {
  AttachmentPreviewState,
  MemoAttachmentInterface,
} from '@/lib/types';
import {
  attachmentUploadKey,
  deleteAttachmentUpload,
  listAttachmentUploads,
  putAttachmentUpload,
  type AttachmentUploadRecord,
} from '@/lib/attachmentUploadStore';
import {
  blocksMemoSaveForUploads,
  isInlineImageFile,
  shouldApplyAttachmentResult,
  shouldRestartPendingUploadAfterFlight,
  mergeAttachmentStateById,
  shouldLoadQueuedUploadRecord,
} from '@/lib/attachmentUploadPolicy';

interface UploadView extends AttachmentPreviewState {
  inlineImage: boolean;
}

interface EnqueueResult {
  attachmentIds: string[];
  imageAttachmentIds: string[];
}

export const newAttachmentId = (): string => {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

const useBrowserLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export function useMemoAttachments(memoId: string | null, userId: string | null) {
  const [attachments, setAttachments] = useState<MemoAttachmentInterface[]>([]);
  const [uploads, setUploads] = useState<UploadView[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const generationRef = useRef(0);
  const scopeRef = useRef({ memoId, userId });
  const recordsRef = useRef(new Map<string, AttachmentUploadRecord>());
  const objectUrlsRef = useRef(new Map<string, string>());
  const inFlightRef = useRef(new Set<string>());
  const restartAfterFlightRef = useRef(new Set<string>());
  const uploadControllersRef = useRef(new Map<string, AbortController>());
  const settledUploadIdsRef = useRef(new Set<string>());
  const runUploadRef = useRef<(
    record: AttachmentUploadRecord,
    generation: number,
  ) => void>(() => {});

  useBrowserLayoutEffect(() => {
    scopeRef.current = { memoId, userId };
    generationRef.current += 1;
    uploadControllersRef.current.forEach((controller) => controller.abort());
    uploadControllersRef.current.clear();
    objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    objectUrlsRef.current.clear();
    recordsRef.current.clear();
    settledUploadIdsRef.current.clear();
    setAttachments([]);
    setUploads([]);
    setListError(null);
  }, [memoId, userId]);

  const revokeObjectUrl = useCallback((attachmentId: string, expectedUrl?: string) => {
    const url = objectUrlsRef.current.get(attachmentId);
    if (expectedUrl !== undefined && url !== expectedUrl) return;
    if (url) URL.revokeObjectURL(url);
    objectUrlsRef.current.delete(attachmentId);
  }, []);

  const runUpload = useCallback(async (
    record: AttachmentUploadRecord,
    expectedGeneration: number,
  ) => {
    if (!shouldApplyAttachmentResult({
      expectedMemoId: record.memoId,
      expectedUserId: record.userId,
      expectedGeneration,
      currentMemoId: scopeRef.current.memoId,
      currentUserId: scopeRef.current.userId,
      currentGeneration: generationRef.current,
    })) return;
    if (inFlightRef.current.has(record.attachmentId)) {
      restartAfterFlightRef.current.add(record.attachmentId);
      return;
    }
    inFlightRef.current.add(record.attachmentId);
    const controller = new AbortController();
    const expectedObjectUrl = objectUrlsRef.current.get(record.attachmentId);
    uploadControllersRef.current.set(record.attachmentId, controller);
    setUploads((current) => current.map((upload) =>
      upload.id === record.attachmentId
        ? { ...upload, status: 'uploading', error: undefined }
        : upload,
    ));
    try {
      const ready = await uploadMemoAttachment(
        record.memoId,
        record.attachmentId,
        record.blob,
        record.fileName,
        controller.signal,
      );
      await deleteAttachmentUpload(record.key);
      const sameVisibleScope =
        record.memoId === scopeRef.current.memoId &&
        record.userId === scopeRef.current.userId;
      if (sameVisibleScope) settledUploadIdsRef.current.add(record.attachmentId);
      const appliesToCurrent = shouldApplyAttachmentResult({
        expectedMemoId: record.memoId,
        expectedUserId: record.userId,
        expectedGeneration,
        currentMemoId: scopeRef.current.memoId,
        currentUserId: scopeRef.current.userId,
        currentGeneration: generationRef.current,
      }) || (sameVisibleScope && recordsRef.current.has(record.attachmentId));
      if (sameVisibleScope) recordsRef.current.delete(record.attachmentId);
      revokeObjectUrl(record.attachmentId, expectedObjectUrl);
      if (appliesToCurrent) {
        setAttachments((current) => [
          ...current.filter((attachment) => attachment.id !== ready.id),
          ready,
        ]);
        setUploads((current) => current.map((upload) =>
          upload.id === ready.id
            ? { ...upload, status: 'ready', objectUrl: undefined, error: undefined }
            : upload,
        ));
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      const message = error instanceof Error ? error.message : '첨부파일 업로드에 실패했습니다.';
      const failed: AttachmentUploadRecord = {
        ...record,
        status: 'failed',
        error: message,
        updatedAt: Date.now(),
      };
      await putAttachmentUpload(failed).catch(() => undefined);
      const sameVisibleScope =
        record.memoId === scopeRef.current.memoId &&
        record.userId === scopeRef.current.userId;
      if (sameVisibleScope) recordsRef.current.set(record.attachmentId, failed);
      if (shouldApplyAttachmentResult({
        expectedMemoId: record.memoId,
        expectedUserId: record.userId,
        expectedGeneration,
        currentMemoId: scopeRef.current.memoId,
        currentUserId: scopeRef.current.userId,
        currentGeneration: generationRef.current,
      }) || sameVisibleScope) {
        setUploads((current) => current.map((upload) =>
          upload.id === record.attachmentId
            ? { ...upload, status: 'failed', error: message }
            : upload,
        ));
      }
    } finally {
      inFlightRef.current.delete(record.attachmentId);
      if (uploadControllersRef.current.get(record.attachmentId) === controller) {
        uploadControllersRef.current.delete(record.attachmentId);
      }
      if (restartAfterFlightRef.current.delete(record.attachmentId)) {
        const pending = recordsRef.current.get(record.attachmentId);
        if (shouldRestartPendingUploadAfterFlight({
          status: pending?.status ?? null,
          recordMemoId: pending?.memoId ?? null,
          recordUserId: pending?.userId ?? null,
          currentMemoId: scopeRef.current.memoId,
          currentUserId: scopeRef.current.userId,
        }) && pending) {
          queueMicrotask(() => runUploadRef.current(pending, generationRef.current));
        }
      }
    }
  }, [revokeObjectUrl]);

  useEffect(() => {
    runUploadRef.current = (record, generation) => {
      void runUpload(record, generation);
    };
  }, [runUpload]);

  useEffect(() => {
    const generation = generationRef.current;
    if (!memoId || !userId) return;

    let cancelled = false;
    void Promise.allSettled([
      getMemoAttachments(memoId),
      listAttachmentUploads(window.location.origin, userId, memoId),
    ]).then(([serverResult, queueResult]) => {
      if (cancelled || generation !== generationRef.current) return;
      const serverAttachments = serverResult.status === 'fulfilled' ? serverResult.value : [];
      const queued = queueResult.status === 'fulfilled' ? queueResult.value : [];
      const error = serverResult.status === 'rejected'
        ? serverResult.reason
        : queueResult.status === 'rejected'
          ? queueResult.reason
          : null;
      if (error) {
        setListError(error instanceof Error ? error.message : '첨부파일 목록을 불러오지 못했습니다.');
      }
      setAttachments((current) => mergeAttachmentStateById(serverAttachments, current));
      const readyIds = new Set(
        serverAttachments
          .filter((attachment) => attachment.status === 'ready')
          .map((attachment) => attachment.id),
      );
      const activeIds = new Set(recordsRef.current.keys());
      const resumable = queued.filter(
        (record) => shouldLoadQueuedUploadRecord(
          record.attachmentId,
          readyIds,
          settledUploadIdsRef.current,
          activeIds,
        ),
      );
      const localViews = resumable.map((record): UploadView => {
        recordsRef.current.set(record.attachmentId, record);
        let objectUrl: string | undefined;
        if (record.inlineImage) {
          objectUrl = URL.createObjectURL(record.blob);
          objectUrlsRef.current.set(record.attachmentId, objectUrl);
        }
        return {
          id: record.attachmentId,
          fileName: record.fileName,
          status: record.status === 'pending' ? 'uploading' : 'failed',
          error: record.error ?? undefined,
          objectUrl,
          inlineImage: record.inlineImage,
        };
      });
      const readyViews = serverAttachments
        .filter((attachment) => attachment.isImage && attachment.status === 'ready')
        .map((attachment): UploadView => ({
          id: attachment.id,
          fileName: attachment.fileName,
          status: 'ready',
          inlineImage: true,
        }));
      setUploads((current) => mergeAttachmentStateById(
        [...readyViews, ...localViews],
        current,
      ));
      resumable
        .filter((record) => record.status === 'pending')
        .forEach((record) => void runUpload(record, generation));
    });
    return () => {
      cancelled = true;
    };
  }, [memoId, runUpload, userId]);

  useEffect(() => () => {
    generationRef.current += 1;
    scopeRef.current = { memoId: null, userId: null };
    uploadControllersRef.current.forEach((controller) => controller.abort());
    uploadControllersRef.current.clear();
    objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    objectUrlsRef.current.clear();
  }, []);

  const enqueueFiles = useCallback(async (
    files: readonly File[],
    inlineImages: boolean,
    providedIds?: readonly string[],
  ): Promise<EnqueueResult> => {
    const currentMemoId = memoId;
    const currentUserId = userId;
    if (!currentMemoId || !currentUserId || files.length === 0) {
      return { attachmentIds: [], imageAttachmentIds: [] };
    }
    const generation = generationRef.current;
    const now = Date.now();
    const records = files.map((file, index): AttachmentUploadRecord => {
      const attachmentId = providedIds?.[index] ?? newAttachmentId();
      return {
        key: attachmentUploadKey(
          window.location.origin,
          currentUserId,
          currentMemoId,
          attachmentId,
        ),
        origin: window.location.origin,
        userId: currentUserId,
        memoId: currentMemoId,
        attachmentId,
        fileName: file.name || `clipboard-image-${attachmentId}.png`,
        contentType: file.type || 'application/octet-stream',
        blob: file,
        inlineImage: inlineImages && isInlineImageFile(file),
        status: 'pending',
        error: null,
        createdAt: now + index,
        updatedAt: now,
      };
    });
    const appliesToCurrent = shouldApplyAttachmentResult({
      expectedMemoId: currentMemoId,
      expectedUserId: currentUserId,
      expectedGeneration: generation,
      currentMemoId: scopeRef.current.memoId,
      currentUserId: scopeRef.current.userId,
      currentGeneration: generationRef.current,
    });
    if (appliesToCurrent) {
      const views = records.map((record): UploadView => {
        recordsRef.current.set(record.attachmentId, record);
        let objectUrl: string | undefined;
        if (record.inlineImage) {
          objectUrl = URL.createObjectURL(record.blob);
          objectUrlsRef.current.set(record.attachmentId, objectUrl);
        }
        return {
          id: record.attachmentId,
          fileName: record.fileName,
          status: 'uploading',
          objectUrl,
          inlineImage: record.inlineImage,
        };
      });
      setUploads((current) => [...current, ...views]);
    }
    try {
      await Promise.all(records.map(putAttachmentUpload));
    } catch (error) {
      const message = error instanceof Error ? error.message : '첨부파일 임시저장에 실패했습니다.';
      if (appliesToCurrent) {
        setUploads((current) => current.map((upload) =>
          records.some((record) => record.attachmentId === upload.id)
            ? { ...upload, status: 'failed', error: message }
            : upload,
        ));
      }
      throw error;
    }
    records.forEach((record) => void runUpload(record, generation));
    return {
      attachmentIds: records.map((record) => record.attachmentId),
      imageAttachmentIds: records.filter((record) => record.inlineImage)
        .map((record) => record.attachmentId),
    };
  }, [memoId, runUpload, userId]);

  const retryUpload = useCallback((attachmentId: string) => {
    const record = recordsRef.current.get(attachmentId);
    if (!record) return;
    const pending = { ...record, status: 'pending' as const, error: null, updatedAt: Date.now() };
    recordsRef.current.set(attachmentId, pending);
    void putAttachmentUpload(pending).then(() => runUpload(pending, generationRef.current));
  }, [runUpload]);

  const refreshAttachments = useCallback(async () => {
    const currentMemoId = scopeRef.current.memoId;
    const currentUserId = scopeRef.current.userId;
    const generation = generationRef.current;
    if (!currentMemoId || !currentUserId) return;
    const fresh = await getMemoAttachments(currentMemoId);
    if (!shouldApplyAttachmentResult({
      expectedMemoId: currentMemoId,
      expectedUserId: currentUserId,
      expectedGeneration: generation,
      currentMemoId: scopeRef.current.memoId,
      currentUserId: scopeRef.current.userId,
      currentGeneration: generationRef.current,
    })) return;
    setAttachments((current) => mergeAttachmentStateById(fresh, current));
    const readyImages = fresh.filter(
      (attachment) => attachment.isImage && attachment.status === 'ready',
    );
    setUploads((current) => mergeAttachmentStateById(
      readyImages.map((attachment): UploadView => ({
        id: attachment.id,
        fileName: attachment.fileName,
        status: 'ready',
        inlineImage: true,
      })),
      current,
    ));
  }, []);

  const cancelUpload = useCallback(async (attachmentId: string) => {
    if (inFlightRef.current.has(attachmentId)) return false;
    const record = recordsRef.current.get(attachmentId);
    if (!record) return false;
    await deleteAttachmentUpload(record.key);
    settledUploadIdsRef.current.add(attachmentId);
    recordsRef.current.delete(attachmentId);
    revokeObjectUrl(attachmentId);
    setUploads((current) => current.filter((upload) => upload.id !== attachmentId));
    return true;
  }, [revokeObjectUrl]);

  const previewStateById = useMemo(() => {
    const map = new Map<string, AttachmentPreviewState>();
    uploads.forEach((upload) => map.set(upload.id, upload));
    return map;
  }, [uploads]);

  return {
    attachments,
    readyAttachments: attachments.filter((attachment) => attachment.status === 'ready'),
    uploads,
    previewStateById,
    listError,
    enqueueFiles,
    retryUpload,
    cancelUpload,
    refreshAttachments,
    blocksMemoSave: blocksMemoSaveForUploads(uploads),
  };
}
