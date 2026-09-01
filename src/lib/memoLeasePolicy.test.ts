import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canSubmitMemoSave,
  classifyLockDenial,
  shouldAcceptLockGrant,
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
