import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifySaveFailure,
  decideDraftRecovery,
  makeMemoDraftKey,
  MAX_SAVE_RETRY_DELAY_MS,
  retryDelayMs,
  rebaseQueuedSaveRevision,
  canAdoptFetchedRemote,
  isCurrentEditorRequest,
  enqueueFailedDraftSnapshot,
  evaluateDraftDismissals,
  makeDraftDismissalKey,
  decideRemoteRefreshAfterFetch,
  isLatestRemoteRefreshRequest,
  sourceLineageForDraft,
  createDraftPageId,
  nextDraftRevision,
  selectDraftCandidate,
  shouldResumePendingSave,
  shouldDeleteDraftAfterSave,
  shouldAcceptDraftWrite,
  isCurrentResolutionGeneration,
  dismissalSourcesForDraft,
} from './memoDraftPolicy.ts';

test('draft key isolates origin, account, memo and tab', () => {
  const base = makeMemoDraftKey('https://todo.test', 'user-a', 'memo-a', 'tab-a');
  assert.notEqual(base, makeMemoDraftKey('http://todo.test', 'user-a', 'memo-a', 'tab-a'));
  assert.notEqual(base, makeMemoDraftKey('https://todo.test', 'user-b', 'memo-a', 'tab-a'));
  assert.notEqual(base, makeMemoDraftKey('https://todo.test', 'user-a', 'memo-b', 'tab-a'));
  assert.notEqual(base, makeMemoDraftKey('https://todo.test', 'user-a', 'memo-a', 'tab-b'));
});

test('each document context gets its own in-memory draft page id', () => {
  assert.notEqual(
    createDraftPageId(() => 'page-a'),
    createDraftPageId(() => 'page-b'),
  );
});

test('draft local revisions stay monotonic across memo switches and loaded floors', () => {
  const first = nextDraftRevision(0, 100);
  const second = nextDraftRevision(0, 90);
  const loadedFloor = nextDraftRevision(second + 50, 80);
  assert.ok(second > first);
  assert.ok(loadedFloor > second + 50);
});

test('draft deletion is conditional on the saved local revision', () => {
  assert.equal(shouldDeleteDraftAfterSave(8, 8), true);
  assert.equal(shouldDeleteDraftAfterSave(9, 8), false);
  assert.equal(shouldDeleteDraftAfterSave(null, 8), false);
});

test('an async stale flush cannot overwrite a newer stored draft', () => {
  assert.equal(shouldAcceptDraftWrite(200, 199), false);
  assert.equal(shouldAcceptDraftWrite(200, 200), true);
  assert.equal(shouldAcceptDraftWrite(200, 201), true);
  assert.equal(shouldAcceptDraftWrite(null, 7, 9), false);
  assert.equal(shouldAcceptDraftWrite(null, 9, 9), false);
  assert.equal(shouldAcceptDraftWrite(null, 10, 9), true);
});

test('current tab draft wins over a newer other-tab candidate without mutation', () => {
  const template = {
    origin: 'https://todo.test',
    userId: 'user-a',
    memoId: 'memo-a',
    baseRevision: 'r1',
    baseContent: 'base',
    draftContent: 'draft',
    localRevision: 1,
    createdAt: 1,
    retryCount: 0,
    lastError: null,
  };
  const other = { ...template, key: 'other', tabId: 'other', updatedAt: 20 };
  const current = { ...template, key: 'current', tabId: 'current', updatedAt: 10 };
  const input = [other, current];
  assert.equal(selectDraftCandidate(input, 'current'), current);
  assert.deepEqual(input, [other, current]);
});

test('recovery decision cleans duplicates, offers same-base draft and compares mismatch', () => {
  const draft = {
    draftContent: 'draft',
    baseContent: 'base',
    baseRevision: 'r1',
  };
  assert.equal(decideDraftRecovery({ ...draft, draftContent: 'remote' }, 'remote', 'r2'), 'cleanup');
  assert.equal(decideDraftRecovery(draft, 'base', 'r1'), 'offer-recovery');
  assert.equal(decideDraftRecovery(draft, 'changed remote', 'r2'), 'compare');
});

