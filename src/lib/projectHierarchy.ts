import type {
  InviteMemberScopeInterface,
  ProjectInterface,
} from './types';

export interface ProjectTreeNode {
  project: ProjectInterface;
  children: ProjectInterface[];
}

/** 서버 순서를 유지하면서 루트와 직접 자식을 묶는다. 고아 자식도 숨기지 않는다. */
export function buildProjectTree(projects: ProjectInterface[]): ProjectTreeNode[] {
  const roots = projects.filter((project) => !project.parentProjectId);
  const knownRootIds = new Set(roots.map((project) => project.id));
  const orphaned = projects.filter(
    (project) => project.parentProjectId && !knownRootIds.has(project.parentProjectId),
  );
  return [...roots, ...orphaned].map((project) => ({
    project,
    children: project.parentProjectId
      ? []
      : projects.filter((candidate) => candidate.parentProjectId === project.id),
  }));
}

export function siblingSubprojects(
  projects: ProjectInterface[],
  project: ProjectInterface,
): ProjectInterface[] {
  if (!project.parentProjectId) return [];
  return projects.filter(
    (candidate) =>
      candidate.parentProjectId === project.parentProjectId &&
      candidate.id !== project.id &&
      !candidate.isGroup,
  );
}

export function movedBeyondLongPressTolerance(
  startX: number,
  startY: number,
  currentX: number,
  currentY: number,
  tolerance = 10,
): boolean {
  return Math.hypot(currentX - startX, currentY - startY) > tolerance;
}

export function buildMemberInviteScope(
  project: ProjectInterface,
  currentChildren: ProjectInterface[],
  includeAll: boolean,
  selectedChildIds: string[],
): InviteMemberScopeInterface | undefined {
  if (!project.isGroup || currentChildren.length === 0) return undefined;
  if (includeAll) return { includeAllSubprojects: true };
  const liveChildIds = new Set(currentChildren.map((child) => child.id));
  return {
    childProjectIds: selectedChildIds.filter((id) => liveChildIds.has(id)),
  };
}

export const shouldDeferProjectsChanged = (mutationDepth: number): boolean =>
  mutationDepth > 0;

export function finishProjectMutation(
  mutationDepth: number,
  hasDeferredNotification: boolean,
): { mutationDepth: number; shouldRefresh: boolean } {
  const nextDepth = Math.max(0, mutationDepth - 1);
  return {
    mutationDepth: nextDepth,
    shouldRefresh: nextDepth === 0 && hasDeferredNotification,
  };
}

export const shouldClearProjectAfterAccessFailure = (
  failedProjectId: string,
  currentProjectId: string | null | undefined,
): boolean => failedProjectId === currentProjectId;

export const isSameProjectActivation = (
  activeProjectId: string | null | undefined,
  requestedProjectId: string,
): boolean => activeProjectId === requestedProjectId;

export function shouldFollowMovedMemo(input: {
  expectedSelectionEpoch: number;
  currentSelectionEpoch: number;
  expectedProjectId: string | null;
  currentProjectId: string | null | undefined;
  expectedMemoId: string;
  currentMemoId: string | null | undefined;
}): boolean {
  return (
    input.expectedSelectionEpoch === input.currentSelectionEpoch &&
    input.expectedProjectId === input.currentProjectId &&
    input.expectedMemoId === input.currentMemoId
  );
}
