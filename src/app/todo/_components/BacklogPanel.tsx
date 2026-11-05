'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { getProjectBacklog, ensureProjectBacklog } from '@/lib/api';
import type { MemoInterface } from '@/lib/types';
import {
  advanceBacklogEscape,
  backlogAcceptsInput,
  backlogToggleAction,
  backlogTransitionWaitMs,
  type BacklogPanelPhase,
  BACKLOG_MIN_WIDTH_PX,
  BACKLOG_REMAINING_MAIN_PX,
  canCloseBacklogSession,
  isBacklogShortcut,
  isBacklogShortcutChord,
} from '@/lib/backlogPolicy';
import {
  BACKLOG_RATIO_KEY,
  panelWidthForRatio,
  readPanelRatio,
  writePanelRatio,
} from '@/lib/panelLayout';
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
    typeof window === 'undefined'
      ? 640
      : panelWidthForRatio(
          readPanelRatio(BACKLOG_RATIO_KEY),
          window.innerWidth,
          window.innerWidth / 2,
          BACKLOG_MIN_WIDTH_PX,
          BACKLOG_REMAINING_MAIN_PX,
        ),
  );
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const previousWasMainEditorRef = useRef(false);
  const panelRef = useRef<HTMLElement | null>(null);
  const loadingSequenceRef = useRef(0);
  const resizePointerRef = useRef<number | null>(null);
  const widthRef = useRef(width);
  const escapeArmedRef = useRef(false);
  const phaseRef = useRef<BacklogPanelPhase>('closed');
  const sessionRef = useRef(0);
  const [reducedMotion, setReducedMotion] = useState(false);

  const eligible = Boolean(
    selectedProject && !selectedProject.isGroup && !selectedProject.navigationOnly,
  );

  const restorePreferredWidth = useCallback((available: number, mobile: boolean) => {
    const next = mobile
      ? available
      : panelWidthForRatio(
          readPanelRatio(BACKLOG_RATIO_KEY),
          available,
          available / 2,
          BACKLOG_MIN_WIDTH_PX,
          BACKLOG_REMAINING_MAIN_PX,
        );
    widthRef.current = next;
    setWidth(next);
  }, []);

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
    escapeArmedRef.current = false;
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
      // A project viewer can write their own private backlog too.
      if (!loaded) {
        loaded = await ensureProjectBacklog(selectedProject.id);
      }
      if (sequence !== loadingSequenceRef.current) return;
      setMemo(loaded);
      if (!loaded) setError('내 백로그를 불러오지 못했습니다. 다시 시도하세요.');
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
    }
    escapeArmedRef.current = false;
    restorePreferredWidth(window.innerWidth, isMobile);
    const nextSession = sessionRef.current + 1;
    sessionRef.current = nextSession;
    setPanelSession(nextSession);
    phaseRef.current = 'opening';
    setPhase('opening');
    dispatchPanelState(true);
    void loadBacklog();
  }, [eligible, isMobile, loadBacklog, restorePreferredWidth]);

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
      if (isBacklogShortcutChord(event) && eligible) {
        event.preventDefault();
        event.stopPropagation();
        escapeArmedRef.current = false;
        if (isBacklogShortcut(event)) {
          if (backlogToggleAction(phaseRef.current) === 'open') openPanel();
          else closePanel(sessionRef.current);
        }
        return;
      }

      const escape = advanceBacklogEscape({
        armed: escapeArmedRef.current,
        key: event.key,
        repeat: event.repeat,
        isComposing: event.isComposing,
        keyCode: event.keyCode,
        modalOpen: Boolean(document.querySelector('[role="dialog"]')),
        acceptsInput: backlogAcceptsInput(phaseRef.current),
      });
      escapeArmedRef.current = escape.armed;
      if (!escape.shouldClose) return;
      event.preventDefault();
      event.stopPropagation();
      closePanel(sessionRef.current);
    };
    const resetEscape = () => {
      escapeArmedRef.current = false;
    };
    window.addEventListener('keydown', handleShortcut, { capture: true });
    window.addEventListener('pointerdown', resetEscape, { capture: true });
    return () => {
      window.removeEventListener('keydown', handleShortcut, { capture: true });
      window.removeEventListener('pointerdown', resetEscape, { capture: true });
    };
  }, [closePanel, eligible, openPanel]);

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
      restorePreferredWidth(
        window.innerWidth,
        window.matchMedia('(max-width: 768px)').matches,
      );
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isMobile, restorePreferredWidth]);

  useEffect(() => () => dispatchPanelState(false), []);

  const handleResizePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (isMobile) return;
    resizePointerRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const handleResizePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (resizePointerRef.current !== event.pointerId || isMobile) return;
    const next = panelWidthForRatio(
      null,
      window.innerWidth,
      window.innerWidth - event.clientX,
      BACKLOG_MIN_WIDTH_PX,
      BACKLOG_REMAINING_MAIN_PX,
    );
    widthRef.current = next;
    setWidth(next);
  };

  const handleResizePointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (resizePointerRef.current !== event.pointerId) return;
    resizePointerRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (!isMobile) {
      writePanelRatio(BACKLOG_RATIO_KEY, widthRef.current / window.innerWidth);
    }
  };

  const handleResizeKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (isMobile || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return;
    event.preventDefault();
    const delta = event.key === 'ArrowLeft' ? 24 : -24;
    const next = panelWidthForRatio(
      null,
      window.innerWidth,
      widthRef.current + delta,
      BACKLOG_MIN_WIDTH_PX,
      BACKLOG_REMAINING_MAIN_PX,
    );
    widthRef.current = next;
    setWidth(next);
    writePanelRatio(BACKLOG_RATIO_KEY, next / window.innerWidth);
  };

  if (!eligible) return null;

  return (
    <>
      {phase === 'closed' && (
        <button
          type="button"
          className="backlog-edge-handle"
          onClick={openPanel}
          aria-label={`${selectedProject?.name ?? '현재 프로젝트'} 내 백로그 열기`}
          title="내 백로그 열기 (⌘/Ctrl+Shift+S)"
        >
          <span>내 백로그</span>
        </button>
      )}
      {phase !== 'closed' && selectedProject && (
        <aside
          ref={panelRef}
          className={`backlog-panel backlog-panel--${phase}`}
          style={{ width: isMobile ? '100vw' : `${width}px` }}
          aria-label={`${selectedProject.name} 내 백로그`}
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
                  className="backlog-close-button todo-action-button todo-action-button--secondary"
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
