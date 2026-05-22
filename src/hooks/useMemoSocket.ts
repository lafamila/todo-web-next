'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { SOCKET_BASE_URL, SOCKET_PATH } from '@/lib/constants';

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
}

interface UseMemoSocketReturn {
  isConnected: boolean;
  lockHolder: MemoLockInfo | null;
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
}: UseMemoSocketOptions): UseMemoSocketReturn {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lockHolder, setLockHolder] = useState<MemoLockInfo | null>(null);
  const currentMemoIdRef = useRef<string | null>(null);

  // Keep callbacks in refs to avoid re-triggering effect
  const onContentUpdatedRef = useRef(onContentUpdated);
  const onLockedRef = useRef(onLocked);
  const onUnlockedRef = useRef(onUnlocked);
  const onLockDeniedRef = useRef(onLockDenied);

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

    socket.on('connect', () => {
      setIsConnected(true);

      // Rejoin current memo room after reconnect
      if (currentMemoIdRef.current) {
        socket.emit('joinMemo', { memoId: currentMemoIdRef.current });
      }
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
    });

    // Lock events
    socket.on(
      'lockStatus',
      (data: {
        memoId: string;
        lockedBy: string | null;
        lockedByUserId: string | null;
      }) => {
        if (data.lockedBy && data.lockedByUserId) {
          setLockHolder({
            displayName: data.lockedBy,
            userId: data.lockedByUserId,
          });
          onLockedRef.current({
            displayName: data.lockedBy,
            userId: data.lockedByUserId,
          });
        } else {
          setLockHolder(null);
        }
      },
    );

    socket.on(
      'memoLocked',
      (data: { memoId: string; displayName: string; userId: string }) => {
        setLockHolder({
          displayName: data.displayName,
          userId: data.userId,
        });
        onLockedRef.current({
          displayName: data.displayName,
          userId: data.userId,
        });
      },
    );

    socket.on('memoUnlocked', () => {
      setLockHolder(null);
      onUnlockedRef.current();
    });

    socket.on('lockAcquired', () => {
      // Lock was granted - lockHolder stays null for the holder themselves
    });

    socket.on(
      'lockDenied',
      (data: { memoId: string; lockedBy: string }) => {
        onLockDeniedRef.current(data.lockedBy);
      },
    );

    // Content sync
    socket.on(
      'memoContentUpdated',
      (data: { memoId: string; content: string; title?: string }) => {
        onContentUpdatedRef.current(data.content, data.title);
      },
    );

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setIsConnected(false);
    };
  }, []);

  // Join/leave memo rooms when memoId changes
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !socket.connected) return;

    const prevMemoId = currentMemoIdRef.current;

    // Leave previous room
    if (prevMemoId) {
      socket.emit('leaveMemo', { memoId: prevMemoId });
    }

    // Join new room
    if (memoId) {
      socket.emit('joinMemo', { memoId });
      currentMemoIdRef.current = memoId;
    } else {
      currentMemoIdRef.current = null;
      Promise.resolve().then(() => setLockHolder(null));
    }
  }, [memoId]);

  const requestLock = useCallback(() => {
    const socket = socketRef.current;
    if (!socket || !currentMemoIdRef.current) return;
    socket.emit('lockMemo', { memoId: currentMemoIdRef.current });
  }, []);

  const releaseLock = useCallback(() => {
    const socket = socketRef.current;
    if (!socket || !currentMemoIdRef.current) return;
    socket.emit('unlockMemo', { memoId: currentMemoIdRef.current });
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
    requestLock,
    releaseLock,
    broadcastUpdate,
  };
}
