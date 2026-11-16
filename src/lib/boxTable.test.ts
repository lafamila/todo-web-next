import assert from "node:assert/strict";
import test from "node:test";

import {
  insertBoxTableColumn,
  insertBoxTableRow,
  readBoxTable,
  updateBoxTableCell,
} from "./boxTable.ts";

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

test("완전한 구분선 사이의 물리 줄을 빈 줄까지 보존해 한 논리 행으로 묶는다", () => {
  const result = readBoxTable([
    "┌────┬────┐",
    "│ 위 │ one │",
    "│    │     │",
    "│ 아래 │ two │",
    "├────┼────┤",
    "│ 다음 │ row │",
    "└────┴────┘",
  ], 0);

  assert.ok(result);
  assert.equal(result.table.headerRowCount, 1);
  assert.equal(result.table.rows.length, 2);
  assert.deepEqual(result.table.rows[0].cells, ["위\n\n아래", "one\n\ntwo"]);
  assert.deepEqual(result.table.rows[0].physicalLineOffsets, [1, 2, 3]);
  assert.equal(result.table.rows[0].stableKey, "source:1");
  assert.deepEqual(result.table.rows[0].cellSegments[0].map((segment) => segment.text), ["위", "", "아래"]);
  assert.deepEqual(
    result.table.rows[0].cellSegments[0].map(({ valueStart, valueEnd }) => [valueStart, valueEnd]),
    [[0, 1], [2, 2], [3, 5]],
  );
});

test("잘린 장식선은 논리 행을 끊지 않고 완전한 구분선만 행을 나눈다", () => {
  const result = readBoxTable([
    "┌──┬──┐",
    "│ a │ b │",
    "────┼──┤",
    "│ c │ d │",
    "├──┼──┤",
    "│ e │ f │",
    "└──┴──┘",
  ], 0);

  assert.ok(result);
  assert.deepEqual(result.table.rows.map((row) => row.cells), [
    ["a\nc", "b\nd"],
    ["e", "f"],
  ]);
});

test("escaped 세로선 codec과 UTF-16 source mapping을 제공한다", () => {
  const result = readBoxTable([
    "┌────────┬────┐",
    "│ a\\│😀b │ 값 │",
    "└────────┴────┘",
  ], 0);

  assert.ok(result);
  assert.deepEqual(result.table.rows[0].cells, ["a│😀b", "값"]);
  const segment = result.table.rows[0].cellSegments[0][0];
  assert.equal(segment.text, "a│😀b");
  assert.equal(segment.valueToSourceOffsets.length, "a│😀b".length + 1);
  assert.equal(segment.valueToSourceOffsets.at(-1), segment.sourceEnd);
  assert.equal(result.table.rawLines.join("\n"), "┌────────┬────┐\n│ a\\│😀b │ 값 │\n└────────┴────┘");
});

test("legacy 셀 끝의 역슬래시 뒤 세로선은 실제 경계로 fallback한다", () => {
  const result = readBoxTable([
    "┌────┬────┐",
    "│ C:\\│ 값 │",
    "└────┴────┘",
  ], 0);

  assert.ok(result);
  assert.deepEqual(result.table.rows[0].cells, ["C:\\", "값"]);

  const edited = updateBoxTableCell(result.table.rawLines, 0, 1, " 값 ");
  assert.ok(edited);
  assert.deepEqual(edited.table.rows[0].cells, ["C:\\", "값"]);
  assert.ok(edited.lines[1].includes(" 값 "));
});

test("여러 역슬래시와 literal 세로선은 수정 뒤에도 같은 셀 값으로 왕복한다", () => {
  const lines = ["┌────┬────┐", "│ A  │ B  │", "└────┴────┘"];
  const value = "경로\\\\│표시";
  const mutation = updateBoxTableCell(lines, 0, 0, value);

  assert.ok(mutation);
  assert.equal(mutation.table.rows[0].cells[0], value);
  assert.match(mutation.lines[1], /경로\\\\\\│표시/u);
});

