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
