export interface BoxTableCellSegment {
  /** 이 물리 줄에서 표시하는 decode된 셀 문자열. */
  text: string;
  /** 표의 여는 테두리 줄을 0으로 한 원문 줄 위치. */
  lineOffset: number;
  /** 셀 경계 안쪽의 전체 원문 UTF-16 범위(패딩 포함). */
  rawStart: number;
  rawEnd: number;
  /** 표시 문자열의 원문 UTF-16 범위(패딩 제외). */
  sourceStart: number;
  sourceEnd: number;
  /** 여러 물리 줄을 `\n`으로 이은 셀 값 안의 범위. */
  valueStart: number;
  valueEnd: number;
  /** 표시 값의 각 UTF-16 경계를 원문 column으로 되돌리는 표. */
  valueToSourceOffsets: number[];
}

export interface BoxTableRowData {
  cells: string[];
  /** 첫 물리 줄의 위치. 기존 소비자 호환용이다. */
  lineOffset: number;
  /** 첫 물리 줄에서 각 셀 첫 문자의 원문 UTF-16 column. */
  cellOffsets: number[];
  /** 이 논리 행을 구성하는 모든 물리 줄. */
  physicalLineOffsets: number[];
  /** column별 물리 원문 구간. */
  cellSegments: BoxTableCellSegment[][];
  /** 읽는 동안 안정적인 행 식별자. 편집 통합부는 원문 line id와 결합한다. */
  stableKey: string;
  /** 이 행 뒤의 완전한 구분선. 닫는 테두리면 null이다. */
  separatorAfterLineOffset: number | null;
}

export interface BoxTableData {
  columnCount: number;
  /** 첫 정상 구분선 위의 논리 행 수. 구분선이 없으면 0이다. */
  headerRowCount: number;
  rows: BoxTableRowData[];
  indent: string;
  /** 여는 테두리에서 읽은 열별 원문 폭. */
  widths: number[];
  /** 정확한 표 원문. 읽기/포커스만으로 다시 직렬화하지 않는다. */
  rawLines: string[];
  /** 각 raw line이 포함했던 CR. */
  lineEndings: string[];
  separatorLineOffsets: number[];
  closingLineOffset: number;
}

export interface BoxTableReadResult {
  table: BoxTableData;
  /** 닫는 테두리 다음 줄의 index. */
  endIndex: number;
}

export interface BoxTableMutationResult {
  changed: boolean;
  lines: string[];
  /** 새 줄마다 재사용할 수 있는 입력 line index. 새 줄은 null이다. */
  lineOrigins: Array<number | null>;
  table: BoxTableData;
}

interface PreparedLine {
  body: string;
  indent: string;
  ending: string;
}

interface PhysicalRow {
  cells: string[];
  cellSegments: Array<Omit<BoxTableCellSegment, "valueStart" | "valueEnd">>;
  lineOffset: number;
}

interface ParsedBoundary {
  segments: string[];
  widths: number[];
}

const BORDER_FRAGMENT_PATTERN = /^[─├┼┤]+$/u;

function prepareLine(line: string): PreparedLine {
  const ending = line.endsWith("\r") ? "\r" : "";
  const withoutEnding = ending ? line.slice(0, -1) : line;
  const indent = withoutEnding.match(/^[ \t]*/u)?.[0] ?? "";
  return { indent, body: withoutEnding.slice(indent.length).trimEnd(), ending };
}

function readBoundary(
  body: string,
  start: string,
  junction: string,
  end: string,
): ParsedBoundary | null {
  if (!body.startsWith(start) || !body.endsWith(end)) return null;
  const segments = body.slice(start.length, -end.length).split(junction);
  if (segments.length === 0 || segments.some((segment) => !/^─+$/u.test(segment))) {
    return null;
  }
  return { segments, widths: segments.map((segment) => segment.length) };
}

function separatorOffsets(body: string, escaped: boolean): number[] {
  const offsets: number[] = [];
  for (let offset = 0; offset < body.length; offset++) {
    if (body[offset] !== "│") continue;
    if (escaped && offset > 0 && body[offset - 1] === "\\") continue;
    offsets.push(offset);
  }
  return offsets;
}

