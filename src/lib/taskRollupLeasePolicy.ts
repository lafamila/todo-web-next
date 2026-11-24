export type TaskRollupLeaseAction =
  | { type: 'join'; memoId: string }
  | { type: 'lock'; memoId: string }
  | { type: 'ready' }
  | { type: 'wait' };

export function normalizeTaskRollupLeaseTargets(memoIds: string[]): string[] {
  return [...new Set(memoIds)].sort();
}

export function canReportTaskRollupLeasesReady(
  targets: string[],
  acquired: string[],
): boolean {
  const expected = normalizeTaskRollupLeaseTargets(targets);
  const actual = normalizeTaskRollupLeaseTargets(acquired);
  return expected.length === actual.length && expected.every((memoId, index) => memoId === actual[index]);
}

export function nextTaskRollupLeaseAction(input: {
  connected: boolean;
  targets: string[];
  joined: string[];
  lockRequested: string[];
  acquired: string[];
}): TaskRollupLeaseAction {
  if (!input.connected) return { type: 'wait' };
  const joined = new Set(input.joined);
  const lockRequested = new Set(input.lockRequested);
  const acquired = new Set(input.acquired);
  for (const memoId of normalizeTaskRollupLeaseTargets(input.targets)) {
    if (acquired.has(memoId)) continue;
    if (!joined.has(memoId)) return { type: 'join', memoId };
    if (!lockRequested.has(memoId)) return { type: 'lock', memoId };
    return { type: 'wait' };
  }
  return { type: 'ready' };
}

export function taskRollupLeaseIdsToRelease(
  acquired: string[],
  requested: string[],
): string[] {
  const requestedSet = new Set(requested);
  return normalizeTaskRollupLeaseTargets(acquired).filter((memoId) => requestedSet.has(memoId));
}
