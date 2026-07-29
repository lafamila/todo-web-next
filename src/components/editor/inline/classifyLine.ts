import { codeFenceLanguage, isCodeFenceLine } from '@/lib/codeFence';
import { matchCheckbox, splitIndent } from '@/lib/lineMarks';
import { parseContent } from '@/lib/utils';
import type { ContentBlockInterface } from '@/lib/types';

/**
 * 인라인 에디터의 문서 모델.
 * id 는 세션-로컬 안정 식별자로, 배열 인덱스를 키로 쓸 때 생기는 리마운트/커서 유실을 막는다.
 * 저장/브로드캐스트는 언제나 `lines.map((l) => l.text).join('\n')` 이며 바이트 동일 왕복이 불변식이다.
 */
export interface EditorLine {
  id: number;
  text: string;
}

export type LineKind =
  | 'checkbox-unchecked'
  | 'checkbox-checked'
  | 'code-fence'
  | 'memo-link'
  | 'text'
  | 'blank';

export interface LineClassification {
  kind: LineKind;
  /** 렌더용 표시 내용. 원문은 항상 `EditorLine.text` 가 보관한다. */
  content: string;
  checked: boolean;
  /** 들여쓰기 단위 수 (스페이스 2칸 = 1). 렌더 padding 으로만 쓰인다. */
  indent: number;
  memoId?: string;
  memoTitle?: string;
}

// 체크박스/들여쓰기 문법은 `lib/lineMarks.ts` 가 단일 소스다 (parseContent 와 공유).
export { CHECKBOX_CHECKED_PREFIX, CHECKBOX_UNCHECKED_PREFIX } from '@/lib/lineMarks';

const MEMO_LINK_PATTERN = /\[@([^\]]+)\]\(([^)]+)\)/;

// 펜스 문법은 `lib/codeFence.ts` 가 단일 소스다 (parseContent 와 공유 — 갈라지면 렌더가 달라진다).
export { CODE_FENCE_MARK, DEFAULT_CODE_LANGUAGE } from '@/lib/codeFence';
export const isCodeFence = isCodeFenceLine;
export const fenceLanguage = codeFenceLanguage;

/**
 * 한 줄을 분류한다. `lib/utils.ts` 의 `parseContent` 와 동일 케이스 판정을 목표로 하며,
 * 개발 모드에서는 `assertClassifierMatchesParseContent` 가 두 경로의 일치를 감시한다.
 * 코드펜스의 open/close 구분은 문서 문맥이 필요하므로 `buildLineGroups` 2차 패스가 담당한다.
 */
export function classifyLine(text: string): LineClassification {
  const checkbox = matchCheckbox(text);
  if (checkbox) {
    return {
      kind: checkbox.checked ? 'checkbox-checked' : 'checkbox-unchecked',
      content: checkbox.content,
      checked: checkbox.checked,
      indent: checkbox.indent,
    };
  }

  if (isCodeFence(text)) {
    return { kind: 'code-fence', content: text, checked: false, indent: 0 };
  }

  if (text.includes('[@') && text.includes('](')) {
    const match = text.match(MEMO_LINK_PATTERN);

    if (match) {
      const [, memoTitle, memoId] = match;
      const { level, body } = splitIndent(text);
      return { kind: 'memo-link', content: body, checked: false, indent: level, memoId, memoTitle };
    }
  }

  if (text.trim() === '') {
    return { kind: 'blank', content: text, checked: false, indent: 0 };
  }

  const { level, body } = splitIndent(text);
  return { kind: 'text', content: body, checked: false, indent: level };
}

/** 자동 렌더(2초 안정화)의 대상이 되는 종류인가. text/blank 는 소스와 렌더 차이가 없어 제외한다. */
export function isAutoRenderTarget(cls: LineClassification): boolean {
  return (
    cls.kind === 'checkbox-checked' ||
    cls.kind === 'checkbox-unchecked' ||
    cls.kind === 'memo-link'
  );
}

/**
 * 패턴 완결 여부. `--` 만 있거나 `-- ` 뒤가 공백뿐이면 완결이 아니므로 절대 자동 렌더하지 않는다.
 * ("`-` 까지는 그냥 `-`" 스펙의 일반화)
 */
