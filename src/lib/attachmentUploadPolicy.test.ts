import assert from 'node:assert/strict';
import test from 'node:test';
import {
  blocksMemoSaveForUploads,
  isInlineImageFile,
  shouldApplyAttachmentResult,
  insertAttachmentTokensAtSelection,
  removeAttachmentTokenRows,
  shouldRestartPendingUploadAfterFlight,
  mergeAttachmentStateById,
  shouldLoadQueuedUploadRecord,
  canUploadMemoAttachments,
  hasFileDragData,
  canAcceptMemoFileDrop,
  downloadableMemoAttachments,
  attachmentDropCaretOffset,
  isAttachmentDropSnapshotCurrent,
} from './attachmentUploadPolicy.ts';
import { attachmentUploadKey } from './attachmentUploadStore.ts';

test('Raw drop은 선택 텍스트를 지우지 않고 정방향/역방향 선택의 실제 focus 줄을 따른다', () => {
  assert.equal(attachmentDropCaretOffset({ selectionStart: 2, selectionEnd: 14, selectionDirection: 'forward' }), 14);
  assert.equal(attachmentDropCaretOffset({ selectionStart: 2, selectionEnd: 14, selectionDirection: 'backward' }), 2);
  assert.equal(attachmentDropCaretOffset(null), null);
});

test('drop 대기 중 원격 본문이나 base revision이 갱신되면 lease를 얻어도 재개하지 않는다', () => {
  const drop = { contentSnapshot: 'drop at this document', baseRevision: 'r1' };
  assert.equal(isAttachmentDropSnapshotCurrent(drop, drop.contentSnapshot, 'r1'), true);
  assert.equal(isAttachmentDropSnapshotCurrent(drop, 'clean remote update', 'r1'), false);
  assert.equal(isAttachmentDropSnapshotCurrent(drop, drop.contentSnapshot, 'r2'), false);
  const freshSecondDrop = { contentSnapshot: 'clean remote update', baseRevision: 'r2' };
  assert.equal(isAttachmentDropSnapshotCurrent(drop, freshSecondDrop.contentSnapshot, freshSecondDrop.baseRevision), false);
});

test('다운로드 목록·전체선택 대상에는 이미지가 없고 일반 파일 순서가 유지된다', () => {
  const fileA = { id: 'a', isImage: false };
  const fileB = { id: 'b', isImage: false };
  assert.deepEqual(downloadableMemoAttachments([
    { id: 'image', isImage: true }, fileA, { id: 'image2', isImage: true }, fileB,
  ]), [fileA, fileB]);
  assert.deepEqual(downloadableMemoAttachments([{ id: 'image', isImage: true }]), []);
});

test('파일 drag만 소비하고 텍스트·링크 drag는 기존 편집 동작을 유지한다', () => {
  assert.equal(hasFileDragData({ types: ['Files', 'text/plain'] }), true);
  assert.equal(hasFileDragData({ types: [], files: { length: 1 } }), true);
  assert.equal(hasFileDragData({ types: ['text/plain', 'text/uri-list'] }), false);
  assert.equal(hasFileDragData({ types: [], files: { length: 0 } }), false);
});

test('drop은 superadmin + 실제 memo write 권한에서만 허용하며 과거 버전·비교 화면은 거부한다', () => {
  const allowed = {
    canUpload: true, canWrite: true, isViewingVersion: false,
    isResolving: false, accessRevoked: false,
  };
  assert.equal(canAcceptMemoFileDrop(allowed), true);
  for (const denied of [
    { canUpload: false }, { canWrite: false }, { isViewingVersion: true },
    { isResolving: true }, { accessRevoked: true },
  ]) assert.equal(canAcceptMemoFileDrop({ ...allowed, ...denied }), false);
});

test('업로드 권한은 superadmin만 허용하고 owner/admin·누락·boolean 대체는 거부한다', () => {
  assert.equal(canUploadMemoAttachments({ permission: 'superadmin' }), true);
  for (const permission of [undefined, 'owner', 'admin', 'user', 'visitor', 'SUPERADMIN']) {
    const user = { permission, isAdmin: true, isSuperAdmin: true };
    assert.equal(canUploadMemoAttachments(user), false);
  }
  assert.equal(canUploadMemoAttachments(null), false);
  assert.equal(canUploadMemoAttachments(undefined), false);
});

test('inline preview는 magic-safe image MIME만 허용한다', () => {
  assert.equal(isInlineImageFile({ type: 'image/png' } as File), true);
  assert.equal(isInlineImageFile({ type: 'image/svg+xml' } as File), false);
  assert.equal(isInlineImageFile({ type: 'text/html' } as File), false);
  assert.equal(isInlineImageFile({ type: '', name: 'drop.PNG' }), true);
  assert.equal(isInlineImageFile({ type: '', name: 'drop.svg' }), false);
  assert.equal(isInlineImageFile({ type: 'image/svg+xml', name: 'drop.png' }), false);
});

