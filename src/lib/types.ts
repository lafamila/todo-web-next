export interface ProjectInterface {
  id: string;
  name: string;
  icon: string;
  status?: number;
  isSecret: boolean;
  ownerId?: string;
  createdAt: Date | string;
  updatedAt: Date | string;
  updatedAtUtc?: string | null;
}

export interface CreateProjectRequestInterface {
  name: string;
  icon: string;
  isSecret: boolean;
  password?: string;
}

export interface MemoInterface {
  id: string;
  projectId: string;
  title: string;
  content: string;
  status?: number;
  createdBy?: string;
  createdAt: Date | string;
  updatedAt: Date | string;
  updatedAtUtc?: string | null;
}

export interface MemoLeaseInterface {
  memoId: string;
  leaseToken: string;
  generation?: number;
}

export type MemoLeaseState = "pending" | "ready" | "denied";

export type SyncIssueKind =
  | "conflict"
  | "duplicate_project"
  | "duplicate_memo"
  | "identity"
  | "schema"
  | "clock";

export interface SyncIssueInterface {
  id: string;
  kind: SyncIssueKind;
  refTable: string | null;
  refId: string | null;
  peerRefId: string | null;
  detail: Record<string, unknown>;
  detectedAt: string | null;
  resolvedAt: string | null;
  resolved: boolean;
}

export interface SyncIssuesResponseInterface {
  issues: SyncIssueInterface[];
  counts: Record<string, number>;
}

export interface SyncStatusInterface {
  enabled: boolean;
  role: string;
  paused: boolean;
  peer: string;
  peerUrl: string | null;
  schemaVersion: number;
  lastPushedSeq: number;
  lastPulledSeq: number;
  maxSeq: number;
  pending: number;
  lastOkAt: string | null;
  lastError: string | null;
  issues: Record<string, number>;
  issueTotal: number;
  mergeLocked: boolean;
  online: boolean;
  running?: boolean;
}

export interface MemoVersionInterface {
  id: string;
  memoId: string;
  content: string;
  version: number;
  note: string | null;
  createdAt: string;
  updatedAtUtc: string | null;
}

export interface MemoMergeResultInterface {
  kind: "memo";
  winnerId: string;
  loserId: string;
  winnerTitle: string;
  loserTitle: string;
  movedContentVersion: number | null;
  movedVersions: number;
  latestWinnerVersion: number;
  resolvedIssues: number;
  executedOn: "local" | "remote";
  pullRequested: boolean;
}

export interface ProjectMergeResultInterface {
  kind: "project";
  winnerId: string;
  loserId: string;
  winnerName: string;
  loserName: string;
  movedMemos: number;
  mergedMembers: number;
  resolvedIssues: number;
  executedOn: "local" | "remote";
  pullRequested: boolean;
}

export interface CreateMemoRequestInterface {
  projectId: string;
  title: string;
}

export interface ContentBlockInterface {
  type: "text" | "code" | "checkbox" | "memo-link";
  content: string;
  metadata?: {
    language?: string;
    checked?: boolean;
    memoId?: string;
    memoTitle?: string;
    /** 들여쓰기 단위 수 (스페이스 2칸 = 1). `lib/lineMarks.ts` 참조. */
    indent?: number;
  };
}

export interface ArticleInterface {
  id: string;
  memoId: string;
  projectId: string;
  authorId: string;
  authorSlug: string;
  title: string;
  content: string;
  publishedVersion: number;
  createdAt: string;
  publishedAt: string;
  updatedAt: string;
  projectName?: string;
  projectIcon?: string;
  isSecret?: boolean;
}

export interface ArticleListItemInterface {
  id: string;
  memoId: string;
  projectId: string;
  authorId: string;
  authorSlug: string;
  title: string;
  publishedVersion: number;
  createdAt: string;
  publishedAt: string;
  updatedAt: string;
  projectName?: string;
  projectIcon?: string;
  isSecret?: boolean;
}

export type SortOption = "created" | "name" | "updated";

export interface ProjectMemberInterface {
  id: string;
  projectId: string;
  userId: string;
  role: ProjectRole;
  invitedAt: string;
  username: string;
  displayName: string;
  isAdmin: boolean;
}

export interface TodoAppStateInterface {
  selectedProject: ProjectInterface | null;
  selectedMemo: MemoInterface | null;
  projects: ProjectInterface[];
  memos: MemoInterface[];
  isProjectSidebarHovered: boolean;
  sortOption: SortOption;
  isLoading: boolean;
  error: string | null;
  selectedMemoIds: string[];
  members: ProjectMemberInterface[];
}

export type TodoPermission = "owner" | "admin" | "user" | "visitor";
export type ProjectRole = "owner" | "editor" | "viewer";

export interface UserInterface {
  id: string;
  username: string;
  displayName: string;
  loginId?: string;
  name?: string;
  email?: string;
  slug?: string;
  permission?: TodoPermission;
  canInviteToTodo?: boolean;
  inviteDisabledReason?: "visitor";
  isAdmin: boolean;
  isSuperAdmin?: boolean;
}

export interface TodoAppContextTypeInterface {
  state: TodoAppStateInterface;
  refreshProjects: () => Promise<void>;
  refreshCurrentProject: () => Promise<void>;
  selectProject: (project: ProjectInterface) => Promise<void>;
  createProject: (data: CreateProjectRequestInterface) => Promise<void>;
  verifyProjectPassword: (projectId: string, password: string) => Promise<boolean>;
  selectMemo: (memo: MemoInterface) => Promise<void>;
  createMemo: (title: string) => Promise<void>;
  updateMemo: (content: string) => Promise<void>;
  setSortOption: (option: SortOption) => void;
  toggleSelectMemo: (memoId: string) => void;
  clearSelectedMemos: () => void;
  deleteMemos: (memoIds: string[]) => Promise<void>;
  loadMembers: (projectId: string) => Promise<void>;
  inviteMember: (projectId: string, user: UserInterface, role: ProjectRole) => Promise<void>;
  removeMember: (projectId: string, userId: string) => Promise<void>;
}

export interface CalendarDayInterface {
  date: string;
  completedCount: number;
  totalCount: number;
  ratio: number;
}

export interface CalendarMonthInterface {
  year: number;
  month: number;
  totalTaskTypes: number;
  days: CalendarDayInterface[];
}

export interface DailyTaskTypeInterface {
  id: string;
  name: string;
  icon: string;
  color: string;
  displayOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DayDetailTaskInterface {
  taskTypeId: string;
  name: string;
  icon: string;
  completed: boolean;
}

export interface DayDetailInterface {
  date: string;
  tasks: DayDetailTaskInterface[];
}
