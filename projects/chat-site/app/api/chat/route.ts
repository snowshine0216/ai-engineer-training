// app/api/chat/route.ts
import { z } from "zod";
import { randomUUID } from "crypto";

import { getServerEnv } from "@/lib/config/env";
import { initializeOpenAIProvider, validateProviderAuth } from "@/lib/ai/openai-provider";
import { getAgent } from "@/lib/agents";
import { runAgent } from "@/lib/chat/run-agent";
import { classifyError } from "@/lib/chat/errors";
import { createLangfuseTrace } from "@/lib/telemetry/langfuse";
import { checkBudget } from "@/lib/chat/budget";
import { getLogger } from "@/lib/logging";
import type { ConversationMessage } from "@/lib/chat/history";
import type { StreamEvent } from "@/lib/chat/stream-event";

export const runtime = "nodejs";
export const maxDuration = 60;

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().max(8000),
  thinking: z.string().optional(),
});

const requestSchema = z.object({
  agentId: z.string().min(1),
  messages: z.array(messageSchema).min(1, "messages must contain at least one entry").max(200, "messages too long"),
});

let providerInitialized = false;

const errorResponse = (message: string, status: number, code?: string): Response =>
  Response.json(code ? { error: message, code } : { error: message }, { status });

export async function POST(req: Request): Promise<Response> {
  const env = getServerEnv();
  const logger = getLogger();

  if (!providerInitialized) {
    initializeOpenAIProvider(env);
    providerInitialized = true;
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON body", 400);
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message))
      .join("; ");
    return errorResponse(detail, 400);
  }

  const { agentId, messages } = parsed.data;

  const spec = getAgent(agentId);
  if (!spec) return errorResponse(`Unknown agent: ${agentId}`, 404, "unknown_agent");

  // Last message must be from the user — server is stateless, the user always
  // initiates the next turn.
  if (messages[messages.length - 1].role !== "user") {
    return errorResponse("Last message must be from user", 400);
  }

  if (!checkBudget(env.DEMO_REQUEST_BUDGET)) {
    return Response.json(
      { error: "Server is busy right now. Try again in a minute." },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  try {
    await validateProviderAuth(env);
  } catch (err) {
    const { retryable, reason, code } = classifyError(err);
    if (!retryable) {
      const status = code === "auth_error" ? 401 : code === "not_found" ? 404 : 500;
      return errorResponse(reason, status, code);
    }
    // Fall through — runAgent's retry loop handles transient errors.
  }

  const trace = await createLangfuseTrace(env, messages[messages.length - 1].content);
  logger.info("chat request accepted", { agentId, messageCount: messages.length, traceId: trace.traceId });

  const abortController = new AbortController();
  req.signal.addEventListener("abort", () => abortController.abort());

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      const emit = (event: StreamEvent): void => {
        if (!abortController.signal.aborted) {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        }
      };

      try {
        await runAgent({
          spec,
          messages: messages as ConversationMessage[],
          emit,
          env,
          signal: abortController.signal,
        });
      } catch (err) {
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

      await Promise.resolve(trace.flush()).catch(() => {});

      if (!abortController.signal.aborted) controller.close();
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
