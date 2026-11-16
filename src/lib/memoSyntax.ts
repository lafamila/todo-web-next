import { splitBracketBold } from "./bracketBold.ts";

export type MemoLineKind = "plain" | "bullet" | "rule" | "strike";

export interface MemoLineSyntax {
  kind: MemoLineKind;
  /** 화면과 원문에서 모두 유지되는 선행 공백. */
  indent: string;
  /** 화면에서 표현은 바뀌지만 원문 폭을 예약해야 하는 접두사. */
  prefix: string;
  content: string;
}

const TASK_BULLET_PATTERN = /^-\s+\[(?: |x|X)\](?:\s|$)/u;
const ANY_TASK_PATTERN = /^(?:[-*+] |\d+[.)] )\[(?: |x|X)\](?:\s|$)/u;
const REFERENCE_DEFINITION_PATTERN = /^\[(?:\^)?[^\]\n]+\]:/u;

/**
 * Todo 본문에서 의도적으로 지원하는 줄 문법만 판별한다.
 * Markdown parser에 원문 전체를 넘기지 않으므로 여기 없는 표기는 모두 평문이다.
 */
export function analyzeMemoLine(source: string): MemoLineSyntax {
  const indent = source.match(/^[ \t]*/u)?.[0] ?? "";
  const body = source.slice(indent.length);

  if (body === "---") return { kind: "rule", indent, prefix: "", content: "" };
  if (body.startsWith("//")) {
    return { kind: "strike", indent, prefix: "//", content: body.slice(2) };
  }
  if (body.startsWith("- ") && !TASK_BULLET_PATTERN.test(body)) {
    return { kind: "bullet", indent, prefix: "- ", content: body.slice(2) };
  }
  return { kind: "plain", indent, prefix: "", content: body };
}

/** 제거한 task/reference 문법은 안쪽 표기까지 다른 인라인 문법으로 재해석하지 않는다. */
export function shouldBypassMemoInline(source: string): boolean {
  return ANY_TASK_PATTERN.test(source) || REFERENCE_DEFINITION_PATTERN.test(source);
}

export type MemoInlineToken =
  | { type: "text" | "strong" | "code"; value: string }
  | { type: "link" | "image"; value: string; target: string };

const EMAIL_PATTERN = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu;
const URL_PATTERN = /^(?:https?:\/\/|www\.)[^\s<>]+/iu;

function trimAutolinkPunctuation(value: string): string {
  let end = value.length;
  while (end > 0 && /[.,!?;:]/u.test(value[end - 1])) end--;
  while (end > 0 && value[end - 1] === ")") {
    const candidate = value.slice(0, end);
    const opens = (candidate.match(/\(/gu) ?? []).length;
    const closes = (candidate.match(/\)/gu) ?? []).length;
    if (closes <= opens) break;
    end--;
  }
  return value.slice(0, end);
}

function appendText(tokens: MemoInlineToken[], value: string): void {
  if (!value) return;
  const previous = tokens[tokens.length - 1];
  if (previous?.type === "text") previous.value += value;
  else tokens.push({ type: "text", value });
}

function appendBracketText(tokens: MemoInlineToken[], value: string): void {
  for (const part of splitBracketBold(value)) {
    if (!part.text) continue;
    if (part.bold) tokens.push({ type: "strong", value: part.text });
    else appendText(tokens, part.text);
  }
}

interface ParsedInlineDestination {
  target: string;
  end: number;
}

function parseInlineDestination(source: string, openAt: number): ParsedInlineDestination | null {
  let index = openAt + 1;
  let target = "";

  if (source[index] === "<") {
    const closeAngle = source.indexOf(">", index + 1);
    if (closeAngle < 0) return null;
    target = source.slice(index + 1, closeAngle);
    index = closeAngle + 1;
  } else {
    const start = index;
    let nested = 0;
    while (index < source.length) {
      const char = source[index];
      if (char === "\n" || char === "\r") return null;
      if (/\s/u.test(char) && nested === 0) break;
      if (char === "(") nested++;
      if (char === ")") {
        if (nested === 0) break;
        nested--;
      }
      index++;
    }
    if (nested !== 0) return null;
    target = source.slice(start, index);
  }

  while (index < source.length && /[ \t]/u.test(source[index])) index++;
  if (source[index] === ")") return target ? { target, end: index } : null;

  const quote = source[index];
  const titleClose = quote === "(" ? ")" : quote;
  if (quote !== "\"" && quote !== "'" && quote !== "(") return null;
  index++;
  while (index < source.length && source[index] !== titleClose) {
    if (source[index] === "\n" || source[index] === "\r") return null;
    index++;
  }
  if (source[index] !== titleClose) return null;
  index++;
  while (index < source.length && /[ \t]/u.test(source[index])) index++;
  return source[index] === ")" && target ? { target, end: index } : null;
}

