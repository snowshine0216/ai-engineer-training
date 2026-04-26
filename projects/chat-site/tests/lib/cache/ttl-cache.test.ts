// tests/lib/cache/ttl-cache.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createTtlCache } from "../../../lib/cache/ttl-cache";

describe("createTtlCache", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-25T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("get returns undefined for an unset key", () => {
    const cache = createTtlCache<string>();
    expect(cache.get("nope")).toBeUndefined();
  });

  it("set then get within ttl returns the value", () => {
    const cache = createTtlCache<string>();
    cache.set("k", "v", 1000);
    expect(cache.get("k")).toBe("v");
  });

  it("get after ttl returns undefined and prunes the entry", () => {
    const cache = createTtlCache<string>();
    cache.set("k", "v", 1000);
    vi.advanceTimersByTime(1000);
    expect(cache.get("k")).toBeUndefined();
    expect(cache.size()).toBe(0);
  });

  it("set overwrites and resets the ttl", () => {
    const cache = createTtlCache<string>();
    cache.set("k", "old", 1000);
    vi.advanceTimersByTime(800);
    cache.set("k", "new", 1000);
    vi.advanceTimersByTime(800); // 1600 since first set, 800 since second
    expect(cache.get("k")).toBe("new");
  });

  it("delete removes the entry", () => {
    const cache = createTtlCache<string>();
    cache.set("k", "v", 1000);
    cache.delete("k");
    expect(cache.get("k")).toBeUndefined();
    expect(cache.size()).toBe(0);
  });

  it("size reflects only live entries", () => {
    const cache = createTtlCache<string>();
    cache.set("a", "1", 1000);
    cache.set("b", "2", 5000);
    expect(cache.size()).toBe(2);
    vi.advanceTimersByTime(2000);
    cache.get("a"); // prunes "a"
    expect(cache.size()).toBe(1);
  });

  it("instances are isolated", () => {
    const a = createTtlCache<string>();
    const b = createTtlCache<string>();
    a.set("k", "v", 1000);
    expect(b.get("k")).toBeUndefined();
  });

  it("clear empties all entries", () => {
    const cache = createTtlCache<string>();
    cache.set("a", "1", 1000);
    cache.set("b", "2", 1000);
    cache.clear();
    expect(cache.size()).toBe(0);
    expect(cache.get("a")).toBeUndefined();
  });

  it("evicts the oldest entry when set exceeds maxSize", () => {
    const cache = createTtlCache<string>({ maxSize: 2 });
    cache.set("a", "1", 1000);
    cache.set("b", "2", 1000);
    cache.set("c", "3", 1000); // triggers eviction of "a"
    expect(cache.size()).toBe(2);
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBe("2");
    expect(cache.get("c")).toBe("3");
  });
});
