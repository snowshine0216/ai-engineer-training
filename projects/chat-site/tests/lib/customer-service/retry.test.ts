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
      .fn<() => Promise<string>>()
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

  it("rethrows after exhausting all attempts", async () => {
    const sleep = vi.fn(() => Promise.resolve());
    const err = Object.assign(new Error("busy"), { code: "SQLITE_BUSY" });
    await expect(
      withRetry(() => Promise.reject(err), { maxAttempts: 3, sleep, jitterMs: () => 0 })
    ).rejects.toBe(err);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("classifies SQLITE_LOCKED as retryable", () => {
    const err = Object.assign(new Error("locked"), { code: "SQLITE_LOCKED" });
    expect(classifyCustomerServiceError(err)).toEqual({ retryable: true, code: "SQLITE_LOCKED", reason: "SQLite is locked" });
  });

  it("classifies timeout as retryable", () => {
    const err = Object.assign(new Error("timed out"), { code: "timeout" });
    expect(classifyCustomerServiceError(err)).toEqual({ retryable: true, code: "timeout", reason: "Lookup timed out" });
  });

  it("classifies invalid_order_id as non-retryable", () => {
    const err = Object.assign(new Error("bad id"), { code: "invalid_order_id" });
    expect(classifyCustomerServiceError(err)).toEqual({ retryable: false, code: "invalid_order_id", reason: "Order id is invalid" });
  });

  it("classifies unknown Error code as non-retryable using the error message as reason", () => {
    const err = Object.assign(new Error("something weird"), { code: "some_unknown_code" });
    expect(classifyCustomerServiceError(err)).toEqual({ retryable: false, code: "some_unknown_code", reason: "something weird" });
  });

  it("classifies a non-Error value as non-retryable with generic reason", () => {
    expect(classifyCustomerServiceError("a string error")).toEqual({
      retryable: false,
      code: "unknown",
      reason: "Unknown customer service error",
    });
  });
});
