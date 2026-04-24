// tests/lib/telemetry/langfuse-extra.test.ts
// Covers: flush with flushAsync rejection, partial Langfuse config (only 2 of 3 keys),
// trace input capture, and traceId uniqueness.
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ServerEnv } from "../../../lib/config/env";

const makeEnv = (overrides: Partial<ServerEnv> = {}): ServerEnv => ({
  OPENAI_BASE_URL: "https://api.example.com/v1",
  OPENAI_API_KEY: "sk-test",
  DEFAULT_MODEL: "gpt-4o-mini",
  DEMO_MODE: false,
  DEMO_REQUEST_BUDGET: 50,
  LANGFUSE_PUBLIC_KEY: undefined,
  LANGFUSE_SECRET_KEY: undefined,
  LANGFUSE_HOST: undefined,
  ...overrides,
});

describe("createLangfuseTrace — additional coverage", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns noop when only LANGFUSE_PUBLIC_KEY is set (partial config)", async () => {
    const { createLangfuseTrace } = await import("../../../lib/telemetry/langfuse");
    const result = await createLangfuseTrace(
      makeEnv({ LANGFUSE_PUBLIC_KEY: "lf-pub" }),
      "test prompt",
    );

    // Without all 3 keys, falls through to noop
    expect(result.traceUrl).toBeNull();
    await expect(result.flush()).resolves.toBeUndefined();
  });

  it("noop trace returns a unique traceId on each call", async () => {
    const { createLangfuseTrace } = await import("../../../lib/telemetry/langfuse");

    const r1 = await createLangfuseTrace(makeEnv(), "prompt 1");
    const r2 = await createLangfuseTrace(makeEnv(), "prompt 2");

    expect(r1.traceId).not.toBe(r2.traceId);
  });

  it("flush does not throw when flushAsync rejects", async () => {
    vi.doMock("langfuse", () => ({
      Langfuse: vi.fn().mockImplementation(() => ({
        trace: vi.fn(() => ({ id: "trace-rej" })),
        flushAsync: vi.fn().mockRejectedValue(new Error("flush failed")),
      })),
    }));

    const { createLangfuseTrace } = await import("../../../lib/telemetry/langfuse");
    const result = await createLangfuseTrace(
      makeEnv({
        LANGFUSE_PUBLIC_KEY: "lf-pub",
        LANGFUSE_SECRET_KEY: "lf-sec",
        LANGFUSE_HOST: "https://cloud.langfuse.com",
      }),
      "test",
    );

    await expect(result.flush()).resolves.toBeUndefined();
  });

  it("passes the prompt as input to Langfuse trace", async () => {
    const mockTrace = vi.fn(() => ({ id: "trace-input-check" }));
    vi.doMock("langfuse", () => ({
      Langfuse: vi.fn().mockImplementation(() => ({
        trace: mockTrace,
        flushAsync: vi.fn().mockResolvedValue(undefined),
      })),
    }));

    const { createLangfuseTrace } = await import("../../../lib/telemetry/langfuse");
    await createLangfuseTrace(
      makeEnv({
        LANGFUSE_PUBLIC_KEY: "lf-pub",
        LANGFUSE_SECRET_KEY: "lf-sec",
        LANGFUSE_HOST: "https://cloud.langfuse.com",
      }),
      "my special prompt",
    );

    expect(mockTrace).toHaveBeenCalledWith(
      expect.objectContaining({ input: "my special prompt" }),
    );
  });

  it("traceUrl is constructed from LANGFUSE_HOST and trace.id", async () => {
    vi.doMock("langfuse", () => ({
      Langfuse: vi.fn().mockImplementation(() => ({
        trace: vi.fn(() => ({ id: "abc123" })),
        flushAsync: vi.fn().mockResolvedValue(undefined),
      })),
    }));

    const { createLangfuseTrace } = await import("../../../lib/telemetry/langfuse");
    const result = await createLangfuseTrace(
      makeEnv({
        LANGFUSE_PUBLIC_KEY: "lf-pub",
        LANGFUSE_SECRET_KEY: "lf-sec",
        LANGFUSE_HOST: "https://my-langfuse.example.com",
      }),
      "test",
    );

    expect(result.traceUrl).toBe("https://my-langfuse.example.com/trace/abc123");
  });
});
