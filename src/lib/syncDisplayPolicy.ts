import type {
  SyncIssueInterface,
  SyncStatusInterface,
} from "./types";

export type SyncDisplayState =
  | "local"
  | "online"
  | "offline"
  | "paused"
  | "blocked"
  | "server";

export interface SyncDisplaySnapshot {
  status: SyncStatusInterface | null;
  browserOnline: boolean;
  requestFailed: boolean;
  issues: SyncIssueInterface[];
}

const isBlockingIssue = (issue: SyncIssueInterface) =>
  issue.kind === "identity" ||
  issue.kind === "schema" ||
  issue.kind === "clock";

export function hasBlockingSyncIssue(
  status: SyncStatusInterface,
  issues: SyncIssueInterface[],
): boolean {
  return (
    Boolean(status.lastError) ||
    issues.some(isBlockingIssue) ||
    (status.issues.identity ?? 0) +
      (status.issues.schema ?? 0) +
      (status.issues.clock ?? 0) >
      0
  );
}

export function getSyncDisplayState(
  snapshot: SyncDisplaySnapshot,
): SyncDisplayState {
  const { status, browserOnline, requestFailed, issues } = snapshot;
  if (!status || requestFailed) return "offline";
  if (!status.enabled) return "local";
  if (status.paused) return "paused";
  if (hasBlockingSyncIssue(status, issues)) return "blocked";
  if (status.role === "server") return "server";
  if (status.role === "client" && browserOnline && status.online) {
    return "online";
  }
  return "offline";
}

export function isClientSyncOnline(
  status: SyncStatusInterface | null,
  browserOnline: boolean,
  requestFailed: boolean,
): boolean {
  return Boolean(
    status?.enabled &&
      status.role === "client" &&
      browserOnline &&
      !requestFailed &&
      status.online,
  );
}

export function canMergeForSyncStatus(
  status: SyncStatusInterface | null,
  clientOnline: boolean,
  requestFailed: boolean,
): boolean {
  return Boolean(
    status &&
      !requestFailed &&
      status.mergeLocked === false &&
      (status.role !== "client" || clientOnline),
  );
}
