import assert from 'node:assert/strict';
import test from 'node:test';

import { createMemoEditorRegistry } from './memoEditorRegistry.ts';

test('the newest mounted editor epoch owns a memo registry entry', () => {
  const registry = createMemoEditorRegistry();
  const first = registry.mount('memo-1', '첫 메모', 4);
  registry.update(first, { dirty: true, pending: false, conflicted: false });

  const second = registry.mount('memo-1', '첫 메모', 5);
  registry.update(second, { dirty: false, pending: true, conflicted: false });
  registry.update(first, { dirty: true, pending: false, conflicted: true });

  assert.deepEqual(registry.get('memo-1'), {
    memoId: 'memo-1',
    memoTitle: '첫 메모',
    epoch: 5,
    dirty: false,
    pending: true,
    conflicted: false,
  });
});

test('stale unmount cannot remove a replacement editor entry', () => {
  const registry = createMemoEditorRegistry();
  const first = registry.mount('memo-1', '메모', 1);
  const second = registry.mount('memo-1', '메모', 2);

  registry.unmount(first);
  assert.equal(registry.get('memo-1')?.epoch, 2);

  registry.unmount(second);
  assert.equal(registry.get('memo-1'), undefined);
});

test('registry subscriptions change only for accepted mount/update/unmount operations', () => {
  const registry = createMemoEditorRegistry();
  let notifications = 0;
  const unsubscribe = registry.subscribe(() => { notifications += 1; });
  const token = registry.mount('memo-1', '메모', 3);
  registry.update(token, { dirty: false, pending: false, conflicted: false });
  registry.update(token, { dirty: true, pending: false, conflicted: false });
  registry.unmount(token);
  unsubscribe();

  assert.equal(notifications, 3);
});
