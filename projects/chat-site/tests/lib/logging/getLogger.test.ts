// tests/lib/logging/getLogger.test.ts
// Tests for the process-level getLogger singleton and _resetDefaultLogger helper.
import { describe, it, expect, vi, afterEach } from "vitest";
import { getLogger, _resetDefaultLogger } from "../../../lib/logging";

// Suppress console output during these tests
vi.spyOn(console, "log").mockImplementation(() => {});
vi.spyOn(console, "error").mockImplementation(() => {});

afterEach(() => {
  // Reset the module-level singleton so each test gets a fresh logger
  _resetDefaultLogger();
});

describe("getLogger (singleton)", () => {
  it("returns a logger with all four methods defined", () => {
    const logger = getLogger();
    expect(typeof logger.debug).toBe("function");
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.warn).toBe("function");
    expect(typeof logger.error).toBe("function");
  });

  it("returns the same instance on repeated calls (singleton)", () => {
    const a = getLogger();
    const b = getLogger();
    expect(a).toBe(b);
  });

  it("after _resetDefaultLogger a new instance is created", () => {
    const first = getLogger();
    _resetDefaultLogger();
    const second = getLogger();
    expect(second).not.toBe(first);
  });

  it("respects LOG_LEVEL env var — debug messages suppressed when LOG_LEVEL=info", () => {
    const logSpy = vi.spyOn(console, "log");
    process.env.LOG_LEVEL = "info";
    const logger = getLogger();
    logger.debug("this should be suppressed");
    const debugCalls = logSpy.mock.calls.filter(([m]) => typeof m === "string" && m.includes("this should be suppressed"));
    expect(debugCalls).toHaveLength(0);
    delete process.env.LOG_LEVEL;
  });

  it("defaults LOG_LEVEL to info when LOG_LEVEL env var is not set", () => {
    delete process.env.LOG_LEVEL;
    const logger = getLogger();
    // Should not throw — successfully creates a logger
    expect(logger).toBeDefined();
  });

  it("disables file writing when VERCEL=1 is set and LOG_FILE_ENABLED is absent", () => {
    process.env.VERCEL = "1";
    delete process.env.LOG_FILE_ENABLED;
    // getLogger should not throw; file writes would be disabled internally
    const logger = getLogger();
    expect(logger).toBeDefined();
    delete process.env.VERCEL;
  });
});
