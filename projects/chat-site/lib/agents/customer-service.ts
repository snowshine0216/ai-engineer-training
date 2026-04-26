// lib/agents/customer-service.ts
import type { AgentSpec } from "./types";

export const customerService: AgentSpec = {
  id: "customer-service",
  name: "Customer Service",
  description: "Multi-agent order shipping support with SQLite order and logistics lookup.",
  promptId: "customer-service-manager",
  toolIds: [],
};
