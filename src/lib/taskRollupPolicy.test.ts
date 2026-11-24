import assert from 'node:assert/strict';
import test from 'node:test';

import type { TaskRollupCompletionInterface, TaskRollupNodeInterface } from './types.ts';
import {
  collectTaskRollupOperation,
  canChangeTaskRollupMemoScope,
  acquireTaskRollupWriteReadiness,
  editorBlockersForTaskRollup,
  isTaskRollupCompletionVisible,
  isTaskRollupNodeInteractive,
  hasTaskRollupCompletionReceipt,
  hasTaskRollupUndoReceipt,
  formatTaskRollupMemoCounts,
  isTaskRollupOperationScopeCurrent,
  removeTaskRollupNode,
  summarizeTaskRollupSources,
  taskRollupServerClockOffset,
  taskRollupCandidateNotice,
  taskRollupWriteGate,
} from './taskRollupPolicy.ts';

const node: TaskRollupNodeInterface = {
  key: 'group-1',
  kind: 'task',
  text: '배포하기',
  checked: false,
  actionable: true,
  occurrences: [
    {
      key: 'occ-1', memoId: 'memo-b', memoTitle: 'B 메모', revision: '2',
      lineIndex: 1, byteStart: 10, marker: '-- ', checked: false,
      text: '배포하기', physicalPath: [],
    },
    {
      key: 'occ-2', memoId: 'memo-a', memoTitle: 'A 메모', revision: '3',
      lineIndex: 2, byteStart: 20, marker: 'v-- ', checked: true,
      text: '배포하기', physicalPath: [],
    },
    {
      key: 'occ-3', memoId: 'memo-b', memoTitle: 'B 메모', revision: '2',
      lineIndex: 4, byteStart: 40, marker: '-- ', checked: false,
      text: '배포하기', physicalPath: [],
    },
  ],
  children: [{
    key: 'child', kind: 'task', text: '하위 작업', checked: false,
    actionable: true, occurrences: [], children: [],
  }],
};

test('completion sends every direct occurrence including prechecked copies but leases only changed memos', () => {
  assert.deepEqual(collectTaskRollupOperation(node), {
    occurrenceKeys: ['occ-1', 'occ-2', 'occ-3'],
    changedMemoIds: ['memo-b'],
  });
});

test('server-authorized historical undo is interactive even though its checked snapshot is non-actionable', () => {
  assert.equal(isTaskRollupNodeInteractive({
    kind: 'task', actionable: false, hasCompleteAction: false, hasUndoAction: true,
  }), true);
  assert.equal(isTaskRollupNodeInteractive({
    kind: 'task', actionable: false, hasCompleteAction: true, hasUndoAction: false,
  }), false);
  assert.equal(isTaskRollupNodeInteractive({
    kind: 'description', actionable: true, hasCompleteAction: true, hasUndoAction: true,
  }), false);
});

test('memo scope remains switchable after an all-scope preview error but not during a fixed-scope operation', () => {
  assert.equal(canChangeTaskRollupMemoScope({ busy: false, hasPendingRequest: false }), true);
  assert.equal(canChangeTaskRollupMemoScope({ busy: true, hasPendingRequest: false }), false);
  assert.equal(canChangeTaskRollupMemoScope({ busy: false, hasPendingRequest: true }), false);
});

test('scope counts explicitly report selected and excluded saved memos', () => {
  assert.equal(formatTaskRollupMemoCounts({
    totalMemoCount: 325,
    selectedMemoCount: 30,
    excludedMemoCount: 295,
  }), '전체 325개 · 선택 30개 · 제외 295개');
});

test('source summaries retain duplicate counts and deterministic labels', () => {
  assert.deepEqual(summarizeTaskRollupSources(node.occurrences), [
    { memoId: 'memo-a', memoTitle: 'A 메모', count: 1 },
    { memoId: 'memo-b', memoTitle: 'B 메모', count: 2 },
  ]);
});

test('dirty, pending, and conflicted normal editors block only affected memos', () => {
  const entries = [
    { memoId: 'memo-a', memoTitle: 'A 메모', epoch: 1, dirty: true, pending: false, conflicted: false },
    { memoId: 'memo-b', memoTitle: 'B 메모', epoch: 1, dirty: false, pending: true, conflicted: true },
    { memoId: 'memo-c', memoTitle: 'C 메모', epoch: 1, dirty: true, pending: false, conflicted: false },
  ];
  assert.deepEqual(editorBlockersForTaskRollup(['memo-a', 'memo-b'], entries), [
    { memoId: 'memo-a', memoTitle: 'A 메모', reasons: ['저장하지 않은 변경'] },
    { memoId: 'memo-b', memoTitle: 'B 메모', reasons: ['저장 또는 처리 대기', '충돌 해결 필요'] },
  ]);
});

test('post-lease write gate catches an editor that became dirty during acquisition', () => {
  const clean = [
    { memoId: 'memo-b', memoTitle: 'B 메모', epoch: 1, dirty: false, pending: false, conflicted: false },
  ];
  assert.deepEqual(taskRollupWriteGate(['memo-b'], clean), {
    canSubmit: true,
    blockers: [],
  });
  assert.deepEqual(taskRollupWriteGate(['memo-b'], [{ ...clean[0], dirty: true }]), {
    canSubmit: false,
    blockers: [{ memoId: 'memo-b', memoTitle: 'B 메모', reasons: ['저장하지 않은 변경'] }],
  });
});

