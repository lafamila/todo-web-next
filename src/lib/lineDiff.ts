export type LineDiffKind = "same" | "removed" | "added";

export interface LineDiffEntry {
  kind: LineDiffKind;
  left: string | null;
  right: string | null;
}

// JS number[][]의 객체 오버헤드까지 고려한 보수적인 상한. 큰 문서는
// patience anchor로 쪼갠 뒤 작은 구간에만 LCS를 써 OOM을 막는다.
export const MAX_LCS_CELLS = 250_000;
const MAX_PATIENCE_DEPTH = 32;

function compactAdjacentChanges(raw: LineDiffEntry[]): LineDiffEntry[] {
  const result: LineDiffEntry[] = [];
  for (let index = 0; index < raw.length; index += 1) {
    const current = raw[index];
    const next = raw[index + 1];
    if (current.kind === "removed" && next?.kind === "added") {
      result.push({ kind: "removed", left: current.left, right: next.right });
      index += 1;
    } else {
      result.push(current);
    }
  }
  return result;
}

function lcsMiddle(left: string[], right: string[]): LineDiffEntry[] {
  const rows = Array.from(
    { length: left.length + 1 },
    () => new Uint32Array(right.length + 1),
  );

  for (let i = left.length - 1; i >= 0; i -= 1) {
    for (let j = right.length - 1; j >= 0; j -= 1) {
      rows[i][j] =
        left[i] === right[j]
          ? rows[i + 1][j + 1] + 1
          : Math.max(rows[i + 1][j], rows[i][j + 1]);
    }
  }

  const raw: LineDiffEntry[] = [];
  let i = 0;
  let j = 0;
  while (i < left.length || j < right.length) {
    if (i < left.length && j < right.length && left[i] === right[j]) {
      raw.push({ kind: "same", left: left[i], right: right[j] });
      i += 1;
      j += 1;
    } else if (
      i < left.length &&
      (j >= right.length || rows[i + 1][j] >= rows[i][j + 1])
    ) {
      raw.push({ kind: "removed", left: left[i], right: null });
      i += 1;
    } else {
      raw.push({ kind: "added", left: null, right: right[j] });
      j += 1;
    }
  }
  return compactAdjacentChanges(raw);
}

/**
 * 큰 문서 fallback. 이동한 줄을 정밀 추적하지는 않지만 줄 손실 없이 좌우를 같은
 * 인덱스로 비교하며 시간/메모리는 O(N+M)으로 제한된다.
 */
function boundedLinearDiff(left: string[], right: string[]): LineDiffEntry[] {
  const result: LineDiffEntry[] = [];
  const shared = Math.min(left.length, right.length);
  for (let index = 0; index < shared; index += 1) {
    result.push(
      left[index] === right[index]
        ? { kind: "same", left: left[index], right: right[index] }
        : { kind: "removed", left: left[index], right: right[index] },
    );
  }
  for (let index = shared; index < left.length; index += 1) {
    result.push({ kind: "removed", left: left[index], right: null });
  }
  for (let index = shared; index < right.length; index += 1) {
    result.push({ kind: "added", left: null, right: right[index] });
  }
  return result;
}

interface PatienceAnchor {
  leftIndex: number;
  rightIndex: number;
}

function uniqueLinePositions(lines: string[]): Map<string, number> {
  const positions = new Map<string, number | null>();
  lines.forEach((line, index) => {
    positions.set(line, positions.has(line) ? null : index);
  });

  const unique = new Map<string, number>();
  positions.forEach((index, line) => {
    if (index !== null) unique.set(line, index);
  });
  return unique;
}

/**
 * 양쪽에서 한 번씩만 등장하는 줄을 후보로 삼고, 오른쪽 인덱스의 LIS를 구한다.
 * 이렇게 얻은 anchor는 서로 교차하지 않아 각 사이 구간을 독립적으로 diff할 수 있다.
 */
