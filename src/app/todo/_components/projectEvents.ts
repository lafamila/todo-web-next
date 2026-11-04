export const OPEN_PROJECT_MEMBERS_EVENT = 'todo:open-project-members';

export interface OpenProjectMembersDetail {
  projectId: string;
}

export function openProjectMembers(projectId: string): void {
  window.dispatchEvent(
    new CustomEvent<OpenProjectMembersDetail>(OPEN_PROJECT_MEMBERS_EVENT, {
      detail: { projectId },
    }),
  );
}
