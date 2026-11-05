const INLINE_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

export const ATTACHMENT_UPLOAD_DENIED_MESSAGE = '파일과 이미지 업로드는 superadmin만 사용할 수 있습니다.';

export const canUploadMemoAttachments = (
  user: { permission?: string } | null | undefined,
): boolean => user?.permission === 'superadmin';

export const isInlineImageFile = (file: Pick<File, 'type'>): boolean =>
  INLINE_IMAGE_TYPES.has(file.type.toLowerCase());

export const shouldApplyAttachmentResult = (input: {
  expectedMemoId: string;
  expectedUserId: string;
  expectedGeneration: number;
  currentMemoId: string | null;
  currentUserId: string | null;
  currentGeneration: number;
}): boolean =>
  input.expectedMemoId === input.currentMemoId &&
  input.expectedUserId === input.currentUserId &&
  input.expectedGeneration === input.currentGeneration;

export const blocksMemoSaveForUploads = (
  uploads: ReadonlyArray<{ status: 'uploading' | 'ready' | 'failed'; inlineImage?: boolean }>,
): boolean => uploads.some(
  (upload) => upload.status === 'uploading' || upload.status === 'failed',
);

export const attachmentImageToken = (attachmentId: string): string =>
  `![이미지](todo-attachment:${attachmentId})`;

export function insertAttachmentTokensAtSelection(
  content: string,
  start: number,
  end: number,
  attachmentIds: readonly string[],
): { content: string; caret: number } {
  const before = content.slice(0, start);
  const after = content.slice(end);
  const tokenBody = attachmentIds.map(attachmentImageToken).join('\n');
  const leading = before.length > 0 && !before.endsWith('\n') ? '\n' : '';
  const trailing = after.length > 0 && !after.startsWith('\n') ? '\n' : '';
  const inserted = `${leading}${tokenBody}${trailing}`;
  return {
    content: `${before}${inserted}${after}`,
    caret: before.length + inserted.length,
  };
}

export function removeAttachmentTokenRows(content: string, attachmentId: string): string {
  const token = attachmentImageToken(attachmentId);
  return content.split('\n').filter((line) => line !== token).join('\n');
}

export const shouldRestartPendingUploadAfterFlight = (input: {
  status: 'pending' | 'failed' | null;
  recordMemoId: string | null;
  recordUserId: string | null;
  currentMemoId: string | null;
  currentUserId: string | null;
}): boolean =>
  input.status === 'pending' &&
  input.recordMemoId === input.currentMemoId &&
  input.recordUserId === input.currentUserId;

export function mergeAttachmentStateById<T extends { id: string }>(
  loaded: readonly T[],
  current: readonly T[],
): T[] {
  const currentIds = new Set(current.map((item) => item.id));
  return [...loaded.filter((item) => !currentIds.has(item.id)), ...current];
}

export const shouldLoadQueuedUploadRecord = (
  attachmentId: string,
  readyIds: ReadonlySet<string>,
  settledIds: ReadonlySet<string>,
  activeIds: ReadonlySet<string>,
): boolean =>
  !readyIds.has(attachmentId) &&
  !settledIds.has(attachmentId) &&
  !activeIds.has(attachmentId);