function decodeCellSource(encoded: string, sourceStart: number, decodeBars: boolean): {
  text: string;
  valueToSourceOffsets: number[];
} {
  let text = "";
  const valueToSourceOffsets = [sourceStart];

  for (let index = 0; index < encoded.length;) {
    if (decodeBars && encoded[index] === "\\" && encoded[index + 1] === "│") {
      text += "│";
      index += 2;
      valueToSourceOffsets.push(sourceStart + index);
      continue;
    }

    // UTF-16 offset 계약이므로 surrogate pair도 code unit 단위로 복사한다.
    text += encoded[index];
    index += 1;
    valueToSourceOffsets.push(sourceStart + index);
  }

  return { text, valueToSourceOffsets };
}

function readDataRow(
  prepared: PreparedLine,
  columnCount: number,
  lineOffset: number,
): PhysicalRow | null {
  const { body, indent } = prepared;
  if (!body.startsWith("│") || !body.endsWith("│")) return null;

  const escapedOffsets = separatorOffsets(body, true);
  const legacyOffsets = separatorOffsets(body, false);
  // `\│` codec가 선언된 열 수를 만족하면 우선한다. 그렇지 않고 legacy만 맞으면
  // `C:\` 바로 뒤의 실제 경계처럼 예전 문서를 보존한다.
  const separators = escapedOffsets.length === columnCount + 1 && escapedOffsets[0] === 0
    ? escapedOffsets
    : legacyOffsets.length === columnCount + 1 && legacyOffsets[0] === 0
      ? legacyOffsets
      : null;
  if (!separators) return null;

  const escapedMode = separators === escapedOffsets;
  const cells: string[] = [];
  const cellSegments: PhysicalRow["cellSegments"] = [];

  for (let index = 0; index < columnCount; index++) {
    const rawStartInBody = separators[index] + 1;
    const rawEndInBody = separators[index + 1];
    const rawCell = body.slice(rawStartInBody, rawEndInBody);
    const leadingWhitespace = rawCell.length - rawCell.trimStart().length;
    const trailingWhitespace = rawCell.length - rawCell.trimEnd().length;
    const contentEnd = Math.max(leadingWhitespace, rawCell.length - trailingWhitespace);
    const encoded = rawCell.slice(leadingWhitespace, contentEnd);
    const sourceStart = indent.length + rawStartInBody + leadingWhitespace;
    const sourceEnd = sourceStart + encoded.length;
    const decoded = decodeCellSource(encoded, sourceStart, escapedMode);

    cells.push(decoded.text);
    cellSegments.push({
      text: decoded.text,
      lineOffset,
      rawStart: indent.length + rawStartInBody,
      rawEnd: indent.length + rawEndInBody,
      sourceStart,
      sourceEnd,
      valueToSourceOffsets: decoded.valueToSourceOffsets,
    });
  }

  return { cells, cellSegments, lineOffset };
}

function isMalformedSeparatorFragment(body: string): boolean {
  return body.includes("─") && BORDER_FRAGMENT_PATTERN.test(body);
}

function logicalRow(
  physicalRows: PhysicalRow[],
  separatorAfterLineOffset: number | null,
): BoxTableRowData {
  const cells = physicalRows[0].cells.map((_, column) =>
    physicalRows.map((row) => row.cells[column]).join("\n"));
  const cellSegments = cells.map((_, column) => {
    let valueOffset = 0;
    return physicalRows.map((row, rowIndex) => {
      const segment = row.cellSegments[column];
      const length = row.cells[column].length;
      const result: BoxTableCellSegment = {
        ...segment,
        valueStart: valueOffset,
        valueEnd: valueOffset + length,
      };
      valueOffset += length + (rowIndex < physicalRows.length - 1 ? 1 : 0);
      return result;
    });
  });

  return {
    cells,
    lineOffset: physicalRows[0].lineOffset,
    cellOffsets: cellSegments.map((segments) => segments[0].sourceStart),
    physicalLineOffsets: physicalRows.map((row) => row.lineOffset),
    cellSegments,
    stableKey: `source:${physicalRows[0].lineOffset}`,
    separatorAfterLineOffset,
  };
}

/**
 * 얇은 Unicode 상자 문자로 그린 표를 읽는다.
 *
 * 읽기 성공은 원문 변환을 뜻하지 않는다. 완전한 수평 구분선 사이의 물리 데이터 줄은
 * 하나의 논리 행으로 묶고, 구조가 모호하면 null로 안전하게 fallback한다.
 */
