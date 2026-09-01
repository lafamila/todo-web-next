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

export function shouldEmitLockRequest(snapshot: LockRequestSnapshot): boolean {
  return Boolean(
    snapshot.connected &&
      !snapshot.ownsLock &&
      snapshot.currentMemoId &&
      snapshot.joinedMemoId === snapshot.currentMemoId &&
      snapshot.inFlightMemoId !== snapshot.currentMemoId,
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

/** 취소되거나 다른 메모로 이동한 뒤 늦게 도착한 grant는 소유권으로 받아들이지 않는다. */
export function shouldAcceptLockGrant(
  currentMemoId: string | null,
  grantedMemoId: string,
  editIntent: boolean,
): boolean {
  return Boolean(editIntent && currentMemoId === grantedMemoId);
}
