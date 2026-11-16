'use client';

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { BoxTableBlock } from '@/components/editor/blocks/ContentBlocks';
import {
  insertBoxTableColumn,
  insertBoxTableRow,
  updateBoxTableCell,
  type BoxTableData,
  type BoxTableMutationResult,
} from '@/lib/boxTable';
import { isMemoHistoryShortcut } from '@/lib/memoDocumentHistory';
import type { EditorLine } from './classifyLine';
import type { InlineDocumentChange } from './useLineStateMachine';

type Cell = { lineId: number; column: number };
type TableAction =
  | { kind: 'cell'; row: number; column: number; caret?: number }
  | { kind: 'row'; boundary: number }
  | { kind: 'column'; boundary: number };

interface TableEditorProps {
  lines: EditorLine[];
  table: BoxTableData;
  documentSnapshot: string;
  readOnly: boolean;
  onRequestWrite?: () => void;
  onChange: (expectedRaw: string, result: BoxTableMutationResult, change: InlineDocumentChange) => boolean;
  onActivate: () => void;
  onEditingChange: (active: boolean) => void;
  onHistoryShortcut?: (action: 'undo' | 'redo') => void;
  onSave: () => void;
}

interface ControlPosition {
  kind: 'row' | 'column';
  boundary: number;
  edge: string;
  left: number;
  top: number;
}

