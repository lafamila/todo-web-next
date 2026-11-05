'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { getProjectBacklog, ensureProjectBacklog } from '@/lib/api';
import type { MemoInterface } from '@/lib/types';
import {
  backlogAcceptsInput,
  backlogTransitionWaitMs,
  type BacklogPanelPhase,
  canCloseBacklogSession,
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

const dispatchPanelState = (open: boolean, restoreMainEditorFocus = false) => {
  window.dispatchEvent(new CustomEvent(BACKLOG_VISIBILITY_EVENT, {
    detail: { open, restoreMainEditorFocus },
  }));
  window.dispatchEvent(new CustomEvent(EDITOR_ACTIVE_SURFACE_EVENT, {
    detail: { surface: open ? 'backlog' : 'main' },
  }));
};

export function BacklogPanel() {
  const { state: { selectedProject } } = useApp();
  const isMobile = useIsMobile();
  const [phase, setPhase] = useState<BacklogPanelPhase>('closed');
  const [panelSession, setPanelSession] = useState(0);
  const [memo, setMemo] = useState<MemoInterface | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [width, setWidth] = useState(() =>
    typeof window === 'undefined' ? 640 : initialBacklogWidth(window.innerWidth, false),
  );
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const previousWasMainEditorRef = useRef(false);
  const panelRef = useRef<HTMLElement | null>(null);
  const loadingSequenceRef = useRef(0);
  const resizePointerRef = useRef<number | null>(null);
  const phaseRef = useRef<BacklogPanelPhase>('closed');
  const sessionRef = useRef(0);
  const [reducedMotion, setReducedMotion] = useState(false);

  const eligible = Boolean(
    selectedProject && !selectedProject.isGroup && !selectedProject.navigationOnly,
  );

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  const finishClose = useCallback((session: number) => {
    if (sessionRef.current !== session || phaseRef.current !== 'closing') return;
    phaseRef.current = 'closed';
    setPhase('closed');
    const directFocus = previousFocusRef.current?.isConnected
      ? previousFocusRef.current
      : null;
    dispatchPanelState(false, previousWasMainEditorRef.current && !directFocus);
    requestAnimationFrame(() => {
      directFocus?.focus();
    });
  }, []);

  const finishOpen = useCallback((session: number) => {
    if (sessionRef.current !== session || phaseRef.current !== 'opening') return;
    phaseRef.current = 'open';
    setPhase('open');
  }, []);

  const closePanel = useCallback((session = sessionRef.current) => {
    if (!canCloseBacklogSession({
      phase: phaseRef.current,
      requestedSession: session,
      currentSession: sessionRef.current,
    })) return;
    loadingSequenceRef.current += 1;
    phaseRef.current = 'closing';
    setPhase('closing');
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
    if (phaseRef.current === 'open' || phaseRef.current === 'opening') return;
    if (phaseRef.current === 'closed') {
      previousFocusRef.current = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
      previousWasMainEditorRef.current = Boolean(
        previousFocusRef.current?.closest('main.detail') &&
          !previousFocusRef.current?.closest('.backlog-panel'),
      );
      setWidth(initialBacklogWidth(window.innerWidth, isMobile));
    }
    const nextSession = sessionRef.current + 1;
    sessionRef.current = nextSession;
    setPanelSession(nextSession);
    phaseRef.current = 'opening';
    setPhase('opening');
    dispatchPanelState(true);
    void loadBacklog();
  }, [eligible, isMobile, loadBacklog]);

  useEffect(() => {
    if (phase !== 'opening' && phase !== 'closing') return;
    const session = panelSession;
    const finish = () => {
      if (phase === 'opening') finishOpen(session);
      else finishClose(session);
    };
    const waitMs = backlogTransitionWaitMs(reducedMotion);
    if (waitMs === 0) {
      finish();
      return;
    }
    const timer = window.setTimeout(finish, waitMs);
    return () => window.clearTimeout(timer);
  }, [finishClose, finishOpen, panelSession, phase, reducedMotion]);

  const handlePanelAnimationEnd = (event: React.AnimationEvent<HTMLElement>) => {
    if (event.target !== event.currentTarget) return;
    if (phase === 'opening' && event.animationName.includes('open')) {
      finishOpen(panelSession);
    }
    if (phase === 'closing' && event.animationName.includes('close')) {
      finishClose(panelSession);
    }
  };

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (!isBacklogShortcut(event) || !eligible) return;
      event.preventDefault();
      event.stopPropagation();
      if (phaseRef.current === 'closed' || phaseRef.current === 'closing') openPanel();
    };
    window.addEventListener('keydown', handleShortcut, { capture: true });
    return () => window.removeEventListener('keydown', handleShortcut, { capture: true });
  }, [eligible, openPanel]);

  useEffect(() => {
    if (phase !== 'opening') return;
    requestAnimationFrame(() => panelRef.current?.focus());
  }, [phase, panelSession]);

  const selectedProjectId = selectedProject?.id ?? null;
  useEffect(() => {
    loadingSequenceRef.current += 1;
    setMemo(null);
    setError(null);
    if (phaseRef.current !== 'closed') closePanel();
    // Switching projects closes only the overlay; IndexedDB preserves any backlog draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProjectId]);

  useEffect(() => {
    if (phaseRef.current !== 'closed' && !eligible) closePanel();
  }, [closePanel, eligible]);

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
      {phase === 'closed' && (
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
      {phase !== 'closed' && selectedProject && (
        <aside
          ref={panelRef}
          className={`backlog-panel backlog-panel--${phase}`}
          style={{ width: isMobile ? '100vw' : `${width}px` }}
          aria-label={`${selectedProject.name} 백로그`}
          aria-hidden={phase === 'closing' ? true : undefined}
          inert={phase === 'closing' ? true : undefined}
          tabIndex={-1}
          onAnimationEnd={handlePanelAnimationEnd}
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
              keyboardActive={backlogAcceptsInput(phase)}
              onLatestSaveSuccess={() => closePanel(panelSession)}
              onClose={() => closePanel(panelSession)}
            />
          ) : (
            <div className="backlog-panel-message" role="alert">
              <strong>백로그를 열 수 없습니다</strong>
              <span>{error}</span>
              <div>
                <button type="button" className="todo-action-button" onClick={() => void loadBacklog()}>
                  다시 시도
                </button>
                <button
                  type="button"
                  className="todo-action-button todo-action-button--secondary"
                  onClick={() => closePanel(panelSession)}
                >
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
