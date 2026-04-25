// lib/ai/openai-provider.ts
import {
  OpenAIProvider,
  setDefaultModelProvider,
  setOpenAIAPI,
  setTracingDisabled,
} from "@openai/agents";

import type { ServerEnv } from "../config/env";

export const initializeOpenAIProvider = (env: ServerEnv): void => {
  const provider = new OpenAIProvider({
    apiKey: env.OPENAI_API_KEY,
    baseURL: env.OPENAI_BASE_URL,
    useResponses: false,
  });
  setDefaultModelProvider(provider);
  setOpenAIAPI("chat_completions");
  setTracingDisabled(true);
};
