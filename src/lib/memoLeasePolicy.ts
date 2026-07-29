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