export function readBoxTable(
  lines: readonly string[],
  startIndex: number,
): BoxTableReadResult | null {
  if (startIndex < 0 || startIndex >= lines.length) return null;

  const opening = prepareLine(lines[startIndex]);
  const openingBoundary = readBoundary(opening.body, "┌", "┬", "┐");
  if (!openingBoundary) return null;
  const columnCount = openingBoundary.segments.length;
  const rows: BoxTableRowData[] = [];
  const pending: PhysicalRow[] = [];
  const separatorLineOffsets: number[] = [];
  let headerRowCount = 0;
  let sawHeaderSeparator = false;

  const flushPending = (separatorAfterLineOffset: number | null) => {
    if (pending.length === 0) return false;
    rows.push(logicalRow(pending.splice(0), separatorAfterLineOffset));
    return true;
  };

  for (let index = startIndex + 1; index < lines.length; index++) {
    const prepared = prepareLine(lines[index]);
    if (prepared.indent !== opening.indent) return null;

    const closing = readBoundary(prepared.body, "└", "┴", "┘");
    if (closing) {
      if (closing.segments.length !== columnCount || rows.length === 0 && pending.length === 0) return null;
      flushPending(null);
      return {
        table: {
          columnCount,
          headerRowCount,
          rows,
          indent: opening.indent,
          widths: openingBoundary.widths,
          rawLines: lines.slice(startIndex, index + 1),
          lineEndings: lines.slice(startIndex, index + 1).map((line) => prepareLine(line).ending),
          separatorLineOffsets,
          closingLineOffset: index - startIndex,
        },
        endIndex: index + 1,
      };
    }

    const separator = readBoundary(prepared.body, "├", "┼", "┤");
    if (separator) {
      if (separator.segments.length !== columnCount || rows.length === 0 && pending.length === 0) return null;
      const relativeOffset = index - startIndex;
      separatorLineOffsets.push(relativeOffset);
      const flushed = flushPending(relativeOffset);
      if (!sawHeaderSeparator && flushed) {
        sawHeaderSeparator = true;
        headerRowCount = rows.length;
      }
      continue;
    }

    // 잘린 장식선은 내용도 경계도 아니다. 다음 데이터 줄과 같은 논리 행이 계속된다.
    if (isMalformedSeparatorFragment(prepared.body)) continue;

    const row = readDataRow(prepared, columnCount, index - startIndex);
    if (!row) return null;
    pending.push(row);
  }

  return null;
}

function parseExactTable(lines: readonly string[]): BoxTableData | null {
  const result = readBoxTable(lines, 0);
  return result && result.endIndex === lines.length ? result.table : null;
}

function defaultEnding(table: BoxTableData): string {
  const cr = table.lineEndings.filter((ending) => ending === "\r").length;
  return cr > table.lineEndings.length / 2 ? "\r" : "";
}

function encodeCellLine(text: string): string {
  return text.replaceAll("│", "\\│");
}

function widthForValue(value: string): number {
  return Math.max(...value.split("\n").map((line) => encodeCellLine(line).length + 2), 1);
}

interface MutableRow {
  cells: string[];
  origins: number[];
  separatorOrigin: number | null;
}

function mutableRows(table: BoxTableData): MutableRow[] {
  return table.rows.map((row) => ({
    cells: [...row.cells],
    origins: [...row.physicalLineOffsets],
    separatorOrigin: row.separatorAfterLineOffset,
  }));
}

function boundaryLine(
  indent: string,
  widths: readonly number[],
  start: string,
  junction: string,
  end: string,
): string {
  return `${indent}${start}${widths.map((width) => "─".repeat(width)).join(junction)}${end}`;
}

function padCell(value: string, width: number): string {
  const encoded = encodeCellLine(value);
  const remaining = Math.max(0, width - encoded.length);
  if (remaining === 0) return encoded;
  if (remaining === 1) return `${encoded} `;
  return ` ${encoded}${" ".repeat(remaining - 1)}`;
}

