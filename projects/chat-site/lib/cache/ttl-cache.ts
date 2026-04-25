// lib/cache/ttl-cache.ts
export type TtlCache<V> = {
  get: (key: string) => V | undefined;
  set: (key: string, value: V, ttlMs: number) => void;
  delete: (key: string) => void;
  clear: () => void;
  size: () => number;
};

type Entry<V> = { value: V; expiresAt: number };

export const createTtlCache = <V>(): TtlCache<V> => {
  const store = new Map<string, Entry<V>>();

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
    store.set(key, { value, expiresAt: Date.now() + ttlMs });
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
