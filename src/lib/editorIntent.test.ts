import assert from 'node:assert/strict';
import test from 'node:test';
import { takePendingCheckboxToggle, type PendingCheckboxToggle } from './editorIntent.ts';

const original = '-- 항목 A\n-- 항목 B';
const lines = [{ id: 1, text: '-- 항목 A' }, { id: 2, text: '-- 항목 B' }];
const pendingClick = () => ({ current: { lineId: 1, lineText: lines[0].text, document: original } as PendingCheckboxToggle | null });

test('first checkbox click waits for lease then is consumed once without entering line edit', () => {
  const pending = pendingClick();
  assert.equal(takePendingCheckboxToggle(pending, lines, original, true, true), null);
  assert.notEqual(pending.current, null);
  assert.equal(takePendingCheckboxToggle(pending, lines, original, false, true), 1);
  assert.equal(takePendingCheckboxToggle(pending, lines, original, false, true), null);
});

test('a denied pending click remains recoverable after an explicit lease retry', () => {
  const pending = pendingClick();
  for (let attempt = 0; attempt < 3; attempt++) {
    assert.equal(takePendingCheckboxToggle(pending, lines, original, true, true), null);
  }
  assert.equal(takePendingCheckboxToggle(pending, lines, original, false, true), 1);
});

test('remote document changes cancel the pending toggle even if that line still matches', () => {
  const pending = pendingClick();
  assert.equal(takePendingCheckboxToggle(pending, lines, original + '\n새 원격 내용', true, true), null);
  assert.equal(pending.current, null);
  assert.equal(takePendingCheckboxToggle(pending, lines, original, false, true), null);
});

test('deleted or replaced lines and genuine read-only views cancel pending writes', () => {
  for (const [currentLines, canRequestEdit] of [
    [lines.slice(1), true],
    [[{ id: 1, text: 'v-- 항목 A' }, lines[1]], true],
    [lines, false],
  ] as const) {
    const pending = pendingClick();
    assert.equal(takePendingCheckboxToggle(pending, [...currentLines], original, false, canRequestEdit), null);
    assert.equal(pending.current, null);
  }
});
