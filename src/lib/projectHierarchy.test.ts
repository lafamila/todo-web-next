import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildProjectTree,
  buildMemberInviteScope,
  movedBeyondLongPressTolerance,
  siblingSubprojects,
  finishProjectMutation,
  shouldDeferProjectsChanged,
  shouldClearProjectAfterAccessFailure,
  isSameProjectActivation,
  shouldFollowMovedMemo,
} from './projectHierarchy.ts';
import type { ProjectInterface } from './types.ts';

const project = (
  id: string,
  parentProjectId: string | null = null,
): ProjectInterface => ({
  id,
  parentProjectId,
  name: id,
  icon: 'Coffee',
  isSecret: false,
  isGroup: parentProjectId === null,
  role: 'owner',
  canManage: true,
  canDelete: true,
  canWrite: parentProjectId !== null,
  navigationOnly: false,
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
});

test('프로젝트 순서를 유지하며 직접 자식을 한 단계로 묶는다', () => {
  const tree = buildProjectTree([
    project('root-a'),
    project('child-a2', 'root-a'),
    project('root-b'),
    project('child-a1', 'root-a'),
  ]);
  assert.deepEqual(tree.map((node) => node.project.id), ['root-a', 'root-b']);
  assert.deepEqual(tree[0].children.map((child) => child.id), ['child-a2', 'child-a1']);
});

test('서버에서 부모가 빠진 고아 자식도 목록에서 숨기지 않는다', () => {
  const tree = buildProjectTree([project('orphan', 'missing')]);
  assert.equal(tree[0].project.id, 'orphan');
});

test('같은 부모의 다른 서브프로젝트만 이동 대상으로 반환한다', () => {
  const child = project('child-a', 'root-a');
  assert.deepEqual(
    siblingSubprojects([
      project('root-a'),
      child,
      project('child-b', 'root-a'),
      project('child-c', 'root-b'),
    ], child).map((item) => item.id),
    ['child-b'],
  );
});

test('long press는 작은 손떨림은 허용하고 실제 이동은 취소한다', () => {
  assert.equal(movedBeyondLongPressTolerance(0, 0, 6, 7), false);
  assert.equal(movedBeyondLongPressTolerance(0, 0, 11, 0), true);
});

test('루트 초대 범위는 현재 자식의 all 또는 명시 선택만 snapshot한다', () => {
  const root = project('root');
  const children = [project('child-a', 'root'), project('child-b', 'root')];
  assert.deepEqual(buildMemberInviteScope(root, children, true, []), {
    includeAllSubprojects: true,
  });
  assert.deepEqual(buildMemberInviteScope(root, children, false, ['child-b', 'future']), {
    childProjectIds: ['child-b'],
  });
  assert.equal(buildMemberInviteScope(children[0], children, true, []), undefined);
});

test('자체 구조 변경 응답 전 알림은 보류하고 마지막 응답 뒤 한 번 재검증한다', () => {
  assert.equal(shouldDeferProjectsChanged(1), true);
  assert.deepEqual(finishProjectMutation(2, true), {
    mutationDepth: 1,
    shouldRefresh: false,
  });
  assert.deepEqual(finishProjectMutation(1, true), {
    mutationDepth: 0,
    shouldRefresh: true,
  });
  assert.equal(shouldDeferProjectsChanged(0), false);
});

test('늦은 이전 프로젝트의 403은 새 프로젝트 선택 refs를 지우지 않는다', () => {
  assert.equal(shouldClearProjectAfterAccessFailure('old', 'current'), false);
  assert.equal(shouldClearProjectAfterAccessFailure('current', 'current'), true);
});

test('같은 leaf를 다시 누르는 동작은 현재 메모와 dirty buffer를 유지한다', () => {
  assert.equal(isSameProjectActivation('leaf-a', 'leaf-a'), true);
  assert.equal(isSameProjectActivation('leaf-a', 'leaf-b'), false);
});

test('느린 메모 이동 응답은 사용자가 다른 선택으로 떠났으면 화면을 되돌리지 않는다', () => {
  const request = {
    expectedSelectionEpoch: 4,
    currentSelectionEpoch: 4,
    expectedProjectId: 'alpha',
    currentProjectId: 'alpha',
    expectedMemoId: 'memo-a',
    currentMemoId: 'memo-a',
  };
  assert.equal(shouldFollowMovedMemo(request), true);
  assert.equal(shouldFollowMovedMemo({ ...request, currentSelectionEpoch: 5 }), false);
  assert.equal(shouldFollowMovedMemo({ ...request, currentProjectId: 'other' }), false);
  assert.equal(shouldFollowMovedMemo({ ...request, currentMemoId: 'memo-b' }), false);
});
