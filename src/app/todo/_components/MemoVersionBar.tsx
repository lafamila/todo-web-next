'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { getMemoVersion, getMemoVersions } from '@/lib/api';
import type {
  MemoVersionInterface,
  MemoVersionSummaryInterface,
} from '@/lib/types';

interface MemoVersionBarProps {
  memoId: string;
  currentUpdatedAt: Date | string;
  refreshKey?: string | null;
  selectedVersion: MemoVersionInterface | null;
  disabled?: boolean;
  onSelect: (version: MemoVersionInterface | null) => void;
  onRestore?: (version: MemoVersionInterface) => Promise<void>;
  focusRequest?: number;
}

const formatTimestamp = (input: Date | string) => {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return String(input);
  return new Intl.DateTimeFormat('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
};

const versionLabel = (version: MemoVersionSummaryInterface) => {
  const timestamp = formatTimestamp(version.updatedAtUtc ?? version.createdAt);
  return `v${version.version} · ${timestamp}${version.note ? ` · ${version.note}` : ''}`;
};

export function MemoVersionBar({
  memoId,
  currentUpdatedAt,
  refreshKey,
  selectedVersion,
  disabled = false,
  onSelect,
  onRestore,
  focusRequest = 0,
}: MemoVersionBarProps) {
  const selectId = useId();
  const [versions, setVersions] = useState<MemoVersionSummaryInterface[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingVersion, setPendingVersion] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const versionRequestRef = useRef<AbortController | null>(null);
  const selectRef = useRef<HTMLSelectElement>(null);
  const focusedRequestRef = useRef<string | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    versionRequestRef.current?.abort();
    versionRequestRef.current = null;
    setPendingVersion(null);
    setIsLoading(true);
    setError(null);

    getMemoVersions(memoId, controller.signal)
      .then((items) => {
        setVersions(items);
      })
      .catch((reason) => {
        if (controller.signal.aborted) return;
        setVersions([]);
        setError(
          reason instanceof Error
            ? reason.message
            : '버전 기록을 불러오지 못했습니다.',
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });

    return () => {
      controller.abort();
    };
  }, [memoId, refreshKey]);

  useEffect(() => {
    return () => versionRequestRef.current?.abort();
  }, []);

  useEffect(() => {
    if (focusRequest <= 0 || isLoading || disabled) return;
    const requestKey = `${memoId}:${focusRequest}`;
    if (focusedRequestRef.current === requestKey) return;
    focusedRequestRef.current = requestKey;
    const frame = requestAnimationFrame(() => {
      selectRef.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [disabled, focusRequest, isLoading, memoId]);

  const handleRestore = async () => {
    if (!selectedVersion || !onRestore || isRestoring) return;
    if (!window.confirm(`v${selectedVersion.version} 내용으로 현재 메모를 복원할까요?\n현재 서버 내용은 이전 버전 기록으로 보존됩니다.`)) return;
    setIsRestoring(true);
    setError(null);
    try {
      await onRestore(selectedVersion);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '선택한 버전을 복원하지 못했습니다.');
    } finally {
      setIsRestoring(false);
    }
  };

  const handleChange = async (value: string) => {
    versionRequestRef.current?.abort();
    versionRequestRef.current = null;

    if (value === 'current') {
      setPendingVersion(null);
      setError(null);
      onSelect(null);
      return;
    }

    const versionNumber = Number(value);
    if (!versions.some((item) => item.version === versionNumber)) return;

    const controller = new AbortController();
    versionRequestRef.current = controller;
    setPendingVersion(versionNumber);
    setError(null);
    try {
      const version = await getMemoVersion(
        memoId,
        versionNumber,
        controller.signal,
      );
      if (!controller.signal.aborted) onSelect(version);
    } catch (reason) {
      if (!controller.signal.aborted) {
        setError(
          reason instanceof Error
            ? reason.message
            : '선택한 버전을 불러오지 못했습니다.',
        );
      }
    } finally {
      if (!controller.signal.aborted) {
        versionRequestRef.current = null;
        setPendingVersion(null);
      }
    }
  };

  return (
    <section className="memo-version-bar" aria-label="메모 버전 기록">
      <label htmlFor={selectId}>버전</label>
      <select
        ref={selectRef}
        id={selectId}
        value={pendingVersion ?? selectedVersion?.version ?? 'current'}
        onChange={(event) => void handleChange(event.target.value)}
        disabled={disabled || isLoading || isRestoring}
        aria-describedby={`${selectId}-status`}
      >
        <option value="current">현재 · {formatTimestamp(currentUpdatedAt)}</option>
        {versions.map((version) => (
          <option key={version.id} value={version.version}>
            {versionLabel(version)}
          </option>
        ))}
      </select>

      <span id={`${selectId}-status`} className="memo-version-status">
        {pendingVersion !== null
          ? `v${pendingVersion} 불러오는 중…`
          : isLoading
          ? '기록 불러오는 중…'
          : error
            ? `불러오기 실패 · ${error}`
            : selectedVersion
              ? `v${selectedVersion.version} 읽기 전용`
              : versions.length > 0
                ? `이전 버전 ${versions.length}개`
                : '이전 버전 없음'}
      </span>

      {selectedVersion && (
        <>
          {onRestore && (
            <button type="button" onClick={() => void handleRestore()} disabled={disabled || isRestoring}>
              {isRestoring ? '복원 중…' : '이 버전으로 복원'}
            </button>
          )}
          <button type="button" onClick={() => void handleChange('current')} disabled={isRestoring}>
            현재로 돌아가기
          </button>
        </>
      )}
    </section>
  );
}
