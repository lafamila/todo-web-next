import assert from "node:assert/strict";
import test from "node:test";

import { readBoxTable } from "./boxTable.ts";

const USER_TABLE = [
  "┌─────┬────────────────────────────┬──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┬───────────────────────────────────────────────────────────┐",
  "│  #  │            항목            │                                                             처리                                                             │                           검증                            │",
  "├─────┼────────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┼───────────────────────────────────────────────────────────┤",
  "───────────────────────────────────────────────┼───────────────────────────────────────────────────────────┤",
  "│ 11  │ 디자이너 영역              │ ① 썸네일 크기 오류=items-stretch로 설명 길이만큼 늘어남 → lg:self-center(종횡비 유지). ② \"-\" 전화링크=item7 meta로 일괄 해결 │ type-check ✓                                              │",
  "└─────┴────────────────────────────┴──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┴───────────────────────────────────────────────────────────┘",
];

test("사용자 예시의 잘린 구분선을 제외하고 4열 표를 읽는다", () => {
  const result = readBoxTable(USER_TABLE, 0);

  assert.ok(result);
  assert.equal(result.endIndex, USER_TABLE.length);
  assert.equal(result.table.columnCount, 4);
  assert.equal(result.table.headerRowCount, 1);
  assert.deepEqual(result.table.rows.map((row) => row.lineOffset), [1, 4]);
  assert.deepEqual(result.table.rows[0].cells, ["#", "항목", "처리", "검증"]);
  assert.equal(result.table.rows[1].cells[1], "디자이너 영역");
  assert.match(result.table.rows[1].cells[2], /lg:self-center/);
});

test("한글, 긴 셀, 빈 셀과 HTML처럼 보이는 문자열을 평문 데이터로 유지한다", () => {
  const lines = [
    "┌──┬────────────────┬──┐",
    "│  │ <img src=x onerror=alert(1)> │ 끝 │",
    "├──┼────────────────┼──┤",
    "│ 가 │ 아주 긴 한국어 문장과 English 123 │  │",
    "└──┴────────────────┴──┘",
  ];

  const result = readBoxTable(lines, 0);

  assert.ok(result);
  assert.deepEqual(result.table.rows[0].cells, ["", "<img src=x onerror=alert(1)>", "끝"]);
  assert.deepEqual(result.table.rows[1].cells, ["가", "아주 긴 한국어 문장과 English 123", ""]);
  assert.equal(result.table.headerRowCount, 1);
});

test("들여쓰기와 CRLF의 CR을 허용하고 셀 원문 UTF-16 column을 반환한다", () => {
  const source = "  ┌──┬────┐\r\n  │  │ 값 │\r\n  ├──┼────┤\r\n  │ A │ 나 │\r\n  └──┴────┘\r\n다음";
  const lines = source.split("\n");
  const result = readBoxTable(lines, 0);

  assert.ok(result);
  assert.equal(result.endIndex, 5);
  assert.deepEqual(result.table.rows[0].cells, ["", "값"]);
  assert.deepEqual(result.table.rows[0].cellOffsets, [5, 7]);
  assert.deepEqual(result.table.rows[1].cellOffsets, [4, 8]);
  const tableSource = lines.slice(0, result.endIndex).join("\n");
  assert.equal(`${tableSource}\n다음`, source);
});

test("열 수가 다른 데이터 행은 표 전체를 일반 텍스트로 fallback한다", () => {
  const lines = [
    "┌──┬──┐",
    "│ a │ b │",
    "├──┼──┤",
    "│ 열이 하나뿐 │",
    "└──┴──┘",
  ];

  assert.equal(readBoxTable(lines, 0), null);
});

test("셀 안의 추가 세로선은 모호하므로 fallback한다", () => {
  assert.equal(
    readBoxTable(["┌──┬──┐", "│ a │ b │ c │", "└──┴──┘"], 0),
    null,
  );
});

test("여러 데이터 행 사이의 반복 구분선과 연속 장식 구분선을 허용한다", () => {
  const result = readBoxTable(
    [
      "┌──┬──┐",
      "│ h1 │ h2 │",
      "├──┼──┤",
      "├──┼──┤",
      "│ a │ b │",
      "├──┼──┤",
      "│ c │ d │",
      "├──┼──┤",
      "└──┴──┘",
    ],
    0,
  );

  assert.ok(result);
  assert.equal(result.table.headerRowCount, 1);
  assert.deepEqual(result.table.rows.map((row) => row.cells), [
    ["h1", "h2"],
    ["a", "b"],
    ["c", "d"],
  ]);
  assert.deepEqual(result.table.rows.map((row) => row.lineOffset), [1, 4, 6]);
});

test("닫는 테두리가 없거나 열 수가 다른 테두리는 fallback한다", () => {
  assert.equal(readBoxTable(["┌──┬──┐", "│ a │ b │"], 0), null);
  assert.equal(readBoxTable(["┌──┬──┐", "│ a │ b │", "└──┘"], 0), null);
  assert.equal(readBoxTable(["┌──┬──┐", "│ a │ b │", "├────┤", "└──┴──┘"], 0), null);
});

test("코드 펜스 줄은 표 시작으로 보지 않는다", () => {
  const lines = ["```text", "┌──┬──┐", "│ a │ b │", "└──┴──┘", "```"];

  assert.equal(readBoxTable(lines, 0), null);
});

test("인접한 두 표의 범위를 독립적으로 반환하고 원문을 바꾸지 않는다", () => {
  const lines = [
    "앞",
    "┌─┬─┐",
    "│a│b│",
    "└─┴─┘",
    "┌─┬─┐",
    "│c│d│",
    "└─┴─┘",
    "뒤",
  ];
  const original = lines.join("\n");
  const first = readBoxTable(lines, 1);
  const second = readBoxTable(lines, first?.endIndex ?? -1);

  assert.ok(first);
  assert.ok(second);
  assert.equal(first.endIndex, 4);
  assert.equal(second.endIndex, 7);
  assert.equal(lines.join("\n"), original);
  assert.equal(lines.slice(1, first.endIndex).join("\n"), "┌─┬─┐\n│a│b│\n└─┴─┘");
});

test("이모지 앞뒤 셀 위치는 UTF-16 source column으로 계산한다", () => {
  const result = readBoxTable(["┌──┬──┐", "│ 😀 │ 값 │", "└──┴──┘"], 0);

  assert.ok(result);
  assert.deepEqual(result.table.rows[0].cells, ["😀", "값"]);
  assert.deepEqual(result.table.rows[0].cellOffsets, [2, 7]);
  assert.equal("│ 😀 │ 값 │".slice(result.table.rows[0].cellOffsets[1], 8), "값");
});
