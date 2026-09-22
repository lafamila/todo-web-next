import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canSubmitMemoSave,
  classifyLockDenial,
  planExplicitLeaseRetry,
  shouldAcceptLockGrant,
  shouldAcquireAfterExplicitRejoin,
  shouldDeferGrantUntilExplicitRejoin,
  shouldTerminateExplicitConnectionRetry,
  shouldAcceptJoinStatus,
} from './memoLeasePolicy.ts';

test('현재 메모의 활성 편집 요청에 대한 grant만 수락한다', () => {
  assert.equal(shouldAcceptLockGrant('memo-1', 'memo-1', true), true);
  assert.equal(shouldAcceptLockGrant('memo-1', 'memo-1', false), false);
  assert.equal(shouldAcceptLockGrant('memo-2', 'memo-1', true), false);
  assert.equal(shouldAcceptLockGrant(null, 'memo-1', true), false);
});

test('only access denial is terminal; sync server failures remain retryable', () => {
  assert.equal(classifyLockDenial('접근 권한 없음'), 'terminal');
  assert.equal(classifyLockDenial('동기화 서버 응답 없음'), 'retryable');
  assert.equal(classifyLockDenial('동기화 서버'), 'retryable');
  assert.equal(classifyLockDenial('다른 사용자'), 'locked');
});

test('stale ready render cannot submit after synchronous ownership clear', () => {
  assert.equal(
    canSubmitMemoSave({ ownsLock: false, currentMemoId: 'memo-1', expectedMemoId: 'memo-1' }),
    false,
  );
  assert.equal(
    canSubmitMemoSave({ ownsLock: true, currentMemoId: 'memo-1', expectedMemoId: 'memo-1' }),
    true,
  );
});

test('explicit retry reconnects an exhausted disconnected socket and clears stale lease caches', () => {
  assert.deepEqual(
    planExplicitLeaseRetry({
      hasSocket: true,
      connected: false,
      currentMemoId: 'memo-1',
    }),
    {
      action: 'connect',
      memoId: 'memo-1',
      next: {
        ownsLock: false,
        editIntent: true,
        joinedMemoId: null,
        joinRequestMemoId: 'memo-1',
        lockRequestMemoId: null,
        accessDeniedMemoId: null,
        explicitRetryMemoId: 'memo-1',
      },
    },
  );
  assert.equal(
    planExplicitLeaseRetry({
      hasSocket: true,
      connected: true,
      currentMemoId: 'memo-1',
    })?.action,
    'rejoin',
  );
  assert.equal(
    planExplicitLeaseRetry({
      hasSocket: true,
      connected: true,
      currentMemoId: null,
    }),
    null,
  );
});

test('explicit rejoin only advances the matching current memo to server-side lock validation', () => {
  assert.equal(
    shouldAcquireAfterExplicitRejoin({
      retryMemoId: 'memo-1',
      currentMemoId: 'memo-1',
      statusMemoId: 'memo-1',
    }),
    true,
  );
  assert.equal(
    shouldAcquireAfterExplicitRejoin({
      retryMemoId: 'memo-1',
      currentMemoId: 'memo-2',
      statusMemoId: 'memo-1',
    }),
    false,
  );
  assert.equal(
    shouldAcquireAfterExplicitRejoin({
      retryMemoId: null,
      currentMemoId: 'memo-1',
      statusMemoId: 'memo-1',
    }),
    false,
  );
});

test('a stale pre-retry grant is deferred until the fresh room status arrives', () => {
  assert.equal(
    shouldDeferGrantUntilExplicitRejoin({
      retryMemoId: 'memo-1',
      joinedMemoId: null,
      grantedMemoId: 'memo-1',
    }),
    true,
  );
  assert.equal(
    shouldDeferGrantUntilExplicitRejoin({
      retryMemoId: 'memo-1',
      joinedMemoId: 'memo-1',
      grantedMemoId: 'memo-1',
    }),
    false,
  );
  assert.equal(
    shouldDeferGrantUntilExplicitRejoin({
      retryMemoId: 'memo-2',
      joinedMemoId: null,
      grantedMemoId: 'memo-1',
    }),
    false,
  );
});

test('connection timeout terminates only the still-current explicit retry', () => {
  assert.equal(
    shouldTerminateExplicitConnectionRetry({
      timeoutMemoId: 'memo-1',
      retryMemoId: 'memo-1',
      currentMemoId: 'memo-1',
    }),
    true,
  );
  assert.equal(
    shouldTerminateExplicitConnectionRetry({
      timeoutMemoId: 'memo-1',
      retryMemoId: 'memo-2',
      currentMemoId: 'memo-2',
    }),
    false,
  );
  assert.equal(
    shouldTerminateExplicitConnectionRetry({
      timeoutMemoId: 'memo-1',
      retryMemoId: null,
      currentMemoId: 'memo-1',
    }),
    false,
  );
});

test('a duplicate delayed join status cannot downgrade an already completed join', () => {
  assert.equal(
    shouldAcceptJoinStatus({
      currentMemoId: 'memo-1',
      joinRequestMemoId: 'memo-1',
      statusMemoId: 'memo-1',
    }),
    true,
  );
  assert.equal(
    shouldAcceptJoinStatus({
      currentMemoId: 'memo-1',
      joinRequestMemoId: null,
      statusMemoId: 'memo-1',
    }),
    false,
  );
  assert.equal(
    shouldAcceptJoinStatus({
      currentMemoId: 'memo-2',
      joinRequestMemoId: 'memo-2',
      statusMemoId: 'memo-1',
    }),
    false,
  );
});
