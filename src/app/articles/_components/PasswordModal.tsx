'use client';

import { useState } from 'react';

interface PasswordModalProps {
  isOpen: boolean;
  onVerify: (password: string) => Promise<boolean>;
  onClose: () => void;
}

export function PasswordModal({ isOpen, onVerify, onClose }: PasswordModalProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const verified = await onVerify(password);
      if (!verified) {
        setError('비밀번호가 올바르지 않습니다.');
      }
    } catch {
      setError('비밀번호 검증에 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-full max-w-sm mx-4 p-6 rounded-2xl bg-gray-900 border border-white/10">
        <h2 className="text-lg font-semibold text-white mb-2">🔒 비밀 프로젝트</h2>
        <p className="text-sm text-gray-400 mb-6">
          이 게시글은 비밀 프로젝트에 속해 있습니다. 비밀번호를 입력해주세요.
        </p>

        <form onSubmit={handleSubmit}>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="비밀번호"
            autoFocus
            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-[#3994ef] transition-colors"
          />

          {error && (
            <p className="mt-2 text-sm text-red-400">{error}</p>
          )}

          <div className="flex gap-3 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 bg-white/5 border border-white/10 text-white font-medium rounded-full hover:bg-white/10 transition-colors"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={isLoading || !password}
              className="flex-1 px-4 py-3 bg-white text-black font-semibold rounded-full hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? '확인 중...' : '확인'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
