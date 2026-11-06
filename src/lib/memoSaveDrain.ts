export interface MemoSaveDrainRegistry {
  start(memoId: string): symbol;
  finish(token: symbol): void;
  isInFlight(memoId: string): boolean;
  wait(memoId: string): Promise<void>;
}

export interface CompletedMemoSave {
  memoId: string;
  generation: number;
  content: string;
  revision?: string;
}

export interface CompletedMemoSaveLedger {
  record(save: CompletedMemoSave): void;
  get(memoId: string): CompletedMemoSave | null;
  delete(memoId: string): void;
}

export function createCompletedMemoSaveLedger(limit = 20): CompletedMemoSaveLedger {
  const saves = new Map<string, CompletedMemoSave>();
  return {
    record(save) {
      saves.delete(save.memoId);
      saves.set(save.memoId, save);
      while (saves.size > limit) saves.delete(saves.keys().next().value!);
    },
    get: (memoId) => saves.get(memoId) ?? null,
    delete: (memoId) => saves.delete(memoId),
  };
}

export function createMemoSaveDrainRegistry(): MemoSaveDrainRegistry {
  const operations = new Map<symbol, string>();
  const waiters = new Set<{ memoId: string; resolve: () => void }>();

  const isInFlight = (memoId: string) => [...operations.values()].includes(memoId);
  return {
    start(memoId) {
      const token = Symbol(memoId);
      operations.set(token, memoId);
      return token;
    },
    finish(token) {
      operations.delete(token);
      for (const waiter of [...waiters]) {
        if (isInFlight(waiter.memoId)) continue;
        waiters.delete(waiter);
        waiter.resolve();
      }
    },
    isInFlight,
    wait(memoId) {
      if (!isInFlight(memoId)) return Promise.resolve();
      return new Promise((resolve) => waiters.add({ memoId, resolve }));
    },
  };
}
