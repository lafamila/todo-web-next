'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { getProjectBacklog, ensureProjectBacklog } from '@/lib/api';
import type { MemoInterface } from '@/lib/types';
import {
  clampBacklogWidth,
  initialBacklogWidth,
  isBacklogShortcut,
} from '@/lib/backlogPolicy';
import { useIsMobile } from '@/hooks/useIsMobile';
import {
  BACKLOG_VISIBILITY_EVENT,
  EDITOR_ACTIVE_SURFACE_EVENT,
  MemoSection,
} from './MemoSection';

const dispatchPanelState = (open: boolean) => {
  window.dispatchEvent(new CustomEvent(BACKLOG_VISIBILITY_EVENT, { detail: { open } }));
  window.dispatchEvent(new CustomEvent(EDITOR_ACTIVE_SURFACE_EVENT, {
    detail: { surface: open ? 'backlog' : 'main' },
  }));
};

export function BacklogPanel() {
  const { state: { selectedProject } } = useApp();
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [memo, setMemo] = useState<MemoInterface | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [width, setWidth] = useState(() =>
    typeof window === 'undefined' ? 640 : initialBacklogWidth(window.innerWidth, false),
  );
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const loadingSequenceRef = useRef(0);
  const resizePointerRef = useRef<number | null>(null);

  const eligible = Boolean(
    selectedProject && !selectedProject.isGroup && !selectedProject.navigationOnly,
  );

  const closePanel = useCallback(() => {
    loadingSequenceRef.current += 1;
    setOpen(false);
    dispatchPanelState(false);
    requestAnimationFrame(() => {
      if (previousFocusRef.current?.isConnected) previousFocusRef.current.focus();
    });
  }, []);

  const loadBacklog = useCallback(async () => {
    if (!selectedProject || selectedProject.isGroup || selectedProject.navigationOnly) return;
    const sequence = ++loadingSequenceRef.current;
    setLoading(true);
    setError(null);
    try {
      let loaded = await getProjectBacklog(selectedProject.id);
      if (!loaded && selectedProject.canWrite) {
        loaded = await ensureProjectBacklog(selectedProject.id);
      }
      if (sequence !== loadingSequenceRef.current) return;
      setMemo(loaded);
      if (!loaded) setError('아직 백로그가 없습니다. 편집 권한이 있는 멤버가 먼저 만들 수 있습니다.');
    } catch (loadError) {
      if (sequence !== loadingSequenceRef.current) return;
      setError(loadError instanceof Error ? loadError.message : '백로그를 불러오지 못했습니다.');
    } finally {
      if (sequence === loadingSequenceRef.current) setLoading(false);
    }
  }, [selectedProject]);

  const openPanel = useCallback(() => {
    if (!eligible) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    setWidth(initialBacklogWidth(window.innerWidth, isMobile));
    setOpen(true);
    dispatchPanelState(true);
    void loadBacklog();
  }, [eligible, isMobile, loadBacklog]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (!isBacklogShortcut(event) || !eligible) return;
      event.preventDefault();
      event.stopPropagation();
      if (!open) openPanel();
    };
    window.addEventListener('keydown', handleShortcut, { capture: true });
    return () => window.removeEventListener('keydown', handleShortcut, { capture: true });
  }, [eligible, open, openPanel]);

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => panelRef.current?.focus());
  }, [open]);

  const selectedProjectId = selectedProject?.id ?? null;
  useEffect(() => {
    loadingSequenceRef.current += 1;
    setMemo(null);
    setError(null);
    if (open) closePanel();
    // Switching projects closes only the overlay; IndexedDB preserves any backlog draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProjectId]);

  useEffect(() => {
    if (open && !eligible) closePanel();
  }, [closePanel, eligible, open]);

  useEffect(() => {
    const handleResize = () => {
      setWidth((current) => clampBacklogWidth(current, window.innerWidth, isMobile));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isMobile]);

  useEffect(() => () => dispatchPanelState(false), []);

  const handleResizePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (isMobile) return;
    resizePointerRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const handleResizePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (resizePointerRef.current !== event.pointerId || isMobile) return;
    setWidth(clampBacklogWidth(window.innerWidth - event.clientX, window.innerWidth, false));
  };

  const handleResizePointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (resizePointerRef.current !== event.pointerId) return;
    resizePointerRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleResizeKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (isMobile || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return;
    event.preventDefault();
    const delta = event.key === 'ArrowLeft' ? 24 : -24;
    setWidth((current) => clampBacklogWidth(current + delta, window.innerWidth, false));
  };

  if (!eligible) return null;

  return (
    <>
      {!open && (
        <button
          type="button"
          className="backlog-edge-handle"
          onClick={openPanel}
          aria-label={`${selectedProject?.name ?? '현재 프로젝트'} 백로그 열기`}
          title="백로그 열기 (⌘/Ctrl+Shift+S)"
        >
          <span>백로그</span>
        </button>
      )}
      {open && selectedProject && (
        <aside
          ref={panelRef}
          className="backlog-panel"
          style={{ width: isMobile ? '100vw' : `${width}px` }}
          aria-label={`${selectedProject.name} 백로그`}
          tabIndex={-1}
        >
          {!isMobile && (
            <div
              className="backlog-resize-handle"
              role="separator"
              aria-label="백로그 너비 조절"
              aria-orientation="vertical"
              tabIndex={0}
              onPointerDown={handleResizePointerDown}
              onPointerMove={handleResizePointerMove}
              onPointerUp={handleResizePointerEnd}
              onPointerCancel={handleResizePointerEnd}
              onKeyDown={handleResizeKeyDown}
            />
          )}
          {loading ? (
            <div className="backlog-panel-message">백로그를 불러오는 중입니다…</div>
          ) : memo ? (
            <MemoSection
              key={memo.id}
              memo={memo}
              project={selectedProject}
              variant="backlog"
              onLatestSaveSuccess={closePanel}
              onClose={closePanel}
            />
          ) : (
            <div className="backlog-panel-message" role="alert">
              <strong>백로그를 열 수 없습니다</strong>
              <span>{error}</span>
              <div>
                <button type="button" className="todo-action-button" onClick={() => void loadBacklog()}>
                  다시 시도
                </button>
                <button type="button" className="todo-action-button todo-action-button--secondary" onClick={closePanel}>
                  닫기
                </button>
              </div>
            </div>
          )}
        </aside>
      )}
    </>
  );
}
