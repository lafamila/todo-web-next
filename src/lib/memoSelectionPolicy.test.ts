import assert from 'node:assert/strict';
import test from 'node:test';
import {
  selectionAfterMemoSave,
  selectionAfterMemoSaveIfCurrent,
} from './memoSelectionPolicy.ts';

test('late save for memo A does not replace memo B selection', () => {
  const memoA = { id: 'a', content: 'saved A' };
  const memoB = { id: 'b', content: 'open B' };
  assert.equal(selectionAfterMemoSave(memoB, memoA), memoB);
  assert.equal(selectionAfterMemoSave(memoA, memoA), memoA);
});

test('A to B to A selection epoch rejects the first A save response', () => {
  const currentA = { id: 'a', content: 'new editor A' };
  const staleA = { id: 'a', content: 'old save A' };
  assert.equal(selectionAfterMemoSaveIfCurrent(currentA, staleA, 1, 3), currentA);
});
