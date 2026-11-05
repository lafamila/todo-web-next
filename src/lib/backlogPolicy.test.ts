import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BACKLOG_MIN_WIDTH_PX,
  backlogAcceptsInput,
  backlogTransitionWaitMs,
  canCloseBacklogSession,
  clampBacklogWidth,
  initialBacklogWidth,
  isBacklogShortcut,
  isLatestSavedSnapshot,
  isMemoSaveShortcut,
} from './backlogPolicy.ts';

test('Cmd/Ctrl+Shift+S is distinct from ordinary save and IME input', () => {
  assert.equal(isBacklogShortcut({ key: 'S', metaKey: true, shiftKey: true }), true);
  assert.equal(isBacklogShortcut({ key: 's', ctrlKey: true, shiftKey: true }), true);
  assert.equal(isBacklogShortcut({ key: 's', metaKey: true }), false);
  assert.equal(isMemoSaveShortcut({ key: 's', metaKey: true }), true);
  assert.equal(isMemoSaveShortcut({ key: 'S', metaKey: true, shiftKey: true }), false);
  assert.equal(isBacklogShortcut({ key: 's', metaKey: true, shiftKey: true, isComposing: true }), false);
  assert.equal(isBacklogShortcut({ key: 's', metaKey: true, shiftKey: true, keyCode: 229 }), false);
});

test('closing panel blocks input and stale save cannot close a reopened session', () => {
  assert.equal(backlogAcceptsInput('open'), true);
  assert.equal(backlogAcceptsInput('opening'), true);
  assert.equal(backlogAcceptsInput('closing'), false);
  assert.equal(canCloseBacklogSession({ phase: 'open', requestedSession: 4, currentSession: 4 }), true);
  assert.equal(canCloseBacklogSession({ phase: 'closing', requestedSession: 4, currentSession: 4 }), false);
  assert.equal(canCloseBacklogSession({ phase: 'open', requestedSession: 4, currentSession: 5 }), false);
  assert.equal(backlogTransitionWaitMs(false), 260);
  assert.equal(backlogTransitionWaitMs(true), 0);
});

test('backlog starts at half width and keeps enough main document visible', () => {
  assert.equal(initialBacklogWidth(1440, false), 720);
  assert.equal(clampBacklogWidth(100, 1440, false), BACKLOG_MIN_WIDTH_PX);
  assert.equal(clampBacklogWidth(1400, 1440, false), 1200);
  assert.equal(initialBacklogWidth(390, true), 390);
});

test('panel closes only after the explicit snapshot remains latest', () => {
  const base = {
    saved: true,
    snapshotContent: 'saved',
    currentContent: 'saved',
    acceptedContent: 'saved',
    snapshotRevision: 3,
    currentRevision: 3,
  };
  assert.equal(isLatestSavedSnapshot(base), true);
  assert.equal(isLatestSavedSnapshot({ ...base, saved: false }), false);
  assert.equal(isLatestSavedSnapshot({ ...base, currentContent: 'new typing' }), false);
  assert.equal(isLatestSavedSnapshot({ ...base, currentRevision: 4 }), false);
});
