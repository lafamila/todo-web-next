import assert from 'node:assert/strict';
import test from 'node:test';
import { canRestoreMemoVersion, shouldAdoptMemoRevision, shouldResetMemoEditorState } from './memoVersionPolicy.ts';

test('같은 메모의 sync metadata 갱신은 편집기 상태를 초기화하지 않는다', () => {
  assert.equal(shouldResetMemoEditorState('memo-1', 'memo-1'), false);
});

test('실제 메모 선택이 바뀔 때만 편집기 상태를 초기화한다', () => {
  assert.equal(shouldResetMemoEditorState(null, 'memo-1'), true);
  assert.equal(shouldResetMemoEditorState('memo-1', 'memo-2'), true);
  assert.equal(shouldResetMemoEditorState('memo-1', null), true);
});

test('본문 동일성이 증명된 구조 이동 revision만 dirty buffer의 새 base로 채택한다', () => {
  const base = {
    currentMemoId: 'memo-1',
    incomingMemoId: 'memo-1',
    incomingServerContent: 'server baseline',
    acceptedContent: 'server baseline',
    draftConflictActive: false,
  };
  assert.equal(shouldAdoptMemoRevision(base), true);
  assert.equal(
    shouldAdoptMemoRevision({ ...base, incomingServerContent: 'remote changed body' }),
    false,
  );
  assert.equal(shouldAdoptMemoRevision({ ...base, draftConflictActive: true }), false);
  assert.equal(shouldAdoptMemoRevision({ ...base, incomingMemoId: 'memo-2' }), false);
});

test('version restore fails closed until the current editor is clean and settled', () => {
  const clean = {
    dirty: false, attachmentBlocksSave: false, conflictActive: false,
    pendingSave: false, pendingAttachmentSave: false, recoveryPending: false,
  };
  assert.equal(canRestoreMemoVersion(clean), true);
  for (const field of Object.keys(clean) as Array<keyof typeof clean>) {
    assert.equal(canRestoreMemoVersion({ ...clean, [field]: true }), false, field);
  }
});
