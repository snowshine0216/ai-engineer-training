// lib/tools/_http.ts
//
// Shared HTTP helpers for tool implementations. Two responsibilities:
//   1. fetchWithTimeout: AbortController-driven timeout that always clears its timer.
//   2. safeJson:        res.json() that returns a typed result or null instead of
//                       throwing when the upstream sends HTML / WAF / malformed JSON.
//
// Both helpers are pure and stateless — safe for use across any tool.

export const fetchWithTimeout = async (
  url: string,
  init: RequestInit | undefined,
  timeoutMs: number,
): Promise<Response> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

export const safeJson = async <T>(res: Response): Promise<T | null> => {
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
};
