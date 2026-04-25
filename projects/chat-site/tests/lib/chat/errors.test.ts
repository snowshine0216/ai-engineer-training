// tests/lib/chat/errors.test.ts
import { describe, it, expect } from "vitest";
import { classifyError } from "../../../lib/chat/errors";

describe("classifyError", () => {
  it("returns retryable=false for non-Error values", () => {
    expect(classifyError("nope")).toMatchObject({ retryable: false });
    expect(classifyError(null)).toMatchObject({ retryable: false });
  });

  it("classifies 429 status as retryable rate-limit", () => {
    const err = Object.assign(new Error("oops"), { status: 429 });
    expect(classifyError(err)).toMatchObject({ retryable: true, code: "rate_limit_exceeded" });
  });

  it("classifies 'rate limit' message as retryable rate-limit", () => {
    expect(classifyError(new Error("Rate limit exceeded"))).toMatchObject({ retryable: true, code: "rate_limit_exceeded" });
  });

  it("classifies 5xx as retryable server_error", () => {
    expect(classifyError(new Error("HTTP 503 Service Unavailable"))).toMatchObject({ retryable: true, code: "server_error" });
  });

  it("classifies timeout as retryable", () => {
    expect(classifyError(new Error("Request timed out"))).toMatchObject({ retryable: true, code: "timeout" });
  });

  it("classifies network errors as retryable", () => {
    expect(classifyError(new Error("connection reset"))).toMatchObject({ retryable: true, code: "connection_error" });
  });

  it("classifies 401 as non-retryable auth_error", () => {
    const err = Object.assign(new Error("nope"), { status: 401 });
    expect(classifyError(err)).toMatchObject({ retryable: false, code: "auth_error" });
  });

  it("classifies 404 as non-retryable not_found", () => {
    const err = Object.assign(new Error("nope"), { status: 404 });
    expect(classifyError(err)).toMatchObject({ retryable: false, code: "not_found" });
  });

  it("falls through to generic non-retryable for unknown", () => {
    expect(classifyError(new Error("weird"))).toMatchObject({ retryable: false });
  });
});
