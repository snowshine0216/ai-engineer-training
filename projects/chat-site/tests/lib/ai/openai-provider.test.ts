import { describe, expect, it, vi } from "vitest";

import {
  applyOpenAIProvider,
  getOpenAIProviderSettings,
} from "../../../lib/ai/openai-provider";
import type { ServerEnv } from "../../../lib/config/env";

const createServerEnv = (
  overrides: Partial<ServerEnv> = {},
): ServerEnv => ({
  OPENAI_BASE_URL: "https://litellm.example.com/v1",
  OPENAI_API_KEY: "litellm-key",
  DEFAULT_MODEL: "minimax-2.7-chat",
  OPENAI_API_MODE: "chat_completions",
  LANGFUSE_PUBLIC_KEY: "langfuse-public",
  LANGFUSE_SECRET_KEY: "langfuse-secret",
  LANGFUSE_HOST: "https://cloud.langfuse.com",
  OPENAI_AGENTS_ENABLE_TRACING: false,
  OPENAI_TRACING_API_KEY: undefined,
  ...overrides,
});

describe("getOpenAIProviderSettings", () => {
  it("maps the env contract to OpenAI client settings", () => {
    const settings = getOpenAIProviderSettings(
      createServerEnv({
        OPENAI_API_MODE: "responses",
        OPENAI_AGENTS_ENABLE_TRACING: true,
        OPENAI_TRACING_API_KEY: "openai-tracing-key",
      }),
    );

    expect(settings).toEqual({
      clientOptions: {
        baseURL: "https://litellm.example.com/v1",
        apiKey: "litellm-key",
      },
      apiMode: "responses",
      tracingEnabled: true,
      tracingExportApiKey: "openai-tracing-key",
    });
  });
});

describe("applyOpenAIProvider", () => {
  it("creates the client and configures the Agents SDK defaults", () => {
    const client = { kind: "openai-client" };
    const createClient = vi.fn(() => client);
    const setDefaultOpenAIClient = vi.fn();
    const setOpenAIAPI = vi.fn();
    const setTracingDisabled = vi.fn();
    const setTracingExportApiKey = vi.fn();

    const configuredClient = applyOpenAIProvider(
      getOpenAIProviderSettings(createServerEnv()),
      {
        createClient,
        setDefaultOpenAIClient,
        setOpenAIAPI,
        setTracingDisabled,
        setTracingExportApiKey,
      },
    );

    expect(configuredClient).toBe(client);
    expect(createClient).toHaveBeenCalledWith({
      baseURL: "https://litellm.example.com/v1",
      apiKey: "litellm-key",
    });
    expect(setDefaultOpenAIClient).toHaveBeenCalledWith(client);
    expect(setOpenAIAPI).toHaveBeenCalledWith("chat_completions");
    expect(setTracingDisabled).toHaveBeenCalledWith(true);
    expect(setTracingExportApiKey).not.toHaveBeenCalled();
  });

  it("enables tracing export when the config requests it", () => {
    const setTracingExportApiKey = vi.fn();

    applyOpenAIProvider(
      getOpenAIProviderSettings(
        createServerEnv({
          OPENAI_AGENTS_ENABLE_TRACING: true,
          OPENAI_TRACING_API_KEY: "openai-tracing-key",
        }),
      ),
      {
        createClient: vi.fn(() => ({ kind: "openai-client" })),
        setDefaultOpenAIClient: vi.fn(),
        setOpenAIAPI: vi.fn(),
        setTracingDisabled: vi.fn(),
        setTracingExportApiKey,
      },
    );

    expect(setTracingExportApiKey).toHaveBeenCalledWith("openai-tracing-key");
  });
});
