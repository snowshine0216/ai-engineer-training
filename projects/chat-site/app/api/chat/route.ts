// app/api/chat/route.ts
import { z } from "zod";

import { getServerEnv } from "@/lib/config/env";
import { initializeOpenAIProvider } from "@/lib/ai/openai-provider";
import { runDemo } from "@/lib/chat/run-demo";
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

// Config is constant per process — initialize the provider once at module load.
initializeOpenAIProvider(getServerEnv());

export async function POST(req: Request): Promise<Response> {
  const env = getServerEnv();

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
      } catch {
        // runDemo already emits a failed event — this is a last-resort safety net
      }

      if (!abortController.signal.aborted) {
        // Emit trace URL as the final frame (Langfuse may still be resolving)
        emit({
          eventId: crypto.randomUUID(),
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
