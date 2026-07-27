'use client';

import Icon from '@/components/ui/Icon';
import {
  CheckboxBlock,
  MarkdownBlock,
  StaticCodeBlock,
} from '@/components/editor/blocks/ContentBlocks';
import { parseContent } from '@/lib/utils';
import type { ArticleInterface, ContentBlockInterface } from '@/lib/types';

interface ArticleDetailProps {
  article: ArticleInterface;
  onBack: () => void;
}

export function ArticleDetail({ article, onBack }: ArticleDetailProps) {
  const publishedDate = new Date(article.publishedAt).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const createdDate = new Date(article.createdAt).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const renderContent = () => {
    const blocks = parseContent(article.content || '') as ContentBlockInterface[];

    return blocks.map((block, index) => {
      switch (block.type) {
        case 'checkbox':
          return (
            <div key={index} className="my-1">
              <CheckboxBlock checked={block.metadata?.checked || false} content={block.content} />
            </div>
          );

        case 'code':
          return (
            <StaticCodeBlock key={index} code={block.content} language={block.metadata?.language} />
          );

        case 'memo-link':
          return (
            <MarkdownBlock key={index} className="my-2">
              {block.content}
            </MarkdownBlock>
          );

        case 'text':
        default:
          if (block.content.trim() === '') {
            return <br key={index} />;
          }
          return (
            <MarkdownBlock key={index} className="article-markdown">
              {block.content}
            </MarkdownBlock>
          );
      }
    });
  };

  return (
    <div>
      {/* 뒤로가기 */}
      <button
        onClick={onBack}
        className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-8"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        목록으로
      </button>

      {/* 헤더 */}
      <div className="mb-10">
        <div className="flex items-center gap-3 mb-4">
          <span className="w-6 h-6 flex items-center justify-center">
            <Icon icon={article.projectIcon || 'Coffee'} />
          </span>
          <span className="text-sm text-gray-400">{article.projectName}</span>
          {article.isSecret && <span className="text-sm">🔒</span>}
          <span className="ml-auto text-xs px-3 py-1 rounded-full bg-white/5 border border-white/10 text-gray-400">
            v{article.publishedVersion}
          </span>
        </div>

        <h1 className="text-3xl md:text-4xl font-bold text-white mb-4">
          {article.title}
        </h1>

        <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500">
          <span>작성일 {createdDate}</span>
          <span className="w-1 h-1 rounded-full bg-gray-600" />
          <span>게시일 {publishedDate}</span>
        </div>
      </div>

      {/* 구분선 */}
      <div className="border-t border-white/10 mb-10" />

      {/* 본문 */}
      <div className="prose prose-invert prose-sm max-w-none text-gray-300 leading-relaxed">
        {renderContent()}
      </div>
    </div>
  );
}
