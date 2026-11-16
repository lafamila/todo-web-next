import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeMemoLine,
  safeMemoLinkTarget,
  shouldBypassMemoInline,
  tokenizeCheckboxInline,
  tokenizeMemoInline,
  toggleSlashStrikeRange,
} from "./memoSyntax.ts";
import { matchCheckbox, toggleCheckboxLine } from "./lineMarks.ts";

test("확정된 줄 문법만 변환하고 나머지 Markdown 표기는 원문으로 둔다", () => {
  assert.deepEqual(analyzeMemoLine("  - 항목"), {
    kind: "bullet",
    indent: "  ",
    prefix: "- ",
    content: "항목",
  });
  assert.equal(analyzeMemoLine("- [ ] 작업").kind, "plain");
  assert.equal(analyzeMemoLine("* 항목").kind, "plain");
  assert.equal(analyzeMemoLine("+ 항목").kind, "plain");
  assert.equal(analyzeMemoLine("1. 항목").kind, "plain");
  assert.equal(analyzeMemoLine("2) 항목").kind, "plain");
  assert.equal(analyzeMemoLine("# 제목").kind, "plain");
  assert.equal(analyzeMemoLine("> 인용").kind, "plain");
  assert.equal(analyzeMemoLine("***").kind, "plain");
  assert.equal(analyzeMemoLine("___").kind, "plain");
  assert.equal(analyzeMemoLine("---").kind, "rule");
  assert.equal(shouldBypassMemoInline("- [x] 작업"), true);
  assert.equal(shouldBypassMemoInline("1. [ ] 작업"), true);
  assert.equal(shouldBypassMemoInline("[라벨]: https://example.com"), true);
  assert.equal(shouldBypassMemoInline("[^1]: 각주"), true);
});

test("모든 선행 공백을 문자 그대로 보존하고 //만 줄 취소선 접두사로 읽는다", () => {
  assert.deepEqual(analyzeMemoLine("        일반"), {
    kind: "plain",
    indent: "        ",
    prefix: "",
    content: "일반",
  });
  assert.deepEqual(analyzeMemoLine("   //취소"), {
    kind: "strike",
    indent: "   ",
    prefix: "//",
    content: "취소",
  });
  assert.equal(analyzeMemoLine("https://example.com//path").kind, "plain");
  assert.equal(analyzeMemoLine("내용 // 중간").kind, "plain");
});

test("인라인 문법은 코드, 링크, 이미지, 자동 링크와 앱 대괄호 강조만 남긴다", () => {
  assert.deepEqual(tokenizeMemoInline("`코드` **굵게** *기울임* ~~취소~~ [강조]"), [
    { type: "code", value: "코드" },
    { type: "text", value: " **굵게** *기울임* ~~취소~~ " },
    { type: "strong", value: "[강조]" },
  ]);

  const tokens = tokenizeMemoInline("[문서](https://example.com) ![그림](https://example.com/a.png) www.example.com a@b.com");
  assert.deepEqual(tokens, [
    { type: "link", value: "문서", target: "https://example.com" },
    { type: "text", value: " " },
    { type: "image", value: "그림", target: "https://example.com/a.png" },
    { type: "text", value: " " },
    { type: "link", value: "www.example.com", target: "https://www.example.com" },
    { type: "text", value: " " },
    { type: "link", value: "a@b.com", target: "mailto:a@b.com" },
  ]);
});

test("링크 destination의 균형 괄호, 선택 title과 상대 경로를 보존한다", () => {
  assert.deepEqual(tokenizeMemoInline("[문서](https://host/Foo_(bar)) [상대](docs/readme \"설명\")"), [
    { type: "link", value: "문서", target: "https://host/Foo_(bar)" },
    { type: "text", value: " " },
    { type: "link", value: "상대", target: "docs/readme" },
  ]);

  for (const target of ["docs/readme", "./file", "../file", "/root", "#part", "?memoId=1"]) {
    assert.equal(safeMemoLinkTarget(target), target);
  }
  assert.deepEqual(tokenizeMemoInline("[홑](./one 'title') [괄호](../two (title))"), [
    { type: "link", value: "홑", target: "./one" },
    { type: "text", value: " " },
    { type: "link", value: "괄호", target: "../two" },
  ]);
});

