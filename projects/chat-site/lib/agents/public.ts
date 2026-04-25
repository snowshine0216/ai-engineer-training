// lib/agents/public.ts
import type { AgentSpec } from "./types";

export type PublicAgent = {
  id: string;
  name: string;
  description: string;
};

export const toPublic = (spec: AgentSpec): PublicAgent => ({
  id: spec.id,
  name: spec.name,
  description: spec.description,
});
