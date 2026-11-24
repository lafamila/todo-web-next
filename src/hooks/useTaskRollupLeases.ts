'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';

import { SOCKET_BASE_URL, SOCKET_PATH } from '@/lib/constants';
import {
  canReportTaskRollupLeasesReady,
  nextTaskRollupLeaseAction,
  normalizeTaskRollupLeaseTargets,
  taskRollupLeaseIdsToRelease,
} from '@/lib/taskRollupLeasePolicy';
import type { TaskRollupLeaseInterface } from '@/lib/types';

export type TaskRollupLeaseState = 'idle' | 'acquiring' | 'ready' | 'denied';

interface LeaseGrant {
  memoId: string;
  token: string;
  renewAfterMs: number;
}

interface LeaseOperation {
  id: number;
  targets: string[];
  joined: Set<string>;
  lockRequested: Set<string>;
  grants: Map<string, LeaseGrant>;
  settled: boolean;
  resolve: (leases: TaskRollupLeaseInterface[]) => void;
  reject: (error: Error) => void;
}

interface UseTaskRollupLeasesOptions {
  onSourceUpdated?: () => void;
}

interface UseTaskRollupLeasesResult {
  state: TaskRollupLeaseState;
  message: string | null;
  acquire: (memoIds: string[]) => Promise<TaskRollupLeaseInterface[]>;
  release: () => void;
  watch: (memoIds: string[]) => void;
}

const RESPONSE_TIMEOUT_MS = 5_000;

