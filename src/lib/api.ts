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
  LoginResponseInterface,
  MemoInterface,
  ProjectInterface,
  ProjectMemberInterface,
  ProjectRole,
  UserInterface,
} from "./types";

interface ApiErrorShape {
  message?: string;
  detail?: string | { existingMemoId?: string };
}

async function parseError(response: Response, fallback: string): Promise<Error> {
  const errorData = (await response.json().catch(() => null)) as ApiErrorShape | null;
  const message =
    typeof errorData?.detail === "string"
      ? errorData.detail
      : errorData?.message || fallback;

  return new Error(message);
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

export async function login(
  username: string,
  password: string,
): Promise<LoginResponseInterface> {
  return fetchJson<LoginResponseInterface>(
    "/session/login",
    {
      method: "POST",
      body: JSON.stringify({ loginId: username, password }),
    },
    "로그인에 실패했습니다.",
  );
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
  return fetchJson<MemoInterface>(
    `/memos/${id}`,
    {
      method: "PUT",
      body: JSON.stringify({ content }),
    },
    "Failed to update memo",
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
