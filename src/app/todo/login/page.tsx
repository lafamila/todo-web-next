'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) return;

    setError('');
    setIsSubmitting(true);

    try {
      await login(username, password);
      const redirectTo = searchParams.get('redirect') || '/todo';
      router.push(redirectTo);
    } catch (err) {
      const message = err instanceof Error ? err.message : '로그인에 실패했습니다.';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <div className="w-full max-w-sm p-8 bg-gray-900 rounded-2xl shadow-2xl border border-gray-800">
        <h1 className="text-2xl font-bold text-white mb-8 text-center tracking-wide">
          TODO
        </h1>

        <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              아이디
            </label>
            <Input
              value={username}
              onChange={setUsername}
              placeholder="아이디를 입력하세요"
              className="w-full outline-none bg-white border border-gray-200 rounded-lg px-3 py-2.5 text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-all"
              autoFocus
              autoComplete="off"
              name="teddy-login-id"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              비밀번호
            </label>
            <Input
              type="password"
              value={password}
              onChange={setPassword}
              placeholder="비밀번호를 입력하세요"
              className="w-full outline-none bg-white border border-gray-200 rounded-lg px-3 py-2.5 text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-all"
              autoComplete="new-password"
              name="teddy-login-pw"
            />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <Button
            type="submit"
            disabled={isSubmitting || !username.trim() || !password.trim()}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg py-2.5 font-medium transition-colors"
          >
            {isSubmitting ? '로그인 중...' : '로그인'}
          </Button>
        </form>
      </div>
    </div>
  );
}
