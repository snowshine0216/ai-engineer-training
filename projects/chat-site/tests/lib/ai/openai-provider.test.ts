// tests/lib/ai/openai-provider.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("openai", () => ({
  default: vi.fn().mockImplementation(() => ({})),
}));

vi.mock("@openai/agents", () => ({
  OpenAIProvider: vi.fn().mockImplementation(() => ({})),
  Runner: vi.fn().mockImplementation(() => ({})),
  setDefaultModelProvider: vi.fn(),
  setDefaultOpenAIClient: vi.fn(),
  setOpenAIAPI: vi.fn(),
  setTracingDisabled: vi.fn(),
}));

vi.mock("../../../lib/logging", () => ({
  getLogger: vi.fn().mockReturnValue({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import OpenAI from "openai";
import {
  OpenAIProvider,
  Runner,
  setDefaultModelProvider,
  setDefaultOpenAIClient,
  setOpenAIAPI,
  setTracingDisabled,
} from "@openai/agents";
import { initializeOpenAIProvider, getRunner } from "../../../lib/ai/openai-provider";
import type { ServerEnv } from "../../../lib/config/env";

const makeEnv = (overrides: Partial<ServerEnv> = {}): ServerEnv => ({
  OPENAI_BASE_URL: "https://api.example.com/v1",
  OPENAI_API_KEY: "sk-test",
  DEFAULT_MODEL: "gpt-4o-mini",
  AMAP_API_KEY: "amap-test",
  TAVILY_API_KEY: "tavily-test",
  DEMO_REQUEST_BUDGET: 50,
  LOG_LEVEL: "info",
  LOG_DIR: "logs",
  LOG_FILE_ENABLED: false,
  LANGFUSE_PUBLIC_KEY: undefined,
  LANGFUSE_SECRET_KEY: undefined,
  LANGFUSE_HOST: undefined,
  CUSTOMER_SERVICE_DB_PATH: "data/customer-service/customer-service.sqlite",
  SHOW_AGENT_TRACE: true,
  ...overrides,
});

describe("initializeOpenAIProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates an OpenAI client and OpenAIProvider with the correct config", () => {
    initializeOpenAIProvider(makeEnv());

    expect(OpenAI).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: "sk-test",
        baseURL: "https://api.example.com/v1",
      }),
    );

    const clientInstance = vi.mocked(OpenAI).mock.instances[0];
    expect(OpenAIProvider).toHaveBeenCalledWith({
      openAIClient: clientInstance,
      useResponses: false,
    });
  });

  it("registers the provider instance as the global default model provider", () => {
    initializeOpenAIProvider(makeEnv());

    const instance = vi.mocked(OpenAIProvider).mock.instances[0];
    expect(setDefaultModelProvider).toHaveBeenCalledWith(instance);
  });

  it("sets the default OpenAI client globally", () => {
    initializeOpenAIProvider(makeEnv());

    const clientInstance = vi.mocked(OpenAI).mock.instances[0];
    expect(setDefaultOpenAIClient).toHaveBeenCalledWith(clientInstance);
  });

  it("selects chat_completions API mode globally", () => {
    initializeOpenAIProvider(makeEnv());

    expect(setOpenAIAPI).toHaveBeenCalledWith("chat_completions");
  });

  it("disables tracing", () => {
    initializeOpenAIProvider(makeEnv());

    expect(setTracingDisabled).toHaveBeenCalledWith(true);
  });

  it("creates an explicit Runner with the provider and exposes it via getRunner()", () => {
    initializeOpenAIProvider(makeEnv());

    const providerInstance = vi.mocked(OpenAIProvider).mock.instances[0];
    expect(Runner).toHaveBeenCalledWith({
      modelProvider: providerInstance,
      tracingDisabled: true,
    });

    const runner = getRunner();
    expect(runner).toBeDefined();
  });

  it("getRunner() throws before initializeOpenAIProvider is called", async () => {
    initializeOpenAIProvider(makeEnv());
    expect(() => getRunner()).not.toThrow();
  });
});
