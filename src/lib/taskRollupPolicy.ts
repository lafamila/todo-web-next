import type {
  TaskRollupCompletionInterface,
  TaskRollupCandidateInterface,
  TaskRollupNodeInterface,
  TaskRollupOccurrenceInterface,
  TaskRollupMemoScope,
} from './types';
import type { NormalMemoEditorState } from './memoEditorRegistry';

export interface TaskRollupSourceSummary {
  memoId: string;
  memoTitle: string;
  count: number;
}

export interface TaskRollupEditorBlocker {
  memoId: string;
  memoTitle: string;
  reasons: string[];
}

export interface TaskRollupOperationScope {
  actorId: string | null;
  projectId: string;
  memoScope: TaskRollupMemoScope;
  epoch: number;
}

export function collectTaskRollupOperation(node: TaskRollupNodeInterface): {
  occurrenceKeys: string[];
  changedMemoIds: string[];
} {
  return {
    occurrenceKeys: [...new Set(node.occurrences.map((occurrence) => occurrence.key))].sort(),
    changedMemoIds: [...new Set(
      node.occurrences
        .filter((occurrence) => occurrence.marker === '-- ')
        .map((occurrence) => occurrence.memoId),
    )].sort(),
  };
}

export function isTaskRollupNodeInteractive(input: {
  kind: TaskRollupNodeInterface['kind'];
  actionable: boolean;
  hasCompleteAction: boolean;
  hasUndoAction: boolean;
}): boolean {
  return input.kind === 'task' && (
    input.hasUndoAction ||
    (input.actionable && input.hasCompleteAction)
  );
}

export function canChangeTaskRollupMemoScope(input: {
  busy: boolean;
  hasPendingRequest: boolean;
}): boolean {
  return !input.busy && !input.hasPendingRequest;
}

export function formatTaskRollupMemoCounts(input: {
  totalMemoCount: number;
  selectedMemoCount: number;
  excludedMemoCount: number;
}): string {
  return `전체 ${input.totalMemoCount}개 · 선택 ${input.selectedMemoCount}개 · 제외 ${input.excludedMemoCount}개`;
}

export function summarizeTaskRollupSources(
  occurrences: TaskRollupOccurrenceInterface[],
): TaskRollupSourceSummary[] {
  const summaries = new Map<string, TaskRollupSourceSummary>();
  for (const occurrence of occurrences) {
    const previous = summaries.get(occurrence.memoId);
    summaries.set(occurrence.memoId, {
      memoId: occurrence.memoId,
      memoTitle: occurrence.memoTitle,
      count: (previous?.count ?? 0) + 1,
    });
  }
  return [...summaries.values()].sort((left, right) =>
    left.memoTitle.localeCompare(right.memoTitle) || left.memoId.localeCompare(right.memoId));
}

export function editorBlockersForTaskRollup(
  affectedMemoIds: string[],
  editors: NormalMemoEditorState[],
): TaskRollupEditorBlocker[] {
  const affected = new Set(affectedMemoIds);
  return editors.flatMap((editor) => {
    if (!affected.has(editor.memoId)) return [];
    const reasons: string[] = [];
    if (editor.dirty) reasons.push('저장하지 않은 변경');
    if (editor.pending) reasons.push('저장 또는 처리 대기');
    if (editor.conflicted) reasons.push('충돌 해결 필요');
    return reasons.length > 0 ? [{
      memoId: editor.memoId,
      memoTitle: editor.memoTitle,
      reasons,
    }] : [];
  });
}

export function taskRollupWriteGate(
  affectedMemoIds: string[],
  editors: NormalMemoEditorState[],
): { canSubmit: boolean; blockers: TaskRollupEditorBlocker[] } {
  const blockers = editorBlockersForTaskRollup(affectedMemoIds, editors);
  return { canSubmit: blockers.length === 0, blockers };
}

export function taskRollupCandidateNotice(
  candidate: TaskRollupCandidateInterface,
): { confirmable: boolean; message: string } {
  if (candidate.variantKeys.length > 0) {
    return {
      confirmable: true,
      message: candidate.reason || '비슷한 표현의 원본 범위를 확인하세요.',
    };
  }
  const exceededLimit = candidate.reason.toLowerCase().includes('limit');
  return {
    confirmable: false,
    message: exceededLimit
      ? '비슷한 표현이 확인 한도(8개)를 넘어 자동으로 묶지 않았습니다.'
      : candidate.reason || '비슷한 표현이 너무 많아 한 번에 묶을 수 없습니다.',
  };
}

export function isTaskRollupOperationScopeCurrent(
  captured: TaskRollupOperationScope,
  current: TaskRollupOperationScope,
): boolean {
  return captured.actorId === current.actorId &&
    captured.projectId === current.projectId &&
    captured.memoScope === current.memoScope &&
    captured.epoch === current.epoch;
}

export type TaskRollupLeaseReadiness<T> =
  | { status: 'ready'; leases: T }
  | { status: 'blocked'; blockers: TaskRollupEditorBlocker[] }
  | { status: 'stale' };

export async function acquireTaskRollupWriteReadiness<T>(input: {
  affectedMemoIds: string[];
  acquire: () => Promise<T>;
  readEditors: () => NormalMemoEditorState[];
  release: () => void;
  isCurrent: () => boolean;
}): Promise<TaskRollupLeaseReadiness<T>> {
  const leases = await input.acquire();
  if (!input.isCurrent()) return { status: 'stale' };
  const gate = taskRollupWriteGate(input.affectedMemoIds, input.readEditors());
  if (!gate.canSubmit) {
    input.release();
    return { status: 'blocked', blockers: gate.blockers };
  }
  return { status: 'ready', leases };
}

export function isTaskRollupCompletionVisible(
  completion: TaskRollupCompletionInterface,
  now = Date.now(),
): boolean {
  const expiresAt = Date.parse(completion.expiresAtUtc);
  return Number.isFinite(expiresAt) && now < expiresAt;
}

export function hasTaskRollupCompletionReceipt(
  operationId: string,
  completions: TaskRollupCompletionInterface[],
): boolean {
  return completions.some((completion) => completion.operationId === operationId);
}

export function hasTaskRollupUndoReceipt(
  completionOperationId: string,
  completions: TaskRollupCompletionInterface[],
): boolean {
  return completions.some((completion) =>
    completion.operationId === completionOperationId && completion.status === 'undone');
}

export function taskRollupServerClockOffset(
  serverTimeUtc: string,
  clientReceiptTime = Date.now(),
): number {
  const serverTime = Date.parse(serverTimeUtc);
  return Number.isFinite(serverTime) ? serverTime - clientReceiptTime : 0;
}

export function indexTaskRollupNodes(
  nodes: TaskRollupNodeInterface[],
): Map<string, TaskRollupNodeInterface> {
  const result = new Map<string, TaskRollupNodeInterface>();
  const visit = (node: TaskRollupNodeInterface) => {
    result.set(node.key, node);
    node.children.forEach(visit);
  };
  nodes.forEach(visit);
  return result;
}

export function removeTaskRollupNode(
  nodes: TaskRollupNodeInterface[],
  removedKey: string,
): TaskRollupNodeInterface[] {
  return nodes.flatMap((node) => {
    if (node.key === removedKey) return [];
    const children = removeTaskRollupNode(node.children, removedKey);
    if (!node.actionable && children.length === 0) return [];
    return [{ ...node, children }];
  });
}
