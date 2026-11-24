'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';

import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { useTaskRollupLeases } from '@/hooks/useTaskRollupLeases';
import {
  ApiError,
  completeProjectTaskRollup,
  getProjectTaskRollup,
  previewProjectTaskRollup,
  undoProjectTaskRollup,
} from '@/lib/api';
import { normalMemoEditorRegistry } from '@/lib/memoEditorRegistry';
import { shouldIsolateTaskRollupKey } from '@/lib/backlogPolicy';
import {
  collectTaskRollupOperation,
  canChangeTaskRollupMemoScope,
  acquireTaskRollupWriteReadiness,
  editorBlockersForTaskRollup,
  indexTaskRollupNodes,
  hasTaskRollupCompletionReceipt,
  hasTaskRollupUndoReceipt,
  formatTaskRollupMemoCounts,
  isTaskRollupOperationScopeCurrent,
  isTaskRollupCompletionVisible,
  isTaskRollupNodeInteractive,
  removeTaskRollupNode,
  summarizeTaskRollupSources,
  taskRollupServerClockOffset,
  taskRollupCandidateNotice,
  taskRollupWriteGate,
} from '@/lib/taskRollupPolicy';
import type {
  CompleteTaskRollupRequestInterface,
  ProjectInterface,
  TaskRollupAliasInterface,
  TaskRollupCandidateInterface,
  TaskRollupCompletionInterface,
  TaskRollupNodeInterface,
  TaskRollupMemoScope,
  TaskRollupPreviewInterface,
  UndoTaskRollupRequestInterface,
} from '@/lib/types';
import type { TaskRollupOperationScope } from '@/lib/taskRollupPolicy';

interface TaskRollupPanelProps {
  project: ProjectInterface;
}

type PendingRequest =
  | {
      kind: 'complete';
      projectId: string;
      groupKey: string;
      request: CompleteTaskRollupRequestInterface;
      scope: TaskRollupOperationScope;
    }
  | {
      kind: 'undo';
      projectId: string;
      operationId: string;
      request: UndoTaskRollupRequestInterface;
      scope: TaskRollupOperationScope;
    };

const completionStatusLabel: Record<TaskRollupCompletionInterface['status'], string> = {
  ready: '오늘 완료',
  pending: '동기화 반영 대기',
  superseded: '원본이 이후 변경됨',
  conflict: '동기화 충돌',
  undone: '되돌림 완료',
};

const operationId = () => globalThis.crypto.randomUUID();

const blockerMessage = (blockers: ReturnType<typeof taskRollupWriteGate>['blockers']) =>
  blockers.map((blocker) =>
    `${blocker.memoTitle}: ${blocker.reasons.join(', ')}`).join(' · ');

function SourceSummary({ node }: { node: TaskRollupNodeInterface }) {
  const sources = summarizeTaskRollupSources(node.occurrences);
  if (sources.length === 0) return null;
  const count = sources.reduce((total, source) => total + source.count, 0);
  const labels = sources.map((source) =>
    `${source.memoTitle}${source.count > 1 ? ` ×${source.count}` : ''}`);
  return (
    <span className="task-rollup-sources" title={labels.join(', ')}>
      원본 {count}개 · {labels.join(', ')}
    </span>
  );
}

function CompletionContext({ completion }: { completion: TaskRollupCompletionInterface }) {
  if (!completion.context?.length) return null;
  return (
    <ol className="task-rollup-completion-context" aria-label="완료 당시 상위 맥락">
      {completion.context.map((item) => (
        <li key={item.key} data-rollup-context-key={item.key}>
          <span aria-hidden="true">
            {item.kind === 'description' ? '−' : item.checked ? '✓' : '·'}
          </span>
          <span>{item.text}</span>
        </li>
      ))}
    </ol>
  );
}

