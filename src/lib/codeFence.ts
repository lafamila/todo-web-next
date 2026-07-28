/**
 * 코드펜스 문법과 언어 카탈로그.
 *
 * 읽기 전용 렌더(`parseContent` → ArticleDetail)와 인라인 에디터가 **같은 규칙**을 써야 하므로
 * 문법 판정은 여기에만 둔다. 한쪽만 고치면 두 렌더가 갈라진다.
 *
 * 지원 표기 (줄 전체가 펜스여야 하며 앞뒤 잡텍스트는 허용하지 않는다):
 *
 * ```            → 기본 언어(typescript)
 * ```java        → 마크다운 표준 표기. 기존 메모(```bash, ```typescript …) 호환용.
 * java```        → 언어를 앞에 쓰는 표기. **앞 단어가 지원 언어일 때만** 펜스로 본다
 *                  (아무 단어나 펜스가 되면 평범한 문장이 코드블록을 열어버린다).
 *
 * 알 수 없는 언어 토큰은 기본 언어로 떨어진다. 들여쓰기된 줄은 펜스가 아니다 —
 * 기존 메모에 설명문으로 적힌 "    ``` 를 타이핑하면 …" 같은 줄을 보호한다.
 */

export const CODE_FENCE_MARK = '```';
export const DEFAULT_CODE_LANGUAGE = 'typescript';

/** 선택 UI 에 노출하는 Monaco 언어 id 목록 (Monaco 기본 번들에 포함된 것만). */
export const CODE_LANGUAGES = [
  'typescript',
  'javascript',
  'python',
  'java',
  'kotlin',
  'swift',
  'go',
  'rust',
  'cpp',
  'csharp',
  'objective-c',
  'php',
  'ruby',
  'scala',
  'dart',
  'r',
  'perl',
  'lua',
  'sql',
  'mysql',
  'pgsql',
  'graphql',
  'html',
  'css',
  'scss',
  'less',
  'json',
  'yaml',
  'xml',
  'markdown',
  'ini',
  'dockerfile',
  'shell',
  'powershell',
  'bat',
  'protobuf',
  'plaintext',
] as const;

export type CodeLanguage = (typeof CODE_LANGUAGES)[number];

const CODE_LANGUAGE_SET = new Set<string>(CODE_LANGUAGES);

/** 흔한 별칭 → Monaco id. Monaco 에 없는 id 를 그대로 넘기면 하이라이팅이 꺼진다. */
const LANGUAGE_ALIASES: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  node: 'javascript',
  py: 'python',
  python3: 'python',
  rb: 'ruby',
  rs: 'rust',
  kt: 'kotlin',
  kts: 'kotlin',
  c: 'cpp',
  'c++': 'cpp',
  cxx: 'cpp',
  cc: 'cpp',
  hpp: 'cpp',
  'c#': 'csharp',
  cs: 'csharp',
  objc: 'objective-c',
  'obj-c': 'objective-c',
  golang: 'go',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  console: 'shell',
  shellscript: 'shell',
  ps1: 'powershell',
  pwsh: 'powershell',
  yml: 'yaml',
  md: 'markdown',
  mdx: 'markdown',
  text: 'plaintext',
  txt: 'plaintext',
  plain: 'plaintext',
  none: 'plaintext',
  htm: 'html',
  postgres: 'pgsql',
  postgresql: 'pgsql',
  docker: 'dockerfile',
  proto: 'protobuf',
  cmd: 'bat',
  batch: 'bat',
};

const LANGUAGE_TOKEN = '[A-Za-z0-9_+#.-]+';
// ```  /  ```java  — 마크다운 표준 표기 (줄 시작에 백틱, 언어 토큰은 최대 1개)
const SUFFIX_FENCE_PATTERN = new RegExp(`^${'```'}\\s*(${LANGUAGE_TOKEN})?\\s*$`);
// java``` — 언어를 앞에 쓰는 표기
const PREFIX_FENCE_PATTERN = new RegExp(`^(${LANGUAGE_TOKEN})${'```'}$`);

/** 지원 언어면 canonical Monaco id, 아니면 null. */
export function normalizeCodeLanguage(token: string | undefined | null): string | null {
  if (!token) return null;
  const lower = token.trim().toLowerCase();
  if (!lower) return null;
  const resolved = LANGUAGE_ALIASES[lower] ?? lower;
  return CODE_LANGUAGE_SET.has(resolved) ? resolved : null;
}

/** 지원 언어면 canonical id, 아니면 기본 언어. */
export function resolveCodeLanguage(token: string | undefined | null): string {
  return normalizeCodeLanguage(token) ?? DEFAULT_CODE_LANGUAGE;
}

/** 이 줄이 코드펜스인가 (여는 펜스·닫는 펜스 공통). */
export function isCodeFenceLine(text: string): boolean {
  if (SUFFIX_FENCE_PATTERN.test(text)) return true;
  const prefix = text.match(PREFIX_FENCE_PATTERN);
  return prefix !== null && normalizeCodeLanguage(prefix[1]) !== null;
}

/** 펜스 줄이 지정한 언어. 미지정·미지원이면 기본 언어. */
export function codeFenceLanguage(text: string): string {
  const prefix = text.match(PREFIX_FENCE_PATTERN);
  if (prefix) {
    const language = normalizeCodeLanguage(prefix[1]);
    if (language) return language;
  }

  const suffix = text.match(SUFFIX_FENCE_PATTERN);
  if (suffix) return resolveCodeLanguage(suffix[1]);

  return DEFAULT_CODE_LANGUAGE;
}

/**
 * 언어 → 여는 펜스 문자열. 기본 언어면 마크 그대로 두어 문서를 깔끔하게 유지한다.
 * (언어 선택 UI 가 문서에 되쓸 때 사용)
 */
export function formatCodeFence(language: string): string {
  const resolved = resolveCodeLanguage(language);
  return resolved === DEFAULT_CODE_LANGUAGE ? CODE_FENCE_MARK : `${resolved}${CODE_FENCE_MARK}`;
}
