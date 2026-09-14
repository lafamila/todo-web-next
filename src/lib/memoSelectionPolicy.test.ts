import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canAdoptMemoSelection,
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

test('late memo fetch cannot reopen a memo after another project was requested', () => {
  assert.equal(canAdoptMemoSelection('project-a', 'project-a', 4, 4), true);
  assert.equal(canAdoptMemoSelection('project-a', 'project-b', 4, 4), false);
  assert.equal(canAdoptMemoSelection('project-a', 'project-a', 3, 4), false);
});
