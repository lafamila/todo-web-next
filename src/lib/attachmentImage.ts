export const ATTACHMENT_IMAGE_LABEL = '이미지';

const UUID_PATTERN =
  '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}';
const ATTACHMENT_IMAGE_PATTERN = new RegExp(
  `^!\\[${ATTACHMENT_IMAGE_LABEL}\\]\\(todo-attachment:(${UUID_PATTERN})\\)` +
  `(?: \\{(?:width=(\\d{1,3})%(?: align=(left|center|right))?|align=(left|center|right))\\})?$`,
);
const ATTACHMENT_ID_PATTERN = new RegExp(`^${UUID_PATTERN}$`);

export type AttachmentImageAlignment = 'left' | 'center' | 'right';
export type AttachmentResizeEdge = 'left' | 'right';

export interface AttachmentImageToken {
  attachmentId: string;
  widthPercent?: number;
  alignment?: AttachmentImageAlignment;
}

/** 줄 전체가 attachment 토큰인 경우만 이미지로 분류한다. */
export function parseAttachmentImageLine(line: string): AttachmentImageToken | null {
  const match = ATTACHMENT_IMAGE_PATTERN.exec(line);
  if (!match) return null;
  const widthPercent = match[2] === undefined ? undefined : Number(match[2]);
  const alignment = (match[3] ?? match[4]) as AttachmentImageAlignment | undefined;
  if (widthPercent !== undefined && !isAttachmentWidthPercent(widthPercent)) return null;
  return {
    attachmentId: match[1].toLowerCase(),
    ...(widthPercent === undefined ? {} : { widthPercent }),
    ...(alignment === undefined ? {} : { alignment }),
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
  alignment?: AttachmentImageAlignment,
): string {
  if (!isAttachmentId(attachmentId)) {
    throw new Error(`Invalid attachment id: ${attachmentId}`);
  }
  if (alignment !== undefined && !isAttachmentImageAlignment(alignment)) {
    throw new Error(`Invalid attachment image alignment: ${alignment}`);
  }
  const token = `![${ATTACHMENT_IMAGE_LABEL}](todo-attachment:${attachmentId.toLowerCase()})`;
  const layout = [
    ...(widthPercent === undefined ? [] : [`width=${clampAttachmentWidthPercent(widthPercent)}%`]),
    ...(alignment === undefined || alignment === 'center' ? [] : [`align=${alignment}`]),
  ];
  return layout.length === 0 ? token : `${token} {${layout.join(' ')}}`;
}

export function updateAttachmentImageLineWidth(
  line: string,
  widthPercent?: number,
): string | null {
  const parsed = parseAttachmentImageLine(line);
  return parsed
    ? formatAttachmentImageLine(parsed.attachmentId, widthPercent, parsed.alignment)
    : null;
}

export function updateAttachmentImageLineAlignment(
  line: string,
  alignment?: AttachmentImageAlignment,
): string | null {
  const parsed = parseAttachmentImageLine(line);
  return parsed
    ? formatAttachmentImageLine(parsed.attachmentId, parsed.widthPercent, alignment)
    : null;
}

export function isAttachmentImageAlignment(
  value: unknown,
): value is AttachmentImageAlignment {
  return value === 'left' || value === 'center' || value === 'right';
}

/**
 * 이미지 가장자리 drag를 메모 열 대비 너비로 바꾼다.
 * 가운데 정렬은 중심을 고정하므로 pointer 이동량이 양쪽에 반영되고, 좌우 정렬은 반대편 가장자리만 고정한다.
 */
export function attachmentWidthFromDrag(input: {
  startWidthPx: number;
  containerWidthPx: number;
  deltaX: number;
  edge: AttachmentResizeEdge;
  alignment?: AttachmentImageAlignment;
}): number {
  const { startWidthPx, containerWidthPx } = input;
  if (
    !Number.isFinite(startWidthPx) || startWidthPx < 0 ||
    !Number.isFinite(containerWidthPx) || containerWidthPx <= 0
  ) return 100;

  const startPercent = clampAttachmentWidthPercent(startWidthPx / containerWidthPx * 100);
  if (!Number.isFinite(input.deltaX)) return startPercent;
  const edgeDirection = input.edge === 'left' ? -1 : input.edge === 'right' ? 1 : 0;
  if (edgeDirection === 0) return startPercent;
  const alignment = isAttachmentImageAlignment(input.alignment) ? input.alignment : 'center';
  const centeredScale = alignment === 'center' ? 2 : 1;
  const nextWidthPx = startWidthPx + input.deltaX * edgeDirection * centeredScale;
  return clampAttachmentWidthPercent(nextWidthPx / containerWidthPx * 100);
}

/** 편집 잠금 대기 중 캡처한 이미지 layout 의도가 아직 같은 문서에 적용 가능한지 검사한다. */
export function isAttachmentLayoutSnapshotCurrent(
  expected: {
    attachmentId: string;
    widthPercent?: number;
    alignment: AttachmentImageAlignment;
    source?: string;
    documentSnapshot?: string;
    expiresAt?: number;
  },
  current: {
    attachmentId: string;
    widthPercent?: number;
    alignment: AttachmentImageAlignment;
    source?: string;
    documentSnapshot?: string;
    now: number;
  },
): boolean {
  const notExpired = expected.expiresAt === undefined || (
    Number.isFinite(expected.expiresAt) && expected.expiresAt >= current.now
  );
  return notExpired &&
    expected.attachmentId === current.attachmentId &&
    expected.source === current.source &&
    expected.widthPercent === current.widthPercent &&
    expected.alignment === current.alignment &&
    expected.documentSnapshot === current.documentSnapshot;
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
