import {
  SOCKET_BASE_URL,
  SOCKET_PATH,
  TODO_API_BASE_URL,
} from "./constants";
import type {
  ArticleInterface,
  ArticleListItemInterface,
  CalendarMonthInterface,
  CreateMemoRequestInterface,
  CreateProjectRequestInterface,
  DailyTaskTypeInterface,
  DayDetailInterface,
  MemoInterface,
  MemoLeaseInterface,
  MemoMergeResultInterface,
  MemoVersionInterface,
  ProjectInterface,
  ProjectMergeResultInterface,
  ProjectMemberInterface,
  ProjectRole,
  SyncIssuesResponseInterface,
  SyncStatusInterface,
  UserInterface,
} from "./types";

const memoLeaseTokens = new Map<string, MemoLeaseInterface>();

export function setMemoLease(lease: MemoLeaseInterface | null): void {
  if (lease) {
    memoLeaseTokens.set(lease.memoId, lease);
  }
}

export function clearMemoLease(memoId: string): void {
  memoLeaseTokens.delete(memoId);
}

interface ApiErrorDetailShape {
  code?: string;
  message?: string;
  existingMemoId?: string;
}

interface ApiErrorShape {
  message?: string;
  error?: string;
  error_description?: string;
  detail?: string | ApiErrorDetailShape;
}

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

async function parseError(response: Response, fallback: string): Promise<ApiError> {
  const errorData = (await response.json().catch(() => null)) as ApiErrorShape | null;
  const detail =
    typeof errorData?.detail === "string" ? errorData.detail : undefined;
  const structuredDetail =
    errorData?.detail && typeof errorData.detail === "object"
      ? errorData.detail
      : undefined;
  const description =
    typeof errorData?.error_description === "string"
      ? errorData.error_description
      : undefined;
  const code =
    structuredDetail?.code ??
    (typeof errorData?.error === "string" ? errorData.error : undefined);
  const message =
    detail ??
    structuredDetail?.message ??
    description ??
    errorData?.message ??
    fallback;

  return new ApiError(message, response.status, code);
}

