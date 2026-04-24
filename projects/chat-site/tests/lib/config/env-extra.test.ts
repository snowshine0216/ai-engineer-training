// tests/lib/config/env-extra.test.ts
// Covers booleanFlagSchema variants ("1", "0"), Langfuse URL validation,
// DEMO_REQUEST_BUDGET coercion, whitespace-only strings, formatIssue path rendering.
import { describe, expect, it } from "vitest";
import { parseServerEnv } from "../../../lib/config/env";

const BASE_ENV = {
  OPENAI_BASE_URL: "https://api.example.com/v1",
  OPENAI_API_KEY: "sk-test",
  DEFAULT_MODEL: "gpt-4o-mini",
};

describe("parseServerEnv — additional coverage", () => {
  it('treats DEMO_MODE="1" as true', () => {
    const env = parseServerEnv({ ...BASE_ENV, DEMO_MODE: "1" });
    expect(env.DEMO_MODE).toBe(true);
  });

  it('treats DEMO_MODE="0" as false', () => {
    const env = parseServerEnv({ ...BASE_ENV, DEMO_MODE: "0" });
    expect(env.DEMO_MODE).toBe(false);
  });

  it('treats DEMO_MODE="false" as false', () => {
    const env = parseServerEnv({ ...BASE_ENV, DEMO_MODE: "false" });
    expect(env.DEMO_MODE).toBe(false);
  });

  it("coerces DEMO_REQUEST_BUDGET from string to number", () => {
    const env = parseServerEnv({ ...BASE_ENV, DEMO_REQUEST_BUDGET: "25" });
    expect(env.DEMO_REQUEST_BUDGET).toBe(25);
    expect(typeof env.DEMO_REQUEST_BUDGET).toBe("number");
  });

  it("uses default DEMO_REQUEST_BUDGET=50 when not provided", () => {
    const env = parseServerEnv(BASE_ENV);
    expect(env.DEMO_REQUEST_BUDGET).toBe(50);
  });

  it("rejects whitespace-only OPENAI_API_KEY", () => {
    expect(() =>
      parseServerEnv({ ...BASE_ENV, OPENAI_API_KEY: "   " }),
    ).toThrow("Invalid server environment:");
  });

  it("rejects whitespace-only DEFAULT_MODEL", () => {
    expect(() =>
      parseServerEnv({ ...BASE_ENV, DEFAULT_MODEL: "\t" }),
    ).toThrow("Invalid server environment:");
  });

  it("rejects invalid LANGFUSE_HOST URL", () => {
    expect(() =>
      parseServerEnv({
        ...BASE_ENV,
        LANGFUSE_PUBLIC_KEY: "lf-pub",
        LANGFUSE_SECRET_KEY: "lf-sec",
        LANGFUSE_HOST: "not-a-url",
      }),
    ).toThrow("Invalid server environment:");
  });

  it("error message contains the field path for missing required field", () => {
    try {
      parseServerEnv({ OPENAI_API_KEY: "sk-test", DEFAULT_MODEL: "gpt-4o-mini" });
      expect.fail("should have thrown");
    } catch (err) {
      expect((err as Error).message).toMatch(/OPENAI_BASE_URL/);
    }
  });

  it("rejects DEMO_REQUEST_BUDGET of zero (not positive)", () => {
    expect(() =>
      parseServerEnv({ ...BASE_ENV, DEMO_REQUEST_BUDGET: "0" }),
    ).toThrow("Invalid server environment:");
  });

  it("rejects negative DEMO_REQUEST_BUDGET", () => {
    expect(() =>
      parseServerEnv({ ...BASE_ENV, DEMO_REQUEST_BUDGET: "-5" }),
    ).toThrow("Invalid server environment:");
  });

  it("rejects an invalid OPENAI_BASE_URL (no protocol)", () => {
    expect(() =>
      parseServerEnv({ ...BASE_ENV, OPENAI_BASE_URL: "api.example.com/v1" }),
    ).toThrow("Invalid server environment:");
  });
});
