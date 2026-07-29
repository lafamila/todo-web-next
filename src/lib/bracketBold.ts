/**
 * `[텍스트]` 인라인 강조 문법 단일 소스.
 *
 * 마크다운 본문(remark 플러그인)과 체크박스 내용(plain text 렌더)이 같은 규칙을 써야 하므로
 * 판정은 여기 한 곳에만 둔다.
 *
 * 인정 조건 두 가지:
 * - 뒤에 `(` 가 오면 강조하지 않는다 — `[텍스트](URL)` 링크와 `[@메모](?memoId=…)` 를 지킨다.
 * - 여는 `[` 가 줄 시작이나 공백 뒤여야 한다 — `arr[0]`, `acc[workerId]` 처럼 코드에서 쓰인
 *   대괄호를 강조하지 않기 위한 조건이다(펜스 없이 코드를 붙여넣은 옛 메모가 많다).
 */

/** 캡처: 1 = 앞의 공백(또는 빈 문자열), 2 = `[…]` 라벨 전체. lookbehind 없이 쓴다. */
const BRACKET_BOLD_SOURCE = String.raw`(^|\s)(\[[^[\]\n]+\])(?!\()`;

export interface BracketBoldPart {
  text: string;
  bold: boolean;
}

/** 한 줄(또는 텍스트 노드)을 강조/비강조 조각으로 나눈다. 대괄호는 화면에 그대로 남는다. */
export function splitBracketBold(text: string): BracketBoldPart[] {
  const pattern = new RegExp(BRACKET_BOLD_SOURCE, 'g');
  const parts: BracketBoldPart[] = [];
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const [, lead, label] = match;
    const start = match.index + lead.length;

    if (start > last) parts.push({ text: text.slice(last, start), bold: false });
    parts.push({ text: label, bold: true });
    last = start + label.length;
  }

  if (last < text.length || parts.length === 0) {
    parts.push({ text: text.slice(last), bold: false });
  }

  return parts;
}

export function hasBracketBold(text: string): boolean {
  return new RegExp(BRACKET_BOLD_SOURCE).test(text);
}

interface MdastNode {
  type: string;
  value?: string;
  children?: MdastNode[];
}

/** 코드는 손대지 않는다 — 링크는 이미 link 노드라 text 노드에 대괄호가 남지 않는다. */
const SKIPPED_NODE_TYPES = new Set(['code', 'inlineCode', 'html']);

function transformChildren(node: MdastNode): void {
  if (!node.children) return;

  const next: MdastNode[] = [];

  for (const child of node.children) {
    if (SKIPPED_NODE_TYPES.has(child.type)) {
      next.push(child);
      continue;
    }

    if (child.type !== 'text' || typeof child.value !== 'string') {
      transformChildren(child);
      next.push(child);
      continue;
    }

    const parts = splitBracketBold(child.value);
    if (parts.length === 1 && !parts[0].bold) {
      next.push(child);
      continue;
    }

    for (const part of parts) {
      if (part.text === '') continue;
      next.push(
        part.bold
          ? { type: 'strong', children: [{ type: 'text', value: part.text }] }
          : { type: 'text', value: part.text },
      );
    }
  }

  node.children = next;
}

/** remark 플러그인: mdast 의 text 노드에서 `[텍스트]` 를 strong 으로 바꾼다. */
export function remarkBracketBold() {
  return (tree: MdastNode): void => {
    transformChildren(tree);
  };
}