test("동일 셀 값 수정은 CRLF와 원문을 byte-identical하게 유지한다", () => {
  const lines = ["  ┌────┬────┐\r", "  │ A  │ B  │\r", "  └────┴────┘\r"];
  const mutation = updateBoxTableCell(lines, 0, 0, "A");

  assert.ok(mutation);
  assert.equal(mutation.changed, false);
  assert.deepEqual(mutation.lines, lines);
  assert.deepEqual(mutation.lineOrigins, [0, 1, 2]);
});

test("셀 수정은 multiline sibling을 패딩하고 literal 세로선만 escape한다", () => {
  const lines = ["┌────┬────┐", "│ A  │ B  │", "└────┴────┘"];
  const mutation = updateBoxTableCell(lines, 0, 0, "첫│줄\n둘째\\path");

  assert.ok(mutation);
  assert.equal(mutation.changed, true);
  assert.deepEqual(mutation.table.rows[0].cells, ["첫│줄\n둘째\\path", "B\n"]);
  assert.match(mutation.lines[1], /첫\\│줄/u);
  assert.match(mutation.lines[2], /둘째\\path/u);
  assert.deepEqual(mutation.lineOrigins, [0, 1, null, 2]);
  assert.equal(mutation.table.widths[1], 4);

  const collapsed = updateBoxTableCell(mutation.lines, 0, 0, "한 줄");
  assert.ok(collapsed);
  assert.deepEqual(collapsed.table.rows[0].cells, ["한 줄\n", "B\n"]);
  assert.equal(collapsed.lines.length, 4);
});

test("편집 셀의 선행·후행 공백은 원문에 남고 legacy viewer는 패딩으로 정리한다", () => {
  const lines = ["┌────────────┬────┐", "│ A          │ B  │", "└────────────┴────┘"];
  const value = "  앞😀뒤  ";
  const mutation = updateBoxTableCell(lines, 0, 0, value);

  assert.ok(mutation);
  assert.equal(mutation.table.rows[0].cells[0], "앞😀뒤");
  assert.ok(mutation.lines[1].includes(value));
  assert.doesNotMatch(mutation.lines.join(""), /[\u2060-\u2063]/u);
  const reparsed = readBoxTable(mutation.lines, 0);
  assert.ok(reparsed);
  assert.equal(reparsed.table.rows[0].cells[0], "앞😀뒤");
});

test("legacy \\share와 \\server\\s를 새 space 문법으로 해석하지 않는다", () => {
  const result = readBoxTable([
    "┌──────────┬────────────┬────────────┐",
    "│ \\share   │ \\server\\s  │ literal\\s  │",
    "└──────────┴────────────┴────────────┘",
  ], 0);

  assert.ok(result);
  assert.deepEqual(result.table.rows[0].cells, ["\\share", "\\server\\s", "literal\\s"]);
});

test("셀 수정은 폭이 그대로면 대상 물리 줄 외 원문과 잘린 장식을 보존한다", () => {
  const lines = [
    "┌────┬────┐  ",
    "│ H1 │ H2 │",
    "├────┼────┤",
    "────┼──┤",
    "│ A  │ B  │",
    "└────┴────┘  ",
  ];
  const mutation = updateBoxTableCell(lines, 0, 0, "X");

  assert.ok(mutation);
  assert.equal(mutation.lines[0], lines[0]);
  assert.notEqual(mutation.lines[1], lines[1]);
  assert.deepEqual(mutation.lines.slice(2), lines.slice(2));
  assert.deepEqual(mutation.lineOrigins, [0, 1, 2, 3, 4, 5]);
});

test("셀 축소는 저작된 빈 물리 segment나 다른 셀의 대응 내용을 삭제하지 않는다", () => {
  const lines = [
    "┌────┬────┐",
    "│ A  │ one │",
    "│    │     │",
    "│ C  │ three │",
    "└────┴────┘",
  ];
  const mutation = updateBoxTableCell(lines, 0, 0, "X");

  assert.ok(mutation);
  assert.equal(mutation.lines.length, lines.length);
  assert.deepEqual(mutation.table.rows[0].cells, ["X\n\n", "one\n\nthree"]);
  assert.deepEqual(mutation.lineOrigins, [0, 1, 2, 3, 4]);
});

