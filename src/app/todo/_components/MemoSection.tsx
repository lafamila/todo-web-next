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

/** 스크롤 가능한 요소의 현재 위치를 0~1 비율로 (내용 높이가 다른 서피스 사이에서 위치를 이어받기 위함). */
const scrollFractionOf = (el: HTMLElement | null): number | null => {
  if (!el) return null;
  const scrollable = el.scrollHeight - el.clientHeight;
  return scrollable > 0 ? el.scrollTop / scrollable : 0;
};

const applyScrollFraction = (el: HTMLElement, fraction: number) => {
  const scrollable = el.scrollHeight - el.clientHeight;
  if (scrollable > 0) el.scrollTop = fraction * scrollable;
};

/** 오프셋이 있는 줄이 화면 밖이면 최소한으로 끌어온다 (선택 위치를 눈에서 놓치지 않게). */
const ensureOffsetVisible = (el: HTMLTextAreaElement, offset: number) => {
  const lineHeight = parseFloat(window.getComputedStyle(el).lineHeight) || 20;
  const top = (el.value.slice(0, offset).split('\n').length - 1) * lineHeight;

  if (top < el.scrollTop) {
    el.scrollTop = Math.max(0, top - lineHeight);
    return;
  }
  if (top + lineHeight > el.scrollTop + el.clientHeight) {
    el.scrollTop = top - el.clientHeight + lineHeight * 2;
  }
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
  {
    keys: 'Ctrl/⌘ + A',
    description: '본문 전체를 선택합니다. 선택 동안만 원문이 보이고, 복사하거나 선택을 풀면 자동으로 돌아옵니다.',
  },
  {
    keys: 'Shift + ↑/↓',
    description:
      '여러 줄을 선택합니다. 선택 동안만 원문이 보이며 계속 늘리거나 복사할 수 있고, 복사·선택 해제 시 캐럿 위치를 유지한 채 돌아옵니다.',
  },
  { keys: '클릭', description: '그 줄을 클릭한 위치에서 소스 상태로 열어 수정합니다. 본문 아래 여백을 클릭하면 마지막 줄로 갑니다.' },
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

  /**
   * 선택 때문에 들어온 Raw 모드는 캐럿을 끝에 두는 대신 요청한 범위를 선택한다.
   * `'all'` 은 Cmd/Ctrl+A, 오프셋 쌍은 Shift+↑/↓ 가 넘긴 anchor→focus 다.
   */
  const pendingRawSelectionRef = useRef<'all' | { anchor: number; focus: number } | null>(null);

  /**
   * Raw 모드에 들어온 경로. `'selection'`(Cmd+A·Shift+↑/↓)은 일시적이라 복사·선택 해제 직후
   * 인라인으로 되돌리고, `'manual'`(Cmd/Ctrl+E)은 사용자가 명시적으로 켠 소스 뷰라 그대로 둔다.
   */
  const rawModeReasonRef = useRef<'manual' | 'selection'>('manual');
  /** 인라인으로 복귀할 때 캐럿을 놓을 문서 오프셋. */
  const pendingInlineCaretRef = useRef<number | null>(null);
  /** 인라인 화면의 스크롤 컨테이너 (Raw 모드는 textarea 자신이 스크롤한다 — 스크롤러가 서로 다르다). */
  const inlineScrollRef = useRef<HTMLDivElement>(null);
  /** 모드 전환 시 이어받을 스크롤 위치(0~1). 없으면 새 서피스가 맨 위에서 시작해 화면이 튄다. */
  const pendingScrollFractionRef = useRef<number | null>(null);

  useEffect(() => {
    if (rawMode && textareaRef.current) {
      requestAnimationFrame(() => {
        const pending = pendingRawSelectionRef.current;
        pendingRawSelectionRef.current = null;
        const el = textareaRef.current;

        if (!el || pending === null) {
          focusTextareaToEnd();
          return;
        }

        el.focus();

        if (pending === 'all') {
          el.select();
          // 전체 선택은 보던 위치를 그대로 유지한다 (문서 끝으로 튀지 않게).
          const fraction = pendingScrollFractionRef.current;
          pendingScrollFractionRef.current = null;
          if (fraction != null) applyScrollFraction(el, fraction);
          return;
        }

        // 방향을 유지해야 이어지는 Shift+방향키가 같은 쪽으로 확장된다.
        el.setSelectionRange(
          Math.min(pending.anchor, pending.focus),
          Math.max(pending.anchor, pending.focus),
          pending.focus >= pending.anchor ? 'forward' : 'backward',
        );

        // 인라인에서 보던 위치를 이어받은 뒤, 선택한 곳이 화면 밖이면 그쪽으로 최소 이동한다.
        const fraction = pendingScrollFractionRef.current;
        pendingScrollFractionRef.current = null;
        if (fraction != null) applyScrollFraction(el, fraction);
        ensureOffsetVisible(el, pending.focus);
      });
    } else if (!rawMode) {
      pendingRawSelectionRef.current = null;
    }
  }, [rawMode]);

  // 인라인으로 돌아온 뒤 캐럿 복원 — InlineEditor 가 마운트된 다음 프레임에 요청한다.
  useEffect(() => {
    if (rawMode) return;
    const offset = pendingInlineCaretRef.current;
    const fraction = pendingScrollFractionRef.current;
    pendingInlineCaretRef.current = null;
    pendingScrollFractionRef.current = null;
    if (offset == null) return;
    requestAnimationFrame(() => {
      // 보던 위치를 먼저 이어받아야 focus 의 scroll-into-view 가 조금만 보정한다.
      const scroller = inlineScrollRef.current;
      if (scroller && fraction != null) applyScrollFraction(scroller, fraction);
      inlineEditorRef.current?.focusOffset(offset);
    });
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

  /**
   * Cmd/Ctrl+A — 라인 하나만 선택되던 동작을 문서 전체 선택으로 바꾼다.
   * 인라인 서피스는 라인마다 별개 textarea 라 한 번에 선택할 수 없으므로,
   * 원문 그대로를 담은 Raw 모드로 전환한 뒤 전체를 선택한다 (복사 시 소스 무손실).
   */
  const enterRawModeForSelection = useCallback(
    (selection: 'all' | { anchor: number; focus: number }) => {
      if (isLockedByOtherRef.current || lockHolder) return;

      pendingScrollFractionRef.current = scrollFractionOf(inlineScrollRef.current);
      pendingRawSelectionRef.current = selection;
      rawModeReasonRef.current = 'selection';
      rawModeRef.current = true;
      setRawMode(true);
      setShowMemoSearch(false);
      setSearchQuery('');
      holdLock();
    },
    [holdLock, lockHolder],
  );

  const handleSelectAll = useCallback(() => {
    if (rawModeRef.current) {
      textareaRef.current?.select();
      return;
    }
    enterRawModeForSelection('all');
  }, [enterRawModeForSelection]);

  /** Shift+↑/↓ — 인라인에서 시작한 여러 줄 선택을 Raw 모드가 그대로 이어받는다. */
  const handleSelectRange = useCallback(
    (anchor: number, focus: number) => {
      if (rawModeRef.current) {
        textareaRef.current?.setSelectionRange(
          Math.min(anchor, focus),
          Math.max(anchor, focus),
          focus >= anchor ? 'forward' : 'backward',
        );
        return;
      }
      enterRawModeForSelection({ anchor, focus });
    },
    [enterRawModeForSelection],
  );

  const toggleRawMode = useCallback(() => {
    const next = !rawModeRef.current;

    if (next && (isLockedByOtherRef.current || lockHolder)) return;

    rawModeReasonRef.current = 'manual';
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

  /**
   * 선택 때문에 켜진 Raw 모드에서 인라인으로 돌아온다 (모드 전환 체감 최소화).
   * Cmd/Ctrl+E 로 직접 켠 소스 뷰는 건드리지 않는다.
   */
  const returnToInlineFromSelection = useCallback(
    (caretOffset: number | null) => {
      if (!rawModeRef.current || rawModeReasonRef.current !== 'selection') return;

      pendingScrollFractionRef.current = scrollFractionOf(textareaRef.current);
      pendingInlineCaretRef.current = caretOffset;
      rawModeReasonRef.current = 'manual';
      rawModeRef.current = false;
      setRawMode(false);
      setShowMemoSearch(false);
      setSearchQuery('');
      holdLock();
    },
    [holdLock],
  );

  // 복사/잘라내기는 이벤트가 끝난 다음 프레임에 전환한다 — 같은 틱에 언마운트하면 클립보드 쓰기가 취소된다.
  const handleRawCopy = useCallback(() => {
    const caret = textareaRef.current?.selectionEnd ?? null;
    requestAnimationFrame(() => returnToInlineFromSelection(caret));
  }, [returnToInlineFromSelection]);

  const handleRawCut = useCallback(() => {
    const caret = textareaRef.current?.selectionStart ?? null;
    requestAnimationFrame(() => returnToInlineFromSelection(caret));
  }, [returnToInlineFromSelection]);

  /** 선택이 풀린 순간(내비게이션·클릭)에 복귀한다. 타이핑은 대상이 아니다. */
  const handleRawSelectionSettled = useCallback(
    (el: HTMLTextAreaElement) => {
      if (el.selectionStart !== el.selectionEnd) return;
      returnToInlineFromSelection(el.selectionStart);
    },
    [returnToInlineFromSelection],
  );

  const handleRawKeyUp = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.shiftKey) return;
      const navigating =
        e.key === 'Escape' || e.key.startsWith('Arrow') || e.key === 'Home' || e.key === 'End';
      if (!navigating) return;
      handleRawSelectionSettled(e.currentTarget);
    },
    [handleRawSelectionSettled],
  );

  const handleRawMouseUp = useCallback(
    (e: React.MouseEvent<HTMLTextAreaElement>) => {
      handleRawSelectionSettled(e.currentTarget);
    },
    [handleRawSelectionSettled],
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
                onKeyUp={handleRawKeyUp}
                onMouseUp={handleRawMouseUp}
                onCopy={handleRawCopy}
                onCut={handleRawCut}
                className="memo-raw-input w-full h-full p-0 resize-none focus:outline-none"
                placeholder=""
              />
            </div>
          ) : (
            <div
              ref={inlineScrollRef}
              className="w-full min-h-0 h-full overflow-y-auto p-0 prose prose-sm max-w-none text-white"
            >
              <InlineEditor
                ref={inlineEditorRef}
                value={content}
                onChange={handleInlineChange}
                onPersist={handlePersist}
                onSave={handleSaveMemo}
                onEditingChange={handleEditingChange}
                onMentionChange={handleMentionChange}
                onSelectAll={handleSelectAll}
                onSelectRange={handleSelectRange}
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
