'use client';

import { Fragment, type AnchorHTMLAttributes, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import { remarkBracketBold, splitBracketBold } from '@/lib/bracketBold';
import { cn } from '@/lib/utils';

/**
 * 메모 본문 블록의 단일 표현.
 * 인라인 에디터의 rendered 라인과 게시글 뷰(ArticleDetail)가 같은 컴포넌트를 쓰므로
 * 편집 화면과 읽기 화면의 시각이 갈라지지 않는다 (워크스페이스 원칙 9).
 */

export const CONTENT_MARKDOWN_PLUGINS = [remarkGfm, remarkBreaks, remarkBracketBold];

/** 본문 링크의 단일 표현 — 마크다운 경로와 경량 렌더러가 같은 앵커를 쓴다. */
function ContentLink({
  href,
  children,
  ...props
}: { href?: string } & AnchorHTMLAttributes<HTMLAnchorElement>) {
  const isMemoLink = Boolean(href && (href.includes('memoId=') || href.startsWith('?')));
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn('hover:underline', isMemoLink ? 'text-white' : 'text-blue-300')}
      {...props}
    >
      {children}
    </a>
  );
}

/** `[텍스트](URL)` — 마크다운을 통과하지 않는 표면에서만 필요한 최소 링크 문법. */
const INLINE_LINK_PATTERN = /\[([^[\]\n]*)\]\(([^()\s]+)\)/g;

function boldNodes(text: string, keyPrefix: string) {
  return splitBracketBold(text).map((part, index) =>
    part.bold ? (
      <strong key={`${keyPrefix}-${index}`}>{part.text}</strong>
    ) : (
      <Fragment key={`${keyPrefix}-${index}`}>{part.text}</Fragment>
    ),
  );
}

/**
 * `[텍스트]` 강조 + `[텍스트](URL)` 링크만 적용하는 경량 인라인 렌더러.
 * 체크박스 내용은 마크다운을 통과하지 않으므로(원문 그대로를 span 에 넣는다) 이 표면이 본문과
 * 같은 규칙을 쓰게 하는 유일한 경로다. 전체 마크다운을 돌리지 않는 이유는 기존 체크박스 내용의
 * `*`·`#`·`_` 가 갑자기 서식으로 해석되는 걸 막기 위함이다.
 */
export function InlineMarks({ text }: { text: string }) {
  const pattern = new RegExp(INLINE_LINK_PATTERN.source, 'g');
  const nodes: ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) nodes.push(...boldNodes(text.slice(last, match.index), `t${last}`));
    nodes.push(
      <ContentLink key={`l${match.index}`} href={match[2]}>
        {match[1]}
      </ContentLink>,
    );
    last = match.index + match[0].length;
  }

  if (last < text.length || nodes.length === 0) {
    nodes.push(...boldNodes(text.slice(last), `t${last}`));
  }

  return <>{nodes}</>;
}

export const contentMarkdownComponents: Components = {
  a: ({ href, children, ...props }) => (
    <ContentLink href={href} {...props}>
      {children}
    </ContentLink>
  ),
  ol: ({ children, ...props }) => (
    <ol className="my-1 list-decimal pl-6 marker:text-white" {...props}>
      {children}
    </ol>
  ),
  ul: ({ children, ...props }) => (
    <ul className="my-1 list-disc pl-6 marker:text-white" {...props}>
      {children}
    </ul>
  ),
  li: ({ children, ...props }) => (
    <li className="pl-1" {...props}>
      {children}
    </li>
  ),
};

export interface MarkdownBlockProps {
  children: string;
  className?: string;
}

export function MarkdownBlock({ children, className }: MarkdownBlockProps) {
  return (
    <div className={className}>
      <ReactMarkdown remarkPlugins={CONTENT_MARKDOWN_PLUGINS} components={contentMarkdownComponents}>
        {children}
      </ReactMarkdown>
    </div>
  );
}

export interface CheckboxBlockProps {
  checked: boolean;
  content: string;
  /** 없으면 읽기 전용 체크박스로 렌더된다. */
  onToggle?: () => void;
}

export function CheckboxBlock({ checked, content, onToggle }: CheckboxBlockProps) {
  const interactive = Boolean(onToggle);

  return (
    <div className="flex items-start gap-2">
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        aria-label={content}
        disabled={!interactive}
        // 체크박스 글리프 클릭은 토글만 — 상위의 편집 진입으로 전파되지 않는다.
        onMouseDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onToggle?.();
        }}
        className={cn(
          'mt-[0.3em] flex h-3 w-3 shrink-0 items-center justify-center rounded-[2px] border transition-colors',
          checked ? 'border-[#3994ef] bg-[#3994ef] text-white' : 'border-white/40 bg-transparent',
          interactive ? 'cursor-pointer hover:border-[#3994ef]' : 'cursor-default',
        )}
      >
        {checked && (
          <svg className="h-2.5 w-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>
      <span className={cn('flex-1', checked && 'text-gray-500 line-through')}>
        <InlineMarks text={content} />
      </span>
    </div>
  );
}

export interface StaticCodeBlockProps {
  code: string;
  language?: string;
}

export function StaticCodeBlock({ code, language }: StaticCodeBlockProps) {
  return (
    <div className="my-4">
      <div className="flex items-center justify-between rounded-t-xl border border-white/10 bg-white/5 px-4 py-2">
        <span className="font-mono text-xs text-gray-500">{language || 'code'}</span>
      </div>
      <pre className="overflow-x-auto rounded-b-xl border border-t-0 border-white/10 bg-white/[0.03] px-4 py-3">
        <code className="whitespace-pre font-mono text-sm text-gray-300">{code}</code>
      </pre>
    </div>
  );
}
