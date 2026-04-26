// lib/cache/ttl-cache.ts
export type TtlCache<V> = {
  get: (key: string) => V | undefined;
  set: (key: string, value: V, ttlMs: number) => void;
  delete: (key: string) => void;
  clear: () => void;
  size: () => number;
};

type Entry<V> = { value: V; expiresAt: number };

export const createTtlCache = <V>(options?: { maxSize?: number }): TtlCache<V> => {
  const maxSize = options?.maxSize ?? Infinity;
  const store = new Map<string, Entry<V>>();

  // Sole write path. Anything that mutates `store` (set, future bulk loaders) routes
  // through here so the maxSize invariant lives with the data structure, not the caller.
  const writeEntry = (key: string, entry: Entry<V>): void => {
    store.set(key, entry);
    if (store.size > maxSize) {
      // Evict the oldest entry (Map preserves insertion order).
      const oldest = store.keys().next().value;
      if (oldest !== undefined) store.delete(oldest);
    }
  };

  const get = (key: string): V | undefined => {
    const entry = store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      store.delete(key);
      return undefined;
    }
    return entry.value;
  };

  const set = (key: string, value: V, ttlMs: number): void => {
    writeEntry(key, { value, expiresAt: Date.now() + ttlMs });
  };

  const del = (key: string): void => {
    store.delete(key);
  };

  const clear = (): void => {
    store.clear();
  };

  const size = (): number => store.size;

  return { get, set, delete: del, clear, size };
};
