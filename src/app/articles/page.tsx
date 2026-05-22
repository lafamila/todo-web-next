'use client';

import { Suspense, useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { getArticles, getArticle, verifyPassword } from '@/lib/api';
import type { ArticleInterface, ArticleListItemInterface } from '@/lib/types';
import { ProjectFilter } from './_components/ProjectFilter';
import { ArticleList } from './_components/ArticleList';
import { ArticleDetail } from './_components/ArticleDetail';
import { PasswordModal } from './_components/PasswordModal';

export default function ArticlesPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen">
          <main className="relative z-10 max-w-7xl mx-auto px-6 pt-32 pb-20">
            <div className="text-center py-20">
              <div className="inline-block w-8 h-8 border-2 border-white/20 border-t-[#3994ef] rounded-full animate-spin" />
            </div>
          </main>
        </div>
      }
    >
      <ArticlesPageContent />
    </Suspense>
  );
}

function ArticlesPageContent() {
  const searchParams = useSearchParams();
  const authorSlug = searchParams.get('authorSlug') || undefined;
  const [articles, setArticles] = useState<ArticleListItemInterface[]>([]);
  const [selectedArticle, setSelectedArticle] = useState<ArticleInterface | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [verifiedProjectIds, setVerifiedProjectIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 비밀번호 모달 상태
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [pendingArticle, setPendingArticle] = useState<ArticleListItemInterface | null>(null);

  // 게시글 목록 로드
  const loadArticles = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getArticles(undefined, authorSlug);
      setArticles(data);
    } catch {
      setError('게시글을 불러오는데 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  }, [authorSlug]);

  useEffect(() => {
    loadArticles();
  }, [loadArticles]);

  // 프로젝트 목록 (게시글 데이터에서 추출)
  const projects = useMemo(() => {
    const projectMap = new Map<string, { id: string; name: string; icon: string; count: number }>();

    articles.forEach((article) => {
      const existing = projectMap.get(article.projectId);
      if (existing) {
        existing.count++;
      } else {
        projectMap.set(article.projectId, {
          id: article.projectId,
          name: article.projectName || '알 수 없는 프로젝트',
          icon: article.projectIcon || 'Coffee',
          count: 1,
        });
      }
    });

    return Array.from(projectMap.values());
  }, [articles]);

  // 프로젝트 필터 적용
  const filteredArticles = useMemo(() => {
    if (!selectedProjectId) return articles;
    return articles.filter((a) => a.projectId === selectedProjectId);
  }, [articles, selectedProjectId]);

  // 게시글 선택 핸들러
  const handleSelectArticle = useCallback(
    async (article: ArticleListItemInterface) => {
      // 비밀 프로젝트이고 아직 검증하지 않은 경우
      if (article.isSecret && !verifiedProjectIds.has(article.projectId)) {
        setPendingArticle(article);
        setPasswordModalOpen(true);
        return;
      }

      // 상세 내용 로드
      try {
        const detail = await getArticle(article.id);
        setSelectedArticle(detail);
      } catch {
        setError('게시글을 불러오는데 실패했습니다.');
      }
    },
    [verifiedProjectIds],
  );

  // 비밀번호 검증 핸들러
  const handlePasswordVerify = useCallback(
    async (password: string): Promise<boolean> => {
      if (!pendingArticle) return false;

      const verified = await verifyPassword(pendingArticle.projectId, password);
      if (verified) {
        setVerifiedProjectIds((prev) => new Set([...prev, pendingArticle.projectId]));
        setPasswordModalOpen(false);

        // 검증 성공 후 게시글 로드
        try {
          const detail = await getArticle(pendingArticle.id);
          setSelectedArticle(detail);
        } catch {
          setError('게시글을 불러오는데 실패했습니다.');
        }

        setPendingArticle(null);
        return true;
      }

      return false;
    },
    [pendingArticle],
  );

  // 뒤로가기
  const handleBack = useCallback(() => {
    setSelectedArticle(null);
  }, []);

  // 비밀번호 모달 닫기
  const handlePasswordModalClose = useCallback(() => {
    setPasswordModalOpen(false);
    setPendingArticle(null);
  }, []);

  // 상세 보기
  if (selectedArticle) {
    return (
      <div className="min-h-screen">
        <main className="relative z-10 max-w-4xl mx-auto px-6 pt-32 pb-20">
          <ArticleDetail article={selectedArticle} onBack={handleBack} />
        </main>
      </div>
    );
  }

  // 목록 보기
  return (
    <div className="min-h-screen">
      <main className="relative z-10 max-w-7xl mx-auto px-6 pt-32 pb-20">
        {/* 헤더 */}
        <div className="mb-12">
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
            {authorSlug ? `${authorSlug}'s Articles` : 'Articles'}
          </h1>
          <p className="text-lg text-gray-400">게시된 메모를 확인하세요.</p>
        </div>

        {/* 에러 메시지 */}
        {error && (
          <div className="mb-8 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* 프로젝트 필터 */}
        {projects.length > 0 && (
          <div className="mb-8">
            <ProjectFilter
              projects={projects}
              selectedProjectId={selectedProjectId}
              onSelect={setSelectedProjectId}
              totalCount={articles.length}
            />
          </div>
        )}

        {/* 로딩 상태 */}
        {isLoading ? (
          <div className="text-center py-20">
            <div className="inline-block w-8 h-8 border-2 border-white/20 border-t-[#3994ef] rounded-full animate-spin" />
          </div>
        ) : (
          <ArticleList articles={filteredArticles} onSelect={handleSelectArticle} />
        )}
      </main>

      {/* 비밀번호 모달 */}
      <PasswordModal
        isOpen={passwordModalOpen}
        onVerify={handlePasswordVerify}
        onClose={handlePasswordModalClose}
      />
    </div>
  );
}