function serialize(
  source: BoxTableData,
  rows: MutableRow[],
  widths: number[],
  columnCount: number,
): BoxTableMutationResult | null {
  const lines: string[] = [];
  const lineOrigins: Array<number | null> = [];
  const fallbackEnding = defaultEnding(source);
  const endingFor = (origin: number | null, adjacent?: number | null) => {
    const sourceOffset = origin ?? adjacent;
    return sourceOffset === null || sourceOffset === undefined
      ? fallbackEnding
      : source.lineEndings[sourceOffset] ?? fallbackEnding;
  };
  const push = (line: string, origin: number | null, adjacent?: number | null) => {
    lines.push(`${line}${endingFor(origin, adjacent)}`);
    lineOrigins.push(origin);
  };

  push(boundaryLine(source.indent, widths, "┌", "┬", "┐"), 0);

  rows.forEach((row, rowIndex) => {
    const splitCells = row.cells.map((cell) => cell.split("\n"));
    const height = Math.max(1, ...splitCells.map((cell) => cell.length));
    for (let physicalIndex = 0; physicalIndex < height; physicalIndex++) {
      const origin = row.origins[physicalIndex] ?? null;
      const body = splitCells.map((cell, column) =>
        padCell(cell[physicalIndex] ?? "", widths[column])).join("│");
      push(`${source.indent}│${body}│`, origin, row.origins[0] ?? null);
    }

    const needsSeparator = rowIndex < rows.length - 1 ||
      (source.headerRowCount > 0 && rowIndex === source.headerRowCount - 1);
    if (needsSeparator) {
      const nextOrigin = rows[rowIndex + 1]?.origins[0] ?? row.origins[0] ?? null;
      push(
        boundaryLine(source.indent, widths, "├", "┼", "┤"),
        row.separatorOrigin,
        nextOrigin,
      );
    }
  });

  push(
    boundaryLine(source.indent, widths, "└", "┴", "┘"),
    source.closingLineOffset,
  );

  const table = parseExactTable(lines);
  if (!table || table.columnCount !== columnCount) return null;
  return { changed: true, lines, lineOrigins, table };
}

function unchanged(lines: readonly string[], table: BoxTableData): BoxTableMutationResult {
  return {
    changed: false,
    lines: [...lines],
    lineOrigins: lines.map((_, index) => index),
    table,
  };
}

function expandBoundaryColumn(line: string, columnIndex: number, delta: number): string {
  if (delta <= 0) return line;
  const prepared = prepareLine(line);
  const body = prepared.body;
  const shape = body.startsWith("┌")
    ? ["┌", "┬", "┐"] as const
    : body.startsWith("├")
      ? ["├", "┼", "┤"] as const
      : body.startsWith("└")
        ? ["└", "┴", "┘"] as const
        : null;
  if (!shape) return line;
  const boundary = readBoundary(body, shape[0], shape[1], shape[2]);
  if (!boundary || !boundary.segments[columnIndex]) return line;
  boundary.segments[columnIndex] += "─".repeat(delta);
  const withoutEnding = prepared.ending ? line.slice(0, -1) : line;
  const trailing = withoutEnding.slice(prepared.indent.length + prepared.body.length);
  const nextBody = `${shape[0]}${boundary.segments.join(shape[1])}${shape[2]}`;
  return `${prepared.indent}${nextBody}${trailing}${prepared.ending}`;
}