test('save failure classification separates lease, conflict, terminal and retryable failures', () => {
  assert.equal(classifySaveFailure({ status: 409, code: 'memo_lease_required' }), 'lease');
  assert.equal(classifySaveFailure({ status: 409, code: 'memo_content_conflict' }), 'conflict');
  assert.equal(classifySaveFailure({ status: 403 }), 'terminal');
  assert.equal(classifySaveFailure({ status: 503 }), 'retryable');
  assert.equal(classifySaveFailure(new TypeError('fetch failed')), 'retryable');
});

test('pending save only auto-resumes when the lease is actually ready', () => {
  assert.equal(shouldResumePendingSave('ready', false), true);
  assert.equal(shouldResumePendingSave('pending', false), false);
  assert.equal(shouldResumePendingSave('ready', true), false);
  assert.equal(shouldResumePendingSave('denied', false), false);
});

test('retry delay is exponential, jittered and bounded', () => {
  assert.equal(retryDelayMs(0, 0.5), 1000);
  assert.equal(retryDelayMs(2, 0.5), 4000);
  assert.equal(retryDelayMs(99, 1), MAX_SAVE_RETRY_DELAY_MS);
});

test('stale save success cannot delete a newer draft', () => {
  const sentLocalRevision = 14;
  const currentLocalRevision = 15;
  assert.equal(shouldDeleteDraftAfterSave(currentLocalRevision, sentLocalRevision), false);
});

test('queued save after an in-flight success is rebased to the returned revision', () => {
  const queued = { memoId: 'memo-a', content: 'AB', baseRevision: 'r1' };
  assert.deepEqual(rebaseQueuedSaveRevision(queued, 'memo-a', 'r2'), {
    ...queued,
    baseRevision: 'r2',
  });
  assert.equal(rebaseQueuedSaveRevision(queued, 'memo-b', 'r2'), queued);
});

test('remote selection is adopted only if the fetched server body still matches', () => {
  assert.equal(canAdoptFetchedRemote('remote', 'remote'), true);
  assert.equal(canAdoptFetchedRemote('remote', 'newer remote'), false);
});

test('A to B to A async response is rejected by editor epoch', () => {
  assert.equal(
    isCurrentEditorRequest({
      expectedMemoId: 'memo-a',
      expectedEpoch: 1,
      currentMemoId: 'memo-a',
      currentEpoch: 3,
    }),
    false,
  );
  assert.equal(
    isCurrentEditorRequest({
      expectedMemoId: 'memo-a',
      expectedEpoch: 3,
      currentMemoId: 'memo-a',
      currentEpoch: 3,
    }),
    true,
  );
});

test('clean remote refresh adopts only while the same editor remains clean', () => {
  assert.equal(decideRemoteRefreshAfterFetch({ isCurrentRequest: true, hasDirtyBuffer: false }), 'adopt');
  assert.equal(decideRemoteRefreshAfterFetch({ isCurrentRequest: true, hasDirtyBuffer: true }), 'compare');
  assert.equal(decideRemoteRefreshAfterFetch({ isCurrentRequest: false, hasDirtyBuffer: false }), 'ignore');
});

test('out-of-order clean socket GET response is ignored by request sequence', () => {
  assert.equal(isLatestRemoteRefreshRequest(1, 2), false);
  assert.equal(isLatestRemoteRefreshRequest(2, 2), true);
});

test('copied draft keeps the original external source lineage across page reloads', () => {
  const external = {
    key: 'external', origin: 'o', userId: 'u', memoId: 'm', tabId: 'page-a',
    baseRevision: 'r1', baseContent: 'base', draftContent: 'draft', localRevision: 7,
    createdAt: 1, updatedAt: 2, retryCount: 0, lastError: null,
  };
  const lineage = sourceLineageForDraft(external, 'page-b-own');
  assert.deepEqual(lineage, {
    sourceKey: 'external', sourceLocalRevision: 7, origin: 'o', userId: 'u', memoId: 'm',
  });
  const copied = { ...external, key: 'page-b-own', tabId: 'page-b', sourceLineage: lineage ?? undefined };
  assert.equal(sourceLineageForDraft(copied, 'page-b-own')?.sourceKey, 'external');
  assert.equal(sourceLineageForDraft(copied, 'page-c-own')?.sourceKey, 'external');
});

