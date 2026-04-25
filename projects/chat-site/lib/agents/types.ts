// lib/agents/types.ts
import type { PromptId } from "../prompts/types";
import type { ToolId } from "../tools/types";

export type AgentId = string;

export type AgentSpec = {
  id: AgentId;
  name: string;
  description: string;
  promptId: PromptId;
  toolIds: ToolId[];
  model?: string;
};
