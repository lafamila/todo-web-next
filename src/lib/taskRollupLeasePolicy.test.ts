import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canReportTaskRollupLeasesReady,
  nextTaskRollupLeaseAction,
  normalizeTaskRollupLeaseTargets,
  taskRollupLeaseIdsToRelease,
} from './taskRollupLeasePolicy.ts';

test('lease targets are unique and sorted for deterministic acquisition', () => {
  assert.deepEqual(normalizeTaskRollupLeaseTargets(['memo-b', 'memo-a', 'memo-b']), ['memo-a', 'memo-b']);
});

test('join status must precede lock request and only the complete set is ready', () => {
  assert.deepEqual(nextTaskRollupLeaseAction({
    connected: true,
    targets: ['memo-a', 'memo-b'],
    joined: [],
    lockRequested: [],
    acquired: [],
  }), { type: 'join', memoId: 'memo-a' });
  assert.deepEqual(nextTaskRollupLeaseAction({
    connected: true,
    targets: ['memo-a', 'memo-b'],
    joined: ['memo-a'],
    lockRequested: [],
    acquired: [],
  }), { type: 'lock', memoId: 'memo-a' });
  assert.deepEqual(nextTaskRollupLeaseAction({
    connected: true,
    targets: ['memo-a', 'memo-b'],
    joined: ['memo-a'],
    lockRequested: ['memo-a'],
    acquired: ['memo-a'],
  }), { type: 'join', memoId: 'memo-b' });
  assert.equal(canReportTaskRollupLeasesReady(['memo-a', 'memo-b'], ['memo-a']), false);
  assert.equal(canReportTaskRollupLeasesReady(['memo-a', 'memo-b'], ['memo-b', 'memo-a']), true);
});

test('cancel and failure release only leases acquired by this operation', () => {
  assert.deepEqual(
    taskRollupLeaseIdsToRelease(['memo-a', 'memo-c'], ['memo-a', 'memo-b']),
    ['memo-a'],
  );
});
