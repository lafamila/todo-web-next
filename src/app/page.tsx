'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { AppProvider } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Button';
import * as api from '@/lib/api';
import { consumePostLoginRedirect } from '@/lib/auth';
import MemoListSection from './todo/_components/MemoListSection';
import ProjectSection from './todo/_components/ProjectSection';
import ScreenShare from './todo/_components/ScreenShare';

function TodoHomeContent() {
  const { user, logout } = useAuth();
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'submitted'>('idle');
  const [error, setError] = useState('');

  if (user?.permission === 'visitor') {
    const isSubmitting = status === 'submitting';
    const isSubmitted = status === 'submitted';

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setError('');
      setStatus('submitting');

      try {
        await api.requestTodoServiceAccess(message.trim());
        setStatus('submitted');
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : '사용 신청에 실패했습니다.';
        setError(errorMessage);
        setStatus('idle');
      }
    };

    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-10 bg-gray-950">
        <section className="w-full max-w-lg rounded-lg border border-gray-800 bg-gray-900 p-8 shadow-2xl">
          <div className="mb-8">
            <p className="text-sm font-medium text-indigo-300">TODO</p>
            <h1 className="mt-2 text-2xl font-bold text-white">사용 신청하기</h1>
            <p className="mt-3 text-sm leading-6 text-gray-400">
              현재 계정은 방문자 권한입니다. TODO 서비스를 사용하려면 관리자 승인이 필요합니다.
            </p>
          </div>

          {isSubmitted ? (
            <div className="space-y-6">
              <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                신청이 접수되었습니다. 승인 후 다시 로그인하면 TODO를 사용할 수 있습니다.
              </div>
              <Button
                type="button"
                onClick={() => void logout()}
                className="w-full rounded-lg bg-gray-800 py-2.5 text-white hover:bg-gray-700"
              >
                로그아웃
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  신청 메시지
                </label>
                <textarea
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  rows={5}
                  placeholder="사용 목적을 간단히 남겨주세요"
                  className="w-full resize-none rounded-lg border border-gray-700 bg-gray-950 px-3 py-2.5 text-sm text-white outline-none transition-colors placeholder:text-gray-500 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/30"
                />
              </div>

              {error && <p className="text-sm text-red-400">{error}</p>}

              <div className="flex flex-col gap-3 sm:flex-row">
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 rounded-lg bg-indigo-600 py-2.5 text-white hover:bg-indigo-500"
                >
                  {isSubmitting ? '신청 중...' : '사용 신청하기'}
                </Button>
                <Button
                  type="button"
                  onClick={() => void logout()}
                  disabled={isSubmitting}
                  className="flex-1 rounded-lg bg-gray-800 py-2.5 text-white hover:bg-gray-700"
                >
                  로그아웃
                </Button>
              </div>
            </form>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <ProjectSection />
      <MemoListSection />
      <ScreenShare />
    </div>
  );
}

export default function IndexPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/login');
      return;
    }

    if (!isLoading && isAuthenticated) {
      const redirectTo = consumePostLoginRedirect('/');
      if (redirectTo !== '/') {
        router.replace(redirectTo);
      }
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <span className="text-gray-400">Loading...</span>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <AppProvider>
      <TodoHomeContent />
    </AppProvider>
  );
}
