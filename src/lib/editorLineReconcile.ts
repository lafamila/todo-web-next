export interface StableEditorLine {
  id: number;
  text: string;
}

/**
 * 부모 문서 history/Raw 변경을 라인 모델로 되가져올 때 가능한 ID를 보존한다.
 * 동일 prefix/suffix는 내용 기준으로 고정하고, 실제 변경 span은 위치 기준으로 재사용한다.
 * 표 한 셀 수정이나 Undo가 표 여는 줄의 React key까지 바꿔 TableEditor를 remount하지 않게 한다.
 */
export function reconcileEditorLines(
  current: readonly StableEditorLine[],
  nextText: string,
  makeId: () => number,
): StableEditorLine[] {
  const nextTexts = nextText.split('\n');
  let prefix = 0;
  while (
    prefix < current.length &&
    prefix < nextTexts.length &&
    current[prefix].text === nextTexts[prefix]
  ) prefix++;

  let suffix = 0;
  while (
    suffix < current.length - prefix &&
    suffix < nextTexts.length - prefix &&
    current[current.length - suffix - 1].text === nextTexts[nextTexts.length - suffix - 1]
  ) suffix++;

  const result: StableEditorLine[] = [];
  for (let index = 0; index < prefix; index++) {
    result.push({ id: current[index].id, text: nextTexts[index] });
  }

  const oldMiddleLength = current.length - prefix - suffix;
  const newMiddleEnd = nextTexts.length - suffix;
  for (let index = prefix; index < newMiddleEnd; index++) {
    const oldOffset = index - prefix;
    result.push({
      id: oldOffset < oldMiddleLength ? current[prefix + oldOffset].id : makeId(),
      text: nextTexts[index],
    });
  }

  for (let offset = suffix; offset > 0; offset--) {
    const oldIndex = current.length - offset;
    const newIndex = nextTexts.length - offset;
    result.push({ id: current[oldIndex].id, text: nextTexts[newIndex] });
  }

  return result;
}