function TaskTreeNode({
  node,
  disabled,
  onComplete,
  rootUndo,
  checkedOverride,
  isNodeBlocked,
}: {
  node: TaskRollupNodeInterface;
  disabled: boolean;
  onComplete?: (node: TaskRollupNodeInterface) => void;
  rootUndo?: () => void;
  checkedOverride?: boolean;
  isNodeBlocked?: (node: TaskRollupNodeInterface) => boolean;
}) {
  const interactive = isTaskRollupNodeInteractive({
    kind: node.kind,
    actionable: node.actionable,
    hasCompleteAction: Boolean(onComplete),
    hasUndoAction: Boolean(rootUndo),
  });
  const nodeDisabled = disabled || Boolean(node.actionable && isNodeBlocked?.(node));
  return (
    <li className={`task-rollup-node task-rollup-node--${node.kind}`} data-rollup-key={node.key}>
      <div className="task-rollup-node-row">
        {node.kind === 'description' ? (
          <span className="task-rollup-description-mark" aria-hidden="true">−</span>
        ) : (
          <input
            type="checkbox"
            checked={checkedOverride ?? (rootUndo ? true : node.checked)}
            disabled={nodeDisabled || !interactive}
            aria-label={rootUndo
              ? `${node.text} 완료 되돌리기 · 원본 ${node.occurrences.length}개`
              : `${node.text} 완료 · 원본 ${node.occurrences.length}개`}
            onChange={(event) => {
              if (rootUndo && !event.currentTarget.checked) rootUndo();
              else if (onComplete && event.currentTarget.checked) onComplete(node);
            }}
          />
        )}
        <span className="task-rollup-node-copy">
          <span className="task-rollup-node-text">{node.text}</span>
          <SourceSummary node={node} />
        </span>
      </div>
      {node.children.length > 0 && (
        <ul>
          {node.children.map((child) => (
            <TaskTreeNode
              key={child.key}
              node={child}
              disabled={disabled}
              onComplete={onComplete}
              isNodeBlocked={isNodeBlocked}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function CandidateForm({
  candidate,
  nodes,
  pending,
  onCancel,
  onConfirm,
}: {
  candidate: TaskRollupCandidateInterface;
  nodes: Map<string, TaskRollupNodeInterface>;
  pending: boolean;
  onCancel: () => void;
  onConfirm: (variantKeys: string[]) => void;
}) {
  const [selectedVariantKeys, setSelectedVariantKeys] = useState<string[]>([]);
  const seed = nodes.get(candidate.seedKey);
  const variants = candidate.variantKeys
    .filter((key, index, keys) => keys.indexOf(key) === index)
    .map((key) => nodes.get(key))
    .filter((node): node is TaskRollupNodeInterface => Boolean(node));

  return (
    <form
      className="task-rollup-candidate-form"
      data-candidate-seed={candidate.seedKey}
      onSubmit={(event) => {
        event.preventDefault();
        if (selectedVariantKeys.length > 0 && !pending) onConfirm(selectedVariantKeys);
      }}
    >
      <strong>비슷한 표현을 한 작업으로 묶을까요?</strong>
      <p>실제로 같은 작업인 표현만 선택하세요. 선택하지 않은 표현은 별도 작업으로 남습니다.</p>
      <ul>
        {seed && (
          <li>
            <strong>기준 · {seed.text}</strong>
            <SourceSummary node={seed} />
          </li>
        )}
        {variants.map((variant) => (
          <li key={variant.key}>
            <label>
              <input
                type="checkbox"
                checked={selectedVariantKeys.includes(variant.key)}
                onChange={(event) => {
                  const checked = event.currentTarget.checked;
                  setSelectedVariantKeys((current) => checked
                    ? [...current, variant.key]
                    : current.filter((key) => key !== variant.key));
                }}
              />
              <span>
                <span>{variant.text}</span>
                <SourceSummary node={variant} />
              </span>
            </label>
          </li>
        ))}
      </ul>
      <div className="task-rollup-candidate-actions">
        <button type="button" className="todo-action-button todo-action-button--secondary" onClick={onCancel}>
          취소
        </button>
        <button type="submit" className="todo-action-button" disabled={selectedVariantKeys.length === 0 || pending}>
          {pending ? '미리보는 중…' : `선택한 표현 ${selectedVariantKeys.length}개 함께 보기`}
        </button>
      </div>
    </form>
  );
}

export function TaskRollupPanel({ project }: TaskRollupPanelProps) {
  const { refreshCurrentProject } = useApp();
  const { user } = useAuth();
  const actorId = user?.id ?? null;
  const [preview, setPreview] = useState<TaskRollupPreviewInterface | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmingSeed, setConfirmingSeed] = useState<string | null>(null);
  const [pendingRequest, setPendingRequest] = useState<PendingRequest | null>(null);
  const [memoScope, setMemoScope] = useState<TaskRollupMemoScope>('all');
  const pendingRequestRef = useRef<PendingRequest | null>(null);
  const acknowledgedReceiptIdsRef = useRef(new Set<string>());
  const releaseOperationLeasesRef = useRef<() => void>(() => {});
  const [now, setNow] = useState(() => Date.now());
  const [serverClockOffsetMs, setServerClockOffsetMs] = useState(0);
  const serverClockOffsetRef = useRef(0);
  const requestSequenceRef = useRef(0);
  const previewAbortRef = useRef<AbortController | null>(null);
  const projectIdRef = useRef(project.id);
  const operationScopeRef = useRef<TaskRollupOperationScope>({
    actorId,
    projectId: project.id,
    memoScope,
    epoch: 1,
  });
  useSyncExternalStore(
    normalMemoEditorRegistry.subscribe,
    normalMemoEditorRegistry.getVersion,
    normalMemoEditorRegistry.getVersion,
  );
  const editorStates = normalMemoEditorRegistry.getAll();

  useLayoutEffect(() => {
    projectIdRef.current = project.id;
    if (
      operationScopeRef.current.actorId === actorId &&
      operationScopeRef.current.projectId === project.id &&
      operationScopeRef.current.memoScope === memoScope
    ) return;
    operationScopeRef.current = {
      actorId,
      projectId: project.id,
      memoScope,
      epoch: operationScopeRef.current.epoch + 1,
    };
  }, [actorId, memoScope, project.id]);

  const isCurrentOperation = useCallback((scope: TaskRollupOperationScope) =>
    isTaskRollupOperationScopeCurrent(scope, operationScopeRef.current), []);

  const replacePendingRequest = useCallback((pending: PendingRequest | null) => {
    pendingRequestRef.current = pending;
    setPendingRequest(pending);
  }, []);

  const adoptPreview = useCallback((next: TaskRollupPreviewInterface) => {
    const clientNow = Date.now();
    const offset = taskRollupServerClockOffset(next.serverTimeUtc, clientNow);
    serverClockOffsetRef.current = offset;
    setServerClockOffsetMs(offset);
    setNow(clientNow + offset);
    setPreview(next);
  }, []);

  const loadDefaultPreview = useCallback(async (quiet = false) => {
    const requestProjectId = project.id;
    const requestMemoScope = memoScope;
    const scope = { ...operationScopeRef.current };
    const sequence = ++requestSequenceRef.current;
    previewAbortRef.current?.abort();
    const controller = new AbortController();
    previewAbortRef.current = controller;
    if (!quiet) setLoading(true);
    try {
      const next = await getProjectTaskRollup(
        requestProjectId,
        requestMemoScope,
        controller.signal,
      );
      if (
        sequence !== requestSequenceRef.current ||
        requestProjectId !== projectIdRef.current ||
        requestMemoScope !== operationScopeRef.current.memoScope ||
        !isCurrentOperation(scope)
      ) return;
      adoptPreview(next);
      setConfirmingSeed(null);
      const pending = pendingRequestRef.current;
      const receiptAcknowledged = pending?.kind === 'complete'
        ? hasTaskRollupCompletionReceipt(pending.request.operationId, next.completions)
        : pending?.kind === 'undo'
          ? hasTaskRollupUndoReceipt(pending.operationId, next.completions)
          : false;
      if (pending && receiptAcknowledged) {
        const receiptRequestId = pending.kind === 'complete'
          ? pending.request.operationId
          : pending.request.undoOperationId;
        acknowledgedReceiptIdsRef.current.add(receiptRequestId);
        replacePendingRequest(null);
        releaseOperationLeasesRef.current();
        setError(null);
        setMessage(pending.kind === 'complete'
          ? '원본 할 일을 모두 완료했습니다.'
          : '이 완료 작업만 되돌렸습니다.');
      } else if (!pending) {
        setError(null);
      }
    } catch (loadError) {
      if (
        controller.signal.aborted ||
        sequence !== requestSequenceRef.current ||
        !isCurrentOperation(scope)
      ) return;
      setError(loadError instanceof Error ? loadError.message : '할 일 모음을 불러오지 못했습니다.');
    } finally {
      if (sequence === requestSequenceRef.current && isCurrentOperation(scope)) {
        setLoading(false);
        previewAbortRef.current = null;
      }
    }
  }, [adoptPreview, isCurrentOperation, memoScope, project.id, replacePendingRequest]);

  const refreshAfterSourceChange = useCallback(() => {
    void refreshCurrentProject().catch(() => undefined);
    void loadDefaultPreview(true);
  }, [loadDefaultPreview, refreshCurrentProject]);

  const leases = useTaskRollupLeases({ onSourceUpdated: refreshAfterSourceChange });
  const watchSourceMemos = leases.watch;

  useLayoutEffect(() => {
    releaseOperationLeasesRef.current = leases.release;
    return () => {
      if (releaseOperationLeasesRef.current === leases.release) {
        releaseOperationLeasesRef.current = () => {};
      }
    };
  }, [leases.release]);

  useEffect(() => {
    setPreview(null);
    setMessage(null);
    setError(null);
    replacePendingRequest(null);
    acknowledgedReceiptIdsRef.current.clear();
    setBusy(false);
    leases.release();
    void loadDefaultPreview();
    return () => {
      previewAbortRef.current?.abort();
    };
    // release is stable; a project switch must invalidate all operation-scoped leases.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actorId, loadDefaultPreview, memoScope, project.id]);

  useEffect(() => {
    const refreshVisible = () => {
      setNow(Date.now() + serverClockOffsetRef.current);
      void loadDefaultPreview(true);
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') refreshVisible();
    };
    window.addEventListener('focus', refreshVisible);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('focus', refreshVisible);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [loadDefaultPreview]);

  useEffect(() => {
    if (!preview) return;
    const boundary = Date.parse(preview.nextBoundaryUtc);
    if (!Number.isFinite(boundary)) return;
    const serverNow = Date.now() + serverClockOffsetMs;
    const delay = boundary - serverNow;
    if (delay <= 0) {
      setNow(serverNow);
      return;
    }
    const timer = window.setTimeout(() => {
      setNow(Date.now() + serverClockOffsetRef.current);
      void loadDefaultPreview(true);
    }, Math.min(delay + 25, 2_147_483_647));
    return () => window.clearTimeout(timer);
  }, [loadDefaultPreview, preview, serverClockOffsetMs]);

  const handleConflict = useCallback(async (scope: TaskRollupOperationScope) => {
    if (!isCurrentOperation(scope)) return;
    leases.release();
    replacePendingRequest(null);
    setMessage('원본이 변경되어 새 미리보기를 불러왔습니다. 내용을 다시 확인하세요.');
    setConfirmingSeed(null);
    await loadDefaultPreview();
  }, [isCurrentOperation, leases, loadDefaultPreview, replacePendingRequest]);

  const applyCompletionResult = useCallback((
    result: TaskRollupCompletionInterface,
    removedGroupKey?: string,
  ) => {
    setPreview((current) => current ? {
      ...current,
      groups: removedGroupKey
        ? removeTaskRollupNode(current.groups, removedGroupKey)
        : current.groups,
      completions: [
        result,
        ...current.completions.filter((item) => item.operationId !== result.operationId),
      ],
    } : current);
  }, []);

  const sendPendingRequest = useCallback(async (pending: PendingRequest) => {
    if (!isCurrentOperation(pending.scope)) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = pending.kind === 'complete'
        ? await completeProjectTaskRollup(pending.projectId, pending.request)
        : await undoProjectTaskRollup(
            pending.projectId,
            pending.operationId,
            pending.request,
          );
      if (!isCurrentOperation(pending.scope)) return;
      applyCompletionResult(
        result,
        pending.kind === 'complete' ? pending.groupKey : undefined,
      );
      replacePendingRequest(null);
      leases.release();
      setMessage(pending.kind === 'complete' ? '원본 할 일을 모두 완료했습니다.' : '이 완료 작업만 되돌렸습니다.');
      await Promise.allSettled([
        refreshCurrentProject(),
        loadDefaultPreview(true),
      ]);
    } catch (submitError) {
      if (!isCurrentOperation(pending.scope)) return;
      const receiptRequestId = pending.kind === 'complete'
        ? pending.request.operationId
        : pending.request.undoOperationId;
      if (acknowledgedReceiptIdsRef.current.has(receiptRequestId)) {
        replacePendingRequest(null);
        leases.release();
        setError(null);
        setMessage(pending.kind === 'complete'
          ? '원본 할 일을 모두 완료했습니다.'
          : '이 완료 작업만 되돌렸습니다.');
        return;
      }
      if (submitError instanceof ApiError) {
        if (submitError.status === 409) {
          await handleConflict(pending.scope);
        } else {
          leases.release();
          replacePendingRequest(null);
          setError(submitError.message);
        }
      } else {
        // The server may have committed before the response was lost. Keep the exact
        // request and operation UUID so the retry is an idempotent receipt lookup.
        replacePendingRequest(pending);
        setError('서버 응답을 확인하지 못했습니다. 같은 작업 번호로 다시 확인하세요.');
      }
    } finally {
      if (isCurrentOperation(pending.scope)) setBusy(false);
    }
  }, [applyCompletionResult, handleConflict, isCurrentOperation, leases, loadDefaultPreview, refreshCurrentProject, replacePendingRequest]);

  const handleComplete = useCallback(async (node: TaskRollupNodeInterface) => {
    if (!preview || busy || pendingRequest) return;
    const scope = { ...operationScopeRef.current };
    const operation = collectTaskRollupOperation(node);
    const initialGate = taskRollupWriteGate(
      operation.changedMemoIds,
      normalMemoEditorRegistry.getAll(),
    );
    if (!initialGate.canSubmit) {
      setError(blockerMessage(initialGate.blockers));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const readiness = await acquireTaskRollupWriteReadiness({
        affectedMemoIds: operation.changedMemoIds,
        acquire: () => leases.acquire(operation.changedMemoIds),
        readEditors: normalMemoEditorRegistry.getAll,
        release: leases.release,
        isCurrent: () => isCurrentOperation(scope),
      });
      if (readiness.status === 'stale') return;
      if (readiness.status === 'blocked') {
        setError(blockerMessage(readiness.blockers));
        return;
      }
      const request: CompleteTaskRollupRequestInterface = {
        operationId: operationId(),
        corpusDigest: preview.corpusDigest,
        groupKey: node.key,
        aliases: preview.aliases,
        occurrenceKeys: operation.occurrenceKeys,
        leases: readiness.leases,
        memoScope: scope.memoScope,
      };
      const pending: PendingRequest = {
        kind: 'complete',
        projectId: project.id,
        groupKey: node.key,
        request,
        scope,
      };
      replacePendingRequest(pending);
      await sendPendingRequest(pending);
    } catch (leaseError) {
      if (!isCurrentOperation(scope)) return;
      setError(leaseError instanceof Error ? leaseError.message : '원본 메모 잠금을 확보하지 못했습니다.');
    } finally {
      if (isCurrentOperation(scope)) setBusy(false);
    }
  }, [busy, isCurrentOperation, leases, pendingRequest, preview, project.id, replacePendingRequest, sendPendingRequest]);

  const handleUndo = useCallback(async (completion: TaskRollupCompletionInterface) => {
    if (!preview || busy || pendingRequest || completion.status !== 'ready' || !completion.canUndo) return;
    const scope = { ...operationScopeRef.current };
    const initialGate = taskRollupWriteGate(
      completion.changedMemoIds,
      normalMemoEditorRegistry.getAll(),
    );
    if (!initialGate.canSubmit) {
      setError(blockerMessage(initialGate.blockers));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const readiness = await acquireTaskRollupWriteReadiness({
        affectedMemoIds: completion.changedMemoIds,
        acquire: () => leases.acquire(completion.changedMemoIds),
        readEditors: normalMemoEditorRegistry.getAll,
        release: leases.release,
        isCurrent: () => isCurrentOperation(scope),
      });
      if (readiness.status === 'stale') return;
      if (readiness.status === 'blocked') {
        setError(blockerMessage(readiness.blockers));
        return;
      }
      const request: UndoTaskRollupRequestInterface = {
        undoOperationId: operationId(),
        corpusDigest: preview.corpusDigest,
        leases: readiness.leases,
        memoScope: scope.memoScope,
      };
      const pending: PendingRequest = {
        kind: 'undo',
        projectId: project.id,
        operationId: completion.operationId,
        request,
        scope,
      };
      replacePendingRequest(pending);
      await sendPendingRequest(pending);
    } catch (leaseError) {
      if (!isCurrentOperation(scope)) return;
      setError(leaseError instanceof Error ? leaseError.message : '원본 메모 잠금을 확보하지 못했습니다.');
    } finally {
      if (isCurrentOperation(scope)) setBusy(false);
    }
  }, [busy, isCurrentOperation, leases, pendingRequest, preview, project.id, replacePendingRequest, sendPendingRequest]);

  const confirmCandidate = useCallback(async (
    candidate: TaskRollupCandidateInterface,
    variantKeys: string[],
  ) => {
    if (!preview || busy) return;
    const scope = { ...operationScopeRef.current };
    const alias: TaskRollupAliasInterface = {
      seedKey: candidate.seedKey,
      variantKeys,
    };
    const aliases = [
      ...preview.aliases.filter((item) => item.seedKey !== alias.seedKey),
      alias,
    ];
    setBusy(true);
    setError(null);
    const sequence = ++requestSequenceRef.current;
    previewAbortRef.current?.abort();
    const controller = new AbortController();
    previewAbortRef.current = controller;
    try {
      const next = await previewProjectTaskRollup(
        project.id,
        aliases,
        scope.memoScope,
        controller.signal,
      );
      if (
        sequence !== requestSequenceRef.current ||
        !isCurrentOperation(scope)
      ) return;
      adoptPreview(next);
      setConfirmingSeed(null);
      setMessage('확인한 표현을 현재 미리보기에 함께 묶었습니다.');
    } catch (candidateError) {
      if (controller.signal.aborted || !isCurrentOperation(scope)) return;
      if (candidateError instanceof ApiError && candidateError.status === 409) {
        await handleConflict(scope);
      } else {
        setError(candidateError instanceof Error ? candidateError.message : '표현을 함께 미리 보지 못했습니다.');
      }
    } finally {
      if (sequence === requestSequenceRef.current && isCurrentOperation(scope)) {
        previewAbortRef.current = null;
        setBusy(false);
      }
    }
  }, [adoptPreview, busy, handleConflict, isCurrentOperation, preview, project.id]);

  const visibleCompletions = preview?.completions.filter((completion) =>
    isTaskRollupCompletionVisible(completion, now)) ?? [];
  const nodes = useMemo(() => indexTaskRollupNodes(preview?.groups ?? []), [preview?.groups]);
  const watchedMemoIds = useMemo(() => {
    const ids = new Set<string>();
    const visit = (node: TaskRollupNodeInterface) => {
      node.occurrences.forEach((occurrence) => ids.add(occurrence.memoId));
      node.children.forEach(visit);
    };
    preview?.groups.forEach(visit);
    preview?.completions.forEach((completion) => visit(completion.group));
    return [...ids].sort();
  }, [preview]);
  const operationMemoIds = useMemo(() => {
    const ids = new Set<string>();
    const visit = (node: TaskRollupNodeInterface) => {
      collectTaskRollupOperation(node).changedMemoIds.forEach((memoId) => ids.add(memoId));
      node.children.forEach(visit);
    };
    preview?.groups.forEach(visit);
    preview?.completions.forEach((completion) =>
      completion.changedMemoIds.forEach((memoId) => ids.add(memoId)));
    return [...ids].sort();
  }, [preview]);
  const activeEditorBlockers = editorBlockersForTaskRollup(operationMemoIds, editorStates);
  const isNodeBlocked = useCallback((node: TaskRollupNodeInterface) =>
    !taskRollupWriteGate(
      collectTaskRollupOperation(node).changedMemoIds,
      normalMemoEditorRegistry.getAll(),
    ).canSubmit, []);

  useEffect(() => {
    watchSourceMemos(watchedMemoIds);
    return () => watchSourceMemos([]);
  }, [watchSourceMemos, watchedMemoIds]);

  const confirmingCandidate = preview?.candidates.find((candidate) =>
    candidate.seedKey === confirmingSeed) ?? null;
  const writeDisabled =
    !project.canWrite ||
    !preview?.canComplete ||
    busy ||
    Boolean(pendingRequest);

  return (
    <section
      className="task-rollup-panel task-rollup"
      data-testid="task-rollup"
      data-loading={loading ? 'true' : 'false'}
      data-lease-state={leases.state}
      data-busy={busy ? 'true' : 'false'}
      data-pending-request={pendingRequest ? pendingRequest.kind : 'none'}
      data-memo-scope={memoScope}
      aria-labelledby="task-rollup-heading"
      onKeyDown={(event) => {
        if (shouldIsolateTaskRollupKey(event)) event.stopPropagation();
      }}
      onKeyUp={(event) => event.stopPropagation()}
      onBeforeInput={(event) => event.stopPropagation()}
    >
      <div className="task-rollup-heading-row">
        <div className="task-rollup-heading-copy">
          <strong id="task-rollup-heading">저장된 메모의 할 일</strong>
          <span>최신 저장본에서 생성됨</span>
        </div>
        <label className="task-rollup-scope-control">
          <span>메모 범위</span>
          <select
            aria-label="할 일 모음 메모 범위"
            value={memoScope}
            disabled={!canChangeTaskRollupMemoScope({
              busy,
              hasPendingRequest: Boolean(pendingRequest),
            })}
            onChange={(event) => {
              const nextScope = event.currentTarget.value as TaskRollupMemoScope;
              if (nextScope === memoScope) return;
              requestSequenceRef.current += 1;
              previewAbortRef.current?.abort();
              setMemoScope(nextScope);
            }}
          >
            <option value="all">전체 메모</option>
            <option value="recent30">최근 생성 30개</option>
          </select>
        </label>
        <button
          type="button"
          className="task-rollup-refresh todo-action-button todo-action-button--secondary"
          onClick={() => void loadDefaultPreview()}
          disabled={loading || busy}
        >
          새로 고침
        </button>
      </div>

      {(message || error || leases.message) && (
        <div className={error || leases.message ? 'task-rollup-error' : 'task-rollup-message'} role="status" aria-live="polite">
          {error || leases.message || message}
        </div>
      )}

      {preview && (
        <div className="task-rollup-scope-counts" aria-live="polite">
          {formatTaskRollupMemoCounts(preview)}
        </div>
      )}

      {activeEditorBlockers.length > 0 && (
        <div className="task-rollup-blockers" role="status">
          원본 편집 정리 필요 · {blockerMessage(activeEditorBlockers)}
        </div>
      )}

      {pendingRequest && !busy && (
        <div className="task-rollup-retry-actions">
          <button
            type="button"
            className="todo-action-button"
            disabled={busy}
            onClick={() => void sendPendingRequest(pendingRequest)}
          >
            같은 작업 번호로 응답 확인
          </button>
        </div>
      )}

      {loading && !preview ? (
        <p className="task-rollup-empty">할 일을 모으는 중입니다…</p>
      ) : preview ? (
        <div className="task-rollup-scroll">
          {visibleCompletions.length > 0 && (
            <section className="task-rollup-completions" aria-label="오늘 완료한 할 일">
              <h3>오늘 완료</h3>
              {visibleCompletions.map((completion) => (
                <div
                  className={`task-rollup-completion task-rollup-completion--${completion.status}`}
                  key={completion.operationId}
                  data-operation-id={completion.operationId}
                  data-status={completion.status}
                >
                  <div className="task-rollup-completion-status">
                    {completionStatusLabel[completion.status]}
                  </div>
                  <CompletionContext completion={completion} />
                  <ul className="task-rollup-tree">
                    <TaskTreeNode
                      node={completion.group}
                      disabled={
                        writeDisabled ||
                        completion.status !== 'ready' ||
                        !completion.canUndo ||
                        !taskRollupWriteGate(
                          completion.changedMemoIds,
                          editorStates,
                        ).canSubmit
                      }
                      rootUndo={() => void handleUndo(completion)}
                      checkedOverride={completion.status !== 'undone'}
                    />
                  </ul>
                </div>
              ))}
            </section>
          )}

          {preview.groups.length > 0 ? (
            <ul className="task-rollup-tree" aria-label="완료하지 않은 할 일">
              {preview.groups.map((node) => (
                <TaskTreeNode
                  key={node.key}
                  node={node}
                  disabled={writeDisabled}
                  onComplete={(selected) => void handleComplete(selected)}
                  isNodeBlocked={isNodeBlocked}
                />
              ))}
            </ul>
          ) : visibleCompletions.length === 0 ? (
            <p className="task-rollup-empty">저장된 메모에 완료할 할 일이 없습니다.</p>
          ) : null}

          {!project.canWrite && (
            <p className="task-rollup-readonly">보기 권한으로는 할 일을 완료하거나 되돌릴 수 없습니다.</p>
          )}

          {confirmingCandidate ? (
            <CandidateForm
              key={confirmingCandidate.seedKey}
              candidate={confirmingCandidate}
              nodes={nodes}
              pending={busy}
              onCancel={() => setConfirmingSeed(null)}
              onConfirm={(variantKeys) => void confirmCandidate(confirmingCandidate, variantKeys)}
            />
          ) : preview.candidates.length > 0 ? (
            <section className="task-rollup-candidates" aria-label="확인이 필요한 비슷한 표현">
              <h3>비슷한 표현 확인</h3>
              {preview.candidates.map((candidate) => {
                const seed = nodes.get(candidate.seedKey);
                const variants = candidate.variantKeys.map((key) => nodes.get(key)).filter(Boolean);
                const notice = taskRollupCandidateNotice(candidate);
                if (!notice.confirmable) {
                  return (
                    <div
                      className="task-rollup-candidate-limit"
                      key={candidate.seedKey}
                      data-candidate-seed={candidate.seedKey}
                      role="status"
                    >
                      <span>{seed?.text ?? '기준 표현'}</span>
                      <small>{notice.message}</small>
                    </div>
                  );
                }
                return (
                  <button
                    type="button"
                    className="task-rollup-candidate-button"
                    key={candidate.seedKey}
                    data-candidate-seed={candidate.seedKey}
                    aria-label={`${seed?.text ?? '기준 표현'} 비슷한 표현 확인`}
                    onClick={() => setConfirmingSeed(candidate.seedKey)}
                  >
                    <span>{seed?.text ?? '기준 표현'}</span>
                    <small>다른 표현 {variants.length}개 · 원본 범위를 확인하고 묶기</small>
                  </button>
                );
              })}
            </section>
          ) : null}
        </div>
      ) : (
        <p className="task-rollup-empty">새로 고침으로 다시 불러오세요.</p>
      )}
    </section>
  );
}