async function fetchJson<T>(
  path: string,
  init?: RequestInit,
  fallbackMessage = "Request failed",
): Promise<T> {
  const response = await fetch(`${TODO_API_BASE_URL}${path}`, {
    credentials: "include",
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    throw await parseError(response, fallbackMessage);
  }

  return response.json() as Promise<T>;
}

async function fetchVoid(
  path: string,
  init?: RequestInit,
  fallbackMessage = "Request failed",
): Promise<void> {
  const response = await fetch(`${TODO_API_BASE_URL}${path}`, {
    credentials: "include",
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    throw await parseError(response, fallbackMessage);
  }
}

export { SOCKET_BASE_URL, SOCKET_PATH };

interface LoginStartResponse {
  authorizeUrl?: string;
  authorize_url?: string;
  loginTransactionId?: string;
  expiresAt?: string;
}

export async function startLogin(): Promise<{
  authorizeUrl: string;
  loginTransactionId?: string;
  expiresAt?: string;
}> {
  const response = await fetchJson<LoginStartResponse>(
    "/session/oidc/start",
    {
      method: "POST",
    },
    "로그인을 시작하지 못했습니다.",
  );

  const authorizeUrl = response.authorizeUrl ?? response.authorize_url;
  if (!authorizeUrl) {
    throw new ApiError("로그인 시작 응답이 올바르지 않습니다.", 502);
  }

  return {
    authorizeUrl,
    loginTransactionId: response.loginTransactionId,
    expiresAt: response.expiresAt,
  };
}

export async function getMe(): Promise<UserInterface> {
  return fetchJson<UserInterface>("/session/me", undefined, "Failed to fetch user info");
}

export async function logout(): Promise<void> {
  await fetchVoid("/session/logout", { method: "POST" }, "로그아웃에 실패했습니다.");
}

export async function requestTodoServiceAccess(message: string): Promise<void> {
  await fetchVoid(
    "/session/service-application",
    {
      method: "POST",
      body: JSON.stringify({ message }),
    },
    "사용 신청에 실패했습니다.",
  );
}

export async function searchUsers(query: string): Promise<UserInterface[]> {
  return fetchJson<UserInterface[]>(
    `/users/search?q=${encodeURIComponent(query)}`,
    undefined,
    "Failed to search users",
  );
}

export async function inviteMember(
  projectId: string,
  userId: string,
  role: ProjectRole = "viewer",
  user?: UserInterface,
): Promise<ProjectMemberInterface> {
  return fetchJson<ProjectMemberInterface>(
    `/projects/${projectId}/members`,
    {
      method: "POST",
      body: JSON.stringify({
        userId,
        role,
        username: user?.username ?? user?.loginId,
        displayName: user?.displayName ?? user?.name,
        email: user?.email,
      }),
    },
    "멤버 초대에 실패했습니다.",
  );
}

export async function removeMember(
  projectId: string,
  userId: string,
): Promise<{ message: string }> {
  return fetchJson<{ message: string }>(
    `/projects/${projectId}/members/${userId}`,
    { method: "DELETE" },
    "Failed to remove member",
  );
}

export async function getProjectMembers(
  projectId: string,
): Promise<ProjectMemberInterface[]> {
  return fetchJson<ProjectMemberInterface[]>(
    `/projects/${projectId}/members`,
    undefined,
    "Failed to fetch project members",
  );
}

export async function createProject(
  data: CreateProjectRequestInterface,
): Promise<ProjectInterface> {
  return fetchJson<ProjectInterface>(
    "/projects",
    {
      method: "POST",
      body: JSON.stringify(data),
    },
    "Failed to create project",
  );
}

export async function verifyPassword(
  projectId: string,
  password: string,
): Promise<boolean> {
  try {
    const data = await fetchJson<{ verified: boolean }>(
      `/projects/${projectId}/verify`,
      {
        method: "POST",
        body: JSON.stringify({ password }),
      },
      "비밀번호 검증에 실패했습니다.",
    );

    return data.verified;
  } catch {
    return false;
  }
}

export async function getProjectMemos(projectId: string): Promise<MemoInterface[]> {
  return fetchJson<MemoInterface[]>(
    `/projects/${projectId}/memos`,
    undefined,
    "Failed to fetch memos",
  );
}

export async function getAllProjects(): Promise<ProjectInterface[]> {
  return fetchJson<ProjectInterface[]>("/projects", undefined, "Failed to fetch projects");
}

export async function createMemo(
  data: CreateMemoRequestInterface,
): Promise<MemoInterface> {
  const response = await fetch(`${TODO_API_BASE_URL}/memos`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (response.status === 409) {
    const errorData = (await response.json().catch(() => null)) as ApiErrorShape | null;
    const error = new Error("Duplicate memo title") as Error & {
      existingMemoId?: string;
    };
    if (
      errorData?.detail &&
      typeof errorData.detail === "object" &&
      "existingMemoId" in errorData.detail
    ) {
      error.existingMemoId = errorData.detail.existingMemoId;
    }
    throw error;
  }

  if (!response.ok) {
    throw await parseError(response, "Failed to create memo");
  }

  return response.json() as Promise<MemoInterface>;
}

export async function getMemo(id: string): Promise<MemoInterface> {
  return fetchJson<MemoInterface>(`/memos/${id}`, undefined, "Failed to fetch memo");
}

export async function updateMemo(id: string, content: string): Promise<MemoInterface> {
  const lease = memoLeaseTokens.get(id);
  return fetchJson<MemoInterface>(
    `/memos/${id}`,
    {
      method: "PUT",
      headers: lease
        ? { "X-Memo-Lease-Token": lease.leaseToken }
        : undefined,
      body: JSON.stringify({ content }),
    },
    "Failed to update memo",
  );
}

export async function getSyncStatus(): Promise<SyncStatusInterface> {
  return fetchJson<SyncStatusInterface>(
    "/sync/status",
    undefined,
    "동기화 상태를 불러오지 못했습니다.",
  );
}

export async function getSyncIssues(): Promise<SyncIssuesResponseInterface> {
  return fetchJson<SyncIssuesResponseInterface>(
    "/sync/issues",
    undefined,
    "동기화 문제 목록을 불러오지 못했습니다.",
  );
}

export async function resolveSyncIssues(issueIds: string[]): Promise<{
  resolved: number;
  counts: Record<string, number>;
}> {
  return fetchJson(
    "/sync/issues/resolve",
    {
      method: "POST",
      body: JSON.stringify({ issueIds }),
    },
    "동기화 문제를 해결 처리하지 못했습니다.",
  );
}

export async function getMemoVersions(id: string): Promise<MemoVersionInterface[]> {
  return fetchJson<MemoVersionInterface[]>(
    `/memos/${id}/versions`,
    undefined,
    "메모 버전 목록을 불러오지 못했습니다.",
  );
}

export async function getMemoVersion(
  id: string,
  version: number,
): Promise<MemoVersionInterface> {
  return fetchJson<MemoVersionInterface>(
    `/memos/${id}/versions/${version}`,
    undefined,
    "보존된 메모 버전을 불러오지 못했습니다.",
  );
}

export async function mergeMemo(
  loserId: string,
  winnerId: string,
): Promise<MemoMergeResultInterface> {
  return fetchJson<MemoMergeResultInterface>(
    `/memos/${loserId}/merge-into/${winnerId}`,
    { method: "POST" },
    "메모를 병합하지 못했습니다.",
  );
}

export async function mergeProject(
  loserId: string,
  winnerId: string,
): Promise<ProjectMergeResultInterface> {
  return fetchJson<ProjectMergeResultInterface>(
    `/projects/${loserId}/merge-into/${winnerId}`,
    { method: "POST" },
    "프로젝트를 병합하지 못했습니다.",
  );
}

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));

export async function waitForMemoMergeApplied(
  projectId: string,
  loserId: string,
  winnerId: string,
  attempts = 20,
): Promise<MemoInterface> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const [winner, memos] = await Promise.all([
        getMemo(winnerId),
        getProjectMemos(projectId),
      ]);
      if (
        memos.some((memo) => memo.id === winnerId) &&
        !memos.some((memo) => memo.id === loserId)
      ) {
        return winner;
      }
    } catch {
      // pull 적용 중에는 winner/목록 중 한쪽만 먼저 보일 수 있어 다음 poll로 확인한다.
    }
    await wait(500);
  }
  throw new Error(
    '원격 병합은 완료되었지만 이 장치의 동기화 반영을 기다리는 중입니다. 잠시 후 다시 확인하세요.',
  );
}