export function isCompletePattern(cls: LineClassification): boolean {
  switch (cls.kind) {
    case 'checkbox-checked':
    case 'checkbox-unchecked':
      return cls.content.trim().length > 0;
    case 'memo-link':
      return true;
    default:
      return false;
  }
}

export type LineGroup =
  | { type: 'line'; key: number; line: EditorLine; cls: LineClassification }
  | {
      type: 'code';
      key: number;
      open: EditorLine;
      body: EditorLine[];
      close: EditorLine | null;
      language: string;
    };

/**
 * 2차 패스: 코드펜스 open~close 를 하나의 멀티라인 그룹으로 묶는다.
 * 그룹 본문(body)은 Monaco 가 통째로 소유하며 라인 편집 대상이 아니다.
 */
export function buildLineGroups(lines: EditorLine[]): LineGroup[] {
  const groups: LineGroup[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (isCodeFence(line.text)) {
      const language = fenceLanguage(line.text);
      const body: EditorLine[] = [];
      i++;

      while (i < lines.length && !isCodeFence(lines[i].text)) {
        body.push(lines[i]);
        i++;
      }

      const close = i < lines.length ? lines[i] : null;
      groups.push({ type: 'code', key: line.id, open: line, body, close, language });
      continue;
    }

    groups.push({ type: 'line', key: line.id, line, cls: classifyLine(line.text) });
  }

  return groups;
}

/** 라인 단위 편집이 허용되는 id 집합. 코드 그룹은 펜스 라인만 편집 가능하다. */
export function editableLineIds(groups: LineGroup[]): Set<number> {
  const ids = new Set<number>();

  for (const group of groups) {
    if (group.type === 'line') {
      ids.add(group.line.id);
      continue;
    }

    ids.add(group.open.id);
    if (group.close) {
      ids.add(group.close.id);
    }
  }

  return ids;
}

export function linesToText(lines: EditorLine[]): string {
  return lines.map((line) => line.text).join('\n');
}

function groupsToBlocks(groups: LineGroup[]): ContentBlockInterface[] {
  return groups.map((group): ContentBlockInterface => {
    if (group.type === 'code') {
      return {
        type: 'code',
        content: linesToText(group.body),
        metadata: { language: group.language },
      };
    }

    switch (group.cls.kind) {
      case 'checkbox-checked':
      case 'checkbox-unchecked':
        return {
          type: 'checkbox',
          content: group.cls.content,
          metadata: { checked: group.cls.checked, indent: group.cls.indent },
        };
      case 'memo-link':
        return {
          type: 'memo-link',
          content: group.cls.content,
          metadata: {
            memoId: group.cls.memoId,
            memoTitle: group.cls.memoTitle,
            indent: group.cls.indent,
          },
        };
      default:
        return {
          type: 'text',
          content: group.cls.content,
          metadata: { indent: group.cls.indent },
        };
    }
  });
}

/**
 * 개발용 검증: 신규 분류기(`classifyLine` + `buildLineGroups`)가 기존 `parseContent` 와
 * 같은 케이스 판정을 내리는지 대조한다. `parseContent` 는 ArticleDetail 이 계속 사용하므로
 * 두 경로가 갈라지면 렌더가 달라진다 — 프로덕션 번들에서는 호출부에서 제거된다.
 */
export function assertClassifierMatchesParseContent(lines: EditorLine[]): void {
  const expected = parseContent(linesToText(lines));
  const actual = groupsToBlocks(buildLineGroups(lines));

  if (expected.length !== actual.length) {
    console.warn(
      `[inline-editor] classifier/parseContent 블록 수 불일치: parseContent=${expected.length}, classifier=${actual.length}`,
    );
    return;
  }

  for (let i = 0; i < expected.length; i++) {
    const a = expected[i];
    const b = actual[i];

    if (
      a.type !== b.type ||
      a.content !== b.content ||
      Boolean(a.metadata?.checked) !== Boolean(b.metadata?.checked) ||
      (a.metadata?.indent ?? 0) !== (b.metadata?.indent ?? 0)
    ) {
      console.warn('[inline-editor] classifier/parseContent 판정 불일치', {
        index: i,
        parseContent: a,
        classifier: b,
      });
      return;
    }
  }
}
