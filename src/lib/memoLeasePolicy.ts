import type { MemoLeaseState } from "./types";

export interface LockRequestSnapshot {
  connected: boolean;
  ownsLock: boolean;
  currentMemoId: string | null;
  joinedMemoId: string | null;
  inFlightMemoId: string | null;
}

export const MAX_LOCK_RESPONSE_ATTEMPTS = 2;

export interface LockRetrySnapshot {
  connected: boolean;
  currentMemoId: string | null;
  joinedMemoId: string | null;
  memoId: string;
  attemptCount: number;
}

export interface JoinRetrySnapshot {
  connected: boolean;
  currentMemoId: string | null;
  joinedMemoId: string | null;
  memoId: string;
  attemptCount: number;
}

export interface ExplicitLeaseRetrySnapshot {
  hasSocket: boolean;
  connected: boolean;
  currentMemoId: string | null;
}

export type ExplicitLeaseRetryAction = "connect" | "rejoin";

export interface ExplicitLeaseRetryPlan {
  action: ExplicitLeaseRetryAction;
  memoId: string;
  next: {
    ownsLock: false;
    editIntent: true;
    joinedMemoId: null;
    joinRequestMemoId: string;
    lockRequestMemoId: null;
    accessDeniedMemoId: null;
    explicitRetryMemoId: string;
  };
}

export function shouldEmitLockRequest(snapshot: LockRequestSnapshot): boolean {
  return Boolean(
    snapshot.connected &&
      !snapshot.ownsLock &&
      snapshot.currentMemoId &&
      snapshot.joinedMemoId === snapshot.currentMemoId &&
      snapshot.inFlightMemoId !== snapshot.currentMemoId,
  );
}

/**
 * 사용자 재시도는 일반 편집 의도와 달리 끊긴 transport를 직접 다시 열고,
 * 연결 중이라도 joinMemo를 다시 보내 서버가 접근 권한과 room 상태를 재검증하게 한다.
 */
export function planExplicitLeaseRetry(
  snapshot: ExplicitLeaseRetrySnapshot,
): ExplicitLeaseRetryPlan | null {
  const memoId = snapshot.currentMemoId;
  if (!snapshot.hasSocket || !memoId) return null;
  return {
    action: snapshot.connected ? "rejoin" : "connect",
    memoId,
    next: {
      ownsLock: false,
      editIntent: true,
      joinedMemoId: null,
      joinRequestMemoId: memoId,
      lockRequestMemoId: null,
      accessDeniedMemoId: null,
      explicitRetryMemoId: memoId,
    },
  };
}

/** joinMemo 재검증 응답 뒤에는 holder 표시를 신뢰해 멈추지 않고 lockMemo를 보낸다.
 * 실제 쓰기 권한과 canonical owner 판정은 lockMemo 서버 핸들러가 다시 수행한다.
 */
export function shouldAcquireAfterExplicitRejoin(input: {
  retryMemoId: string | null;
  currentMemoId: string | null;
  statusMemoId: string;
}): boolean {
  return Boolean(
    input.retryMemoId &&
      input.retryMemoId === input.currentMemoId &&
      input.retryMemoId === input.statusMemoId,
  );
}

/**
 * 재시도가 room 재검증을 기다리는 사이 이전 lockMemo 응답이 도착할 수 있다.
 * 이 grant를 채택하면 뒤이어 온 lockStatus가 자기 락을 타인 락처럼 표시하므로,
 * fresh lockStatus 뒤 재발급되는 grant만 받는다.
 */
export function shouldDeferGrantUntilExplicitRejoin(input: {
  retryMemoId: string | null;
  joinedMemoId: string | null;
  grantedMemoId: string;
}): boolean {
  return Boolean(
    input.retryMemoId === input.grantedMemoId &&
      input.joinedMemoId !== input.grantedMemoId,
  );
}

/** 늦게 발화한 연결 watchdog이 새 메모나 새 재시도 transport를 끊지 않게 한다. */
export function shouldTerminateExplicitConnectionRetry(input: {
  timeoutMemoId: string;
  retryMemoId: string | null;
  currentMemoId: string | null;
}): boolean {
  return Boolean(
    input.timeoutMemoId === input.retryMemoId &&
      input.timeoutMemoId === input.currentMemoId,
  );
}

export function leaseStateWithoutOwnership(editIntent: boolean): MemoLeaseState {
  return editIntent ? "pending" : "idle";
}

export function leaseStateAfterConnectionLoss(
  editIntent: boolean,
): MemoLeaseState {
  return editIntent ? "denied" : "idle";
}

/** React render의 leaseState가 아직 ready여도 ref 소유권이 지워졌다면 PUT을 막는다. */
export function canSubmitMemoSave(input: {
  ownsLock: boolean;
  currentMemoId: string | null;
  expectedMemoId: string;
}): boolean {
  return input.ownsLock && input.currentMemoId === input.expectedMemoId;
}

export type LockDenialKind = "terminal" | "retryable" | "locked";

export function classifyLockDenial(displayName: string): LockDenialKind {
  if (displayName === "접근 권한 없음") return "terminal";
  if (displayName.startsWith("동기화 서버")) return "retryable";
  return "locked";
}

export function shouldRenewLease(
  connected: boolean,
  ownsLock: boolean,
  memoId: string | null,
): boolean {
  return connected && ownsLock && Boolean(memoId);
}

export function shouldRetryLockResponse(
  snapshot: LockRetrySnapshot,
): boolean {
  return Boolean(
    snapshot.connected &&
      snapshot.currentMemoId === snapshot.memoId &&
      snapshot.joinedMemoId === snapshot.memoId &&
      snapshot.attemptCount < MAX_LOCK_RESPONSE_ATTEMPTS,
  );
}

export function shouldRetryJoinResponse(
  snapshot: JoinRetrySnapshot,
): boolean {
  return Boolean(
    snapshot.connected &&
      snapshot.currentMemoId === snapshot.memoId &&
      snapshot.joinedMemoId !== snapshot.memoId &&
      snapshot.attemptCount < MAX_LOCK_RESPONSE_ATTEMPTS,
  );
}

/**
 * join watchdog가 재전송한 요청의 늦은 lockStatus는 이미 획득한 lease를
 * 자기 자신의 lockedBy snapshot으로 다시 denied 처리하면 안 된다.
 */
export function shouldAcceptJoinStatus(input: {
  currentMemoId: string | null;
  joinRequestMemoId: string | null;
  statusMemoId: string;
}): boolean {
  return Boolean(
    input.currentMemoId === input.statusMemoId &&
      input.joinRequestMemoId === input.statusMemoId,
  );
}

/** 취소되거나 다른 메모로 이동한 뒤 늦게 도착한 grant는 소유권으로 받아들이지 않는다. */
export function shouldAcceptLockGrant(
  currentMemoId: string | null,
  grantedMemoId: string,
  editIntent: boolean,
): boolean {
  return Boolean(editIntent && currentMemoId === grantedMemoId);
}

/** 다른 메모를 보던 사이 늦게 도착한 권한 회수 이벤트는 현재 문서를 숨기면 안 된다. */
export function isCurrentMemoAccessDenial(
  currentMemoId: string | null,
  deniedMemoId: string,
): boolean {
  return currentMemoId === deniedMemoId;
}