export async function waitForProjectMergeApplied(
  loserId: string,
  winnerId: string,
  attempts = 20,
): Promise<ProjectInterface> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const projects = await getAllProjects();
      const winner = projects.find((project) => project.id === winnerId);
      if (winner && !projects.some((project) => project.id === loserId)) {
        return winner;
      }
    } catch {
      // 원격 merge 직후 pull이 목록에 반영되기 전이면 bounded retry 한다.
    }
    await wait(500);
  }
  throw new Error(
    '원격 병합은 완료되었지만 이 장치의 동기화 반영을 기다리는 중입니다. 잠시 후 다시 확인하세요.',
  );
}

export async function publishArticle(memoId: string): Promise<ArticleInterface> {
  return fetchJson<ArticleInterface>(
    "/articles",
    {
      method: "POST",
      body: JSON.stringify({ memoId }),
    },
    "Failed to publish article",
  );
}

export async function getArticles(
  projectId?: string,
  authorSlug?: string,
): Promise<ArticleListItemInterface[]> {
  const params = new URLSearchParams();
  if (projectId) params.set("projectId", projectId);
  if (authorSlug) params.set("authorSlug", authorSlug);
  const query = params.toString();

  return fetchJson<ArticleListItemInterface[]>(
    query ? `/articles?${query}` : "/articles",
    undefined,
    "Failed to fetch articles",
  );
}

