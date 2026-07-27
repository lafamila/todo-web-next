import type { EditorLine } from './classifyLine';

/**
 * 문서 스냅샷 스택.
 * 활성 라인 하나만 textarea 로 살아 있으므로 네이티브 undo 는 라인을 떠나는 순간 소실된다.
 * 라인 밖 변경(분할/병합/체크박스 토글/붙여넣기)은 이 스택이 되돌린다.
 */
export interface EditorSnapshot {
  lines: EditorLine[];
  activeLineId: number | null;
  caret: number;
}

export const HISTORY_LIMIT = 200;
export const HISTORY_COALESCE_MS = 500;

export interface EditorHistory {
  reset(): void;
  /** 변경 직전 스냅샷을 쌓는다. coalesce 는 연속 타이핑을 한 건으로 병합한다. */
  commit(previous: EditorSnapshot, options?: { coalesce?: boolean }): void;
  undo(current: EditorSnapshot): EditorSnapshot | null;
  redo(current: EditorSnapshot): EditorSnapshot | null;
}

export function createEditorHistory(now: () => number = Date.now): EditorHistory {
  let past: EditorSnapshot[] = [];
  let future: EditorSnapshot[] = [];
  let lastCommitAt = 0;
  let lastCommitCoalesced = false;

  return {
    reset() {
      past = [];
      future = [];
      lastCommitAt = 0;
      lastCommitCoalesced = false;
    },

    commit(previous, options) {
      const coalesce = options?.coalesce ?? false;
      const at = now();

      // 직전 커밋도 타이핑이었고 500ms 안이면 새 항목을 쌓지 않는다.
      // (더 오래된 스냅샷이 undo 대상으로 남아 타이핑 한 묶음이 한 번에 되돌아간다)
      if (coalesce && lastCommitCoalesced && at - lastCommitAt < HISTORY_COALESCE_MS) {
        lastCommitAt = at;
        return;
      }

      past.push(previous);
      if (past.length > HISTORY_LIMIT) {
        past.shift();
      }
      future = [];
      lastCommitAt = at;
      lastCommitCoalesced = coalesce;
    },

    undo(current) {
      const snapshot = past.pop();
      if (!snapshot) return null;

      future.push(current);
      lastCommitCoalesced = false;
      return snapshot;
    },

    redo(current) {
      const snapshot = future.pop();
      if (!snapshot) return null;

      past.push(current);
      lastCommitCoalesced = false;
      return snapshot;
    },
  };
}
