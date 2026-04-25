// lib/agents/index.ts
import { Agent } from "@openai/agents";

import type { AgentId, AgentSpec } from "./types";
import type { PromptId } from "../prompts/types";
import type { ToolId } from "../tools/types";
import { getPrompt } from "../prompts";
import { toSDKTool } from "../tools";
import { general } from "./general";
import { qaCoach } from "./qa-coach";

export type { AgentId, AgentSpec } from "./types";

export const AGENT_REGISTRY: Record<AgentId, AgentSpec> = {
  [general.id]: general,
  [qaCoach.id]: qaCoach,
};

export const getAgent = (id: AgentId): AgentSpec | undefined => AGENT_REGISTRY[id];

export const listAgents = (): AgentSpec[] => Object.values(AGENT_REGISTRY);

type BuildEnv = { DEFAULT_MODEL: string };

const resolveTools = (toolIds: ToolId[]) =>
  toolIds.map(toSDKTool).filter((t): t is NonNullable<typeof t> => t !== null);

const resolvePrompt = (promptId: PromptId): string => {
  const p = getPrompt(promptId);
  if (!p) throw new Error(`agent spec references unknown promptId: ${promptId}`);
  return p.text;
};

export const buildAgent = (spec: AgentSpec, env: BuildEnv): Agent =>
  new Agent({
    name: spec.name,
    instructions: resolvePrompt(spec.promptId),
    model: spec.model ?? env.DEFAULT_MODEL,
    tools: resolveTools(spec.toolIds),
  });