function mutateCellLines(
  table: BoxTableData,
  rowIndex: number,
  columnIndex: number,
  value: string,
  nextWidth: number,
): BoxTableMutationResult | null {
  const sourceLines = table.rawLines;
  const row = table.rows[rowIndex];
  const previousWidth = table.widths[columnIndex];
  const widthDelta = Math.max(0, nextWidth - previousWidth);
  const nextCells = [...row.cells];
  nextCells[columnIndex] = value;
  const fragments = nextCells.map((cell) => cell.split("\n"));
  // 기존의 빈 물리 segment도 내용이다. 줄 수가 줄어도 자동으로 삭제하지 않는다.
  const height = Math.max(row.physicalLineOffsets.length, ...fragments.map((cell) => cell.length));
  const targetByLine = new Map(
    row.cellSegments[columnIndex].map((segment, index) => [segment.lineOffset, { segment, index }]),
  );
  const allColumnSegments = new Map<number, BoxTableCellSegment>();
  table.rows.forEach((tableRow) => tableRow.cellSegments[columnIndex].forEach((segment) => {
    allColumnSegments.set(segment.lineOffset, segment);
  }));
  const boundaryOffsets = new Set([0, ...table.separatorLineOffsets, table.closingLineOffset]);
  const updates = new Map<number, string>();

  sourceLines.forEach((line, lineOffset) => {
    if (boundaryOffsets.has(lineOffset)) {
      updates.set(lineOffset, expandBoundaryColumn(line, columnIndex, widthDelta));
      return;
    }
    const target = targetByLine.get(lineOffset);
    if (target) {
      updates.set(
        lineOffset,
        `${line.slice(0, target.segment.rawStart)}${
          padCell(fragments[columnIndex][target.index] ?? "", nextWidth)
        }${line.slice(target.segment.rawEnd)}`,
      );
      return;
    }
    const segment = allColumnSegments.get(lineOffset);
    if (segment && widthDelta > 0) {
      updates.set(lineOffset, `${line.slice(0, segment.rawEnd)}${" ".repeat(widthDelta)}${line.slice(segment.rawEnd)}`);
    }
  });

  const extraLines: string[] = [];
  const rowEnding = table.lineEndings[row.physicalLineOffsets.at(-1) ?? row.lineOffset] ?? defaultEnding(table);
  for (let physicalIndex = row.physicalLineOffsets.length; physicalIndex < height; physicalIndex++) {
    const body = fragments.map((cell, column) =>
      padCell(cell[physicalIndex] ?? "", column === columnIndex ? nextWidth : table.widths[column])).join("│");
    extraLines.push(`${table.indent}│${body}│${rowEnding}`);
  }

  const lines: string[] = [];
  const lineOrigins: Array<number | null> = [];
  const insertAfter = row.physicalLineOffsets.at(-1) ?? row.lineOffset;
  sourceLines.forEach((line, lineOffset) => {
    lines.push(updates.get(lineOffset) ?? line);
    lineOrigins.push(lineOffset);
    if (lineOffset === insertAfter) {
      extraLines.forEach((extra) => {
        lines.push(extra);
        lineOrigins.push(null);
      });
    }
  });

  const parsed = parseExactTable(lines);
  if (!parsed) return null;
  return { changed: true, lines, lineOrigins, table: parsed };
}

/** 정확한 표 원문에서 한 논리 셀을 바꾼다. */
export function updateBoxTableCell(
  lines: readonly string[],
  rowIndex: number,
  columnIndex: number,
  value: string,
): BoxTableMutationResult | null {
  const table = parseExactTable(lines);
  if (!table || !Number.isInteger(rowIndex) || !Number.isInteger(columnIndex) ||
      rowIndex < 0 || rowIndex >= table.rows.length ||
      columnIndex < 0 || columnIndex >= table.columnCount) return null;

  const normalized = value.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
  if (table.rows[rowIndex].cells[columnIndex] === normalized) return unchanged(lines, table);
  const nextWidth = Math.max(table.widths[columnIndex], widthForValue(normalized));
  return mutateCellLines(table, rowIndex, columnIndex, normalized, nextWidth);
}

/** 허용된 논리 행 경계에 빈 body 행을 삽입한다. */
export function insertBoxTableRow(
  lines: readonly string[],
  boundaryIndex: number,
): BoxTableMutationResult | null {
  const table = parseExactTable(lines);
  if (!table || !Number.isInteger(boundaryIndex) || boundaryIndex < 0 ||
      boundaryIndex > table.rows.length ||
      (table.headerRowCount > 0 && boundaryIndex < table.headerRowCount)) return null;

  const rows = mutableRows(table);
  rows.splice(boundaryIndex, 0, {
    cells: Array.from({ length: table.columnCount }, () => ""),
    origins: [],
    separatorOrigin: null,
  });
  return serialize(table, rows, [...table.widths], table.columnCount);
}

/** 첫/중간/마지막 열 경계에 빈 열을 삽입한다. */
export function insertBoxTableColumn(
  lines: readonly string[],
  boundaryIndex: number,
): BoxTableMutationResult | null {
  const table = parseExactTable(lines);
  if (!table || !Number.isInteger(boundaryIndex) || boundaryIndex < 0 ||
      boundaryIndex > table.columnCount) return null;

  const rows = mutableRows(table);
  rows.forEach((row) => row.cells.splice(boundaryIndex, 0, ""));
  const neighborWidth = boundaryIndex > 0
    ? table.widths[boundaryIndex - 1]
    : table.widths[boundaryIndex] ?? 3;
  const widths = [...table.widths];
  widths.splice(boundaryIndex, 0, Math.max(3, neighborWidth));
  return serialize(table, rows, widths, table.columnCount + 1);
}
