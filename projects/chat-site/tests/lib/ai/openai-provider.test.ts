// tests/lib/ai/openai-provider.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@openai/agents", () => ({
  OpenAIProvider: vi.fn().mockImplementation(() => ({})),
  setDefaultModelProvider: vi.fn(),
  setOpenAIAPI: vi.fn(),
  setTracingDisabled: vi.fn(),
}));

import {
  OpenAIProvider,
  setDefaultModelProvider,
  setOpenAIAPI,
  setTracingDisabled,
} from "@openai/agents";
import { initializeOpenAIProvider } from "../../../lib/ai/openai-provider";
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

describe("initializeOpenAIProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates OpenAIProvider with apiKey and baseURL from env, forcing chat_completions mode", () => {
    initializeOpenAIProvider(makeEnv());

    expect(OpenAIProvider).toHaveBeenCalledWith({
      apiKey: "sk-test",
      baseURL: "https://api.example.com/v1",
      useResponses: false,
    });
  });

  it("registers the provider instance as the global default model provider", () => {
    initializeOpenAIProvider(makeEnv());

    const instance = vi.mocked(OpenAIProvider).mock.instances[0];
    expect(setDefaultModelProvider).toHaveBeenCalledWith(instance);
  });

  it("selects chat_completions API mode globally", () => {
    initializeOpenAIProvider(makeEnv());

    expect(setOpenAIAPI).toHaveBeenCalledWith("chat_completions");
  });

  it("disables tracing", () => {
    initializeOpenAIProvider(makeEnv());

    expect(setTracingDisabled).toHaveBeenCalledWith(true);
  });
});
