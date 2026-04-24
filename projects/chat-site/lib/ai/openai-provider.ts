// lib/ai/openai-provider.ts
import {
  setDefaultOpenAIClient,
  setOpenAIAPI,
  setTracingDisabled,
} from "@openai/agents";
import { OpenAI } from "openai";

import type { ServerEnv } from "../config/env";

export type OpenAIClientOptions = Readonly<{
  baseURL: string;
  apiKey: string;
}>;

export type OpenAIProviderDependencies<Client> = Readonly<{
  createClient: (options: OpenAIClientOptions) => Client;
  setDefaultOpenAIClient: (client: Client) => void;
  setOpenAIAPI: (apiMode: "chat_completions") => void;
  setTracingDisabled: (disabled: boolean) => void;
}>;

const defaultDependencies: OpenAIProviderDependencies<OpenAI> = {
  createClient: (options) => new OpenAI(options),
  setDefaultOpenAIClient,
  setOpenAIAPI,
  setTracingDisabled,
};

export const getOpenAIClientOptions = (env: ServerEnv): OpenAIClientOptions => ({
  baseURL: env.OPENAI_BASE_URL,
  apiKey: env.OPENAI_API_KEY,
});

export const applyOpenAIProvider = <Client>(
  clientOptions: OpenAIClientOptions,
  dependencies: OpenAIProviderDependencies<Client>,
): Client => {
  const client = dependencies.createClient(clientOptions);
  dependencies.setDefaultOpenAIClient(client);
  dependencies.setOpenAIAPI("chat_completions");
  dependencies.setTracingDisabled(true);
  return client;
};

export const initializeOpenAIProvider = (env: ServerEnv): OpenAI =>
  applyOpenAIProvider(getOpenAIClientOptions(env), defaultDependencies);
