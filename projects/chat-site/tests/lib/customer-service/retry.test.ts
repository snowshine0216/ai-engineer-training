import { describe, expect, it, vi } from "vitest";
import { classifyCustomerServiceError, createRetryDelays, withRetry } from "../../../lib/customer-service/retry";

describe("customer service retry", () => {
  it("classifies SQLITE_BUSY as retryable", () => {
    const err = Object.assign(new Error("busy"), { code: "SQLITE_BUSY" });
    expect(classifyCustomerServiceError(err)).toEqual({ retryable: true, code: "SQLITE_BUSY", reason: "SQLite is busy" });
  });

  it("classifies order_not_found as non-retryable", () => {
    const err = Object.assign(new Error("missing"), { code: "order_not_found" });
    expect(classifyCustomerServiceError(err)).toEqual({ retryable: false, code: "order_not_found", reason: "Order was not found" });
  });

  it("creates deterministic exponential delays with injected jitter", () => {
    expect(createRetryDelays({ maxAttempts: 3, baseDelayMs: 200, maxDelayMs: 1500, jitterMs: () => 7 })).toEqual([207, 407]);
  });

  it("retries retryable failures and returns the successful value", async () => {
    const sleep = vi.fn(() => Promise.resolve());
    const fn = vi
      .fn<[], Promise<string>>()
      .mockRejectedValueOnce(Object.assign(new Error("busy"), { code: "SQLITE_BUSY" }))
      .mockResolvedValueOnce("ok");
    const onRetry = vi.fn();

    await expect(withRetry(fn, { sleep, jitterMs: () => 0, onRetry })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(200);
    expect(onRetry).toHaveBeenCalledWith(expect.objectContaining({ attempt: 1, nextDelayMs: 200 }));
  });

  it("does not retry non-retryable failures", async () => {
    const sleep = vi.fn(() => Promise.resolve());
    const err = Object.assign(new Error("missing"), { code: "order_not_found" });
    await expect(withRetry(() => Promise.reject(err), { sleep, jitterMs: () => 0 })).rejects.toBe(err);
    expect(sleep).not.toHaveBeenCalled();
  });
});
