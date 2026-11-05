import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from '@/contexts/AuthContext';
import { useSync } from '@/contexts/SyncContext';
import { SORT_OPTIONS } from "@/lib/constants";
import { MemoInterface, ProjectInterface, ProjectRole, SortOption, UserInterface } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { useMemo, useState, useRef, useEffect, useLayoutEffect, useCallback } from "react";
import * as api from "@/lib/api";
import { isTypingContext, MemoSection, SHOW_MEMO_LIST_EVENT } from "./MemoSection";
import { SyncStatusIndicator } from './SyncStatusIndicator';
import { useIsMobile } from '@/hooks/useIsMobile';
import {
  isDetailFullscreenShortcut,
  isMemberManagementShortcut,
} from '@/lib/projectSearchPolicy';
import { ProjectMemoSearch } from './ProjectMemoSearch';
import {
  OPEN_PROJECT_MEMBERS_EVENT,
  type OpenProjectMembersDetail,
} from './projectEvents';
import {
  buildMemberInviteScope,
  confirmationsMatchBulkMove,
  ownedLeafMoveTargets,
  siblingSubprojects,
} from '@/lib/projectHierarchy';
import { ProjectMemberModal } from './ProjectMemberModal';
import {
  TASKS_DEFAULT_WIDTH, TASKS_MIN_WIDTH, EDITOR_MIN_WIDTH,
  TASKS_RATIO_KEY, LEGACY_TASKS_WIDTH_KEY,
  clampPanelWidth, clearPanelRatio, panelWidthForRatio,
  readTasksPanelRatio, writePanelRatio,
} from '@/lib/panelLayout';

const DEFAULT_PANE_WIDTH = TASKS_DEFAULT_WIDTH;
// Tasks (n) 헤더 + 멤버초대 버튼 라인이 줄바꿈되지 않는 최소폭
const MIN_PANE_WIDTH = TASKS_MIN_WIDTH;

