'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { useSync } from '@/contexts/SyncContext';
import { Modal } from '@/components/ui/Modal';
import {
  InlineEditor,
  type InlineEditorHandle,
  type MentionState,
} from '@/components/editor/inline/InlineEditor';
import type {
  ArticleInterface,
  MemoVersionInterface,
  SyncIssueInterface,
} from '@/lib/types';
import {
  ApiError,
  clearMemoLease,
  publishArticle,
  getMemoArticle,
  deleteArticle,
  getMemo,
  getAllProjects,
  mergeMemo,
  waitForMemoMergeApplied,
} from '@/lib/api';
import { useMemoSocket } from '@/hooks/useMemoSocket';
import { useIsMobile } from '@/hooks/useIsMobile';
import { shouldResetMemoEditorState } from '@/lib/memoVersionPolicy';
import { classifyLockDenial } from '@/lib/memoLeasePolicy';
import { MemoResolutionPanel } from './MemoResolutionPanel';
import { MemoVersionBar } from './MemoVersionBar';
import {
  classifySaveFailure,
  decideDraftRecovery,
  retryDelayMs,
  selectDraftCandidate,
  rebaseQueuedSaveRevision,
  canAdoptFetchedRemote,
  nextDraftRevision,
  shouldResumePendingSave,
  isCurrentEditorRequest,
  enqueueFailedDraftSnapshot,
  evaluateDraftDismissals,
  makeDraftDismissalKey,
  decideRemoteRefreshAfterFetch,
  isLatestRemoteRefreshRequest,
  sourceLineageForDraft,
  type MemoDraftRecord,
  type DraftDismissalAction,
} from '@/lib/memoDraftPolicy';
import {
  currentMemoDraftKey,
  deleteMemoDraftIfRevision,
  getMemoDraftTabId,
  listMemoDrafts,
  loadMemoDraft,
  putMemoDraft,
  deleteMemoDraftDismissals,
  listMemoDraftDismissals,
  putMemoDraftDismissal,
} from '@/lib/memoDraftStore';

/** 데스크톱에서 상태·액션 묶음을 올려 보낼 헤더(동기화 표시 라인)의 포털 자리. */
const HEADER_SLOT_ID = 'memo-status-slot';
const DRAFT_FLUSH_DELAY_MS = 350;
const MAX_AUTOMATIC_SAVE_RETRIES = 8;
const MAX_LEASE_SAVE_RETRIES = 2;

type DraftStatus =
  | 'idle'
  | 'local-saved'
  | 'lock-wait'
  | 'retrying'
  | 'conflict'
  | 'error';

interface PendingMemoSave {
  memoId: string;
  editorEpoch: number;
  content: string;
  baseRevision?: string;
  localRevision: number;
  retryCount: number;
  leaseRetryCount: number;
  allowConflict: boolean;
  draftStored: boolean;
  resolve: (saved: boolean) => void;
}

interface FailedDraftSnapshot {
  memoId: string;
  title: string;
  content: string;
  error: string;
}

/**
 * 모바일 앱바의 "← 목록" 이 목록 뷰로 돌아가라고 알리는 이벤트.
 * 콜백 prop 대신 이벤트를 쓰는 이유는 이 파일이 `'use client'` 엔트리라 함수 prop 이
 * 직렬화 경고를 내기 때문이다 (같은 이유로 `insertMemoLink` 도 이벤트다).
 */
export const SHOW_MEMO_LIST_EVENT = 'todo:showMemoList';

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
  { syntax: 'v-- 완료한 일', description: '체크된 체크박스를 만듭니다.' },
  {
    syntax: '``` / java```',
    description:
      '코드 블록을 만듭니다. 기본 언어는 typescript 이고 ``` 앞에 언어를 쓰면 그 언어로 하이라이팅됩니다(에디터 위 선택기로도 바꿀 수 있습니다). ``` 표시는 화면에서 감춰집니다.',
  },
  { syntax: '@메모명', description: '편집 중 다른 메모를 검색해서 링크로 삽입합니다.' },
  { syntax: '1. 항목', description: '번호 목록을 만듭니다.' },
  { syntax: '- 항목', description: '글머리 목록을 만듭니다.' },
  {
    syntax: '  -- 할 일\n  1. 항목\n  - 항목',
    description:
      '스페이스 2칸이 들여쓰기 한 단위입니다. 체크박스·번호 목록·글머리 목록 앞에 쓰면 그만큼 들여쓴 채로 렌더됩니다(최대 8단계).',
  },
  { syntax: '[텍스트]', description: '대괄호로 감싼 부분을 굵게 표시합니다. 줄 시작이나 공백 뒤에 있어야 하고, 뒤에 (가 오면 링크로 봅니다.' },
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
  { keys: 'Ctrl/⌘ + Shift + P', description: '현재 프로젝트의 메모 검색창으로 이동합니다.' },
  { keys: 'Ctrl/⌘ + Shift + O', description: '관리자에게 멤버 관리 모달을 엽니다.' },
  { keys: 'Ctrl/⌘ + 메모 클릭', description: '메모 목록에서 여러 메모를 선택합니다.' },
  { keys: 'Esc', description: '편집 중인 줄을 확정하거나, 검색 추천 목록·모달을 닫습니다.' },
];

