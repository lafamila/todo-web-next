'use client';

import Icon from '@/components/ui/Icon';
import { formatDate } from '@/lib/utils';
import type { ArticleListItemInterface } from '@/lib/types';

interface ArticleListProps {
  articles: ArticleListItemInterface[];
  onSelect: (article: ArticleListItemInterface) => void;
}

export function ArticleList({ articles, onSelect }: ArticleListProps) {
  if (articles.length === 0) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-500 text-lg">게시된 글이 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {articles.map((article) => (
        <button
          key={article.id}
          onClick={() => onSelect(article)}
          className="text-left p-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm hover:bg-white/10 hover:border-white/20 transition-all cursor-pointer group"
        >
          {/* 프로젝트 정보 */}
          <div className="flex items-center gap-2 mb-3">
            {article.projectIcon && (
              <Icon icon={article.projectIcon} />
            )}
            <span className="text-sm text-gray-400">
              {article.projectName}
            </span>
            {article.isSecret && (
              <span className="text-xs">🔒</span>
            )}
          </div>

          {/* 제목 */}
          <h3 className="text-lg font-bold text-white mb-3 group-hover:text-[#3994ef] transition-colors line-clamp-2">
            {article.title}
          </h3>

          {/* 메타 정보 */}
          <div className="flex items-center justify-between text-sm text-gray-500">
            <span>{formatDate(article.publishedAt)}</span>
            <span className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-xs text-gray-400">
              v{article.publishedVersion}
            </span>
          </div>
        </button>
      ))}
    </div>
  );
}