test("header가 있는 표는 위 삽입을 거부하고 body 경계 삽입은 구분선으로 분리한다", () => {
  const lines = [
    "┌────┬────┐",
    "│ H1 │ H2 │",
    "├────┼────┤",
    "│ A  │ B  │",
    "└────┴────┘",
  ];

  assert.equal(insertBoxTableRow(lines, 0), null);
  const beforeBody = insertBoxTableRow(lines, 1);
  const afterBody = insertBoxTableRow(lines, 2);
  assert.ok(beforeBody);
  assert.ok(afterBody);
  assert.equal(beforeBody.table.rows.length, 3);
  assert.equal(afterBody.table.rows.length, 3);
  assert.deepEqual(beforeBody.table.rows[1].cells, ["", ""]);
  assert.deepEqual(afterBody.table.rows[2].cells, ["", ""]);
  assert.equal(beforeBody.lines.filter((line) => line.startsWith("├")).length, 2);
  assert.ok(beforeBody.lineOrigins.includes(null));
});

test("headerless 표는 첫/마지막 경계 삽입 후 기존 문법대로 첫 분리 행이 header가 된다", () => {
  const lines = ["┌──┬──┐", "│ a │ b │", "└──┴──┘"];
  const first = insertBoxTableRow(lines, 0);
  const last = insertBoxTableRow(lines, 1);

  assert.ok(first);
  assert.ok(last);
  assert.deepEqual(first.table.rows[0].cells, ["", ""]);
  assert.deepEqual(last.table.rows[1].cells, ["", ""]);
  assert.equal(first.table.headerRowCount, 1);
  assert.equal(last.table.headerRowCount, 1);
  assert.equal(readBoxTable(first.lines, 0)?.table.headerRowCount, 1);
  assert.equal(readBoxTable(last.lines, 0)?.table.headerRowCount, 1);
});

test("CRLF 표의 수정과 새 물리 줄은 CR ending을 유지한다", () => {
  const lines = ["┌────┬────┐\r", "│ A  │ B  │\r", "└────┴────┘\r"];
  const mutation = updateBoxTableCell(lines, 0, 0, "첫째\n둘째");

  assert.ok(mutation);
  assert.ok(mutation.lines.every((line) => line.endsWith("\r")));
  assert.deepEqual(mutation.table.lineEndings, ["\r", "\r", "\r", "\r"]);
});

test("첫/중간/마지막 열 삽입은 셀과 모든 테두리에 같은 열을 만든다", () => {
  const lines = [
    "┌──┬────┐",
    "│ a │ bb │",
    "├──┼────┤",
    "│ c │ dd │",
    "└──┴────┘",
  ];

  for (const boundary of [0, 1, 2]) {
    const mutation = insertBoxTableColumn(lines, boundary);
    assert.ok(mutation);
    assert.equal(mutation.table.columnCount, 3);
    assert.deepEqual(mutation.table.rows.map((row) => row.cells[boundary]), ["", ""]);
    assert.equal(mutation.lines[0].split("┬").length, 3);
    assert.equal(mutation.lines.at(-1)?.split("┴").length, 3);
    assert.deepEqual(mutation.lineOrigins, [0, 1, 2, 3, 4]);
  }
});

test("body가 없는 header-only 표도 구조 변경 뒤 header role을 유지한다", () => {
  const lines = [
    "┌────┬────┐",
    "│ H1 │ H2 │",
    "├────┼────┤",
    "└────┴────┘",
  ];
  const mutation = insertBoxTableColumn(lines, 1);

  assert.ok(mutation);
  assert.equal(mutation.table.headerRowCount, 1);
  assert.equal(mutation.table.rows.length, 1);
  assert.equal(mutation.lines.filter((line) => line.startsWith("├")).length, 1);
});

test("잘못된 표와 범위는 수정하지 않는다", () => {
  const invalid = ["┌──┬──┐", "│ a │ b │"];
  const valid = ["┌──┬──┐", "│ a │ b │", "└──┴──┘"];
  assert.equal(updateBoxTableCell(invalid, 0, 0, "x"), null);
  assert.equal(updateBoxTableCell(valid, -1, 0, "x"), null);
  assert.equal(updateBoxTableCell(valid, 0, 2, "x"), null);
  assert.equal(insertBoxTableRow(valid, 2), null);
  assert.equal(insertBoxTableColumn(valid, 3), null);
});
