// lib/telemetry/langfuse.ts
// Stub — real implementation added in Task 7.
// This file exists so that the module graph resolves during testing;
// all callers in tests mock this module via vi.mock().

import type { ServerEnv } from "@/lib/config/env";

export type LangfuseTrace = {
  traceId: string;
  traceUrl: string | null;
  flush: () => Promise<void>;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const createLangfuseTrace = async (_env: ServerEnv, _input: string): Promise<LangfuseTrace> => {
  return { traceId: "", traceUrl: null, flush: async () => {} };
};
