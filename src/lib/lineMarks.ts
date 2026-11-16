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

/** 호환 export. 이제 level은 근사 단계가 아니라 원문의 선행 공백 문자 수다. */
export const INDENT_UNIT = 1;
export const MAX_INDENT_LEVEL = Number.MAX_SAFE_INTEGER;

export interface CheckboxMark {
  checked: boolean;
  /** 표기를 뺀 내용. */
  content: string;
}

export interface IndentSplit {
  /** 원문의 선행 공백 문자 수 (0 = 없음). */
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
 * 모든 앞 공백을 원문 그대로 분리한다. 일반 텍스트도 예외 없이 같은 정보를 반환하며,
 * 렌더러가 실제 공백 문자로 다시 그려 편집 전후 폭을 같게 한다.
 */
export function splitIndent(text: string): IndentSplit {
  const match = /^( +)(.*)$/.exec(text);
  if (!match) return { level: 0, indentText: '', body: text };

  const [, indentText, body] = match;
  return {
    level: indentText.length,
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
