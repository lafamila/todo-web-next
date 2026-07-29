'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import * as api from '@/lib/api';
import { diffLines } from '@/lib/lineDiff';
import {
  canKeepCurrentResolution,
  isSaveShortcut,
} from '@/lib/resolutionPolicy';
import type {
  MemoInterface,
  MemoVersionInterface,
  SyncIssueInterface,
} from '@/lib/types';

interface MemoResolutionPanelProps {
  memo: MemoInterface;
  currentContent: string;
  issue?: SyncIssueInterface;
  remoteContent?: string;
  manualSeed: string;
  hasDirtyBuffer: boolean;
  canWrite: boolean;
  mergeLocked?: boolean;
  onKeepCurrent: (currentContent: string) => Promise<void> | void;
  onSaveResolved: (content: string) => Promise<void>;
  onMerge: (loserId: string, winnerId: string) => Promise<void>;
  onClose?: () => void;
  onEditingStart?: () => void;
  onEditingEnd?: () => void;
  onRequestWrite?: () => void;
}

export function MemoResolutionPanel({
  memo,
  currentContent,
  issue,
  remoteContent,
  manualSeed,
  hasDirtyBuffer,
  canWrite,
  mergeLocked = false,
  onKeepCurrent,
  onSaveResolved,
  onMerge,
  onClose,
  onEditingStart,
  onEditingEnd,
  onRequestWrite,
}: MemoResolutionPanelProps) {
  const isDuplicate = issue?.kind === 'duplicate_memo';
  const isRemoteCompare = !issue && remoteContent !== undefined;
  const [preserved, setPreserved] = useState<MemoVersionInterface | null>(null);
  const [databaseMemo, setDatabaseMemo] = useState<MemoInterface | null>(null);
  const [peerMemo, setPeerMemo] = useState<MemoInterface | null>(null);
  const [manualContent, setManualContent] = useState(manualSeed);
  const [winnerId, setWinnerId] = useState(memo.id);
  const [isLoading, setIsLoading] = useState(Boolean(issue));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const manualTouchedRef = useRef(false);
  const issueId = issue?.id;
  const issueKind = issue?.kind;
  const issueRefId = issue?.refId;
  const issuePeerRefId = issue?.peerRefId;
  const preservedVersion =
    typeof issue?.detail.preservedVersion === 'number'
      ? issue.detail.preservedVersion
      : null;

  useEffect(() => {
    let cancelled = false;
    setWinnerId(memo.id);
    manualTouchedRef.current = false;
    setPreserved(null);
    setDatabaseMemo(null);
    setPeerMemo(null);
    setError(null);

    if (!issueId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const load = async () => {
      if (issueKind === 'duplicate_memo') {
        const peerId = issueRefId === memo.id ? issuePeerRefId : issueRefId;
        if (!peerId) throw new Error('중복 메모의 상대 ID가 없습니다.');
        const [current, peer] = await Promise.all([
          api.getMemo(memo.id),
          api.getMemo(peerId),
        ]);
        if (!cancelled) {
          setDatabaseMemo(current);
          setPeerMemo(peer);
        }
        return;
      }

      if (issueKind === 'conflict') {
        const versionNumber = preservedVersion;
        const [current, version] = await Promise.all([
          api.getMemo(memo.id),
          versionNumber !== null
            ? api.getMemoVersion(memo.id, versionNumber)
            : api.getMemoVersions(memo.id).then((versions) =>
                versions.find((item) => item.note?.startsWith('충돌')),
              ),
        ]);
        if (!version) throw new Error('보존된 충돌 버전을 찾을 수 없습니다.');
        if (!cancelled) {
          setDatabaseMemo(current);
          setPreserved(version);
          if (!hasDirtyBuffer && !manualTouchedRef.current) {
            setManualContent(current.content);
          }
        }
      }
    };

    void load()
      .catch((reason) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : '비교 내용을 불러오지 못했습니다.');
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    issueId,
    issueKind,
    issuePeerRefId,
    issueRefId,
    memo.id,
    preservedVersion,
    hasDirtyBuffer,
  ]);

  const leftContent = isDuplicate
    ? databaseMemo?.content ?? null
    : isRemoteCompare
      ? currentContent
      : remoteContent ?? databaseMemo?.content ?? null;
  const rightContent: string | null = isDuplicate
    ? peerMemo?.content ?? null
    : isRemoteCompare
      ? remoteContent ?? null
      : preserved?.content ?? null;
  const rows = useMemo(
    () =>
      leftContent !== null && rightContent !== null
        ? diffLines(leftContent, rightContent)
        : [],
    [leftContent, rightContent],
  );
  const canKeepCurrent = canKeepCurrentResolution(isRemoteCompare, canWrite);

  const run = async (action: () => Promise<void> | void) => {
    setIsSaving(true);
    setError(null);
    try {
      await action();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '처리하지 못했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <div className="memo-resolution-loading">비교 내용을 불러오는 중...</div>;
  }

  const leftTitle = isDuplicate ? databaseMemo?.title ?? memo.title : '현재 내용';
  const rightTitle = isDuplicate
    ? peerMemo?.title ?? '상대 메모'
    : isRemoteCompare
      ? '원격에서 도착한 내용'
      : preserved?.note ?? '보존된 충돌 버전';

  return (
    <section className="memo-resolution" aria-label="동기화 문제 해소">
      <header className="memo-resolution-header">
        <div>
          <strong>
            {isDuplicate
              ? '중복 메모 정리'
              : isRemoteCompare
                ? '원격 변경 비교'
                : '충돌 내용 선택'}
          </strong>
          <p>
            {isDuplicate
              ? '생존자를 선택하면 패자의 내용과 버전이 생존자의 버전 기록으로 옮겨집니다.'
              : '색이 있는 줄만 다릅니다. 원본은 버전 기록에 남습니다.'}
          </p>
        </div>
        {onClose && (
          <button type="button" onClick={onClose} className="memo-resolution-close">
            닫기
          </button>
        )}
      </header>

      {error && <div className="memo-action-error">{error}</div>}

      <div className="memo-diff-headings">
        <strong>{leftTitle}</strong>
        <strong>{rightTitle}</strong>
      </div>
      <div className="memo-line-diff">
        {rows.map((row, index) => (
          <div
            className={`memo-diff-row memo-diff-${row.kind}`}
            key={`${index}-${row.left ?? ''}-${row.right ?? ''}`}
          >
            <pre>{row.left ?? ''}</pre>
            <pre>{row.right ?? ''}</pre>
          </div>
        ))}
      </div>

      {isDuplicate ? (
        <div className="memo-resolution-actions">
          <label>
            <input
              type="radio"
              name={`memo-survivor-${issue?.id}`}
              checked={winnerId === memo.id}
              onChange={() => setWinnerId(memo.id)}
            />
            왼쪽 메모를 생존자로 유지
          </label>
          {peerMemo && (
            <label>
              <input
                type="radio"
                name={`memo-survivor-${issue?.id}`}
                checked={winnerId === peerMemo.id}
                onChange={() => setWinnerId(peerMemo.id)}
              />
              오른쪽 메모를 생존자로 유지
            </label>
          )}
          <button
            type="button"
            disabled={isSaving || !peerMemo || mergeLocked}
            onClick={() => {
              if (!peerMemo) return;
              const loserId = winnerId === memo.id ? peerMemo.id : memo.id;
              void run(() => onMerge(loserId, winnerId));
            }}
          >
            {isSaving ? '병합 중...' : '선택한 메모로 병합'}
          </button>
          {mergeLocked && (
            <p className="memo-lease-help">
              오프라인에서는 병합할 수 없습니다. 온라인에서 정리하세요.
            </p>
          )}
        </div>
      ) : (
        <>
          <label className="memo-manual-label">
            직접 병합
            <textarea
              value={manualContent}
              onChange={(event) => {
                manualTouchedRef.current = true;
                setManualContent(event.target.value);
              }}
              disabled={!canWrite || isSaving}
              onKeyDown={(event) => {
                if (!isSaveShortcut(event)) return;
                event.preventDefault();
                event.stopPropagation();
                event.nativeEvent.stopImmediatePropagation();
                if (canWrite && !isSaving) {
                  void run(() => onSaveResolved(manualContent));
                }
              }}
              onFocus={onEditingStart}
              onBlur={onEditingEnd}
              aria-label="직접 병합할 메모 내용"
            />
          </label>
          <div className="memo-resolution-actions">
            <button
              type="button"
              onClick={() => {
                if (leftContent === null) return;
                void run(() => onKeepCurrent(leftContent));
              }}
              disabled={isSaving || leftContent === null || !canKeepCurrent}
            >
              현재 유지
            </button>
            <button
              type="button"
              disabled={!canWrite || isSaving || rightContent === null}
              onClick={() => {
                if (rightContent === null) return;
                void run(() => onSaveResolved(rightContent));
              }}
            >
              {isRemoteCompare ? '원격 내용 적용' : '보존 버전으로 교체'}
            </button>
            <button
              type="button"
              disabled={!canWrite || isSaving}
              onClick={() => void run(() => onSaveResolved(manualContent))}
            >
              직접 병합해서 저장
            </button>
          </div>
          {!canWrite && (
            <div className="memo-lease-help">
              편집 잠금을 확보한 뒤 교체하거나 직접 병합할 수 있습니다.
              {onRequestWrite && (
                <button type="button" onClick={onRequestWrite}>
                  편집 잠금 요청
                </button>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
