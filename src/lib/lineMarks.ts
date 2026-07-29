/**
 * 줄 단위 문법(들여쓰기 · 체크박스) 단일 소스.
 *
 * 읽기 전용 렌더(`parseContent` → ArticleDetail)와 인라인 에디터(`classifyLine`)가 **같은 규칙**을
 * 써야 하므로 판정은 여기 한 곳에만 둔다 — `lib/codeFence.ts` 와 같은 역할이다.
 * 원문(`EditorLine.text`)은 절대 바꾸지 않는다: 여기서 계산하는 값은 렌더 표현일 뿐이다.
 */

/**
 * 체크된 체크박스. 구 표기 `--v ` 는 지원하지 않는다 —
 * 사용자 결정(2026-07-29): 도입 직후라 남아 있는 줄은 직접 고친다. 호환 경로를 두지 않는다.
 */
export const CHECKBOX_CHECKED_PREFIX = 'v-- ';
export const CHECKBOX_UNCHECKED_PREFIX = '-- ';

/** 스페이스 2칸 = 들여쓰기 한 단위. */
export const INDENT_UNIT = 2;
/** 본문이 화면 밖으로 밀리지 않게 상한을 둔다 (기존 메모에 32칸 들여쓴 줄이 있다). */
export const MAX_INDENT_LEVEL = 8;
/** 한 단위의 시각 폭 — 마크다운 목록의 `pl-6`(1.5rem) 과 같은 리듬을 쓴다. */
const INDENT_STEP_REM = 1.5;

/** 들여쓰기를 인정하는 목록 표기: `1. ` `1) ` `- ` `* ` `+ `. */
const LIST_MARKER_PATTERN = /^(?:\d+[.)]|[-*+]) /;

export interface CheckboxMark {
  checked: boolean;
  /** 표기를 뺀 내용. */
  content: string;
}

export interface IndentSplit {
  /** 들여쓰기 단위 수 (0 = 없음). */
  level: number;
  /** 원문의 앞 공백 그대로 — 토글이 들여쓰기를 보존할 때 쓴다. */
  indentText: string;
  /** 들여쓰기를 뺀 본문. 들여쓰기 대상이 아니면 원문 그대로다. */
  body: string;
}

function matchCheckboxBody(body: string): CheckboxMark | null {
  if (body.startsWith(CHECKBOX_CHECKED_PREFIX)) {
    return { checked: true, content: body.slice(CHECKBOX_CHECKED_PREFIX.length) };
  }

  if (body.startsWith(CHECKBOX_UNCHECKED_PREFIX)) {
    return { checked: false, content: body.slice(CHECKBOX_UNCHECKED_PREFIX.length) };
  }

  return null;
}

/**
 * 앞 공백을 들여쓰기 단위로 해석한다.
 *
 * 체크박스/목록 표기가 뒤따를 때**만** 들여쓰기로 보고 그 외 줄은 원문을 그대로 둔다 —
 * 마크다운은 4칸 이상 들여쓴 줄을 코드 블록으로 읽으므로, 임의의 줄에서 공백을 걷어내면
 * 의도적으로 들여쓴 예시 문단의 렌더가 바뀐다. 반대로 목록 줄은 **반드시** 걷어내야 하는데,
 * 인라인 에디터는 한 줄씩 따로 마크다운으로 넘기므로 4칸 들여쓴 `- 항목` 이 목록이 아니라
 * 코드 블록으로 렌더되기 때문이다. 들여쓰기는 렌더에서 padding 으로 되살린다.
 */
export function splitIndent(text: string): IndentSplit {
  const match = /^( +)(.*)$/.exec(text);
  if (!match) return { level: 0, indentText: '', body: text };

  const [, indentText, body] = match;
  if (!matchCheckboxBody(body) && !LIST_MARKER_PATTERN.test(body)) {
    return { level: 0, indentText: '', body: text };
  }

  return {
    level: Math.min(Math.floor(indentText.length / INDENT_UNIT), MAX_INDENT_LEVEL),
    indentText,
    body,
  };
}

/** 들여쓰기를 포함한 한 줄에서 체크박스를 읽는다. 체크박스가 아니면 null. */
export function matchCheckbox(text: string): (CheckboxMark & { indent: number }) | null {
  const { level, body } = splitIndent(text);
  const mark = matchCheckboxBody(body);
  return mark ? { ...mark, indent: level } : null;
}

/** 체크박스 토글. 들여쓰기는 보존하고 구 표기(`--v `)는 canonical 표기로 정규화한다. */
export function toggleCheckboxLine(text: string): string {
  const { indentText, body } = splitIndent(text);
  const mark = matchCheckboxBody(body);
  if (!mark) return text;

  const prefix = mark.checked ? CHECKBOX_UNCHECKED_PREFIX : CHECKBOX_CHECKED_PREFIX;
  return `${indentText}${prefix}${mark.content}`;
}

/**
 * 렌더된 블록에만 붙이는 들여쓰기 스타일.
 * 편집 중인 줄은 원문의 공백이 그대로 보이므로 padding 을 주면 두 번 들여쓴 것처럼 보인다.
 */
export function indentStyle(level: number): { paddingLeft: string } | undefined {
  return level > 0 ? { paddingLeft: `${level * INDENT_STEP_REM}rem` } : undefined;
}
