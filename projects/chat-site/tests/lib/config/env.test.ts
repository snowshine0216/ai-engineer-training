// tests/lib/config/env.test.ts
import { describe, expect, it } from "vitest";
import { parseServerEnv } from "../../../lib/config/env";

const BASE_ENV = {
  OPENAI_BASE_URL: "https://api.example.com/v1",
  OPENAI_API_KEY: "sk-test",
  DEFAULT_MODEL: "gpt-4o-mini",
  AMAP_API_KEY: "amap-test",
  TAVILY_API_KEY: "tavily-test",
};

describe("parseServerEnv", () => {
  it("returns validated config with required fields and logger defaults", () => {
    const env = parseServerEnv(BASE_ENV);

    expect(env).toMatchObject({
      OPENAI_BASE_URL: "https://api.example.com/v1",
      OPENAI_API_KEY: "sk-test",
      DEFAULT_MODEL: "gpt-4o-mini",
      DEMO_REQUEST_BUDGET: 50,
      LOG_LEVEL: "info",
      LOG_DIR: "logs",
      LOG_FILE_ENABLED: true,
    });
    expect(env.LANGFUSE_PUBLIC_KEY).toBeUndefined();
  });

  it("disables file logging by default on Vercel", () => {
    const env = parseServerEnv({ ...BASE_ENV, VERCEL: "1" });
    expect(env.LOG_FILE_ENABLED).toBe(false);
  });

  it("allows opting back into file logging on Vercel", () => {
    const env = parseServerEnv({ ...BASE_ENV, VERCEL: "1", LOG_FILE_ENABLED: "true", LOG_DIR: "/tmp/logs" });
    expect(env.LOG_FILE_ENABLED).toBe(true);
    expect(env.LOG_DIR).toBe("/tmp/logs");
  });

  it("accepts full config with Langfuse and overridden log settings", () => {
    const env = parseServerEnv({
      ...BASE_ENV,
      LANGFUSE_PUBLIC_KEY: "lf-pub",
      LANGFUSE_SECRET_KEY: "lf-sec",
      LANGFUSE_HOST: "https://cloud.langfuse.com",
      DEMO_REQUEST_BUDGET: "100",
      LOG_LEVEL: "debug",
      LOG_DIR: "/var/log/chat",
      LOG_FILE_ENABLED: "false",
    });

    expect(env.LANGFUSE_PUBLIC_KEY).toBe("lf-pub");
    expect(env.LANGFUSE_SECRET_KEY).toBe("lf-sec");
    expect(env.LANGFUSE_HOST).toBe("https://cloud.langfuse.com");
    expect(env.DEMO_REQUEST_BUDGET).toBe(100);
    expect(env.LOG_LEVEL).toBe("debug");
    expect(env.LOG_DIR).toBe("/var/log/chat");
    expect(env.LOG_FILE_ENABLED).toBe(false);
  });

  it("rejects unknown log level", () => {
    expect(() => parseServerEnv({ ...BASE_ENV, LOG_LEVEL: "trace" })).toThrow(/LOG_LEVEL/);
  });

  it("rejects missing required fields", () => {
    expect(() => parseServerEnv({ OPENAI_API_KEY: "sk-test", DEFAULT_MODEL: "m" })).toThrow(/OPENAI_BASE_URL/);
  });

  it("treats blank Langfuse strings as absent", () => {
    const env = parseServerEnv({ ...BASE_ENV, LANGFUSE_PUBLIC_KEY: "  ", LANGFUSE_HOST: "" });
    expect(env.LANGFUSE_PUBLIC_KEY).toBeUndefined();
    expect(env.LANGFUSE_HOST).toBeUndefined();
  });

  it("rejects missing AMAP_API_KEY or TAVILY_API_KEY", () => {
    const { AMAP_API_KEY: _a, ...withoutAmap } = BASE_ENV;
    const { TAVILY_API_KEY: _t, ...withoutTavily } = BASE_ENV;
    expect(() => parseServerEnv(withoutAmap)).toThrow(/AMAP_API_KEY/);
    expect(() => parseServerEnv(withoutTavily)).toThrow(/TAVILY_API_KEY/);
  });

  it("defaults customer service db path and trace visibility", () => {
    const env = parseServerEnv({
      OPENAI_BASE_URL: "https://api.example.com/v1",
      OPENAI_API_KEY: "sk-test",
      DEFAULT_MODEL: "gpt-4o-mini",
      AMAP_API_KEY: "amap",
      TAVILY_API_KEY: "tavily",
    });

    expect(env.CUSTOMER_SERVICE_DB_PATH).toBe("data/customer-service/customer-service.sqlite");
    expect(env.SHOW_AGENT_TRACE).toBe(true);
  });

  it("parses SHOW_AGENT_TRACE=false", () => {
    const env = parseServerEnv({
      OPENAI_BASE_URL: "https://api.example.com/v1",
      OPENAI_API_KEY: "sk-test",
      DEFAULT_MODEL: "gpt-4o-mini",
      AMAP_API_KEY: "amap",
      TAVILY_API_KEY: "tavily",
      SHOW_AGENT_TRACE: "false",
    });

    expect(env.SHOW_AGENT_TRACE).toBe(false);
  });
});
