export type CustomerServiceRetryClassification = {
  retryable: boolean;
  code: string;
  reason: string;
};

export type RetryPolicy = {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitterMs: () => number;
};

export type RetryNotice = {
  attempt: number;
  nextDelayMs: number;
  code: string;
  reason: string;
};

const DEFAULT_POLICY: RetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 200,
  maxDelayMs: 1500,
  jitterMs: () => Math.floor(Math.random() * 101),
};

const getCode = (err: unknown): string =>
  err instanceof Error && "code" in err && typeof (err as { code: unknown }).code === "string"
    ? (err as { code: string }).code
    : "unknown";

export const classifyCustomerServiceError = (err: unknown): CustomerServiceRetryClassification => {
  const code = getCode(err);
  if (code === "SQLITE_BUSY") return { retryable: true, code, reason: "SQLite is busy" };
  if (code === "SQLITE_LOCKED") return { retryable: true, code, reason: "SQLite is locked" };
  if (code === "timeout") return { retryable: true, code, reason: "Lookup timed out" };
  if (code === "order_not_found") return { retryable: false, code, reason: "Order was not found" };
  if (code === "invalid_order_id") return { retryable: false, code, reason: "Order id is invalid" };
  return { retryable: false, code, reason: err instanceof Error ? err.message : "Unknown customer service error" };
};

export const createRetryDelays = (policy: RetryPolicy): number[] =>
  Array.from({ length: Math.max(0, policy.maxAttempts - 1) }, (_, index) =>
    Math.min(policy.maxDelayMs, policy.baseDelayMs * 2 ** index) + policy.jitterMs(),
  );

export const withRetry = async <T>(
  fn: () => Promise<T>,
  opts: Partial<RetryPolicy> & {
    sleep?: (ms: number) => Promise<void>;
    onRetry?: (notice: RetryNotice) => void;
  } = {},
): Promise<T> => {
  const policy = { ...DEFAULT_POLICY, ...opts };
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const delays = createRetryDelays(policy);

  for (let attempt = 1; attempt <= policy.maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      const classification = classifyCustomerServiceError(err);
      const delay = delays[attempt - 1];
      if (!classification.retryable || attempt >= policy.maxAttempts || delay === undefined) throw err;

      opts.onRetry?.({
        attempt,
        nextDelayMs: delay,
        code: classification.code,
        reason: classification.reason,
      });
      await sleep(delay);
    }
  }

  // unreachable: the loop always returns on success or throws on exhaustion/non-retryable
  throw new Error("withRetry: maxAttempts must be >= 1");
};
