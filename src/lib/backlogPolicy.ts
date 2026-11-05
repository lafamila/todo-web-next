export const BACKLOG_MIN_WIDTH_PX = 320;
export const BACKLOG_REMAINING_MAIN_PX = 240;
export const BACKLOG_TRANSITION_MS = 220;
export type BacklogPanelPhase = 'closed' | 'opening' | 'open' | 'closing';
export interface DraftWriteOwnership {
  memoId: string;
  key: string;
  localRevision: number;
}

interface ShortcutLike {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  isComposing?: boolean;
  keyCode?: number;
  repeat?: boolean;
}

export function isBacklogShortcut(event: ShortcutLike): boolean {
  return isBacklogShortcutChord(event) && !event.repeat;
}

export function isBacklogShortcutChord(event: ShortcutLike): boolean {
  return Boolean(
    (event.metaKey || event.ctrlKey) &&
      event.shiftKey &&
      event.key.toLowerCase() === 's' &&
      !event.isComposing &&
      event.keyCode !== 229,
  );
}

export function backlogToggleAction(
  phase: BacklogPanelPhase,
): 'open' | 'close' {
  return phase === 'closed' || phase === 'closing' ? 'open' : 'close';
}

export function advanceBacklogEscape(input: {
  armed: boolean;
  key: string;
  repeat?: boolean;
  isComposing?: boolean;
  keyCode?: number;
  modalOpen: boolean;
  acceptsInput: boolean;
}): { armed: boolean; shouldClose: boolean } {
  if (
    !input.acceptsInput ||
    input.modalOpen ||
    input.repeat ||
    input.isComposing ||
    input.keyCode === 229
  ) {
    return { armed: false, shouldClose: false };
  }
  // 일부 입력 컨트롤/브라우저가 발생시키는 식별 불가 이벤트는 사용자 단축키로 취급하지 않는다.
  if (input.key === 'Unidentified') return { armed: input.armed, shouldClose: false };
  if (input.key !== 'Escape') return { armed: false, shouldClose: false };
  return input.armed
    ? { armed: false, shouldClose: true }
    : { armed: true, shouldClose: false };
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

/** A delayed close/animation callback may affect only the same visible panel session. */
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

export function ownsDraftRecord(
  ownership: DraftWriteOwnership | null,
  memoId: string,
  key: string,
): ownership is DraftWriteOwnership {
  return ownership?.memoId === memoId && ownership.key === key;
}

export function canClaimDraftWrite(input: {
  accepted: boolean;
  flushMemoId: string;
  currentMemoId: string | null;
  flushEditorEpoch: number;
  currentEditorEpoch: number;
}): boolean {
  return Boolean(
    input.accepted &&
      input.flushMemoId === input.currentMemoId &&
      input.flushEditorEpoch === input.currentEditorEpoch,
  );
}
