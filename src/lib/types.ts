import type { BoxTableData } from "./boxTable";

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
  parentProjectId: string | null;
  isGroup: boolean;
  role: ProjectRole | null;
  canManage: boolean;
  canDelete: boolean;
  canWrite: boolean;
  /** 자식 탐색을 위해 노출될 뿐 메모/백로그 접근 권한은 없는 상위 프로젝트. */
  navigationOnly: boolean;
}

export interface CreateProjectRequestInterface {
  name: string;
  icon: string;
  isSecret: boolean;
  password?: string;
  parentProjectId?: string;
}

export interface BulkMoveMemosRequestInterface {
  memoIds: string[];
  sourceProjectId: string;
  targetProjectId: string;
  sourceConfirmationName: string;
  targetConfirmationName: string;
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
  /** CAS 저장용 서버 revision. 구버전 API 호환을 위해 optional이다. */
  revision?: string;
  kind?: "memo" | "backlog";
  /** 구조 변경 재조회에서 UI buffer를 덮지 않고 서버 본문/revision 쌍을 전달하는 client-only 값. */
  serverContent?: string;
}

export interface BulkMoveMemosResponseInterface {
  movedMemos: MemoInterface[];
}

export interface InviteMemberScopeInterface {
  includeAllSubprojects?: boolean;
  childProjectIds?: string[];
}

export interface SearchTextSegmentInterface {
  text: string;
  match: boolean;
}

export interface ProjectMemoSearchResultInterface {
  memoId: string;
  title: string;
  score: number;
  titleSegments: SearchTextSegmentInterface[];
  snippetSegments: SearchTextSegmentInterface[];
}

export interface ProjectMemoSearchResponseInterface {
  query: string;
  total: number;
  results: ProjectMemoSearchResultInterface[];
}

export interface MemoLeaseInterface {
  memoId: string;
  leaseToken: string;
  generation?: number;
}

export type MemoLeaseState = "idle" | "pending" | "ready" | "denied";

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

export interface MemoVersionSummaryInterface {
  id: string;
  memoId: string;
  version: number;
  note: string | null;
  createdAt: string;
  updatedAtUtc: string | null;
}

export interface MemoVersionInterface extends MemoVersionSummaryInterface {
  content: string;
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
  type: "text" | "code" | "checkbox" | "memo-link" | "table";
  content: string;
  metadata?: {
    language?: string;
    checked?: boolean;
    memoId?: string;
    memoTitle?: string;
    /** 들여쓰기 단위 수 (스페이스 2칸 = 1). `lib/lineMarks.ts` 참조. */
    indent?: number;
    /** Unicode 상자 문자 표의 화면 렌더링 정보. content에는 원문 전체가 남는다. */
    table?: BoxTableData;
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

/** 스택 성격(sync 역할)에 따라 숨기는 prod 전용 표면 — `/api/session/me` 가 내려준다. */
export interface FeatureFlagsInterface {
  screenShare: boolean;
  articles: boolean;
  memberInvite: boolean;
  /** 노트북의 `*-local` 스택에서만 제공하는 과거 메모 읽기 화면. */
  memoVersionHistory: boolean;
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
  /** 없으면(구버전 API) 전부 노출로 취급한다. */
  features?: FeatureFlagsInterface;
}

export interface TodoAppContextTypeInterface {
  state: TodoAppStateInterface;
  refreshProjects: () => Promise<void>;
  refreshCurrentProject: () => Promise<void>;
  selectProject: (project: ProjectInterface) => Promise<void>;
  createProject: (data: CreateProjectRequestInterface) => Promise<ProjectInterface>;
  renameProject: (projectId: string, name: string) => Promise<ProjectInterface>;
  deleteProject: (projectId: string, confirmationName: string) => Promise<void>;
  verifyProjectPassword: (projectId: string, password: string) => Promise<boolean>;
  selectMemo: (memo: MemoInterface) => Promise<boolean>;
  createMemo: (title: string) => Promise<void>;
  updateMemo: (content: string, baseRevision?: string) => Promise<MemoInterface>;
  setSortOption: (option: SortOption) => void;
  toggleSelectMemo: (memoId: string) => void;
  clearSelectedMemos: () => void;
  deleteMemos: (memoIds: string[]) => Promise<void>;
  moveMemo: (memoId: string, targetProjectId: string) => Promise<MemoInterface>;
  bulkMoveMemos: (
    data: BulkMoveMemosRequestInterface,
  ) => Promise<BulkMoveMemosResponseInterface>;
  revokeMemoAccess: (memoId: string) => void;
  loadMembers: (projectId: string) => Promise<void>;
  inviteMember: (
    projectId: string,
    user: UserInterface,
    role: ProjectRole,
    scope?: InviteMemberScopeInterface,
  ) => Promise<void>;
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