export function MemoSection() {
  const isMobile = useIsMobile();
  // 데스크톱: 상태·액션을 헤더 슬롯으로 포털해 에디터가 패널 전체 높이를 쓴다.
  // 모바일: 헤더가 좁으므로 패널 상단의 앱바에 그대로 둔다(뒤로·저장이 여기 있어야 손이 닿는다).
  const [headerSlot, setHeaderSlot] = useState<HTMLElement | null>(null);
  const {
    state: { selectedMemo, selectedProject, projects, memos },
    updateMemo,
    selectProject,
    selectMemo,
    refreshProjects,
    refreshCurrentProject,
  } = useApp();
  const { user, features } = useAuth();
  const {
    issues,
    findIssue,
    resolveIssues,
    refresh: refreshSync,
    canMerge,
  } = useSync();
  const isAdmin = user?.isAdmin ?? false;

  // 헤더 슬롯은 같은 트리(MemoListSection)가 렌더하므로 마운트 후에 존재한다.
  useEffect(() => {
    setHeaderSlot(document.getElementById(HEADER_SLOT_ID));
  }, []);

  // Raw 모드 = 문서 전체를 하나의 textarea 로 다루는 escape hatch (멀티라인 선택/복사용).
  const [rawMode, setRawMode] = useState(false);
  const rawModeRef = useRef(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [lockMessage, setLockMessage] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const isEditingRef = useRef(false);
  const [remoteContent, setRemoteContent] = useState<string | null>(null);
  const [showRemoteCompare, setShowRemoteCompare] = useState(false);
  const [viewedVersion, setViewedVersion] = useState<MemoVersionInterface | null>(null);
  const isViewingVersion = viewedVersion !== null;
  const initializedMemoIdRef = useRef<string | null>(null);
  const editorEpochRef = useRef(0);
  const [draftStatus, setDraftStatus] = useState<DraftStatus>('idle');
  const [draftError, setDraftError] = useState<string | null>(null);
  const [recoveryDraft, setRecoveryDraft] = useState<MemoDraftRecord | null>(null);
  const [draftConflictActive, setDraftConflictActive] = useState(false);
  const [failedDraftSnapshots, setFailedDraftSnapshots] =
    useState<FailedDraftSnapshot[]>([]);
  const draftConflictSourceRef = useRef<MemoDraftRecord | null>(null);
  const recoveredDraftSourceRef = useRef<MemoDraftRecord | null>(null);
  const remoteRefreshSequenceRef = useRef(0);
  const remoteRefreshAbortRef = useRef<AbortController | null>(null);

  const [content, setContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const inlineEditorRef = useRef<InlineEditorHandle>(null);
  const contentRef = useRef<string>('');
  const originalContentRef = useRef<string>('');
  const pendingEditOffsetRef = useRef<number | null>(null);
  const baseRevisionRef = useRef<string | undefined>(undefined);
  const localRevisionRef = useRef(0);
  const draftCreatedAtRef = useRef(0);
  const draftFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSaveRef = useRef<PendingMemoSave | null>(null);
  const saveInFlightRef = useRef(false);
  const saveRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resumePendingSaveRef = useRef<() => void>(() => {});
  const currentIssue =
    selectedMemo &&
    findIssue('memos', selectedMemo.id);
  const actionableIssue =
    currentIssue?.kind === 'conflict' || currentIssue?.kind === 'duplicate_memo'
      ? currentIssue
      : undefined;

  const {
    isConnected,
    lockHolder,
    leaseState,
    requestLock,
    retryLock,
    releaseLock,
    hasCurrentLease,
    broadcastUpdate,
  } = useMemoSocket({
    memoId: selectedMemo?.id ?? null,
    onContentUpdated: (newContent: string) => {
      const refreshSequence = remoteRefreshSequenceRef.current + 1;
      remoteRefreshSequenceRef.current = refreshSequence;
      remoteRefreshAbortRef.current?.abort();
      remoteRefreshAbortRef.current = null;
      if (
        actionableIssue ||
        isEditingRef.current ||
        rawModeRef.current ||
        contentRef.current !== originalContentRef.current
      ) {
        setRemoteContent(newContent);
        return;
      }
      const refreshMemoId = selectedMemo?.id;
      if (!refreshMemoId) return;
      const refreshEditorEpoch = editorEpochRef.current;
      const controller = new AbortController();
      remoteRefreshAbortRef.current = controller;
      void getMemo(refreshMemoId, controller.signal)
        .then((fresh) => {
          const isCurrentRequest =
            isLatestRemoteRefreshRequest(
              refreshSequence,
              remoteRefreshSequenceRef.current,
            ) &&
            isCurrentEditorRequest({
              expectedMemoId: refreshMemoId,
              expectedEpoch: refreshEditorEpoch,
              currentMemoId: initializedMemoIdRef.current,
              currentEpoch: editorEpochRef.current,
            });
          const decision = decideRemoteRefreshAfterFetch({
            isCurrentRequest,
            hasDirtyBuffer:
              isEditingRef.current ||
              rawModeRef.current ||
              contentRef.current !== originalContentRef.current,
          });
          if (decision === 'ignore') return;
          if (decision === 'compare') {
            setRemoteContent(fresh.content);
            return;
          }
          setContent(fresh.content);
          contentRef.current = fresh.content;
          setOriginalContent(fresh.content);
          originalContentRef.current = fresh.content;
          baseRevisionRef.current = fresh.revision;
        })
        .catch(() => {
          if (
            controller.signal.aborted ||
            !isLatestRemoteRefreshRequest(
              refreshSequence,
              remoteRefreshSequenceRef.current,
            )
          ) return;
          if (
            !isCurrentEditorRequest({
              expectedMemoId: refreshMemoId,
              expectedEpoch: refreshEditorEpoch,
              currentMemoId: initializedMemoIdRef.current,
              currentEpoch: editorEpochRef.current,
            })
          ) return;
          // revision을 모르는 채 clean buffer로 채택하지 않는다. 사용자가 비교하도록 보존한다.
          setRemoteContent(newContent);
        })
        .finally(() => {
          if (
            isLatestRemoteRefreshRequest(
              refreshSequence,
              remoteRefreshSequenceRef.current,
            )
          ) remoteRefreshAbortRef.current = null;
        });
    },
    onLocked: (info) => {
      // Another user locked the memo
      setLockMessage(`${info.displayName}님이 수정중입니다`);
    },
    onUnlocked: () => {
      setLockMessage(null);
      if (pendingSaveRef.current) window.setTimeout(requestLock, 0);
    },
    onLockDenied: (displayName: string) => {
      const denialKind = classifyLockDenial(displayName);
      setLockMessage(
        denialKind !== 'locked'
          ? displayName
          : `${displayName}님이 수정중입니다`,
      );
      if (denialKind === 'terminal') {
        if (saveRetryTimerRef.current) {
          clearTimeout(saveRetryTimerRef.current);
          saveRetryTimerRef.current = null;
        }
        const pending = pendingSaveRef.current;
        pendingSaveRef.current = null;
        pending?.resolve(false);
        setDraftStatus('error');
        setDraftError(displayName);
        setSaveMessage(`${displayName} · 기기 초안은 유지됩니다.`);
      } else if (denialKind === 'retryable' && pendingSaveRef.current) {
        const pending = pendingSaveRef.current;
        if (pending.leaseRetryCount < MAX_LEASE_SAVE_RETRIES) {
          pendingSaveRef.current = {
            ...pending,
            leaseRetryCount: pending.leaseRetryCount + 1,
          };
          const delay = retryDelayMs(pending.leaseRetryCount);
          setDraftStatus(pending.draftStored ? 'retrying' : 'error');
          setSaveMessage(
            pending.draftStored
              ? '편집 잠금 서버 재시도 중 · 기기 초안 보관됨'
              : '편집 잠금 재시도 중 · 기기 임시저장 실패로 내용 복사가 필요합니다.',
          );
          if (saveRetryTimerRef.current) clearTimeout(saveRetryTimerRef.current);
          saveRetryTimerRef.current = setTimeout(() => {
            saveRetryTimerRef.current = null;
            requestLock();
          }, delay);
        } else {
          pendingSaveRef.current = null;
          pending.resolve(false);
          setDraftStatus('error');
          setDraftError(displayName);
          setSaveMessage('편집 잠금 서버 재시도 한도를 초과했습니다. 기기 초안을 확인하세요.');
        }
      }
      setRawMode(false);
      rawModeRef.current = false;
    },
    onSyncApplied: () => {
      void Promise.all([
        refreshProjects(),
        refreshCurrentProject(),
        refreshSync(),
      ]);
    },
  });

  const ownDraftKey = useCallback(
    (memoId: string) => (user ? currentMemoDraftKey(user.id, memoId) : null),
    [user],
  );

  const flushDraft = useCallback(
    async (
      snapshotContent = contentRef.current,
      snapshotLocalRevision = localRevisionRef.current,
    ): Promise<boolean> => {
      if (!selectedMemo || !user || isViewingVersion) return true;
      const key = ownDraftKey(selectedMemo.id);
      if (!key) return false;

      if (draftFlushTimerRef.current) {
        clearTimeout(draftFlushTimerRef.current);
        draftFlushTimerRef.current = null;
      }

      try {
        if (snapshotContent === originalContentRef.current) {
          const existing = await loadMemoDraft(key);
          if (existing) {
            await deleteMemoDraftIfRevision(key, existing.localRevision);
          }
          if (!pendingSaveRef.current) setDraftStatus('idle');
          return true;
        }

        const now = Date.now();
        const sourceLineage = sourceLineageForDraft(
          recoveredDraftSourceRef.current ?? draftConflictSourceRef.current,
          key,
        );
        const record: MemoDraftRecord = {
          key,
          origin: window.location.origin,
          userId: user.id,
          memoId: selectedMemo.id,
          tabId: getMemoDraftTabId(),
          baseRevision: baseRevisionRef.current ?? null,
          baseContent: originalContentRef.current,
          draftContent: snapshotContent,
          localRevision: snapshotLocalRevision,
          createdAt: draftCreatedAtRef.current,
          updatedAt: now,
          retryCount: pendingSaveRef.current?.retryCount ?? 0,
          lastError: draftError,
          ...(sourceLineage ? { sourceLineage } : {}),
        };
        await putMemoDraft(record);
        if (!pendingSaveRef.current && !draftConflictActive) {
          setDraftStatus('local-saved');
        }
        setDraftError(null);
        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : '기기 임시저장에 실패했습니다.';
        setDraftStatus('error');
        setDraftError(message);
        return false;
      }
    },
    [draftConflictActive, draftError, isViewingVersion, ownDraftKey, selectedMemo, user],
  );

  const scheduleDraftFlush = useCallback(() => {
    if (draftFlushTimerRef.current) clearTimeout(draftFlushTimerRef.current);
    draftFlushTimerRef.current = setTimeout(() => {
      draftFlushTimerRef.current = null;
      void flushDraft();
    }, DRAFT_FLUSH_DELAY_MS);
  }, [flushDraft]);

  const applyContentMutation = useCallback(
    (next: string) => {
      if (next === contentRef.current) return;
      localRevisionRef.current = nextDraftRevision(localRevisionRef.current);
      setContent(next);
      contentRef.current = next;
      scheduleDraftFlush();
    },
    [scheduleDraftFlush],
  );

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

  // 편집 의도로 lease를 얻었지만 빈 여백 클릭 등으로 실제 라인이 활성화되지 않은 경우에도
  // 무기한 renew하지 않는다. 캐럿 재생이 성공해 편집이 시작되면 holdLock이 이 타이머를 끈다.
  useEffect(() => {
    if (
      leaseState === 'ready' &&
      !isEditingRef.current &&
      !rawModeRef.current
    ) {
      scheduleLockRelease();
    }
  }, [leaseState, scheduleLockRelease]);

  useEffect(() => {
    if (leaseState !== 'ready') return;
    const offset = pendingEditOffsetRef.current;
    if (offset === null) return;
    pendingEditOffsetRef.current = null;
    requestAnimationFrame(() => inlineEditorRef.current?.focusOffset(offset));
  }, [leaseState]);

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
      if (draftFlushTimerRef.current) clearTimeout(draftFlushTimerRef.current);
      if (saveRetryTimerRef.current) clearTimeout(saveRetryTimerRef.current);
      remoteRefreshAbortRef.current?.abort();
      pendingSaveRef.current?.resolve(false);
    };
  }, []);

  // 탭 숨김/종료 직전에는 debounce를 기다리지 않고 현재 버퍼를 IndexedDB에 넘긴다.
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') void flushDraft();
    };
    window.addEventListener('pagehide', handleVisibility);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('pagehide', handleVisibility);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [flushDraft]);

  // 메모/계정 전환은 이전 메모 debounce가 실행되기 전에 컴포넌트가 재사용될 수 있으므로
  // cleanup에서 이전 identity와 snapshot으로 직접 보존한다.
  const selectedMemoId = selectedMemo?.id;
  const selectedMemoTitle = selectedMemo?.title;
  const draftUserId = user?.id;
  useEffect(() => {
    if (!selectedMemoId || !selectedMemoTitle || !draftUserId) return;
    const memoId = selectedMemoId;
    const userId = draftUserId;
    const key = currentMemoDraftKey(userId, memoId);
    const origin = window.location.origin;
    const tabId = getMemoDraftTabId();
    return () => {
      if (draftFlushTimerRef.current) clearTimeout(draftFlushTimerRef.current);
      const draftContent = contentRef.current;
      const baseContent = originalContentRef.current;
      if (draftContent === baseContent) return;
      const sourceLineage = sourceLineageForDraft(
        recoveredDraftSourceRef.current ?? draftConflictSourceRef.current,
        key,
      );
      void putMemoDraft({
        key,
        origin,
        userId,
        memoId,
        tabId,
        baseRevision: baseRevisionRef.current ?? null,
        baseContent,
        draftContent,
        localRevision: localRevisionRef.current,
        createdAt: draftCreatedAtRef.current,
        updatedAt: Date.now(),
        retryCount: pendingSaveRef.current?.retryCount ?? 0,
        lastError: null,
        ...(sourceLineage ? { sourceLineage } : {}),
      }).catch((error) => {
        const message =
          error instanceof Error ? error.message : 'IndexedDB 임시저장에 실패했습니다.';
        console.error('Failed to preserve memo draft during memo switch:', error);
        setFailedDraftSnapshots((current) =>
          enqueueFailedDraftSnapshot(current, {
            memoId,
            title: selectedMemoTitle,
            content: draftContent,
            error: message,
          }),
        );
      });
    };
  }, [draftUserId, selectedMemoId, selectedMemoTitle]);

  const [showMemoSearch, setShowMemoSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchPosition, setSearchPosition] = useState<{ top: number; left: number } | null>(null);
  const [selectedSearchIndex, setSelectedSearchIndex] = useState(0);

  const isLockedByOther = Boolean(lockHolder);
  const canEdit =
    !isViewingVersion && leaseState === 'ready' && !isLockedByOther;

  // pending 오버레이는 300ms 를 넘길 때만 보여준다 — 로컬/근거리 서버에서는 lease
  // 핸드셰이크가 수십 ms 에 끝나 매 클릭마다 배너가 번쩍이기 때문. 입력 차단
  // 자체(canEdit)는 지연 없이 즉시 걸리고, denied 는 실제 차단이라 바로 보인다.
  const [pendingOverlayVisible, setPendingOverlayVisible] = useState(false);
  useEffect(() => {
    if (leaseState !== 'pending') {
      setPendingOverlayVisible(false);
      return;
    }
    const timer = window.setTimeout(() => setPendingOverlayVisible(true), 300);
    return () => window.clearTimeout(timer);
  }, [leaseState]);

  useEffect(() => {
    if (leaseState === 'ready' || leaseState === 'idle') {
      setLockMessage(null);
    }
  }, [leaseState]);

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
    const nextMemoId = selectedMemo?.id ?? null;
    if (
      !shouldResetMemoEditorState(initializedMemoIdRef.current, nextMemoId)
    ) {
      return;
    }
    initializedMemoIdRef.current = nextMemoId;
    editorEpochRef.current += 1;
    remoteRefreshSequenceRef.current += 1;
    remoteRefreshAbortRef.current?.abort();
    remoteRefreshAbortRef.current = null;

    if (selectedMemo) {
      if (saveRetryTimerRef.current) {
        clearTimeout(saveRetryTimerRef.current);
        saveRetryTimerRef.current = null;
      }
      pendingSaveRef.current?.resolve(false);
      pendingSaveRef.current = null;
      saveInFlightRef.current = false;
      setContent(selectedMemo.content);
      setOriginalContent(selectedMemo.content);
      contentRef.current = selectedMemo.content;
      originalContentRef.current = selectedMemo.content;
      setRawMode(false);
      rawModeRef.current = false;
      setLockMessage(null);
      setSaveMessage(null);
      setRemoteContent(null);
      setShowRemoteCompare(false);
      setViewedVersion(null);
      isEditingRef.current = false;
      pendingEditOffsetRef.current = null;
      baseRevisionRef.current = selectedMemo.revision;
      localRevisionRef.current = 0;
      draftCreatedAtRef.current = Date.now();
      setRecoveryDraft(null);
      setDraftConflictActive(false);
      draftConflictSourceRef.current = null;
      recoveredDraftSourceRef.current = null;
      setDraftStatus('idle');
      setDraftError(null);

      if (user) {
        const loadingMemoId = selectedMemo.id;
        const loadingEditorEpoch = editorEpochRef.current;
        void Promise.all([
          listMemoDrafts(window.location.origin, user.id, selectedMemo.id),
          listMemoDraftDismissals(window.location.origin, user.id, selectedMemo.id),
        ])
          .then(async ([loadedDrafts, dismissals]) => {
            const isStillCurrent = () =>
              isCurrentEditorRequest({
                expectedMemoId: loadingMemoId,
                expectedEpoch: loadingEditorEpoch,
                currentMemoId: initializedMemoIdRef.current,
                currentEpoch: editorEpochRef.current,
              });
            if (!isStillCurrent()) return;
            const currentKey = currentMemoDraftKey(user.id, selectedMemo.id);
            const evaluated = evaluateDraftDismissals(
              loadedDrafts,
              dismissals,
              selectedMemo.revision ?? null,
            );
            if (evaluated.staleDismissalKeys.length > 0) {
              await deleteMemoDraftDismissals(evaluated.staleDismissalKeys);
              if (!isStillCurrent()) return;
            }
            const remaining: MemoDraftRecord[] = [];
            for (const draft of evaluated.candidates) {
              if (!isStillCurrent()) return;
              const decision = decideDraftRecovery(
                draft,
                selectedMemo.content,
                selectedMemo.revision ?? null,
              );
              if (decision === 'cleanup') {
                if (draft.key === currentKey) {
                  await deleteMemoDraftIfRevision(draft.key, draft.localRevision);
                  if (!isStillCurrent()) return;
                }
              } else {
                remaining.push(draft);
              }
            }
            if (
              remaining.length === 0 ||
              !isStillCurrent() ||
              localRevisionRef.current !== 0 ||
              contentRef.current !== originalContentRef.current
            ) {
              return;
            }
            // 현재 탭 초안이 있으면 그것이 이 탭의 canonical 후보다. 없을 때만
            // 다른 탭의 최신 후보를 보여 주며, 로드 단계에서는 절대 이동/삭제하지 않는다.
            const latest = selectDraftCandidate(remaining, currentKey);
            if (!latest) return;
            const decision = decideDraftRecovery(
              latest,
              selectedMemo.content,
              selectedMemo.revision ?? null,
            );
            draftCreatedAtRef.current = latest.createdAt;
            if (decision === 'offer-recovery') {
              setRecoveryDraft(latest);
              return;
            }

            localRevisionRef.current = latest.localRevision;
            setContent(latest.draftContent);
            contentRef.current = latest.draftContent;
            setRemoteContent(selectedMemo.content);
            setShowRemoteCompare(true);
            setDraftConflictActive(true);
            draftConflictSourceRef.current = latest;
            setDraftStatus('conflict');
          })
          .catch((error) => {
            if (
              !isCurrentEditorRequest({
                expectedMemoId: loadingMemoId,
                expectedEpoch: loadingEditorEpoch,
                currentMemoId: initializedMemoIdRef.current,
                currentEpoch: editorEpochRef.current,
              })
            ) return;
            setDraftStatus('error');
            setDraftError(
              error instanceof Error ? error.message : '기기 초안을 불러오지 못했습니다.',
            );
          });
      }
    }
  }, [selectedMemo, user]);

  const handleVersionSelect = useCallback(
    (version: MemoVersionInterface | null) => {
      setViewedVersion(version);
      setRawMode(false);
      rawModeRef.current = false;
      setShowMemoSearch(false);
      setSearchQuery('');
      pendingEditOffsetRef.current = null;
      isEditingRef.current = false;
      setSaveMessage(null);

      if (version) {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        releaseLock();
      }
    },
    [releaseLock],
  );

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

  // 같은 메모의 목록 metadata가 sync refresh로 갱신될 수 있다. 깨끗한 버퍼에서만
  // 최신 CAS 기준을 받아들이고, dirty/draft-conflict 중에는 편집의 base를 보존한다.
  const selectedMemoRevision = selectedMemo?.revision;
  useEffect(() => {
    if (!selectedMemoId || initializedMemoIdRef.current !== selectedMemoId) return;
    if (draftConflictActive || contentRef.current !== originalContentRef.current) return;
    baseRevisionRef.current = selectedMemoRevision;
  }, [draftConflictActive, selectedMemoId, selectedMemoRevision]);

  const processPendingSave = useCallback(async () => {
    const pending = pendingSaveRef.current;
    if (!pending || saveInFlightRef.current) return;
    if (!selectedMemo || selectedMemo.id !== pending.memoId || isViewingVersion) {
      pendingSaveRef.current = null;
      pending.resolve(false);
      return;
    }
    if (draftConflictActive && !pending.allowConflict) {
      setDraftStatus('conflict');
      pendingSaveRef.current = null;
      pending.resolve(false);
      return;
    }
    if (
      !shouldResumePendingSave(leaseState, isLockedByOther) ||
      !hasCurrentLease(pending.memoId)
    ) {
      setDraftStatus(pending.draftStored ? 'lock-wait' : 'error');
      setSaveMessage(
        pending.draftStored
          ? '편집 잠금 대기 중 · 내용은 이 기기에 임시 저장됨'
          : '편집 잠금 대기 중 · 기기 임시저장에 실패해 내용 복사가 필요합니다.',
      );
      requestLock();
      return;
    }

    if (saveRetryTimerRef.current) {
      clearTimeout(saveRetryTimerRef.current);
      saveRetryTimerRef.current = null;
    }
    pendingSaveRef.current = null;
    saveInFlightRef.current = true;

    try {
      const updated = await updateMemo(pending.content, pending.baseRevision);
      if (
        initializedMemoIdRef.current !== pending.memoId ||
        editorEpochRef.current !== pending.editorEpoch
      ) {
        pending.resolve(false);
        return;
      }

      baseRevisionRef.current = updated.revision ?? baseRevisionRef.current;
      pendingSaveRef.current = rebaseQueuedSaveRevision<PendingMemoSave>(
        pendingSaveRef.current,
        pending.memoId,
        updated.revision,
      );
      setOriginalContent(pending.content);
      originalContentRef.current = pending.content;
      broadcastUpdate(pending.content);

      const key = ownDraftKey(pending.memoId);
      setDraftError(null);
      try {
        if (key) {
          await deleteMemoDraftIfRevision(key, pending.localRevision);
        }
        const recoveredSource = recoveredDraftSourceRef.current;
        if (recoveredSource) {
          const sourceLineage = key
            ? sourceLineageForDraft(recoveredSource, key)
            : null;
          if (sourceLineage) {
            await putMemoDraftDismissal({
              key: makeDraftDismissalKey(sourceLineage.sourceKey),
              sourceKey: sourceLineage.sourceKey,
              sourceLocalRevision: sourceLineage.sourceLocalRevision,
              acceptedServerRevision: updated.revision ?? null,
              origin: sourceLineage.origin,
              userId: sourceLineage.userId,
              memoId: sourceLineage.memoId,
              action: 'saved',
              createdAt: Date.now(),
            });
          }
          recoveredDraftSourceRef.current = null;
        }

        if (localRevisionRef.current === pending.localRevision) {
          setDraftStatus('idle');
        } else {
          // 저장 요청 뒤 입력된 내용은 새 base revision 위에 다시 보존한다.
          const stored = await flushDraft(contentRef.current, localRevisionRef.current);
          setDraftStatus(stored ? 'local-saved' : 'error');
        }
      } catch (draftCleanupError) {
        const message =
          draftCleanupError instanceof Error
            ? draftCleanupError.message
            : '저장된 기기 초안을 정리하지 못했습니다.';
        setDraftStatus('error');
        setDraftError(message);
      }
      setSaveMessage('서버에 저장되었습니다.');
      window.setTimeout(() => setSaveMessage(null), 3000);
      pending.resolve(true);
    } catch (error) {
      console.error('Failed to save memo:', error);
      const failure = classifySaveFailure(error);

      if (failure === 'conflict') {
        const queued = pendingSaveRef.current as PendingMemoSave | null;
        queued?.resolve(false);
        pendingSaveRef.current = null;
        const current = error instanceof ApiError ? error.current : undefined;
        if (current) {
          baseRevisionRef.current = current.revision;
          setRemoteContent(current.content);
          setShowRemoteCompare(true);
          setDraftConflictActive(true);
          setDraftStatus('conflict');
          setSaveMessage('원격 변경이 있어 자동 저장하지 않았습니다. 내용을 비교하세요.');
        } else {
          setDraftStatus('error');
          setDraftError('원격 변경 내용을 가져오지 못했습니다. 다시 시도하세요.');
        }
        pending.resolve(false);
      } else if (failure === 'lease' && pending.leaseRetryCount < MAX_LEASE_SAVE_RETRIES) {
        if (pendingSaveRef.current) {
          pending.resolve(false);
        } else {
          pendingSaveRef.current = {
            ...pending,
            leaseRetryCount: pending.leaseRetryCount + 1,
          };
        }
        clearMemoLease(pending.memoId);
        releaseLock();
        setDraftStatus(pending.draftStored ? 'lock-wait' : 'error');
        setSaveMessage('편집 잠금을 다시 확보한 뒤 자동으로 저장합니다.');
        saveRetryTimerRef.current = setTimeout(() => {
          saveRetryTimerRef.current = null;
          requestLock();
        }, 0);
      } else if (
        failure === 'retryable' &&
        pending.retryCount < MAX_AUTOMATIC_SAVE_RETRIES
      ) {
        const nextPending = { ...pending, retryCount: pending.retryCount + 1 };
        if (pendingSaveRef.current) {
          pending.resolve(false);
        } else {
          pendingSaveRef.current = nextPending;
        }
        const delay = retryDelayMs(pending.retryCount);
        setDraftStatus(pending.draftStored ? 'retrying' : 'error');
        setSaveMessage(
          pending.draftStored
            ? '서버 저장 재시도 중 · 기기 초안 보관됨'
            : '서버 저장 재시도 중 · 기기 임시저장 실패로 내용 복사가 필요합니다.',
        );
        saveRetryTimerRef.current = setTimeout(() => {
          saveRetryTimerRef.current = null;
          resumePendingSaveRef.current();
        }, delay);
      } else {
        const queued = pendingSaveRef.current as PendingMemoSave | null;
        queued?.resolve(false);
        pendingSaveRef.current = null;
        setDraftStatus('error');
        const message = error instanceof Error ? error.message : '서버에 저장하지 못했습니다.';
        setDraftError(message);
        setSaveMessage(`서버 저장 실패: ${message}`);
        pending.resolve(false);
      }
    } finally {
      saveInFlightRef.current = false;
      if (pendingSaveRef.current && !saveRetryTimerRef.current) {
        // 다음 task에서 최신 callback과 synchronous ownership gate로만 이어 간다.
        window.setTimeout(() => resumePendingSaveRef.current(), 0);
      }
    }
  }, [
    broadcastUpdate,
    draftConflictActive,
    flushDraft,
    hasCurrentLease,
    isLockedByOther,
    isViewingVersion,
    leaseState,
    ownDraftKey,
    releaseLock,
    requestLock,
    selectedMemo,
    updateMemo,
  ]);

  useEffect(() => {
    resumePendingSaveRef.current = () => {
      void processPendingSave();
    };
  }, [processPendingSave]);

  useEffect(() => {
    if (leaseState === 'ready') resumePendingSaveRef.current();
  }, [leaseState]);

  useEffect(() => {
    if (!isConnected) return;
    resumePendingSaveRef.current();
  }, [isConnected]);

  useEffect(() => {
    const resume = () => {
      if (saveRetryTimerRef.current) {
        clearTimeout(saveRetryTimerRef.current);
        saveRetryTimerRef.current = null;
      }
      resumePendingSaveRef.current();
    };
    const visible = () => {
      if (document.visibilityState === 'visible') resume();
    };
    window.addEventListener('online', resume);
    document.addEventListener('visibilitychange', visible);
    return () => {
      window.removeEventListener('online', resume);
      document.removeEventListener('visibilitychange', visible);
    };
  }, []);

  const queueMemoSave = useCallback(
    async (nextContent: string, allowConflict = false): Promise<boolean> => {
      if (!selectedMemo) return false;
      if (isViewingVersion) {
        setSaveMessage('과거 버전은 읽기 전용입니다. 현재 문서로 돌아온 뒤 저장하세요.');
        return false;
      }
      if (draftConflictActive && !allowConflict) {
        setDraftStatus('conflict');
        setSaveMessage('원격 변경을 비교한 뒤 저장 내용을 선택하세요.');
        return false;
      }
      if (nextContent === originalContentRef.current) return true;

      const snapshotLocalRevision = localRevisionRef.current;
      const draftStored = await flushDraft(nextContent, snapshotLocalRevision);

      return new Promise<boolean>((resolve) => {
        const existing = pendingSaveRef.current;
        if (existing) existing.resolve(false);
        pendingSaveRef.current = {
          memoId: selectedMemo.id,
          editorEpoch: editorEpochRef.current,
          content: nextContent,
          baseRevision: baseRevisionRef.current,
          localRevision: snapshotLocalRevision,
          retryCount: 0,
          leaseRetryCount: 0,
          allowConflict,
          draftStored,
          resolve,
        };
        if (leaseState !== 'ready' || isLockedByOther) {
          setDraftStatus(draftStored ? 'lock-wait' : 'error');
          setSaveMessage(
            draftStored
              ? '편집 잠금 대기 중 · 확보되면 자동 저장합니다.'
              : '기기 임시저장에 실패했습니다. 잠금 대기 중이며 내용 복사를 권장합니다.',
          );
          requestLock();
        }
        window.setTimeout(() => resumePendingSaveRef.current(), 0);
      });
    },
    [
      draftConflictActive,
      flushDraft,
      isLockedByOther,
      isViewingVersion,
      leaseState,
      requestLock,
      selectedMemo,
    ],
  );

  const handleSaveMemo = useCallback(
    async () => queueMemoSave(contentRef.current),
    [queueMemoSave],
  );

  // 게시 / 재게시 핸들러
  const handlePublish = useCallback(async () => {
    if (!selectedMemo) return;

    // 저장되지 않은 변경사항이 있으면 먼저 저장
    if (contentRef.current !== originalContentRef.current) {
      const saved = await handleSaveMemo();
      if (!saved) return;
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

      applyContentMutation(newContent);

      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
        }
      }, 0);
    },
    [applyContentMutation, selectedProject]
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
      if (isViewingVersion) return;
      if (!canEdit) {
        requestLock();
        return;
      }

      pendingScrollFractionRef.current = scrollFractionOf(inlineScrollRef.current);
      pendingRawSelectionRef.current = selection;
      rawModeReasonRef.current = 'selection';
      rawModeRef.current = true;
      setRawMode(true);
      setShowMemoSearch(false);
      setSearchQuery('');
      holdLock();
    },
    [canEdit, holdLock, isViewingVersion, requestLock],
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

    if (next && isViewingVersion) return;
    if (next && !canEdit) {
      requestLock();
      return;
    }

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
  }, [canEdit, holdLock, isViewingVersion, requestLock, scheduleLockRelease]);

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

      if (isViewingVersion) return;

      // 다른 사용자가 편집 중이면 열지 않음
      if (!canEdit) {
        pendingEditOffsetRef.current = contentRef.current.length;
        requestLock();
        return;
      }

      // preventDefault 하지 않는다 — 마지막 라인에 포커스만 먼저 옮기고
      // 입력 자체는 브라우저에 맡긴다 (수동 append 로 인한 IME 이중 입력 제거).
      holdLock();
      inlineEditorRef.current?.focusLastLine();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [
    canEdit,
    handleSaveMemo,
    holdLock,
    isViewingVersion,
    rawMode,
    requestLock,
    toggleRawMode,
  ]);

  const handleRawContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    const cursorPos = e.target.selectionStart;

    applyContentMutation(newContent);

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
      holdLock();
      handleMentionKeyDown(e);
    },
    [handleMentionKeyDown, holdLock]
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
      isEditingRef.current = editing;
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
      if (isViewingVersion) {
        setSaveMessage('과거 버전은 읽기 전용입니다.');
        return;
      }
      await queueMemoSave(next);
    },
    [isViewingVersion, queueMemoSave]
  );

  const handleInlineChange = useCallback(
    (next: string) => applyContentMutation(next),
    [applyContentMutation],
  );

  const handleReadOnlyEditIntent = useCallback(
    (documentOffset: number) => {
      if (isViewingVersion) return;
      pendingEditOffsetRef.current = documentOffset;
      requestLock();
    },
    [isViewingVersion, requestLock],
  );

  const handleReadOnlyCodeEditIntent = useCallback(() => {
    if (isViewingVersion) return;
    pendingEditOffsetRef.current = null;
    requestLock();
  }, [isViewingVersion, requestLock]);

  const handleReadOnlyCheckboxIntent = useCallback(() => {
    if (isViewingVersion) return;
    pendingEditOffsetRef.current = null;
    holdLock();
  }, [holdLock, isViewingVersion]);

  const moveToNextIssue = useCallback(
    async (resolvedIssue: SyncIssueInterface) => {
      const currentIndex = issues.findIndex((item) => item.id === resolvedIssue.id);
      const next = [
        ...issues.slice(currentIndex + 1),
        ...issues.slice(0, Math.max(0, currentIndex)),
      ].find(
        (item) =>
          item.id !== resolvedIssue.id &&
          item.refTable === 'memos' &&
          (item.kind === 'conflict' || item.kind === 'duplicate_memo'),
      );
      if (!next) return;
      const nextMemoId = next.refId ?? next.peerRefId;
      if (!nextMemoId) return;
      try {
        const nextMemo = await getMemo(nextMemoId);
        if (selectedProject?.id !== nextMemo.projectId) {
          const project =
            projects.find((item) => item.id === nextMemo.projectId) ??
            (await getAllProjects()).find((item) => item.id === nextMemo.projectId);
          if (!project) return;
          await selectProject(project);
        }
        await selectMemo(nextMemo);
      } catch {
        // 다음 이슈가 현재 사용자의 프로젝트 범위를 벗어나거나 병합으로 사라졌다면
        // 새로고침된 이슈 목록에서 사용자가 다음 항목을 선택할 수 있다.
      }
    },
    [issues, projects, selectMemo, selectProject, selectedProject],
  );

  const cleanupDraftConflictSource = useCallback(async (
    action: DraftDismissalAction,
    acceptedServerRevision: string | null,
  ) => {
    const source = draftConflictSourceRef.current;
    if (!source) return;
    const currentKey = selectedMemo ? ownDraftKey(selectedMemo.id) : null;
    const sourceLineage = currentKey
      ? sourceLineageForDraft(source, currentKey)
      : null;
    if (currentKey && source.key === currentKey) {
      await deleteMemoDraftIfRevision(source.key, source.localRevision);
    }
    if (sourceLineage) {
      await putMemoDraftDismissal({
        key: makeDraftDismissalKey(sourceLineage.sourceKey),
        sourceKey: sourceLineage.sourceKey,
        sourceLocalRevision: sourceLineage.sourceLocalRevision,
        acceptedServerRevision,
        origin: sourceLineage.origin,
        userId: sourceLineage.userId,
        memoId: sourceLineage.memoId,
        action,
        createdAt: Date.now(),
      });
    }
    draftConflictSourceRef.current = null;
  }, [ownDraftKey, selectedMemo]);

  const cleanupOwnDraft = useCallback(async () => {
    if (!selectedMemo) return;
    const key = ownDraftKey(selectedMemo.id);
    if (!key) return;
    const stored = await loadMemoDraft(key);
    if (stored) await deleteMemoDraftIfRevision(key, stored.localRevision);
    setDraftStatus('idle');
    setDraftError(null);
  }, [ownDraftKey, selectedMemo]);

  const handleResolveOnly = useCallback(async (winnerContent: string) => {
    if (actionableIssue) {
      setContent(winnerContent);
      contentRef.current = winnerContent;
      setOriginalContent(winnerContent);
      originalContentRef.current = winnerContent;
      setRemoteContent(null);
      await cleanupOwnDraft();
      await resolveIssues([actionableIssue.id]);
      await moveToNextIssue(actionableIssue);
      return;
    }
    if (remoteContent !== null) {
      // 원격 변경보다 현재 버퍼를 선택했으므로 실제 서버 메모에도 그 선택을 기록한다.
      const saved = await queueMemoSave(winnerContent, true);
      if (!saved) throw new Error('서버 저장을 완료하지 못했습니다. 기기 초안은 보존됩니다.');
      setContent(winnerContent);
      contentRef.current = winnerContent;
      setRemoteContent(null);
      setShowRemoteCompare(false);
      setDraftConflictActive(false);
      await cleanupDraftConflictSource('saved', baseRevisionRef.current ?? null);
    }
  }, [
    actionableIssue,
    cleanupDraftConflictSource,
    cleanupOwnDraft,
    moveToNextIssue,
    queueMemoSave,
    remoteContent,
    resolveIssues,
  ]);

  const handleSaveResolved = useCallback(
    async (nextContent: string) => {
      if (!selectedMemo) return;
      if (!actionableIssue && remoteContent !== null && nextContent === remoteContent) {
        const requestMemoId = selectedMemo.id;
        const requestEditorEpoch = editorEpochRef.current;
        const fresh = await getMemo(requestMemoId);
        if (
          !isCurrentEditorRequest({
            expectedMemoId: requestMemoId,
            expectedEpoch: requestEditorEpoch,
            currentMemoId: initializedMemoIdRef.current,
            currentEpoch: editorEpochRef.current,
          })
        ) return;
        if (!canAdoptFetchedRemote(nextContent, fresh.content)) {
          setRemoteContent(fresh.content);
          setDraftStatus('conflict');
          throw new Error('선택하는 동안 서버 내용이 다시 변경되었습니다. 최신 내용을 비교하세요.');
        }
        baseRevisionRef.current = fresh.revision;
        setContent(nextContent);
        contentRef.current = nextContent;
        setOriginalContent(nextContent);
        originalContentRef.current = nextContent;
        setRemoteContent(null);
        setShowRemoteCompare(false);
        setDraftConflictActive(false);
        const key = ownDraftKey(selectedMemo.id);
        if (key) {
          const stored = await loadMemoDraft(key);
          if (stored) await deleteMemoDraftIfRevision(key, stored.localRevision);
        }
        await cleanupDraftConflictSource('remote', fresh.revision ?? null);
        setDraftStatus('idle');
        await refreshCurrentProject();
        return;
      }

      const saved = await queueMemoSave(nextContent, true);
      if (!saved) throw new Error('서버 저장을 완료하지 못했습니다. 기기 초안은 보존됩니다.');
      setContent(nextContent);
      contentRef.current = nextContent;
      setRemoteContent(null);
      setShowRemoteCompare(false);
      setDraftConflictActive(false);
      await cleanupDraftConflictSource('saved', baseRevisionRef.current ?? null);
      if (actionableIssue) {
        await resolveIssues([actionableIssue.id]);
        await moveToNextIssue(actionableIssue);
      }
    },
    [
      actionableIssue,
      cleanupDraftConflictSource,
      moveToNextIssue,
      ownDraftKey,
      queueMemoSave,
      remoteContent,
      refreshCurrentProject,
      resolveIssues,
      selectedMemo,
    ],
  );

  const handleMergeMemo = useCallback(
    async (loserId: string, winnerId: string) => {
      if (!selectedProject || !canMerge) {
        throw new Error('오프라인 상태에서는 병합할 수 없습니다. 온라인에서 다시 시도하세요.');
      }
      const result = await mergeMemo(loserId, winnerId);
      const winner = result.pullRequested
        ? await waitForMemoMergeApplied(
            selectedProject.id,
            loserId,
            winnerId,
          )
        : await getMemo(winnerId);
      await refreshSync();
      await selectProject(selectedProject);
      await selectMemo(winner);
    },
    [canMerge, refreshSync, selectMemo, selectProject, selectedProject],
  );

  const handleRecoverDraft = useCallback(async () => {
    if (!recoveryDraft) return;
    const currentKey = selectedMemo ? ownDraftKey(selectedMemo.id) : null;
    const previousRecoveredSource = recoveredDraftSourceRef.current;
    recoveredDraftSourceRef.current = currentKey &&
      sourceLineageForDraft(recoveryDraft, currentKey)
        ? recoveryDraft
        : null;
    localRevisionRef.current = Math.max(
      localRevisionRef.current,
      recoveryDraft.localRevision,
    );
    applyContentMutation(recoveryDraft.draftContent);
    const recoveredRevision = localRevisionRef.current;
    const copied = await flushDraft(recoveryDraft.draftContent, recoveredRevision);
    if (!copied) {
      recoveredDraftSourceRef.current = previousRecoveredSource;
      return;
    }
    setRecoveryDraft(null);
    setDraftStatus('local-saved');
    setSaveMessage('기기 초안을 복구했습니다. 서버 저장 전까지 이 기기에 보관됩니다.');
  }, [applyContentMutation, flushDraft, ownDraftKey, recoveryDraft, selectedMemo]);

  const handleDiscardDraft = useCallback(async () => {
    if (!recoveryDraft) return;
    const currentKey = selectedMemo ? ownDraftKey(selectedMemo.id) : null;
    const sourceLineage = currentKey
      ? sourceLineageForDraft(recoveryDraft, currentKey)
      : null;
    if (currentKey && recoveryDraft.key === currentKey) {
      await deleteMemoDraftIfRevision(recoveryDraft.key, recoveryDraft.localRevision);
    }
    if (sourceLineage) {
      await putMemoDraftDismissal({
        key: makeDraftDismissalKey(sourceLineage.sourceKey),
        sourceKey: sourceLineage.sourceKey,
        sourceLocalRevision: sourceLineage.sourceLocalRevision,
        acceptedServerRevision: baseRevisionRef.current ?? null,
        origin: sourceLineage.origin,
        userId: sourceLineage.userId,
        memoId: sourceLineage.memoId,
        action: 'discard',
        createdAt: Date.now(),
      });
    }
    setRecoveryDraft(null);
    setDraftStatus('idle');
    setDraftError(null);
  }, [ownDraftKey, recoveryDraft, selectedMemo]);

  const handleRetrySave = useCallback(() => {
    if (contentRef.current === originalContentRef.current) {
      void flushDraft();
      return;
    }
    void queueMemoSave(contentRef.current);
  }, [flushDraft, queueMemoSave]);

  const handleCopyDraft = useCallback(async (draftContent?: string) => {
    try {
      await navigator.clipboard.writeText(draftContent ?? contentRef.current);
      setSaveMessage('현재 메모 내용을 클립보드에 복사했습니다.');
    } catch {
      setSaveMessage('자동 복사에 실패했습니다. Raw 모드에서 전체 내용을 복사하세요.');
    }
  }, []);

  const failedDraftWarnings = failedDraftSnapshots.map((snapshot) => (
    <section
      key={snapshot.memoId}
      className="memo-draft-banner memo-draft-error"
      aria-live="assertive"
    >
      <div>
        <strong>이전 메모 임시저장 실패 · {snapshot.title}</strong>
        <span>{snapshot.error}</span>
      </div>
      <div className="memo-draft-actions">
        <button type="button" onClick={() => void handleCopyDraft(snapshot.content)}>
          이전 내용 복사
        </button>
        <button
          type="button"
          onClick={() =>
            setFailedDraftSnapshots((current) =>
              current.filter((item) => item.memoId !== snapshot.memoId),
            )
          }
        >
          닫기
        </button>
      </div>
    </section>
  ));

  if (!selectedProject || !selectedMemo) {
    return <div className="detail memo-draft-failure-surface">{failedDraftWarnings}</div>;
  }

  const isDirty = content !== originalContent;

  const draftStatusLabel =
    draftStatus === 'local-saved'
      ? '이 기기에 임시 저장됨'
      : draftStatus === 'lock-wait'
        ? '편집 잠금 대기 · 기기 초안 보관 중'
        : draftStatus === 'retrying'
          ? '서버 저장 재시도 중 · 기기 초안 보관됨'
          : draftStatus === 'conflict'
            ? '원격 변경 비교 필요 · 자동 저장 중지'
            : draftStatus === 'error'
              ? '임시저장 또는 서버 저장 실패'
              : null;

  const statusItems = (
    <div className="memo-editor-toolbar-status" aria-live="polite">
      {isDirty && (
        <span className="memo-toolbar-unsaved">
          • {isViewingVersion ? '현재 편집본 저장 안됨' : '저장 안됨'}
        </span>
      )}
      {lockMessage && <span className="memo-toolbar-lock">{lockMessage}</span>}
      {saveMessage && (
        <span className="memo-toolbar-save-message">{saveMessage}</span>
      )}
      {publishMessage && (
        <span className="memo-toolbar-publish-message">{publishMessage}</span>
      )}
    </div>
  );

  const publishActions = isAdmin && features.articles && (
    <>
      <button
        type="button"
        onClick={handlePublish}
        disabled={isPublishing}
        className="memo-toolbar-publish todo-action-button"
      >
        {isPublishing ? '게시 중...' : articleStatus ? `재게시 (v${articleStatus.publishedVersion})` : '게시'}
      </button>
      {articleStatus && (
        <button
          type="button"
          onClick={handleUnpublish}
          disabled={isPublishing}
          className="memo-toolbar-unpublish todo-action-button todo-action-button--secondary"
        >
          {isPublishing ? '처리 중...' : '게시 취소'}
        </button>
      )}
    </>
  );

  return (
    <main className="detail min-h-0">
      <div className="h-full flex flex-col min-h-0">
        {isMobile ? (
          // 모바일 앱바 — 물리 키보드가 없으므로 저장은 버튼이 유일한 경로다.
          <div className="memo-mobile-bar">
            <button
              type="button"
              className="memo-mobile-back todo-action-button todo-action-button--secondary"
              onClick={() => window.dispatchEvent(new Event(SHOW_MEMO_LIST_EVENT))}
            >
              ← 목록
            </button>
            {statusItems}
            <div className="memo-mobile-actions">
              {publishActions}
              <button
                type="button"
                className="memo-mobile-save todo-action-button"
                onClick={() => void handleSaveMemo()}
                disabled={!isDirty || isViewingVersion}
              >
                저장
              </button>
            </div>
          </div>
        ) : (
          headerSlot &&
          createPortal(
            <div className="memo-status-bar">
              {statusItems}
              <div className="memo-editor-toolbar-actions">
                {isViewingVersion ? (
                  <span className="memo-toolbar-readonly">과거 버전 · 읽기 전용</span>
                ) : (
                  <span className="memo-toolbar-shortcut">
                    {typeof navigator !== 'undefined' && navigator.platform.includes('Mac') ? '⌘S' : 'Ctrl+S'}로 저장
                  </span>
                )}
                {rawMode && (
                  <span className="memo-toolbar-raw">
                    RAW 모드 · {typeof navigator !== 'undefined' && navigator.platform.includes('Mac') ? '⌘E' : 'Ctrl+E'}로 종료
                  </span>
                )}
                {publishActions}
              </div>
            </div>,
            headerSlot,
          )
        )}

        <button
          type="button"
          onClick={() => setShowHelpModal(true)}
          className="memo-help-fab todo-action-button fixed bottom-4 right-4 z-40 flex h-12 w-12 items-center justify-center text-lg font-bold shadow-lg"
          aria-label="에디터 도움말 열기"
          title="에디터 도움말"
        >
          ?
        </button>

        {features.memoVersionHistory &&
          !actionableIssue &&
          !(showRemoteCompare && remoteContent !== null) && (
            <MemoVersionBar
              memoId={selectedMemo.id}
              currentUpdatedAt={selectedMemo.updatedAtUtc ?? selectedMemo.updatedAt}
              refreshKey={selectedMemo.updatedAtUtc ?? String(selectedMemo.updatedAt)}
              selectedVersion={viewedVersion}
              onSelect={handleVersionSelect}
            />
          )}

        {failedDraftWarnings}

        {recoveryDraft && (
          <section className="memo-draft-banner memo-draft-recovery" aria-live="polite">
            <div>
              <strong>저장되지 않은 기기 초안이 있습니다</strong>
              <span>
                {new Date(recoveryDraft.updatedAt).toLocaleString()}에 보존된 초안입니다.
                서버 내용은 사용자가 선택하기 전까지 바꾸지 않습니다.
              </span>
            </div>
            <div className="memo-draft-actions">
              <button type="button" onClick={() => void handleRecoverDraft()}>복구</button>
              <button type="button" onClick={() => void handleDiscardDraft()}>폐기</button>
            </div>
          </section>
        )}

        {!recoveryDraft && draftStatusLabel && (
          <section
            className={`memo-draft-banner memo-draft-${draftStatus}`}
            aria-live="polite"
          >
            <div>
              <strong>{draftStatusLabel}</strong>
              {draftError && <span>{draftError}</span>}
            </div>
            {(draftStatus === 'error' || draftStatus === 'lock-wait') && (
              <div className="memo-draft-actions">
                <button type="button" onClick={handleRetrySave}>다시 시도</button>
                {draftStatus === 'error' && (
                  <button type="button" onClick={() => void handleCopyDraft()}>내용 복사</button>
                )}
              </div>
            )}
          </section>
        )}

        <div
          className={`memo-editor-shell${
            remoteContent !== null && !showRemoteCompare
              ? ' has-remote-banner'
              : ''
          }`}
        >
          {remoteContent !== null && !showRemoteCompare && (
            <button
              type="button"
              className="remote-update-banner"
              onClick={() => setShowRemoteCompare(true)}
            >
              원격에서 이 메모가 변경됨 — 비교
            </button>
          )}
          {(actionableIssue || (showRemoteCompare && remoteContent !== null)) ? (
            <MemoResolutionPanel
              key={actionableIssue?.id ?? `remote-${selectedMemo.id}`}
              memo={selectedMemo}
              currentContent={content}
              issue={actionableIssue}
              remoteContent={remoteContent !== null ? remoteContent : undefined}
              manualSeed={
                content !== originalContent
                  ? content
                  : remoteContent ?? content
              }
              hasDirtyBuffer={content !== originalContent}
              canWrite={canEdit}
              mergeLocked={!canMerge}
              onKeepCurrent={handleResolveOnly}
              onSaveResolved={handleSaveResolved}
              onMerge={handleMergeMemo}
              onEditingStart={holdLock}
              onEditingEnd={scheduleLockRelease}
              onRequestWrite={requestLock}
              onClose={
                !actionableIssue && !draftConflictActive
                  ? () => setShowRemoteCompare(false)
                  : undefined
              }
              compareTitle={draftConflictActive ? '기기 초안과 원격 변경 비교' : undefined}
              leftTitle={draftConflictActive ? '이 기기에 보존된 초안' : undefined}
              rightTitle={draftConflictActive ? '현재 서버 내용' : undefined}
              onManualChange={applyContentMutation}
            />
          ) : rawMode ? (
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
                onFocus={holdLock}
                onBlur={scheduleLockRelease}
                disabled={!canEdit}
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
                key={
                  viewedVersion
                    ? `${selectedMemo.id}-version-${viewedVersion.version}`
                    : `${selectedMemo.id}-current`
                }
                ref={inlineEditorRef}
                value={viewedVersion?.content ?? content}
                onChange={handleInlineChange}
                onPersist={handlePersist}
                onSave={handleSaveMemo}
                onEditingChange={handleEditingChange}
                onMentionChange={handleMentionChange}
                onSelectAll={handleSelectAll}
                onSelectRange={handleSelectRange}
                mentionActive={showMemoSearch}
                onMentionKeyDown={handleMentionKeyDown}
                readOnly={!canEdit}
                onReadOnlyEditIntent={
                  isViewingVersion ? undefined : handleReadOnlyEditIntent
                }
                onReadOnlyCodeEditIntent={
                  isViewingVersion ? undefined : handleReadOnlyCodeEditIntent
                }
                onReadOnlyCheckboxIntent={
                  isViewingVersion ? undefined : handleReadOnlyCheckboxIntent
                }
              />
            </div>
          )}
          {((leaseState === 'pending' && pendingOverlayVisible) ||
            leaseState === 'denied') &&
            !actionableIssue &&
            !showRemoteCompare &&
            !isViewingVersion && (
              <div className={`memo-lease-overlay memo-lease-${leaseState}`}>
                <strong>
                  {leaseState === 'pending'
                    ? '편집 잠금을 확인하는 중입니다'
                    : isConnected
                      ? '이 메모는 지금 편집할 수 없습니다'
                      : '실시간 편집 서버에 연결되지 않았습니다'}
                </strong>
                <span>
                  {lockHolder
                    ? lockHolder.userId === 'access-denied' ||
                      lockHolder.userId === 'lock-unavailable'
                      ? lockHolder.displayName
                      : `${lockHolder.displayName}님이 수정 중입니다.`
                    : '입력과 저장은 안전한 편집 잠금을 확보한 뒤 사용할 수 있습니다.'}
                </span>
                <button type="button" onClick={retryLock}>
                  다시 시도
                </button>
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