export function useTaskRollupLeases({
  onSourceUpdated,
}: UseTaskRollupLeasesOptions = {}): UseTaskRollupLeasesResult {
  const socketRef = useRef<Socket | null>(null);
  const operationRef = useRef<LeaseOperation | null>(null);
  const operationSequenceRef = useRef(0);
  const responseTimerRef = useRef<number | null>(null);
  const renewTimersRef = useRef(new Map<string, number>());
  const renewResponseTimersRef = useRef(new Map<string, number>());
  const onSourceUpdatedRef = useRef(onSourceUpdated);
  const watchedMemoIdsRef = useRef(new Set<string>());
  const driveRef = useRef<() => void>(() => {});
  const failRef = useRef<(message: string) => void>(() => {});
  const [state, setState] = useState<TaskRollupLeaseState>('idle');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    onSourceUpdatedRef.current = onSourceUpdated;
  }, [onSourceUpdated]);

  const clearResponseTimer = useCallback(() => {
    if (responseTimerRef.current !== null) {
      window.clearTimeout(responseTimerRef.current);
      responseTimerRef.current = null;
    }
  }, []);

  const clearRenewTimers = useCallback(() => {
    renewTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    renewTimersRef.current.clear();
    renewResponseTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    renewResponseTimersRef.current.clear();
  }, []);

  const releaseOperation = useCallback((nextState: TaskRollupLeaseState = 'idle') => {
    const socket = socketRef.current;
    const operation = operationRef.current;
    operationRef.current = null;
    clearResponseTimer();
    clearRenewTimers();
    if (operation) {
      const acquired = taskRollupLeaseIdsToRelease(
        [...operation.grants.keys()],
        operation.targets,
      );
      acquired.forEach((memoId) => socket?.emit('unlockMemo', { memoId }));
      operation.joined.forEach((memoId) => {
        if (!watchedMemoIdsRef.current.has(memoId)) socket?.emit('leaveMemo', { memoId });
      });
      if (!operation.settled) {
        operation.settled = true;
        operation.reject(new Error('할 일 원본 잠금 요청이 취소되었습니다.'));
      }
    }
    setState(nextState);
    if (nextState === 'idle') setMessage(null);
  }, [clearRenewTimers, clearResponseTimer]);

  useEffect(() => {
    const socket = io(SOCKET_BASE_URL, {
      path: SOCKET_PATH,
      withCredentials: true,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1_000,
      reconnectionAttempts: 10,
    });
    socketRef.current = socket;

    const armResponseTimeout = (memoId: string, phase: 'join' | 'lock') => {
      clearResponseTimer();
      responseTimerRef.current = window.setTimeout(() => {
        responseTimerRef.current = null;
        const operation = operationRef.current;
        if (!operation || !operation.targets.includes(memoId)) return;
        failRef.current(
          phase === 'join'
            ? '원본 메모 확인 시간이 초과되었습니다.'
            : '원본 메모 편집 잠금 시간이 초과되었습니다.',
        );
      }, RESPONSE_TIMEOUT_MS);
    };

    const scheduleRenewal = (grant: LeaseGrant) => {
      const previous = renewTimersRef.current.get(grant.memoId);
      if (previous !== undefined) window.clearTimeout(previous);
      renewTimersRef.current.set(grant.memoId, window.setTimeout(() => {
        const operation = operationRef.current;
        if (!operation?.grants.has(grant.memoId) || !socket.connected) {
          failRef.current('원본 메모 편집 잠금 연결이 끊겼습니다.');
          return;
        }
        socket.emit('renewMemoLock', { memoId: grant.memoId });
        const watchdog = window.setTimeout(() => {
          renewResponseTimersRef.current.delete(grant.memoId);
          if (operationRef.current?.grants.has(grant.memoId)) {
            failRef.current('원본 메모 편집 잠금을 갱신하지 못했습니다.');
          }
        }, RESPONSE_TIMEOUT_MS);
        renewResponseTimersRef.current.set(grant.memoId, watchdog);
      }, grant.renewAfterMs));
    };

    const fail = (failureMessage: string) => {
      const operation = operationRef.current;
      if (!operation) return;
      operationRef.current = null;
      clearResponseTimer();
      clearRenewTimers();
      const acquired = taskRollupLeaseIdsToRelease(
        [...operation.grants.keys()],
        operation.targets,
      );
      acquired.forEach((memoId) => socket.emit('unlockMemo', { memoId }));
      operation.joined.forEach((memoId) => {
        if (!watchedMemoIdsRef.current.has(memoId)) socket.emit('leaveMemo', { memoId });
      });
      if (!operation.settled) {
        operation.settled = true;
        operation.reject(new Error(failureMessage));
      }
      setMessage(failureMessage);
      setState('denied');
    };
    failRef.current = fail;

    const drive = () => {
      const operation = operationRef.current;
      if (!operation) return;
      const action = nextTaskRollupLeaseAction({
        connected: socket.connected,
        targets: operation.targets,
        joined: [...operation.joined],
        lockRequested: [...operation.lockRequested],
        acquired: [...operation.grants.keys()],
      });
      if (action.type === 'join') {
        socket.emit('joinMemo', { memoId: action.memoId });
        armResponseTimeout(action.memoId, 'join');
        return;
      }
      if (action.type === 'lock') {
        operation.lockRequested.add(action.memoId);
        socket.emit('lockMemo', { memoId: action.memoId });
        armResponseTimeout(action.memoId, 'lock');
        return;
      }
      if (
        action.type === 'ready' &&
        canReportTaskRollupLeasesReady(operation.targets, [...operation.grants.keys()])
      ) {
        clearResponseTimer();
        setMessage(null);
        setState('ready');
        if (!operation.settled) {
          operation.settled = true;
          operation.resolve(operation.targets.map((memoId) => ({
            memoId,
            token: operation.grants.get(memoId)?.token ?? '',
          })));
        }
      }
    };
    driveRef.current = drive;

    socket.on('connect', () => {
      watchedMemoIdsRef.current.forEach((memoId) => socket.emit('joinMemo', { memoId }));
      drive();
    });
    socket.on('disconnect', () => {
      if (operationRef.current) fail('원본 메모 편집 잠금 연결이 끊겼습니다.');
    });
    socket.on('lockStatus', (data: {
      memoId: string;
      lockedBy: string | null;
      lockedByUserId: string | null;
      available?: boolean;
    }) => {
      const operation = operationRef.current;
      if (!operation || !operation.targets.includes(data.memoId) || operation.joined.has(data.memoId)) return;
      clearResponseTimer();
      operation.joined.add(data.memoId);
      if (data.available === false) {
        fail('원본 메모 잠금 서버를 확인할 수 없습니다.');
        return;
      }
      if (data.lockedBy || data.lockedByUserId) {
        fail(`${data.lockedBy || '다른 편집기'}에서 원본 메모를 편집 중입니다.`);
        return;
      }
      drive();
    });
    socket.on('lockAcquired', (data: {
      memoId: string;
      leaseToken: string;
      renewAfterMs?: number;
    }) => {
      const operation = operationRef.current;
      if (
        !operation ||
        !operation.targets.includes(data.memoId) ||
        !operation.lockRequested.has(data.memoId)
      ) {
        // A cancelled/failed operation may receive a late grant. This socket owns it,
        // so return only that late grant; no editor socket is touched.
        socket.emit('unlockMemo', { memoId: data.memoId });
        if (!watchedMemoIdsRef.current.has(data.memoId)) {
          socket.emit('leaveMemo', { memoId: data.memoId });
        }
        return;
      }
      clearResponseTimer();
      const grant = {
        memoId: data.memoId,
        token: data.leaseToken,
        renewAfterMs: data.renewAfterMs ?? 30_000,
      };
      operation.grants.set(data.memoId, grant);
      scheduleRenewal(grant);
      drive();
    });
    socket.on('lockLeaseRenewed', (data: {
      memoId: string;
      leaseToken: string;
      renewAfterMs?: number;
    }) => {
      const operation = operationRef.current;
      if (!operation?.grants.has(data.memoId)) return;
      const watchdog = renewResponseTimersRef.current.get(data.memoId);
      if (watchdog !== undefined) window.clearTimeout(watchdog);
      renewResponseTimersRef.current.delete(data.memoId);
      const grant = {
        memoId: data.memoId,
        token: data.leaseToken,
        renewAfterMs: data.renewAfterMs ?? 30_000,
      };
      operation.grants.set(data.memoId, grant);
      scheduleRenewal(grant);
    });
    socket.on('lockDenied', (data: {
      memoId: string;
      lockedBy?: string;
      reason?: string;
    }) => {
      const operation = operationRef.current;
      if (!operation?.targets.includes(data.memoId)) return;
      const reason = data.reason === 'access_denied'
        ? '원본 메모를 수정할 권한이 없습니다.'
        : `${data.lockedBy || '다른 편집기'}에서 원본 메모를 편집 중입니다.`;
      fail(reason);
    });
    socket.on('memoAccessDenied', (data: { memoId: string }) => {
      if (operationRef.current?.targets.includes(data.memoId)) {
        fail('원본 메모에 접근할 권한이 없습니다.');
      }
    });
    socket.on('memoLocked', (data: { memoId: string; displayName?: string }) => {
      if (operationRef.current?.grants.has(data.memoId)) {
        fail(`${data.displayName || '다른 편집기'}에서 원본 메모 잠금을 가져갔습니다.`);
      }
    });
    socket.on('memoContentUpdated', () => onSourceUpdatedRef.current?.());
    socket.on('projectsChanged', () => onSourceUpdatedRef.current?.());
    socket.on('syncApplied', () => onSourceUpdatedRef.current?.());

    return () => {
      const operation = operationRef.current;
      if (operation) {
        taskRollupLeaseIdsToRelease([...operation.grants.keys()], operation.targets)
          .forEach((memoId) => socket.emit('unlockMemo', { memoId }));
        operation.joined.forEach((memoId) => {
          if (!watchedMemoIdsRef.current.has(memoId)) socket.emit('leaveMemo', { memoId });
        });
        if (!operation.settled) operation.reject(new Error('할 일 원본 잠금 요청이 취소되었습니다.'));
      }
      operationRef.current = null;
      clearResponseTimer();
      clearRenewTimers();
      driveRef.current = () => {};
      failRef.current = () => {};
      socket.disconnect();
      socketRef.current = null;
    };
  }, [clearRenewTimers, clearResponseTimer]);

  const acquire = useCallback((memoIds: string[]) => {
    const targets = normalizeTaskRollupLeaseTargets(memoIds);
    releaseOperation('idle');
    setMessage(null);
    if (targets.length === 0) {
      setState('ready');
      return Promise.resolve([]);
    }
    setState('acquiring');
    return new Promise<TaskRollupLeaseInterface[]>((resolve, reject) => {
      operationRef.current = {
        id: ++operationSequenceRef.current,
        targets,
        joined: new Set(),
        lockRequested: new Set(),
        grants: new Map(),
        settled: false,
        resolve,
        reject,
      };
      const socket = socketRef.current;
      if (!socket) {
        failRef.current('원본 메모 잠금 연결을 시작하지 못했습니다.');
        return;
      }
      if (!socket.connected) {
        socket.connect();
        responseTimerRef.current = window.setTimeout(() => {
          responseTimerRef.current = null;
          if (operationRef.current) {
            failRef.current('원본 메모 잠금 서버에 연결하지 못했습니다.');
          }
        }, RESPONSE_TIMEOUT_MS);
      }
      driveRef.current();
    });
  }, [releaseOperation]);

  const watch = useCallback((memoIds: string[]) => {
    const socket = socketRef.current;
    const next = new Set(normalizeTaskRollupLeaseTargets(memoIds));
    const previous = watchedMemoIdsRef.current;
    if (socket?.connected) {
      previous.forEach((memoId) => {
        if (!next.has(memoId) && !operationRef.current?.joined.has(memoId)) {
          socket.emit('leaveMemo', { memoId });
        }
      });
      next.forEach((memoId) => {
        if (!previous.has(memoId)) socket.emit('joinMemo', { memoId });
      });
    }
    watchedMemoIdsRef.current = next;
  }, []);

  return {
    state,
    message,
    acquire,
    release: releaseOperation,
    watch,
  };
}
