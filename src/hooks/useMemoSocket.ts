'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { SOCKET_BASE_URL, SOCKET_PATH } from '@/lib/constants';
import { clearMemoLease, setMemoLease } from '@/lib/api';
import type { MemoLeaseState } from '@/lib/types';
import {
  leaseStateWithoutOwnership,
  shouldRetryLockResponse,
  shouldEmitLockRequest,
  shouldRenewLease,
} from '@/lib/memoLeasePolicy';

interface MemoLockInfo {
  displayName: string;
  userId: string;
}

interface UseMemoSocketOptions {
  memoId: string | null;
  onContentUpdated: (content: string, title?: string) => void;
  onLocked: (info: MemoLockInfo) => void;
  onUnlocked: () => void;
  onLockDenied: (displayName: string) => void;
  onSyncApplied?: () => void;
}

interface UseMemoSocketReturn {
  isConnected: boolean;
  lockHolder: MemoLockInfo | null;
  leaseState: MemoLeaseState;
  requestLock: () => void;
  releaseLock: () => void;
  broadcastUpdate: (content: string, title?: string) => void;
}

export function useMemoSocket({
  memoId,
  onContentUpdated,
  onLocked,
  onUnlocked,
  onLockDenied,
  onSyncApplied,
}: UseMemoSocketOptions): UseMemoSocketReturn {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lockHolder, setLockHolder] = useState<MemoLockInfo | null>(null);
  const [leaseState, setLeaseState] = useState<MemoLeaseState>('denied');
  const currentMemoIdRef = useRef<string | null>(null);
  const joinedMemoIdRef = useRef<string | null>(null);
  const editIntentRef = useRef(false);
  const lockRequestMemoRef = useRef<string | null>(null);
  const ownsLockRef = useRef(false);
  const startLockResponseWatchdogRef = useRef<(memoId: string) => void>(() => {});
  const stopLockResponseWatchdogRef = useRef<() => void>(() => {});
  const stopRenewalRef = useRef<() => void>(() => {});

  // Keep callbacks in refs to avoid re-triggering effect
  const onContentUpdatedRef = useRef(onContentUpdated);
  const onLockedRef = useRef(onLocked);
  const onUnlockedRef = useRef(onUnlocked);
  const onLockDeniedRef = useRef(onLockDenied);
  const onSyncAppliedRef = useRef(onSyncApplied);

  useEffect(() => {
    onContentUpdatedRef.current = onContentUpdated;
  }, [onContentUpdated]);
  useEffect(() => {
    onLockedRef.current = onLocked;
  }, [onLocked]);
  useEffect(() => {
    onUnlockedRef.current = onUnlocked;
  }, [onUnlocked]);
  useEffect(() => {
    onLockDeniedRef.current = onLockDenied;
  }, [onLockDenied]);
  useEffect(() => {
    onSyncAppliedRef.current = onSyncApplied;
  }, [onSyncApplied]);

  // Connect socket once (on mount)
  useEffect(() => {
    const socket = io(SOCKET_BASE_URL, {
      path: SOCKET_PATH,
      withCredentials: true,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10,
    });

    socketRef.current = socket;
    let renewTimer: number | null = null;
    let lockResponseTimer: number | null = null;
    let renewAfterMs = 30_000;
    let lockAttemptCount = 0;
    const LOCK_RESPONSE_TIMEOUT_MS = 2_000;

    const stopRenewal = () => {
      if (renewTimer !== null) {
        window.clearTimeout(renewTimer);
        renewTimer = null;
      }
    };
    const stopLockResponseWatchdog = () => {
      if (lockResponseTimer !== null) {
        window.clearTimeout(lockResponseTimer);
        lockResponseTimer = null;
      }
    };
    const denyUnresponsiveLock = (memoId: string) => {
      if (memoId !== currentMemoIdRef.current) return;
      stopRenewal();
      stopLockResponseWatchdog();
      ownsLockRef.current = false;
      editIntentRef.current = false;
      lockRequestMemoRef.current = null;
      clearMemoLease(memoId);
      const displayName = '동기화 서버 응답 없음';
      setLockHolder({
        displayName,
        userId: 'lock-unavailable',
      });
      setLeaseState('denied');
      onLockDeniedRef.current(displayName);
    };
    const armLockResponseWatchdog = (
      memoId: string,
      resetAttempts = true,
    ) => {
      stopLockResponseWatchdog();
      if (resetAttempts) lockAttemptCount = 1;
      lockResponseTimer = window.setTimeout(() => {
        lockResponseTimer = null;
        if (
          memoId !== currentMemoIdRef.current ||
          ownsLockRef.current ||
          !editIntentRef.current
        ) {
          return;
        }
        if (!shouldRetryLockResponse({
          connected: socket.connected,
          currentMemoId: currentMemoIdRef.current,
          joinedMemoId: joinedMemoIdRef.current,
          memoId,
          attemptCount: lockAttemptCount,
        })) {
          denyUnresponsiveLock(memoId);
          return;
        }
        lockAttemptCount += 1;
        lockRequestMemoRef.current = memoId;
        socket.emit('lockMemo', { memoId });
        armLockResponseWatchdog(memoId, false);
      }, LOCK_RESPONSE_TIMEOUT_MS);
    };
    const armRenewResponseWatchdog = (memoId: string) => {
      stopLockResponseWatchdog();
      lockResponseTimer = window.setTimeout(() => {
        lockResponseTimer = null;
        if (
          memoId !== currentMemoIdRef.current ||
          !ownsLockRef.current
        ) {
          return;
        }
        ownsLockRef.current = false;
        lockRequestMemoRef.current = memoId;
        clearMemoLease(memoId);
        setLeaseState('pending');
        lockAttemptCount = 1;
        socket.emit('lockMemo', { memoId });
        armLockResponseWatchdog(memoId, false);
      }, LOCK_RESPONSE_TIMEOUT_MS);
    };
    startLockResponseWatchdogRef.current = (memoId) => {
      armLockResponseWatchdog(memoId);
    };
    stopLockResponseWatchdogRef.current = stopLockResponseWatchdog;
    stopRenewalRef.current = stopRenewal;

    const scheduleRenewal = (delayMs = renewAfterMs) => {
      stopRenewal();
      renewAfterMs = delayMs;
      renewTimer = window.setTimeout(() => {
        const currentMemoId = currentMemoIdRef.current;
        if (
          shouldRenewLease(
            socket.connected,
            ownsLockRef.current,
            currentMemoId,
          )
        ) {
          socket.emit('renewMemoLock', { memoId: currentMemoId });
          if (currentMemoId) armRenewResponseWatchdog(currentMemoId);
        }
      }, renewAfterMs);
    };

    socket.on('connect', () => {
      setIsConnected(true);
      stopLockResponseWatchdog();
      lockAttemptCount = 0;

      // 방 입장 확인(lockStatus) 전에는 lockMemo 를 보내지 않는다.
      if (currentMemoIdRef.current) {
        joinedMemoIdRef.current = null;
        lockRequestMemoRef.current = null;
        setLeaseState(leaseStateWithoutOwnership(editIntentRef.current));
        socket.emit('joinMemo', { memoId: currentMemoIdRef.current });
      }
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
      ownsLockRef.current = false;
      joinedMemoIdRef.current = null;
      lockRequestMemoRef.current = null;
      setLeaseState(leaseStateWithoutOwnership(editIntentRef.current));
      stopRenewal();
      stopLockResponseWatchdog();
      lockAttemptCount = 0;
      if (currentMemoIdRef.current) {
        clearMemoLease(currentMemoIdRef.current);
      }
    });

    // Lock events
    socket.on(
      'lockStatus',
      (data: {
        memoId: string;
        lockedBy: string | null;
        lockedByUserId: string | null;
        available?: boolean;
      }) => {
        if (data.memoId !== currentMemoIdRef.current) return;
        joinedMemoIdRef.current = data.memoId;
        lockRequestMemoRef.current = null;
        if (data.available === false) {
          stopLockResponseWatchdog();
          const displayName = '동기화 서버';
          setLockHolder({
            displayName,
            userId: 'lock-unavailable',
          });
          ownsLockRef.current = false;
          editIntentRef.current = false;
          setLeaseState('denied');
          onLockDeniedRef.current(displayName);
          return;
        }
        if (data.lockedBy && data.lockedByUserId) {
          stopLockResponseWatchdog();
          setLockHolder({
            displayName: data.lockedBy,
            userId: data.lockedByUserId,
          });
          setLeaseState('denied');
          onLockedRef.current({
            displayName: data.lockedBy,
            userId: data.lockedByUserId,
          });
        } else {
          setLockHolder(null);
          if (editIntentRef.current && !ownsLockRef.current) {
            setLeaseState('pending');
            lockRequestMemoRef.current = data.memoId;
            socket.emit('lockMemo', { memoId: data.memoId });
            armLockResponseWatchdog(data.memoId);
          } else if (!ownsLockRef.current) {
            setLeaseState('denied');
          }
        }
      },
    );

    socket.on(
      'memoLocked',
      (data: { memoId: string; displayName: string; userId: string }) => {
        if (data.memoId !== currentMemoIdRef.current) return;
        // server는 현재 owner에게 이 이벤트를 skip_sid 한다. 따라서 수신했다면
        // canonical owner가 바뀐 것이므로 이전 lease를 무조건 폐기한다.
        ownsLockRef.current = false;
        editIntentRef.current = false;
        lockRequestMemoRef.current = null;
        stopRenewal();
        stopLockResponseWatchdog();
        lockAttemptCount = 0;
        clearMemoLease(data.memoId);
        setLockHolder({
          displayName: data.displayName,
          userId: data.userId,
        });
        setLeaseState('denied');
        onLockedRef.current({
          displayName: data.displayName,
          userId: data.userId,
        });
      },
    );

    socket.on('memoUnlocked', (data: { memoId: string }) => {
      if (data.memoId !== currentMemoIdRef.current) return;
      ownsLockRef.current = false;
      lockRequestMemoRef.current = null;
      stopRenewal();
      stopLockResponseWatchdog();
      lockAttemptCount = 0;
      clearMemoLease(data.memoId);
      setLeaseState(leaseStateWithoutOwnership(editIntentRef.current));
      setLockHolder(null);
      onUnlockedRef.current();
      if (
        editIntentRef.current &&
        socket.connected &&
        joinedMemoIdRef.current === data.memoId
      ) {
        lockRequestMemoRef.current = data.memoId;
        socket.emit('lockMemo', { memoId: data.memoId });
        armLockResponseWatchdog(data.memoId);
      }
    });

    socket.on('lockAcquired', (data: {
      memoId: string;
      leaseToken: string;
      generation?: number;
      renewAfterMs?: number;
    }) => {
      if (data.memoId !== currentMemoIdRef.current) return;
      ownsLockRef.current = true;
      editIntentRef.current = true;
      lockRequestMemoRef.current = null;
      stopLockResponseWatchdog();
      lockAttemptCount = 0;
      setLeaseState('ready');
      setMemoLease(data);
      setLockHolder(null);
      scheduleRenewal(data.renewAfterMs);
      // Lock was granted - lockHolder stays null for the holder themselves
    });

    socket.on(
      'lockLeaseRenewed',
      (data: {
        memoId: string;
        leaseToken: string;
        generation?: number;
        renewAfterMs?: number;
      }) => {
        if (
          data.memoId === currentMemoIdRef.current &&
          ownsLockRef.current
        ) {
          lockRequestMemoRef.current = null;
          stopLockResponseWatchdog();
          lockAttemptCount = 0;
          setLeaseState('ready');
          setMemoLease(data);
          scheduleRenewal(data.renewAfterMs);
        }
      },
    );

    socket.on(
      'lockDenied',
      (data: {
        memoId: string;
        lockedBy?: string;
        lockedByUserId?: string;
      }) => {
        if (data.memoId !== currentMemoIdRef.current) return;
        const lockedBy = data.lockedBy || '동기화 서버';
        ownsLockRef.current = false;
        editIntentRef.current = false;
        lockRequestMemoRef.current = null;
        stopRenewal();
        stopLockResponseWatchdog();
        lockAttemptCount = 0;
        clearMemoLease(data.memoId);
        setLockHolder({
          displayName: lockedBy,
          userId: data.lockedByUserId || 'lock-unavailable',
        });
        setLeaseState('denied');
        onLockDeniedRef.current(lockedBy);
      },
    );

    // Content sync
    socket.on(
      'memoContentUpdated',
      (data: { memoId: string; content: string; title?: string }) => {
        if (data.memoId !== currentMemoIdRef.current) return;
        onContentUpdatedRef.current(data.content, data.title);
      },
    );
    socket.on('syncApplied', () => {
      onSyncAppliedRef.current?.();
    });

    return () => {
      stopRenewal();
      stopLockResponseWatchdog();
      startLockResponseWatchdogRef.current = () => {};
      stopLockResponseWatchdogRef.current = () => {};
      stopRenewalRef.current = () => {};
      if (currentMemoIdRef.current) {
        clearMemoLease(currentMemoIdRef.current);
      }
      ownsLockRef.current = false;
      joinedMemoIdRef.current = null;
      lockRequestMemoRef.current = null;
      socket.disconnect();
      socketRef.current = null;
      setIsConnected(false);
    };
  }, []);

  // Join/leave memo rooms when memoId changes
  useEffect(() => {
    const socket = socketRef.current;
    const prevMemoId = currentMemoIdRef.current;
    if (prevMemoId !== memoId) {
      stopLockResponseWatchdogRef.current();
      stopRenewalRef.current();
    }
    if (!socket || !socket.connected) {
      if (prevMemoId !== memoId) {
        ownsLockRef.current = false;
        editIntentRef.current = false;
        joinedMemoIdRef.current = null;
        lockRequestMemoRef.current = null;
      }
      currentMemoIdRef.current = memoId;
      setLeaseState('denied');
      return;
    }

    // Leave previous room
    if (prevMemoId) {
      socket.emit('leaveMemo', { memoId: prevMemoId });
      ownsLockRef.current = false;
      editIntentRef.current = false;
      joinedMemoIdRef.current = null;
      lockRequestMemoRef.current = null;
      clearMemoLease(prevMemoId);
    }

    // Join new room
    if (memoId) {
      currentMemoIdRef.current = memoId;
      setLeaseState('denied');
      socket.emit('joinMemo', { memoId });
    } else {
      currentMemoIdRef.current = null;
      ownsLockRef.current = false;
      editIntentRef.current = false;
      joinedMemoIdRef.current = null;
      lockRequestMemoRef.current = null;
      setLeaseState('denied');
      Promise.resolve().then(() => setLockHolder(null));
    }
  }, [memoId]);

  const requestLock = useCallback(() => {
    const socket = socketRef.current;
    if (ownsLockRef.current) return;
    editIntentRef.current = true;
    setLeaseState('pending');
    if (!socket || !socket.connected || !currentMemoIdRef.current) {
      return;
    }
    if (
      !shouldEmitLockRequest({
        connected: socket.connected,
        ownsLock: ownsLockRef.current,
        currentMemoId: currentMemoIdRef.current,
        joinedMemoId: joinedMemoIdRef.current,
        inFlightMemoId: lockRequestMemoRef.current,
      })
    ) {
      return;
    }
    lockRequestMemoRef.current = currentMemoIdRef.current;
    socket.emit('lockMemo', { memoId: currentMemoIdRef.current });
    startLockResponseWatchdogRef.current(currentMemoIdRef.current);
  }, []);

  const releaseLock = useCallback(() => {
    const socket = socketRef.current;
    stopLockResponseWatchdogRef.current();
    stopRenewalRef.current();
    if (!socket || !currentMemoIdRef.current) return;
    const memoId = currentMemoIdRef.current;
    const wasOwner = ownsLockRef.current;
    ownsLockRef.current = false;
    editIntentRef.current = false;
    lockRequestMemoRef.current = null;
    clearMemoLease(memoId);
    setLeaseState('denied');
    if (wasOwner) socket.emit('unlockMemo', { memoId });
  }, []);

  const broadcastUpdate = useCallback((content: string, title?: string) => {
    const socket = socketRef.current;
    if (!socket || !currentMemoIdRef.current) return;
    socket.emit('memoUpdated', {
      memoId: currentMemoIdRef.current,
      content,
      title,
    });
  }, []);

  return {
    isConnected,
    lockHolder,
    leaseState,
    requestLock,
    releaseLock,
    broadcastUpdate,
  };
}