test("위험하거나 제어문자로 흐린 scheme과 malformed 링크는 링크 토큰이 되지 않는다", () => {
  for (const target of [
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "java\nscript:alert(1)",
    "data:text/html,x",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
  ]) {
    assert.equal(safeMemoLinkTarget(target), null);
  }

  const unsafe = "[위험](javascript:alert(1))";
  assert.deepEqual(tokenizeMemoInline(unsafe), [{ type: "text", value: unsafe }]);
  const malformed = "[첫째](닫히지 않음 [둘째](https://example.com)";
  assert.deepEqual(tokenizeMemoInline(malformed), [
    { type: "text", value: "[첫째](닫히지 않음 " },
    { type: "link", value: "둘째", target: "https://example.com" },
  ]);
});

test("체크박스 payload는 기존처럼 대괄호 강조와 명시 링크만 해석한다", () => {
  assert.deepEqual(tokenizeCheckboxInline("`코드` https://example.com ![그림](https://img/x) [강조] [링크](./doc)"), [
    { type: "text", value: "`코드` https://example.com !" },
    { type: "link", value: "그림", target: "https://img/x" },
    { type: "text", value: " " },
    { type: "strong", value: "[강조]" },
    { type: "text", value: " " },
    { type: "link", value: "링크", target: "./doc" },
  ]);
});

test("삭제된 escape, entity, reference, footnote와 fence 표기는 그대로 남는다", () => {
  for (const source of [
    "\\# \\*",
    "&amp; &nbsp;",
    "[라벨]: https://example.com",
    "[^1]: 각주",
    "~~~",
    "````",
    "````코드````",
    "__굵게__ _기울임_ ~취소~",
  ]) {
    const visible = tokenizeMemoInline(source).map((token) => token.value).join("");
    assert.equal(visible, source);
  }
});

test("Cmd/Ctrl+/용 helper가 현재 줄과 선택 줄의 // 및 선택 범위를 함께 보정한다", () => {
  assert.deepEqual(toggleSlashStrikeRange("  첫째\n둘째\n셋째", 3, 3), {
    text: "  //첫째\n둘째\n셋째",
    selectionStart: 5,
    selectionEnd: 5,
    changed: true,
  });

  const selected = toggleSlashStrikeRange("  첫째\n둘째\n셋째", 0, "  첫째\n둘째\n".length);
  assert.equal(selected.text, "  //첫째\n//둘째\n셋째");
  assert.equal(selected.selectionStart, 0);
  assert.equal(selected.selectionEnd, "  //첫째\n//둘째\n".length);

  const removed = toggleSlashStrikeRange(selected.text, selected.selectionStart, selected.selectionEnd);
  assert.deepEqual(removed, {
    text: "  첫째\n둘째\n셋째",
    selectionStart: 0,
    selectionEnd: "  첫째\n둘째\n".length,
    changed: true,
  });
});

test("빈 줄만 선택한 // toggle은 안전한 no-op이다", () => {
  assert.deepEqual(toggleSlashStrikeRange("\n", 0, 1), {
    text: "\n",
    selectionStart: 0,
    selectionEnd: 1,
    changed: false,
  });
});

test("앱 체크박스는 실제 선행 공백 수를 보존하고 v--도 텍스트 변형 없이 토글한다", () => {
  assert.deepEqual(matchCheckbox("   v-- 완료"), {
    checked: true,
    content: "완료",
    indent: 3,
  });
  assert.equal(toggleCheckboxLine("   v-- 완료"), "   -- 완료");
  assert.equal(toggleCheckboxLine("   -- 완료"), "   v-- 완료");
});
