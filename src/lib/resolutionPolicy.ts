export interface SaveShortcutSnapshot {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
}

export function isSaveShortcut(snapshot: SaveShortcutSnapshot): boolean {
  return (
    (snapshot.metaKey || snapshot.ctrlKey) &&
    snapshot.key.toLowerCase() === "s"
  );
}

export function canKeepCurrentResolution(
  isRemoteCompare: boolean,
  canWrite: boolean,
): boolean {
  return !isRemoteCompare || canWrite;
}
