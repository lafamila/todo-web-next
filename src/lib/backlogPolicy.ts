export const BACKLOG_MIN_WIDTH_PX = 320;
export const BACKLOG_REMAINING_MAIN_PX = 240;
export const BACKLOG_TRANSITION_MS = 220;
export type BacklogPanelPhase = 'closed' | 'opening' | 'open' | 'closing';

interface ShortcutLike {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  isComposing?: boolean;
  keyCode?: number;
}

export function isBacklogShortcut(event: ShortcutLike): boolean {
  return Boolean(
    (event.metaKey || event.ctrlKey) &&
      event.shiftKey &&
      event.key.toLowerCase() === 's' &&
      !event.isComposing &&
      event.keyCode !== 229,
  );
}

export function isMemoSaveShortcut(event: ShortcutLike): boolean {
  return Boolean(
    (event.metaKey || event.ctrlKey) &&
      !event.shiftKey &&
      event.key.toLowerCase() === 's' &&
      !event.isComposing &&
      event.keyCode !== 229,
  );
}

export function initialBacklogWidth(viewportWidth: number, mobile: boolean): number {
  return mobile ? viewportWidth : clampBacklogWidth(viewportWidth / 2, viewportWidth, false);
}

export function clampBacklogWidth(
  requestedWidth: number,
  viewportWidth: number,
  mobile: boolean,
): number {
  if (mobile) return Math.max(0, viewportWidth);
  const maximum = Math.max(BACKLOG_MIN_WIDTH_PX, viewportWidth - BACKLOG_REMAINING_MAIN_PX);
  return Math.min(maximum, Math.max(BACKLOG_MIN_WIDTH_PX, requestedWidth));
}

export function isLatestSavedSnapshot(input: {
  saved: boolean;
  snapshotContent: string;
  currentContent: string;
  acceptedContent: string;
  snapshotRevision: number;
  currentRevision: number;
}): boolean {
  return (
    input.saved &&
    input.snapshotContent === input.currentContent &&
    input.snapshotContent === input.acceptedContent &&
    input.snapshotRevision === input.currentRevision
  );
}

/** A delayed save may close only the same visible panel session that started it. */
export function canCloseBacklogSession(input: {
  phase: BacklogPanelPhase;
  requestedSession: number;
  currentSession: number;
}): boolean {
  return (
    input.requestedSession === input.currentSession &&
    (input.phase === 'opening' || input.phase === 'open')
  );
}

export function backlogAcceptsInput(phase: BacklogPanelPhase): boolean {
  return phase === 'opening' || phase === 'open';
}

export function backlogTransitionWaitMs(reducedMotion: boolean): number {
  return reducedMotion ? 0 : BACKLOG_TRANSITION_MS + 40;
}