function findLinkLabelEnd(source: string, labelStart: number): number {
  for (let index = labelStart; index < source.length; index++) {
    if (source[index] === "[" || source[index] === "\n" || source[index] === "\r") return -1;
    if (source[index] === "]") return source[index + 1] === "(" ? index : -1;
  }
  return -1;
}

function findSingleBacktick(source: string, start: number): number {
  for (let index = start; index < source.length; index++) {
    if (
      source[index] === "`" &&
      source[index - 1] !== "`" &&
      source[index + 1] !== "`"
    ) return index;
  }
  return -1;
}

/**
 * Markdown 전체 문법 대신 사용자가 남긴 인라인 문법만 토큰화한다.
 * HTML/entity/escape를 해석하지 않으며 반환 문자열은 React text node로만 그린다.
 */
interface InlineTokenOptions {
  code: boolean;
  images: boolean;
  autolinks: boolean;
}

function tokenizeMemoInlineWithOptions(
  source: string,
  options: InlineTokenOptions,
): MemoInlineToken[] {
  const tokens: MemoInlineToken[] = [];
  let plain = "";
  let index = 0;

  const flush = () => {
    appendBracketText(tokens, plain);
    plain = "";
  };

  while (index < source.length) {
    const imageStart = source.startsWith("![", index);
    const linkStart = source[index] === "[";
    if (imageStart || linkStart) {
      const labelStart = index + (imageStart ? 2 : 1);
      const labelEnd = findLinkLabelEnd(source, labelStart);
      if (labelEnd >= 0) {
        const destination = parseInlineDestination(source, labelEnd + 1);
        if (destination) {
          const raw = source.slice(index, destination.end + 1);
          const safeTarget = safeMemoLinkTarget(destination.target);
          if (!safeTarget || (imageStart && options.images === false)) {
            if (!safeTarget) {
              plain += raw;
              index = destination.end + 1;
              continue;
            }
          } else {
          flush();
          tokens.push({
            type: imageStart ? "image" : "link",
            value: source.slice(labelStart, labelEnd),
            target: safeTarget,
          });
          index = destination.end + 1;
          continue;
          }
        }
      }
    }

    if (options.code && source[index] === "`" && source[index - 1] !== "`" && source[index + 1] !== "`") {
      const close = findSingleBacktick(source, index + 1);
      if (close > index + 1) {
        flush();
        tokens.push({ type: "code", value: source.slice(index + 1, close) });
        index = close + 1;
        continue;
      }
    }

    if (options.autolinks && source[index] === "<") {
      const close = source.indexOf(">", index + 1);
      if (close > index + 1) {
        const target = source.slice(index + 1, close);
        if (/^https?:\/\//iu.test(target) || EMAIL_PATTERN.test(target)) {
          flush();
          tokens.push({
            type: "link",
            value: target,
            target: EMAIL_PATTERN.test(target) ? `mailto:${target}` : target,
          });
          index = close + 1;
          continue;
        }
      }
    }

    const tail = source.slice(index);
    const url = options.autolinks ? tail.match(URL_PATTERN)?.[0] : undefined;
    if (url) {
      const visible = trimAutolinkPunctuation(url);
      if (visible) {
        flush();
        tokens.push({
          type: "link",
          value: visible,
          target: visible.startsWith("www.") ? `https://${visible}` : visible,
        });
        index += visible.length;
        continue;
      }
    }

    const email = options.autolinks ? tail.match(EMAIL_PATTERN)?.[0] : undefined;
    if (email) {
      flush();
      tokens.push({ type: "link", value: email, target: `mailto:${email}` });
      index += email.length;
      continue;
    }

    plain += source[index];
    index++;
  }

  flush();
  return tokens;
}

