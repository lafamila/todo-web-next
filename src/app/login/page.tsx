'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Button';
import {
  consumePostLoginRedirect,
  getLoginErrorFromSearchParams,
  normalizePostLoginRedirect,
  rememberPostLoginRedirect,
} from '@/lib/auth';

function LoginPageContent() {
  const {
    login,
    isAuthenticated,
    isLoading,
    accessDeniedMessage,
    clearAccessDeniedMessage,
  } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const redirectTo = useMemo(
    () => normalizePostLoginRedirect(searchParams.get('redirect')),
    [searchParams]
  );
  const callbackError = useMemo(
    () => getLoginErrorFromSearchParams(new URLSearchParams(searchParams.toString())),
    [searchParams]
  );

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace(consumePostLoginRedirect(redirectTo));
    }
  }, [isAuthenticated, isLoading, redirectTo, router]);

  const handleLogin = async () => {
    rememberPostLoginRedirect(redirectTo);
    clearAccessDeniedMessage();
    setError('');
    setIsSubmitting(true);

    try {
      await login();
    } catch (err) {
      const message = err instanceof Error ? err.message : '로그인에 실패했습니다.';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const visibleError = error || callbackError || accessDeniedMessage;

  if (isLoading || isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950">
        <span className="text-gray-400">Loading...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <div className="w-full max-w-sm p-8 bg-gray-900 rounded-2xl shadow-2xl border border-gray-800">
        <h1 className="text-2xl font-bold text-white mb-8 text-center tracking-wide">
          TODO
        </h1>

        <div className="space-y-4">
          {visibleError && (
            <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {visibleError}
            </p>
          )}

          <Button
            type="button"
            onClick={() => void handleLogin()}
            disabled={isSubmitting}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg py-2.5 font-medium transition-colors"
          >
            {isSubmitting ? '로그인 중...' : '로그인'}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-950">
          <span className="text-gray-400">Loading...</span>
        </div>
      }
    >
      <LoginPageContent />
    </Suspense>
  );
}
