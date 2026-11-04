import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isMemberManagementShortcut,
  isProjectSearchShortcut,
  isImeKeyEvent,
  isDetailFullscreenShortcut,
  moveSearchSelection,
} from './projectSearchPolicy.ts';
import type { ShortcutEventLike } from './projectSearchPolicy.ts';

const shortcut = (overrides: Partial<ShortcutEventLike> = {}): ShortcutEventLike => ({
  key: 'p',
  metaKey: true,
  ctrlKey: false,
  shiftKey: true,
  altKey: false,
  ...overrides,
});

test('IME confirmation keys never select a search result, including Safari keyCode 229', () => {
  assert.equal(isImeKeyEvent({ isComposing: true }), true);
  assert.equal(isImeKeyEvent({ isComposing: false }, true), true);
  assert.equal(isImeKeyEvent({ isComposing: false, keyCode: 229 }), true);
  assert.equal(isImeKeyEvent({ isComposing: false, keyCode: 13 }), false);
});

test('project search accepts Cmd/Ctrl+Shift+P regardless of shifted key casing', () => {
  assert.equal(isProjectSearchShortcut(shortcut()), true);
  assert.equal(isProjectSearchShortcut(shortcut({ key: 'P' })), true);
  assert.equal(
    isProjectSearchShortcut(shortcut({ metaKey: false, ctrlKey: true })),
    true,
  );
  assert.equal(isProjectSearchShortcut(shortcut({ shiftKey: false })), false);
  assert.equal(isProjectSearchShortcut(shortcut({ altKey: true })), false);
});

test('project search follows the physical P key on a Korean layout but ignores IME composition', () => {
  assert.equal(isProjectSearchShortcut(shortcut({ key: 'ㅔ', code: 'KeyP' })), true);
  assert.equal(
    isProjectSearchShortcut(shortcut({ key: 'ㅔ', code: 'KeyP', isComposing: true })),
    false,
  );
  assert.equal(
    isProjectSearchShortcut(shortcut({ key: 'ㅔ', code: 'KeyP', keyCode: 229 })),
    false,
  );
});

test('member management uses Cmd/Ctrl+Shift+O and no longer consumes P', () => {
  assert.equal(isMemberManagementShortcut(shortcut({ key: 'o' })), true);
  assert.equal(isMemberManagementShortcut(shortcut({ key: 'O' })), true);
  assert.equal(isMemberManagementShortcut(shortcut({ key: 'ㅐ', code: 'KeyO' })), true);
  assert.equal(isMemberManagementShortcut(shortcut()), false);
  assert.equal(isMemberManagementShortcut(shortcut({ key: 'o', shiftKey: false })), false);
});

test('Cmd/Ctrl+Enter toggles detail fullscreen once and ignores repeat/IME', () => {
  const enter = shortcut({ key: 'Enter', shiftKey: false });
  assert.equal(isDetailFullscreenShortcut(enter), true);
  assert.equal(isDetailFullscreenShortcut({ ...enter, metaKey: false, ctrlKey: true }), true);
  assert.equal(isDetailFullscreenShortcut({ ...enter, repeat: true }), false);
  assert.equal(isDetailFullscreenShortcut({ ...enter, isComposing: true }), false);
  assert.equal(isDetailFullscreenShortcut({ ...enter, shiftKey: true }), false);
});

test('arrow selection wraps through ranked search results', () => {
  assert.equal(moveSearchSelection(0, 3, 'next'), 1);
  assert.equal(moveSearchSelection(2, 3, 'next'), 0);
  assert.equal(moveSearchSelection(0, 3, 'previous'), 2);
  assert.equal(moveSearchSelection(4, 0, 'previous'), 0);
});
