import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldAcceptLockGrant } from './memoLeasePolicy.ts';

test('현재 메모의 활성 편집 요청에 대한 grant만 수락한다', () => {
  assert.equal(shouldAcceptLockGrant('memo-1', 'memo-1', true), true);
  assert.equal(shouldAcceptLockGrant('memo-1', 'memo-1', false), false);
  assert.equal(shouldAcceptLockGrant('memo-2', 'memo-1', true), false);
  assert.equal(shouldAcceptLockGrant(null, 'memo-1', true), false);
});
