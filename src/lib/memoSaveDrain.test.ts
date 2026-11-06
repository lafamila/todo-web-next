import assert from 'node:assert/strict';
import test from 'node:test';
import { createCompletedMemoSaveLedger, createMemoSaveDrainRegistry } from './memoSaveDrain.ts';

test('finishing an old memo save cannot release a different memo drain waiter', async () => {
  const registry = createMemoSaveDrainRegistry();
  const saveA = registry.start('memo-a');
  const saveB = registry.start('memo-b');
  let drainedB = false;
  const waitingB = registry.wait('memo-b').then(() => { drainedB = true; });
  registry.finish(saveA);
  await Promise.resolve();
  assert.equal(drainedB, false);
  assert.equal(registry.isInFlight('memo-b'), true);
  registry.finish(saveB);
  await waitingB;
  assert.equal(drainedB, true);
});

test('multiple same-memo operations all drain before the waiter resolves', async () => {
  const registry = createMemoSaveDrainRegistry();
  const first = registry.start('memo-a');
  const second = registry.start('memo-a');
  let drained = false;
  const waiting = registry.wait('memo-a').then(() => { drained = true; });
  registry.finish(first);
  await Promise.resolve();
  assert.equal(drained, false);
  registry.finish(second);
  await waiting;
  assert.equal(drained, true);
});

test('completion from memo A cannot overwrite memo B invalidated-save evidence', () => {
  const ledger = createCompletedMemoSaveLedger();
  ledger.record({ memoId: 'memo-b', generation: 1, content: 'B stale', revision: 'b2' });
  ledger.record({ memoId: 'memo-a', generation: 1, content: 'A stale', revision: 'a2' });
  assert.deepEqual(ledger.get('memo-b'), {
    memoId: 'memo-b', generation: 1, content: 'B stale', revision: 'b2',
  });
});
