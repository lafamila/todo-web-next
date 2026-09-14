export interface ShortcutEventLike {
  key: string;
  code?: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  isComposing?: boolean;
  keyCode?: number;
}

export const isImeKeyEvent = (
  event: Pick<ShortcutEventLike, 'isComposing' | 'keyCode'>,
  composing = false,
): boolean => composing || Boolean(event.isComposing) || event.keyCode === 229;

const isPrimaryShiftShortcut = (event: ShortcutEventLike, key: string): boolean =>
  (event.metaKey || event.ctrlKey) &&
  event.shiftKey &&
  !event.altKey &&
  !isImeKeyEvent(event) &&
  (event.code === `Key${key.toUpperCase()}` || event.key.toLowerCase() === key);

export const isProjectSearchShortcut = (event: ShortcutEventLike): boolean =>
  isPrimaryShiftShortcut(event, 'p');

export const isMemberManagementShortcut = (event: ShortcutEventLike): boolean =>
  isPrimaryShiftShortcut(event, 'o');

export const moveSearchSelection = (
  currentIndex: number,
  resultCount: number,
  direction: 'next' | 'previous',
): number => {
  if (resultCount <= 0) return 0;
  const normalized = Math.min(Math.max(currentIndex, 0), resultCount - 1);
  return direction === 'next'
    ? (normalized + 1) % resultCount
    : (normalized - 1 + resultCount) % resultCount;
};
