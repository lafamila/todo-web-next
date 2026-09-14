'use client';

import type {
  ProjectMemoSearchResultInterface,
  SearchTextSegmentInterface,
} from '@/lib/types';
import * as api from '@/lib/api';
import {
  isProjectSearchShortcut,
  isImeKeyEvent,
  moveSearchSelection,
} from '@/lib/projectSearchPolicy';
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';

const SEARCH_DEBOUNCE_MS = 220;
const SEARCH_LIMIT = 20;
const EMPTY_SEARCH_HIDE_DELAY_MS = 1000;
// CSS의 project-search-reveal 및 opacity 전환과 같은 지속 시간.
const SEARCH_TRANSITION_MS = 180;

interface ProjectMemoSearchProps {
  projectId: string;
  onSelectMemo: (memoId: string) => Promise<void> | void;
  onShortcutFocus?: () => void;
}

function SegmentedText({
  segments,
  fallback,
}: {
  segments: SearchTextSegmentInterface[];
  fallback?: string;
}) {
  if (segments.length === 0) return <>{fallback}</>;
  return (
    <>
      {segments.map((segment, index) =>
        segment.match ? (
          <mark key={index}>{segment.text}</mark>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </>
  );
}

export function ProjectMemoSearch({
  projectId,
  onSelectMemo,
  onShortcutFocus,
}: ProjectMemoSearchProps) {
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const requestSequenceRef = useRef(0);
  const navigationInFlightRef = useRef(false);
  const composingRef = useRef(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ProjectMemoSearchResultInterface[]>([]);
  const [total, setTotal] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [refreshSequence, setRefreshSequence] = useState(0);
  const [isNavigating, setIsNavigating] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [hasFocus, setHasFocus] = useState(false);
  const [isPresent, setIsPresent] = useState(false);

  const invalidatePendingSearch = useCallback(() => {
    abortRef.current?.abort();
    requestSequenceRef.current += 1;
  }, []);

  const updateQuery = (nextQuery: string) => {
    if (nextQuery === query) return;
    invalidatePendingSearch();
    setQuery(nextQuery);
    setResults([]);
    setTotal(0);
    setSelectedIndex(0);
    setError('');
    setIsLoading(nextQuery.trim().length > 0);
    setIsOpen(true);
    setIsVisible(true);
  };

  const close = useCallback(() => {
    invalidatePendingSearch();
    setIsOpen(false);
  }, [invalidatePendingSearch]);

  useEffect(() => {
    invalidatePendingSearch();
    composingRef.current = false;
    setQuery('');
    setResults([]);
    setTotal(0);
    setSelectedIndex(0);
    setIsOpen(false);
    setIsLoading(false);
    setIsNavigating(false);
    setIsVisible(false);
    setIsPresent(false);
    setHasFocus(false);
    setError('');
  }, [invalidatePendingSearch, projectId]);

  useEffect(() => {
    if (isVisible) {
      setIsPresent(true);
      return;
    }
    if (!isPresent) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setIsPresent(false);
      return;
    }
    const timer = window.setTimeout(() => setIsPresent(false), SEARCH_TRANSITION_MS);
    return () => window.clearTimeout(timer);
  }, [isPresent, isVisible]);

  useEffect(() => {
    if (!isVisible || hasFocus || query.length > 0) return;
    const timer = window.setTimeout(() => {
      // 포커스/입력 이벤트와 같은 프레임에 만료되어도 현재 DOM 상태를 우선한다.
      if (document.activeElement === inputRef.current || inputRef.current?.value) return;
      close();
      setIsVisible(false);
    }, EMPTY_SEARCH_HIDE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [close, hasFocus, isVisible, query]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close();
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [close]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (!isProjectSearchShortcut(event)) return;
      event.preventDefault();
      event.stopPropagation();
      onShortcutFocus?.();
      invalidatePendingSearch();
      setIsOpen(true);
      setIsVisible(true);
      if (query.trim()) {
        setResults([]);
        setTotal(0);
        setSelectedIndex(0);
        setIsLoading(true);
        setError('');
        setRefreshSequence((current) => current + 1);
      }
      window.requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    };
    window.addEventListener('keydown', handleShortcut, { capture: true });
    return () => window.removeEventListener('keydown', handleShortcut, { capture: true });
  }, [invalidatePendingSearch, onShortcutFocus, query]);

  useEffect(() => {
    abortRef.current?.abort();
    const sequence = ++requestSequenceRef.current;
    const normalizedQuery = query.trim();

    // 한글 마지막 음절은 입력을 멈춰도 조합 중일 수 있다. 검색은 현재 값으로
    // debounce하고, IME 상태는 아래 키보드 결과 선택을 막는 데만 사용한다.
    if (!normalizedQuery) {
      setResults([]);
      setTotal(0);
      setSelectedIndex(0);
      setIsLoading(false);
      setError('');
      return;
    }

    setIsLoading(true);

    const timer = window.setTimeout(async () => {
      const controller = new AbortController();
      abortRef.current = controller;
      setIsLoading(true);
      setError('');
      try {
        const response = await api.searchProjectMemos(
          projectId,
          normalizedQuery,
          SEARCH_LIMIT,
          controller.signal,
        );
        if (sequence !== requestSequenceRef.current) return;
        setResults(response.results);
        setTotal(response.total);
        setSelectedIndex(0);
      } catch (requestError) {
        if (controller.signal.aborted || sequence !== requestSequenceRef.current) return;
        setResults([]);
        setTotal(0);
        setError(
          requestError instanceof api.ApiError
            ? requestError.message
            : '검색하지 못했습니다. 잠시 후 다시 시도해 주세요.',
        );
      } finally {
        if (sequence === requestSequenceRef.current) setIsLoading(false);
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
      abortRef.current?.abort();
    };
  }, [projectId, query, refreshSequence]);

  useEffect(() => {
    const activeOption = results[selectedIndex]
      ? document.getElementById(`${listboxId}-option-${selectedIndex}`)
      : null;
    activeOption?.scrollIntoView({ block: 'nearest' });
  }, [listboxId, results, selectedIndex]);

  const selectResult = async (result: ProjectMemoSearchResultInterface) => {
    if (navigationInFlightRef.current) return;
    navigationInFlightRef.current = true;
    setIsNavigating(true);
    setError('');
    try {
      await onSelectMemo(result.memoId);
      close();
      setQuery('');
      setResults([]);
    } catch {
      setError('메모를 열지 못했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      navigationInFlightRef.current = false;
      setIsNavigating(false);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (isImeKeyEvent(event.nativeEvent, composingRef.current)) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setIsOpen(true);
      setSelectedIndex((index) => moveSearchSelection(index, results.length, 'next'));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setIsOpen(true);
      setSelectedIndex((index) => moveSearchSelection(index, results.length, 'previous'));
      return;
    }
    if (event.key === 'Enter' && !isLoading && !isNavigating && results[selectedIndex]) {
      event.preventDefault();
      void selectResult(results[selectedIndex]);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      inputRef.current?.blur();
    }
  };

  const normalizedQuery = query.trim();
  const showDropdown = isOpen && normalizedQuery.length > 0;
  const activeOptionId = showDropdown && !isLoading && !error && results[selectedIndex]
    ? `${listboxId}-option-${selectedIndex}`
    : undefined;

  return (
    <div
      className="project-memo-search"
      ref={rootRef}
      hidden={!isVisible && !isPresent}
      data-visible={isVisible}
      aria-hidden={!isVisible}
      inert={!isVisible}
    >
      <div className="project-memo-search-input-wrap">
        <svg aria-hidden="true" viewBox="0 0 20 20">
          <circle cx="8.5" cy="8.5" r="5.5" />
          <path d="m12.5 12.5 4 4" />
        </svg>
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-label="현재 프로젝트 메모 검색"
          aria-expanded={showDropdown}
          aria-controls={showDropdown ? listboxId : undefined}
          aria-activedescendant={activeOptionId}
          aria-autocomplete="list"
          autoComplete="off"
          disabled={isNavigating}
          maxLength={200}
          value={query}
          placeholder="프로젝트 메모 검색"
          onChange={(event) => {
            updateQuery(event.target.value);
          }}
          onFocus={() => {
            setHasFocus(true);
            setIsVisible(true);
            setIsOpen(true);
            if (query.trim()) {
              invalidatePendingSearch();
              setResults([]);
              setTotal(0);
              setSelectedIndex(0);
              setIsLoading(true);
              setError('');
              setRefreshSequence((current) => current + 1);
            }
          }}
          onBlur={() => setHasFocus(false)}
          onCompositionStart={() => {
            composingRef.current = true;
          }}
          onCompositionEnd={(event) => {
            composingRef.current = false;
            updateQuery(event.currentTarget.value);
          }}
          onKeyDown={handleKeyDown}
        />
        <kbd>⌘⇧P</kbd>
      </div>

      {showDropdown && (
        <div className="project-memo-search-dropdown" id={listboxId} role="listbox">
          {isNavigating ? (
            <div className="project-memo-search-state" role="status">메모 여는 중…</div>
          ) : isLoading ? (
            <div className="project-memo-search-state" role="status">검색 중…</div>
          ) : error ? (
            <div className="project-memo-search-state project-memo-search-error" role="alert">
              {error}
            </div>
          ) : results.length === 0 ? (
            <div className="project-memo-search-state">검색 결과가 없습니다.</div>
          ) : (
            <>
              {results.map((result, index) => (
                <button
                  key={result.memoId}
                  id={`${listboxId}-option-${index}`}
                  type="button"
                  role="option"
                  aria-selected={index === selectedIndex}
                  className={`project-memo-search-result${
                    index === selectedIndex ? ' selected' : ''
                  }`}
                  onMouseEnter={() => setSelectedIndex(index)}
                  onClick={() => void selectResult(result)}
                >
                  <strong>
                    <SegmentedText segments={result.titleSegments} fallback={result.title} />
                  </strong>
                  <span className="project-memo-search-snippet">
                    <SegmentedText segments={result.snippetSegments} />
                  </span>
                </button>
              ))}
              {total > results.length && (
                <div className="project-memo-search-total">
                  관련도 순 상위 {results.length}개 · 전체 {total}개
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
