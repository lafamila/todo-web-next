'use client';

import React, { useEffect, useImperativeHandle } from 'react';
import { MonacoCodeEditor } from '@/components/editor/MonacoCodeEditor';
import { assertClassifierMatchesParseContent } from './classifyLine';
import { LineView } from './LineView';
import { useLineStateMachine, type MentionState } from './useLineStateMachine';

export type { MentionState };

export interface InlineEditorHandle {
  /** 전역 "아무 키나 누르면 편집 시작" 진입점 — 마지막 라인을 editing 으로 만든다. */
  focusLastLine: () => void;
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
    readOnly,
  });

  const { activeLineId, activeMode, flashLineId, groups } = machine;

  useImperativeHandle(
    ref,
    () => ({
      focusLastLine: machine.focusLastLine,
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

  return (
    <div className="flex flex-col">
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
