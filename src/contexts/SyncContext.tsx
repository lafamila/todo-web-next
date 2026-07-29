'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from './AuthContext';
import * as api from '@/lib/api';
import type {
  SyncIssueInterface,
  SyncStatusInterface,
} from '@/lib/types';

type SyncDisplayState = 'online' | 'offline' | 'paused' | 'blocked';

interface SyncContextValue {
  status: SyncStatusInterface | null;
  issues: SyncIssueInterface[];
  displayState: SyncDisplayState;
  isOnline: boolean;
  canMerge: boolean;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  resolveIssues: (issueIds: string[]) => Promise<void>;
  findIssue: (table: string, id: string) => SyncIssueInterface | undefined;
  findIssues: (table: string, id: string) => SyncIssueInterface[];
}

const SyncContext = createContext<SyncContextValue | null>(null);

const isBlockingIssue = (issue: SyncIssueInterface) =>
  issue.kind === 'identity' || issue.kind === 'schema' || issue.kind === 'clock';

export function SyncProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [status, setStatus] = useState<SyncStatusInterface | null>(null);
  const [issues, setIssues] = useState<SyncIssueInterface[]>([]);
  const [browserOnline, setBrowserOnline] = useState(true);
  const [requestFailed, setRequestFailed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const statusResult = await Promise.allSettled([
      api.getSyncStatus(),
      user?.isAdmin ? api.getSyncIssues() : Promise.resolve({ issues: [], counts: {} }),
    ]);
    const [nextStatus, nextIssues] = statusResult;

    if (nextStatus.status === 'fulfilled') {
      setStatus(nextStatus.value);
      setRequestFailed(false);
      setError(null);
    } else {
      setRequestFailed(true);
      setError(
        nextStatus.reason instanceof Error
          ? nextStatus.reason.message
          : '동기화 상태를 확인하지 못했습니다.',
      );
    }

    if (nextIssues.status === 'fulfilled') {
      setIssues(nextIssues.value.issues);
    } else if (user?.isAdmin) {
      setError(
        nextIssues.reason instanceof Error
          ? nextIssues.reason.message
          : '동기화 문제 목록을 확인하지 못했습니다.',
      );
    }
    setIsLoading(false);
  }, [user?.isAdmin]);

  useEffect(() => {
    setBrowserOnline(navigator.onLine);
    const updateOnline = () => {
      setBrowserOnline(navigator.onLine);
      if (navigator.onLine) void refresh();
    };
    window.addEventListener('online', updateOnline);
    window.addEventListener('offline', updateOnline);
    void refresh();
    const timer = window.setInterval(() => void refresh(), 10_000);
    return () => {
      window.removeEventListener('online', updateOnline);
      window.removeEventListener('offline', updateOnline);
      window.clearInterval(timer);
    };
  }, [refresh]);

  const isOnline =
    browserOnline &&
    !requestFailed &&
    Boolean(status) &&
    (status?.role !== 'client' || status.online);
  const displayState: SyncDisplayState = !isOnline
    ? 'offline'
    : status?.paused
      ? 'paused'
      : Boolean(status?.lastError) ||
          issues.some(isBlockingIssue) ||
          Boolean(
            status &&
              ((status.issues.identity ?? 0) +
                (status.issues.schema ?? 0) +
                (status.issues.clock ?? 0) >
                0),
          )
        ? 'blocked'
        : 'online';
  const canMerge =
    Boolean(status) &&
    isOnline &&
    !requestFailed &&
    status?.mergeLocked === false;

  const findIssues = useCallback(
    (table: string, id: string) =>
      issues.filter(
        (issue) =>
          issue.refTable === table &&
          (issue.refId === id || issue.peerRefId === id),
      ),
    [issues],
  );
  const findIssue = useCallback(
    (table: string, id: string) => findIssues(table, id)[0],
    [findIssues],
  );

  const resolveIssues = useCallback(
    async (issueIds: string[]) => {
      if (issueIds.length === 0) return;
      await api.resolveSyncIssues(issueIds);
      await refresh();
    },
    [refresh],
  );

  const value = useMemo(
    () => ({
      status,
      issues,
      displayState,
      isOnline,
      canMerge,
      isLoading,
      error,
      refresh,
      resolveIssues,
      findIssue,
      findIssues,
    }),
    [
      status,
      issues,
      displayState,
      isOnline,
      canMerge,
      isLoading,
      error,
      refresh,
      resolveIssues,
      findIssue,
      findIssues,
    ],
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync() {
  const context = useContext(SyncContext);
  if (!context) {
    throw new Error('useSync must be used within SyncProvider');
  }
  return context;
}
