const WINDOW_MS = 60_000;

let requestCount = 0;
let windowStart = Date.now();

export const checkBudget = (limit: number): boolean => {
  const now = Date.now();
  if (now - windowStart > WINDOW_MS) {
    requestCount = 0;
    windowStart = now;
  }
  if (requestCount >= limit) return false;
  requestCount++;
  return true;
};

export const resetBudget = () => {
  requestCount = 0;
  windowStart = Date.now();
};
