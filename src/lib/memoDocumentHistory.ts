export const MEMO_HISTORY_LIMIT = 200;
export const MEMO_HISTORY_COALESCE_MS = 500;

export type MemoHistoryAction = 'undo' | 'redo';

export interface PendingMemoHistoryIntent {
  memoId: string;
  userId: string;
  editorEpoch: number;
  content: string;
  actions: MemoHistoryAction[];
}

export function enqueueMemoHistoryIntent(
  current: PendingMemoHistoryIntent | null,
  next: Omit<PendingMemoHistoryIntent, 'actions'> & { action: MemoHistoryAction },
): PendingMemoHistoryIntent {
  const sameScope = current &&
    current.memoId === next.memoId &&
    current.userId === next.userId &&
    current.editorEpoch === next.editorEpoch &&
    current.content === next.content;
  return {
    memoId: next.memoId,
    userId: next.userId,
    editorEpoch: next.editorEpoch,
    content: next.content,
    actions: sameScope ? [...current.actions, next.action] : [next.action],
  };
}

export interface MemoHistoryKeyEvent {
  key: string;
  code?: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  repeat: boolean;
  isComposing: boolean;
  keyCode: number;
}

export interface MemoDocumentHistory {
  reset(content: string): void;
  record(previous: string, next: string, options: { group: string; coalesce: boolean }): void;
  undo(current: string): string | null;
  redo(current: string): string | null;
  canUndo(): boolean;
  canRedo(): boolean;
}

export function createMemoDocumentHistory(
  now: () => number = Date.now,
): MemoDocumentHistory {
  let past: string[] = [];
  let future: string[] = [];
  let lastGroup: string | null = null;
  let lastCommitAt = 0;
  let lastCoalesced = false;

  const clearBoundary = () => {
    lastGroup = null;
    lastCommitAt = 0;
    lastCoalesced = false;
  };

  return {
    reset() {
      past = [];
      future = [];
      clearBoundary();
    },
    record(previous, next, options) {
      if (previous === next) return;
      const at = now();
      const merge = options.coalesce && lastCoalesced && lastGroup === options.group &&
        at - lastCommitAt < MEMO_HISTORY_COALESCE_MS;
      if (!merge) {
        past.push(previous);
        if (past.length > MEMO_HISTORY_LIMIT) past.shift();
      }
      future = [];
      lastGroup = options.group;
      lastCommitAt = at;
      lastCoalesced = options.coalesce;
    },
    undo(current) {
      const previous = past.pop();
      if (previous === undefined) return null;
      future.push(current);
      clearBoundary();
      return previous;
    },
    redo(current) {
      const next = future.pop();
      if (next === undefined) return null;
      past.push(current);
      clearBoundary();
      return next;
    },
    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,
  };
}

const isPhysicalZ = (event: MemoHistoryKeyEvent) =>
  (event.code === 'KeyZ' || event.key.toLowerCase() === 'z') &&
  !event.isComposing &&
  event.keyCode !== 229;

export function isMemoHistoryShortcut(event: MemoHistoryKeyEvent): MemoHistoryAction | null {
  if (!isPhysicalZ(event) || event.altKey || !(event.metaKey || event.ctrlKey)) return null;
  return event.shiftKey ? 'redo' : 'undo';
}

export function isMemoVersionShortcut(event: MemoHistoryKeyEvent): boolean {
  return isPhysicalZ(event) && !event.repeat && event.altKey && !event.shiftKey &&
    (event.metaKey || event.ctrlKey);
}

export function shouldScheduleHistoryLeaseRelease(input: {
  rawMode: boolean;
  editingActive: boolean;
  editorFocusActive: boolean;
}): boolean {
  return !input.rawMode && (!input.editingActive || !input.editorFocusActive);
}
