import assert from 'node:assert/strict';
import test from 'node:test';

import {
  advanceBacklogEscape,
  backlogAcceptsInput,
  backlogToggleAction,
  backlogTransitionWaitMs,
  canCloseBacklogSession,
  canClaimDraftWrite,
  isBacklogShortcut,
  isBacklogShortcutChord,
  isLatestSavedSnapshot,
  isMemoSaveShortcut,
  ownsDraftRecord,
} from './backlogPolicy.ts';

test('Cmd/Ctrl+Shift+S is distinct from ordinary save and IME input', () => {
  assert.equal(isBacklogShortcut({ key: 'S', metaKey: true, shiftKey: true }), true);
  assert.equal(isBacklogShortcut({ key: 's', ctrlKey: true, shiftKey: true }), true);
  assert.equal(isBacklogShortcut({ key: 's', metaKey: true }), false);
  assert.equal(isMemoSaveShortcut({ key: 's', metaKey: true }), true);
  assert.equal(isMemoSaveShortcut({ key: 'S', metaKey: true, shiftKey: true }), false);
  assert.equal(isBacklogShortcut({ key: 's', metaKey: true, shiftKey: true, isComposing: true }), false);
  assert.equal(isBacklogShortcut({ key: 's', metaKey: true, shiftKey: true, keyCode: 229 }), false);
  assert.equal(isBacklogShortcut({ key: 's', metaKey: true, shiftKey: true, repeat: true }), false);
  assert.equal(isBacklogShortcutChord({ key: 's', metaKey: true, shiftKey: true, repeat: true }), true);
  assert.equal(isBacklogShortcutChord({ key: 's', metaKey: true, shiftKey: true, isComposing: true }), false);
});

test('clean editor may delete only the draft record written by its own mounted session', () => {
  const owned = { memoId: 'memo-1', key: 'page-a:memo-1', localRevision: 4 };
  assert.equal(ownsDraftRecord(owned, 'memo-1', 'page-a:memo-1'), true);
  assert.equal(ownsDraftRecord(null, 'memo-1', 'page-a:memo-1'), false);
  assert.equal(ownsDraftRecord(owned, 'memo-2', 'page-a:memo-2'), false);
  assert.equal(ownsDraftRecord(owned, 'memo-1', 'older-instance:memo-1'), false);
  const claim = {
    accepted: true,
    flushMemoId: 'memo-1',
    currentMemoId: 'memo-1',
    flushEditorEpoch: 7,
    currentEditorEpoch: 7,
  };
  assert.equal(canClaimDraftWrite(claim), true);
  assert.equal(canClaimDraftWrite({ ...claim, accepted: false }), false);
  assert.equal(canClaimDraftWrite({ ...claim, currentMemoId: 'memo-2' }), false);
  assert.equal(canClaimDraftWrite({ ...claim, currentEditorEpoch: 8 }), false);
});

test('backlog shortcut toggles and two discrete Esc presses close only without a modal', () => {
  assert.equal(backlogToggleAction('closed'), 'open');
  assert.equal(backlogToggleAction('closing'), 'open');
  assert.equal(backlogToggleAction('opening'), 'close');
  assert.equal(backlogToggleAction('open'), 'close');

  const first = advanceBacklogEscape({
    armed: false,
    key: 'Escape',
    modalOpen: false,
    acceptsInput: true,
  });
  assert.deepEqual(first, { armed: true, shouldClose: false });
  assert.deepEqual(
    advanceBacklogEscape({
      armed: first.armed,
      key: 'Escape',
      modalOpen: false,
      acceptsInput: true,
    }),
    { armed: false, shouldClose: true },
  );
  assert.deepEqual(
    advanceBacklogEscape({
      armed: true,
      key: 'x',
      modalOpen: false,
      acceptsInput: true,
    }),
    { armed: false, shouldClose: false },
  );
  for (const blocked of [
    { modalOpen: true },
    { modalOpen: false, repeat: true },
    { modalOpen: false, isComposing: true },
    { modalOpen: false, keyCode: 229 },
  ]) {
    assert.deepEqual(
      advanceBacklogEscape({
        armed: true,
        key: 'Escape',
        acceptsInput: true,
        ...blocked,
      }),
      { armed: false, shouldClose: false },
    );
  }
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
