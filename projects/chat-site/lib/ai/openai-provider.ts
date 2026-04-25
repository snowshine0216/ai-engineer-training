// lib/ai/openai-provider.ts
import OpenAI from "openai";
import {
  OpenAIProvider,
  Runner,
  setDefaultModelProvider,
  setDefaultOpenAIClient,
  setOpenAIAPI,
  setTracingDisabled,
} from "@openai/agents";

import type { ServerEnv } from "../config/env";
import { getLogger } from "../logging";

const maskKey = (key: string) => key.slice(0, 8) + "…" + key.slice(-4);

let _runner: Runner | undefined;

export const getRunner = (): Runner => {
  if (!_runner) throw new Error("OpenAI provider not initialized — call initializeOpenAIProvider first");
  return _runner;
};

/** Makes a minimal real HTTP call to the provider to validate auth BEFORE the stream starts.
 *  max_tokens:1 means it returns almost immediately on success. Throws on 401/403/404. */
export const validateProviderAuth = async (env: ServerEnv): Promise<void> => {
  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY, baseURL: env.OPENAI_BASE_URL });
  await client.chat.completions.create({
    model: env.DEFAULT_MODEL,
    messages: [{ role: "user", content: "hi" }],
    max_tokens: 1,
    stream: false,
  });
};

const headerEntries = (headers: HeadersInit | undefined): Array<[string, string]> => {
  if (!headers) return [];
  if (headers instanceof Headers) return [...headers.entries()];
  if (Array.isArray(headers)) return headers as Array<[string, string]>;
  return Object.entries(headers as Record<string, string>);
};

const maskAuth = (k: string, v: string): string =>
  k.toLowerCase() === "authorization" ? `${v.slice(0, 15)}…${v.slice(-4)} (len=${v.length})` : v;

export const initializeOpenAIProvider = (env: ServerEnv): void => {
  const logger = getLogger();
  logger.info("openai-provider configured", {
    baseURL: env.OPENAI_BASE_URL,
    apiKey: maskKey(env.OPENAI_API_KEY),
    apiKeyLen: env.OPENAI_API_KEY.length,
    api: "chat_completions",
  });

  const client = new OpenAI({
    apiKey: env.OPENAI_API_KEY,
    baseURL: env.OPENAI_BASE_URL,
    fetch: async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = typeof url === "string" ? url : url instanceof URL ? url.href : (url as Request).url;
      const headers = Object.fromEntries(headerEntries(init?.headers).map(([k, v]) => [k, maskAuth(k, v)]));
      logger.debug("openai-provider fetch", { url: u, method: init?.method ?? "GET", headers });
      return globalThis.fetch(url, init);
    },
  });

  const provider = new OpenAIProvider({ openAIClient: client, useResponses: false });

  _runner = new Runner({ modelProvider: provider, tracingDisabled: true });

  setDefaultModelProvider(provider);
  setDefaultOpenAIClient(client);
  setOpenAIAPI("chat_completions");
  setTracingDisabled(true);
};
