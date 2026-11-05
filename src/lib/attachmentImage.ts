export const ATTACHMENT_IMAGE_LABEL = '이미지';

const UUID_PATTERN =
  '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}';
const ATTACHMENT_IMAGE_PATTERN = new RegExp(
  `^!\\[${ATTACHMENT_IMAGE_LABEL}\\]\\(todo-attachment:(${UUID_PATTERN})\\)(?: \\{width=(\\d{1,3})%\\})?$`,
);
const ATTACHMENT_ID_PATTERN = new RegExp(`^${UUID_PATTERN}$`);

export interface AttachmentImageToken {
  attachmentId: string;
  widthPercent?: number;
}

/** 줄 전체가 attachment 토큰인 경우만 이미지로 분류한다. */
export function parseAttachmentImageLine(line: string): AttachmentImageToken | null {
  const match = ATTACHMENT_IMAGE_PATTERN.exec(line);
  if (!match) return null;
  const widthPercent = match[2] === undefined ? undefined : Number(match[2]);
  if (widthPercent !== undefined && !isAttachmentWidthPercent(widthPercent)) return null;
  return {
    attachmentId: match[1].toLowerCase(),
    ...(widthPercent === undefined ? {} : { widthPercent }),
  };
}

export function isAttachmentId(value: string): boolean {
  return ATTACHMENT_ID_PATTERN.test(value);
}

export function isAttachmentWidthPercent(value: number): boolean {
  return Number.isInteger(value) && value >= 10 && value <= 100;
}

export function clampAttachmentWidthPercent(value: number): number {
  if (!Number.isFinite(value)) return 100;
  return Math.min(100, Math.max(10, Math.round(value)));
}

export function formatAttachmentImageLine(
  attachmentId: string,
  widthPercent?: number,
): string {
  if (!isAttachmentId(attachmentId)) {
    throw new Error(`Invalid attachment id: ${attachmentId}`);
  }
  const token = `![${ATTACHMENT_IMAGE_LABEL}](todo-attachment:${attachmentId.toLowerCase()})`;
  return widthPercent === undefined
    ? token
    : `${token} {width=${clampAttachmentWidthPercent(widthPercent)}%}`;
}

export function updateAttachmentImageLineWidth(
  line: string,
  widthPercent?: number,
): string | null {
  const parsed = parseAttachmentImageLine(line);
  return parsed ? formatAttachmentImageLine(parsed.attachmentId, widthPercent) : null;
}

export interface TextLine<TId = number> {
  id: TId;
  text: string;
}

/**
 * 활성 라인의 선택 범위를 standalone 이미지 행들로 교체한다.
 * 원래 라인 id는 이미지 뒤 후속 텍스트에 남겨 textarea key/undo 기준을 보존한다.
 */
export function insertAttachmentRowsAtSelection<TId>(input: {
  lines: readonly TextLine<TId>[];
  lineIndex: number;
  selectionStart: number;
  selectionEnd: number;
  attachmentIds: readonly string[];
  makeId: () => TId;
}): { lines: TextLine<TId>[]; caretLineId: TId; caret: number } | null {
  const { lines, lineIndex, attachmentIds, makeId } = input;
  const current = lines[lineIndex];
  if (!current || attachmentIds.length === 0) return null;

  const start = Math.max(0, Math.min(input.selectionStart, input.selectionEnd, current.text.length));
  const end = Math.max(start, Math.min(Math.max(input.selectionStart, input.selectionEnd), current.text.length));
  const before = current.text.slice(0, start);
  const after = current.text.slice(end);
  const inserted: TextLine<TId>[] = [];

  if (before) inserted.push({ id: makeId(), text: before });
  for (const attachmentId of attachmentIds) {
    inserted.push({ id: makeId(), text: formatAttachmentImageLine(attachmentId) });
  }
  inserted.push({ id: current.id, text: after });

  return {
    lines: [...lines.slice(0, lineIndex), ...inserted, ...lines.slice(lineIndex + 1)],
    caretLineId: current.id,
    caret: 0,
  };
}
/** 비활성 문서/Monaco 뒤 삽입용. 이미지 다음의 빈 캐럿 행을 항상 만든다. */
export function insertAttachmentRowsAtIndex<TId>(input: {
  lines: readonly TextLine<TId>[];
  insertionIndex: number;
  attachmentIds: readonly string[];
  makeId: () => TId;
}): { lines: TextLine<TId>[]; caretLineId: TId; caret: number } | null {
  const { lines, attachmentIds, makeId } = input;
  if (attachmentIds.length === 0) return null;
  const index = Math.max(0, Math.min(input.insertionIndex, lines.length));
  const imageLines = attachmentIds.map((id) => ({ id: makeId(), text: formatAttachmentImageLine(id) }));
  const caretLine = { id: makeId(), text: '' };
  return {
    lines: [...lines.slice(0, index), ...imageLines, caretLine, ...lines.slice(index)],
    caretLineId: caretLine.id,
    caret: 0,
  };
}

/** drop 전용: 현재 줄은 그대로 두고 그 바로 다음에 이미지와 빈 캐럿 행을 넣는다. */
export function insertAttachmentRowsAfterLine<TId>(input: {
  lines: readonly TextLine<TId>[];
  lineIndex: number;
  attachmentIds: readonly string[];
  makeId: () => TId;
}): { lines: TextLine<TId>[]; caretLineId: TId; caret: number } | null {
  if (!input.lines[input.lineIndex]) return null;
  return insertAttachmentRowsAtIndex({
    lines: input.lines,
    insertionIndex: input.lineIndex + 1,
    attachmentIds: input.attachmentIds,
    makeId: input.makeId,
  });
}
