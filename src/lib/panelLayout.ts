export const BACKLOG_RATIO_KEY = 'todo:backlogWidthRatio';
export const TASKS_RATIO_KEY = 'todo:tasksPaneRatio';
export const LEGACY_TASKS_WIDTH_KEY = 'todo:tasksPaneWidth';
export const TASKS_DEFAULT_WIDTH = 400;
export const TASKS_MIN_WIDTH = 264;
export const EDITOR_MIN_WIDTH = 240;

export function parsePanelRatio(value: string | null): number | null {
  if (value === null || value.trim() === '') return null;
  const ratio = Number(value);
  return Number.isFinite(ratio) && ratio > 0 && ratio < 1 ? ratio : null;
}

export function readPanelRatio(key: string): number | null {
  try {
    return parsePanelRatio(window.localStorage.getItem(key));
  } catch {
    return null;
  }
}

export function writePanelRatio(key: string, ratio: number): void {
  if (!Number.isFinite(ratio) || ratio <= 0 || ratio >= 1) return;
  try {
    window.localStorage.setItem(key, String(ratio));
  } catch {
    // Layout remains usable when browser storage is unavailable.
  }
}

export function clearPanelRatio(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Reset also works in memory when storage is disabled.
  }
}

export function clampPanelWidth(
  requested: number,
  available: number,
  minimum: number,
  remaining: number,
): number {
  const maximum = Math.max(0, available - remaining);
  return Math.min(maximum, Math.max(Math.min(minimum, maximum), requested));
}

export function panelWidthForRatio(
  ratio: number | null,
  available: number,
  fallback: number,
  minimum: number,
  remaining: number,
): number {
  const validRatio = parsePanelRatio(ratio === null ? null : String(ratio));
  return clampPanelWidth(
    validRatio === null ? fallback : validRatio * available,
    available,
    minimum,
    remaining,
  );
}

export function readTasksPanelRatio(available: number): number | null {
  const ratio = readPanelRatio(TASKS_RATIO_KEY);
  if (ratio !== null) return ratio;
  if (available <= 0) return null;
  try {
    const legacy = Number(window.localStorage.getItem(LEGACY_TASKS_WIDTH_KEY));
    if (!Number.isFinite(legacy) || legacy < TASKS_MIN_WIDTH || legacy > 760) return null;
    const migrated = clampPanelWidth(legacy, available, TASKS_MIN_WIDTH, EDITOR_MIN_WIDTH) / available;
    writePanelRatio(TASKS_RATIO_KEY, migrated);
    return migrated;
  } catch {
    return null;
  }
}
