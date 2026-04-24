// tests/lib/config/env.test.ts
import { describe, expect, it } from "vitest";
import { parseServerEnv } from "../../../lib/config/env";

const BASE_ENV = {
  OPENAI_BASE_URL: "https://api.example.com/v1",
  OPENAI_API_KEY: "sk-test",
  DEFAULT_MODEL: "gpt-4o-mini",
};

describe("parseServerEnv", () => {
  it("returns validated config with required fields only", () => {
    const env = parseServerEnv(BASE_ENV);

    expect(env).toMatchObject({
      OPENAI_BASE_URL: "https://api.example.com/v1",
      OPENAI_API_KEY: "sk-test",
      DEFAULT_MODEL: "gpt-4o-mini",
      DEMO_MODE: false,
      DEMO_REQUEST_BUDGET: 50,
    });
    expect(env.LANGFUSE_PUBLIC_KEY).toBeUndefined();
    expect(env.LANGFUSE_SECRET_KEY).toBeUndefined();
    expect(env.LANGFUSE_HOST).toBeUndefined();
  });

  it("accepts full config with Langfuse and demo mode", () => {
    const env = parseServerEnv({
      ...BASE_ENV,
      LANGFUSE_PUBLIC_KEY: "lf-pub",
      LANGFUSE_SECRET_KEY: "lf-sec",
      LANGFUSE_HOST: "https://cloud.langfuse.com",
      DEMO_MODE: "true",
      DEMO_REQUEST_BUDGET: "100",
    });

    expect(env.LANGFUSE_PUBLIC_KEY).toBe("lf-pub");
    expect(env.LANGFUSE_SECRET_KEY).toBe("lf-sec");
    expect(env.LANGFUSE_HOST).toBe("https://cloud.langfuse.com");
    expect(env.DEMO_MODE).toBe(true);
    expect(env.DEMO_REQUEST_BUDGET).toBe(100);
  });

  it("applies default DEMO_MODE=false and DEMO_REQUEST_BUDGET=50", () => {
    const env = parseServerEnv(BASE_ENV);

    expect(env.DEMO_MODE).toBe(false);
    expect(env.DEMO_REQUEST_BUDGET).toBe(50);
  });

  it("throws a readable error when required variables are missing or invalid", () => {
    expect(() =>
      parseServerEnv({
        OPENAI_BASE_URL: "not-a-url",
        OPENAI_API_KEY: "",
        DEFAULT_MODEL: "",
      } as Record<string, string>),
    ).toThrow("Invalid server environment:");
  });

  it("throws when OPENAI_BASE_URL is missing", () => {
    expect(() =>
      parseServerEnv({ OPENAI_API_KEY: "sk-test", DEFAULT_MODEL: "gpt-4o-mini" }),
    ).toThrow("Invalid server environment:");
  });
});
