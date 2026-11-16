import assert from 'node:assert/strict';
import test from 'node:test';

import { reconcileEditorLines } from './editorLineReconcile.ts';

const source = (texts: string[]) => texts.map((text, index) => ({ id: index + 1, text }));

test('single-line external edit preserves every existing line id', () => {
  const result = reconcileEditorLines(source(['before', 'old', 'after']), 'before\nnew\nafter', () => 99);
  assert.deepEqual(result, [
    { id: 1, text: 'before' },
    { id: 2, text: 'new' },
    { id: 3, text: 'after' },
  ]);
});

test('table-span replacement keeps opening key and unchanged surrounding/suffix ids', () => {
  let nextId = 90;
  const result = reconcileEditorLines(
    source(['before', '┌─┬─┐', '│a│b│', '└─┴─┘', 'after']),
    'before\n┌──┬─┐\n│aa│b│\n├──┼─┤\n│  │ │\n└──┴─┘\nafter',
    () => nextId++,
  );
  assert.equal(result[1].id, 2);
  assert.equal(result.at(-1)?.id, 5);
  assert.deepEqual(result.map((line) => line.id), [1, 2, 3, 4, 90, 91, 5]);
});

test('pure insertion allocates only inserted line ids and keeps suffix identity', () => {
  const result = reconcileEditorLines(source(['a', 'b']), 'a\nnew\nb', () => 10);
  assert.deepEqual(result, [
    { id: 1, text: 'a' },
    { id: 10, text: 'new' },
    { id: 2, text: 'b' },
  ]);
});

test('deletion keeps matching prefix and suffix ids', () => {
  const result = reconcileEditorLines(source(['a', 'remove', 'b']), 'a\nb', () => 10);
  assert.deepEqual(result, [{ id: 1, text: 'a' }, { id: 3, text: 'b' }]);
});
