// lib/telemetry/langfuse.ts
import { randomUUID } from "crypto";

import type { ServerEnv } from "../config/env";

export type LangfuseTraceResult = {
  traceId: string;
  traceUrl: string | null;
  flush: () => Promise<void>;
};

const FLUSH_TIMEOUT_MS = 3_000;

export const createLangfuseTrace = async (
  env: ServerEnv,
  prompt: string,
): Promise<LangfuseTraceResult> => {
  if (!env.LANGFUSE_PUBLIC_KEY || !env.LANGFUSE_SECRET_KEY || !env.LANGFUSE_HOST) {
    return { traceId: randomUUID(), traceUrl: null, flush: async () => {} };
  }

  const { Langfuse } = await import("langfuse");

  const lf = new Langfuse({
    publicKey: env.LANGFUSE_PUBLIC_KEY,
    secretKey: env.LANGFUSE_SECRET_KEY,
    baseUrl: env.LANGFUSE_HOST,
  });

  const trace = lf.trace({ name: "resilient-chat-demo", input: prompt });
  const traceUrl = `${env.LANGFUSE_HOST}/trace/${trace.id}`;

  const flush = async (): Promise<void> => {
    await Promise.race([
      lf.flushAsync(),
      new Promise<void>((resolve) => setTimeout(resolve, FLUSH_TIMEOUT_MS)),
    ]).catch(() => {});
  };

  return { traceId: trace.id, traceUrl, flush };
};
