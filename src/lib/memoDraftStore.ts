import {
  createDraftPageId,
  makeMemoDraftKey,
  shouldDeleteDraftAfterSave,
  shouldAcceptDraftWrite,
  type MemoDraftRecord,
  type MemoDraftDismissalRecord,
} from './memoDraftPolicy';

const DB_NAME = 'todo-web-drafts-v1';
const DB_VERSION = 2;
const STORE_NAME = 'memoDrafts';
const DISMISSAL_STORE_NAME = 'draftDismissals';
let pageTabId: string | null = null;

function randomId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function openDraftDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('이 브라우저에서는 IndexedDB를 사용할 수 없습니다.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
        store.createIndex('byUserMemo', ['origin', 'userId', 'memoId'], {
          unique: false,
        });
      }
      if (!db.objectStoreNames.contains(DISMISSAL_STORE_NAME)) {
        const store = db.createObjectStore(DISMISSAL_STORE_NAME, { keyPath: 'key' });
        store.createIndex('byUserMemo', ['origin', 'userId', 'memoId'], {
          unique: false,
        });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB를 열지 못했습니다.'));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB 요청에 실패했습니다.'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB 저장에 실패했습니다.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB 저장이 중단되었습니다.'));
  });
}

export function getMemoDraftTabId(): string {
  if (pageTabId) return pageTabId;
  // sessionStorage는 window.open/duplicate에서 복제된다. document JS context마다
  // 독립인 module-memory UUID만 사용하고 reload 복구는 user+memo 후보 조회가 맡는다.
  pageTabId = createDraftPageId(randomId);
  return pageTabId;
}

export function currentMemoDraftKey(userId: string, memoId: string): string {
  return makeMemoDraftKey(window.location.origin, userId, memoId, getMemoDraftTabId());
}

export async function putMemoDraft(record: MemoDraftRecord): Promise<boolean> {
  const db = await openDraftDb();
  try {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const done = transactionDone(transaction);
    const current = await requestResult(
      store.get(record.key) as IDBRequest<MemoDraftRecord | undefined>,
    );
    const accepted = shouldAcceptDraftWrite(
      current?.localRevision ?? null,
      record.localRevision,
    );
    if (accepted) store.put(record);
    await done;
    return accepted;
  } finally {
    db.close();
  }
}

export async function loadMemoDraft(key: string): Promise<MemoDraftRecord | null> {
  const db = await openDraftDb();
  try {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const result = await requestResult(
      transaction.objectStore(STORE_NAME).get(key) as IDBRequest<MemoDraftRecord | undefined>,
    );
    return result ?? null;
  } finally {
    db.close();
  }
}

export async function listMemoDrafts(
  origin: string,
  userId: string,
  memoId: string,
): Promise<MemoDraftRecord[]> {
  const db = await openDraftDb();
  try {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const index = transaction.objectStore(STORE_NAME).index('byUserMemo');
    const records = await requestResult(
      index.getAll([origin, userId, memoId]) as IDBRequest<MemoDraftRecord[]>,
    );
    return records.sort((left, right) => right.updatedAt - left.updatedAt);
  } finally {
    db.close();
  }
}

export async function deleteMemoDraft(key: string): Promise<void> {
  const db = await openDraftDb();
  try {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).delete(key);
    await transactionDone(transaction);
  } finally {
    db.close();
  }
}

/** 저장 요청이 출발한 뒤 새 입력이 들어왔으면 그 새 draft는 절대 지우지 않는다. */
export async function deleteMemoDraftIfRevision(
  key: string,
  savedLocalRevision: number,
): Promise<boolean> {
  const db = await openDraftDb();
  try {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const done = transactionDone(transaction);
    const current = await requestResult(
      store.get(key) as IDBRequest<MemoDraftRecord | undefined>,
    );
    const shouldDelete = shouldDeleteDraftAfterSave(
      current?.localRevision ?? null,
      savedLocalRevision,
    );
    if (shouldDelete) store.delete(key);
    await done;
    return shouldDelete;
  } finally {
    db.close();
  }
}

export async function putMemoDraftDismissal(
  record: MemoDraftDismissalRecord,
): Promise<void> {
  const db = await openDraftDb();
  try {
    const transaction = db.transaction(DISMISSAL_STORE_NAME, 'readwrite');
    transaction.objectStore(DISMISSAL_STORE_NAME).put(record);
    await transactionDone(transaction);
  } finally {
    db.close();
  }
}

export async function listMemoDraftDismissals(
  origin: string,
  userId: string,
  memoId: string,
): Promise<MemoDraftDismissalRecord[]> {
  const db = await openDraftDb();
  try {
    const transaction = db.transaction(DISMISSAL_STORE_NAME, 'readonly');
    const index = transaction.objectStore(DISMISSAL_STORE_NAME).index('byUserMemo');
    return await requestResult(
      index.getAll([origin, userId, memoId]) as IDBRequest<MemoDraftDismissalRecord[]>,
    );
  } finally {
    db.close();
  }
}

export async function deleteMemoDraftDismissals(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  const db = await openDraftDb();
  try {
    const transaction = db.transaction(DISMISSAL_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(DISMISSAL_STORE_NAME);
    keys.forEach((key) => store.delete(key));
    await transactionDone(transaction);
  } finally {
    db.close();
  }
}
