export interface EditorActivitySources {
  line: boolean;
  monaco: boolean;
  image: boolean;
}

export type EditorActivitySource = keyof EditorActivitySources;

export function combinedEditorActivity(sources: EditorActivitySources): boolean {
  return sources.line || sources.monaco || sources.image;
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
  let sources: EditorActivitySources = { line: false, monaco: false, image: false };
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
    },
    dispose: () => {
      cancelScheduledEnd?.();
      cancelScheduledEnd = null;
      sources = { line: false, monaco: false, image: false };
      if (reported) onChange(false);
      reported = false;
    },
  };
}
