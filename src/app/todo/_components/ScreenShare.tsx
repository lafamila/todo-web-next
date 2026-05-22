'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Room, RoomEvent, Track, type RemoteTrack, type RemoteTrackPublication } from 'livekit-client';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { getLiveKitToken } from '@/lib/api';
import { LIVEKIT_URL } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { useScreenShare } from '@/hooks/useScreenShare';

type ResizeDirection =
  | 'n'
  | 's'
  | 'e'
  | 'w'
  | 'ne'
  | 'nw'
  | 'se'
  | 'sw';

interface ViewerRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const MIN_WIDTH = 320;
const MIN_HEIGHT = 240;

const defaultRect = (): ViewerRect => ({
  width: 640,
  height: 480,
  x: Math.max(16, window.innerWidth - 656),
  y: Math.max(16, window.innerHeight - 496),
});

export default function ScreenShare() {
  const {
    state: { selectedProject },
  } = useApp();
  const { user } = useAuth();
  const projectId = selectedProject?.id ?? null;

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [isJoiningViewer, setIsJoiningViewer] = useState(false);
  const [isStartingShare, setIsStartingShare] = useState(false);
  const [viewerRect, setViewerRect] = useState<ViewerRect | null>(null);
  const [buttonPortalTarget, setButtonPortalTarget] = useState<HTMLElement | null>(null);


  const viewerShellRef = useRef<HTMLDivElement | null>(null);
  const videoContainerRef = useRef<HTMLDivElement | null>(null);
  const attachedTrackElementRef = useRef<HTMLVideoElement | null>(null);
  const viewerRoomRef = useRef<Room | null>(null);
  const shareRoomRef = useRef<Room | null>(null);

  const dragStateRef = useRef<
    | {
        type: 'drag';
        startX: number;
        startY: number;
        originX: number;
        originY: number;
      }
    | {
        type: 'resize';
        direction: ResizeDirection;
        startX: number;
        startY: number;
        origin: ViewerRect;
      }
    | null
  >(null);

  const clearAttachedTrack = useCallback(() => {
    if (attachedTrackElementRef.current) {
      attachedTrackElementRef.current.remove();
      attachedTrackElementRef.current = null;
    }
  }, []);

  const { sharer, isCurrentUserSharing, startShare, stopShare } = useScreenShare({
    projectId,
    onShareStarted: (startedBy) => {
      if (!user || startedBy.userId === user.id) return;
      setToastMessage(`${startedBy.displayName} 님이 화면 공유를 시작했습니다`);
    },
    onShareStopped: () => {
      setIsViewerOpen(false);
      setToastMessage(null);
    },
  });


  useEffect(() => {
    if (!projectId) {
      setIsViewerOpen(false);
      setViewerRect(null);
    }
  }, [projectId]);

  useEffect(() => {
    const el = document.getElementById('screen-share-buttons');
    setButtonPortalTarget(el);
  }, [projectId]);


  useEffect(() => {
    if (!isViewerOpen) {
      clearAttachedTrack();
      viewerRoomRef.current?.disconnect();
      viewerRoomRef.current = null;
    }
  }, [clearAttachedTrack, isViewerOpen]);

  useEffect(() => {
    return () => {
      clearAttachedTrack();
      viewerRoomRef.current?.disconnect();
      shareRoomRef.current?.disconnect();
      viewerRoomRef.current = null;
      shareRoomRef.current = null;
    };
  }, [clearAttachedTrack]);

  const connectViewerRoom = useCallback(async () => {
    if (!projectId || !videoContainerRef.current) return;

    setIsJoiningViewer(true);
    try {
      const roomName = `project:${projectId}`;
      const { token } = await getLiveKitToken(roomName);

      const room = new Room();
      viewerRoomRef.current?.disconnect();
      viewerRoomRef.current = room;

      const attachScreenTrack = (track: RemoteTrack, publication: RemoteTrackPublication) => {
        if (
          track.kind !== Track.Kind.Video ||
          publication.source !== Track.Source.ScreenShare
        ) {
          return;
        }

        clearAttachedTrack();
        const element = track.attach() as HTMLVideoElement;
        element.className = 'w-full h-full object-contain bg-black';
        element.autoplay = true;
        element.muted = true;
        videoContainerRef.current?.appendChild(element);
        attachedTrackElementRef.current = element;
      };

      room.on(RoomEvent.TrackSubscribed, attachScreenTrack);
      room.on(RoomEvent.TrackUnsubscribed, (track) => {
        if (track.kind !== Track.Kind.Video) return;
        clearAttachedTrack();
      });
      room.on(RoomEvent.Disconnected, () => {
        clearAttachedTrack();
      });

      await room.connect(LIVEKIT_URL, token);

      room.remoteParticipants.forEach((participant) => {
        participant.trackPublications.forEach((publication) => {
          const remoteTrack = publication.track;
          if (!remoteTrack) return;
          if (
            remoteTrack.kind === Track.Kind.Video &&
            publication.source === Track.Source.ScreenShare
          ) {
            attachScreenTrack(remoteTrack, publication as RemoteTrackPublication);
          }
        });
      });
    } finally {
      setIsJoiningViewer(false);
    }
  }, [clearAttachedTrack, projectId]);

  useEffect(() => {
    if (!isViewerOpen) return;
    if (!viewerRect) {
      setViewerRect(defaultRect());
      return;
    }
    void connectViewerRoom();
  }, [connectViewerRoom, isViewerOpen, viewerRect]);

  const isSelfSharer = useMemo(() => {
    if (!user) return isCurrentUserSharing;
    return isCurrentUserSharing || sharer?.userId === user.id;
  }, [isCurrentUserSharing, sharer?.userId, user]);

  const hasAnotherSharer = !!sharer && !!user && sharer.userId !== user.id;

  const handleStartShare = useCallback(async () => {
    if (!projectId || isStartingShare || isSelfSharer) return;

    setIsStartingShare(true);
    try {
      const roomName = `project:${projectId}`;
      const { token } = await getLiveKitToken(roomName);

      const room = new Room();
      shareRoomRef.current?.disconnect();
      shareRoomRef.current = room;

      await room.connect(LIVEKIT_URL, token);
      console.log('[ScreenShare] room connected, enabling screen share...');
      await room.localParticipant.setScreenShareEnabled(true);
      console.log('[ScreenShare] screen share enabled');
      startShare();
    } catch (err) {
      console.error('[ScreenShare] handleStartShare error:', err);
      shareRoomRef.current?.disconnect();
      shareRoomRef.current = null;
    } finally {
      setIsStartingShare(false);
    }
  }, [isSelfSharer, isStartingShare, projectId, startShare]);

  const handleStopShare = useCallback(async () => {
    const room = shareRoomRef.current;
    try {
      if (room) {
        await room.localParticipant.setScreenShareEnabled(false);
      }
    } finally {
      room?.disconnect();
      shareRoomRef.current = null;
      stopShare();
    }
  }, [stopShare]);

  const handleJoinViewer = useCallback(() => {
    setIsViewerOpen(true);
  }, []);

  const handleExitViewer = useCallback(() => {
    setIsViewerOpen(false);
  }, []);

  const handleFullScreen = useCallback(() => {
    if (!viewerShellRef.current) return;
    void viewerShellRef.current.requestFullscreen();
  }, []);

  const startDrag = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (!viewerRect) return;
    dragStateRef.current = {
      type: 'drag',
      startX: event.clientX,
      startY: event.clientY,
      originX: viewerRect.x,
      originY: viewerRect.y,
    };
  }, [viewerRect]);

  const startResize = useCallback(
    (direction: ResizeDirection) => (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      if (!viewerRect) return;
      dragStateRef.current = {
        type: 'resize',
        direction,
        startX: event.clientX,
        startY: event.clientY,
        origin: viewerRect,
      };
    },
    [viewerRect],
  );

  useEffect(() => {
    const onMouseMove = (event: MouseEvent) => {
      const state = dragStateRef.current;
      if (!state) return;

      if (state.type === 'drag') {
        const dx = event.clientX - state.startX;
        const dy = event.clientY - state.startY;
        setViewerRect((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            x: Math.max(0, state.originX + dx),
            y: Math.max(0, state.originY + dy),
          };
        });
        return;
      }

      const dx = event.clientX - state.startX;
      const dy = event.clientY - state.startY;
      const base = state.origin;
      let nextX = base.x;
      let nextY = base.y;
      let nextWidth = base.width;
      let nextHeight = base.height;

      if (state.direction.includes('e')) {
        nextWidth = Math.max(MIN_WIDTH, base.width + dx);
      }
      if (state.direction.includes('s')) {
        nextHeight = Math.max(MIN_HEIGHT, base.height + dy);
      }
      if (state.direction.includes('w')) {
        const width = Math.max(MIN_WIDTH, base.width - dx);
        const right = base.x + base.width;
        nextWidth = width;
        nextX = right - width;
      }
      if (state.direction.includes('n')) {
        const height = Math.max(MIN_HEIGHT, base.height - dy);
        const bottom = base.y + base.height;
        nextHeight = height;
        nextY = bottom - height;
      }

      setViewerRect({
        x: Math.max(0, nextX),
        y: Math.max(0, nextY),
        width: nextWidth,
        height: nextHeight,
      });
    };

    const onMouseUp = () => {
      dragStateRef.current = null;
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  if (!projectId) return null;

  return (
    <>
      {buttonPortalTarget && createPortal(
        <div className="flex items-center gap-2">
          {!hasAnotherSharer && !isSelfSharer && (
            <button
              type="button"
              onClick={() => void handleStartShare()}
              disabled={isStartingShare}
              className="rounded-md border border-gray-600 bg-gray-900 px-3 py-1.5 text-sm text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isStartingShare ? '공유 준비 중...' : '화면 공유'}
            </button>
          )}

          {hasAnotherSharer && !isSelfSharer && (
            <button
              type="button"
              onClick={handleJoinViewer}
              className="rounded-md border border-emerald-500 bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
            >
              참가하기
            </button>
          )}

          {isSelfSharer && (
            <button
              type="button"
              onClick={() => void handleStopShare()}
              className="rounded-md border border-red-500 bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-red-700"
            >
              공유 중지
            </button>
          )}
        </div>,
        buttonPortalTarget,
      )}

      <div
        className={cn(
          'fixed top-3 left-1/2 -translate-x-1/2 z-50 rounded-lg bg-gray-950/95 px-4 py-3 text-sm text-white shadow-xl transition-all duration-300',
          toastMessage ? 'translate-y-0 opacity-100' : '-translate-y-2 opacity-0 pointer-events-none',
        )}
      >
        {toastMessage}
      </div>

      {isViewerOpen && viewerRect && (
        <div
          ref={viewerShellRef}
          className="fixed z-50 overflow-hidden rounded-xl border border-gray-700 bg-gray-900 shadow-2xl"
          style={{
            left: viewerRect.x,
            top: viewerRect.y,
            width: viewerRect.width,
            height: viewerRect.height,
          }}
        >
          <div className="flex items-center justify-between border-b border-gray-700 bg-gray-800 px-3 py-2 cursor-move" onMouseDown={startDrag}>
            <span className="text-xs text-gray-200 select-none">공유 화면</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleFullScreen}
                onMouseDown={(e) => e.stopPropagation()}
                className="rounded border border-gray-600 px-2 py-1 text-xs text-gray-200 hover:bg-gray-700"
              >
                전체화면
              </button>
              <button
                type="button"
                onClick={handleExitViewer}
                onMouseDown={(e) => e.stopPropagation()}
                className="rounded border border-red-500/50 px-2 py-1 text-xs text-red-200 hover:bg-red-500/20"
              >
                나가기
              </button>
            </div>
          </div>

          <div ref={videoContainerRef} className="h-[calc(100%-41px)] w-full bg-black">
            {isJoiningViewer && (
              <div className="flex h-full w-full items-center justify-center text-sm text-gray-400">
                연결 중...
              </div>
            )}
          </div>

          <button type="button" onMouseDown={startResize('n')} className="absolute left-3 right-3 top-0 h-2 cursor-n-resize" aria-label="resize north" />
          <button type="button" onMouseDown={startResize('s')} className="absolute bottom-0 left-3 right-3 h-2 cursor-s-resize" aria-label="resize south" />
          <button type="button" onMouseDown={startResize('e')} className="absolute right-0 top-3 bottom-3 w-2 cursor-e-resize" aria-label="resize east" />
          <button type="button" onMouseDown={startResize('w')} className="absolute left-0 top-3 bottom-3 w-2 cursor-w-resize" aria-label="resize west" />
          <button type="button" onMouseDown={startResize('ne')} className="absolute right-0 top-0 h-3 w-3 cursor-ne-resize" aria-label="resize north east" />
          <button type="button" onMouseDown={startResize('nw')} className="absolute left-0 top-0 h-3 w-3 cursor-nw-resize" aria-label="resize north west" />
          <button type="button" onMouseDown={startResize('se')} className="absolute bottom-0 right-0 h-3 w-3 cursor-se-resize" aria-label="resize south east" />
          <button type="button" onMouseDown={startResize('sw')} className="absolute bottom-0 left-0 h-3 w-3 cursor-sw-resize" aria-label="resize south west" />
        </div>
      )}
    </>
  );
}
