import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createEditorActivityTracker,
  shouldRequestCodeWrite,
  updateEditorActivity,
  type EditorActivitySources,
} from './editorActivity.ts';

function transitions(events: Array<['line' | 'monaco' | 'image', boolean]>) {
  let sources: EditorActivitySources = { line: false, monaco: false, image: false };
  const emitted: boolean[] = [];
  for (const [source, active] of events) {
    const result = updateEditorActivity(sources, source, active);
    sources = result.sources;
    if (result.changed) emitted.push(result.active);
  }
  return emitted;
}

test('line deactivation after Monaco focus does not emit false', () => {
  assert.deepEqual(
    transitions([
      ['line', true],
      ['monaco', true],
      ['line', false],
      ['monaco', false],
    ]),
    [true, false],
  );
});

test('line deactivation before Monaco focus represents a real inactive gap', () => {
  assert.deepEqual(
    transitions([
      ['line', true],
      ['line', false],
      ['monaco', true],
      ['monaco', false],
    ]),
    [true, false, true, false],
  );
});

test('duplicate focus and blur events are ignored', () => {
  assert.deepEqual(
    transitions([
      ['monaco', true],
      ['monaco', true],
      ['monaco', false],
      ['monaco', false],
    ]),
    [true, false],
  );
});

function trackedTransitions(events: Array<['line' | 'monaco' | 'image', boolean]>) {
  const emitted: boolean[] = [];
  const scheduled: Array<() => void> = [];
  const tracker = createEditorActivityTracker(
    (active) => emitted.push(active),
    (callback) => {
      scheduled.push(callback);
      return () => {
        const index = scheduled.indexOf(callback);
        if (index >= 0) scheduled.splice(index, 1);
      };
    },
  );
  events.forEach(([source, active]) => tracker.update(source, active));
  scheduled.splice(0).forEach((callback) => callback());
  return { emitted, tracker };
}

test('same-turn line to Monaco handoff never reports an inactive gap in either order', () => {
  assert.deepEqual(
    trackedTransitions([
      ['line', true],
      ['line', false],
      ['monaco', true],
      ['monaco', false],
    ]).emitted,
    [true, false],
  );
  assert.deepEqual(
    trackedTransitions([
      ['line', true],
      ['monaco', true],
      ['line', false],
      ['monaco', false],
    ]).emitted,
    [true, false],
  );
});

test('reset/dispose clears stale Monaco focus on read-only transition and unmount', () => {
  const first = trackedTransitions([['monaco', true]]);
  first.tracker.reset();
  // reset의 deferred false를 여기서는 dispose가 즉시 확정한다.
  first.tracker.dispose();
  assert.deepEqual(first.emitted, [true, false]);
});

test('image controls alone keep the editor active until their focus leaves', () => {
  assert.deepEqual(
    trackedTransitions([
      ['image', true],
      ['image', true],
      ['image', false],
    ]).emitted,
    [true, false],
  );
});

test('line to image control handoff never releases the editor lease', () => {
  assert.deepEqual(
    trackedTransitions([
      ['line', true],
      ['line', false],
      ['image', true],
      ['image', false],
    ]).emitted,
    [true, false],
  );
});

test('reset clears active image controls', () => {
  const tracked = trackedTransitions([['image', true]]);
  tracked.tracker.reset();
  tracked.tracker.dispose();
  assert.deepEqual(tracked.emitted, [true, false]);
});

test('read-only Monaco requests a lease only when an edit-intent handler exists', () => {
  assert.equal(shouldRequestCodeWrite(true, true), true);
  assert.equal(shouldRequestCodeWrite(true, false), false);
  assert.equal(shouldRequestCodeWrite(false, true), false);
});