test('delayed lease acquisition that becomes dirty releases its own batch and never reaches POST readiness', async () => {
  let finishAcquire!: (leases: string[]) => void;
  let dirty = false;
  let releases = 0;
  const readinessPromise = acquireTaskRollupWriteReadiness({
    affectedMemoIds: ['memo-b'],
    acquire: () => new Promise<string[]>((resolve) => { finishAcquire = resolve; }),
    readEditors: () => [{
      memoId: 'memo-b', memoTitle: 'B 메모', epoch: 1,
      dirty, pending: false, conflicted: false,
    }],
    release: () => { releases += 1; },
    isCurrent: () => true,
  });

  dirty = true;
  finishAcquire(['lease-b']);
  const result = await readinessPromise;

  assert.equal(result.status, 'blocked');
  assert.equal(releases, 1);
  assert.equal('leases' in result, false);
});

test('a stale A lease continuation does not release a possibly newer B batch', async () => {
  let releases = 0;
  const result = await acquireTaskRollupWriteReadiness({
    affectedMemoIds: ['memo-a'],
    acquire: async () => ['lease-a'],
    readEditors: () => [],
    release: () => { releases += 1; },
    isCurrent: () => false,
  });
  assert.deepEqual(result, { status: 'stale' });
  assert.equal(releases, 0);
});

test('an A request continuation cannot affect B retry, glyph, busy, or lease state', () => {
  const captured = { actorId: 'actor-1', projectId: 'project-a', memoScope: 'all' as const, epoch: 7 };
  const current = { actorId: 'actor-1', projectId: 'project-b', memoScope: 'all' as const, epoch: 8 };
  const effects = { retry: 0, glyph: 0, busy: 0, release: 0 };
  assert.equal(isTaskRollupOperationScopeCurrent(captured, captured), true);
  if (isTaskRollupOperationScopeCurrent(captured, current)) {
    effects.retry += 1;
    effects.glyph += 1;
    effects.busy += 1;
    effects.release += 1;
  }
  assert.deepEqual(effects, { retry: 0, glyph: 0, busy: 0, release: 0 });
  assert.equal(isTaskRollupOperationScopeCurrent(captured, {
    actorId: 'actor-2', projectId: 'project-a', memoScope: 'all', epoch: 8,
  }), false);
  assert.equal(isTaskRollupOperationScopeCurrent(captured, {
    actorId: 'actor-1', projectId: 'project-a', memoScope: 'all', epoch: 8,
  }), false);
  assert.equal(isTaskRollupOperationScopeCurrent(captured, {
    actorId: 'actor-1', projectId: 'project-a', memoScope: 'recent30', epoch: 7,
  }), false);
});

test('variant-limit candidates are explanatory notices rather than empty confirmation forms', () => {
  assert.deepEqual(taskRollupCandidateNotice({
    seedKey: 'seed',
    variantKeys: [],
    reason: 'variant_limit_exceeded',
  }), {
    confirmable: false,
    message: '비슷한 표현이 확인 한도(8개)를 넘어 자동으로 묶지 않았습니다.',
  });
  assert.equal(taskRollupCandidateNotice({
    seedKey: 'seed',
    variantKeys: ['variant'],
    reason: '',
  }).confirmable, true);
});

test('completion expires at the server boundary even without a successful refetch', () => {
  const completion = {
    expiresAtUtc: '2026-11-24T15:00:00.000Z',
  } as TaskRollupCompletionInterface;
  assert.equal(isTaskRollupCompletionVisible(completion, Date.parse('2026-11-24T14:59:59.999Z')), true);
  assert.equal(isTaskRollupCompletionVisible(completion, Date.parse('2026-11-24T15:00:00.000Z')), false);
});

test('response-loss reconciliation acknowledges only the exact durable completion receipt', () => {
  const completions = [
    { operationId: 'operation-a' },
    { operationId: 'operation-b' },
  ] as TaskRollupCompletionInterface[];
  assert.equal(hasTaskRollupCompletionReceipt('operation-a', completions), true);
  assert.equal(hasTaskRollupCompletionReceipt('operation-c', completions), false);
});

test('undo reconciliation requires the selected durable receipt to be authoritatively undone', () => {
  const completions = [
    { operationId: 'operation-a', status: 'ready' },
    { operationId: 'operation-b', status: 'undone' },
  ] as TaskRollupCompletionInterface[];
  assert.equal(hasTaskRollupUndoReceipt('operation-a', completions), false);
  assert.equal(hasTaskRollupUndoReceipt('operation-b', completions), true);
});

test('server time corrects a skewed browser clock without using the browser timezone', () => {
  assert.equal(
    taskRollupServerClockOffset(
      '2026-11-24T14:59:50.000Z',
      Date.parse('2026-11-24T06:59:50.000Z'),
    ),
    8 * 60 * 60 * 1000,
  );
  assert.equal(taskRollupServerClockOffset('invalid', 10), 0);
});

test('optimistic completion removes only the selected node and empty context ancestors', () => {
  const sibling = { ...node, key: 'sibling', text: '다른 작업', children: [] };
  const context = {
    ...node,
    key: 'context',
    checked: true,
    actionable: false,
    occurrences: [],
    children: [{ ...node, children: [] }, sibling],
  };
  assert.deepEqual(removeTaskRollupNode([context], node.key), [
    { ...context, children: [sibling] },
  ]);
  assert.deepEqual(removeTaskRollupNode([{ ...context, children: [{ ...node, children: [] }] }], node.key), []);
});