test('dismissal hides an exact local revision even after the server revision advances', () => {
  const draft = {
    key: 'source', origin: 'o', userId: 'u', memoId: 'm', tabId: 't',
    baseRevision: 'r1', baseContent: 'base', draftContent: 'draft', localRevision: 7,
    createdAt: 1, updatedAt: 2, retryCount: 0, lastError: null,
  };
  const dismissal = {
    key: makeDraftDismissalKey(draft.key), sourceKey: draft.key,
    sourceLocalRevision: 7, acceptedServerRevision: 'r2', origin: 'o', userId: 'u',
    memoId: 'm', action: 'discard' as const, createdAt: 3,
  };
  assert.deepEqual(evaluateDraftDismissals([draft], [dismissal], 'r2').candidates, []);
  assert.deepEqual(evaluateDraftDismissals([{ ...draft, localRevision: 8 }], [dismissal], 'r2').candidates, [{ ...draft, localRevision: 8 }]);
  assert.deepEqual(evaluateDraftDismissals([draft], [dismissal], 'r3').candidates, []);
  assert.deepEqual(evaluateDraftDismissals([draft], [dismissal], 'r3').staleDismissalKeys, []);
});

test('dismissal retires both a recovered copy and its exact ancestor without hiding newer revisions', () => {
  const original = {
    key: 'source', origin: 'o', userId: 'u', memoId: 'm', tabId: 'source-tab',
    baseRevision: 'r1', baseContent: 'base', draftContent: 'draft', localRevision: 7,
    createdAt: 1, updatedAt: 2, retryCount: 0, lastError: null,
  };
  const copy = {
    ...original, key: 'copy', tabId: 'copy-tab', localRevision: 9,
    sourceLineage: {
      sourceKey: original.key, sourceLocalRevision: original.localRevision,
      origin: original.origin, userId: original.userId, memoId: original.memoId,
    },
  };
  const dismissals = [original, copy].map((draft) => ({
    key: makeDraftDismissalKey(draft.key), sourceKey: draft.key,
    sourceLocalRevision: draft.localRevision, acceptedServerRevision: 'r2',
    origin: draft.origin, userId: draft.userId, memoId: draft.memoId,
    action: 'remote' as const, createdAt: 3,
  }));
  assert.deepEqual(evaluateDraftDismissals([original, copy], dismissals, 'r3').candidates, []);
  assert.deepEqual(dismissalSourcesForDraft(copy, 'current-page'), [
    {
      sourceKey: copy.key, sourceLocalRevision: copy.localRevision,
      origin: copy.origin, userId: copy.userId, memoId: copy.memoId,
    },
    copy.sourceLineage,
  ]);
  const newerCopy = { ...copy, localRevision: 10, draftContent: 'new local edit' };
  assert.deepEqual(evaluateDraftDismissals([original, newerCopy], dismissals, 'r3').candidates, [newerCopy]);
  assert.deepEqual(
    evaluateDraftDismissals([{ ...copy, localRevision: 8 }], dismissals, 'r3').candidates,
    [],
  );
  assert.deepEqual(evaluateDraftDismissals([], dismissals, 'r3').staleDismissalKeys, []);
  assert.deepEqual(evaluateDraftDismissals([copy], dismissals, 'r3').candidates, []);
  assert.equal(
    dismissalSourcesForDraft({
      ...copy,
      sourceLineage: { ...copy.sourceLineage, userId: 'other-user' },
    }, 'current-page').length,
    1,
  );
});

test('resolution generation rejects saves and fetched remote results from before remote adoption', () => {
  assert.equal(isCurrentResolutionGeneration(4, 4), true);
  assert.equal(isCurrentResolutionGeneration(3, 4), false);
});

test('failed draft queue preserves different memos and replaces only the same memo', () => {
  const a = { memoId: 'a', content: 'A1' };
  const b = { memoId: 'b', content: 'B1' };
  const next = enqueueFailedDraftSnapshot(enqueueFailedDraftSnapshot([], a), b);
  assert.deepEqual(next, [a, b]);
  assert.deepEqual(enqueueFailedDraftSnapshot(next, { memoId: 'a', content: 'A2' }), [b, { memoId: 'a', content: 'A2' }]);
});
