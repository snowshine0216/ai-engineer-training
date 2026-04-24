// tests/lib/ai/openai-provider.test.ts
import { describe, expect, it, vi } from "vitest";

import {
  applyOpenAIProvider,
  getOpenAIClientOptions,
} from "../../../lib/ai/openai-provider";
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

describe("getOpenAIClientOptions", () => {
  it("maps env to baseURL and apiKey", () => {
    const opts = getOpenAIClientOptions(makeEnv());

    expect(opts).toEqual({
      baseURL: "https://api.example.com/v1",
      apiKey: "sk-test",
    });
  });
});

describe("applyOpenAIProvider", () => {
  it("creates the client, sets it as default, locks chat_completions, disables tracing", () => {
    const client = { kind: "openai-client" };
    const createClient = vi.fn(() => client);
    const setDefaultOpenAIClient = vi.fn();
    const setOpenAIAPI = vi.fn();
    const setTracingDisabled = vi.fn();

    const returned = applyOpenAIProvider(
      { baseURL: "https://api.example.com/v1", apiKey: "sk-test" },
      { createClient, setDefaultOpenAIClient, setOpenAIAPI, setTracingDisabled },
    );

    expect(returned).toBe(client);
    expect(createClient).toHaveBeenCalledWith({
      baseURL: "https://api.example.com/v1",
      apiKey: "sk-test",
    });
    expect(setDefaultOpenAIClient).toHaveBeenCalledWith(client);
    expect(setOpenAIAPI).toHaveBeenCalledWith("chat_completions");
    expect(setTracingDisabled).toHaveBeenCalledWith(true);
  });
});
