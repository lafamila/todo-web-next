export interface NormalMemoEditorState {
  memoId: string;
  memoTitle: string;
  epoch: number;
  dirty: boolean;
  pending: boolean;
  conflicted: boolean;
}

export interface MemoEditorRegistryToken {
  memoId: string;
  registration: number;
}

export interface MemoEditorRegistry {
  mount: (memoId: string, memoTitle: string, epoch: number) => MemoEditorRegistryToken;
  update: (
    token: MemoEditorRegistryToken,
    state: Pick<NormalMemoEditorState, 'dirty' | 'pending' | 'conflicted'>,
  ) => void;
  unmount: (token: MemoEditorRegistryToken) => void;
  get: (memoId: string) => NormalMemoEditorState | undefined;
  getAll: () => NormalMemoEditorState[];
  getVersion: () => number;
  subscribe: (listener: () => void) => () => void;
}

export function createMemoEditorRegistry(): MemoEditorRegistry {
  const entries = new Map<string, NormalMemoEditorState & { registration: number }>();
  const listeners = new Set<() => void>();
  let registration = 0;
  let version = 0;

  const notify = () => {
    version += 1;
    listeners.forEach((listener) => listener());
  };

  return {
    mount(memoId, memoTitle, epoch) {
      const token = { memoId, registration: ++registration };
      entries.set(memoId, {
        memoId,
        memoTitle,
        epoch,
        registration: token.registration,
        dirty: false,
        pending: false,
        conflicted: false,
      });
      notify();
      return token;
    },
    update(token, state) {
      const current = entries.get(token.memoId);
      if (!current || current.registration !== token.registration) return;
      if (
        current.dirty === state.dirty &&
        current.pending === state.pending &&
        current.conflicted === state.conflicted
      ) return;
      entries.set(token.memoId, { ...current, ...state });
      notify();
    },
    unmount(token) {
      const current = entries.get(token.memoId);
      if (!current || current.registration !== token.registration) return;
      entries.delete(token.memoId);
      notify();
    },
    get(memoId) {
      const current = entries.get(memoId);
      if (!current) return undefined;
      return {
        memoId: current.memoId,
        memoTitle: current.memoTitle,
        epoch: current.epoch,
        dirty: current.dirty,
        pending: current.pending,
        conflicted: current.conflicted,
      };
    },
    getAll() {
      return [...entries.values()]
        .map((current) => ({
          memoId: current.memoId,
          memoTitle: current.memoTitle,
          epoch: current.epoch,
          dirty: current.dirty,
          pending: current.pending,
          conflicted: current.conflicted,
        }))
        .sort((left, right) => left.memoId.localeCompare(right.memoId));
    },
    getVersion() {
      return version;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export const normalMemoEditorRegistry = createMemoEditorRegistry();
