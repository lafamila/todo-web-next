export interface EditorActivitySources {
  line: boolean;
  monaco: boolean;
  image: boolean;
  table: boolean;
}

export type EditorActivitySource = keyof EditorActivitySources;

export function combinedEditorActivity(sources: EditorActivitySources): boolean {
  return sources.line || sources.monaco || sources.image || sources.table;
}

/**
 * 모든 편집 surface가 공유하는 DOM 표식. 표 셀/구조 버튼처럼 input이 아닌 컨트롤도
 * 전역 타이핑과 6초 lease 해제 판정에서 같은 편집 영역으로 취급한다.
 */
export const EDITOR_ACTIVITY_SURFACE_SELECTOR = '[data-editor-activity-surface]';

export function isEditorActivitySurface(element: Element | null): boolean {
  return Boolean(element?.closest?.(EDITOR_ACTIVITY_SURFACE_SELECTOR));
}

interface EditorStrikeShortcutEvent {
  key: string;
  code?: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  repeat?: boolean;
  isComposing?: boolean;
  keyCode?: number;
}

/** Mac Cmd+/ 및 Windows/Linux Ctrl+/만 취소선 토글로 예약한다. */
export function isEditorStrikeShortcut(event: EditorStrikeShortcutEvent): boolean {
  const primaryModifier = event.metaKey !== event.ctrlKey;
  const slashKey = event.key === '/' || event.code === 'Slash';
  return (
    primaryModifier &&
    slashKey &&
    !event.altKey &&
    !event.shiftKey &&
    !event.repeat &&
    !event.isComposing &&
    event.keyCode !== 229
  );
}

export function shouldRequestCodeWrite(
  readOnly: boolean,
  hasIntentHandler: boolean,
): boolean {
  return readOnly && hasIntentHandler;
}

/**
 * 각 편집 surface의 이벤트 순서는 보장되지 않는다. source별 상태를 먼저 갱신하고,
 * 합산 상태가 실제로 바뀐 경우에만 상위 lease 수명주기에 알린다.
 */
export function updateEditorActivity(
  sources: EditorActivitySources,
  source: EditorActivitySource,
  active: boolean,
): { sources: EditorActivitySources; changed: boolean; active: boolean } {
  const before = combinedEditorActivity(sources);
  const next = { ...sources, [source]: active };
  const after = combinedEditorActivity(next);
  return { sources: next, changed: before !== after, active: after };
}

export interface EditorActivityTracker {
  update: (source: EditorActivitySource, active: boolean) => void;
  setOnChange: (onChange: (active: boolean) => void) => void;
  reset: () => void;
  dispose: () => void;
}

type ScheduleEnd = (callback: () => void) => () => void;

/**
 * line → Monaco 포커스 인계는 같은 commit 안에서도 effect 순서가 뒤집힐 수 있다.
 * true는 즉시 알리되 false는 한 task 미뤄 두 source가 모두 비활성인 것이 확정될 때만 알린다.
 */
export function createEditorActivityTracker(
  initialOnChange: (active: boolean) => void,
  scheduleEnd: ScheduleEnd = (callback) => {
    const timer = setTimeout(callback, 0);
    return () => clearTimeout(timer);
  },
): EditorActivityTracker {
  let sources: EditorActivitySources = { line: false, monaco: false, image: false, table: false };
  let reported = false;
  let onChange = initialOnChange;
  let cancelScheduledEnd: (() => void) | null = null;

  const update = (source: EditorActivitySource, active: boolean) => {
    sources = updateEditorActivity(sources, source, active).sources;
    const combined = combinedEditorActivity(sources);
    if (combined) {
      cancelScheduledEnd?.();
      cancelScheduledEnd = null;
      if (!reported) {
        reported = true;
        onChange(true);
      }
      return;
    }
    if (!reported || cancelScheduledEnd) return;
    cancelScheduledEnd = scheduleEnd(() => {
      cancelScheduledEnd = null;
      if (combinedEditorActivity(sources) || !reported) return;
      reported = false;
      onChange(false);
    });
  };

  return {
    update,
    setOnChange: (nextOnChange) => {
      onChange = nextOnChange;
    },
    reset: () => {
      update('line', false);
      update('monaco', false);
      update('image', false);
      update('table', false);
    },
    dispose: () => {
      cancelScheduledEnd?.();
      cancelScheduledEnd = null;
      sources = { line: false, monaco: false, image: false, table: false };
      if (reported) onChange(false);
      reported = false;
    },
  };
}
