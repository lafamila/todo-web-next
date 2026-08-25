import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldResetMemoEditorState } from './memoVersionPolicy.ts';

test('같은 메모의 sync metadata 갱신은 편집기 상태를 초기화하지 않는다', () => {
  assert.equal(shouldResetMemoEditorState('memo-1', 'memo-1'), false);
});

test('실제 메모 선택이 바뀔 때만 편집기 상태를 초기화한다', () => {
  assert.equal(shouldResetMemoEditorState(null, 'memo-1'), true);
  assert.equal(shouldResetMemoEditorState('memo-1', 'memo-2'), true);
  assert.equal(shouldResetMemoEditorState('memo-1', null), true);
});
