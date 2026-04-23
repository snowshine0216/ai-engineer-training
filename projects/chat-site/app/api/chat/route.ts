// app/api/chat/route.ts
import { z } from "zod";

import { getServerEnv } from "@/lib/config/env";
import { initializeOpenAIProvider } from "@/lib/ai/openai-provider";
import { runDemo } from "@/lib/chat/run-demo";
import { createLangfuseTrace } from "@/lib/telemetry/langfuse";
import type { StreamEvent } from "@/lib/chat/stream-event";

// Required for @openai/agents streaming (uses Node.js Readable)
export const runtime = "nodejs";
// Allow up to 60 seconds for streaming responses on Vercel
export const maxDuration = 60;

const requestSchema = z.object({
  prompt: z.string().trim().min(1, "prompt must not be empty"),
});

// Best-effort per-process request budget.
// Vercel serverless resets this per cold start — sufficient for a demo.
let requestCount = 0;
let windowStart = Date.now();
const WINDOW_MS = 60_000;

const checkBudget = (budget: number): boolean => {
  const now = Date.now();
  if (now - windowStart > WINDOW_MS) {
    requestCount = 0;
    windowStart = now;
  }
  if (requestCount >= budget) return false;
  requestCount++;
  return true;
};

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
      { status: 429 },
    );
  }

  // Configure @openai/agents SDK with the custom endpoint for this request
  initializeOpenAIProvider(env);

  // Start Langfuse trace (noop if keys are absent)
  const trace = await createLangfuseTrace(env, prompt);

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      const emit = (event: StreamEvent): void => {
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      };

      try {
        await runDemo({
          prompt,
          model: env.DEFAULT_MODEL,
          demoMode: env.DEMO_MODE,
          emit,
        });
      } catch {
        // runDemo already emits failed/interrupted — this is a last-resort safety net
      }

      // Emit trace URL as the final frame (Langfuse may still be resolving)
      emit({
        eventId: crypto.randomUUID(),
        kind: "trace",
        ts: Date.now(),
        traceUrl: trace.traceUrl,
      });

      controller.close();

      // Flush telemetry after stream is closed — never blocks the answer
      Promise.resolve(trace.flush()).catch(() => {});
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Transfer-Encoding": "chunked",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
