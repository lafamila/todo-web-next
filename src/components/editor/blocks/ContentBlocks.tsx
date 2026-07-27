'use client';

import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';

/**
 * 메모 본문 블록의 단일 표현.
 * 인라인 에디터의 rendered 라인과 게시글 뷰(ArticleDetail)가 같은 컴포넌트를 쓰므로
 * 편집 화면과 읽기 화면의 시각이 갈라지지 않는다 (워크스페이스 원칙 9).
 */

export const CONTENT_MARKDOWN_PLUGINS = [remarkGfm, remarkBreaks];

export const contentMarkdownComponents: Components = {
  a: ({ href, children, ...props }) => {
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
  },
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
      <span className={cn('flex-1', checked && 'text-gray-500 line-through')}>{content}</span>
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