test('이전 memo/account/generation 업로드 결과는 현재 편집기에 적용하지 않는다', () => {
  const current = {
    expectedMemoId: 'memo-a', expectedUserId: 'user-a', expectedGeneration: 3,
    currentMemoId: 'memo-a', currentUserId: 'user-a', currentGeneration: 3,
  };
  assert.equal(shouldApplyAttachmentResult(current), true);
  assert.equal(shouldApplyAttachmentResult({ ...current, currentMemoId: 'memo-b' }), false);
  assert.equal(shouldApplyAttachmentResult({ ...current, currentUserId: 'user-b' }), false);
  assert.equal(shouldApplyAttachmentResult({ ...current, currentGeneration: 4 }), false);
});

test('진행 중 업로드와 실패한 inline token은 정상 서버 저장을 막는다', () => {
  assert.equal(blocksMemoSaveForUploads([{ status: 'uploading' }]), true);
  assert.equal(blocksMemoSaveForUploads([{ status: 'failed', inlineImage: true }]), true);
  assert.equal(blocksMemoSaveForUploads([{ status: 'failed', inlineImage: false }]), true);
  assert.equal(blocksMemoSaveForUploads([{ status: 'ready' }]), false);
});

test('Raw paste도 현재 문장을 앞뒤 줄로 나누고 image token을 standalone row로 둔다', () => {
  assert.deepEqual(
    insertAttachmentTokensAtSelection('앞문장뒤', 3, 3, ['a', 'b']),
    {
      content: '앞문장\n![이미지](todo-attachment:a)\n![이미지](todo-attachment:b)\n뒤',
      caret: '앞문장\n![이미지](todo-attachment:a)\n![이미지](todo-attachment:b)\n'.length,
    },
  );
});

test('실패한 inline 업로드 취소는 해당 standalone token만 제거한다', () => {
  assert.equal(
    removeAttachmentTokenRows(
      '앞\n![이미지](todo-attachment:a)\n![이미지](todo-attachment:b)\n뒤',
      'a',
    ),
    '앞\n![이미지](todo-attachment:b)\n뒤',
  );
});

test('폭 metadata가 있는 실패 이미지도 취소하되 코드펜스 원문은 유지한다', () => {
  const id = '123e4567-e89b-42d3-a456-426614174000';
  const image = `![이미지](todo-attachment:${id}) {width=60%}`;
  assert.equal(
    removeAttachmentTokenRows(`앞\n${image}\n\`\`\`\n${image}\n\`\`\`\n뒤`, id),
    `앞\n\`\`\`\n${image}\n\`\`\`\n뒤`,
  );
});

test('blob queue key는 origin/account/memo/attachment를 모두 격리한다', () => {
  assert.notEqual(
    attachmentUploadKey('http://a', 'user', 'memo-a', 'attachment'),
    attachmentUploadKey('http://a', 'user', 'memo-b', 'attachment'),
  );
  assert.notEqual(
    attachmentUploadKey('http://a', 'user-a', 'memo', 'attachment'),
    attachmentUploadKey('http://a', 'user-b', 'memo', 'attachment'),
  );
});

test('A→B→A 전환 중 abort가 늦어도 현재 A pending만 한 번 재시작할 수 있다', () => {
  const pendingA = {
    status: 'pending' as const,
    recordMemoId: 'A',
    recordUserId: 'user',
    currentMemoId: 'A',
    currentUserId: 'user',
  };
  assert.equal(shouldRestartPendingUploadAfterFlight(pendingA), true);
  assert.equal(
    shouldRestartPendingUploadAfterFlight({ ...pendingA, currentMemoId: 'B' }),
    false,
  );
  assert.equal(
    shouldRestartPendingUploadAfterFlight({ ...pendingA, status: 'failed' }),
    false,
  );
});

test('늦은 초기 목록은 그 사이 시작·완료된 업로드 상태를 덮지 않는다', () => {
  assert.deepEqual(
    mergeAttachmentStateById(
      [{ id: 'old', status: 'ready' }, { id: 'same', status: 'uploading' }],
      [{ id: 'same', status: 'ready' }, { id: 'new', status: 'uploading' }],
    ),
    [
      { id: 'old', status: 'ready' },
      { id: 'same', status: 'ready' },
      { id: 'new', status: 'uploading' },
    ],
  );
});

test('늦은 IDB 목록은 이미 preview/objectURL이 활성인 같은 UUID를 다시 만들지 않는다', () => {
  assert.equal(
    shouldLoadQueuedUploadRecord('same', new Set(), new Set(), new Set(['same'])),
    false,
  );
  assert.equal(
    shouldLoadQueuedUploadRecord('new', new Set(), new Set(), new Set(['same'])),
    true,
  );
});
