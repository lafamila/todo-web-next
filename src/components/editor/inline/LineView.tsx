'use client';

import React, { memo, useEffect, useLayoutEffect } from 'react';
import { CheckboxBlock, MarkdownBlock } from '@/components/editor/blocks/ContentBlocks';
import { indentStyle } from '@/lib/lineMarks';
import { cn } from '@/lib/utils';
import { classifyLine, type EditorLine } from './classifyLine';
import type { LineHandlers, LineMode } from './useLineStateMachine';

interface CaretPositionSource {
  caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  caretRangeFromPoint?: (x: number, y: number) => Range | null;
}

/**
 * 클릭 지점을 소스 문자열 오프셋으로 근사한다.
 * 렌더 결과와 소스가 다른 라인(마크다운 변환)에서는 실패할 수 있으므로 라인 끝으로 폴백한다 —
 * UX 저하일 뿐 데이터는 안전하다.
 *
 * 표준 `caretPositionFromPoint` 를 먼저 쓰고, deprecated `caretRangeFromPoint` 를 **의도적으로**
 * 폴백에 남긴다 — 구버전 WebKit 은 표준 API 를 제공하지 않는다. 둘 다 optional call 이라
 * 미지원 환경에서도 라인 끝 폴백으로 안전하게 떨어진다.
 */
function approximateCaret(text: string, clientX: number, clientY: number): number {
  const source = document as Document & CaretPositionSource;

  const position = source.caretPositionFromPoint?.(clientX, clientY);
  if (position?.offsetNode?.nodeType === Node.TEXT_NODE) {
    const nodeText = position.offsetNode.textContent ?? '';
    const base = text.indexOf(nodeText);
    if (base >= 0) return Math.min(base + position.offset, text.length);
  }

  const range = source.caretRangeFromPoint?.(clientX, clientY);
  if (range?.startContainer?.nodeType === Node.TEXT_NODE) {
    const nodeText = range.startContainer.textContent ?? '';
    const base = text.indexOf(nodeText);
    if (base >= 0) return Math.min(base + range.startOffset, text.length);
  }

  return text.length;
}

const useBrowserLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export interface LineViewProps {
  line: EditorLine;
  /** null 이면 rendered 상태 (활성 라인이 아님) */
  mode: LineMode | null;
  flash: boolean;
  readOnly: boolean;
  onActivate: (lineId: number, caret: number | null) => void;
  onToggleCheckbox: (lineId: number) => void;
  /** 활성 라인에만 전달된다. */
  handlers?: LineHandlers;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  /** 코드펜스 라인은 원문 그대로 보여주고 자동 렌더 대상에서 제외된다. */
  asFence?: boolean;
}

function LineViewImpl({
  line,
  mode,
  flash,
  readOnly,
  onActivate,
  onToggleCheckbox,
  handlers,
  textareaRef,
  asFence = false,
}: LineViewProps) {
  const cls = classifyLine(line.text);
  const isEditing = mode === 'editing';
  const showRendered = !isEditing;
  // 펜스 라인은 비활성일 때 화면에서 감춘다 — 언어/코드는 아래 Monaco 가 대신 보여준다.
  // 활성(방향키 진입 등)일 때만 원문을 드러내 편집·삭제할 수 있게 한다.
  const fenceCollapsed = asFence && mode === null;

  // 활성 라인 textarea 자동 높이 — 내용에 맞춰 늘어난다.
  useBrowserLayoutEffect(() => {
    if (!handlers) return;
    const el = textareaRef.current;
    if (!el) return;
    if (mode === 'focused-rendered') {
      el.style.height = '';
      return;
    }
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [handlers, line.text, mode, textareaRef]);

  /**
   * 한 번 클릭으로 캐럿이 들어간다.
   * "빈 줄에서 커서가 안 보인다"의 실제 원인은 더블클릭 전까지 아무것도 포커스되지 않는 것이었다
   * (캐럿 자체는 정상적으로 깜빡인다).
   */
  const activateFromPointer = (e: React.MouseEvent<HTMLDivElement>) => {
    if (readOnly || isEditing) return;
    // 링크·버튼·코드편집기 클릭은 그쪽 동작이 우선 (체크박스 글리프는 자체적으로 전파를 막는다).
    if ((e.target as HTMLElement).closest?.('a, button, input, select, .monaco-editor')) return;
    // 드래그로 만든 선택은 한 번 클릭으로 지우지 않는다 — 서피스의 mouseup 이 Raw 모드로 승격한다.
    // 더블클릭은 브라우저가 단어를 선택한 상태로 오므로 예외다(그 자리를 편집으로 연다).
    const selection = typeof window === 'undefined' ? null : window.getSelection();
    if (e.detail < 2 && selection && !selection.isCollapsed) return;
    onActivate(line.id, approximateCaret(line.text, e.clientX, e.clientY));
  };

  const renderBlock = () => {
    if (asFence) {
      if (fenceCollapsed) return null;
      return <span className="font-mono text-xs text-gray-500">{line.text || '```'}</span>;
    }

    switch (cls.kind) {
      case 'checkbox-checked':
      case 'checkbox-unchecked':
        return (
          <CheckboxBlock
            checked={cls.checked}
            content={cls.content}
            onToggle={readOnly ? undefined : () => onToggleCheckbox(line.id)}
          />
        );
      case 'blank':
        return <br />;
      default:
        // 들여쓰기를 뺀 본문을 넘긴다 — 4칸 이상 남아 있으면 마크다운이 코드 블록으로 읽는다.
        return <MarkdownBlock>{cls.content}</MarkdownBlock>;
    }
  };

  /** 렌더 결과에만 들여쓰기를 준다 (편집 중인 줄은 원문 공백이 그대로 보인다). */
  const renderIndentedBlock = () => {
    const indent = indentStyle(cls.indent);
    if (!indent) return renderBlock();
    return <div style={indent}>{renderBlock()}</div>;
  };

  return (
    <div
      className={cn(
        'editor-line relative px-1',
        cls.kind === 'blank' && !isEditing && 'min-h-[1em]',
        isEditing && 'editor-line-editing',
        mode === 'focused-rendered' && 'editor-line-focused',
        flash && 'editor-line-flash',
        fenceCollapsed && 'editor-line-fence-collapsed',
      )}
      data-line-id={line.id}
      onClick={activateFromPointer}
      onDoubleClick={activateFromPointer}
    >
      {showRendered && renderIndentedBlock()}
      {handlers && (
        <textarea
          ref={textareaRef}
          rows={1}
          spellCheck={false}
          value={line.text}
          onChange={handlers.onChange}
          onKeyDown={handlers.onKeyDown}
          onCompositionStart={handlers.onCompositionStart}
          onCompositionEnd={handlers.onCompositionEnd}
          onBlur={handlers.onBlur}
          onPaste={handlers.onPaste}
          className={cn(
            'editor-line-input',
            asFence && 'editor-line-input-fence',
            !isEditing && 'editor-line-input-overlay',
          )}
          aria-label="라인 편집"
        />
      )}
    </div>
  );
}

export const LineView = memo(LineViewImpl);
