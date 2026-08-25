/** 같은 메모의 metadata 갱신은 로컬 편집 버퍼/버전 보기 상태를 초기화하지 않는다. */
export function shouldResetMemoEditorState(
  previousMemoId: string | null,
  nextMemoId: string | null,
): boolean {
  return previousMemoId !== nextMemoId;
}
