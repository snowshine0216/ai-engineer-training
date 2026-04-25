// lib/tools/city-lookup.ts
//
// Pure helper: city name → AMap adcode.
//
// Dataset (amap-cities.json) stores administrative names with their suffix,
// e.g. "北京市", "上海市", "海淀区". There are no bare "北京" entries.
//
// Match priority:
//   1. findExact(q)                    — "北京市" → exact hit
//   2. stripSuffix(q) → findExact      — "北京市" stripped → "北京" → no hit (handled by step 1)
//   3. stripSuffix(q) → findExactWithSuffix — "北京市" stripped → already found in step 1
//   4. findExactWithSuffix(q)          — "北京" → probes "北京市/县/区"
//   5. findSubstring(q)                — "北京海淀区" → row.name ⊂ q finds "海淀区"
//   6. undefined

import cities from "./amap-cities.json";
import { createTtlCache } from "../cache/ttl-cache";

export type CityRow = { name: string; adcode: string };
export type CityMatch = { adcode: string; matched: string };

const DATA: ReadonlyArray<CityRow> = cities as CityRow[];
// Keep first occurrence for duplicate names (e.g. 朝阳区 exists in Beijing and Changchun).
const DATA_MAP = DATA.reduce(
  (m, r) => (m.has(r.name) ? m : m.set(r.name, r)),
  new Map<string, CityRow>()
);
const SUFFIXES = ["市", "县", "区"];

const stripSuffix = (s: string): string => {
  for (const suffix of SUFFIXES) {
    if (s.endsWith(suffix) && s.length > suffix.length) return s.slice(0, -suffix.length);
  }
  return s;
};

const findExact = (q: string): CityRow | undefined => DATA_MAP.get(q);

/** Try appending 市/县/区 to q and look for an exact match. */
const findExactWithSuffix = (q: string): CityRow | undefined => {
  for (const suffix of SUFFIXES) {
    const hit = findExact(q + suffix);
    if (hit) return hit;
  }
  return undefined;
};

/** Match when a dataset name is fully contained in q (longer input), or q in name.
 *  The reverse direction (q.includes(row.name)) is guarded to row.name.length >= 3
 *  to avoid false positives from 2-char dataset entries like "城区" or "中国".
 *  Limit to first 200 entries to prevent O(n) performance issues. */
const findSubstring = (q: string): CityRow | undefined => {
  let count = 0;
  for (const row of DATA) {
    if (count++ > 200) break; // Performance limit
    if (row.name.includes(q) || (row.name.length >= 3 && q.includes(row.name))) {
      return row;
    }
  }
  return undefined;
};

const toMatch = (row: CityRow): CityMatch => ({ adcode: row.adcode, matched: row.name });

// Bounded TTL cache to prevent memory leaks (1 hour TTL, 1000 entry limit)
const lookupMemo = createTtlCache<CityMatch | undefined>({ maxSize: 1000 });

export const lookupAdcode = (input: string): CityMatch | undefined => {
  const q = input.trim();
  if (!q) return undefined;

  const cached = lookupMemo.get(q);
  if (cached !== undefined) return cached;

  const exact = findExact(q);
  if (exact) {
    const result = toMatch(exact);
    lookupMemo.set(q, result, 60 * 60 * 1000); // 1 hour TTL
    return result;
  }

  const stripped = stripSuffix(q);
  if (stripped !== q) {
    const exactStripped = findExact(stripped);
    if (exactStripped) {
      const result = toMatch(exactStripped);
      lookupMemo.set(q, result, 60 * 60 * 1000);
      return result;
    }

    const withSuffixStripped = findExactWithSuffix(stripped);
    if (withSuffixStripped) {
      const result = toMatch(withSuffixStripped);
      lookupMemo.set(q, result, 60 * 60 * 1000);
      return result;
    }
  }

  const withSuffix = findExactWithSuffix(q);
  if (withSuffix) {
    const result = toMatch(withSuffix);
    lookupMemo.set(q, result, 60 * 60 * 1000);
    return result;
  }

  const sub = findSubstring(q);
  const result = sub ? toMatch(sub) : undefined;
  lookupMemo.set(q, result, 60 * 60 * 1000);
  return result;
};
