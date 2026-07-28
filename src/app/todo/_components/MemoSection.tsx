'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { Modal } from '@/components/ui/Modal';
import {
  InlineEditor,
  type InlineEditorHandle,
  type MentionState,
} from '@/components/editor/inline/InlineEditor';
import type { ArticleInterface } from '@/lib/types';
import { publishArticle, getMemoArticle, deleteArticle } from '@/lib/api';
import { useMemoSocket } from '@/hooks/useMemoSocket';

export const isTypingContext = (el: Element | null) => {
  if (!el) return false;
  const tag = (el as HTMLElement).tagName?.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  const htmlEl = el as HTMLElement;
  if (htmlEl.isContentEditable) return true;
  // Monaco 는 EditContext API 를 쓰면 포커스 대상이 textarea 도 contenteditable 도 아닌
  // `div.native-edit-context` 다. 이걸 놓치면 전역 타이핑 핸들러가 코드편집기 입력을 가로채
  // 마지막 라인(닫는 펜스)으로 글자를 보낸다.
  return !!el.closest?.('.monaco-editor');
};

const editorFeatureHelp = [
  {
    syntax: '-- 할 일',
    description: '체크되지 않은 체크박스를 만듭니다. 입력을 멈추고 2초가 지나면 그 줄만 체크박스로 바뀝니다.',
  },
  { syntax: '--v 완료한 일', description: '체크된 체크박스를 만듭니다.' },
  {
    syntax: '``` / java```',
    description:
      '코드 블록을 만듭니다. 기본 언어는 typescript 이고 ``` 앞에 언어를 쓰면 그 언어로 하이라이팅됩니다(에디터 위 선택기로도 바꿀 수 있습니다). ``` 표시는 화면에서 감춰집니다.',
  },
  { syntax: '@메모명', description: '편집 중 다른 메모를 검색해서 링크로 삽입합니다.' },
  { syntax: '1. 항목', description: '번호 목록을 만듭니다.' },
  { syntax: '- 항목', description: '글머리 목록을 만듭니다.' },
  { syntax: '[텍스트](URL)', description: '링크를 만듭니다.' },
];

const shortcutHelp = [
  { keys: 'Ctrl/⌘ + S', description: '현재 메모를 저장합니다.' },
  { keys: 'Ctrl/⌘ + E', description: 'Raw 모드를 켜고 끕니다. 본문 전체를 하나의 텍스트로 선택·복사할 때 씁니다.' },
  { keys: '더블클릭', description: '그 줄을 소스 상태로 열어 수정합니다.' },
  { keys: 'Backspace', description: '방금 자동으로 렌더된 줄에서 한 번 누르면 지우지 않고 소스로 돌아갑니다.' },
  { keys: '본문에서 바로 입력', description: '마지막 줄이 편집 상태가 되고 입력이 이어집니다.' },
  { keys: 'Enter / ↑ / ↓', description: '줄을 나누거나 위아래 줄로 편집을 옮깁니다.' },
  { keys: 'Ctrl/⌘ + Z', description: '되돌리기. Shift 를 더하면 다시 실행합니다.' },
  { keys: 'Ctrl/⌘ + Shift + X', description: '프로젝트가 선택되어 있으면 새 메모 입력칸에 포커스합니다. 프로젝트가 없으면 새 프로젝트 모달을 엽니다.' },
  { keys: 'Ctrl/⌘ + P', description: '관리자에게 멤버 관리 모달을 엽니다.' },
  { keys: 'Ctrl/⌘ + 메모 클릭', description: '메모 목록에서 여러 메모를 선택합니다.' },
  { keys: 'Esc', description: '편집 중인 줄을 확정하거나, 검색 추천 목록·모달을 닫습니다.' },
];

