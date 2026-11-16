'use client';

import { Fragment, useEffect, useRef, useState, type AnchorHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { BoxTableData } from '@/lib/boxTable';
import type { AttachmentPreviewState } from '@/lib/types';
import { TODO_API_BASE_URL } from '@/lib/constants';
import {
  attachmentWidthFromDrag,
  clampAttachmentWidthPercent,
  isAttachmentLayoutSnapshotCurrent,
  type AttachmentImageAlignment,
  type AttachmentResizeEdge,
} from '@/lib/attachmentImage';
import {
  analyzeMemoLine,
  safeMemoLinkTarget,
  shouldBypassMemoInline,
  tokenizeCheckboxInline,
  tokenizeMemoInline,
} from '@/lib/memoSyntax';

/**
 * 메모 본문 블록의 단일 표현.
 * 인라인 에디터의 rendered 라인과 게시글 뷰(ArticleDetail)가 같은 컴포넌트를 쓰므로
 * 편집 화면과 읽기 화면의 시각이 갈라지지 않는다 (워크스페이스 원칙 9).
 */

/** 본문 링크의 단일 표현 — 허용 목록 토큰과 앱 메모 링크가 같은 앵커를 쓴다. */
function ContentLink({
  href,
  children,
  ...props
}: { href?: string } & AnchorHTMLAttributes<HTMLAnchorElement>) {
  const safeHref = href ? safeMemoLinkTarget(href) : null;
  const isMemoLink = Boolean(safeHref && (safeHref.includes('memoId=') || safeHref.startsWith('?')));
  if (!safeHref) return <span>{children}</span>;
  return (
    <a
      href={safeHref}
      target="_blank"
      rel="noopener noreferrer"
      className={cn('hover:underline', isMemoLink ? 'text-white' : 'text-blue-300')}
      {...props}
    >
      {children}
    </a>
  );
}

/**
 * 확정된 인라인 허용 목록만 적용하는 경량 렌더러. 전체 Markdown 문법을 통과시키지 않으므로
 * 제거한 heading/emphasis/task/reference/escape/entity 문법은 원문 그대로 남는다.
 */
export function InlineMarks({ text, checkbox = false }: { text: string; checkbox?: boolean }) {
  const tokens = shouldBypassMemoInline(text)
    ? [{ type: 'text' as const, value: text }]
    : checkbox ? tokenizeCheckboxInline(text) : tokenizeMemoInline(text);
  return <>{tokens.map((token, index): ReactNode => {
    switch (token.type) {
      case 'strong':
        return <strong key={index}>{token.value}</strong>;
      case 'code':
        return <code key={index} className="memo-inline-code">{token.value}</code>;
      case 'link': {
        const safeTarget = safeMemoLinkTarget(token.target);
        return safeTarget
          ? <ContentLink key={index} href={safeTarget}>{token.value}</ContentLink>
          : <Fragment key={index}>{`[${token.value}](${token.target})`}</Fragment>;
      }
      case 'image': {
        const safeTarget = safeMemoLinkTarget(token.target);
        return safeTarget && (/^https?:/iu.test(safeTarget) || safeTarget.startsWith('/'))
          // eslint-disable-next-line @next/next/no-img-element -- user-authored external URL has no stable Next image loader contract
          ? <img key={index} src={safeTarget} alt={token.value} className="memo-external-image" />
          : <Fragment key={index}>{`![${token.value}](${token.target})`}</Fragment>;
      }
      default:
        return <Fragment key={index}>{token.value}</Fragment>;
    }
  })}</>;
}

function SourcePrefix({ source, visual }: { source: string; visual?: ReactNode }) {
  return (
    <span className="memo-source-prefix">
      <span className="memo-source-prefix-ghost" aria-hidden="true">{source}</span>
      {visual && <span className="memo-source-prefix-visual">{visual}</span>}
    </span>
  );
}

export interface MarkdownBlockProps {
  children: string;
  className?: string;
}

export function MarkdownBlock({ children, className }: MarkdownBlockProps) {
  const syntax = analyzeMemoLine(children);
  if (syntax.kind === 'rule') {
    return <div className={cn('memo-rendered-line memo-rule-line', className)}><span>{syntax.indent}</span><hr /></div>;
  }

  return (
    <div className={cn('memo-rendered-line', className)}>
      <span className="memo-leading-space" aria-hidden="true">{syntax.indent}</span>
      {syntax.kind === 'bullet' && <SourcePrefix source={syntax.prefix} visual="•" />}
      {syntax.kind === 'strike' && <SourcePrefix source={syntax.prefix} />}
      <span className={cn(syntax.kind === 'strike' && 'memo-slash-strike')}>
        <InlineMarks text={syntax.content} />
      </span>
    </div>
  );
}

export interface CheckboxBlockProps {
  checked: boolean;
  content: string;
  /** 원문에서 `-- `/`v-- ` 앞에 있던 실제 공백 수. */
  indent?: number;
  /** 없으면 읽기 전용 체크박스로 렌더된다. */
  onToggle?: () => void;
}

export function CheckboxBlock({ checked, content, indent = 0, onToggle }: CheckboxBlockProps) {
  const interactive = Boolean(onToggle);

  return (
    <div className="memo-rendered-line memo-checkbox-line">
      <span className="memo-leading-space" aria-hidden="true">{' '.repeat(indent)}</span>
      <SourcePrefix
        source={checked ? 'v-- ' : '-- '}
        visual={<button
        type="button"
        role="checkbox"
        aria-checked={checked}
        aria-label={content}
        disabled={!interactive}
        // 체크박스 글리프 클릭은 토글만 — 상위의 편집 진입으로 전파되지 않는다.
        onMouseDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onToggle?.();
        }}
        className={cn(
          'memo-checkbox-control flex h-3 w-3 items-center justify-center rounded-[2px] border transition-colors',
          checked ? 'border-[#3994ef] bg-[#3994ef] text-white' : 'border-white/40 bg-transparent',
          interactive ? 'cursor-pointer hover:border-[#3994ef]' : 'cursor-default',
        )}
      >
        {checked && (
          <svg className="h-2.5 w-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>}
      />
      <span>
        <InlineMarks text={content} checkbox />
      </span>
    </div>
  );
}

export function attachmentImageUrl(attachmentId: string): string {
  return `${TODO_API_BASE_URL}/attachments/${encodeURIComponent(attachmentId)}/content?inline=true`;
}

interface ImageResizeDrag {
  pointerId: number;
  handle: HTMLDivElement;
  edge: AttachmentResizeEdge;
  startX: number;
  lastX: number;
  startWidthPx: number;
  containerWidthPx: number;
  initialWidth?: number;
  alignment: AttachmentImageAlignment;
  snapshot: Parameters<typeof isAttachmentLayoutSnapshotCurrent>[0];
}

function widthForImageDrag(drag: ImageResizeDrag, clientX: number): number {
  const next = attachmentWidthFromDrag({ ...drag, deltaX: clientX - drag.startX });
  const anchoredEdge = (drag.alignment === 'left' && drag.edge === 'left') ||
    (drag.alignment === 'right' && drag.edge === 'right');
  // A border already against the memo edge cannot be dragged outside that column.
  return anchoredEdge ? Math.min(next, clampAttachmentWidthPercent(drag.startWidthPx / drag.containerWidthPx * 100)) : next;
}

export function AttachmentImageBlock({
  attachmentId,
  preview,
  onRetry,
  widthPercent,
  alignment = 'center',
  onWidthChange,
  onAlignmentChange,
  onRequestWrite,
  onEditingChange,
  documentSnapshot,
}: {
  attachmentId: string;
  preview?: AttachmentPreviewState;
  onRetry?: () => void;
  widthPercent?: number;
  alignment?: AttachmentImageAlignment;
  onWidthChange?: (widthPercent?: number) => void;
  onAlignmentChange?: (alignment: AttachmentImageAlignment) => void;
  onRequestWrite?: () => void;
  onEditingChange?: (active: boolean) => void;
  documentSnapshot?: string;
}) {
  const [loadFailed, setLoadFailed] = useState(false);
  const [previewWidth, setPreviewWidth] = useState<number | undefined>(widthPercent);
  const [measuredWidth, setMeasuredWidth] = useState(100);
  const [resizing, setResizing] = useState(false);
  const [previewOffset, setPreviewOffset] = useState(0);
  const blockRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const focusedRef = useRef(false);
  const widthChangeRef = useRef(onWidthChange);
  const requestWriteRef = useRef(onRequestWrite);
  const pendingLayoutRef = useRef<{
    snapshot: Parameters<typeof isAttachmentLayoutSnapshotCurrent>[0];
    change: { kind: 'width'; value: number } | { kind: 'alignment'; value: AttachmentImageAlignment };
  } | null>(null);
  const dragRef = useRef<ImageResizeDrag | null>(null);
  const editingActiveRef = useRef(false);
  const editingChangeRef = useRef(onEditingChange);
  const status = preview?.status ?? 'ready';
  const source = status === 'ready'
    ? attachmentImageUrl(attachmentId)
    : preview?.objectUrl;
  const canResize = Boolean(onWidthChange);
  const interactive = status === 'ready' && Boolean(onWidthChange || onRequestWrite);
  const showAlignment = interactive && previewWidth !== 100 && measuredWidth < 99.5;

  const reportActivity = (active: boolean) => {
    if (editingActiveRef.current === active) return;
    editingActiveRef.current = active;
    editingChangeRef.current?.(active);
  };

  const finishResize = (commit: boolean, clientX?: number) => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    const deltaX = (clientX ?? drag.lastX) - drag.startX;
    const next = widthForImageDrag(drag, clientX ?? drag.lastX);
    const changed = Math.abs(deltaX) >= 2 && next !== drag.initialWidth;
    if (commit && widthChangeRef.current && changed) {
      setPreviewWidth(next);
      widthChangeRef.current(next);
    } else {
      setPreviewWidth(drag.initialWidth);
      if (commit && changed && requestWriteRef.current) {
        pendingLayoutRef.current = {
          snapshot: { ...drag.snapshot, expiresAt: Date.now() + 5000 },
          change: { kind: 'width', value: next },
        };
      }
    }
    setPreviewOffset(0);
    setResizing(false);
    if (drag.handle.hasPointerCapture(drag.pointerId)) drag.handle.releasePointerCapture(drag.pointerId);
    reportActivity(Boolean(widthChangeRef.current && focusedRef.current));
  };

  useEffect(() => setLoadFailed(false), [source]);
  useEffect(() => {
    editingChangeRef.current = onEditingChange;
    widthChangeRef.current = onWidthChange;
    requestWriteRef.current = onRequestWrite;
  }, [onEditingChange, onWidthChange, onRequestWrite]);
  useEffect(() => () => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag?.handle.hasPointerCapture(drag.pointerId)) drag.handle.releasePointerCapture(drag.pointerId);
    if (editingActiveRef.current) editingChangeRef.current?.(false);
  }, []);
  useEffect(() => {
    if (!canResize) finishResize(false);
    reportActivity(canResize && Boolean(focusedRef.current || dragRef.current));
    // Callback identity changes on each line render; only permission changes end a gesture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canResize]);
  useEffect(() => {
    const pending = pendingLayoutRef.current;
    if (!pending) return;
    if (!isAttachmentLayoutSnapshotCurrent(pending.snapshot, {
      attachmentId, alignment, widthPercent, source, documentSnapshot, now: Date.now(),
    }) || (!onWidthChange && !onRequestWrite)) {
      pendingLayoutRef.current = null;
      return;
    }
    if (pending.change.kind === 'width' && onWidthChange) {
      pendingLayoutRef.current = null;
      onWidthChange(pending.change.value);
    } else if (pending.change.kind === 'alignment' && onAlignmentChange) {
      pendingLayoutRef.current = null;
      onAlignmentChange(pending.change.value);
    }
  }, [attachmentId, alignment, widthPercent, source, documentSnapshot, onWidthChange, onAlignmentChange, onRequestWrite]);
  useEffect(() => {
    finishResize(false);
    setPreviewWidth(widthPercent);
    // A remote layout/source change invalidates a pending pointer snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widthPercent, alignment, source, documentSnapshot]);
  useEffect(() => {
    const block = blockRef.current;
    const image = imageRef.current;
    if (!block || !image) return;
    const measure = () => {
      const available = block.getBoundingClientRect().width;
      if (available > 0) setMeasuredWidth(image.getBoundingClientRect().width / available * 100);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(block);
    observer.observe(image);
    return () => observer.disconnect();
  }, [source, loadFailed]);
  useEffect(() => {
    const cancel = () => {
      pendingLayoutRef.current = null;
      finishResize(false);
    };
    window.addEventListener('blur', cancel);
    return () => window.removeEventListener('blur', cancel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startResize = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !event.isPrimary || dragRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    const containerWidthPx = blockRef.current?.getBoundingClientRect().width ?? 0;
    const startWidthPx = imageRef.current?.getBoundingClientRect().width ?? 0;
    if (containerWidthPx <= 0 || startWidthPx <= 0) return;
    const edge = event.currentTarget.dataset.resizeEdge as AttachmentResizeEdge;
    pendingLayoutRef.current = null;
    event.currentTarget.focus({ preventScroll: true });
    dragRef.current = {
      pointerId: event.pointerId, handle: event.currentTarget, edge,
      startX: event.clientX, lastX: event.clientX, startWidthPx, containerWidthPx,
      initialWidth: widthPercent, alignment,
      snapshot: { attachmentId, widthPercent, alignment, source, documentSnapshot },
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    if (!onWidthChange) onRequestWrite?.();
    reportActivity(Boolean(onWidthChange));
  };

  const endResize = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    event.stopPropagation();
    finishResize(true, event.clientX);
  };
  const cancelResize = () => finishResize(false);
  const resizeFromKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && (dragRef.current || pendingLayoutRef.current)) {
      event.preventDefault();
      event.stopPropagation();
      cancelResize();
      pendingLayoutRef.current = null;
      return;
    }
    if (event.metaKey || event.ctrlKey || event.altKey || event.nativeEvent.isComposing) return;
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    const current = previewWidth ?? measuredWidth;
    const step = event.shiftKey ? 10 : 1;
    const next = clampAttachmentWidthPercent(event.key === 'Home' ? 10 : event.key === 'End' ? 100
      : current + (event.key === 'ArrowRight' ? step : -step));
    if (next === current) return;
    if (onWidthChange) onWidthChange(next);
    else {
      pendingLayoutRef.current = {
        snapshot: { attachmentId, alignment, widthPercent, source, documentSnapshot, expiresAt: Date.now() + 5000 },
        change: { kind: 'width', value: next },
      };
      onRequestWrite?.();
    }
  };
  const cancelPendingFromKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape' || !pendingLayoutRef.current) return;
    pendingLayoutRef.current = null;
    event.preventDefault();
    event.stopPropagation();
  };

  if (status === 'failed' || loadFailed || !source) {
    return (
      <div className="attachment-image-block attachment-image-error" role="status" data-editor-activity-surface="image">
        <span>{preview?.error || '이미지를 불러오지 못했습니다.'}</span>
        {onRetry && (
          <button type="button" className="todo-action-button todo-action-button--secondary" onClick={onRetry}>
            다시 시도
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      ref={blockRef}
      className="attachment-image-block"
      data-attachment-id={attachmentId}
      data-editor-activity-surface="image"
      data-alignment={alignment}
      data-has-alignment={showAlignment || undefined}
    >
      <div
        className="attachment-image-frame"
        data-resizing={resizing || undefined}
        data-uploading={status === 'uploading' || undefined}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()}
        onKeyDownCapture={cancelPendingFromKey}
        style={{
          width: previewWidth === undefined ? undefined : `${previewWidth}%`,
          transform: previewOffset ? `translateX(${previewOffset}px)` : undefined,
        }}
        onFocusCapture={() => {
          focusedRef.current = true;
          reportActivity(Boolean(onWidthChange));
        }}
        onBlurCapture={(event) => {
          if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
          focusedRef.current = false;
          pendingLayoutRef.current = null;
          reportActivity(Boolean(onWidthChange && dragRef.current));
        }}
      >
      {/* eslint-disable-next-line @next/next/no-img-element -- authenticated Blob/API source */}
      <img
        ref={imageRef}
        src={source}
        alt={preview?.fileName || '첨부 이미지'}
        draggable={false}
        style={previewWidth === undefined
          ? undefined
          : { width: '100%', height: 'auto', maxHeight: 'none' }}
        onError={() => setLoadFailed(true)}
      />
      {status === 'uploading' && (
        <div className="attachment-image-loading" role="status" aria-label="이미지 업로드 중">
          <span className="attachment-image-spinner" />
        </div>
      )}
      {interactive && (['left', 'right'] as const).map((edge) => (
        <div
          key={edge}
          data-resize-edge={edge}
          className={`attachment-image-controls attachment-image-resize-edge attachment-image-resize-edge--${edge}`}
          role="slider"
          tabIndex={0}
          aria-label={`이미지 ${edge === 'left' ? '왼쪽' : '오른쪽'} 테두리 크기 조절`}
          aria-valuemin={10}
          aria-valuemax={100}
          aria-valuenow={previewWidth ?? clampAttachmentWidthPercent(measuredWidth)}
          aria-valuetext={`${previewWidth ?? Math.round(measuredWidth)}%`}
          title="좌우로 드래그해 이미지 크기 조절"
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
          onPointerDown={startResize}
          onPointerMove={(event) => {
            const drag = dragRef.current;
            if (!drag || drag.pointerId !== event.pointerId) return;
            drag.lastX = event.clientX;
            if (!onWidthChange || Math.abs(event.clientX - drag.startX) < 2) return;
            const next = widthForImageDrag(drag, event.clientX);
            setPreviewWidth(next);
            const deltaWidth = next / 100 * drag.containerWidthPx - drag.startWidthPx;
            setPreviewOffset(drag.alignment === 'left' && drag.edge === 'left' ? -deltaWidth
              : drag.alignment === 'right' && drag.edge === 'right' ? deltaWidth : 0);
            setResizing(true);
          }}
          onPointerUp={endResize}
          onPointerCancel={cancelResize}
          onLostPointerCapture={cancelResize}
          onKeyDown={resizeFromKey}
        />
      ))}
      {showAlignment && (
        <div className="attachment-image-controls attachment-image-alignment" role="group" aria-label="이미지 정렬"
          onMouseDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          {(['left', 'center', 'right'] as const).map((position) => (
            <button key={position} type="button" aria-label={`이미지 ${position === 'left' ? '왼쪽' : position === 'center' ? '가운데' : '오른쪽'} 정렬`}
              aria-pressed={alignment === position}
              title={`${position === 'left' ? '왼쪽' : position === 'center' ? '가운데' : '오른쪽'} 정렬`}
              onClick={() => {
                if (onAlignmentChange) onAlignmentChange(position);
                else {
                  pendingLayoutRef.current = {
                    snapshot: { attachmentId, alignment, widthPercent, source, documentSnapshot, expiresAt: Date.now() + 5000 },
                    change: { kind: 'alignment', value: position },
                  };
                  onRequestWrite?.();
                }
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
                <path d={position === 'left' ? 'M5 4v16M9 7h10v10H9z' : position === 'right' ? 'M19 4v16M5 7h10v10H5z' : 'M12 3v3m0 12v3M5 7h14v10H5z'} />
              </svg>
            </button>
          ))}
        </div>
      )}
      </div>
    </div>
  );
}

export interface StaticCodeBlockProps {
  code: string;
  language?: string;
}

/** 저장된 상자 문자 원문은 그대로 두고 편집기/버전/게시글이 같은 표를 표시한다. */
export function BoxTableBlock({
  table,
  rowLineIds,
  sourceLineIds,
  onActivateCell,
  renderCell,
}: {
  table: BoxTableData;
  rowLineIds?: number[];
  sourceLineIds?: number[];
  onActivateCell?: (rowIndex: number, cellIndex: number, caret?: number) => void;
  renderCell?: (rowIndex: number, cellIndex: number, content: ReactNode) => ReactNode;
}) {
  const renderRow = (row: BoxTableData['rows'][number], rowIndex: number) => (
    <tr key={sourceLineIds?.[row.lineOffset] ?? rowIndex} data-line-id={rowLineIds?.[rowIndex]}>
      {row.cells.map((cell, cellIndex) => {
        const Cell = rowIndex < table.headerRowCount ? 'th' : 'td';
        const content = row.cellSegments[cellIndex].map((segment, index) => (
          <Fragment key={segment.lineOffset}>
            {index > 0 && <br />}
            <span
              data-line-id={sourceLineIds?.[segment.lineOffset]}
              data-table-cell-offset={segment.sourceStart}
              data-table-source-map={segment.valueToSourceOffsets.join(',')}
              data-table-value-start={segment.valueStart}
            >{segment.text}</span>
          </Fragment>
        ));
        return (
          <Cell
            key={cellIndex}
            scope={Cell === 'th' ? 'col' : undefined}
            data-table-cell-offset={row.cellOffsets[cellIndex]}
            onClick={onActivateCell ? (event) => {
              const selection = window.getSelection();
              if (selection && !selection.isCollapsed) return;
              event.stopPropagation();
              const caretDocument = document as Document & {
                caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
                caretRangeFromPoint?: (x: number, y: number) => Range | null;
              };
              const position = caretDocument.caretPositionFromPoint?.(event.clientX, event.clientY);
              const range = position ? null : caretDocument.caretRangeFromPoint?.(event.clientX, event.clientY);
              const node = position?.offsetNode ?? range?.startContainer ?? null;
              const offset = position?.offset ?? range?.startOffset ?? 0;
              const segment = node?.parentElement?.closest<HTMLElement>('[data-table-value-start]');
              const caret = segment && event.currentTarget.contains(segment)
                ? Number(segment.dataset.tableValueStart) + offset : 0;
              onActivateCell(rowIndex, cellIndex, Math.min(cell.length, caret));
            } : undefined}
          >
            {renderCell ? renderCell(rowIndex, cellIndex, content) : content}
          </Cell>
        );
      })}
    </tr>
  );

  return (
    <div className="box-table-scroll" role="region" aria-label="표 내용" tabIndex={0}>
      <table className="box-table" style={{ minWidth: `${table.columnCount * 8}rem` }}>
        {table.headerRowCount > 0 && (
          <thead>{table.rows.slice(0, table.headerRowCount).map(renderRow)}</thead>
        )}
        <tbody>
          {table.rows.slice(table.headerRowCount).map((row, index) =>
            renderRow(row, index + table.headerRowCount),
          )}
        </tbody>
      </table>
    </div>
  );
}

export function StaticCodeBlock({ code, language }: StaticCodeBlockProps) {
  return (
    <div className="my-4">
      <div className="flex items-center justify-between rounded-t-xl border border-white/10 bg-white/5 px-4 py-2">
        <span className="font-mono text-xs text-gray-500">{language || 'code'}</span>
      </div>
      <pre className="overflow-x-auto rounded-b-xl border border-t-0 border-white/10 bg-white/[0.03] px-4 py-3">
        <code className="whitespace-pre font-mono text-sm text-gray-300">{code}</code>
      </pre>
    </div>
  );
}
