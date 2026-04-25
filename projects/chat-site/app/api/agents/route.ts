// app/api/agents/route.ts
import { listAgents } from "@/lib/agents";
import { toPublic } from "@/lib/agents/public";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  const agents = listAgents().map(toPublic);
  return Response.json({ agents });
}
