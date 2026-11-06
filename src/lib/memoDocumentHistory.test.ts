import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createMemoDocumentHistory,
  isMemoHistoryShortcut,
  isMemoVersionShortcut,
  enqueueMemoHistoryIntent,
  shouldScheduleHistoryLeaseRelease,
} from './memoDocumentHistory.ts';

test('document history preserves direction across line groups and does not record undo as a new edit', () => {
  let now = 1_000;
  const history = createMemoDocumentHistory(() => now);
  history.record('', 'first', { group: 'line:1', coalesce: true });
  now += 100;
  history.record('first', 'first\nsecond', { group: 'line:2', coalesce: true });
  assert.equal(history.undo('first\nsecond'), 'first');
  assert.equal(history.undo('first'), '');
  assert.equal(history.redo(''), 'first');
  assert.equal(history.redo('first'), 'first\nsecond');
});

test('rapid history shortcuts queue in order while one exact lease scope is pending', () => {
  const base = { memoId: 'm', userId: 'u', editorEpoch: 3, content: 'current' };
  const first = enqueueMemoHistoryIntent(null, { ...base, action: 'undo' });
  const second = enqueueMemoHistoryIntent(first, { ...base, action: 'undo' });
  const third = enqueueMemoHistoryIntent(second, { ...base, action: 'redo' });
  assert.deepEqual(third.actions, ['undo', 'undo', 'redo']);
  assert.deepEqual(
    enqueueMemoHistoryIntent(third, { ...base, content: 'remote changed', action: 'undo' }).actions,
    ['undo'],
  );
});

test('history actions re-arm lease release only when no editor remains active', () => {
  assert.equal(shouldScheduleHistoryLeaseRelease({ rawMode: false, editingActive: false, editorFocusActive: false }), true);
  assert.equal(shouldScheduleHistoryLeaseRelease({ rawMode: false, editingActive: true, editorFocusActive: false }), true);
  assert.equal(shouldScheduleHistoryLeaseRelease({ rawMode: false, editingActive: true, editorFocusActive: true }), false);
  assert.equal(shouldScheduleHistoryLeaseRelease({ rawMode: true, editingActive: false, editorFocusActive: false }), false);
});

test('same group typing coalesces but changing lines creates a history boundary', () => {
  let now = 1_000;
  const history = createMemoDocumentHistory(() => now);
  history.record('', 'a', { group: 'line:1', coalesce: true });
  now += 100;
  history.record('a', 'ab', { group: 'line:1', coalesce: true });
  now += 100;
  history.record('ab', 'ab\nc', { group: 'line:2', coalesce: true });
  assert.equal(history.undo('ab\nc'), 'ab');
  assert.equal(history.undo('ab'), '');
});

test('save acknowledgements do not reset history while authoritative resets do', () => {
  const history = createMemoDocumentHistory();
  history.record('server', 'dirty', { group: 'line:1', coalesce: false });
  assert.equal(history.undo('dirty'), 'server');
  history.redo('server');
  history.reset('remote');
  assert.equal(history.undo('remote'), null);
  assert.equal(history.redo('remote'), null);
});

test('undo and redo shortcuts stay distinct from the version shortcut', () => {
  const key = { key: 'z', repeat: false, isComposing: false, keyCode: 90 };
  assert.equal(isMemoHistoryShortcut({ ...key, metaKey: true, ctrlKey: false, altKey: false, shiftKey: false }), 'undo');
  assert.equal(isMemoHistoryShortcut({ ...key, metaKey: true, ctrlKey: false, altKey: false, shiftKey: false, repeat: true }), 'undo');
  assert.equal(isMemoHistoryShortcut({ ...key, metaKey: true, ctrlKey: false, altKey: false, shiftKey: true }), 'redo');
  assert.equal(isMemoHistoryShortcut({ ...key, metaKey: true, ctrlKey: false, altKey: true, shiftKey: false }), null);
  assert.equal(isMemoVersionShortcut({ ...key, metaKey: true, ctrlKey: false, altKey: true, shiftKey: false }), true);
  assert.equal(isMemoVersionShortcut({ ...key, key: 'Ω', code: 'KeyZ', metaKey: true, ctrlKey: false, altKey: true, shiftKey: false }), true);
  assert.equal(isMemoVersionShortcut({ ...key, metaKey: false, ctrlKey: true, altKey: true, shiftKey: false }), true);
  assert.equal(isMemoVersionShortcut({ ...key, metaKey: false, ctrlKey: true, altKey: false, shiftKey: true }), false);
  assert.equal(isMemoVersionShortcut({ ...key, metaKey: true, ctrlKey: false, altKey: true, shiftKey: false, repeat: true }), false);
  assert.equal(isMemoVersionShortcut({ ...key, metaKey: true, ctrlKey: false, altKey: true, shiftKey: false, isComposing: true }), false);
});
