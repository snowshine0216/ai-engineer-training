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

const maskKey = (key: string) => key.slice(0, 8) + "…" + key.slice(-4);

// Explicit runner that bypasses global SDK state (avoids Next.js module isolation issues).
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

export const initializeOpenAIProvider = (env: ServerEnv): void => {
  console.log("[openai-provider] ── config ──");
  console.log("[openai-provider]   baseURL:", env.OPENAI_BASE_URL);
  console.log("[openai-provider]   apiKey:", maskKey(env.OPENAI_API_KEY));
  console.log("[openai-provider]   apiKey length:", env.OPENAI_API_KEY.length);
  console.log("[openai-provider]   useResponses: false");
  console.log("[openai-provider]   api: chat_completions");
  console.log("[openai-provider] ────────────");

  // Create the OpenAI client explicitly so we can attach a debug fetch wrapper.
  const client = new OpenAI({
    apiKey: env.OPENAI_API_KEY,
    baseURL: env.OPENAI_BASE_URL,
    fetch: async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = typeof url === "string" ? url : url instanceof URL ? url.href : (url as Request).url;
      console.log("[openai-provider] ── fetch ──");
      console.log("[openai-provider]   url:", u);
      console.log("[openai-provider]   method:", init?.method ?? "GET");
      const headers = init?.headers;
      if (headers instanceof Headers) {
        for (const [k, v] of headers.entries()) {
          const display = k.toLowerCase() === "authorization"
            ? v.slice(0, 15) + "…" + v.slice(-4) + " (len=" + v.length + ")"
            : v;
          console.log("[openai-provider]   header", k + ":", display);
        }
      } else if (headers && typeof headers === "object") {
        for (const [k, v] of Object.entries(headers)) {
          const display = k.toLowerCase() === "authorization"
            ? String(v).slice(0, 15) + "…" + String(v).slice(-4) + " (len=" + String(v).length + ")"
            : v;
          console.log("[openai-provider]   header", k + ":", display);
        }
      } else {
        console.log("[openai-provider]   headers: NONE / unknown type:", typeof headers);
      }
      console.log("[openai-provider] ────────────");
      return globalThis.fetch(url, init);
    },
  });

  // Pass the pre-built client directly so the provider cannot ignore our config.
  const provider = new OpenAIProvider({
    openAIClient: client,
    useResponses: false,
  });

  // Create an explicit Runner bound to our provider — this bypasses global SDK
  // state which Next.js module isolation can silently break.
  _runner = new Runner({
    modelProvider: provider,
    tracingDisabled: true,
  });
  console.log("[openai-provider] ✓ explicit Runner created with our provider");

  // Still set globals as a fallback, but the explicit runner is what we actually use.
  setDefaultModelProvider(provider);
  setDefaultOpenAIClient(client);
  setOpenAIAPI("chat_completions");
  setTracingDisabled(true);
};
