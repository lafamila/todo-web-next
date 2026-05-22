'use client';

import { AppProvider } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import "./global.css";

export default function TodoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated, isLoading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    const isLoginPage = pathname === '/todo/login';

    if (!isAuthenticated && !isLoginPage) {
      router.replace('/todo/login');
    } else if (isAuthenticated && isLoginPage) {
      router.replace('/todo');
    }
  }, [isAuthenticated, isLoading, pathname, router]);

  // 로딩 중
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <span className="text-gray-400">Loading...</span>
      </div>
    );
  }

  // 비인증 상태에서 로그인 페이지가 아닌 경우 — 리다이렉트 대기
  const isLoginPage = pathname === '/todo/login';
  if (!isAuthenticated && !isLoginPage) {
    return null;
  }

  return <AppProvider>{children}</AppProvider>;
}
