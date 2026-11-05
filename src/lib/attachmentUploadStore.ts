export type AttachmentUploadQueueStatus = 'pending' | 'failed';

export interface AttachmentUploadRecord {
  key: string;
  origin: string;
  userId: string;
  memoId: string;
  attachmentId: string;
  fileName: string;
  contentType: string;
  blob: Blob;
  inlineImage: boolean;
  status: AttachmentUploadQueueStatus;
  error: string | null;
  createdAt: number;
  updatedAt: number;
}

const DB_NAME = 'todo-web-attachment-uploads-v1';
const DB_VERSION = 1;
const STORE_NAME = 'attachmentUploads';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('이 브라우저에서는 첨부파일 임시저장을 사용할 수 없습니다.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
        store.createIndex('byUserMemo', ['origin', 'userId', 'memoId'], { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('첨부파일 임시저장소를 열지 못했습니다.'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('첨부파일 임시저장에 실패했습니다.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('첨부파일 임시저장이 중단되었습니다.'));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('첨부파일 임시저장 조회에 실패했습니다.'));
  });
}

export const attachmentUploadKey = (
  origin: string,
  userId: string,
  memoId: string,
  attachmentId: string,
): string => `${origin}\u0000${userId}\u0000${memoId}\u0000${attachmentId}`;

export async function putAttachmentUpload(record: AttachmentUploadRecord): Promise<void> {
  const db = await openDb();
  try {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put(record);
    await transactionDone(transaction);
  } finally {
    db.close();
  }
}

export async function listAttachmentUploads(
  origin: string,
  userId: string,
  memoId: string,
): Promise<AttachmentUploadRecord[]> {
  const db = await openDb();
  try {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const records = await requestResult(
      transaction.objectStore(STORE_NAME).index('byUserMemo')
        .getAll([origin, userId, memoId]) as IDBRequest<AttachmentUploadRecord[]>,
    );
    return records.sort((left, right) => left.createdAt - right.createdAt);
  } finally {
    db.close();
  }
}

export async function deleteAttachmentUpload(key: string): Promise<void> {
  const db = await openDb();
  try {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).delete(key);
    await transactionDone(transaction);
  } finally {
    db.close();
  }
}
