'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import { MonacoCodeEditor } from '@/components/editor/MonacoCodeEditor';
import { CheckboxItem } from '@/components/editor/CheckboxItem';
import { parseContent, toggleCheckbox } from '@/lib/utils';
import type { ContentBlockInterface, ArticleInterface } from '@/lib/types';
import { publishArticle, getMemoArticle, deleteArticle } from '@/lib/api';
import { useMemoSocket } from '@/hooks/useMemoSocket';

const isTypingContext = (el: Element | null) => {
  if (!el) return false;
  const tag = (el as HTMLElement).tagName?.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  const htmlEl = el as HTMLElement;
  return !!htmlEl.isContentEditable;
};

export function MemoSection() {
  const {
    state: { selectedMemo, selectedProject, memos },
    updateMemo,
  } = useApp();
  const { user } = useAuth();
  const isAdmin = user?.isAdmin ?? false;
  const [showTextarea, setShowTextarea] = useState(false);
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
      setShowTextarea(false);
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

  const resetTimer = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      releaseLock();
      setShowTextarea(false);
    }, 6_000);
  }, [releaseLock]);

  const openTextarea = () => {
    // If locked by another user, don't open
    if (isLockedByOtherRef.current || lockHolder) {
      return;
    }
    requestLock();
    setShowTextarea(true);
    resetTimer();
    focusTextareaToEnd();
  };

  useEffect(() => {
    if (showTextarea && textareaRef.current) {
      requestAnimationFrame(() => {
        focusTextareaToEnd();
      });
    }
  }, [showTextarea]);


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
  const contentRef = useRef<string>('');
  const originalContentRef = useRef<string>('');

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
      setShowTextarea(false);
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
      if (!textareaRef.current || !selectedProject) return;

      const textarea = textareaRef.current;
      const currentCursorPos = textarea.selectionStart;

      const currentContent = contentRef.current;
      const textBeforeCursor = currentContent.substring(0, currentCursorPos);
      const textAfterCursor = currentContent.substring(currentCursorPos);
      const lastAtIndex = textBeforeCursor.lastIndexOf('@');

      const memoUrl = `?projectId=${selectedProject.id}&memoId=${memo.id}`;
      const linkText = `[@${memo.title}](${memoUrl})`;

      let newContent: string;
      let newCursorPos: number;

      if (lastAtIndex !== -1 && showMemoSearch) {
        newContent = textBeforeCursor.substring(0, lastAtIndex) + linkText + textAfterCursor;
        newCursorPos = lastAtIndex + linkText.length;
      } else {
        newContent = textBeforeCursor + linkText + textAfterCursor;
        newCursorPos = currentCursorPos + linkText.length;
      }

      setContent(newContent);
      contentRef.current = newContent;

      setShowMemoSearch(false);
      setSearchQuery('');

      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
        }
      }, 0);
    },
    [selectedProject, showMemoSearch]
  );

  useEffect(() => {
    const handleInsertMemoLinkEvent = (e: Event) => {
      const customEvent = e as CustomEvent<{ id: string; title: string }>;
      if (customEvent.detail && textareaRef.current) {
        const { id, title } = customEvent.detail;
        handleInsertMemoLink({ id, title });
      }
    };

    window.addEventListener('insertMemoLink', handleInsertMemoLinkEvent);
    return () => window.removeEventListener('insertMemoLink', handleInsertMemoLinkEvent);
  }, [handleInsertMemoLink]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSaveMemo();
        return;
      }
      if (showTextarea) return;

    // 단축키는 패스 (Ctrl/⌘/Alt 포함)
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    // 현재 어딘가 입력중이면 패스
    if (isTypingContext(document.activeElement)) return;

    // "문자 입력"만 트리거 (방향키/Tab/F1 등 제외)
    const isPrintable = e.key.length === 1;
    const isEnter = e.key === 'Enter';
    const isBackspace = e.key === 'Backspace';
    if (!isPrintable && !isEnter && !isBackspace) return;

    // 다른 사용자가 편집 중이면 열지 않음
    if (isLockedByOtherRef.current || lockHolder) return;

    // 기본 동작 막고 textarea 열기
    e.preventDefault();
    requestLock();
    setShowTextarea(true);
    resetTimer();

    // (선택) 첫 입력을 content에 반영해서 "첫 글자 씩힘" 방지
    setContent((prev) => {
      if (isBackspace) return prev.slice(0, -1);
      if (isEnter) return prev + '\n';
      return prev + e.key;
    });

    // 렌더 후 포커스/커서 맨끝 (이미 네가 showTextarea effect로 해주고 있지만, 첫 입력 직후 안정성 위해 한번 더)
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      const len = el.value.length;
      el.setSelectionRange(len, len);
      el.scrollTop = el.scrollHeight;
    });
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleSaveMemo, lockHolder, requestLock, resetTimer, showTextarea]);

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
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

  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      resetTimer();
      if (!showMemoSearch || filteredMemos.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedSearchIndex((prev) => (prev < filteredMemos.length - 1 ? prev + 1 : prev));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedSearchIndex((prev) => (prev > 0 ? prev - 1 : prev));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const selectedMemoData = filteredMemos[selectedSearchIndex];
        if (selectedMemoData) {
          handleInsertMemoLink({
            id: selectedMemoData.id,
            title: selectedMemoData.title,
          });
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setShowMemoSearch(false);
        setSearchQuery('');
      }
    },
    [filteredMemos, handleInsertMemoLink, resetTimer, selectedSearchIndex, showMemoSearch]
  );

  const handleCheckboxToggle = async (lineIndex: number) => {
    const newContent = toggleCheckbox(contentRef.current, lineIndex);
    setContent(newContent);
    contentRef.current = newContent;

    try {
      await updateMemo(newContent);
      setOriginalContent(newContent);
      originalContentRef.current = newContent;
    } catch (error) {
      console.error('Failed to update checkbox:', error);
    }
  };

  const handleCodeBlockChange = useCallback((blockIndex: number, newCode: string) => {
    const lines = contentRef.current.split('\n');
    let currentBlockIndex = 0;
    let inCodeBlock = false;
    let codeBlockStartLine = -1;
    let codeBlockEndLine = -1;

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('```')) {
        if (!inCodeBlock) {
          if (currentBlockIndex === blockIndex) {
            codeBlockStartLine = i;
          }
          inCodeBlock = true;
        } else {
          if (currentBlockIndex === blockIndex) {
            codeBlockEndLine = i;
            break;
          }
          currentBlockIndex++;
          inCodeBlock = false;
        }
      }
    }

    if (codeBlockStartLine !== -1 && codeBlockEndLine !== -1) {
      const before = lines.slice(0, codeBlockStartLine + 1);
      const after = lines.slice(codeBlockEndLine);
      const newLines = [...before, ...newCode.split('\n'), ...after];
      const nextContent = newLines.join('\n');

      setContent(nextContent);
      contentRef.current = nextContent;
    }
  }, []);


  const markdownComponents = React.useMemo(
    () => ({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      a: ({ href, children, ...props }: any) => {
        if (href && (href.includes('memoId=') || href.startsWith('?'))) {
          return (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-white hover:underline cursor-pointer"
              {...props}
            >
              {children}
            </a>
          );
        }
        return (
          <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
            {children}
          </a>
        );
      },
    }),
    []
  );

  const renderContent = () => {
    const blocks = parseContent(content) as ContentBlockInterface[];
    let codeBlockIndex = 0;

    return blocks.map((block, index) => {
      switch (block.type) {
        case 'checkbox':
          return (
            <CheckboxItem
              key={index}
              checked={block.metadata?.checked || false}
              onChange={() => handleCheckboxToggle(index)}
              content={block.content}
            />
          );

        case 'code': {
          const currentCodeBlockIndex = codeBlockIndex;
          codeBlockIndex++;
          return (
            <div key={index} className="my-4">
              <MonacoCodeEditor
                value={block.content}
                language={block.metadata?.language}
                onChange={(value) => {
                  handleCodeBlockChange(currentCodeBlockIndex, value || '');
                }}
                onSave={handleSaveMemo}
                height="200px"
              />
            </div>
          );
        }

        case 'memo-link':
          return (
            <div key={index} className="my-2">
              <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={markdownComponents}>
                {block.content}
              </ReactMarkdown>
            </div>
          );

        case 'text':
        default:
          if (block.content.trim() === '') {
            return <br key={index} />;
          }
          return (
            <div key={index}>
              <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={markdownComponents}>
                {block.content}
              </ReactMarkdown>
            </div>
          );
      }
    });
  };

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

        <div className="flex flex-col h-full min-h-0">
          

          <div className={`w-full min-h-0 transition-all p-0 duration-300 ${showTextarea ? 'h-2/3' : 'h-full'} overflow-y-auto prose prose-sm max-w-none text-white`} onDoubleClick={openTextarea}>
            {renderContent()}
          </div>
          {showTextarea && (
          <div className="w-full min-h-0 h-1/3 transition-all duration-300 border-r border-gray-200 overflow-y-auto relative">
            <textarea
              ref={textareaRef}
              value={content}
              onChange={handleContentChange}
              onKeyDown={handleSearchKeyDown}
              className="w-full h-full p-0 resize-none focus:outline-none font-mono text-sm"
              placeholder=""
            />

            {showMemoSearch && filteredMemos.length > 0 && searchPosition && (
              <div
                className="fixed bg-white border border-gray-300 rounded shadow-lg z-50 max-h-60 overflow-y-auto"
                style={{
                  top: `${searchPosition.top}px`,
                  left: `${searchPosition.left}px`,
                  minWidth: '250px',
                }}
              >
                {filteredMemos.map((memo, index) => (
                  <button
                    key={memo.id}
                    onClick={() => handleInsertMemoLink({ id: memo.id, title: memo.title })}
                    className={`w-full text-left px-4 py-2 hover:bg-gray-100 ${
                      index === selectedSearchIndex ? 'bg-gray-100' : ''
                    }`}
                  >
                    <div className="font-medium text-sm text-gray-900">{memo.title}</div>
                  </button>
                ))}
              </div>
            )}

            {showMemoSearch && filteredMemos.length === 0 && (
              <div
                className="fixed bg-white border border-gray-300 rounded shadow-lg z-50 px-4 py-3 text-sm text-gray-500"
                style={{
                  top: `${searchPosition?.top}px`,
                  left: `${searchPosition?.left}px`,
                  minWidth: '250px',
                }}
              >
                검색 결과가 없습니다.
              </div>
            )}
          </div>)}
        </div>
      </div>
    </main>
  );
}

