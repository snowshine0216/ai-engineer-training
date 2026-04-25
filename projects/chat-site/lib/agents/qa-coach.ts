// lib/agents/qa-coach.ts
import type { AgentSpec } from "./types";

export const qaCoach: AgentSpec = {
  id: "qa-coach",
  name: "QA Coach",
  description: "Generates tight test plans for features you describe.",
  promptId: "qa-coach",
  toolIds: [],
};
