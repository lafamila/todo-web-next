'use client';

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
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
  SortOption,
} from '@/lib/types';
import * as api from '@/lib/api';
import { useAuth } from './AuthContext';

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

  const loadProjects = async () => {
    try {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));
      const projects = await api.getAllProjects();
      setState((prev) => ({ ...prev, projects, isLoading: false }));
     } catch {
      setState((prev) => ({
        ...prev,
        error: '프로젝트 목록을 불러오는데 실패했습니다.',
        isLoading: false,
      }));
    }
  };

  // 인증 상태 변경 시 프로젝트 로드 (로그인 시) 또는 초기화 (로그아웃 시)
  useEffect(() => {
    if (isAuthenticated && user?.permission !== 'visitor') {
      Promise.resolve().then(loadProjects);
    } else {
      Promise.resolve().then(() => setState(initialState));
    }
  }, [isAuthenticated, user?.permission]);

  // Project Actions
  const selectProject = useCallback(async (project: ProjectInterface) => {
    try {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      const memos = await api.getProjectMemos(project.id);

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
      setState((prev) => ({
        ...prev,
        error: '메모 목록을 불러오는데 실패했습니다.',
        isLoading: false,
      }));
    }
  }, []);

  const createProject = useCallback(
    async (data: CreateProjectRequestInterface) => {
      try {
        setState((prev) => ({ ...prev, isLoading: true, error: null }));

        const newProject = await api.createProject(data);

        setState((prev) => ({
          ...prev,
          projects: [...prev.projects, newProject],
          isLoading: false,
        }));

        await selectProject(newProject);
       } catch (error) {
        setState((prev) => ({
          ...prev,
          error: '프로젝트 생성에 실패했습니다.',
          isLoading: false,
        }));
        throw error;
      }
    },
    [selectProject]
  );

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
  const selectMemo = useCallback(async (memo: MemoInterface) => {
    try {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      const fullMemo = await api.getMemo(memo.id);

      setState((prev) => ({
        ...prev,
        selectedMemo: fullMemo,
        selectedMemoIds: [],
        isLoading: false,
      }));
     } catch {
      setState((prev) => ({
        ...prev,
        error: '메모를 불러오는데 실패했습니다.',
        isLoading: false,
      }));
    }
  }, []);

  const createMemo = useCallback(
    async (title: string) => {
      if (!state.selectedProject) {
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
    async (content: string) => {
      if (!state.selectedMemo) {
        setState((prev) => ({
          ...prev,
          error: '메모를 먼저 선택해주세요.',
        }));
        return;
      }

      try {
        const updatedMemo = await api.updateMemo(state.selectedMemo.id, content);

        setState((prev) => ({
          ...prev,
          selectedMemo: updatedMemo,
          memos: prev.memos.map((memo) =>
            memo.id === updatedMemo.id ? updatedMemo : memo
          ),
        }));
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

  const inviteMember = useCallback(async (projectId: string, user: UserInterface, role: ProjectRole) => {
    try {
      await api.inviteMember(projectId, user.id, role, user);
      // 멤버 목록 새로고침
      const members = await api.getProjectMembers(projectId);
      setState((prev) => ({ ...prev, members }));
    } catch (error) {
      const message = error instanceof Error ? error.message : '멤버 초대에 실패했습니다.';
      setState((prev) => ({ ...prev, error: message }));
      throw error;
    }
  }, []);

  const removeMember = useCallback(async (projectId: string, userId: string) => {
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
    }
  }, []);

  // URL 쿼리 파라미터로 메모 열기
  useEffect(() => {
    const openMemoFromUrl = async () => {
      if (typeof window === 'undefined' || state.projects.length === 0) return;

      const urlParams = new URLSearchParams(window.location.search);
      const projectId = urlParams.get('projectId');
      const memoId = urlParams.get('memoId');

      if (projectId && memoId) {
        const project = state.projects.find((p) => p.id === projectId);
        if (project && (!state.selectedProject || state.selectedProject.id !== projectId)) {
          await selectProject(project);

          setTimeout(async () => {
            try {
              const memos = await api.getProjectMemos(projectId);
              const memo = memos.find((m) => m.id === memoId);
              if (memo) {
                await selectMemo(memo);
              }
             } catch (error) {
              console.error('Failed to load memo from URL:', error);
            }
          }, 100);
        }
      }
    };

    openMemoFromUrl();
  }, [state.projects, state.selectedProject, selectProject, selectMemo]);

  const value: TodoAppContextTypeInterface = {
    state,
    selectProject,
    createProject,
    verifyProjectPassword,
    selectMemo,
    createMemo,
    updateMemo,
    setSortOption,
    toggleSelectMemo,
    clearSelectedMemos,
    deleteMemos,
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
