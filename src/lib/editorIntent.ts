interface LineWithId {
  id: number;
  text: string;
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
