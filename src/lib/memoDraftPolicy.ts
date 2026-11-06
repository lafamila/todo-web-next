export type MemoRevision = string | null;

export interface MemoDraftRecord {
  key: string;
  origin: string;
  userId: string;
  memoId: string;
  tabId: string;
  baseRevision: MemoRevision;
  baseContent: string;
  draftContent: string;
  localRevision: number;
  createdAt: number;
  updatedAt: number;
  retryCount: number;
  lastError: string | null;
  sourceLineage?: MemoDraftSourceLineage;
}

export interface MemoDraftSourceLineage {
  sourceKey: string;
  sourceLocalRevision: number;
  origin: string;
  userId: string;
  memoId: string;
}

export type DraftDismissalAction = 'discard' | 'remote' | 'saved';

export interface MemoDraftDismissalRecord {
  key: string;
  sourceKey: string;
  sourceLocalRevision: number;
  acceptedServerRevision: MemoRevision;
  origin: string;
  userId: string;
  memoId: string;
  action: DraftDismissalAction;
  createdAt: number;
}

export type DraftRecoveryDecision = 'cleanup' | 'offer-recovery' | 'compare';

export function makeMemoDraftKey(
  origin: string,
  userId: string,
  memoId: string,
  tabId: string,
): string {
  return [origin, userId, memoId, tabId].map(encodeURIComponent).join('|');
}

export function makeDraftDismissalKey(sourceKey: string): string {
  return `dismissed|${sourceKey}`;
}

export function evaluateDraftDismissals(
  drafts: MemoDraftRecord[],
  dismissals: MemoDraftDismissalRecord[],
  currentServerRevision: MemoRevision,
): { candidates: MemoDraftRecord[]; staleDismissalKeys: string[] } {
  // Kept in the signature for recovery-call compatibility; an explicit local
  // decision remains valid when only the server revision advances.
  void currentServerRevision;
  const draftsByKey = new Map(drafts.map((draft) => [draft.key, draft]));
  const activeDismissals = new Map<string, MemoDraftDismissalRecord>();
  const staleDismissalKeys: string[] = [];

  for (const dismissal of dismissals) {
    const source = draftsByKey.get(dismissal.sourceKey);
    // Missing rows keep their retirement watermark: a put that started before
    // the user's decision may still land later. A genuinely newer revision for
    // the same key invalidates the watermark and becomes a candidate again.
    const valid = !source || source.localRevision <= dismissal.sourceLocalRevision;
    if (valid) activeDismissals.set(dismissal.sourceKey, dismissal);
    else staleDismissalKeys.push(dismissal.key);
  }

  return {
    candidates: drafts.filter((draft) => !activeDismissals.has(draft.key)),
    staleDismissalKeys,
  };
}

/** 원격 채택/버전 복원 뒤에는 그 전에 출발한 비동기 저장·GET 결과를 적용하지 않는다. */
export function isCurrentResolutionGeneration(
  expectedGeneration: number,
  currentGeneration: number,
): boolean {
  return expectedGeneration === currentGeneration;
}

export function enqueueFailedDraftSnapshot<T extends { memoId: string }>(
  queue: T[],
  next: T,
): T[] {
  return [...queue.filter((item) => item.memoId !== next.memoId), next];
}

export function sourceLineageForDraft(
  draft: MemoDraftRecord | null,
  ownKey: string,
): MemoDraftSourceLineage | null {
  if (!draft) return null;
  if (draft.sourceLineage) return draft.sourceLineage;
  if (draft.key === ownKey) return null;
  return {
    sourceKey: draft.key,
    sourceLocalRevision: draft.localRevision,
    origin: draft.origin,
    userId: draft.userId,
    memoId: draft.memoId,
  };
}

export interface DraftDismissalSource {
  sourceKey: string;
  sourceLocalRevision: number;
  origin: string;
  userId: string;
  memoId: string;
}

/** 선택한 복구본 자체와 그 조상 source를 모두 exact revision으로 해소한다. */
export function dismissalSourcesForDraft(
  draft: MemoDraftRecord,
  ownKey: string,
): DraftDismissalSource[] {
  const selected: DraftDismissalSource = {
    sourceKey: draft.key,
    sourceLocalRevision: draft.localRevision,
    origin: draft.origin,
    userId: draft.userId,
    memoId: draft.memoId,
  };
  const lineage = sourceLineageForDraft(draft, ownKey);
  const validLineage = lineage &&
    lineage.origin === draft.origin &&
    lineage.userId === draft.userId &&
    lineage.memoId === draft.memoId;
  if (!validLineage || (
    lineage.sourceKey === selected.sourceKey &&
    lineage.sourceLocalRevision === selected.sourceLocalRevision
  )) return [selected];
  return [selected, lineage];
}

export function createDraftPageId(randomId: () => string): string {
  return randomId();
}

let lastDraftRevision = 0;

