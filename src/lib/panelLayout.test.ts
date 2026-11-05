import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LEGACY_TASKS_WIDTH_KEY, TASKS_RATIO_KEY, clearPanelRatio,
  panelWidthForRatio, parsePanelRatio, readPanelRatio, readTasksPanelRatio,
  writePanelRatio,
} from './panelLayout.ts';

test('stored ratios reject missing, corrupt and out-of-range preferences', () => {
  for (const value of [null, '', ' ', 'NaN', 'Infinity', '-0.2', '0', '1', '1.2']) {
    assert.equal(parsePanelRatio(value), null);
  }
  assert.equal(parsePanelRatio('0.375'), 0.375);
});

test('width follows the saved proportion while preserving editor space', () => {
  assert.equal(panelWidthForRatio(0.4, 1200, 400, 264, 240), 480);
  assert.equal(panelWidthForRatio(0.4, 1800, 400, 264, 240), 720);
  assert.equal(panelWidthForRatio(0.9, 700, 400, 264, 240), 460);
  assert.equal(panelWidthForRatio(0.1, 1200, 400, 264, 240), 264);
  assert.equal(panelWidthForRatio(null, 1200, 400, 264, 240), 400);
  assert.equal(panelWidthForRatio(0.5, 0, 400, 264, 240), 0);
});

test('existing pixel preference migrates once and the ratio wins on later resizes', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const values = new Map<string, string>([[LEGACY_TASKS_WIDTH_KEY, '450']]);
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    },
  } });
  try {
    assert.equal(readTasksPanelRatio(1000), 0.45);
    assert.equal(values.get(TASKS_RATIO_KEY), '0.45');
    assert.equal(readTasksPanelRatio(1600), 0.45);
    writePanelRatio(TASKS_RATIO_KEY, 0.6);
    assert.equal(readPanelRatio(TASKS_RATIO_KEY), 0.6);
    writePanelRatio(TASKS_RATIO_KEY, Number.NaN);
    assert.equal(readPanelRatio(TASKS_RATIO_KEY), 0.6);
    clearPanelRatio(TASKS_RATIO_KEY);
    assert.equal(values.has(TASKS_RATIO_KEY), false);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'window', previous);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});

test('blocked storage does not prevent resizing or restoring the default layout', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, get() {
    throw new Error('Storage is disabled');
  } });
  try {
    assert.equal(readPanelRatio(TASKS_RATIO_KEY), null);
    assert.equal(readTasksPanelRatio(1200), null);
    assert.doesNotThrow(() => writePanelRatio(TASKS_RATIO_KEY, 0.5));
    assert.doesNotThrow(() => clearPanelRatio(TASKS_RATIO_KEY));
  } finally {
    if (previous) Object.defineProperty(globalThis, 'window', previous);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});
