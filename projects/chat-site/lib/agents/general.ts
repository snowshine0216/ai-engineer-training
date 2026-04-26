// lib/agents/general.ts
import type { AgentSpec } from "./types";

export const general: AgentSpec = {
  id: "general",
  name: "General",
  description: "Helpful assistant with weather (AMap) and web search (Tavily) tools.",
  promptId: "general",
  toolIds: ["amap-weather", "tavily-search"],
};
