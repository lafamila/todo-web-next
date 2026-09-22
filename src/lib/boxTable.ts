export interface BoxTableRowData {
  cells: string[];
  /** 표의 여는 테두리 줄을 0으로 한 원문 줄 위치. */
  lineOffset: number;
  /** 각 셀에서 앞 공백을 제외한 첫 문자의 원문 UTF-16 column. */
  cellOffsets: number[];
}

export interface BoxTableData {
  columnCount: number;
  /** 첫 정상 구분선 위에 있는 데이터 행 수. 구분선이 없으면 0이다. */
  headerRowCount: number;
  rows: BoxTableRowData[];
}

export interface BoxTableReadResult {
  table: BoxTableData;
  /** 닫는 테두리 다음 줄의 index. */
  endIndex: number;
}

interface PreparedLine {
  body: string;
  indent: string;
}

const BORDER_FRAGMENT_PATTERN = /^[─├┼┤]+$/u;

function prepareLine(line: string): PreparedLine {
  const indent = line.match(/^[ \t]*/u)?.[0] ?? "";
  return { indent, body: line.slice(indent.length).trimEnd() };
}

function borderColumnCount(
  body: string,
  start: string,
  junction: string,
  end: string,
): number | null {
  if (!body.startsWith(start) || !body.endsWith(end)) {
    return null;
  }

  const inner = body.slice(start.length, -end.length);
  const segments = inner.split(junction);
  if (segments.length === 0 || segments.some((segment) => !/^─+$/u.test(segment))) {
    return null;
  }

  return segments.length;
}

function readDataRow(
  prepared: PreparedLine,
  columnCount: number,
  lineOffset: number,
): BoxTableRowData | null {
  const { body, indent } = prepared;
  if (!body.startsWith("│") || !body.endsWith("│")) {
    return null;
  }

  const separators: number[] = [];
  for (let offset = 0; offset < body.length; offset++) {
    if (body[offset] === "│") separators.push(offset);
  }

  // 셀 본문에 있는 │를 임의로 문자로 해석하지 않는다. 경계 수가 다르면 표 전체를 포기한다.
  if (separators.length !== columnCount + 1 || separators[0] !== 0) {
    return null;
  }

  const cells: string[] = [];
  const cellOffsets: number[] = [];

  for (let index = 0; index < columnCount; index++) {
    const rawStart = separators[index] + 1;
    const rawEnd = separators[index + 1];
    const rawCell = body.slice(rawStart, rawEnd);
    const leadingWhitespace = rawCell.length - rawCell.trimStart().length;

    cells.push(rawCell.trim());
    cellOffsets.push(indent.length + rawStart + leadingWhitespace);
  }

  return { cells, lineOffset, cellOffsets };
}

function isMalformedSeparatorFragment(body: string): boolean {
  return body.includes("─") && BORDER_FRAGMENT_PATTERN.test(body);
}

/**
 * 얇은 Unicode 상자 문자로 그린 표를 읽는다.
 *
 * 성공해도 원문을 변환하지 않으며, 반환값은 렌더링과 원문 위치 연결에만 사용한다.
 * 구조가 조금이라도 모호하면 null을 반환해 호출자가 모든 줄을 일반 텍스트로 유지하게 한다.
 */
export function readBoxTable(
  lines: readonly string[],
  startIndex: number,
): BoxTableReadResult | null {
  if (startIndex < 0 || startIndex >= lines.length) return null;

  const opening = prepareLine(lines[startIndex]);
  const columnCount = borderColumnCount(opening.body, "┌", "┬", "┐");
  if (columnCount === null) return null;

  const rows: BoxTableRowData[] = [];
  let headerRowCount = 0;
  let sawHeaderSeparator = false;

  for (let index = startIndex + 1; index < lines.length; index++) {
    const prepared = prepareLine(lines[index]);

    // 하나의 표를 구성하는 모든 줄은 같은 들여쓰기를 사용해야 원문 위치도 확정적이다.
    if (prepared.indent !== opening.indent) return null;

    const closingColumns = borderColumnCount(prepared.body, "└", "┴", "┘");
    if (closingColumns !== null) {
      if (closingColumns !== columnCount || rows.length === 0) return null;
      return {
        table: { columnCount, headerRowCount, rows },
        endIndex: index + 1,
      };
    }

    const separatorColumns = borderColumnCount(prepared.body, "├", "┼", "┤");
    if (separatorColumns !== null) {
      if (separatorColumns !== columnCount || rows.length === 0) return null;
      // 첫 정상 구분선만 header/body 경계다. 이후 반복되는 정상 구분선은 행 사이 장식이다.
      if (!sawHeaderSeparator) {
        sawHeaderSeparator = true;
        headerRowCount = rows.length;
      }
      continue;
    }

    // 사용자가 붙여넣은 예시처럼 가운데 일부만 남은 장식 구분선은 셀을 추정하지 않고 제외한다.
    if (isMalformedSeparatorFragment(prepared.body)) continue;

    const row = readDataRow(prepared, columnCount, index - startIndex);
    if (!row) return null;
    rows.push(row);
  }

  // 닫는 테두리가 없으면 시작 줄부터 모두 기존 일반 텍스트로 처리한다.
  return null;
}
