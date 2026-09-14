export interface IdentifiedValue {
  id: string;
}

/** 늦게 끝난 이전 메모 PUT이 사용자가 이동한 현재 선택을 되돌리지 않게 한다. */
export function selectionAfterMemoSave<T extends IdentifiedValue>(
  selected: T | null,
  saved: T,
): T | null {
  return selected?.id === saved.id ? saved : selected;
}

export function selectionAfterMemoSaveIfCurrent<T extends IdentifiedValue>(
  selected: T | null,
  saved: T,
  requestEpoch: number,
  currentEpoch: number,
): T | null {
  return requestEpoch === currentEpoch
    ? selectionAfterMemoSave(selected, saved)
    : selected;
}

/** 느린 메모 GET은 선택 요청과 프로젝트 의도가 모두 그대로일 때만 화면에 반영한다. */
export function canAdoptMemoSelection(
  memoProjectId: string,
  intendedProjectId: string | null,
  requestEpoch: number,
  currentEpoch: number,
): boolean {
  return requestEpoch === currentEpoch && memoProjectId === intendedProjectId;
}
