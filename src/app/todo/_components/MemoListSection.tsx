import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from '@/contexts/AuthContext';
import { useSync } from '@/contexts/SyncContext';
import { SORT_OPTIONS } from "@/lib/constants";
import { MemoInterface, ProjectRole, SortOption, UserInterface } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { useMemo, useState, useRef, useEffect, useCallback } from "react";
import * as api from "@/lib/api";
import { isTypingContext, MemoSection } from "./MemoSection";
import { SyncStatusIndicator } from './SyncStatusIndicator';

const DEFAULT_PANE_WIDTH = 400;
// Tasks (n) 헤더 + 멤버초대 버튼 라인이 줄바꿈되지 않는 최소폭
const MIN_PANE_WIDTH = 264;
const MAX_PANE_WIDTH = 760;
const PANE_WIDTH_STORAGE_KEY = "todo:tasksPaneWidth";

export default function MemoListSection() {
  const {
    state: { selectedProject, memos, selectedMemo, sortOption, selectedMemoIds, members },
    selectMemo,
    createMemo,
    setSortOption,
    toggleSelectMemo,
    clearSelectedMemos,
    deleteMemos,
    loadMembers,
    inviteMember,
    removeMember,
  } = useApp();
  const { user, features } = useAuth();
  const { findIssue } = useSync();
  const isAdmin = user?.isAdmin ?? false;

  const [newMemoTitle, setNewMemoTitle] = useState('');
  // 정렬 방향 — 기본 오름차순. 활성 항목 재클릭 시 토글, 다른 항목 클릭 시 오름차순으로 리셋.
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  // tasks 영역 폭 (경계 드래그로 조절, localStorage 유지)
  const [tasksPaneWidth, setTasksPaneWidth] = useState(DEFAULT_PANE_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  // Cmd/Ctrl+Enter 에디터 전체화면 — ESC 로 종료
  const [detailFullscreen, setDetailFullscreen] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const newTaskInputRef = useRef<HTMLInputElement>(null);
  const [showMemberModal, setShowMemberModal] = useState(false);
  const [searchUserQuery, setSearchUserQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserInterface[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isInviting, setIsInviting] = useState(false);
  const [inviteRole, setInviteRole] = useState<ProjectRole>('editor');
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);


  // 저장된 tasks 영역 폭 복원/유지
  useEffect(() => {
    const saved = Number(window.localStorage.getItem(PANE_WIDTH_STORAGE_KEY));
    if (saved >= MIN_PANE_WIDTH && saved <= MAX_PANE_WIDTH) {
      setTasksPaneWidth(saved);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(PANE_WIDTH_STORAGE_KEY, String(tasksPaneWidth));
  }, [tasksPaneWidth]);

  const startPaneResize = (e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = tasksPaneWidth;
    setIsResizing(true);
    document.body.style.userSelect = 'none';
    const onMove = (ev: PointerEvent) => {
      setTasksPaneWidth(
        Math.min(MAX_PANE_WIDTH, Math.max(MIN_PANE_WIDTH, startWidth + ev.clientX - startX)),
      );
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      document.body.style.userSelect = '';
      setIsResizing(false);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  // 메모 선택이 풀리면 전체화면도 해제
  useEffect(() => {
    if (!selectedMemo) {
      setDetailFullscreen(false);
    }
  }, [selectedMemo]);

  const handleOpenMemberModal = useCallback(async () => {
    if (!selectedProject) return;
    setShowMemberModal(true);
    setSearchUserQuery('');
    setSearchResults([]);
    setInviteRole('editor');
    await loadMembers(selectedProject.id);
  }, [selectedProject, loadMembers]);

  // Keyboard shortcuts: Cmd+Shift+X (focus memo input), Cmd+P (open member modal)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!selectedProject) return;

      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'x') {
        e.preventDefault();
        e.stopPropagation();
        newTaskInputRef.current?.focus();
      }

      if ((e.metaKey || e.ctrlKey) && e.key === 'p') {
        if (isAdmin && features.memberInvite) {
          e.preventDefault();
          e.stopPropagation();
          handleOpenMemberModal();
        }
      }

      // Cmd/Ctrl+Enter: 선택된 메모의 에디터를 전체화면으로
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        if (selectedMemo && selectedMemoIds.length === 0) {
          e.preventDefault();
          e.stopPropagation();
          setDetailFullscreen(true);
        }
      }

      // ESC: 전체화면 종료 — 단, 입력중(라인 편집 등)이면 에디터의 ESC 가 우선
      if (e.key === 'Escape' && !isTypingContext(document.activeElement)) {
        setDetailFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [selectedProject, isAdmin, features.memberInvite, handleOpenMemberModal, selectedMemo, selectedMemoIds]);

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
    if (!selectedProject) return;
    setIsInviting(true);
    try {
      await inviteMember(selectedProject.id, targetUser, inviteRole);
      setSearchUserQuery('');
      setSearchResults([]);
    } catch {
      // error handled in context
    } finally {
      setIsInviting(false);
    }
  }, [selectedProject, inviteMember, inviteRole]);

  const handleRemoveMember = useCallback(async (userId: string) => {
    if (!selectedProject) return;
    await removeMember(selectedProject.id, userId);
  }, [selectedProject, removeMember]);

  // Sort memos — 기본 날짜(생성) 오름차순, 방향 토글 지원
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
      setSortDirection('asc');
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

  const isMultiSelectMode = selectedMemoIds.length > 0;

  if (!selectedProject) return <div></div>;
  return (
    <>
    <div className="content">
      <div
        className={`main-container${detailFullscreen ? ' detail-fullscreen' : ''}`}
        style={{ gridTemplateColumns: `${tasksPaneWidth}px 1fr` }}
      >
        <div className="title-container">
          <span className={findIssue('projects', selectedProject.id) ? 'sync-issue-dim' : ''}>
            {selectedProject.name}
          </span>
          <div id="screen-share-buttons" />
          <SyncStatusIndicator />
        </div>
        <div className="main">
          <div style={{ paddingTop: "40px" }} className="flex items-start justify-between">
            <div>
              <span style={{ fontWeight: "bold", fontSize: "20px" }}>Tasks</span>{" "}
              <span className="task-count">({memos.length})</span>
            </div>
            {isAdmin && features.memberInvite && (
              <button
                onClick={handleOpenMemberModal}
                className="px-2 py-1 text-sm bg-gray-700 text-gray-300 rounded hover:bg-gray-600 transition-colors"
                title="멤버 관리"
              >
                👥
              </button>
            )}
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
                  <div className="shrink-0 whitespace-nowrap text-right flex flex-col gap-1 text-xs text-gray-500 mr-2 ml-3">
                    <span>생성: {formatDate(memo.createdAt)}</span>
                    <span>편집: {formatDate(memo.updatedAt)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
          <div
            className={`pane-resizer${isResizing ? ' dragging' : ''}`}
            onPointerDown={startPaneResize}
            onDoubleClick={() => setTasksPaneWidth(DEFAULT_PANE_WIDTH)}
            title="드래그로 폭 조절 · 더블클릭 초기화"
          />
        </div>

        {isMultiSelectMode ? (
          <main className="detail min-h-0">
            <div className="h-full flex flex-col items-center justify-center gap-4">
              <p className="text-lg text-gray-300">{selectedMemoIds.length}개의 메모가 선택됨</p>
              <div className="flex gap-3">
                {isAdmin && (
                  <button
                    onClick={handleBulkDelete}
                    disabled={isDeleting}
                    className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isDeleting ? '삭제 중...' : '삭제'}
                  </button>
                )}
                <button
                  onClick={clearSelectedMemos}
                  disabled={isDeleting}
                  className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  취소
                </button>
              </div>
            </div>
          </main>
        ) : (
          <MemoSection />
        )}
      </div>
    </div>

      {/* Member Management Modal */}
      <Modal
        isOpen={showMemberModal}
        onClose={() => setShowMemberModal(false)}
        title="멤버 관리"
        size="md"
      >
        <div className="flex flex-col gap-4">
          {/* User Search */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">사용자 검색</label>
            <div className="mb-2 flex rounded border border-gray-200 overflow-hidden w-fit">
              {(['editor', 'viewer'] as ProjectRole[]).map((role) => (
                <button
                  key={role}
                  type="button"
                  onClick={() => setInviteRole(role)}
                  className={`px-3 py-1 text-xs ${
                    inviteRole === role
                      ? 'bg-gray-900 text-white'
                      : 'bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {role}
                </button>
              ))}
            </div>
            <Input
              value={searchUserQuery}
              onChange={handleSearchUsers}
              placeholder="이름 또는 아이디로 검색..."
            />
            {isSearching && (
              <p className="text-sm text-gray-500 mt-1">검색 중...</p>
            )}
            {searchResults.length > 0 && (
              <div className="mt-2 border border-gray-200 rounded max-h-40 overflow-y-auto">
                {searchResults.map((u) => {
                  const alreadyMember = members.some((m) => m.userId === u.id);
                  const isInviteBlocked = u.canInviteToTodo === false;
                  return (
                    <div
                      key={u.id}
                      className="flex items-center justify-between px-3 py-2 hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
                    >
                      <div>
                        <span className="text-sm font-medium text-gray-900">{u.displayName}</span>
                        <span className="text-xs text-gray-500 ml-2">@{u.username}</span>
                      </div>
                      {alreadyMember ? (
                        <span className="text-xs text-gray-400">이미 멤버</span>
                      ) : isInviteBlocked ? (
                        <span className="text-xs text-gray-400">사용 신청 필요</span>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => handleInvite(u)}
                          disabled={isInviting || isInviteBlocked}
                        >
                          초대
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Current Members */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              현재 멤버 ({members.length})
            </label>
            {members.length === 0 ? (
              <p className="text-sm text-gray-500">멤버가 없습니다.</p>
            ) : (
              <div className="border border-gray-200 rounded max-h-48 overflow-y-auto">
                {members.map((m) => (
                  <div
                    key={m.userId}
                    className="flex items-center justify-between px-3 py-2 hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
                  >
                    <div>
                      <span className="text-sm font-medium text-gray-900">{m.displayName}</span>
                      <span className="text-xs text-gray-500 ml-2">@{m.username}</span>
                      <span className="text-xs text-gray-400 ml-2">({m.role})</span>
                    </div>
                    {isAdmin && m.role !== 'owner' && (
                      <button
                        onClick={() => handleRemoveMember(m.userId)}
                        className="text-xs text-red-500 hover:text-red-700 transition-colors"
                      >
                        제거
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}
