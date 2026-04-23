import { describe, expect, it } from "vitest";

import { parseServerEnv } from "../../../lib/config/env";

describe("parseServerEnv", () => {
  it("returns the validated server configuration", () => {
    const env = parseServerEnv({
      OPENAI_BASE_URL: "https://litellm.example.com/v1",
      OPENAI_API_KEY: "litellm-key",
      DEFAULT_MODEL: "minimax-2.7-chat",
      OPENAI_API_MODE: "responses",
      LANGFUSE_PUBLIC_KEY: "langfuse-public",
      LANGFUSE_SECRET_KEY: "langfuse-secret",
      LANGFUSE_HOST: "https://cloud.langfuse.com",
      OPENAI_AGENTS_ENABLE_TRACING: "true",
      OPENAI_TRACING_API_KEY: "openai-tracing-key",
    });

    expect(env).toEqual({
      OPENAI_BASE_URL: "https://litellm.example.com/v1",
      OPENAI_API_KEY: "litellm-key",
      DEFAULT_MODEL: "minimax-2.7-chat",
      OPENAI_API_MODE: "responses",
      LANGFUSE_PUBLIC_KEY: "langfuse-public",
      LANGFUSE_SECRET_KEY: "langfuse-secret",
      LANGFUSE_HOST: "https://cloud.langfuse.com",
      OPENAI_AGENTS_ENABLE_TRACING: true,
      OPENAI_TRACING_API_KEY: "openai-tracing-key",
    });
  });

  it("applies defaults for optional runtime settings", () => {
    const env = parseServerEnv({
      OPENAI_BASE_URL: "https://litellm.example.com/v1",
      OPENAI_API_KEY: "litellm-key",
      DEFAULT_MODEL: "minimax-2.7-chat",
      LANGFUSE_PUBLIC_KEY: "langfuse-public",
      LANGFUSE_SECRET_KEY: "langfuse-secret",
      LANGFUSE_HOST: "https://cloud.langfuse.com",
    });

    expect(env.OPENAI_API_MODE).toBe("chat_completions");
    expect(env.OPENAI_AGENTS_ENABLE_TRACING).toBe(false);
    expect(env.OPENAI_TRACING_API_KEY).toBeUndefined();
  });

  it("requires a tracing export key when OpenAI tracing is enabled", () => {
    expect(() =>
      parseServerEnv({
        OPENAI_BASE_URL: "https://litellm.example.com/v1",
        OPENAI_API_KEY: "litellm-key",
        DEFAULT_MODEL: "minimax-2.7-chat",
        LANGFUSE_PUBLIC_KEY: "langfuse-public",
        LANGFUSE_SECRET_KEY: "langfuse-secret",
        LANGFUSE_HOST: "https://cloud.langfuse.com",
        OPENAI_AGENTS_ENABLE_TRACING: "true",
      }),
    ).toThrow(
      "Invalid server environment: OPENAI_TRACING_API_KEY: Required when OPENAI_AGENTS_ENABLE_TRACING is true",
    );
  });

  it("throws a readable error when required variables are missing or invalid", () => {
    expect(() =>
      parseServerEnv({
        OPENAI_BASE_URL: "not-a-url",
        OPENAI_API_KEY: "",
        DEFAULT_MODEL: "",
        OPENAI_API_MODE: "invalid-mode",
        LANGFUSE_PUBLIC_KEY: "",
        LANGFUSE_SECRET_KEY: "",
        LANGFUSE_HOST: "also-not-a-url",
      } as Record<string, string>),
    ).toThrow(
      'Invalid server environment: OPENAI_BASE_URL: Invalid URL; OPENAI_API_KEY: Too small: expected string to have >=1 characters; DEFAULT_MODEL: Too small: expected string to have >=1 characters; OPENAI_API_MODE: Invalid option: expected one of "chat_completions"|"responses"; LANGFUSE_PUBLIC_KEY: Too small: expected string to have >=1 characters; LANGFUSE_SECRET_KEY: Too small: expected string to have >=1 characters; LANGFUSE_HOST: Invalid URL',
    );
  });
});