/** page 전체·전 메모에서 증가하는 안전 정수 revision. memo 전환으로 0에 되감기지 않는다. */
export function nextDraftRevision(floor = 0, now = Date.now()): number {
  lastDraftRevision = Math.max(lastDraftRevision + 1, floor + 1, now * 1_000);
  return lastDraftRevision;
}

export function decideDraftRecovery(
  draft: Pick<MemoDraftRecord, 'draftContent' | 'baseContent' | 'baseRevision'>,
  remoteContent: string,
  remoteRevision: MemoRevision,
): DraftRecoveryDecision {
  if (draft.draftContent === remoteContent) return 'cleanup';

  const revisionMatches =
    draft.baseRevision !== null &&
    remoteRevision !== null &&
    draft.baseRevision === remoteRevision;
  // 구버전 API처럼 revision이 없으면 base 본문 자체가 같은지로 안전하게 판단한다.
  const contentMatches = draft.baseContent === remoteContent;
  return revisionMatches || contentMatches ? 'offer-recovery' : 'compare';
}

export function shouldDeleteDraftAfterSave(
  storedLocalRevision: number | null,
  savedLocalRevision: number,
): boolean {
  return storedLocalRevision === savedLocalRevision;
}

export function shouldAcceptDraftWrite(
  storedLocalRevision: number | null,
  incomingLocalRevision: number,
  retiredLocalRevision: number | null = null,
): boolean {
  return (retiredLocalRevision === null || incomingLocalRevision > retiredLocalRevision) &&
    (storedLocalRevision === null || storedLocalRevision <= incomingLocalRevision);
}

/** 현재 탭 record를 우선하고, 없을 때만 updatedAt 내림차순 목록의 최신 타 탭 후보를 쓴다. */
export function selectDraftCandidate(
  drafts: MemoDraftRecord[],
  currentKey: string,
): MemoDraftRecord | null {
  return drafts.find((draft) => draft.key === currentKey) ?? drafts[0] ?? null;
}

export function rebaseQueuedSaveRevision<T extends {
  memoId: string;
  baseRevision?: string;
}>(queued: T | null, savedMemoId: string, savedRevision?: string): T | null {
  if (!queued || queued.memoId !== savedMemoId || !savedRevision) return queued;
  return { ...queued, baseRevision: savedRevision };
}

export function canAdoptFetchedRemote(
  selectedRemoteContent: string,
  fetchedRemoteContent: string,
): boolean {
  return selectedRemoteContent === fetchedRemoteContent;
}

export function isCurrentEditorRequest(input: {
  expectedMemoId: string;
  expectedEpoch: number;
  currentMemoId: string | null;
  currentEpoch: number;
}): boolean {
  return (
    input.expectedMemoId === input.currentMemoId &&
    input.expectedEpoch === input.currentEpoch
  );
}

export type RemoteRefreshDecision = 'ignore' | 'adopt' | 'compare';

export function decideRemoteRefreshAfterFetch(input: {
  isCurrentRequest: boolean;
  hasDirtyBuffer: boolean;
}): RemoteRefreshDecision {
  if (!input.isCurrentRequest) return 'ignore';
  return input.hasDirtyBuffer ? 'compare' : 'adopt';
}

export function isLatestRemoteRefreshRequest(
  requestSequence: number,
  latestSequence: number,
): boolean {
  return requestSequence === latestSequence;
}

export type SaveFailureKind = 'lease' | 'conflict' | 'retryable' | 'terminal';

interface ErrorLike {
  status?: number;
  code?: string;
}

export function classifySaveFailure(error: unknown): SaveFailureKind {
  const candidate = error as ErrorLike | null;
  const status = candidate?.status;
  const code = candidate?.code;

  if (status === 409 && code === 'memo_content_conflict') return 'conflict';
  if (status === 409 && code === 'memo_lease_required') return 'lease';
  if (status === 401 || status === 403 || status === 404) return 'terminal';
  if (status === 502 || status === 503 || status === 504 || status === 429) {
    return 'retryable';
  }
  if (error instanceof TypeError || status === 0 || status === undefined) {
    return 'retryable';
  }
  return 'terminal';
}

export function shouldResumePendingSave(
  leaseState: 'idle' | 'pending' | 'ready' | 'denied',
  isLockedByOther: boolean,
): boolean {
  return leaseState === 'ready' && !isLockedByOther;
}

export const MAX_SAVE_RETRY_DELAY_MS = 30_000;

export function retryDelayMs(attempt: number, random = Math.random()): number {
  const base = Math.min(MAX_SAVE_RETRY_DELAY_MS, 1_000 * 2 ** Math.max(0, attempt));
  // 0.75~1.25 jitter. 상한은 반드시 고정해 탭이 오래 멈춰 있지 않게 한다.
  return Math.min(
    MAX_SAVE_RETRY_DELAY_MS,
    Math.round(base * (0.75 + Math.max(0, Math.min(1, random)) * 0.5)),
  );
}
