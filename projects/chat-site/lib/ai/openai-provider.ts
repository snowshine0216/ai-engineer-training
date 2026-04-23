import {
  setDefaultOpenAIClient,
  setOpenAIAPI,
  setTracingDisabled,
  setTracingExportApiKey,
} from "@openai/agents";
import { OpenAI } from "openai";

import type { ServerEnv } from "../config/env";

export type OpenAIClientOptions = Readonly<{
  baseURL: string;
  apiKey: string;
}>;

export type OpenAIProviderSettings = Readonly<{
  clientOptions: OpenAIClientOptions;
  apiMode: ServerEnv["OPENAI_API_MODE"];
  tracingEnabled: boolean;
  tracingExportApiKey?: string;
}>;

export type OpenAIProviderDependencies<Client> = Readonly<{
  createClient: (options: OpenAIClientOptions) => Client;
  setDefaultOpenAIClient: (client: Client) => void;
  setOpenAIAPI: (apiMode: OpenAIProviderSettings["apiMode"]) => void;
  setTracingDisabled: (disabled: boolean) => void;
  setTracingExportApiKey: (apiKey: string) => void;
}>;

const defaultOpenAIProviderDependencies: OpenAIProviderDependencies<OpenAI> = {
  createClient: (options) => new OpenAI(options),
  setDefaultOpenAIClient,
  setOpenAIAPI,
  setTracingDisabled,
  setTracingExportApiKey,
};

export const getOpenAIProviderSettings = (
  env: ServerEnv,
): OpenAIProviderSettings => ({
  clientOptions: {
    baseURL: env.OPENAI_BASE_URL,
    apiKey: env.OPENAI_API_KEY,
  },
  apiMode: env.OPENAI_API_MODE,
  tracingEnabled: env.OPENAI_AGENTS_ENABLE_TRACING,
  tracingExportApiKey: env.OPENAI_TRACING_API_KEY,
});

export const applyOpenAIProvider = <Client>(
  settings: OpenAIProviderSettings,
  dependencies: OpenAIProviderDependencies<Client>,
): Client => {
  const client = dependencies.createClient(settings.clientOptions);

  dependencies.setDefaultOpenAIClient(client);
  dependencies.setOpenAIAPI(settings.apiMode);
  dependencies.setTracingDisabled(!settings.tracingEnabled);

  if (settings.tracingEnabled && settings.tracingExportApiKey) {
    dependencies.setTracingExportApiKey(settings.tracingExportApiKey);
  }

  return client;
};

export const initializeOpenAIProvider = (env: ServerEnv): OpenAI =>
  applyOpenAIProvider(
    getOpenAIProviderSettings(env),
    defaultOpenAIProviderDependencies,
  );