export function MemoSection() {
  const {
    state: { selectedMemo, selectedProject, memos },
    updateMemo,
  } = useApp();
  const { user } = useAuth();
  const isAdmin = user?.isAdmin ?? false;

  // Raw 모드 = 문서 전체를 하나의 textarea 로 다루는 escape hatch (멀티라인 선택/복사용).
  const [rawMode, setRawMode] = useState(false);
  const rawModeRef = useRef(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [lockMessage, setLockMessage] = useState<string | null>(null);
  const isLockedByOtherRef = useRef(false);

  const {
    lockHolder,
    requestLock,
    releaseLock,
    broadcastUpdate,
  } = useMemoSocket({
    memoId: selectedMemo?.id ?? null,
    onContentUpdated: (newContent: string) => {
      setContent(newContent);
      contentRef.current = newContent;
      setOriginalContent(newContent);
      originalContentRef.current = newContent;
    },
    onLocked: (info) => {
      // Another user locked the memo
      isLockedByOtherRef.current = true;
      setLockMessage(`${info.displayName}님이 수정중입니다`);
    },
    onUnlocked: () => {
      isLockedByOtherRef.current = false;
      setLockMessage(null);
    },
    onLockDenied: (displayName: string) => {
      setLockMessage(`${displayName}님이 수정중입니다`);
      setRawMode(false);
      rawModeRef.current = false;
    },
  });

  const focusTextareaToEnd = () => {
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      const len = el.value.length;
      el.setSelectionRange(len, len);
      el.scrollTop = el.scrollHeight;
    });
  };

  /**
   * 6초 락 해제 타이머는 "활성 편집이 없을 때"만 돈다.
   * 인라인 에디터에서 라인이 편집/포커스 상태로 살아 있는 동안에는 holdLock 이 타이머를 끈다.
   */
  const holdLock = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    requestLock();
  }, [requestLock]);

  const scheduleLockRelease = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = null;
      releaseLock();
      setRawMode(false);
      rawModeRef.current = false;
    }, 6_000);
  }, [releaseLock]);

  useEffect(() => {
    if (rawMode && textareaRef.current) {
      requestAnimationFrame(() => {
        focusTextareaToEnd();
      });
    }
  }, [rawMode]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const [content, setContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [showMemoSearch, setShowMemoSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchPosition, setSearchPosition] = useState<{ top: number; left: number } | null>(null);
  const [selectedSearchIndex, setSelectedSearchIndex] = useState(0);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const inlineEditorRef = useRef<InlineEditorHandle>(null);
  const contentRef = useRef<string>('');
  const originalContentRef = useRef<string>('');

  const isLockedByOther = Boolean(lockHolder);

  // Article (게시) 관련 상태
  const [articleStatus, setArticleStatus] = useState<ArticleInterface | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishMessage, setPublishMessage] = useState<string | null>(null);

  const filteredMemos = memos
    .filter((memo) => memo.id !== selectedMemo?.id)
    .filter((memo) =>
      searchQuery ? memo.title.toLowerCase().includes(searchQuery.toLowerCase()) : true
    );

  useEffect(() => {
    setSelectedSearchIndex(0);
  }, [searchQuery]);

  useEffect(() => {
    if (selectedMemo) {
      setContent(selectedMemo.content);
      setOriginalContent(selectedMemo.content);
      contentRef.current = selectedMemo.content;
      originalContentRef.current = selectedMemo.content;
      setRawMode(false);
      rawModeRef.current = false;
      setLockMessage(null);
      isLockedByOtherRef.current = false;
    }
  }, [selectedMemo]);

  // 현재 메모의 게시 상태 확인
  useEffect(() => {
    if (!selectedMemo) {
      setArticleStatus(null);
      return;
    }
    getMemoArticle(selectedMemo.id)
      .then((article) => setArticleStatus(article))
      .catch(() => setArticleStatus(null));
  }, [selectedMemo]);

  useEffect(() => {
    contentRef.current = content;
  }, [content]);

  useEffect(() => {
    originalContentRef.current = originalContent;
  }, [originalContent]);

  const handleSaveMemo = useCallback(async () => {
    if (!selectedMemo) return;

    const latest = contentRef.current;
    const original = originalContentRef.current;

    if (latest === original) {
      console.log('변경사항이 없어 저장하지 않습니다.');
      return;
    }

    try {
      await updateMemo(latest);
      setOriginalContent(latest);
      originalContentRef.current = latest;
      broadcastUpdate(latest);
      console.log('메모가 저장되었습니다.');
    } catch (error) {
      console.error('Failed to save memo:', error);
    }
  }, [selectedMemo, updateMemo, broadcastUpdate]);

  // 게시 / 재게시 핸들러
  const handlePublish = useCallback(async () => {
    if (!selectedMemo) return;

    // 저장되지 않은 변경사항이 있으면 먼저 저장
    if (contentRef.current !== originalContentRef.current) {
      await handleSaveMemo();
    }

    setIsPublishing(true);
    setPublishMessage(null);
    try {
      const article = await publishArticle(selectedMemo.id);
      setArticleStatus(article);
      setPublishMessage(articleStatus ? `v${article.publishedVersion}으로 업데이트됨` : '게시 완료');
      setTimeout(() => setPublishMessage(null), 3000);
    } catch (error) {
      console.error('Failed to publish:', error);
      setPublishMessage('게시 실패');
      setTimeout(() => setPublishMessage(null), 3000);
    } finally {
      setIsPublishing(false);
    }
  }, [selectedMemo, handleSaveMemo, articleStatus]);

  // 게시 취소 핸들러
  const handleUnpublish = useCallback(async () => {
    if (!articleStatus) return;

    setIsPublishing(true);
    setPublishMessage(null);
    try {
      await deleteArticle(articleStatus.id);
      setArticleStatus(null);
      setPublishMessage('게시 취소됨');
      setTimeout(() => setPublishMessage(null), 3000);
    } catch (error) {
      console.error('Failed to unpublish:', error);
      setPublishMessage('게시 취소 실패');
      setTimeout(() => setPublishMessage(null), 3000);
    } finally {
      setIsPublishing(false);
    }
  }, [articleStatus]);

  const handleInsertMemoLink = useCallback(
    (memo: { id: string; title: string }) => {
      if (!selectedProject) return;

      const memoUrl = `?projectId=${selectedProject.id}&memoId=${memo.id}`;
      const linkText = `[@${memo.title}](${memoUrl})`;

      setShowMemoSearch(false);
      setSearchQuery('');

      if (!rawModeRef.current) {
        inlineEditorRef.current?.insertMemoLink(linkText);
        return;
      }

      const textarea = textareaRef.current;
      if (!textarea) return;

      const currentCursorPos = textarea.selectionStart;
      const currentContent = contentRef.current;
      const textBeforeCursor = currentContent.substring(0, currentCursorPos);
      const textAfterCursor = currentContent.substring(currentCursorPos);
      const lastAtIndex = textBeforeCursor.lastIndexOf('@');

      let newContent: string;
      let newCursorPos: number;

      if (lastAtIndex !== -1) {
        newContent = textBeforeCursor.substring(0, lastAtIndex) + linkText + textAfterCursor;
        newCursorPos = lastAtIndex + linkText.length;
      } else {
        newContent = textBeforeCursor + linkText + textAfterCursor;
        newCursorPos = currentCursorPos + linkText.length;
      }

      setContent(newContent);
      contentRef.current = newContent;

      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
        }
      }, 0);
    },
    [selectedProject]
  );

  useEffect(() => {
    const handleInsertMemoLinkEvent = (e: Event) => {
      const customEvent = e as CustomEvent<{ id: string; title: string }>;
      if (customEvent.detail) {
        const { id, title } = customEvent.detail;
        handleInsertMemoLink({ id, title });
      }
    };

    window.addEventListener('insertMemoLink', handleInsertMemoLinkEvent);
    return () => window.removeEventListener('insertMemoLink', handleInsertMemoLinkEvent);
  }, [handleInsertMemoLink]);

  const toggleRawMode = useCallback(() => {
    const next = !rawModeRef.current;

    if (next && (isLockedByOtherRef.current || lockHolder)) return;

    rawModeRef.current = next;
    setRawMode(next);
    setShowMemoSearch(false);
    setSearchQuery('');

    if (next) {
      holdLock();
    } else {
      scheduleLockRelease();
    }
  }, [holdLock, lockHolder, scheduleLockRelease]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSaveMemo();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && (e.key === 'e' || e.key === 'E')) {
        e.preventDefault();
        toggleRawMode();
        return;
      }

      if (rawMode) return;

      // 단축키는 패스 (Ctrl/⌘/Alt 포함)
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      // IME 조합 입력은 상태 머신 입력으로 취급하지 않는다
      if (e.isComposing || e.keyCode === 229) return;

      // 현재 어딘가 입력중이면 패스 (활성 라인 textarea 포함)
      if (isTypingContext(document.activeElement)) return;

      // "문자 입력"만 트리거 (방향키/Tab/F1 등 제외)
      const isPrintable = e.key.length === 1;
      const isEnter = e.key === 'Enter';
      const isBackspace = e.key === 'Backspace';
      if (!isPrintable && !isEnter && !isBackspace) return;

      // 다른 사용자가 편집 중이면 열지 않음
      if (isLockedByOtherRef.current || lockHolder) return;

      // preventDefault 하지 않는다 — 마지막 라인에 포커스만 먼저 옮기고
      // 입력 자체는 브라우저에 맡긴다 (수동 append 로 인한 IME 이중 입력 제거).
      holdLock();
      inlineEditorRef.current?.focusLastLine();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleSaveMemo, holdLock, lockHolder, rawMode, toggleRawMode]);

  const handleRawContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    const cursorPos = e.target.selectionStart;

    setContent(newContent);
    contentRef.current = newContent;

    const textBeforeCursor = newContent.substring(0, cursorPos);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');

    if (lastAtIndex !== -1) {
      const textAfterAt = textBeforeCursor.substring(lastAtIndex + 1);

      if (!textAfterAt.includes(' ') && !textAfterAt.includes('\n')) {
        setSearchQuery(textAfterAt);
        setShowMemoSearch(true);

        if (textareaRef.current) {
          const textarea = textareaRef.current;
          const rect = textarea.getBoundingClientRect();
          const lineHeight = 24;
          const lines = textBeforeCursor.split('\n');
          const currentLine = lines.length;

          setSearchPosition({
            top: rect.top + currentLine * lineHeight,
            left: rect.left + 100,
          });
        }
      } else {
        setShowMemoSearch(false);
        setSearchQuery('');
      }
    } else {
      setShowMemoSearch(false);
      setSearchQuery('');
    }
  };

  /** @ 검색 드롭다운 키 처리. 처리했으면 true 를 돌려 에디터의 기본 동작을 막는다. */
  const handleMentionKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>): boolean => {
      if (!showMemoSearch || filteredMemos.length === 0) return false;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedSearchIndex((prev) => (prev < filteredMemos.length - 1 ? prev + 1 : prev));
        return true;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedSearchIndex((prev) => (prev > 0 ? prev - 1 : prev));
        return true;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        const selectedMemoData = filteredMemos[selectedSearchIndex];
        if (selectedMemoData) {
          handleInsertMemoLink({ id: selectedMemoData.id, title: selectedMemoData.title });
        }
        return true;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        setShowMemoSearch(false);
        setSearchQuery('');
        return true;
      }

      return false;
    },
    [filteredMemos, handleInsertMemoLink, selectedSearchIndex, showMemoSearch]
  );

  const handleRawKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      scheduleLockRelease();
      handleMentionKeyDown(e);
    },
    [handleMentionKeyDown, scheduleLockRelease]
  );

  const handleMentionChange = useCallback((state: MentionState | null) => {
    if (!state) {
      setShowMemoSearch(false);
      setSearchQuery('');
      return;
    }

    setSearchQuery(state.query);
    setSearchPosition({ top: state.top, left: state.left });
    setShowMemoSearch(true);
  }, []);

  const handleEditingChange = useCallback(
    (editing: boolean) => {
      if (editing) {
        holdLock();
      } else {
        scheduleLockRelease();
      }
    },
    [holdLock, scheduleLockRelease]
  );

  /** 체크박스 토글은 기존과 동일하게 즉시 서버에 반영한다. */
  const handlePersist = useCallback(
    async (next: string) => {
      try {
        await updateMemo(next);
        setOriginalContent(next);
        originalContentRef.current = next;
      } catch (error) {
        console.error('Failed to update checkbox:', error);
      }
    },
    [updateMemo]
  );

  const handleInlineChange = useCallback((next: string) => {
    setContent(next);
    contentRef.current = next;
  }, []);

  if (!selectedProject || !selectedMemo) {
    return <div></div>;
  }

  return (
    <main className="detail min-h-0">
      <div className="h-full flex flex-col min-h-0">
        {content !== originalContent && (
          <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2 absolute right-2 top-0">
            <span className="text-xs text-orange-600 font-normal">• 저장 안됨</span>
          </h1>
        )}
        {lockMessage && (
          <div className="absolute right-2 top-6 z-10">
            <span className="text-xs text-yellow-400 font-medium bg-gray-800/80 px-2 py-1 rounded">{lockMessage}</span>
          </div>
        )}
        <div className="fixed bottom-[calc(100vh-70px)] right-2 flex flex-col items-end gap-1">
          <div className="text-sm text-gray-500">
            {typeof navigator !== 'undefined' && navigator.platform.includes('Mac') ? '⌘S' : 'Ctrl+S'}로 저장
          </div>
          {rawMode && (
            <span className="text-xs text-gray-400 border border-white/20 rounded px-2 py-0.5">
              RAW 모드 · {typeof navigator !== 'undefined' && navigator.platform.includes('Mac') ? '⌘E' : 'Ctrl+E'}로 종료
            </span>
          )}
          {isAdmin && (
            <>
              <button
                onClick={handlePublish}
                disabled={isPublishing}
                className="text-xs px-3 py-1 rounded-full bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isPublishing ? '게시 중...' : articleStatus ? `재게시 (v${articleStatus.publishedVersion})` : '게시'}
              </button>
              {articleStatus && (
                <button
                  onClick={handleUnpublish}
                  disabled={isPublishing}
                  className="text-xs px-3 py-1 rounded-full bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isPublishing ? '처리 중...' : '게시 취소'}
                </button>
              )}
            </>
          )}
          {publishMessage && (
            <span className="text-xs text-green-500">{publishMessage}</span>
          )}
        </div>

        <button
          type="button"
          onClick={() => setShowHelpModal(true)}
          className="fixed bottom-4 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full border border-white/20 bg-white text-lg font-bold text-gray-900 shadow-lg transition-colors hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-white/70"
          aria-label="에디터 도움말 열기"
          title="에디터 도움말"
        >
          ?
        </button>

        <div className="flex flex-col h-full min-h-0">
          {rawMode ? (
            <div className="w-full min-h-0 h-full overflow-y-auto relative">
              <textarea
                ref={textareaRef}
                value={content}
                onChange={handleRawContentChange}
                onKeyDown={handleRawKeyDown}
                className="w-full h-full p-0 resize-none focus:outline-none font-mono text-sm"
                placeholder=""
              />
            </div>
          ) : (
            <div className="w-full min-h-0 h-full overflow-y-auto p-0 prose prose-sm max-w-none text-white">
              <InlineEditor
                ref={inlineEditorRef}
                value={content}
                onChange={handleInlineChange}
                onPersist={handlePersist}
                onSave={handleSaveMemo}
                onEditingChange={handleEditingChange}
                onMentionChange={handleMentionChange}
                mentionActive={showMemoSearch}
                onMentionKeyDown={handleMentionKeyDown}
                readOnly={isLockedByOther}
              />
            </div>
          )}

          {showMemoSearch && searchPosition && (
            <div
              className="fixed bg-white border border-gray-300 rounded shadow-lg z-50 max-h-60 overflow-y-auto"
              style={{
                top: `${searchPosition.top}px`,
                left: `${searchPosition.left}px`,
                minWidth: '250px',
              }}
            >
              {filteredMemos.length > 0 ? (
                filteredMemos.map((memo, index) => (
                  <button
                    key={memo.id}
                    onClick={() => handleInsertMemoLink({ id: memo.id, title: memo.title })}
                    className={`w-full text-left px-4 py-2 hover:bg-gray-100 ${
                      index === selectedSearchIndex ? 'bg-gray-100' : ''
                    }`}
                  >
                    <div className="font-medium text-sm text-gray-900">{memo.title}</div>
                  </button>
                ))
              ) : (
                <div className="px-4 py-3 text-sm text-gray-500">검색 결과가 없습니다.</div>
              )}
            </div>
          )}
        </div>
      </div>

      <Modal
        isOpen={showHelpModal}
        onClose={() => setShowHelpModal(false)}
        title="에디터 도움말"
        size="lg"
      >
        <div className="space-y-6 text-sm text-gray-700">
          <section>
            <h3 className="mb-3 text-base font-semibold text-gray-900">편집 방식</h3>
            <p className="rounded border border-gray-200 px-3 py-2 leading-6">
              편집창과 미리보기가 따로 없습니다. 지금 쓰고 있는 줄만 소스로 보이고 나머지 줄은 렌더된 모습으로
              남습니다. <code className="rounded bg-gray-100 px-1 font-mono text-xs">-- 할 일</code> 처럼 문법이
              완성된 뒤 2초 동안 입력이 없으면 그 줄만 체크박스로 바뀌고, 더블클릭하거나 Backspace 를 한 번 누르면
              다시 소스로 돌아옵니다. <code className="rounded bg-gray-100 px-1 font-mono text-xs">--</code> 처럼
              아직 완성되지 않은 문법은 아무리 기다려도 바뀌지 않습니다.
            </p>
          </section>

          <section>
            <h3 className="mb-3 text-base font-semibold text-gray-900">특수 문법</h3>
            <div className="space-y-2">
              {editorFeatureHelp.map((item) => (
                <div key={item.syntax} className="grid grid-cols-[150px_1fr] gap-3 rounded border border-gray-200 px-3 py-2">
                  <code className="whitespace-pre-wrap rounded bg-gray-100 px-2 py-1 font-mono text-xs text-gray-900">
                    {item.syntax}
                  </code>
                  <p>{item.description}</p>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h3 className="mb-3 text-base font-semibold text-gray-900">단축키</h3>
            <div className="space-y-2">
              {shortcutHelp.map((item) => (
                <div key={item.keys} className="grid grid-cols-[150px_1fr] gap-3 rounded border border-gray-200 px-3 py-2">
                  <kbd className="rounded bg-gray-900 px-2 py-1 text-center font-mono text-xs text-white">
                    {item.keys}
                  </kbd>
                  <p>{item.description}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </Modal>
    </main>
  );
}
