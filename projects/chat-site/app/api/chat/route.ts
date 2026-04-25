// app/api/chat/route.ts
import { z } from "zod";
import { randomUUID } from "crypto";

import { getServerEnv } from "@/lib/config/env";
import { initializeOpenAIProvider, validateProviderAuth } from "@/lib/ai/openai-provider";
import { runDemo, classifyError } from "@/lib/chat/run-demo";
import { createLangfuseTrace } from "@/lib/telemetry/langfuse";
import { checkBudget } from "@/lib/chat/budget";
import type { StreamEvent } from "@/lib/chat/stream-event";

// Required for @openai/agents streaming (uses Node.js Readable)
export const runtime = "nodejs";
// Allow up to 60 seconds for streaming responses on Vercel
export const maxDuration = 60;

const requestSchema = z.object({
  prompt: z.string().trim().min(1, "prompt must not be empty").max(4000, "prompt must not exceed 4000 characters"),
});

// Lazy init: provider is initialized on first request so env is validated at
// call time rather than module evaluation time (keeping test mocks safe).
// initializeOpenAIProvider is synchronous, so no mutex is needed — the flag
// is set before the event loop can re-enter this path.
let providerInitialized = false;

export async function POST(req: Request): Promise<Response> {
  const env = getServerEnv();
  if (!providerInitialized) {
    initializeOpenAIProvider(env);
    providerInitialized = true;
  }

  // Validate body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.issues
      .map((i) => (i.path.length > 0 ? `${i.path.join(".")}: ${i.message}` : i.message))
      .join("; ");
    return Response.json({ error: message }, { status: 400 });
  }

  const { prompt } = parsed.data;

  // Request budget guard
  if (!checkBudget(env.DEMO_REQUEST_BUDGET)) {
    return Response.json(
      { error: "Demo is busy right now. Try again in a minute." },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  // Pre-flight auth check: make a real HTTP call (max_tokens:1) BEFORE committing
  // to HTTP 200. This surfaces 401/403/404 as proper HTTP errors instead of burying
  // them in the NDJSON stream body.
  //
  // Skipped in demo mode — the first attempt is a deliberately injected failure,
  // the retry logic in the stream handles it.
  if (!env.DEMO_MODE) {
    try {
      await validateProviderAuth(env);
    } catch (err) {
      const { retryable, reason, code } = classifyError(err);
      if (!retryable) {
        const status = code === "auth_error" ? 401 : code === "not_found" ? 404 : 500;
        return Response.json({ error: reason, code }, { status });
      }
      // Retryable pre-flight error (rate limit, server error): fall through to the
      // stream — runDemo's retry logic will handle it.
    }
  }

  // Start Langfuse trace (noop if keys are absent)
  const trace = await createLangfuseTrace(env, prompt);

  const abortController = new AbortController();

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      const emit = (event: StreamEvent): void => {
        if (!abortController.signal.aborted) {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        }
      };

      try {
        await runDemo({
          prompt,
          model: env.DEFAULT_MODEL,
          demoMode: env.DEMO_MODE,
          emit,
          signal: abortController.signal,
        });
      } catch (err) {
        // Unexpected throw from runDemo — emit a failed event rather than silently closing.
        const { reason } = classifyError(err);
        emit({
          eventId: randomUUID(),
          kind: "failed",
          attemptId: 1,
          ts: Date.now(),
          message: reason || "An unexpected error occurred.",
          retryable: false,
        });
      }

      if (!abortController.signal.aborted) {
        // Emit trace URL as the final frame (Langfuse may still be resolving)
        emit({
          eventId: randomUUID(),
          kind: "trace",
          ts: Date.now(),
          traceUrl: trace.traceUrl,
        });

        // Flush before closing so Vercel doesn't terminate before telemetry lands
        await Promise.resolve(trace.flush()).catch(() => {});

        controller.close();
      }
    },
    cancel() {
      abortController.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
