const WINDOW_MS = 60_000;
export const BUDGET_WINDOW_SECONDS = WINDOW_MS / 1000;

// Module-level state — per-worker on Vercel (one counter per warm instance).
// The effective budget is limit × number of warm workers. Acceptable for a demo;
// replace with an external store (Redis, KV) before production with real traffic.
const state = { requestCount: 0, windowStart: Date.now() };

export const checkBudget = (limit: number): boolean => {
  const now = Date.now();
  if (now - state.windowStart > WINDOW_MS) {
    state.requestCount = 0;
    state.windowStart = now;
  }
  if (state.requestCount >= limit) return false;
  state.requestCount++;
  return true;
};

/** @internal — test helper only; not part of the public API */
export const resetBudget = () => {
  state.requestCount = 0;
  state.windowStart = Date.now();
};
