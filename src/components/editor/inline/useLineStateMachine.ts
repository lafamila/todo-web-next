'use client';

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { formatCodeFence } from '@/lib/codeFence';
import { toggleCheckbox } from '@/lib/utils';
import {
  buildLineGroups,
  classifyLine,
  editableLineIds,
  isAutoRenderTarget,
  isCompletePattern,
  linesToText,
  type EditorLine,
  type LineGroup,
} from './classifyLine';
import { createEditorHistory, type EditorSnapshot } from './history';

/** 자동 렌더 안정화 타이머. MemoSection 의 6초 락 해제 타이머와는 별개로 관리한다. */
export const RENDER_SETTLE_MS = 2000;
export const FLASH_MS = 200;

export type LineMode = 'editing' | 'focused-rendered';

export interface MentionState {
  query: string;
  top: number;
  left: number;
}

export interface UseLineStateMachineOptions {
  value: string;
  onChange: (next: string) => void;
  /** 즉시 서버 반영이 필요한 변경(체크박스 토글)에만 호출된다. */
  onPersist?: (next: string) => void;
  /** 활성 라인 유무가 바뀔 때만 호출된다 — 6초 락 해제 타이머의 기준. */
  onEditingChange?: (editing: boolean) => void;
  onMentionChange?: (state: MentionState | null) => void;
  /** @ 검색 드롭다운이 떠 있으면 방향키/Enter/Escape 를 드롭다운에 먼저 넘긴다. */
  mentionActive?: boolean;
  onMentionKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => boolean;
  readOnly?: boolean;
}

/**
 * 세션-로컬 라인 id 발급기.
 * 값 자체는 렌더에 쓰이지 않고 오직 React key 의 안정성만 담당하므로 모듈 카운터로 충분하다.
 */
let lineIdCounter = 0;

function nextLineId(): number {
  lineIdCounter += 1;
  return lineIdCounter;
}

function splitDocument(text: string): EditorLine[] {
  return text.split('\n').map((line) => ({ id: nextLineId(), text: line }));
}

function normalizeNewlines(text: string): string {
  return text.replace(/\r\n?/g, '\n');
}

/** SSR 경고 없이 브라우저에서만 layout effect 를 쓴다. */
const useBrowserLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

function isPrintableKey(e: React.KeyboardEvent): boolean {
  return e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey;
}

/**
 * IME 조합 중 keydown 은 상태 머신 입력으로 취급하지 않는다.
 * `keyCode === 229` 는 deprecated 지만 **의도적**이다 — 일부 브라우저는 조합 첫 keydown 에
 * `isComposing` 을 아직 세우지 않고 229 만 보낸다. 두 신호를 OR 로 봐야 첫 글자가 새지 않는다.
 */
function isCompositionKey(e: React.KeyboardEvent): boolean {
  return e.nativeEvent.isComposing || e.keyCode === 229;
}

