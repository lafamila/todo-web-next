'use client';

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from 'react';
import type {
  TodoAppStateInterface,
  TodoAppContextTypeInterface,
  ProjectInterface,
  MemoInterface,
  CreateProjectRequestInterface,
  UserInterface,
  ProjectRole,
  InviteMemberScopeInterface,
  SortOption,
} from '@/lib/types';
import * as api from '@/lib/api';
import {
  canAdoptMemoSelection,
  selectionAfterMemoSaveIfCurrent,
} from '@/lib/memoSelectionPolicy';
import { useAuth } from './AuthContext';
import { io } from 'socket.io-client';
import { SOCKET_BASE_URL, SOCKET_PATH } from '@/lib/constants';
import {
  finishProjectMutation,
  shouldDeferProjectsChanged,
  shouldClearProjectAfterAccessFailure,
  isSameProjectActivation,
  shouldFollowMovedMemo,
} from '@/lib/projectHierarchy';

const initialState: TodoAppStateInterface = {
  selectedProject: null,
  selectedMemo: null,
  projects: [],
  memos: [],
  isProjectSidebarHovered: false,
  sortOption: 'created',
  isLoading: false,
  error: null,
  selectedMemoIds: [],
  members: [],
};

const AppContext = createContext<TodoAppContextTypeInterface | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, user } = useAuth();
  const [state, setState] = useState<TodoAppStateInterface>(initialState);
  const stateRef = useRef<TodoAppStateInterface>(initialState);
  const selectionEpochRef = useRef(0);
  const consumedMemoUrlRef = useRef<string | null>(null);
  const intendedProjectIdRef = useRef<string | null>(null);
  const committedProjectIdRef = useRef<string | null>(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const refreshProjects = useCallback(async () => {
    try {
      const snapshot = stateRef.current;
      setState((prev) => ({ ...prev, isLoading: true, error: null }));
      const projects = await api.getAllProjects();
      const expectedProjectId = snapshot.selectedProject?.id ?? null;
      let convertedSelection: {
        project: ProjectInterface;
        memos: MemoInterface[];
        selectedMemo: MemoInterface | null;
      } | null = null;
      const freshExpected = expectedProjectId
        ? projects.find((project) => project.id === expectedProjectId) ?? null
        : null;

      // 다른 노드에서 첫 자식을 만들면 현재 root가 group으로 바뀌지만 memo id는 유지된다.
      // 새 child를 찾아 로컬 편집 본문을 그대로 유지한다.
      if (freshExpected?.isGroup) {
        try {
          let target: ProjectInterface | undefined;
          let selectedFresh: MemoInterface | null = null;
          if (snapshot.selectedMemo) {
            const moved = await api.getMemo(snapshot.selectedMemo.id);
            target = projects.find(
              (project) =>
                project.id === moved.projectId &&
                project.parentProjectId === freshExpected.id &&
                !project.navigationOnly,
            );
            selectedFresh = target
              ? {
                  ...moved,
                  content: snapshot.selectedMemo.content,
                  serverContent: moved.content,
                }
              : null;
          } else {
            target = projects.find(
              (project) =>
                project.parentProjectId === freshExpected.id && !project.navigationOnly,
            );
          }
          if (target) {
            convertedSelection = {
              project: target,
              memos: await api.getProjectMemos(target.id),
              selectedMemo: selectedFresh,
            };
          }
        } catch {
          // 권한이 이미 회수됐으면 아래의 selectionLost 경로가 화면을 비운다.
        }
      }
      setState((prev) => {
        if (prev.selectedProject?.id !== expectedProjectId) {
          return { ...prev, projects, isLoading: false };
        }
        if (convertedSelection) {
          intendedProjectIdRef.current = convertedSelection.project.id;
          committedProjectIdRef.current = convertedSelection.project.id;
          selectionEpochRef.current += 1;
          return {
            ...prev,
            projects,
            selectedProject: convertedSelection.project,
            memos: convertedSelection.memos,
            selectedMemo: convertedSelection.selectedMemo,
            selectedMemoIds: prev.selectedMemoIds.filter((id) =>
              convertedSelection?.memos.some((memo) => memo.id === id),
            ),
            members: [],
            isLoading: false,
          };
        }
        const selectedProject = prev.selectedProject
          ? projects.find((project) => project.id === prev.selectedProject?.id) ?? null
          : null;
        const selectionLost =
          prev.selectedProject !== null &&
          (selectedProject === null || selectedProject.isGroup || selectedProject.navigationOnly);
        return {
          ...prev,
          projects,
          selectedProject: selectionLost ? null : selectedProject,
          selectedMemo: selectionLost ? null : prev.selectedMemo,
          selectedMemoIds: selectionLost ? [] : prev.selectedMemoIds,
          memos: selectionLost ? [] : prev.memos,
          members: selectionLost ? [] : prev.members,
          isLoading: false,
        };
      });
     } catch {
      setState((prev) => ({
        ...prev,
        error: '프로젝트 목록을 불러오는데 실패했습니다.',
        isLoading: false,
      }));
    }
  }, []);

  // 인증 상태 변경 시 프로젝트 로드 (로그인 시) 또는 초기화 (로그아웃 시)
  useEffect(() => {
    if (isAuthenticated && user?.permission !== 'visitor') {
      Promise.resolve().then(refreshProjects);
    } else {
      intendedProjectIdRef.current = null;
      committedProjectIdRef.current = null;
      selectionEpochRef.current += 1;
      Promise.resolve().then(() => setState(initialState));
    }
  }, [isAuthenticated, refreshProjects, user?.permission]);

  // Project Actions
  const selectProject = useCallback(async (project: ProjectInterface) => {
    if (project.isGroup || project.navigationOnly) return;
    if (isSameProjectActivation(stateRef.current.selectedProject?.id, project.id)) {
      intendedProjectIdRef.current = project.id;
      committedProjectIdRef.current = project.id;
      setState((prev) => ({ ...prev, selectedProject: project }));
      return;
    }
    const requestEpoch = ++selectionEpochRef.current;
    intendedProjectIdRef.current = project.id;
    try {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      const memos = await api.getProjectMemos(project.id);

      if (requestEpoch !== selectionEpochRef.current) return;
      committedProjectIdRef.current = project.id;

      setState((prev) => ({
        ...prev,
        selectedProject: project,
        memos,
        selectedMemo: null,
        selectedMemoIds: [],
        members: [],
        isLoading: false,
      }));
     } catch {
      if (requestEpoch !== selectionEpochRef.current) return;
      intendedProjectIdRef.current = committedProjectIdRef.current;
      setState((prev) => ({
        ...prev,
        error: '메모 목록을 불러오는데 실패했습니다.',
        isLoading: false,
      }));
    }
  }, []);

  const refreshCurrentProject = useCallback(async () => {
    const projectId = state.selectedProject?.id;
    if (!projectId) return;
    try {
      const memos = await api.getProjectMemos(projectId);
      setState((prev) => {
        if (prev.selectedProject?.id !== projectId) return prev;
        const selectedFresh = prev.selectedMemo
          ? memos.find((memo) => memo.id === prev.selectedMemo?.id)
          : undefined;
        return {
          ...prev,
          memos,
          // MemoSection이 별도 로컬 버퍼를 소유한다. 목록 metadata만 갱신하고
          // 선택 메모의 content는 소켓 보호 경로를 우회해 덮지 않는다.
          selectedMemo:
            prev.selectedMemo && selectedFresh
              ? {
                  ...selectedFresh,
                  content: prev.selectedMemo.content,
                  serverContent: selectedFresh.content,
                }
              : selectedFresh ?? null,
        };
      });
    } catch (error) {
      if (!(error instanceof api.ApiError) || ![403, 404].includes(error.status)) throw error;
      setState((prev) => {
        if (!shouldClearProjectAfterAccessFailure(projectId, prev.selectedProject?.id)) return prev;
        // 늦은 이전 프로젝트 응답이 새 선택의 refs를 지우지 않도록 current 일 때만 폐기한다.
        selectionEpochRef.current += 1;
        intendedProjectIdRef.current = null;
        committedProjectIdRef.current = null;
        return {
          ...prev,
          selectedProject: null,
          selectedMemo: null,
          selectedMemoIds: [],
          memos: [],
          members: [],
        };
      });
    }
  }, [state.selectedProject?.id]);

  const projectMutationDepthRef = useRef(0);
  const deferredProjectsChangedRef = useRef(false);
  const reconcileProjectState = useCallback(() => {
    void Promise.allSettled([refreshProjects(), refreshCurrentProject()]);
  }, [refreshCurrentProject, refreshProjects]);
  const beginProjectMutation = useCallback(() => {
    projectMutationDepthRef.current += 1;
  }, []);
  const endProjectMutation = useCallback(() => {
    const outcome = finishProjectMutation(
      projectMutationDepthRef.current,
      deferredProjectsChangedRef.current,
    );
    projectMutationDepthRef.current = outcome.mutationDepth;
    if (!outcome.shouldRefresh) return;
    deferredProjectsChangedRef.current = false;
    // HTTP 응답 처리의 setState가 먼저 commit되어 dirty editor가 같은 memo id로 이어진다.
    window.setTimeout(reconcileProjectState, 0);
  }, [reconcileProjectState]);

  const createProject = useCallback(
    async (data: CreateProjectRequestInterface): Promise<ProjectInterface> => {
      beginProjectMutation();
      try {
        setState((prev) => ({ ...prev, isLoading: true, error: null }));

        const newProject = await api.createProject(data);
        const projects = await api.getAllProjects();
        const convertsCurrentRoot = Boolean(
          data.parentProjectId && state.selectedProject?.id === data.parentProjectId,
        );

        if (convertsCurrentRoot) {
          const memos = await api.getProjectMemos(newProject.id);
          const selectedFresh = state.selectedMemo
            ? memos.find((memo) => memo.id === state.selectedMemo?.id)
            : undefined;
          selectionEpochRef.current += 1;
          intendedProjectIdRef.current = newProject.id;
          committedProjectIdRef.current = newProject.id;
          setState((prev) => ({
            ...prev,
            projects,
            selectedProject: newProject,
            memos,
            // 첫 자식 생성은 memo id를 바꾸지 않는다. 편집기의 로컬 본문을 보존한다.
            selectedMemo:
              prev.selectedMemo && selectedFresh
                ? {
                    ...selectedFresh,
                    content: prev.selectedMemo.content,
                    serverContent: selectedFresh.content,
                  }
                : selectedFresh ?? null,
            selectedMemoIds: prev.selectedMemoIds.filter((id) =>
              memos.some((memo) => memo.id === id),
            ),
            members: [],
            isLoading: false,
          }));
        } else {
          setState((prev) => ({ ...prev, projects, isLoading: false }));
          await selectProject(newProject);
        }
        return newProject;
       } catch (error) {
        setState((prev) => ({
          ...prev,
          error: '프로젝트 생성에 실패했습니다.',
          isLoading: false,
        }));
        throw error;
      } finally {
        endProjectMutation();
      }
    },
    [beginProjectMutation, endProjectMutation, selectProject, state.selectedMemo, state.selectedProject]
  );

  const deleteProject = useCallback(async (
    projectId: string,
    confirmationName: string,
  ) => {
    beginProjectMutation();
    try {
      await api.deleteProject(projectId, confirmationName);
      setState((prev) => {
      const deleted = prev.projects.find((project) => project.id === projectId);
      const deletedIds = new Set([
        projectId,
        ...(deleted?.isGroup
          ? prev.projects
              .filter((project) => project.parentProjectId === projectId)
              .map((project) => project.id)
          : []),
      ]);
      const clearsSelection = Boolean(
        prev.selectedProject && deletedIds.has(prev.selectedProject.id),
      );
      if (clearsSelection) {
        selectionEpochRef.current += 1;
        intendedProjectIdRef.current = null;
        committedProjectIdRef.current = null;
      }
      return {
        ...prev,
        projects: prev.projects.filter((project) => !deletedIds.has(project.id)),
        selectedProject: clearsSelection ? null : prev.selectedProject,
        selectedMemo: clearsSelection ? null : prev.selectedMemo,
        selectedMemoIds: clearsSelection ? [] : prev.selectedMemoIds,
        memos: clearsSelection ? [] : prev.memos,
        members: clearsSelection ? [] : prev.members,
      };
      });
      await refreshProjects();
    } finally {
      endProjectMutation();
    }
  }, [beginProjectMutation, endProjectMutation, refreshProjects]);

  const verifyProjectPassword = useCallback(
    async (projectId: string, password: string): Promise<boolean> => {
      try {
        const verified = await api.verifyPassword(projectId, password);
        return verified;
       } catch {
        setState((prev) => ({
          ...prev,
          error: '비밀번호 검증에 실패했습니다.',
        }));
        return false;
      }
    },
    []
  );

  // Memo Actions
  const selectMemo = useCallback(async (memo: MemoInterface): Promise<boolean> => {
    if (memo.projectId !== intendedProjectIdRef.current) return false;
    const requestEpoch = ++selectionEpochRef.current;
    try {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      const fullMemo = await api.getMemo(memo.id);

      if (!canAdoptMemoSelection(
        fullMemo.projectId,
        intendedProjectIdRef.current,
        requestEpoch,
        selectionEpochRef.current,
      )) return false;

      setState((prev) => {
        if (prev.selectedProject?.id !== fullMemo.projectId) return prev;
        return {
          ...prev,
          selectedMemo: fullMemo,
          selectedMemoIds: [],
          isLoading: false,
        };
      });
      return true;
     } catch {
      if (requestEpoch !== selectionEpochRef.current) return false;
      setState((prev) => ({
        ...prev,
        error: '메모를 불러오는데 실패했습니다.',
        isLoading: false,
      }));
      return false;
    }
  }, []);

  const createMemo = useCallback(
    async (title: string) => {
      if (!state.selectedProject || !state.selectedProject.canWrite || state.selectedProject.isGroup) {
        setState((prev) => ({
          ...prev,
          error: '프로젝트를 먼저 선택해주세요.',
        }));
        return;
      }

      try {
        setState((prev) => ({ ...prev, isLoading: true, error: null }));

        const newMemo = await api.createMemo({
          projectId: state.selectedProject.id,
          title,
        });

        setState((prev) => ({
          ...prev,
          memos: [...prev.memos, newMemo],
          isLoading: false,
        }));

        await selectMemo(newMemo);
      } catch (error) {
        const err = error as Error & { existingMemoId?: string };
        if (err.message === 'Duplicate memo title' && err.existingMemoId) {
          const existingMemo = state.memos.find((m) => m.id === err.existingMemoId);
          if (existingMemo) {
            setState((prev) => ({ ...prev, isLoading: false }));
            await selectMemo(existingMemo);
            return;
          }
        }

        setState((prev) => ({
          ...prev,
          error: '메모 생성에 실패했습니다.',
          isLoading: false,
        }));
        throw error;
      }
    },
    [state.selectedProject, state.memos, selectMemo]
  );

  const updateMemo = useCallback(
    async (content: string, baseRevision?: string): Promise<MemoInterface> => {
      if (!state.selectedMemo) {
        setState((prev) => ({
          ...prev,
          error: '메모를 먼저 선택해주세요.',
        }));
        throw new Error('메모를 먼저 선택해주세요.');
      }

      try {
        const saveSelectionEpoch = selectionEpochRef.current;
        const updatedMemo = await api.updateMemo(
          state.selectedMemo.id,
          content,
          baseRevision,
        );

        setState((prev) => ({
          ...prev,
          selectedMemo: selectionAfterMemoSaveIfCurrent(
            prev.selectedMemo,
            updatedMemo,
            saveSelectionEpoch,
            selectionEpochRef.current,
          ),
          memos: prev.memos.map((memo) =>
            memo.id === updatedMemo.id ? updatedMemo : memo
          ),
        }));
        return updatedMemo;
       } catch (error) {
        setState((prev) => ({
          ...prev,
          error: '메모 저장에 실패했습니다.',
        }));
        throw error;
      }
    },
    [state.selectedMemo]
  );

  const setSortOption = useCallback((option: SortOption) => {
    setState((prev) => ({ ...prev, sortOption: option }));
  }, []);

  const toggleSelectMemo = useCallback((memoId: string) => {
    setState((prev) => {
      const isSelected = prev.selectedMemoIds.includes(memoId);
      return {
        ...prev,
        selectedMemoIds: isSelected
          ? prev.selectedMemoIds.filter((id) => id !== memoId)
          : [...prev.selectedMemoIds, memoId],
        selectedMemo: null,
      };
    });
  }, []);

  const clearSelectedMemos = useCallback(() => {
    setState((prev) => ({ ...prev, selectedMemoIds: [] }));
  }, []);

  const deleteMemos = useCallback(async (memoIds: string[]) => {
    try {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));
      await api.bulkDeleteMemos(memoIds);
      setState((prev) => ({
        ...prev,
        memos: prev.memos.filter((m) => !memoIds.includes(m.id)),
        selectedMemoIds: [],
        selectedMemo: null,
        isLoading: false,
      }));
    } catch {
      setState((prev) => ({
        ...prev,
        error: '메모 삭제에 실패했습니다.',
        isLoading: false,
      }));
    }
  }, []);

  const moveMemo = useCallback(async (
    memoId: string,
    targetProjectId: string,
  ): Promise<MemoInterface> => {
    beginProjectMutation();
    const moveSelectionEpoch = selectionEpochRef.current;
    const sourceProjectId = stateRef.current.selectedProject?.id ?? null;
    const selectedAtRequest = stateRef.current.selectedMemo?.id === memoId;
    try {
      const moved = await api.moveMemo(memoId, targetProjectId);
      if (selectedAtRequest) {
        let targetProject = stateRef.current.projects.find(
          (project) => project.id === targetProjectId,
        );
        let projects = stateRef.current.projects;
        if (!targetProject) {
          projects = await api.getAllProjects();
          targetProject = projects.find((project) => project.id === targetProjectId);
        }
        if (!targetProject) throw new Error('이동 대상 프로젝트를 찾을 수 없습니다.');
        const targetMemos = await api.getProjectMemos(targetProjectId);
        if (!shouldFollowMovedMemo({
          expectedSelectionEpoch: moveSelectionEpoch,
          currentSelectionEpoch: selectionEpochRef.current,
          expectedProjectId: sourceProjectId,
          currentProjectId: stateRef.current.selectedProject?.id,
          expectedMemoId: memoId,
          currentMemoId: stateRef.current.selectedMemo?.id,
        })) return moved;
        selectionEpochRef.current += 1;
        intendedProjectIdRef.current = targetProjectId;
        committedProjectIdRef.current = targetProjectId;
        setState((prev) => ({
          ...prev,
          projects,
          selectedProject: targetProject,
          memos: targetMemos,
          selectedMemo:
            prev.selectedMemo?.id === memoId
              ? {
                  ...moved,
                  content: prev.selectedMemo.content,
                  serverContent: moved.content,
                }
              : prev.selectedMemo,
          selectedMemoIds: [],
          members: [],
        }));
      } else {
        setState((prev) => ({
          ...prev,
          memos:
            prev.selectedProject?.id === sourceProjectId
              ? prev.memos.filter((memo) => memo.id !== memoId)
              : prev.memos,
          selectedMemoIds: prev.selectedMemoIds.filter((id) => id !== memoId),
        }));
      }
      return moved;
    } finally {
      endProjectMutation();
    }
  }, [beginProjectMutation, endProjectMutation]);

  const revokeMemoAccess = useCallback((memoId: string) => {
    setState((prev) => ({
      ...prev,
      memos: prev.memos.filter((memo) => memo.id !== memoId),
      selectedMemo: prev.selectedMemo?.id === memoId ? null : prev.selectedMemo,
      selectedMemoIds: prev.selectedMemoIds.filter((id) => id !== memoId),
    }));
  }, []);

  // Member Actions
  const loadMembers = useCallback(async (projectId: string) => {
    try {
      const members = await api.getProjectMembers(projectId);
      setState((prev) => ({ ...prev, members }));
    } catch {
      setState((prev) => ({
        ...prev,
        error: '멤버 목록을 불러오는데 실패했습니다.',
      }));
    }
  }, []);

  const inviteMember = useCallback(async (
    projectId: string,
    user: UserInterface,
    role: ProjectRole,
    scope?: InviteMemberScopeInterface,
  ) => {
    beginProjectMutation();
    try {
      await api.inviteMember(projectId, user.id, role, user, scope);
      // 멤버 목록 새로고침
      const members = await api.getProjectMembers(projectId);
      setState((prev) => ({ ...prev, members }));
    } catch (error) {
      const message = error instanceof Error ? error.message : '멤버 초대에 실패했습니다.';
      setState((prev) => ({ ...prev, error: message }));
      throw error;
    } finally {
      endProjectMutation();
    }
  }, [beginProjectMutation, endProjectMutation]);

  const removeMember = useCallback(async (projectId: string, userId: string) => {
    beginProjectMutation();
    try {
      await api.removeMember(projectId, userId);
      setState((prev) => ({
        ...prev,
        members: prev.members.filter((m) => m.userId !== userId),
      }));
    } catch {
      setState((prev) => ({
        ...prev,
        error: '멤버 제거에 실패했습니다.',
      }));
    } finally {
      endProjectMutation();
    }
  }, [beginProjectMutation, endProjectMutation]);

  // 프로젝트 계층·멤버십·삭제는 현재 메모 방 구독과 무관하게 바뀔 수 있다.
  // 최소 payload 알림을 받으면 목록과 현재 프로젝트를 각각 권한 재검증한다.
  useEffect(() => {
    if (!isAuthenticated || user?.permission === 'visitor') return;
    const socket = io(SOCKET_BASE_URL, {
      path: SOCKET_PATH,
      withCredentials: true,
      transports: ['websocket', 'polling'],
      reconnection: true,
    });
    const refreshAfterProjectChange = () => {
      if (shouldDeferProjectsChanged(projectMutationDepthRef.current)) {
        deferredProjectsChangedRef.current = true;
        return;
      }
      reconcileProjectState();
    };
    socket.on('projectsChanged', refreshAfterProjectChange);
    return () => {
      socket.off('projectsChanged', refreshAfterProjectChange);
      socket.disconnect();
    };
  }, [isAuthenticated, reconcileProjectState, user?.permission]);

  // URL 쿼리 파라미터로 메모 열기
  useEffect(() => {
    const openMemoFromUrl = async () => {
      if (typeof window === 'undefined' || state.projects.length === 0) return;

      const urlParams = new URLSearchParams(window.location.search);
      const projectId = urlParams.get('projectId');
      const memoId = urlParams.get('memoId');
      if (!projectId || !memoId) return;
      const intentKey = `${user?.id ?? 'anonymous'}:${window.location.pathname}${window.location.search}`;
      if (consumedMemoUrlRef.current === intentKey) return;
      const hintedProject = state.projects.find((project) => project.id === projectId);
      if (!hintedProject) return;
      consumedMemoUrlRef.current = intentKey;
      const urlSelectionEpoch = selectionEpochRef.current;

      try {
        // 메모가 sibling/첫 child로 이동했어도 canonical projectId를 따라간다.
        const memo = await api.getMemo(memoId);
        if (
          consumedMemoUrlRef.current !== intentKey ||
          selectionEpochRef.current !== urlSelectionEpoch
        ) return;
        const actualProject = state.projects.find(
          (project) => project.id === memo.projectId && !project.isGroup && !project.navigationOnly,
        );
        if (!actualProject) return;
        await selectProject(actualProject);
        if (consumedMemoUrlRef.current !== intentKey) return;
        await selectMemo(memo);
      } catch {
        // 오래되었거나 권한이 회수된 링크는 현재 선택을 되돌리지 않고 한 번만 무시한다.
      }
    };

    void openMemoFromUrl();
  }, [state.projects, selectProject, selectMemo, user?.id]);

  const value: TodoAppContextTypeInterface = {
    state,
    refreshProjects,
    refreshCurrentProject,
    selectProject,
    createProject,
    deleteProject,
    verifyProjectPassword,
    selectMemo,
    createMemo,
    updateMemo,
    setSortOption,
    toggleSelectMemo,
    clearSelectedMemos,
    deleteMemos,
    moveMemo,
    revokeMemoAccess,
    loadMembers,
    inviteMember,
    removeMember,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): TodoAppContextTypeInterface {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
