'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import type { FeatureFlagsInterface, UserInterface } from '@/lib/types';
import * as api from '@/lib/api';
import { getAccessDeniedMessage } from '@/lib/auth';

// features 가 응답에 없으면(구버전 API·prod) 전부 노출한다 — prod 무변경 기본값.
const DEFAULT_FEATURES: FeatureFlagsInterface = {
  screenShare: true,
  articles: true,
  memberInvite: true,
};

interface AuthContextType {
  user: UserInterface | null;
  features: FeatureFlagsInterface;
  isLoading: boolean;
  isAuthenticated: boolean;
  accessDeniedMessage: string | null;
  clearAccessDeniedMessage: () => void;
  login: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserInterface | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [accessDeniedMessage, setAccessDeniedMessage] = useState<string | null>(null);

  // 페이지 로드 시 session cookie 기준으로 사용자 정보 복원
  useEffect(() => {
    const restoreSession = async () => {
      try {
        const userData = await api.getMe();
        setUser(userData);
        setAccessDeniedMessage(null);
      } catch (error) {
        setUser(null);
        setAccessDeniedMessage(getAccessDeniedMessage(error));
      } finally {
        setIsLoading(false);
      }
    };

    restoreSession();
  }, []);

  const login = useCallback(async () => {
    setAccessDeniedMessage(null);
    const { authorizeUrl } = await api.startLogin();
    window.location.assign(authorizeUrl);
  }, []);

  const logout = useCallback(async () => {
    await api.logout();
    setUser(null);
    setAccessDeniedMessage(null);
  }, []);

  const clearAccessDeniedMessage = useCallback(() => {
    setAccessDeniedMessage(null);
  }, []);

  const value: AuthContextType = {
    user,
    features: user?.features ?? DEFAULT_FEATURES,
    isLoading,
    isAuthenticated: !!user,
    accessDeniedMessage,
    clearAccessDeniedMessage,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