function patienceAnchors(left: string[], right: string[]): PatienceAnchor[] {
  const leftUnique = uniqueLinePositions(left);
  const rightUnique = uniqueLinePositions(right);
  const candidates: PatienceAnchor[] = [];

  leftUnique.forEach((leftIndex, line) => {
    const rightIndex = rightUnique.get(line);
    if (rightIndex !== undefined) candidates.push({ leftIndex, rightIndex });
  });
  candidates.sort((a, b) => a.leftIndex - b.leftIndex);
  if (candidates.length === 0) return [];

  const tails: number[] = [];
  const previous = new Int32Array(candidates.length);
  previous.fill(-1);

  candidates.forEach((candidate, candidateIndex) => {
    let low = 0;
    let high = tails.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (
        candidates[tails[middle]].rightIndex < candidate.rightIndex
      ) {
        low = middle + 1;
      } else {
        high = middle;
      }
    }
    if (low > 0) previous[candidateIndex] = tails[low - 1];
    tails[low] = candidateIndex;
  });

  const anchors: PatienceAnchor[] = [];
  let cursor = tails[tails.length - 1];
  while (cursor !== undefined && cursor >= 0) {
    anchors.push(candidates[cursor]);
    cursor = previous[cursor];
  }
  return anchors.reverse();
}

function diffSegment(
  left: string[],
  right: string[],
  depth = 0,
): LineDiffEntry[] {
  if (left.length === 0) {
    return right.map((line) => ({ kind: "added", left: null, right: line }));
  }
  if (right.length === 0) {
    return left.map((line) => ({ kind: "removed", left: line, right: null }));
  }
  if (left.length * right.length <= MAX_LCS_CELLS) {
    return lcsMiddle(left, right);
  }
  if (depth >= MAX_PATIENCE_DEPTH) {
    return boundedLinearDiff(left, right);
  }

  const anchors = patienceAnchors(left, right);
  if (anchors.length === 0) {
    return boundedLinearDiff(left, right);
  }

  const result: LineDiffEntry[] = [];
  let leftStart = 0;
  let rightStart = 0;
  for (const anchor of anchors) {
    result.push(
      ...diffSegment(
        left.slice(leftStart, anchor.leftIndex),
        right.slice(rightStart, anchor.rightIndex),
        depth + 1,
      ),
      {
        kind: "same",
        left: left[anchor.leftIndex],
        right: right[anchor.rightIndex],
      },
    );
    leftStart = anchor.leftIndex + 1;
    rightStart = anchor.rightIndex + 1;
  }
  result.push(
    ...diffSegment(
      left.slice(leftStart),
      right.slice(rightStart),
      depth + 1,
    ),
  );
  return result;
}

/**
 * 줄 단위 diff. 공통 prefix/suffix를 먼저 걷고, 큰 중간 구간은 patience
 * anchor+LIS로 분할한다. 공통 anchor가 전혀 없는 구간만 선형 위치 비교로
 * 제한하므로 큰 문서의 단순 삽입도 나머지 줄을 변경으로 오인하지 않는다.
 */
export function diffLines(leftText: string, rightText: string): LineDiffEntry[] {
  const left = leftText.split("\n");
  const right = rightText.split("\n");

  let prefixLength = 0;
  while (
    prefixLength < left.length &&
    prefixLength < right.length &&
    left[prefixLength] === right[prefixLength]
  ) {
    prefixLength += 1;
  }

  let suffixLength = 0;
  while (
    suffixLength < left.length - prefixLength &&
    suffixLength < right.length - prefixLength &&
    left[left.length - 1 - suffixLength] === right[right.length - 1 - suffixLength]
  ) {
    suffixLength += 1;
  }

  const prefix = left
    .slice(0, prefixLength)
    .map((line) => ({ kind: "same" as const, left: line, right: line }));
  const leftMiddle = left.slice(prefixLength, left.length - suffixLength);
  const rightMiddle = right.slice(prefixLength, right.length - suffixLength);
  const middle = diffSegment(leftMiddle, rightMiddle);
  const suffix = left
    .slice(left.length - suffixLength)
    .map((line) => ({ kind: "same" as const, left: line, right: line }));

  return [...prefix, ...middle, ...suffix];
}
