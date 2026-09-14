'use client';

import type {
  ProjectMemoSearchResultInterface,
  SearchTextSegmentInterface,
} from '@/lib/types';
import * as api from '@/lib/api';
import {
  isProjectSearchShortcut,
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
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ProjectMemoSearchResultInterface[]>([]);
  const [total, setTotal] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isComposing, setIsComposing] = useState(false);
  const [error, setError] = useState('');
  const [refreshSequence, setRefreshSequence] = useState(0);
  const [isNavigating, setIsNavigating] = useState(false);

  const invalidatePendingSearch = useCallback(() => {
    abortRef.current?.abort();
    requestSequenceRef.current += 1;
  }, []);

  const close = useCallback(() => {
    invalidatePendingSearch();
    setIsOpen(false);
  }, [invalidatePendingSearch]);

  useEffect(() => {
    invalidatePendingSearch();
    setQuery('');
    setResults([]);
    setTotal(0);
    setSelectedIndex(0);
    setIsOpen(false);
    setIsLoading(false);
    setIsNavigating(false);
    setError('');
  }, [invalidatePendingSearch, projectId]);

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

    if (!normalizedQuery || isComposing) {
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
  }, [isComposing, projectId, query, refreshSequence]);

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
    if (event.nativeEvent.isComposing || isComposing) return;
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
    <div className="project-memo-search" ref={rootRef}>
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
            const nextQuery = event.target.value;
            invalidatePendingSearch();
            setQuery(nextQuery);
            setResults([]);
            setTotal(0);
            setSelectedIndex(0);
            setError('');
            setIsLoading(!isComposing && nextQuery.trim().length > 0);
            setIsOpen(true);
          }}
          onFocus={() => {
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
          onCompositionStart={() => {
            invalidatePendingSearch();
            setIsComposing(true);
          }}
          onCompositionEnd={() => {
            setIsComposing(false);
            if (query.trim()) setIsLoading(true);
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
