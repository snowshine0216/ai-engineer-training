// tests/lib/chat/errors-extra.test.ts
// Extra coverage for classifyError branches not hit by the primary test file.
import { describe, it, expect } from "vitest";
import { classifyError } from "../../../lib/chat/errors";

describe("classifyError (extra branches)", () => {
  it("classifies 403 status as non-retryable auth_error (same branch as 401)", () => {
    const err = Object.assign(new Error("forbidden"), { status: 403 });
    expect(classifyError(err)).toMatchObject({ retryable: false, code: "auth_error" });
  });

  it("classifies a message containing '500' as retryable server_error", () => {
    expect(classifyError(new Error("HTTP 500 Internal Server Error"))).toMatchObject({
      retryable: true,
      code: "server_error",
    });
  });

  it("classifies 'server error' keyword as retryable server_error", () => {
    expect(classifyError(new Error("provider server error occurred"))).toMatchObject({
      retryable: true,
      code: "server_error",
    });
  });

  it("uses 'Unknown error' reason for non-Error primitives", () => {
    expect(classifyError("plain string")).toMatchObject({ retryable: false, reason: "Unknown error" });
    expect(classifyError(42)).toMatchObject({ retryable: false, reason: "Unknown error" });
    expect(classifyError(undefined)).toMatchObject({ retryable: false, reason: "Unknown error" });
  });

  it("uses the Error message as reason for unknown Error subclass", () => {
    const err = new Error("some weird edge case");
    const result = classifyError(err);
    expect(result.retryable).toBe(false);
    expect(result.reason).toBe("some weird edge case");
  });

  it("returns 'An unexpected error occurred.' for an Error with an empty message", () => {
    const err = new Error("");
    const result = classifyError(err);
    expect(result.retryable).toBe(false);
    expect(result.reason).toBe("An unexpected error occurred.");
  });
});
