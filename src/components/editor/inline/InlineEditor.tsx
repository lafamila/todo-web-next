'use client';

import React, { useEffect, useImperativeHandle, useRef } from 'react';
import { MonacoCodeEditor } from '@/components/editor/MonacoCodeEditor';
import { assertClassifierMatchesParseContent } from './classifyLine';
import { LineView } from './LineView';
import { useLineStateMachine, type MentionState } from './useLineStateMachine';

export type { MentionState };

export interface InlineEditorHandle {
  /** 전역 "아무 키나 누르면 편집 시작" 진입점 — 마지막 라인을 editing 으로 만든다. */
  focusLastLine: () => void;
  /** Raw 모드에서 돌아올 때 캐럿이 있던 문서 오프셋의 줄을 편집 상태로 만든다. */
  focusOffset: (offset: number) => void;
  /** @ 검색으로 고른 메모 링크를 활성 라인의 `@쿼리` 자리에 넣는다. */
  insertMemoLink: (linkText: string) => void;
  isActive: () => boolean;
}

export interface InlineEditorProps {
  ref?: React.Ref<InlineEditorHandle>;
  value: string;
  onChange: (next: string) => void;
  /** 체크박스 토글처럼 즉시 서버 반영이 필요한 변경. */
  onPersist?: (next: string) => void;
  onSave: () => void;
  onEditingChange?: (editing: boolean) => void;
  onMentionChange?: (state: MentionState | null) => void;
  mentionActive?: boolean;
  onMentionKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => boolean;
  /** Cmd/Ctrl+A — 문서 전체 선택은 단일 텍스트 서피스(Raw 모드)가 필요하다. */
  onSelectAll?: () => void;
  /** Shift+↑/↓ — 줄을 넘는 선택도 같은 이유로 Raw 모드가 이어받는다. */
  onSelectRange?: (anchor: number, focus: number) => void;
  readOnly?: boolean;
}

/**
 * 편집기/뷰어 분리가 없는 단일 서피스.
 * 활성 라인 1개만 textarea 로 살아 있고 나머지는 렌더된 블록이다.
 * 데이터 모델은 플레인 문자열 그대로이며 `content.split('\n')` ↔ `join('\n')` 바이트 동일 왕복이 불변식이다.
 */
