interface LineWithId {
  id: number;
  text: string;
}

export interface PendingCheckboxToggle {
  lineId: number;
  lineText: string;
  document: string;
}

/** 잠금을 기다린 클릭은 같은 원문에만, 한 번만 적용한다. */
export function takePendingCheckboxToggle(
  pending: { current: PendingCheckboxToggle | null },
  lines: LineWithId[],
  document: string,
  readOnly: boolean,
  canRequestEdit: boolean,
): number | null {
  const intent = pending.current;
  if (!intent) return null;
  if (
    !canRequestEdit ||
    intent.document !== document ||
    !lines.some((line) => line.id === intent.lineId && line.text === intent.lineText)
  ) {
    pending.current = null;
    return null;
  }
  if (readOnly) return null;
  // 실제 토글 콜백이 다시 렌더/효과를 발생시키기 전에 소비한다.
  pending.current = null;
  return intent.lineId;
}

export function lineCaretToDocumentOffset(
  lines: LineWithId[],
  lineId: number,
  caret: number,
): number | null {
  const index = lines.findIndex((line) => line.id === lineId);
  if (index === -1) return null;
  const base = lines
    .slice(0, index)
    .reduce((total, line) => total + line.text.length + 1, 0);
  return base + Math.max(0, Math.min(caret, lines[index].text.length));
}
