// tests/lib/telemetry/langfuse.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ServerEnv } from "../../../lib/config/env";

const makeEnv = (overrides: Partial<ServerEnv> = {}): ServerEnv => ({
  OPENAI_BASE_URL: "https://api.example.com/v1",
  OPENAI_API_KEY: "sk-test",
  DEFAULT_MODEL: "gpt-4o-mini",
  DEMO_REQUEST_BUDGET: 50,
  LANGFUSE_PUBLIC_KEY: undefined,
  LANGFUSE_SECRET_KEY: undefined,
  LANGFUSE_HOST: undefined,
  LOG_LEVEL: "info" as const,
  LOG_DIR: "logs",
  LOG_FILE_ENABLED: false,
  ...overrides,
});

describe("createLangfuseTrace", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns a noop trace with null traceUrl when Langfuse keys are absent", async () => {
    const { createLangfuseTrace } = await import("../../../lib/telemetry/langfuse");
    const result = await createLangfuseTrace(makeEnv(), "hello");

    expect(result.traceUrl).toBeNull();
    expect(typeof result.traceId).toBe("string");
    await expect(result.flush()).resolves.toBeUndefined();
  });

  it("returns a real traceUrl when Langfuse keys are present", async () => {
    // Mock the langfuse package
    vi.doMock("langfuse", () => ({
      Langfuse: vi.fn().mockImplementation(() => ({
        trace: vi.fn(() => ({ id: "trace-abc" })),
        flushAsync: vi.fn().mockResolvedValue(undefined),
      })),
    }));

    const { createLangfuseTrace } = await import("../../../lib/telemetry/langfuse");
    const result = await createLangfuseTrace(
      makeEnv({
        LANGFUSE_PUBLIC_KEY: "lf-pub",
        LANGFUSE_SECRET_KEY: "lf-sec",
        LANGFUSE_HOST: "https://cloud.langfuse.com",
      }),
      "hello",
    );

    expect(result.traceUrl).toBe("https://cloud.langfuse.com/trace/trace-abc");
    expect(result.traceId).toBe("trace-abc");
  });

  it("flush does not throw even when Langfuse flushAsync times out", async () => {
    vi.doMock("langfuse", () => ({
      Langfuse: vi.fn().mockImplementation(() => ({
        trace: vi.fn(() => ({ id: "trace-xyz" })),
        // Never resolves — simulates a stuck flush
        flushAsync: vi.fn(() => new Promise(() => {})),
      })),
    }));

    const { createLangfuseTrace } = await import("../../../lib/telemetry/langfuse");
    const result = await createLangfuseTrace(
      makeEnv({
        LANGFUSE_PUBLIC_KEY: "lf-pub",
        LANGFUSE_SECRET_KEY: "lf-sec",
        LANGFUSE_HOST: "https://cloud.langfuse.com",
      }),
      "hello",
    );

    await expect(result.flush()).resolves.toBeUndefined();
  }, 5000);
});