export function InlineEditor({
  ref,
  value,
  onChange,
  onPersist,
  onSave,
  onEditingChange,
  onMentionChange,
  mentionActive,
  onMentionKeyDown,
  onSelectAll,
  onSelectRange,
  readOnly = false,
}: InlineEditorProps) {
  const machine = useLineStateMachine({
    value,
    onChange,
    onPersist,
    onEditingChange,
    onMentionChange,
    mentionActive,
    onMentionKeyDown,
    onSelectAll,
    onSelectRange,
    readOnly,
  });

  const { activeLineId, activeMode, flashLineId, groups } = machine;

  const surfaceRef = useRef<HTMLDivElement>(null);
  /** 드래그 중인지 — document mouseup 이 남의 선택까지 승격하지 않게 하는 게이트. */
  const draggingRef = useRef(false);
  const dragAnchorRef = useRef<{ lineId: number; column: number } | null>(null);
  const promoteRef = useRef<((event: MouseEvent) => void) | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      focusLastLine: machine.focusLastLine,
      focusOffset: machine.focusOffset,
      insertMemoLink: (linkText: string) => machine.insertAtCaret(linkText, true),
      isActive: () => machine.activeMode !== null,
    }),
    [machine],
  );

  // 신규 분류기가 기존 parseContent 와 같은 판정을 유지하는지 개발 모드에서만 감시한다.
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    assertClassifierMatchesParseContent(machine.lines);
  }, [machine.lines]);

  /** 본문 아래 빈 여백을 클릭하면 마지막 라인에 캐럿을 놓는다 (일반 에디터와 같은 기대). */
  const handleSurfaceClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (readOnly || e.target !== e.currentTarget) return;
    machine.focusLastLine();
  };

  /** DOM 선택 endpoint → 라인 오프셋. 서피스 밖 노드면 null (좌표 폴백이 이어받는다). */
  const endpointFromNode = (node: Node | null, offset: number) => {
    const element = node instanceof Element ? node : (node?.parentElement ?? null);
    // 코드편집기는 자체 선택 모델을 갖는다.
    if (!element || element.closest('.monaco-editor')) return null;

    const lineEl = element.closest<HTMLElement>('[data-line-id]');
    if (!lineEl || !surfaceRef.current?.contains(lineEl)) return null;

    const lineId = Number(lineEl.dataset.lineId);
    if (!Number.isFinite(lineId)) return null;

    const source = machine.lines.find((line) => line.id === lineId)?.text ?? '';
    const nodeText = node?.textContent ?? '';
    const base = nodeText ? source.indexOf(nodeText) : -1;
    return { lineId, column: base >= 0 ? base + offset : offset };
  };

  /**
   * 좌표 → 라인 오프셋 폴백.
   * 서피스 **밖에서** 마우스를 놓으면 선택 endpoint 노드가 우리 줄이 아니라 메모 목록·헤더 같은
   * 남의 DOM 을 가리킨다. 그때는 놓은 위치의 y 로 줄을 찾고(위/아래로 벗어나면 첫/마지막 줄),
   * x 로 줄 시작·끝을 정한다 — 일반 에디터가 여백으로 드래그했을 때와 같은 기대값이다.
   */
  const endpointFromPoint = (clientX: number, clientY: number) => {
    const root = surfaceRef.current;
    if (!root) return null;

    const lineEls = Array.from(root.querySelectorAll<HTMLElement>('[data-line-id]'));
    if (lineEls.length === 0) return null;

    let target = lineEls[0];
    let below = false;

    for (const el of lineEls) {
      target = el;
      const rect = el.getBoundingClientRect();
      if (clientY < rect.bottom) {
        below = false;
        break;
      }
      below = true;
    }

    const lineId = Number(target.dataset.lineId);
    const line = machine.lines.find((item) => item.id === lineId);
    if (!line) return null;

    const rect = target.getBoundingClientRect();
    // 아래로 벗어나면 문서 끝, 위로 벗어나면 문서 시작. 그 사이면 x 로 그 줄의 끝/시작을 고른다.
    const above = clientY < rect.top;
    const toLineEnd = below || (!above && clientX > rect.left);
    return { lineId, column: toLineEnd ? line.text.length : 0 };
  };

  /**
   * 마우스 드래그로 만든 선택을 Raw 모드로 승격한다.
   * 줄마다 textarea 가 따로라 렌더 화면의 DOM 선택은 복사하면 소스(`-- `·펜스·들여쓰기)가
   * 사라지므로, 드래그가 끝난 시점에 같은 범위를 원문 위 선택으로 옮긴다.
   *
   * `mouseup` 은 **document** 에서 받는다. 서피스 자신에게만 걸면 마우스를 스크롤 컨테이너 밖
   * (메모 목록·헤더 등)에서 놓았을 때 승격이 일어나지 않아 "될 때만 되는" 기능이 된다.
   */
  const promoteDragSelection = (event: MouseEvent) => {
    // 더블/트리플 클릭은 줄 편집 진입이 우선이다.
    if (readOnly || event.detail >= 2) return;

    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;

    const anchor =
      endpointFromNode(selection.anchorNode, selection.anchorOffset) ?? dragAnchorRef.current;
    const focus =
      endpointFromNode(selection.focusNode, selection.focusOffset) ??
      endpointFromPoint(event.clientX, event.clientY);
    if (!anchor || !focus) return;

    if (machine.selectDomRange(anchor, focus)) {
      // 렌더 화면의 하이라이트는 지운다 — 선택은 이제 원문 textarea 가 갖는다.
      selection.removeAllRanges();
    }
  };

  // 렌더 중 ref 를 쓰지 않는다 (React Compiler) — mouseup 은 페인트 이후라 이 시점 갱신으로 충분하다.
  useEffect(() => {
    promoteRef.current = promoteDragSelection;
  });

  /** 드래그 시작 지점을 기억한다 — 놓는 순간 anchor 노드가 남의 DOM 이어도 시작점은 지킨다. */
  const handleSurfaceMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (readOnly || e.button !== 0) return;

    const element = e.target instanceof Element ? e.target : null;
    // 라인 textarea·코드편집기 안에서 시작한 드래그는 그쪽의 네이티브 선택이다.
    if (element?.closest('textarea, .monaco-editor')) {
      draggingRef.current = false;
      dragAnchorRef.current = null;
      return;
    }

    draggingRef.current = true;
    dragAnchorRef.current = endpointFromPoint(e.clientX, e.clientY);
  };

  useEffect(() => {
    // 서피스 밖에서 시작한 드래그가 stale anchor 로 승격되지 않게 플래그를 내린다.
    const onDocumentMouseDown = (event: MouseEvent) => {
      const element = event.target instanceof Element ? event.target : null;
      if (!element || !surfaceRef.current?.contains(element)) {
        draggingRef.current = false;
        dragAnchorRef.current = null;
      }
    };

    const onDocumentMouseUp = (event: MouseEvent) => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      promoteRef.current?.(event);
    };

    document.addEventListener('mousedown', onDocumentMouseDown, true);
    document.addEventListener('mouseup', onDocumentMouseUp);
    return () => {
      document.removeEventListener('mousedown', onDocumentMouseDown, true);
      document.removeEventListener('mouseup', onDocumentMouseUp);
    };
  }, []);

  return (
    <div
      ref={surfaceRef}
      className="flex min-h-full flex-col"
      onClick={handleSurfaceClick}
      onMouseDown={handleSurfaceMouseDown}
    >
      {groups.map((group) => {
        if (group.type === 'code') {
          return (
            <div key={group.key} className="my-2">
              <LineView
                line={group.open}
                mode={group.open.id === activeLineId ? activeMode : null}
                flash={false}
                readOnly={readOnly}
                onActivate={machine.activateLine}
                onToggleCheckbox={machine.toggleCheckboxLine}
                textareaRef={machine.textareaRef}
                handlers={group.open.id === activeLineId ? machine.lineHandlers : undefined}
                asFence
              />
              <MonacoCodeEditor
                value={group.body.map((line) => line.text).join('\n')}
                language={group.language}
                onChange={(code) => machine.setCodeGroupBody(group.open.id, code)}
                onLanguageChange={
                  readOnly
                    ? undefined
                    : (language) => machine.setCodeGroupLanguage(group.open.id, language)
                }
                onSave={onSave}
                height="200px"
                readOnly={readOnly}
                autoFocus={group.open.id === machine.pendingCodeFocusId}
                onAutoFocused={machine.consumeCodeFocus}
                // 코드편집기에 커서가 있는 동안도 "편집 중" — 락이 6초 뒤 풀리면 안 된다.
                onFocusChange={onEditingChange}
              />
              {group.close && (
                <LineView
                  line={group.close}
                  mode={group.close.id === activeLineId ? activeMode : null}
                  flash={false}
                  readOnly={readOnly}
                  onActivate={machine.activateLine}
                  onToggleCheckbox={machine.toggleCheckboxLine}
                  textareaRef={machine.textareaRef}
                  handlers={group.close.id === activeLineId ? machine.lineHandlers : undefined}
                  asFence
                />
              )}
            </div>
          );
        }

        return (
          <LineView
            key={group.key}
            line={group.line}
            mode={group.line.id === activeLineId ? activeMode : null}
            flash={group.line.id === flashLineId}
            readOnly={readOnly}
            onActivate={machine.activateLine}
            onToggleCheckbox={machine.toggleCheckboxLine}
            textareaRef={machine.textareaRef}
            handlers={group.line.id === activeLineId ? machine.lineHandlers : undefined}
          />
        );
      })}
    </div>
  );
}