export function useLineStateMachine(options: UseLineStateMachineOptions) {
  const [lines, setLinesState] = useState<EditorLine[]>(() => splitDocument(options.value));
  const [activeLineId, setActiveLineIdState] = useState<number | null>(null);
  const [activeMode, setActiveModeState] = useState<LineMode | null>(null);
  const [flashLineId, setFlashLineId] = useState<number | null>(null);

  const linesRef = useRef(lines);
  const activeLineIdRef = useRef(activeLineId);
  const activeModeRef = useRef(activeMode);
  const lastDocRef = useRef(options.value);
  const composingRef = useRef(false);
  const switchingRef = useRef(false);
  const pendingCaretRef = useRef<number | null>(null);
  const forceHistoryBoundaryRef = useRef(false);
  const textAtActivationRef = useRef('');
  const renderSettleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const flashTimerRef = useRef<NodeJS.Timeout | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const historyRef = useRef(createEditorHistory());
  const fireRenderSettleRef = useRef<() => void>(() => {});

  // 콜백/옵션은 ref 로 들고 다닌다 (레포 관례 — useMemoSocket 과 동일 패턴).
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  const groups = useMemo(() => buildLineGroups(lines), [lines]);

  /**
   * 라인 단위 편집이 허용되는 id 집합을 그 시점의 linesRef 로 계산한다.
   * 분할/병합 직후처럼 커밋 전에 물어보는 경로가 있어 렌더 결과를 캐시해 두면 한 커밋 뒤처진다.
   */
  const currentEditableIds = useCallback(
    () => editableLineIds(buildLineGroups(linesRef.current)),
    [],
  );

  const snapshot = useCallback((): EditorSnapshot => {
    return {
      lines: linesRef.current,
      activeLineId: activeLineIdRef.current,
      caret: textareaRef.current?.selectionStart ?? 0,
    };
  }, []);

  const commitHistory = useCallback(
    (coalesce: boolean) => {
      const forced = forceHistoryBoundaryRef.current;
      forceHistoryBoundaryRef.current = false;
      historyRef.current.commit(snapshot(), { coalesce: coalesce && !forced });
    },
    [snapshot],
  );

  /** 라인 배열을 교체하고 문서 문자열을 위로 올린다. 바이트 동일 왕복이 여기서 보장된다. */
  const commitLines = useCallback((next: EditorLine[]) => {
    linesRef.current = next;
    setLinesState(next);

    const text = linesToText(next);
    if (text !== lastDocRef.current) {
      lastDocRef.current = text;
      optionsRef.current.onChange(text);
    }
    return text;
  }, []);

  const clearRenderSettleTimer = useCallback(() => {
    if (renderSettleTimerRef.current) {
      clearTimeout(renderSettleTimerRef.current);
      renderSettleTimerRef.current = null;
    }
  }, []);

  const armRenderSettleTimer = useCallback(() => {
    clearRenderSettleTimer();
    renderSettleTimerRef.current = setTimeout(() => {
      fireRenderSettleRef.current();
    }, RENDER_SETTLE_MS);
  }, [clearRenderSettleTimer]);

  const setActive = useCallback((id: number | null, mode: LineMode | null) => {
    activeLineIdRef.current = id;
    activeModeRef.current = mode;
    setActiveLineIdState(id);
    setActiveModeState(mode);
  }, []);

  const deactivate = useCallback(() => {
    clearRenderSettleTimer();
    setActive(null, null);
  }, [clearRenderSettleTimer, setActive]);

  const findIndex = useCallback((id: number | null) => {
    if (id == null) return -1;
    return linesRef.current.findIndex((line) => line.id === id);
  }, []);

  const activateLine = useCallback(
    (id: number, caret: number | null, mode: LineMode = 'editing') => {
      if (optionsRef.current.readOnly) return;
      if (!currentEditableIds().has(id)) return;

      clearRenderSettleTimer();
      switchingRef.current = true;
      pendingCaretRef.current = caret;
      textAtActivationRef.current = linesRef.current.find((line) => line.id === id)?.text ?? '';
      setActive(id, mode);
    },
    [clearRenderSettleTimer, currentEditableIds, setActive],
  );

  /** 자동 렌더 발화: 조합 중이면 재무장하고, 완결 패턴일 때만 focused-rendered 로 넘어간다. */
  const fireRenderSettle = useCallback(() => {
    renderSettleTimerRef.current = null;

    if (composingRef.current) {
      armRenderSettleTimer();
      return;
    }

    const id = activeLineIdRef.current;
    if (id == null || activeModeRef.current !== 'editing') return;

    const el = textareaRef.current;
    if (!el || document.activeElement !== el) return;

    const line = linesRef.current.find((item) => item.id === id);
    if (!line) return;

    const cls = classifyLine(line.text);
    if (!isAutoRenderTarget(cls) || !isCompletePattern(cls)) return;

    activeModeRef.current = 'focused-rendered';
    setActiveModeState('focused-rendered');
    forceHistoryBoundaryRef.current = true;

    setFlashLineId(id);
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => setFlashLineId(null), FLASH_MS);
  }, [armRenderSettleTimer]);

  useEffect(() => {
    fireRenderSettleRef.current = fireRenderSettle;
  }, [fireRenderSettle]);

  // 외부 갱신(소켓 수신 / 메모 전환)은 락 비보유 상태에서만 오므로 전체 재구성으로 단순 처리한다.
  useEffect(() => {
    if (options.value === lastDocRef.current) return;

    lastDocRef.current = options.value;
    const rebuilt = splitDocument(options.value);

    linesRef.current = rebuilt;
    setLinesState(rebuilt);
    clearRenderSettleTimer();
    setActive(null, null);
    historyRef.current.reset();
  }, [options.value, clearRenderSettleTimer, setActive]);

  // 활성 라인이 바뀌면 포커스와 캐럿을 적용한다.
  // useLayoutEffect 여야 전역 keydown → 포커스 이동 → 브라우저 기본 입력 순서가 지켜진다.
  useBrowserLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) {
      switchingRef.current = false;
      return;
    }

    if (document.activeElement !== el) {
      el.focus({ preventScroll: true });
    }

    const caret = pendingCaretRef.current;
    if (caret != null) {
      const position = Math.min(Math.max(caret, 0), el.value.length);
      el.setSelectionRange(position, position);
      pendingCaretRef.current = null;
    }

    switchingRef.current = false;
  }, [activeLineId, activeMode]);

  // 활성 라인 유무가 바뀔 때만 알린다 (락 유지/해제 판단 기준).
  const wasActiveRef = useRef(false);
  useEffect(() => {
    const isActive = activeMode !== null;
    if (wasActiveRef.current === isActive) return;
    wasActiveRef.current = isActive;
    optionsRef.current.onEditingChange?.(isActive);
  }, [activeMode]);

  useEffect(() => {
    return () => {
      if (renderSettleTimerRef.current) clearTimeout(renderSettleTimerRef.current);
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    };
  }, []);

  const updateMention = useCallback((el: HTMLTextAreaElement) => {
    const onMentionChange = optionsRef.current.onMentionChange;
    if (!onMentionChange) return;

    const beforeCaret = el.value.slice(0, el.selectionStart);
    const atIndex = beforeCaret.lastIndexOf('@');

    if (atIndex === -1) {
      onMentionChange(null);
      return;
    }

    const query = beforeCaret.slice(atIndex + 1);
    if (query.includes(' ')) {
      onMentionChange(null);
      return;
    }

    const rect = el.getBoundingClientRect();
    onMentionChange({ query, top: rect.bottom, left: rect.left + 100 });
  }, []);

  const closeMention = useCallback(() => {
    optionsRef.current.onMentionChange?.(null);
  }, []);

  /**
   * 활성 라인 안으로 개행이 들어온 경우의 안전망.
   * 전역 keydown 이 포커스만 옮기고 브라우저 기본 입력에 맡기는 설계이므로
   * 네이티브 Enter/붙여넣기/드래그 앤 드롭이 라인 텍스트에 '\n' 을 심을 수 있다.
   * 개행을 만나면 그 자리에서 라인을 쪼개 모델 불변식을 지킨다.
   */
  const absorbNewlines = useCallback(
    (index: number, text: string, caret: number) => {
      const parts = text.split('\n');
      const current = linesRef.current;
      const base = current[index];

      const inserted = parts.map((part, offset) => ({
        id: offset === 0 ? base.id : nextLineId(),
        text: part,
      }));

      const next = [...current.slice(0, index), ...inserted, ...current.slice(index + 1)];
      commitLines(next);

      const beforeCaret = text.slice(0, caret);
      const newlineCount = beforeCaret.split('\n').length - 1;
      const target = inserted[Math.min(newlineCount, inserted.length - 1)];
      const column = beforeCaret.length - (beforeCaret.lastIndexOf('\n') + 1);

      forceHistoryBoundaryRef.current = true;
      activateLine(target.id, column, 'editing');
    },
    [activateLine, commitLines],
  );

  const handleLineChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const el = e.target;
      const id = activeLineIdRef.current;
      if (id == null) return;

      const index = findIndex(id);
      if (index === -1) return;

      commitHistory(true);
      const text = el.value;

      if (text.includes('\n')) {
        clearRenderSettleTimer();
        closeMention();
        absorbNewlines(index, text, el.selectionStart);
        return;
      }

      const current = linesRef.current;
      const next = current.map((line) => (line.id === id ? { ...line, text } : line));
      commitLines(next);

      if (activeModeRef.current !== 'editing') {
        activeModeRef.current = 'editing';
        setActiveModeState('editing');
      }

      updateMention(el);

      // 조합 중에는 타이머를 걸지 않는다. compositionend 에서 다시 무장한다.
      if (composingRef.current) {
        clearRenderSettleTimer();
      } else {
        armRenderSettleTimer();
      }
    },
    [
      absorbNewlines,
      armRenderSettleTimer,
      clearRenderSettleTimer,
      closeMention,
      commitHistory,
      commitLines,
      findIndex,
      updateMention,
    ],
  );

  const enterEditing = useCallback((caret: number | null) => {
    clearRenderSettleTimer();
    pendingCaretRef.current = caret;
    activeModeRef.current = 'editing';
    setActiveModeState('editing');
  }, [clearRenderSettleTimer]);

  const splitLine = useCallback(
    (el: HTMLTextAreaElement) => {
      const id = activeLineIdRef.current;
      const index = findIndex(id);
      if (index === -1) return;

      commitHistory(false);

      const current = linesRef.current;
      const line = current[index];
      const before = line.text.slice(0, el.selectionStart);
      const after = line.text.slice(el.selectionEnd);
      const created: EditorLine = { id: nextLineId(), text: after };

      commitLines([
        ...current.slice(0, index),
        { ...line, text: before },
        created,
        ...current.slice(index + 1),
      ]);

      forceHistoryBoundaryRef.current = true;
      activateLine(created.id, 0, 'editing');
    },
    [activateLine, commitHistory, commitLines, findIndex],
  );

  const mergeWithPrevious = useCallback(() => {
    const id = activeLineIdRef.current;
    const index = findIndex(id);
    if (index <= 0) return;

    commitHistory(false);

    const current = linesRef.current;
    const previous = current[index - 1];
    const caret = previous.text.length;

    commitLines([
      ...current.slice(0, index - 1),
      { ...previous, text: previous.text + current[index].text },
      ...current.slice(index + 1),
    ]);

    forceHistoryBoundaryRef.current = true;
    activateLine(previous.id, caret, 'editing');
  }, [activateLine, commitHistory, commitLines, findIndex]);

  const mergeWithNext = useCallback(() => {
    const id = activeLineIdRef.current;
    const index = findIndex(id);
    if (index === -1 || index >= linesRef.current.length - 1) return;

    commitHistory(false);

    const current = linesRef.current;
    const line = current[index];
    const caret = line.text.length;

    commitLines([
      ...current.slice(0, index),
      { ...line, text: line.text + current[index + 1].text },
      ...current.slice(index + 2),
    ]);

    forceHistoryBoundaryRef.current = true;
    activateLine(line.id, caret, 'editing');
  }, [activateLine, commitHistory, commitLines, findIndex]);

  /** 인접한 "편집 가능" 라인을 찾는다 — 코드 그룹 본문은 Monaco 소유이므로 건너뛴다. */
  const findAdjacentEditable = useCallback(
    (index: number, delta: number) => {
      const current = linesRef.current;
      const editable = currentEditableIds();
      for (let i = index + delta; i >= 0 && i < current.length; i += delta) {
        if (editable.has(current[i].id)) return current[i];
      }
      return null;
    },
    [currentEditableIds],
  );

  const applySnapshot = useCallback(
    (snap: EditorSnapshot) => {
      commitLines(snap.lines);
      if (snap.activeLineId != null && snap.lines.some((line) => line.id === snap.activeLineId)) {
        activateLine(snap.activeLineId, snap.caret, 'editing');
      } else {
        deactivate();
      }
    },
    [activateLine, commitLines, deactivate],
  );

  const undo = useCallback(() => {
    const snap = historyRef.current.undo(snapshot());
    if (snap) applySnapshot(snap);
  }, [applySnapshot, snapshot]);

  const redo = useCallback(() => {
    const snap = historyRef.current.redo(snapshot());
    if (snap) applySnapshot(snap);
  }, [applySnapshot, snapshot]);

  const handleLineKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      const el = e.currentTarget;
      if (optionsRef.current.mentionActive && optionsRef.current.onMentionKeyDown?.(e)) {
        return;
      }

      if (isCompositionKey(e)) return;

      const id = activeLineIdRef.current;
      const index = findIndex(id);
      if (id == null || index === -1) return;

      const line = linesRef.current[index];
      const mode = activeModeRef.current;

      if (e.key === 'Escape') {
        e.preventDefault();
        closeMention();
        deactivate();
        el.blur();
        return;
      }

      if ((e.metaKey || e.ctrlKey) && (e.key === 'z' || e.key === 'Z')) {
        if (e.shiftKey) {
          e.preventDefault();
          redo();
          return;
        }
        // 활성 라인 안에서 타이핑한 내용이 남아 있으면 네이티브 undo 를 우선한다.
        if (mode === 'editing' && line.text !== textAtActivationRef.current) return;
        e.preventDefault();
        undo();
        return;
      }

      if (mode === 'focused-rendered') {
        if (e.key === 'Backspace') {
          // 삭제 없이 소스 복귀만 — 이 키는 여기서 소비된다.
          e.preventDefault();
          enterEditing(line.text.length);
          return;
        }

        if (e.key === 'Enter') {
          e.preventDefault();
          enterEditing(line.text.length);
          const created: EditorLine = { id: nextLineId(), text: '' };
          commitHistory(false);
          commitLines([
            ...linesRef.current.slice(0, index + 1),
            created,
            ...linesRef.current.slice(index + 1),
          ]);
          forceHistoryBoundaryRef.current = true;
          activateLine(created.id, 0, 'editing');
          return;
        }

        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          const target = findAdjacentEditable(index, e.key === 'ArrowUp' ? -1 : 1);
          if (!target) return;
          e.preventDefault();
          activateLine(target.id, Math.min(el.selectionStart, target.text.length), 'editing');
          return;
        }

        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          e.preventDefault();
          enterEditing(e.key === 'ArrowLeft' ? 0 : line.text.length);
          return;
        }

        if (isPrintableKey(e)) {
          // preventDefault 하지 않는다 — 캐럿만 끝으로 옮기고 입력은 브라우저에 맡긴다.
          el.setSelectionRange(line.text.length, line.text.length);
          enterEditing(null);
        }
        return;
      }

      if (mode !== 'editing') return;

      if (e.key === 'Enter') {
        e.preventDefault();
        closeMention();
        splitLine(el);
        return;
      }

      if (e.key === 'Backspace' && el.selectionStart === 0 && el.selectionEnd === 0) {
        if (index === 0) return;
        e.preventDefault();
        mergeWithPrevious();
        return;
      }

      if (
        e.key === 'Delete' &&
        el.selectionStart === line.text.length &&
        el.selectionEnd === line.text.length
      ) {
        if (index >= linesRef.current.length - 1) return;
        e.preventDefault();
        mergeWithNext();
        return;
      }

      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        const target = findAdjacentEditable(index, e.key === 'ArrowUp' ? -1 : 1);
        if (!target) return;
        e.preventDefault();
        closeMention();
        activateLine(target.id, Math.min(el.selectionStart, target.text.length), 'editing');
      }
    },
    [
      activateLine,
      closeMention,
      commitHistory,
      commitLines,
      deactivate,
      enterEditing,
      findAdjacentEditable,
      findIndex,
      mergeWithNext,
      mergeWithPrevious,
      redo,
      splitLine,
      undo,
    ],
  );

  const handleCompositionStart = useCallback(() => {
    composingRef.current = true;
    clearRenderSettleTimer();

    const id = activeLineIdRef.current;
    if (id != null && activeModeRef.current === 'focused-rendered') {
      const line = linesRef.current.find((item) => item.id === id);
      const el = textareaRef.current;
      if (line && el) {
        el.setSelectionRange(line.text.length, line.text.length);
      }
      enterEditing(null);
    }
  }, [clearRenderSettleTimer, enterEditing]);

  const handleCompositionEnd = useCallback(() => {
    composingRef.current = false;
    if (activeModeRef.current === 'editing') {
      armRenderSettleTimer();
    }
  }, [armRenderSettleTimer]);

  const handleLineBlur = useCallback(() => {
    if (composingRef.current) return;
    if (switchingRef.current) return;
    closeMention();
    deactivate();
  }, [closeMention, deactivate]);

  const handleLinePaste = useCallback(() => {
    // 붙여넣기는 커밋 경계 — 다음 change 가 타이핑과 병합되지 않게 한다.
    // 여러 줄은 handleLineChange 의 개행 안전망이 라인 분할로 흡수한다.
    forceHistoryBoundaryRef.current = true;
  }, []);

  const handleLineActivate = useCallback(
    (id: number, caret: number | null) => {
      activateLine(id, caret, 'editing');
    },
    [activateLine],
  );

  const handleToggleCheckbox = useCallback(
    (id: number) => {
      const index = findIndex(id);
      if (index === -1) return;

      const current = linesRef.current;
      const line = current[index];
      // 문서 전체 토글 함수를 한 줄짜리 문서로 재사용해 기존 동작과 동일함을 보장한다.
      const nextText = toggleCheckbox(line.text, 0);
      if (nextText === line.text) return;

      commitHistory(false);
      const text = commitLines(
        current.map((item) => (item.id === id ? { ...item, text: nextText } : item)),
      );
      forceHistoryBoundaryRef.current = true;
      optionsRef.current.onPersist?.(text);
    },
    [commitHistory, commitLines, findIndex],
  );

  const setCodeGroupBody = useCallback(
    (openLineId: number, code: string) => {
      const current = linesRef.current;
      const openIndex = current.findIndex((line) => line.id === openLineId);
      if (openIndex === -1) return;

      const group = buildLineGroups(current).find(
        (item): item is Extract<LineGroup, { type: 'code' }> =>
          item.type === 'code' && item.open.id === openLineId,
      );
      if (!group) return;

      const bodyLength = group.body.length;
      const replacement = normalizeNewlines(code)
        .split('\n')
        .map((text) => ({ id: nextLineId(), text }));

      commitHistory(false);
      commitLines([
        ...current.slice(0, openIndex + 1),
        ...replacement,
        ...current.slice(openIndex + 1 + bodyLength),
      ]);
      forceHistoryBoundaryRef.current = true;
    },
    [commitHistory, commitLines],
  );

  /** Monaco 헤더의 언어 선택을 여는 펜스 라인에 되쓴다 (선택이 문서에 남아야 다음에도 유지된다). */
  const setCodeGroupLanguage = useCallback(
    (openLineId: number, language: string) => {
      const current = linesRef.current;
      const index = current.findIndex((line) => line.id === openLineId);
      if (index === -1) return;

      const nextText = formatCodeFence(language);
      if (current[index].text === nextText) return;

      commitHistory(false);
      commitLines(
        current.map((line, i) => (i === index ? { ...line, text: nextText } : line)),
      );
      forceHistoryBoundaryRef.current = true;
    },
    [commitHistory, commitLines],
  );

  const focusLastLine = useCallback(() => {
    const current = linesRef.current;
    const editable = currentEditableIds();
    for (let i = current.length - 1; i >= 0; i--) {
      if (editable.has(current[i].id)) {
        const target = current[i];
        // 전역 keydown 은 React 이벤트 밖이라 flushSync 로 포커스를 즉시 옮겨야
        // 이어지는 브라우저 기본 입력이 이 textarea 에 들어간다.
        flushSync(() => activateLine(target.id, target.text.length, 'editing'));
        return;
      }
    }
  }, [activateLine, currentEditableIds]);

  const insertAtCaret = useCallback(
    (text: string, replaceFromLastAt: boolean) => {
      const el = textareaRef.current;
      const id = activeLineIdRef.current;
      const index = findIndex(id);
      if (!el || index === -1) return;

      const line = linesRef.current[index];
      const caret = el.selectionStart;
      const beforeCaret = line.text.slice(0, caret);
      const atIndex = replaceFromLastAt ? beforeCaret.lastIndexOf('@') : -1;
      const start = atIndex === -1 ? caret : atIndex;

      const nextText = line.text.slice(0, start) + text + line.text.slice(el.selectionEnd);

      commitHistory(false);
      commitLines(
        linesRef.current.map((item) => (item.id === id ? { ...item, text: nextText } : item)),
      );
      forceHistoryBoundaryRef.current = true;
      closeMention();
      activateLine(line.id, start + text.length, 'editing');
    },
    [activateLine, closeMention, commitHistory, commitLines, findIndex],
  );

  // 활성 라인 하나에만 전달되지만, 안정적이어야 LineView 의 memo 가 유지된다.
  // ref 는 여기 섞지 않는다 — 섞으면 객체 전체가 ref 취급돼 렌더 중 접근으로 잡힌다.
  const lineHandlers = useMemo(
    () => ({
      onChange: handleLineChange,
      onKeyDown: handleLineKeyDown,
      onCompositionStart: handleCompositionStart,
      onCompositionEnd: handleCompositionEnd,
      onBlur: handleLineBlur,
      onPaste: handleLinePaste,
    }),
    [
      handleCompositionEnd,
      handleCompositionStart,
      handleLineBlur,
      handleLineChange,
      handleLineKeyDown,
      handleLinePaste,
    ],
  );

  return {
    lines,
    groups,
    activeLineId,
    activeMode,
    flashLineId,
    textareaRef,
    activateLine: handleLineActivate,
    deactivate,
    focusLastLine,
    insertAtCaret,
    setCodeGroupBody,
    setCodeGroupLanguage,
    toggleCheckboxLine: handleToggleCheckbox,
    undo,
    redo,
    lineHandlers,
  };
}

export type LineStateMachine = ReturnType<typeof useLineStateMachine>;
export type LineHandlers = LineStateMachine['lineHandlers'];