export async function getArticle(articleId: string): Promise<ArticleInterface> {
  return fetchJson<ArticleInterface>(
    `/articles/${articleId}`,
    undefined,
    "Failed to fetch article",
  );
}

export async function deleteArticle(articleId: string): Promise<{ message: string }> {
  return fetchJson<{ message: string }>(
    `/articles/${articleId}`,
    { method: "DELETE" },
    "Failed to delete article",
  );
}

export async function getMemoArticle(memoId: string): Promise<ArticleInterface | null> {
  return fetchJson<ArticleInterface | null>(
    `/memos/${memoId}/article`,
    undefined,
    "Failed to fetch memo article status",
  );
}

export async function bulkDeleteMemos(
  memoIds: string[],
): Promise<{ message: string; deletedCount: number }> {
  return fetchJson<{ message: string; deletedCount: number }>(
    "/memos/bulk-delete",
    {
      method: "POST",
      body: JSON.stringify({ memoIds }),
    },
    "Failed to bulk delete memos",
  );
}

export async function getCalendarMonth(
  year: number,
  month: number,
): Promise<CalendarMonthInterface> {
  return fetchJson<CalendarMonthInterface>(
    `/daily-tasks/calendar?year=${year}&month=${month}`,
    undefined,
    "Failed to fetch calendar data",
  );
}

export async function getDayDetail(date: string): Promise<DayDetailInterface> {
  return fetchJson<DayDetailInterface>(
    `/daily-tasks/calendar/${date}`,
    undefined,
    "Failed to fetch day detail",
  );
}

export async function getTaskTypes(): Promise<DailyTaskTypeInterface[]> {
  return fetchJson<DailyTaskTypeInterface[]>(
    "/daily-tasks/types",
    undefined,
    "Failed to fetch task types",
  );
}

export async function createTaskType(
  data: { name: string; icon?: string; color?: string },
): Promise<DailyTaskTypeInterface> {
  return fetchJson<DailyTaskTypeInterface>(
    "/daily-tasks/types",
    {
      method: "POST",
      body: JSON.stringify(data),
    },
    "Failed to create task type",
  );
}

export async function updateTaskType(
  typeId: string,
  data: {
    name?: string;
    icon?: string;
    color?: string;
    isActive?: boolean;
    displayOrder?: number;
  },
): Promise<DailyTaskTypeInterface> {
  return fetchJson<DailyTaskTypeInterface>(
    `/daily-tasks/types/${typeId}`,
    {
      method: "PUT",
      body: JSON.stringify(data),
    },
    "Failed to update task type",
  );
}

export async function deleteTaskType(typeId: string): Promise<void> {
  await fetchVoid(
    `/daily-tasks/types/${typeId}`,
    { method: "DELETE" },
    "Failed to delete task type",
  );
}

export async function completeTask(taskTypeId: string, completedDate: string): Promise<void> {
  await fetchVoid(
    "/daily-tasks/complete",
    {
      method: "POST",
      body: JSON.stringify({ taskTypeId, completedDate }),
    },
    "Failed to complete task",
  );
}

export async function uncompleteTask(taskTypeId: string, date: string): Promise<void> {
  await fetchVoid(
    `/daily-tasks/complete/${taskTypeId}/${date}`,
    { method: "DELETE" },
    "Failed to uncomplete task",
  );
}

export async function getLiveKitToken(roomName: string): Promise<{ token: string }> {
  return fetchJson<{ token: string }>(
    "/livekit/token",
    {
      method: "POST",
      body: JSON.stringify({ roomName }),
    },
    "Failed to get LiveKit token",
  );
}