export function tokenizeMemoInline(source: string): MemoInlineToken[] {
  return tokenizeMemoInlineWithOptions(source, { code: true, images: true, autolinks: true });
}

/** 앱 체크박스 payload의 기존 계약: `[text]` 강조와 명시 링크만 허용한다. */
export function tokenizeCheckboxInline(source: string): MemoInlineToken[] {
  return tokenizeMemoInlineWithOptions(source, { code: false, images: false, autolinks: false });
}

export function safeMemoLinkTarget(target: string): string | null {
  const value = target.trim();
  if (!value || value !== target || /[\u0000-\u001f\u007f\s]/u.test(value)) return null;

  const scheme = /^([a-z][a-z\d+.-]*):/iu.exec(value)?.[1]?.toLowerCase();
  if (!scheme) return value;
  if (scheme !== "http" && scheme !== "https" && scheme !== "mailto") return null;

  try {
    new URL(value);
    return value;
  } catch {
    return null;
  }
}

interface TextPosition {
  line: number;
  column: number;
}

function positionAt(text: string, offset: number): TextPosition {
  const safe = Math.max(0, Math.min(offset, text.length));
  const before = text.slice(0, safe);
  const line = (before.match(/\n/gu) ?? []).length;
  const lastBreak = before.lastIndexOf("\n");
  return { line, column: safe - lastBreak - 1 };
}

function offsetAt(lines: readonly string[], position: TextPosition): number {
  let offset = 0;
  for (let index = 0; index < position.line; index++) offset += lines[index].length + 1;
  return offset + Math.min(position.column, lines[position.line]?.length ?? 0);
}

function mapColumn(column: number, indentLength: number, remove: boolean): number {
  if (!remove) return column >= indentLength ? column + 2 : column;
  if (column <= indentLength) return column;
  if (column <= indentLength + 2) return indentLength;
  return column - 2;
}

export interface SlashStrikeToggleResult {
  text: string;
  selectionStart: number;
  selectionEnd: number;
  changed: boolean;
}

/** Cmd/Ctrl+/가 현재 줄 또는 선택한 줄들의 `//` 접두사를 한 이력 단위로 토글할 때 쓴다. */
export function toggleSlashStrikeRange(
  text: string,
  selectionStart: number,
  selectionEnd: number,
): SlashStrikeToggleResult {
  const start = positionAt(text, Math.min(selectionStart, selectionEnd));
  const end = positionAt(text, Math.max(selectionStart, selectionEnd));
  const lines = text.split("\n");
  const lastTouched = end.column === 0 && end.line > start.line ? end.line - 1 : end.line;
  const touched = Array.from(
    { length: Math.max(0, lastTouched - start.line + 1) },
    (_, offset) => start.line + offset,
  ).filter((line) => lines[line]?.trim().length > 0);

  if (touched.length === 0) {
    return { text, selectionStart, selectionEnd, changed: false };
  }

  const remove = touched.every((line) => {
    const indentLength = lines[line].match(/^[ \t]*/u)?.[0].length ?? 0;
    return lines[line].startsWith("//", indentLength);
  });
  const changedLines = new Set(touched);
  const nextLines = lines.map((line, lineIndex) => {
    if (!changedLines.has(lineIndex)) return line;
    const indentLength = line.match(/^[ \t]*/u)?.[0].length ?? 0;
    return remove
      ? line.slice(0, indentLength) + line.slice(indentLength + 2)
      : line.slice(0, indentLength) + "//" + line.slice(indentLength);
  });

  const mapPosition = (position: TextPosition): TextPosition => {
    if (!changedLines.has(position.line)) return position;
    const indentLength = lines[position.line].match(/^[ \t]*/u)?.[0].length ?? 0;
    return { ...position, column: mapColumn(position.column, indentLength, remove) };
  };
  const mappedStart = mapPosition(positionAt(text, selectionStart));
  const mappedEnd = mapPosition(positionAt(text, selectionEnd));

  return {
    text: nextLines.join("\n"),
    selectionStart: offsetAt(nextLines, mappedStart),
    selectionEnd: offsetAt(nextLines, mappedEnd),
    changed: true,
  };
}