export default function MemoListSection() {
  const {
    state: { projects, selectedProject, memos, selectedMemo, sortOption, selectedMemoIds, members },
    selectMemo,
    createMemo,
    setSortOption,
    toggleSelectMemo,
    clearSelectedMemos,
    deleteMemos,
    moveMemo,
    bulkMoveMemos,
    loadMembers,
    inviteMember,
    removeMember,
  } = useApp();
  const { features, user } = useAuth();
  const { findIssue } = useSync();
  // 모바일은 목록/메모를 한 화면에 나란히 둘 수 없어 뷰를 전환한다 (선택 상태는 유지).
  const isMobile = useIsMobile();
  const [mobileView, setMobileView] = useState<'list' | 'detail'>('list');

  const [newMemoTitle, setNewMemoTitle] = useState('');
  // 날짜는 최신순이 기본. 이름은 오름차순이며, 활성 항목 재클릭 시 방향을 토글한다.
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  // tasks 영역 폭 (경계 드래그로 조절, localStorage 유지)
  const [tasksPaneWidth, setTasksPaneWidth] = useState(DEFAULT_PANE_WIDTH);
  const mainContainerRef = useRef<HTMLDivElement>(null);
  const tasksRatioRef = useRef<number | null>(null);
  const resizeCleanupRef = useRef<(() => void) | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  // Cmd/Ctrl+Enter 에디터 전체화면 — ESC 로 종료
  const [detailFullscreen, setDetailFullscreen] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const newTaskInputRef = useRef<HTMLInputElement>(null);
  const [showMemberModal, setShowMemberModal] = useState(false);
  const [memberProject, setMemberProject] = useState<ProjectInterface | null>(null);
  const [searchUserQuery, setSearchUserQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserInterface[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isInviting, setIsInviting] = useState(false);
  const [inviteRole, setInviteRole] = useState<ProjectRole>('editor');
  const [inviteAllChildren, setInviteAllChildren] = useState(true);
  const [inviteChildIds, setInviteChildIds] = useState<string[]>([]);
  const [movingMemo, setMovingMemo] = useState<MemoInterface | null>(null);
  const [moveTargetId, setMoveTargetId] = useState('');
  const [moveError, setMoveError] = useState('');
  const [isMoving, setIsMoving] = useState(false);
  const [showBulkMoveModal, setShowBulkMoveModal] = useState(false);
  const [bulkMoveTargetId, setBulkMoveTargetId] = useState('');
  const [sourceConfirmationName, setSourceConfirmationName] = useState('');
  const [targetConfirmationName, setTargetConfirmationName] = useState('');
  const [bulkMoveError, setBulkMoveError] = useState('');
  const [isBulkMoving, setIsBulkMoving] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);


  // 실제 grid 폭을 기준으로 복원한다. 모바일 표시/자동 clamp는 선호 비율을 덮지 않는다.
  useLayoutEffect(() => {
    const container = mainContainerRef.current;
    if (!container || isMobile) return;
    tasksRatioRef.current = readTasksPanelRatio(container.getBoundingClientRect().width);
    const restore = () => {
      const available = container.getBoundingClientRect().width;
      if (available <= 0) return;
      setTasksPaneWidth(panelWidthForRatio(
        tasksRatioRef.current, available, DEFAULT_PANE_WIDTH, MIN_PANE_WIDTH, EDITOR_MIN_WIDTH,
      ));
    };
    restore();
    const observer = new ResizeObserver(restore);
    observer.observe(container);
    return () => observer.disconnect();
  }, [isMobile, selectedProject?.id]);

  useEffect(() => () => resizeCleanupRef.current?.(), []);

  const startPaneResize = (e: React.PointerEvent) => {
    e.preventDefault();
    resizeCleanupRef.current?.();
    const container = mainContainerRef.current;
    if (!container || isMobile) return;
    const startX = e.clientX;
    const startWidth = e.currentTarget.closest('.main')?.getBoundingClientRect().width ?? tasksPaneWidth;
    const previousUserSelect = document.body.style.userSelect;
    setIsResizing(true);
    document.body.style.userSelect = 'none';
    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      const available = container.getBoundingClientRect().width;
      if (available <= 0) return;
      const width = clampPanelWidth(
        startWidth + ev.clientX - startX, available, MIN_PANE_WIDTH, EDITOR_MIN_WIDTH,
      );
      tasksRatioRef.current = width / available;
      setTasksPaneWidth(width);
      writePanelRatio(TASKS_RATIO_KEY, tasksRatioRef.current);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      document.body.style.userSelect = previousUserSelect;
      resizeCleanupRef.current = null;
      setIsResizing(false);
    };
    resizeCleanupRef.current = onUp;
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const resetPaneWidth = () => {
    resizeCleanupRef.current?.();
    tasksRatioRef.current = null;
    clearPanelRatio(TASKS_RATIO_KEY);
    clearPanelRatio(LEGACY_TASKS_WIDTH_KEY);
    const available = mainContainerRef.current?.getBoundingClientRect().width ?? DEFAULT_PANE_WIDTH + EDITOR_MIN_WIDTH;
    setTasksPaneWidth(clampPanelWidth(DEFAULT_PANE_WIDTH, available, MIN_PANE_WIDTH, EDITOR_MIN_WIDTH));
  };

  // 메모 선택이 풀리면 전체화면도 해제
  useEffect(() => {
    if (!selectedMemo) {
      setDetailFullscreen(false);
    }
  }, [selectedMemo]);

  // 모바일 앱바의 "← 목록" (MemoSection 이 이벤트로 알린다)
  useEffect(() => {
    const backToList = () => setMobileView('list');
    window.addEventListener(SHOW_MEMO_LIST_EVENT, backToList);
    return () => window.removeEventListener(SHOW_MEMO_LIST_EVENT, backToList);
  }, []);

  // 데스크톱으로 넓어지면 두 영역이 함께 보이므로 뷰 상태를 초기화한다.
  useEffect(() => {
    if (!isMobile) setMobileView('list');
  }, [isMobile]);

  // 프로젝트를 바꾸면 그 프로젝트의 목록부터 보여준다.
  useEffect(() => {
    setMobileView('list');
  }, [selectedProject?.id]);

  const handleOpenMemberModal = useCallback(async (project = selectedProject) => {
    if (!project || !project.canManage) return;
    const children = projects.filter((candidate) => candidate.parentProjectId === project.id);
    setMemberProject(project);
    setShowMemberModal(true);
    setSearchUserQuery('');
    setSearchResults([]);
    setInviteRole('editor');
    setInviteAllChildren(true);
    setInviteChildIds(children.map((child) => child.id));
    await loadMembers(project.id);
  }, [loadMembers, projects, selectedProject]);

  useEffect(() => {
    const openForProject = (event: Event) => {
      const projectId = (event as CustomEvent<OpenProjectMembersDetail>).detail?.projectId;
      const project = projects.find((candidate) => candidate.id === projectId);
      if (project) void handleOpenMemberModal(project);
    };
    window.addEventListener(OPEN_PROJECT_MEMBERS_EVENT, openForProject);
    return () => window.removeEventListener(OPEN_PROJECT_MEMBERS_EVENT, openForProject);
  }, [handleOpenMemberModal, projects]);

  // Keyboard shortcuts: Cmd+Shift+X (focus memo input), Cmd+Shift+O (open member modal)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!selectedProject) return;

      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'x') {
        e.preventDefault();
        e.stopPropagation();
        newTaskInputRef.current?.focus();
      }

      if (isMemberManagementShortcut(e)) {
        if (selectedProject.canManage && features.memberInvite) {
          e.preventDefault();
          e.stopPropagation();
          handleOpenMemberModal();
        }
      }

      // Cmd/Ctrl+Enter: 선택된 메모의 에디터를 전체화면으로
      if (isDetailFullscreenShortcut(e)) {
        if (selectedMemo && selectedMemoIds.length === 0) {
          e.preventDefault();
          e.stopPropagation();
          setDetailFullscreen((fullscreen) => !fullscreen);
        }
      }

      // ESC: 전체화면 종료 — 단, 입력중(라인 편집 등)이면 에디터의 ESC 가 우선
      if (e.key === 'Escape' && !isTypingContext(document.activeElement)) {
        setDetailFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [selectedProject, features.memberInvite, handleOpenMemberModal, selectedMemo, selectedMemoIds]);

  const handleSearchUsers = useCallback((query: string) => {
    setSearchUserQuery(query);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    searchTimeoutRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const users = await api.searchUsers(query);
        setSearchResults(users);
      } catch {
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);
  }, []);

  const handleInvite = useCallback(async (targetUser: UserInterface) => {
    if (!memberProject) return;
    setIsInviting(true);
    try {
      const children = projects.filter(
        (candidate) => candidate.parentProjectId === memberProject.id,
      );
      await inviteMember(
        memberProject.id,
        targetUser,
        inviteRole,
        buildMemberInviteScope(
          memberProject,
          children,
          inviteAllChildren,
          inviteChildIds,
        ),
      );
      setSearchUserQuery('');
      setSearchResults([]);
    } catch {
      // error handled in context
    } finally {
      setIsInviting(false);
    }
  }, [inviteAllChildren, inviteChildIds, inviteMember, inviteRole, memberProject, projects]);

  const handleRemoveMember = useCallback(async (userId: string) => {
    if (!memberProject) return;
    await removeMember(memberProject.id, userId);
  }, [memberProject, removeMember]);

  const moveTargets = useMemo(
    () => selectedProject ? siblingSubprojects(projects, selectedProject) : [],
    [projects, selectedProject],
  );
  const canMoveMemos = Boolean(
    selectedProject?.parentProjectId &&
    projects.find((project) => project.id === selectedProject.parentProjectId)?.canDelete,
  );
  const bulkMoveTargets = useMemo(
    () => selectedProject
      ? ownedLeafMoveTargets(projects, user?.id, selectedProject.id)
      : [],
    [projects, selectedProject, user?.id],
  );
  const bulkMoveTarget = useMemo(
    () => bulkMoveTargets.find((project) => project.id === bulkMoveTargetId) ?? null,
    [bulkMoveTargetId, bulkMoveTargets],
  );

  const openMoveMemo = (memo: MemoInterface) => {
    if (memo.kind === 'backlog' || moveTargets.length === 0) return;
    setMovingMemo(memo);
    setMoveTargetId(moveTargets[0].id);
    setMoveError('');
  };

  const handleMoveMemo = async () => {
    if (!movingMemo || !moveTargetId) return;
    setIsMoving(true);
    setMoveError('');
    try {
      await moveMemo(movingMemo.id, moveTargetId);
      setMovingMemo(null);
    } catch (error) {
      setMoveError(error instanceof Error ? error.message : '메모 이동에 실패했습니다.');
    } finally {
      setIsMoving(false);
    }
  };

  const openBulkMove = () => {
    const firstTarget = bulkMoveTargets[0];
    if (!selectedProject || !firstTarget || selectedMemoIds.length === 0) return;
    setBulkMoveTargetId(firstTarget.id);
    setSourceConfirmationName('');
    setTargetConfirmationName('');
    setBulkMoveError('');
    setShowBulkMoveModal(true);
  };

  const handleBulkMove = async () => {
    if (!selectedProject || selectedMemoIds.length === 0) return;
    const target = bulkMoveTarget;
    if (!target || !confirmationsMatchBulkMove(
      selectedProject.name,
      target.name,
      sourceConfirmationName,
      targetConfirmationName,
    )) return;
    setIsBulkMoving(true);
    setBulkMoveError('');
    try {
      await bulkMoveMemos({
        memoIds: selectedMemoIds,
        sourceProjectId: selectedProject.id,
        targetProjectId: target.id,
        sourceConfirmationName,
        targetConfirmationName,
      });
      setShowBulkMoveModal(false);
    } catch (error) {
      setBulkMoveError(
        error instanceof Error ? error.message : '선택한 메모 이동에 실패했습니다.',
      );
    } finally {
      setIsBulkMoving(false);
    }
  };

  // Sort memos — 기본 날짜(생성) 내림차순, 방향 토글 지원
  const sortedMemos = useMemo(() => {
    const sorted = [...memos];
    const dir = sortDirection === 'asc' ? 1 : -1;
    switch (sortOption) {
      case 'name':
        return sorted.sort((a, b) => a.title.localeCompare(b.title) * dir);
      case 'updated':
        return sorted.sort(
          (a, b) =>
            (new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()) * dir
        );
      case 'created':
      default:
        return sorted.sort(
          (a, b) =>
            (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * dir
        );
    }
  }, [memos, sortOption, sortDirection]);

  const handleSortClick = (value: SortOption) => {
    if (sortOption === value) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortOption(value);
      setSortDirection(value === 'name' ? 'asc' : 'desc');
    }
  };

  const suggestions = useMemo(() => {
    if (!newMemoTitle.trim()) return [];
    return memos.filter((memo) =>
      memo.title.toLowerCase().includes(newMemoTitle.toLowerCase().trim())
    );
  }, [memos, newMemoTitle]);

  useEffect(() => {
    setSelectedSuggestionIndex(0);
  }, [suggestions]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleCreateMemo = async () => {
    if (!newMemoTitle.trim()) return;

    try {
      await createMemo(newMemoTitle);
      setNewMemoTitle('');
      setShowSuggestions(false);
    } catch (error) {
      setNewMemoTitle('');
      setShowSuggestions(false);
      console.error('Failed to create memo:', error);
    }
  };

  const handleInputKeyUp = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      const normalizedTitle = newMemoTitle.trim().toLowerCase();
      const exactMatch = memos.find(
        (memo) => memo.title.trim().toLowerCase() === normalizedTitle
      );
      if (exactMatch) {
        selectMemo(exactMatch);
        setNewMemoTitle('');
        setShowSuggestions(false);
        return;
      }

      if (showSuggestions && suggestions.length > 0) {
        const selectedSuggestion = suggestions[selectedSuggestionIndex];
        if (selectedSuggestion) {
          selectMemo(selectedSuggestion);
          setNewMemoTitle('');
          setShowSuggestions(false);
          return;
        }
      }
      handleCreateMemo();
    }
  };

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions || suggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedSuggestionIndex((prev) =>
        prev < suggestions.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedSuggestionIndex((prev) => (prev > 0 ? prev - 1 : prev));
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  const handleTitleChange = (value: string) => {
    setNewMemoTitle(value);
    setShowSuggestions(value.trim().length > 0);
  };

  const handleSuggestionClick = (memo: MemoInterface) => {
    selectMemo(memo);
    setNewMemoTitle('');
    setShowSuggestions(false);
  };

  const handleMemoClick = (memo: MemoInterface, e: React.MouseEvent) => {
    if (isMobile && !e.metaKey && !e.ctrlKey) {
      selectMemo(memo);
      setMobileView('detail');
      return;
    }
    if (e.metaKey || e.ctrlKey) {
      e.preventDefault();
      // 멀티 선택 시작 시, 이미 단일 선택돼 있던 메모도 함께 포함한다
      if (
        selectedMemoIds.length === 0 &&
        selectedMemo &&
        selectedMemo.id !== memo.id
      ) {
        toggleSelectMemo(selectedMemo.id);
      }
      toggleSelectMemo(memo.id);
    } else {
      selectMemo(memo);
    }
  };

  const handleSearchResultSelect = useCallback(async (memoId: string) => {
    const projectId = selectedProject?.id;
    if (!projectId) throw new Error('프로젝트가 선택되지 않았습니다.');
    const fetchedMemo = await api.getMemo(memoId);
    if (fetchedMemo.projectId !== projectId) {
      throw new Error('검색 결과가 현재 프로젝트에 속하지 않습니다.');
    }
    const opened = await selectMemo(fetchedMemo);
    if (!opened) throw new Error('프로젝트가 전환되어 검색 결과를 열지 않았습니다.');
    if (isMobile) setMobileView('detail');
  }, [isMobile, selectMemo, selectedProject?.id]);

  const handleSearchShortcutFocus = useCallback(() => {
    setDetailFullscreen(false);
    setShowMemberModal(false);
    setShowSuggestions(false);
  }, []);

  const handleBulkDelete = async () => {
    if (selectedMemoIds.length === 0) return;

    setIsDeleting(true);
    try {
      await deleteMemos(selectedMemoIds);
    } catch (error) {
      console.error('Failed to delete memos:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  const memberModal = (
    <ProjectMemberModal
      open={showMemberModal}
      project={memberProject}
      projects={projects}
      members={members}
      searchQuery={searchUserQuery}
      searchResults={searchResults}
      searching={isSearching}
      inviting={isInviting}
      inviteRole={inviteRole}
      inviteAllChildren={inviteAllChildren}
      inviteChildIds={inviteChildIds}
      onClose={() => {
        setShowMemberModal(false);
        setMemberProject(null);
      }}
      onSearch={handleSearchUsers}
      onInvite={(target) => void handleInvite(target)}
      onRemove={(userId) => void handleRemoveMember(userId)}
      onRoleChange={setInviteRole}
      onAllChildrenChange={setInviteAllChildren}
      onChildIdsChange={setInviteChildIds}
    />
  );

  const isMultiSelectMode = selectedMemoIds.length > 0;

  if (!selectedProject) return <>{memberModal}</>;
  const selectionActions = isMultiSelectMode ? (
    <div className="h-full flex flex-col items-center justify-center gap-4">
      <p className="text-lg text-gray-300">{selectedMemoIds.length}개의 메모가 선택됨</p>
      <div className="flex flex-wrap justify-center gap-3">
        {selectedProject.ownerId === user?.id && bulkMoveTargets.length > 0 && (
          <button
            type="button"
            onClick={openBulkMove}
            disabled={isBulkMoving || isDeleting}
            className="todo-action-button todo-action-button--secondary"
          >
            이동
          </button>
        )}
        {selectedProject.canManage && (
          <button
            type="button"
            onClick={handleBulkDelete}
            disabled={isDeleting || isBulkMoving}
            className="todo-action-button"
          >
            {isDeleting ? '삭제 중...' : '삭제'}
          </button>
        )}
        <button
          type="button"
          onClick={clearSelectedMemos}
          disabled={isDeleting || isBulkMoving}
          className="todo-action-button todo-action-button--secondary"
        >
          취소
        </button>
      </div>
    </div>
  ) : undefined;
  return (
    <>
    <div className="content">
      <div
        ref={mainContainerRef}
        className={`main-container${detailFullscreen ? ' detail-fullscreen' : ''}${
          isMobile
            ? mobileView === 'detail' || isMultiSelectMode
              ? ' mobile-view-detail'
              : ' mobile-view-list'
            : ''
        }`}
        // 모바일은 단일 컬럼이라 폭 인라인 스타일을 주지 않는다 (인라인은 미디어 쿼리를 이긴다).
        style={isMobile ? undefined : {
          gridTemplateColumns: `min(${tasksPaneWidth}px, max(${MIN_PANE_WIDTH}px, calc(100% - 240px))) minmax(0, 1fr)`,
        }}
      >
        <div className="title-container">
          <div className="title-project-name">
            <span className={findIssue('projects', selectedProject.id) ? 'sync-issue-dim' : ''}>
              {selectedProject.name}
            </span>
          </div>
          <div className="title-editor-controls">
            <ProjectMemoSearch
              key={selectedProject.id}
              projectId={selectedProject.id}
              onSelectMemo={handleSearchResultSelect}
              onShortcutFocus={handleSearchShortcutFocus}
            />
            <div className="title-actions">
              {/* 편집기와 같은 열 안에서 검색창 오른쪽에 저장·동기화 상태를 둔다. */}
              <div id="memo-status-slot" className="memo-status-slot" />
              <SyncStatusIndicator />
            </div>
          </div>
        </div>
        <div className="main">
          {/* 상단 여백은 클래스로 둔다 — 인라인 스타일은 모바일 미디어 쿼리가 못 이긴다 */}
          <div className="tasks-heading flex flex-wrap items-start justify-between gap-2">
            <div>
              <span style={{ fontWeight: "bold", fontSize: "20px" }}>Tasks</span>{" "}
              <span className="task-count">({memos.length})</span>
            </div>
            <div className="tasks-heading-actions">
              <div id="screen-share-buttons" />
              {selectedProject.canManage && features.memberInvite && (
                <button
                  onClick={() => void handleOpenMemberModal()}
                  className="todo-action-button todo-action-button--icon"
                  aria-label="멤버 관리"
                  title="멤버 관리 (⌘⇧O)"
                >
                  <svg className="todo-action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="9" cy="8" r="3" />
                    <path d="M3 20v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6M21 20v-2a6 6 0 0 0-4-5.65" />
                  </svg>
                </button>
              )}
            </div>
          </div>
          <div className="new-task-container" style={{ position: 'relative' }}>
            <Input
              ref={newTaskInputRef}
              className="new-task"
              value={newMemoTitle}
              onChange={handleTitleChange}
              placeholder="Type a new task!"
              onKeyUp={handleInputKeyUp}
              onKeyDown={handleInputKeyDown}
            />
            <span className="guide-text">Enter!</span>

            {showSuggestions && suggestions.length > 0 && (
              <div
                ref={suggestionsRef}
                className="absolute top-full left-0 w-full bg-gray-900 border border-gray-700 rounded-b shadow-lg z-50 max-h-60 overflow-y-auto"
              >
                {suggestions.map((memo, index) => (
                  <button
                    key={memo.id}
                    onClick={() => handleSuggestionClick(memo)}
                    className={`w-full text-left px-4 py-2 hover:bg-gray-800 text-sm ${
                      index === selectedSuggestionIndex ? 'bg-gray-800' : ''
                    }`}
                  >
                    <div className="font-medium text-white">{memo.title}</div>
                    <div className="text-xs text-gray-400">{formatDate(memo.createdAt)}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
          {/* Sort Options — 우측정렬 텍스트, 활성 항목 재클릭 시 방향 토글 */}
          <div className="sort-options">
            {SORT_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => handleSortClick(option.value)}
                className={`sort-option ${
                  sortOption === option.value ? 'sort-option-active' : ''
                }`}
              >
                {option.label}
                {sortOption === option.value && (
                  <span className="sort-arrow">
                    {sortDirection === 'asc' ? '▲' : '▼'}
                  </span>
                )}
              </button>
            ))}
          </div>
          <div className="task-container">
            {sortedMemos.length === 0 ? (
              <div className="p-4 text-center text-gray-500 text-sm">
                메모가 없습니다.
                <br />
                위에서 새 메모를 만들어보세요.
              </div>
            ) : (
              sortedMemos.map((memo: MemoInterface) => (
                <div
                  key={memo.id}
                  onClick={(e) => handleMemoClick(memo, e)}
                  className={
                    `task ${selectedMemo?.id === memo.id ? 'task-selected' : ''} ${
                      selectedMemoIds.includes(memo.id) ? 'task-multi-selected' : ''
                    } flex flex-row justify-between w-full`
                  }
                >
                  <h3
                    className={`min-w-0 flex-1 truncate ${
                      findIssue('memos', memo.id) ? 'sync-issue-dim' : ''
                    }`}
                  >
                    {selectedMemoIds.includes(memo.id) && (
                      <span className="inline-block w-4 h-4 mr-2 bg-red-500 rounded-sm text-white text-xs text-center leading-4">
                        ✓
                      </span>
                    )}
                    {memo.title}
                  </h3>
                  {!isMultiSelectMode && canMoveMemos && moveTargets.length > 0 && memo.kind !== 'backlog' && (
                    <button
                      type="button"
                      className="todo-action-button todo-action-button--secondary"
                      onClick={(event) => {
                        event.stopPropagation();
                        openMoveMemo(memo);
                      }}
                      aria-label={`${memo.title} 이동`}
                    >
                      이동
                    </button>
                  )}
                  <div className="shrink-0 whitespace-nowrap text-right flex flex-col gap-1 text-xs text-gray-500 mr-2 ml-3">
                    <span className="task-date-created">생성: {formatDate(memo.createdAt)}</span>
                    <span>편집: {formatDate(memo.updatedAt)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
          <div
            className={`pane-resizer${isResizing ? ' dragging' : ''}`}
            onPointerDown={startPaneResize}
            onDoubleClick={resetPaneWidth}
            title="드래그로 폭 조절 · 더블클릭 초기화"
          />
        </div>

        <MemoSection
          keyboardActive={!isMultiSelectMode}
          selectionActions={selectionActions}
        />
      </div>
    </div>

      {memberModal}

      <Modal
        isOpen={Boolean(movingMemo)}
        onClose={() => !isMoving && setMovingMemo(null)}
        title="메모 이동"
        size="sm"
      >
        {movingMemo && (
          <div className="space-y-4">
            <p className="text-sm text-gray-700">
              <strong>{movingMemo.title}</strong>을 같은 프로젝트의 다른 서브프로젝트로 이동합니다.
              메모 ID와 버전 기록은 유지됩니다.
            </p>
            <label className="block text-sm font-medium text-gray-700">이동 대상</label>
            <select
              className="w-full border border-gray-300 rounded px-3 py-2"
              value={moveTargetId}
              onChange={(event) => setMoveTargetId(event.target.value)}
            >
              {moveTargets.map((project) => (
                <option key={project.id} value={project.id}>{project.name}</option>
              ))}
            </select>
            {moveError && <p className="text-sm text-red-600">{moveError}</p>}
            <div className="flex justify-end gap-2">
              <Button onClick={handleMoveMemo} disabled={isMoving || !moveTargetId}>
                {isMoving ? '이동 중...' : '이동'}
              </Button>
              <Button variant="secondary" onClick={() => setMovingMemo(null)} disabled={isMoving}>
                취소
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={showBulkMoveModal}
        onClose={() => !isBulkMoving && setShowBulkMoveModal(false)}
        title="선택한 메모 이동"
        size="md"
      >
        {selectedProject && (
          <div className="space-y-4">
            <p className="text-sm text-gray-700">
              선택한 {selectedMemoIds.length}개 메모를 다른 소유 프로젝트로 원자적으로 이동합니다.
              메모 ID·본문·버전·편집 시각은 유지됩니다.
            </p>
            <label className="block text-sm font-medium text-gray-700">이동 대상</label>
            <select
              className="w-full border border-gray-300 rounded px-3 py-2"
              value={bulkMoveTargetId}
              onChange={(event) => {
                setBulkMoveTargetId(event.target.value);
                setTargetConfirmationName('');
                setBulkMoveError('');
              }}
            >
              {bulkMoveTargets.map((project) => (
                <option key={project.id} value={project.id}>{project.name}</option>
              ))}
            </select>
            <label className="block text-sm text-gray-700">
              출발 프로젝트 이름 <strong>{selectedProject.name}</strong> 입력
            </label>
            <Input
              value={sourceConfirmationName}
              onChange={setSourceConfirmationName}
              placeholder={selectedProject.name}
            />
            {bulkMoveTarget && (
              <>
                <label className="block text-sm text-gray-700">
                  대상 프로젝트 이름 <strong>{bulkMoveTarget.name}</strong> 입력
                </label>
                <Input
                  value={targetConfirmationName}
                  onChange={setTargetConfirmationName}
                  placeholder={bulkMoveTarget.name}
                />
              </>
            )}
            {bulkMoveError && <p className="text-sm text-red-600">{bulkMoveError}</p>}
            <div className="flex justify-end gap-2">
              <Button
                onClick={handleBulkMove}
                disabled={
                  isBulkMoving ||
                  !bulkMoveTarget ||
                  !confirmationsMatchBulkMove(
                    selectedProject.name,
                    bulkMoveTarget.name,
                    sourceConfirmationName,
                    targetConfirmationName,
                  )
                }
              >
                {isBulkMoving ? '이동 중...' : '이동'}
              </Button>
              <Button
                variant="secondary"
                onClick={() => setShowBulkMoveModal(false)}
                disabled={isBulkMoving}
              >
                취소
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