/** 셀 textarea만 활성화한다. 원문/초안/Undo의 소유자는 여전히 상위 메모다. */
export function TableEditor({
  lines, table, documentSnapshot, readOnly, onRequestWrite,
  onChange, onActivate, onEditingChange, onHistoryShortcut, onSave,
}: TableEditorProps) {
  const [active, setActive] = useState<Cell | null>(null);
  // 셀 가장자리 공백은 기존 표 문법에서 padding이다. 입력 중에는 원문 parser의 trim과
  // 분리된 버퍼를 유지해 "hello " 다음 입력이 "helloworld"로 붙지 않게 한다.
  const [cellBuffer, setCellBuffer] = useState<{ lineId: number; column: number; raw: string; value: string } | null>(null);
  const [controls, setControls] = useState<ControlPosition[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const composingRef = useRef(false);
  const compositionScopeRef = useRef<{ raw: string; document: string } | null>(null);
  const pendingCaretRef = useRef<number | null>(null);
  const pendingRef = useRef<{
    raw: string; document: string; action: TableAction; requestedAt: number;
  } | null>(null);
  const focusReportedRef = useRef(false);
  const callbackRef = useRef(onEditingChange);
  const raw = lines.map((line) => line.text).join('\n');
  const writable = !readOnly;
  const interactive = writable || Boolean(onRequestWrite);
  const activeRow = active
    ? table.rows.findIndex((row) => lines[row.lineOffset]?.id === active.lineId)
    : -1;
  const activeValue = active && activeRow >= 0 ? table.rows[activeRow].cells[active.column] : undefined;
  const inputValue = active && cellBuffer?.lineId === active.lineId && cellBuffer.column === active.column && cellBuffer.raw === raw
    ? cellBuffer.value : activeValue;

  useEffect(() => { callbackRef.current = onEditingChange; }, [onEditingChange]);
  useEffect(() => {
    // Undo/원격 변경에서 폐기한 임시 공백이 나중의 Redo에서 되살아나지 않게 한다.
    setCellBuffer((buffer) => buffer && buffer.raw !== raw ? null : buffer);
  }, [raw]);
  useEffect(() => () => {
    if (focusReportedRef.current) callbackRef.current(false);
  }, []);

  const reportFocus = (focused: boolean) => {
    const next = focused && writable;
    if (focusReportedRef.current === next) return;
    focusReportedRef.current = next;
    onEditingChange(next);
  };

  const applyAction = (action: TableAction) => {
    if (readOnly) {
      if (!onRequestWrite) return;
      pendingRef.current = { raw, document: documentSnapshot, action, requestedAt: Date.now() };
      onRequestWrite();
      return;
    }
    onActivate();
    if (action.kind === 'cell') {
      const row = table.rows[action.row];
      if (row && action.column >= 0 && action.column < table.columnCount) {
        pendingCaretRef.current = action.caret ?? 0;
        setCellBuffer(null);
        setActive({ lineId: lines[row.lineOffset].id, column: action.column });
      }
      return;
    }
    if (composingRef.current) return;
    const source = lines.map((line) => line.text);
    const result = action.kind === 'row'
      ? insertBoxTableRow(source, action.boundary)
      : insertBoxTableColumn(source, action.boundary);
    if (result?.changed) {
      onChange(raw, result, { group: `inline:table:${lines[0].id}:${action.kind}`, coalesce: false });
      setActive(null);
    }
  };

  // 잠금 대기는 문서/표가 바뀌면 폐기한다. grant 뒤 같은 의도만 한 번 재생한다.
  useEffect(() => {
    const pending = pendingRef.current;
    if (!pending) return;
    if (!interactive || pending.document !== documentSnapshot || pending.raw !== raw ||
      Date.now() - pending.requestedAt > 5000) {
      pendingRef.current = null;
      return;
    }
    if (readOnly) return;
    pendingRef.current = null;
    applyAction(pending.action);
  });

  useEffect(() => {
    if (readOnly) {
      composingRef.current = false;
      compositionScopeRef.current = null;
      setActive(null);
      setCellBuffer(null);
      inputRef.current?.blur();
      if (focusReportedRef.current) {
        focusReportedRef.current = false;
        callbackRef.current(false);
      }
    } else if (rootRef.current?.contains(document.activeElement) && !focusReportedRef.current) {
      focusReportedRef.current = true;
      callbackRef.current(true);
    }
  }, [readOnly]);

  useLayoutEffect(() => {
    if (!writable || activeRow < 0 || !active) return;
    const input = inputRef.current;
    input?.focus({ preventScroll: true });
    if (input && pendingCaretRef.current !== null) {
      const caret = Math.min(pendingCaretRef.current, input.value.length);
      input.setSelectionRange(caret, caret);
      pendingCaretRef.current = null;
    }
  }, [active, activeRow, writable]);

  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = '0px';
    input.style.height = `${input.scrollHeight}px`;
  }, [inputValue]);

  // 컨트롤은 스크롤 영역의 형제다. 가로 스크롤 중에도 바깥쪽 +를 자르지 않는다.
  useLayoutEffect(() => {
    const root = rootRef.current;
    const scroll = root?.querySelector<HTMLElement>('.box-table-scroll');
    const element = scroll?.querySelector('table');
    if (!root || !scroll || !element || !interactive) return;
    const measure = () => {
      const outer = root.getBoundingClientRect();
      const viewport = scroll.getBoundingClientRect();
      const rows = Array.from(element.querySelectorAll('tr'));
      const cells = Array.from(rows[0]?.cells ?? []);
      if (!cells.length) return;
      const next: ControlPosition[] = [];
      const top = element.getBoundingClientRect().top - outer.top - 11;
      const bottom = element.getBoundingClientRect().bottom - outer.top + 11;
      const boundaries = [...cells.map((cell) => cell.getBoundingClientRect().left), cells[cells.length - 1].getBoundingClientRect().right];
      boundaries.forEach((x, boundary) => {
        if (x < viewport.left - 1 || x > viewport.right + 1) return;
        for (const [edge, y] of [['top', top], ['bottom', bottom]] as const) {
          next.push({ kind: 'column', boundary, edge, left: x - outer.left, top: y });
        }
      });
      const firstBoundary = table.headerRowCount ? 1 : 0;
      for (let boundary = firstBoundary; boundary <= rows.length; boundary++) {
        const y = boundary === rows.length
          ? rows[rows.length - 1].getBoundingClientRect().bottom
          : rows[boundary].getBoundingClientRect().top;
        for (const [edge, x] of [['left', viewport.left - 11], ['right', viewport.right + 11]] as const) {
          next.push({ kind: 'row', boundary, edge, left: x - outer.left, top: y - outer.top });
        }
      }
      setControls((previous) => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    observer.observe(element);
    scroll.addEventListener('scroll', measure, { passive: true });
    return () => { observer.disconnect(); scroll.removeEventListener('scroll', measure); };
  }, [raw, interactive, table.headerRowCount]);

  const handleCellKey = (event: KeyboardEvent<HTMLTextAreaElement>, row: number, column: number) => {
    if (event.nativeEvent.isComposing || event.keyCode === 229 || composingRef.current) return;
    const history = isMemoHistoryShortcut(event.nativeEvent);
    if (history) {
      event.preventDefault();
      event.stopPropagation();
      onHistoryShortcut?.(history);
    } else if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === 's') {
      event.preventDefault();
      event.stopPropagation();
      onSave();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setActive(null);
      inputRef.current?.blur();
    } else if (event.key === 'Tab') {
      const next = row * table.columnCount + column + (event.shiftKey ? -1 : 1);
      if (next < 0 || next >= table.rows.length * table.columnCount) return;
      event.preventDefault();
      applyAction({ kind: 'cell', row: Math.floor(next / table.columnCount), column: next % table.columnCount });
    }
  };

  const commitCell = (row: number, column: number, value: string) => {
    if (readOnly || !active) return;
    const result = updateBoxTableCell(lines.map((line) => line.text), row, column, value);
    if (!result) return;
    const nextRaw = result.lines.join('\n');
    if (nextRaw !== raw && !onChange(raw, result, {
      group: `inline:table:${lines[0].id}:cell:${active.lineId}:${column}`, coalesce: true,
    })) return;
    setCellBuffer({ ...active, raw: nextRaw, value });
  };

  const finishComposition = (row: number, column: number, value: string) => {
    const scope = compositionScopeRef.current;
    composingRef.current = false;
    compositionScopeRef.current = null;
    if (scope?.raw === raw && scope.document === documentSnapshot) commitCell(row, column, value);
    else setCellBuffer(null);
  };

  return (
    <div
      ref={rootRef}
      className={`box-table-editor${interactive ? ' box-table-editor--interactive' : ''}`}
      tabIndex={-1}
      data-editor-activity-surface="table"
      onFocusCapture={() => reportFocus(true)}
      onBlurCapture={(event) => {
        if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
        reportFocus(false);
        setActive(null);
        setCellBuffer(null);
      }}
    >
      <BoxTableBlock
        table={table}
        sourceLineIds={lines.map((line) => line.id)}
        onActivateCell={interactive ? (row, column, caret) => applyAction({ kind: 'cell', row, column, caret }) : undefined}
        renderCell={(row, column, content) => writable && activeRow === row && active?.column === column ? (
          <span className="box-table-active-cell">
            <span className="box-table-cell-layout" aria-hidden="true">{cellBuffer ? inputValue : content}</span>
            <textarea
            key={`${active.lineId}:${column}`}
            ref={inputRef}
            className="box-table-cell-input"
            data-editor-activity-surface="table-cell"
            aria-label={`${row + 1}행 ${column + 1}열 내용`}
            value={inputValue ?? ''}
            rows={1}
            onClick={(event) => event.stopPropagation()}
            onCompositionStart={(event) => {
              composingRef.current = true;
              compositionScopeRef.current = { raw, document: documentSnapshot };
              setCellBuffer({ ...active, raw, value: event.currentTarget.value });
            }}
            onCompositionEnd={(event) => finishComposition(row, column, event.currentTarget.value)}
            onBlur={(event) => {
              if (composingRef.current) finishComposition(row, column, event.currentTarget.value);
            }}
            onKeyDown={(event) => handleCellKey(event, row, column)}
            onChange={(event) => {
              if (readOnly) return;
              if (composingRef.current || (event.nativeEvent as InputEvent).isComposing) {
                setCellBuffer({ ...active, raw, value: event.currentTarget.value });
                return;
              }
              const inputType = (event.nativeEvent as InputEvent).inputType;
              if (inputType === 'historyUndo' || inputType === 'historyRedo') {
                onHistoryShortcut?.(inputType === 'historyUndo' ? 'undo' : 'redo');
                return;
              }
              commitCell(row, column, event.target.value);
            }}
            />
          </span>
        ) : content}
      />
      {interactive && controls.map((control) => (
        <button
          key={`${control.kind}:${control.edge}:${control.boundary}`}
          type="button"
          className={`box-table-insert box-table-insert--${control.edge}`}
          data-editor-activity-surface="table-control"
          aria-label={`${control.kind === 'row' ? '행' : '열'} 추가: ${control.boundary + 1}번째 위치 (${control.edge})`}
          style={{ left: control.left, top: control.top }}
          onClick={(event) => { event.stopPropagation(); applyAction(control); }}
        >+</button>
      ))}
    </div>
  );
}
