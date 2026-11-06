/** 같은 메모의 metadata 갱신은 로컬 편집 버퍼/버전 보기 상태를 초기화하지 않는다. */
export function shouldResetMemoEditorState(
  previousMemoId: string | null,
  nextMemoId: string | null,
): boolean {
  return previousMemoId !== nextMemoId;
}

/**
 * 메모 이동처럼 본문은 그대로인데 구조 metadata/updated_at만 바뀐 경우에는 dirty
 * 버퍼를 유지한 채 새 CAS revision을 받아도 안전하다. 서버가 실제로 읽은 본문이
 * 마지막 accepted 본문과 일치할 때만 허용해 원격 내용 변경을 구조 변경으로 오인하지 않는다.
 */
export function shouldAdoptMemoRevision(input: {
  currentMemoId: string | null;
  incomingMemoId: string | null;
  incomingServerContent: string;
  acceptedContent: string;
  draftConflictActive: boolean;
}): boolean {
  return Boolean(
    input.currentMemoId &&
      input.currentMemoId === input.incomingMemoId &&
      !input.draftConflictActive &&
      input.incomingServerContent === input.acceptedContent,
  );
}

export function canRestoreMemoVersion(input: {
  dirty: boolean;
  attachmentBlocksSave: boolean;
  conflictActive: boolean;
  pendingSave: boolean;
  pendingAttachmentSave: boolean;
  recoveryPending: boolean;
}): boolean {
  return !input.dirty &&
    !input.attachmentBlocksSave &&
    !input.conflictActive &&
    !input.pendingSave &&
    !input.pendingAttachmentSave &&
    !input.recoveryPending;
}
